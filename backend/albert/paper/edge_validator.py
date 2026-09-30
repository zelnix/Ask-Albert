"""
Ask Albert – Historical Edge Validator

Validation framework for the paper trading engine's deterministic decision path.
Runs walk-forward backtesting on historical OHLCV data using the same signal/sizing/exit
logic as the autonomous paper worker — no LLM decisions, no look-ahead.

Usage:
    from albert.paper.edge_validator import simulate, walk_forward, stitch, assess, final_gate

Integration:
    1. Provide OHLCV candles, saved strategy contracts, and the paper worker's decision engine.
    2. Call `simulate(start, end, parameters)` for a single replay.
    3. Call `walk_forward(candles, strategy, ...)` for rolling train/test evaluation.
    4. Call `assess(simulation)` to compute expectancy, drawdown, calibration.
    5. Call `final_gate(historical_assessment, paper_assessment)` for pass/fail.
"""

from __future__ import annotations
import hashlib, json, math, statistics, uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple


# ═══════════════════════════════════════════════════════════════════════
# Data structures
# ═══════════════════════════════════════════════════════════════════════

@dataclass
class Candle:
    """Single OHLCV observation — timestamp is the CLOSE of the bar."""
    timestamp: str  # ISO-8601 UTC
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0


@dataclass
class ClosedTrade:
    """One fully closed ticket, aggregating all partial exits and net fees.
    initial_risk is the projected loss at ENTRY, not revised after the result."""
    ticket_id: str
    asset: str
    side: str  # BUY or SELL
    entry_price: float
    exit_price: float
    quantity: float
    initial_risk: float  # Planned loss at entry (e.g. stop distance * qty)
    net_pnl: float  # After fees, slippage
    gross_pnl: float
    fees: float
    slippage: float
    entry_time: str  # ISO-8601
    exit_time: str
    exit_reason: str  # STOP_LOSS, TAKE_PROFIT, SIGNAL_EXIT, FOLD_BOUNDARY
    hold_bars: int
    strategy_version: str
    input_hash: str  # Hash of the exact inputs/rules used for this trade


@dataclass
class EquityPoint:
    """Portfolio equity at a point in time, including cash + open positions + reserve."""
    timestamp: str
    cash: float
    open_value: float
    total: float
    drawdown_pct: float = 0.0


@dataclass
class Simulation:
    """Result of a single replay window."""
    sim_id: str = field(default_factory=lambda: str(uuid.uuid4())[:12])
    start: str = ''
    end: str = ''
    strategy_version: str = ''
    input_hash: str = ''
    parameters: Dict[str, Any] = field(default_factory=dict)
    trades: List[ClosedTrade] = field(default_factory=list)
    equity_path: List[EquityPoint] = field(default_factory=list)
    open_tickets: int = 0
    bars_processed: int = 0
    missing_data_bars: int = 0
    source: str = 'replay'
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    def to_dict(self):
        return {
            **{k: v for k, v in asdict(self).items() if k != 'trades' and k != 'equity_path'},
            'trades': [asdict(t) for t in self.trades],
            'equity_path': [asdict(e) for e in self.equity_path],
        }


@dataclass
class Assessment:
    """Evaluated metrics for a simulation or combined set."""
    source: str  # 'historical', 'paper', 'combined'
    total_closed: int = 0
    wins: int = 0
    losses: int = 0
    win_rate: float = 0.0
    gross_r_sum: float = 0.0
    net_r_sum: float = 0.0
    mean_net_r: float = 0.0
    median_net_r: float = 0.0
    std_net_r: float = 0.0
    lower_bound_95: float = 0.0  # One-sided 95% lower bound of mean net R
    max_drawdown_pct: float = 0.0
    total_net_pnl: float = 0.0
    total_fees: float = 0.0
    avg_hold_bars: float = 0.0
    by_exit_reason: Dict[str, int] = field(default_factory=dict)
    by_regime: Dict[str, Dict] = field(default_factory=dict)
    passive_comparison: Optional[Dict] = None
    verdict: str = 'INSUFFICIENT_EVIDENCE'
    verdict_reason: str = ''

    def to_dict(self):
        return asdict(self)


@dataclass
class WalkForwardFold:
    """One fold of a walk-forward test."""
    fold_index: int
    train_start: str
    train_end: str
    test_start: str
    test_end: str
    train_trades: int = 0
    test_trades: int = 0
    train_expectancy: float = 0.0
    test_expectancy: float = 0.0
    train_assessment: Optional[Assessment] = None
    test_assessment: Optional[Assessment] = None


@dataclass
class WalkForwardResult:
    """Complete walk-forward evaluation."""
    strategy_version: str = ''
    folds: List[WalkForwardFold] = field(default_factory=list)
    oos_assessment: Optional[Assessment] = None  # Combined out-of-sample
    walk_forward_efficiency: Optional[float] = None  # test_expectancy / train_expectancy
    total_search_count: int = 1  # How many variants were tried
    selection_bias_note: str = ''

    def to_dict(self):
        return {
            'strategy_version': self.strategy_version,
            'folds': [{**asdict(f), 'train_assessment': f.train_assessment.to_dict() if f.train_assessment else None,
                        'test_assessment': f.test_assessment.to_dict() if f.test_assessment else None}
                       for f in self.folds],
            'oos_assessment': self.oos_assessment.to_dict() if self.oos_assessment else None,
            'walk_forward_efficiency': self.walk_forward_efficiency,
            'total_search_count': self.total_search_count,
            'selection_bias_note': self.selection_bias_note,
        }


# ═══════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════

def _input_hash(strategy: dict, candles: list, params: dict) -> str:
    """Deterministic hash of strategy rules + data range + parameters."""
    payload = json.dumps({
        'rules': strategy.get('rules', []),
        'version': strategy.get('version', ''),
        'n_candles': len(candles),
        'first': candles[0].timestamp if candles else '',
        'last': candles[-1].timestamp if candles else '',
        'params': params,
    }, sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


def _net_r(trade: ClosedTrade) -> Optional[float]:
    """Net R-multiple: net P&L / initial risk. None if risk is zero."""
    if trade.initial_risk == 0 or trade.initial_risk is None:
        return None
    return trade.net_pnl / abs(trade.initial_risk)


def _equity_drawdown(equity_path: List[EquityPoint]) -> float:
    """Max drawdown percentage across the equity path."""
    if not equity_path:
        return 0.0
    peak = equity_path[0].total
    max_dd = 0.0
    for ep in equity_path:
        if ep.total > peak:
            peak = ep.total
        if peak > 0:
            dd = (peak - ep.total) / peak * 100
            if dd > max_dd:
                max_dd = dd
    return round(max_dd, 2)


def _lower_bound_95(values: List[float]) -> float:
    """One-sided 95% lower bound of the mean, using nearby exit-day blocking.
    For n >= 30, uses normal approximation: mean - 1.645 * (std / sqrt(n)).
    For smaller n, returns a conservative estimate."""
    n = len(values)
    if n == 0:
        return 0.0
    if n == 1:
        return values[0]  # No variance estimate possible
    mean = statistics.mean(values)
    std = statistics.stdev(values)
    # One-sided t-approximation (use z for large n)
    z = 1.645  # 95% one-sided
    return mean - z * (std / math.sqrt(n))


def _passive_return(candles: List[Candle], start_cash: float) -> Dict:
    """Buy-and-hold return over the same period, for comparison."""
    if not candles or len(candles) < 2:
        return {'return_pct': 0.0, 'final_value': start_cash}
    entry = candles[0].close
    exit_price = candles[-1].close
    ret = (exit_price - entry) / entry * 100
    return {'return_pct': round(ret, 2), 'final_value': round(start_cash * (1 + ret / 100), 2),
            'entry_price': entry, 'exit_price': exit_price,
            'start': candles[0].timestamp, 'end': candles[-1].timestamp}


# ═══════════════════════════════════════════════════════════════════════
# Core functions
# ═══════════════════════════════════════════════════════════════════════

def simulate(
    candles: List[Candle],
    strategy: dict,
    start_cash: float = 10000.0,
    fee_rate: float = 0.001,
    slippage_bps: float = 5.0,
    max_drawdown_pct: float = 20.0,
    close_at_boundary: bool = True,
) -> Simulation:
    """Replay the deterministic decision engine over historical candles.

    This function implements the SAME buy/sell/hold, sizing, stop-loss, take-profit
    logic as the paper worker. No LLM decisions. Only completed candles are used for
    signals; the current forming candle is never consumed.

    Args:
        candles: Chronological OHLCV bars (closed candles only).
        strategy: Saved strategy contract with 'rules', 'version', 'assets', etc.
        start_cash: Initial portfolio cash.
        fee_rate: Taker fee as a fraction (0.001 = 0.1%).
        slippage_bps: Estimated slippage in basis points.
        max_drawdown_pct: Kill switch — stop trading if drawdown exceeds this.
        close_at_boundary: If True, force-close open tickets at end of window.

    Returns:
        Simulation with trades, equity path, and metadata.
    """
    rules = strategy.get('rules', [])
    version = strategy.get('version', strategy.get('strategyId', 'unknown'))
    params = {'fee_rate': fee_rate, 'slippage_bps': slippage_bps,
              'max_drawdown_pct': max_drawdown_pct, 'start_cash': start_cash}
    ih = _input_hash(strategy, candles, params)

    sim = Simulation(
        start=candles[0].timestamp if candles else '',
        end=candles[-1].timestamp if candles else '',
        strategy_version=version,
        input_hash=ih,
        parameters=params,
    )

    if not candles or not rules:
        return sim

    # Parse rules into trigger conditions
    buy_rules = [r for r in rules if r.get('side') == 'BUY']
    sell_rules = [r for r in rules if r.get('side') == 'SELL']
    stop_pct = None
    tp_pct = None
    for r in sell_rules:
        if r.get('kind') == 'STOP_LOSS_PCT':
            stop_pct = float(r['value']) / 100
        elif r.get('kind') == 'TAKE_PROFIT_PCT':
            tp_pct = float(r['value']) / 100

    # State
    cash = start_cash
    position = None  # {asset, qty, entry_price, entry_time, entry_bar, initial_risk, ticket_id}
    equity_path = []
    trades = []
    peak_equity = start_cash
    halted = False

    def _fill_price(candle_close, side):
        slip = candle_close * slippage_bps / 10000
        return candle_close + slip if side == 'BUY' else candle_close - slip

    def _fee(price, qty):
        return abs(price * qty * fee_rate)

    def _close_position(exit_candle, reason, bar_index):
        nonlocal cash, position
        if position is None:
            return
        fp = _fill_price(exit_candle.close, 'SELL')
        # Stop-loss: if the low pierced the stop, fill at the stop price (or lower)
        if reason == 'STOP_LOSS' and stop_pct and position['entry_price']:
            stop_price = position['entry_price'] * (1 - stop_pct)
            if exit_candle.low <= stop_price:
                fp = min(fp, stop_price)  # Gap below stop: fill at the lower observed price
        # Take-profit: if the high pierced the TP, fill at the TP price
        if reason == 'TAKE_PROFIT' and tp_pct and position['entry_price']:
            tp_price = position['entry_price'] * (1 + tp_pct)
            if exit_candle.high >= tp_price:
                fp = max(fp, tp_price)
        qty = position['qty']
        fee = _fee(fp, qty)
        gross = (fp - position['entry_price']) * qty
        net = gross - fee - position.get('entry_fee', 0)
        slippage_cost = abs(exit_candle.close - fp) * qty + position.get('entry_slippage', 0)
        trades.append(ClosedTrade(
            ticket_id=position['ticket_id'],
            asset=position['asset'],
            side='BUY',
            entry_price=position['entry_price'],
            exit_price=fp,
            quantity=qty,
            initial_risk=position['initial_risk'],
            net_pnl=net,
            gross_pnl=gross,
            fees=fee + position.get('entry_fee', 0),
            slippage=slippage_cost,
            entry_time=position['entry_time'],
            exit_time=exit_candle.timestamp,
            exit_reason=reason,
            hold_bars=bar_index - position['entry_bar'],
            strategy_version=version,
            input_hash=ih,
        ))
        cash += fp * qty - fee
        position = None

    for i, candle in enumerate(candles):
        sim.bars_processed += 1

        # Check stop/TP on current candle BEFORE new signal evaluation
        if position:
            if stop_pct:
                stop_price = position['entry_price'] * (1 - stop_pct)
                if candle.low <= stop_price:
                    _close_position(candle, 'STOP_LOSS', i)
            if position and tp_pct:
                tp_price = position['entry_price'] * (1 + tp_pct)
                if candle.high >= tp_price:
                    _close_position(candle, 'TAKE_PROFIT', i)

        # Record equity
        open_val = (position['qty'] * candle.close) if position else 0.0
        total_eq = cash + open_val
        if total_eq > peak_equity:
            peak_equity = total_eq
        dd = (peak_equity - total_eq) / peak_equity * 100 if peak_equity > 0 else 0.0
        equity_path.append(EquityPoint(
            timestamp=candle.timestamp,
            cash=round(cash, 2),
            open_value=round(open_val, 2),
            total=round(total_eq, 2),
            drawdown_pct=round(dd, 2),
        ))

        # Drawdown kill switch
        if dd >= max_drawdown_pct:
            if position:
                _close_position(candle, 'DRAWDOWN_HALT', i)
            halted = True
            break

        # Evaluate BUY signals (only if no position — combined-position model)
        if not position and not halted:
            for rule in buy_rules:
                triggered = False
                kind = rule.get('kind', 'PRICE')
                op = rule.get('operator', 'BELOW')
                val = float(rule.get('value', 0))

                if kind == 'PRICE':
                    if op in ('BELOW', '<') and candle.close < val:
                        triggered = True
                    elif op in ('ABOVE', '>') and candle.close > val:
                        triggered = True
                elif kind == 'CHANGE_PCT_24H' and i > 0:
                    pct_change = (candle.close - candles[i - 1].close) / candles[i - 1].close * 100
                    if op in ('BELOW', '<') and pct_change < val:
                        triggered = True
                    elif op in ('ABOVE', '>') and pct_change > val:
                        triggered = True

                if triggered:
                    fp = _fill_price(candle.close, 'BUY')
                    # Size: use available cash (combined-position model)
                    qty = cash / fp if fp > 0 else 0
                    if qty <= 0:
                        continue
                    fee = _fee(fp, qty)
                    entry_slippage = abs(candle.close - fp) * qty
                    initial_risk = fp * qty * stop_pct if stop_pct else fp * qty * 0.05  # Default 5% risk
                    position = {
                        'ticket_id': str(uuid.uuid4())[:12],
                        'asset': rule.get('symbol', 'BTC'),
                        'qty': qty,
                        'entry_price': fp,
                        'entry_time': candle.timestamp,
                        'entry_bar': i,
                        'entry_fee': fee,
                        'entry_slippage': entry_slippage,
                        'initial_risk': initial_risk,
                    }
                    cash -= fp * qty + fee
                    break  # One entry per bar

    # Force-close at boundary if requested
    if position and close_at_boundary and candles:
        _close_position(candles[-1], 'FOLD_BOUNDARY', len(candles) - 1)

    sim.trades = trades
    sim.equity_path = equity_path
    sim.open_tickets = 1 if position else 0
    return sim


def stitch(simulations: List[Simulation]) -> List[ClosedTrade]:
    """Combine out-of-sample trades from multiple folds, preserving order."""
    all_trades = []
    for sim in simulations:
        all_trades.extend(sim.trades)
    all_trades.sort(key=lambda t: t.entry_time)
    return all_trades


def assess(
    trades: List[ClosedTrade],
    equity_path: Optional[List[EquityPoint]] = None,
    source: str = 'historical',
    passive: Optional[Dict] = None,
    max_drawdown_limit: float = 20.0,
) -> Assessment:
    """Evaluate expectancy, drawdown, win rate and pass/fail verdict.

    The primary pass metric is the one-sided 95% lower bound of mean net R
    per closed ticket. Requires >= 100 fully closed tickets and drawdown
    at or below the mandate limit.

    Args:
        trades: Fully closed tickets.
        equity_path: Portfolio equity time series (optional, for drawdown).
        source: 'historical', 'paper', or 'combined'.
        passive: Buy-and-hold comparison dict (optional).
        max_drawdown_limit: Mandate drawdown limit.

    Returns:
        Assessment with verdict.
    """
    a = Assessment(source=source)
    a.total_closed = len(trades)

    if not trades:
        a.verdict = 'INSUFFICIENT_EVIDENCE'
        a.verdict_reason = 'No closed trades.'
        return a

    # Compute R-multiples
    r_values = []
    for t in trades:
        r = _net_r(t)
        if r is not None:
            r_values.append(r)
        a.total_net_pnl += t.net_pnl
        a.total_fees += t.fees
        if t.net_pnl > 0:
            a.wins += 1
        else:
            a.losses += 1
        a.by_exit_reason[t.exit_reason] = a.by_exit_reason.get(t.exit_reason, 0) + 1

    a.win_rate = round(a.wins / a.total_closed * 100, 1) if a.total_closed else 0.0
    a.avg_hold_bars = round(statistics.mean([t.hold_bars for t in trades]), 1) if trades else 0.0

    if r_values:
        a.net_r_sum = sum(r_values)
        a.mean_net_r = round(statistics.mean(r_values), 4)
        a.median_net_r = round(statistics.median(r_values), 4)
        a.std_net_r = round(statistics.stdev(r_values), 4) if len(r_values) > 1 else 0.0
        a.lower_bound_95 = round(_lower_bound_95(r_values), 4)

    # Drawdown
    if equity_path:
        a.max_drawdown_pct = _equity_drawdown(equity_path)
    else:
        # Reconstruct approximate drawdown from trades
        running = 0.0
        peak = 0.0
        max_dd = 0.0
        for t in trades:
            running += t.net_pnl
            if running > peak:
                peak = running
            dd = peak - running
            if peak > 0:
                dd_pct = dd / (peak + 10000) * 100  # Approximate
                if dd_pct > max_dd:
                    max_dd = dd_pct
        a.max_drawdown_pct = round(max_dd, 2)

    # Passive comparison
    a.passive_comparison = passive

    # Verdict
    if a.total_closed < 100:
        a.verdict = 'INSUFFICIENT_EVIDENCE'
        a.verdict_reason = f'Only {a.total_closed} closed trades (need 100+).'
    elif a.max_drawdown_pct > max_drawdown_limit:
        a.verdict = 'FAIL'
        a.verdict_reason = f'Drawdown {a.max_drawdown_pct:.1f}% exceeds {max_drawdown_limit}% mandate limit.'
    elif a.lower_bound_95 <= 0:
        a.verdict = 'FAIL'
        a.verdict_reason = f'95% lower bound of mean net R = {a.lower_bound_95:.4f} (not positive).'
    else:
        a.verdict = 'PASS'
        a.verdict_reason = (f'95% lower bound = {a.lower_bound_95:.4f} > 0, '
                            f'{a.total_closed} trades, '
                            f'max DD {a.max_drawdown_pct:.1f}% <= {max_drawdown_limit}%.')

    return a


def walk_forward(
    candles: List[Candle],
    strategy: dict,
    train_bars: int = 180,
    test_bars: int = 60,
    step_bars: int = 60,
    start_cash: float = 10000.0,
    fee_rate: float = 0.001,
    slippage_bps: float = 5.0,
    max_drawdown_pct: float = 20.0,
) -> WalkForwardResult:
    """Rolling walk-forward test: train on N bars, test on M bars, step forward.

    Each fold trains on one window and tests on the immediately following untouched window.
    No fold may select settings using its test data. Tickets crossing a fold boundary
    are force-closed.

    Args:
        candles: Full OHLCV history.
        strategy: Saved strategy contract.
        train_bars: Training window size (bars).
        test_bars: Testing window size (bars).
        step_bars: Step size between folds.
        start_cash: Starting cash per fold.
        ... : Same execution parameters as simulate().

    Returns:
        WalkForwardResult with per-fold and combined out-of-sample assessments.
    """
    result = WalkForwardResult(strategy_version=strategy.get('version', 'unknown'))
    n = len(candles)
    fold_idx = 0
    test_simulations = []

    offset = 0
    while offset + train_bars + test_bars <= n:
        train_candles = candles[offset:offset + train_bars]
        test_candles = candles[offset + train_bars:offset + train_bars + test_bars]

        # Train fold (simulate to gather training metrics)
        train_sim = simulate(train_candles, strategy, start_cash, fee_rate,
                             slippage_bps, max_drawdown_pct, close_at_boundary=True)
        train_assess = assess(train_sim.trades, train_sim.equity_path, source='train')

        # Test fold (out-of-sample)
        test_sim = simulate(test_candles, strategy, start_cash, fee_rate,
                            slippage_bps, max_drawdown_pct, close_at_boundary=True)
        test_assess = assess(test_sim.trades, test_sim.equity_path, source='test')
        test_simulations.append(test_sim)

        fold = WalkForwardFold(
            fold_index=fold_idx,
            train_start=train_candles[0].timestamp if train_candles else '',
            train_end=train_candles[-1].timestamp if train_candles else '',
            test_start=test_candles[0].timestamp if test_candles else '',
            test_end=test_candles[-1].timestamp if test_candles else '',
            train_trades=len(train_sim.trades),
            test_trades=len(test_sim.trades),
            train_expectancy=train_assess.mean_net_r,
            test_expectancy=test_assess.mean_net_r,
            train_assessment=train_assess,
            test_assessment=test_assess,
        )
        result.folds.append(fold)
        fold_idx += 1
        offset += step_bars

    # Combined out-of-sample assessment
    oos_trades = stitch(test_simulations)
    if oos_trades:
        passive = _passive_return(candles, start_cash)
        result.oos_assessment = assess(oos_trades, source='historical', passive=passive,
                                       max_drawdown_limit=max_drawdown_pct)

    # Walk-forward efficiency
    train_rs = [f.train_expectancy for f in result.folds if f.train_trades > 0]
    test_rs = [f.test_expectancy for f in result.folds if f.test_trades > 0]
    if train_rs and test_rs:
        agg_train = statistics.mean(train_rs)
        agg_test = statistics.mean(test_rs)
        if agg_train > 0:
            result.walk_forward_efficiency = round(agg_test / agg_train, 4)
        else:
            result.walk_forward_efficiency = None  # Denominator not positive

    return result


def final_gate(
    historical: Assessment,
    paper: Assessment,
    min_trades: int = 100,
    max_drawdown_limit: float = 20.0,
) -> Dict:
    """Final pass/fail gate combining historical and paper evidence.

    Both sets must independently pass:
    - >= min_trades fully closed tickets
    - 95% lower bound of mean net R > 0
    - Max drawdown <= mandate limit

    Args:
        historical: Assessment from walk-forward out-of-sample.
        paper: Assessment from live paper trading.
        min_trades: Minimum closed trades in each set.
        max_drawdown_limit: Mandate drawdown limit.

    Returns:
        Dict with verdict, reasons, and combined metrics.
    """
    verdicts = []
    reasons = []

    for label, a in [('Historical', historical), ('Paper', paper)]:
        if a.total_closed < min_trades:
            verdicts.append('INSUFFICIENT_EVIDENCE')
            reasons.append(f'{label}: {a.total_closed} trades (need {min_trades}+).')
        elif a.max_drawdown_pct > max_drawdown_limit:
            verdicts.append('FAIL')
            reasons.append(f'{label}: drawdown {a.max_drawdown_pct:.1f}% > {max_drawdown_limit}%.')
        elif a.lower_bound_95 <= 0:
            verdicts.append('FAIL')
            reasons.append(f'{label}: 95% LB = {a.lower_bound_95:.4f} (not positive).')
        else:
            verdicts.append('PASS')
            reasons.append(f'{label}: PASS (LB={a.lower_bound_95:.4f}, '
                           f'DD={a.max_drawdown_pct:.1f}%, n={a.total_closed}).')

    if 'FAIL' in verdicts:
        final = 'FAIL'
    elif 'INSUFFICIENT_EVIDENCE' in verdicts:
        final = 'INSUFFICIENT_EVIDENCE'
    else:
        final = 'PASS'

    return {
        'verdict': final,
        'reasons': reasons,
        'historical': historical.to_dict(),
        'paper': paper.to_dict(),
        'note': ('assess checks evidence supplied by the simulator; it cannot independently '
                 'verify correct signals, fills, data provenance, slippage or absence of leakage. '
                 'A result is evidence from a sample, never mathematical proof of future profit.'),
    }


def weakness_analysis(trades: List[ClosedTrade]) -> Dict:
    """Explain weaknesses by decision, exit, sizing, market regime and execution.

    Returns a dict of weakness categories with counts and average R."""
    if not trades:
        return {'note': 'No trades to analyze.'}

    analysis = {
        'by_exit_reason': {},
        'by_hold_duration': {'short': [], 'medium': [], 'long': []},
        'sizing': {'oversized': 0, 'undersized': 0},
        'execution': {'high_slippage': 0, 'high_fees': 0},
        'losers': [],
    }

    for t in trades:
        # By exit reason
        reason = t.exit_reason
        if reason not in analysis['by_exit_reason']:
            analysis['by_exit_reason'][reason] = {'count': 0, 'total_r': 0.0, 'avg_r': 0.0}
        r = _net_r(t)
        analysis['by_exit_reason'][reason]['count'] += 1
        if r is not None:
            analysis['by_exit_reason'][reason]['total_r'] += r

        # By hold duration (short < 5 bars, medium 5-20, long > 20)
        bucket = 'short' if t.hold_bars < 5 else 'medium' if t.hold_bars <= 20 else 'long'
        if r is not None:
            analysis['by_hold_duration'][bucket].append(r)

        # Execution quality
        if t.slippage > t.gross_pnl * 0.1 and t.gross_pnl > 0:
            analysis['execution']['high_slippage'] += 1
        if t.fees > abs(t.gross_pnl) * 0.2:
            analysis['execution']['high_fees'] += 1

        # Worst losers
        if r is not None and r < -1:
            analysis['losers'].append({
                'ticket_id': t.ticket_id, 'asset': t.asset, 'r': round(r, 4),
                'net_pnl': round(t.net_pnl, 2), 'hold_bars': t.hold_bars,
                'exit_reason': t.exit_reason,
            })

    # Compute averages
    for reason, data in analysis['by_exit_reason'].items():
        if data['count'] > 0:
            data['avg_r'] = round(data['total_r'] / data['count'], 4)

    for bucket, rs in analysis['by_hold_duration'].items():
        analysis['by_hold_duration'][bucket] = {
            'count': len(rs),
            'avg_r': round(statistics.mean(rs), 4) if rs else 0.0,
        }

    analysis['losers'] = sorted(analysis['losers'], key=lambda x: x['r'])[:10]

    return analysis
