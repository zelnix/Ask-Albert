"""Paper-trading core — exact accounting, combined positions, single-document
atomic execution, and honest equity/drawdown truth.

POSITION MODEL
--------------
* ONE COMBINED POSITION PER COIN. Multiple BUYs of SOL produce one SOL position
  with aggregated quantity, cost basis and recalculated average entry price.
* Each position carries ONE stop-loss and ONE take-profit.
* SELLs operate on the combined position by symbol — no ticket ID required.
* Partial sells reduce quantity and cost basis proportionally (average-cost).

ACCOUNTING
----------
* MONEY IS EXACT. Every value uses `decimal.Decimal` / `bson.Decimal128`.
* SINGLE-DOCUMENT ATOMICITY. All economic effects commit in ONE conditional
  `find_one_and_update` with CAS on `version` + idempotency on `idemKeys`.
* No fees, slippage, spread or trading costs are simulated.
* Execution price = latest observed market price (true-price execution).
"""
import datetime
import uuid
from decimal import Decimal, ROUND_HALF_UP, ROUND_DOWN, getcontext, InvalidOperation

from bson.decimal128 import Decimal128

getcontext().prec = 34

CASH_Q = Decimal('0.01')
PRICE_Q = Decimal('0.01')
QTY_Q = Decimal('0.000000000001')
PCT_Q = Decimal('0.01')
MIN_NOTIONAL = Decimal('10')

DECISION_TTL_MIN = 30


# ============================ Decimal helpers ================================ #
def D(x):
    if x is None:
        return None
    if isinstance(x, Decimal):
        return x
    if isinstance(x, Decimal128):
        return x.to_decimal()
    try:
        if isinstance(x, float):
            return Decimal(repr(x))
        return Decimal(str(x))
    except (InvalidOperation, ValueError):
        return None


def q_cash(x):
    d = D(x)
    return None if d is None else d.quantize(CASH_Q, rounding=ROUND_HALF_UP)


def q_qty(x):
    d = D(x)
    return None if d is None else d.quantize(QTY_Q, rounding=ROUND_DOWN)


def to128(x):
    d = D(x)
    return None if d is None else Decimal128(d)


def dstr(x, q=CASH_Q):
    d = D(x)
    if d is None:
        return None
    return str(d.quantize(q, rounding=ROUND_HALF_UP))


def qty_dstr(x):
    d = D(x)
    if d is None:
        return None
    return str(d.quantize(QTY_Q, rounding=ROUND_DOWN))


def round_tick(value, tick, mode=ROUND_DOWN):
    v, q = D(value), D(tick)
    if v is None or q is None or not v.is_finite() or not q.is_finite() or q <= 0:
        return None
    return (v / q).to_integral_value(rounding=mode) * q


def _infer_price_q(px):
    if px is None or px <= 0:
        return PRICE_Q
    s = str(px)
    if '.' in s:
        decimals = len(s.rstrip('0').split('.')[1]) if s.split('.')[1].rstrip('0') else 0
        decimals = max(decimals, 2)
        return Decimal('1e-%d' % decimals)
    return PRICE_Q


# ============================ sizing helpers ================================= #
def buy_sizing(asset, notional, mark_px, *, price_q=None):
    """Direct-price BUY sizing. No fees. Returns sizing dict or reject."""
    mark = D(mark_px)
    notional = q_cash(notional)
    if notional is None or not notional.is_finite() or notional <= 0:
        return {'reject': 'BELOW_MIN_NOTIONAL'}
    if mark is None or not mark.is_finite() or mark <= 0:
        return {'reject': 'NO_VALID_MARK'}
    pq = price_q or _infer_price_q(mark)
    fill_px = round_tick(mark, pq, ROUND_HALF_UP) if pq else mark
    if fill_px is None or fill_px <= 0:
        return {'reject': 'NO_VALID_MARK'}
    qty = round_tick(notional / fill_px, QTY_Q) if fill_px > 0 else None
    if qty is None or not qty.is_finite() or qty <= 0:
        return {'reject': 'BELOW_MIN_NOTIONAL'}
    exact_notional = q_cash(qty * fill_px)
    return {'reject': None, 'side': 'BUY', 'asset': (asset or '').upper(),
            'notional': exact_notional, 'fillPx': fill_px, 'qty': qty, 'priceQ': pq}




# ============================ account state ================================== #
def new_account_economics(starting_cash, reserve_pct):
    """Initial economic state — clean start with cash and no positions."""
    sc = q_cash(starting_cash) or Decimal('100000.00')
    return {
        'cash': to128(sc), 'startingCash': to128(sc),
        'realizedPnl': to128(Decimal('0')),
        'reservePct': to128(D(reserve_pct) or Decimal('0')),
        'highWaterEquity': to128(sc),
        'positions': [], 'closedPositions': [], 'ledger': [], 'idemKeys': [],
        'accountSequence': 0,
    }


def position_for(acct, symbol):
    """Get the one combined position for a coin, or None."""
    symbol = (symbol or '').upper()
    for pos in (acct.get('positions') or []):
        if (pos.get('symbol') or '').upper() == symbol:
            qty = D(pos.get('qty')) or Decimal('0')
            if qty > 0:
                return pos
    return None


def open_positions(acct):
    """All open combined positions with qty > 0."""
    return [p for p in (acct.get('positions') or [])
            if (D(p.get('qty')) or Decimal('0')) > 0]


def open_position_count(acct):
    """Count of combined coin positions (not tickets)."""
    return len(open_positions(acct))




# ============================ equity / drawdown ============================== #
def compute_equity_multi(acct, marks):
    """Multi-asset honest valuation using combined positions.
    marks: {SYMBOL: (price, fresh)}. Returns equity info dict."""
    cash = D(acct.get('cash')) or Decimal('0')
    stored_hwm = D(acct.get('highWaterEquity'))
    realized = D(acct.get('realizedPnl')) or Decimal('0')
    reserve_pct = D(acct.get('reservePct')) or Decimal('0')

    pos_details = []
    pos_val_total = Decimal('0')
    all_fresh = True

    for pos in open_positions(acct):
        sym = (pos.get('symbol') or '').upper()
        qty = D(pos.get('qty')) or Decimal('0')
        avg_entry = D(pos.get('avgEntry')) or Decimal('0')
        cost_basis = D(pos.get('costBasis')) or Decimal('0')
        px, fresh = marks.get(sym, (None, False))
        px = D(px)
        if px is None or not fresh:
            all_fresh = False
            pos_details.append({
                'symbol': sym, 'qty': qty, 'avgEntry': avg_entry,
                'costBasis': cost_basis, 'markPx': px, 'markFresh': False,
                'value': None, 'unrealizedPnl': None,
                'stopLoss': D(pos.get('stopLoss')),
                'takeProfit': D(pos.get('takeProfit')),
            })
            continue
        value = qty * px
        unrealized = value - cost_basis
        pos_val_total += value
        pos_details.append({
            'symbol': sym, 'qty': qty, 'avgEntry': avg_entry,
            'costBasis': cost_basis, 'markPx': px, 'markFresh': True,
            'value': value, 'unrealizedPnl': unrealized,
            'stopLoss': D(pos.get('stopLoss')),
            'takeProfit': D(pos.get('takeProfit')),
        })

    equity = cash + pos_val_total if all_fresh else None
    hwm = stored_hwm
    dd = None
    protected = None
    deployable = None
    if equity is not None:
        if hwm is None:
            hwm = equity
        if equity > hwm:
            hwm = equity
        dd = ((equity / hwm) - Decimal('1')) * Decimal('100') if hwm and hwm > 0 else Decimal('0')
        if dd > 0:
            dd = Decimal('0')
        dd = dd.quantize(PCT_Q, ROUND_HALF_UP)
        protected = equity * reserve_pct / Decimal('100')
        deployable = cash - protected
        if deployable < 0:
            deployable = Decimal('0')

    total_unrealized = sum((p['unrealizedPnl'] or Decimal('0')) for p in pos_details
                           if p['unrealizedPnl'] is not None)

    return {
        'available': all_fresh, 'cash': cash, 'equity': equity,
        'equityStr': dstr(equity) if equity is not None else None,
        'positions': pos_details, 'positionValueTotal': pos_val_total,
        'openPositionsCount': len(pos_details),
        'drawdownPct': dd, 'highWater': hwm,
        'protectedReserve': protected, 'deployableCash': deployable,
        'realizedPnl': realized, 'unrealizedPnl': total_unrealized,
        'totalPnl': q_cash(realized + total_unrealized) if all_fresh else None,
    }


# ============================ ledger ========================================= #
def _ledger_entry(seq, event_type, entity_id, amount, note, extra=None):
    now = datetime.datetime.utcnow().isoformat()
    ev = {'ledgerEventId': 'ple_' + uuid.uuid4().hex[:14], 'accountSequence': seq,
          'eventType': event_type, 'entityId': entity_id,
          'amount': to128(amount) if amount is not None else None,
          'note': note, 'effectiveAt': now, 'recordedAt': now}
    if extra:
        ev.update(extra)
    return ev


LEDGER_SIZE_WARN = 5000


def ledger_size_warning(acct):
    return len(acct.get('ledger') or []) >= LEDGER_SIZE_WARN


def materialize_from_ledger(acct):
    """Rebuild economic state from the append-only ledger for reconciliation."""
    cash = D(acct.get('startingCash')) or Decimal('0')
    realized = Decimal('0')
    seq = 0
    per_sym = {}  # symbol -> {qty, costBasis}
    econ = [e for e in (acct.get('ledger') or []) if e.get('side') in ('BUY', 'SELL')]
    for e in sorted(econ, key=lambda x: x.get('accountSequence') or 0):
        seq = max(seq, e.get('accountSequence') or 0)
        sym = (e.get('asset') or 'BTC').upper()
        st = per_sym.setdefault(sym, {'qty': Decimal('0'), 'costBasis': Decimal('0')})
        if e.get('side') == 'BUY':
            cash = q_cash(cash - D(e.get('notional')))
            st['qty'] = q_qty(st['qty'] + D(e.get('qty')))
            st['costBasis'] = q_cash(st['costBasis'] + D(e.get('notional')))
        else:
            cash = q_cash(cash + D(e.get('proceeds')))
            realized = q_cash(realized + D(e.get('realized')))
            st['costBasis'] = q_cash(st['costBasis'] - D(e.get('costPortion')))
            st['qty'] = q_qty(st['qty'] - D(e.get('qty')))
            if st['qty'] <= 0:
                st['qty'] = Decimal('0')
                st['costBasis'] = Decimal('0')
    return {'cash': cash, 'realizedPnl': realized, 'accountSequence': seq, 'perAsset': per_sym}


def reconcile(acct):
    """Compare stored projection against ledger replay. ANY mismatch => FAIL CLOSED."""
    rep = materialize_from_ledger(acct)
    checks = {
        'cash': (D(acct.get('cash')) or Decimal('0')) == rep['cash'],
        'realizedPnl': (D(acct.get('realizedPnl')) or Decimal('0')) == rep['realizedPnl'],
        'accountSequence': (acct.get('accountSequence') or 0) >= rep['accountSequence'],
    }
    # Aggregate positions by symbol for comparison.
    pos_agg = {}
    for p in open_positions(acct):
        sym = (p.get('symbol') or '').upper()
        pos_agg[sym] = {'qty': D(p.get('qty')) or Decimal('0'),
                        'costBasis': D(p.get('costBasis')) or Decimal('0')}
    all_syms = set(pos_agg) | {s for s, v in rep['perAsset'].items() if v['qty'] > 0}
    for sym in all_syms:
        pa = pos_agg.get(sym) or {'qty': Decimal('0'), 'costBasis': Decimal('0')}
        rs = rep['perAsset'].get(sym) or {'qty': Decimal('0'), 'costBasis': Decimal('0')}
        checks['qty:%s' % sym] = q_qty(pa['qty']) == q_qty(rs['qty'])
        checks['cb:%s' % sym] = q_cash(pa['costBasis']) == q_cash(rs['costBasis'])
    return {'ok': all(checks.values()), 'checks': checks, 'replay': rep}


# ==================== single-document atomic BUY ============================= #
def apply_buy_atomic(col, acct_id, pid, expected_version, idem_key,
                     sizing, canonical, base_currency='USDC', asset=None,
                     strategy_version=None, strategy_hash=None,
                     stop_loss=None, take_profit=None):
    """Atomic BUY: merge into existing combined position or create a new one.
    Two BUYs of SOL produce one combined SOL position with recalculated avg entry.
    Returns (result_dict, error_code, http_status)."""
    asset = (asset or sizing.get('asset') or canonical.get('asset') or 'BTC').upper()
    pq = sizing.get('priceQ') or PRICE_Q
    now_iso = datetime.datetime.utcnow().isoformat()

    for _ in range(5):
        acct = col.find_one({'paperAccountId': acct_id, 'ownerId': pid})
        if not acct:
            return None, 'NOT_FOUND', 404
        if strategy_version is not None and (acct.get('runtimeState') != 'RUNNING' or
                                              acct.get('strategyVersion') != strategy_version or
                                              acct.get('strategyContractHash') != strategy_hash):
            return None, 'STRATEGY_CHANGED_OR_STOPPED', 409
        if idem_key in (acct.get('idemKeys') or []):
            return None, 'ALREADY_APPLIED', 409
        if acct.get('version') != expected_version:
            expected_version = acct.get('version')

        cash = D(acct.get('cash')) or Decimal('0')
        notional = D(sizing['notional'])
        fill_px = D(sizing['fillPx'])
        qty = D(sizing['qty'])
        if notional > cash:
            return None, 'INSUFFICIENT_CASH', 409
        new_cash = q_cash(cash - notional)

        # Merge into existing position or create new one.
        positions = list(acct.get('positions') or [])
        existing = None
        for i, p in enumerate(positions):
            if (p.get('symbol') or '').upper() == asset and (D(p.get('qty')) or Decimal('0')) > 0:
                existing = (i, p)
                break

        if existing:
            idx, ep = existing
            old_qty = D(ep.get('qty')) or Decimal('0')
            old_cb = D(ep.get('costBasis')) or Decimal('0')
            new_qty = q_qty(old_qty + qty)
            new_cb = q_cash(old_cb + notional)
            new_avg = q_cash(new_cb / new_qty) if new_qty > 0 else Decimal('0')
            positions[idx] = {**ep,
                'qty': to128(new_qty), 'costBasis': to128(new_cb),
                'avgEntry': to128(new_avg), 'updatedAt': now_iso}
            # Update SL/TP only if explicitly provided (don't overwrite existing).
            if stop_loss is not None:
                positions[idx]['stopLoss'] = to128(D(stop_loss))
                positions[idx]['stopLossReason'] = 'Set on additional BUY'
            if take_profit is not None:
                positions[idx]['takeProfit'] = to128(D(take_profit))
                positions[idx]['takeProfitReason'] = 'Set on additional BUY'
        else:
            new_pos = {
                'symbol': asset, 'qty': to128(qty), 'costBasis': to128(notional),
                'avgEntry': to128(fill_px), 'openedAt': now_iso, 'updatedAt': now_iso,
                'stopLoss': to128(D(stop_loss)) if stop_loss is not None else None,
                'stopLossReason': 'Set at entry' if stop_loss is not None else None,
                'stopLossHistory': [],
                'takeProfit': to128(D(take_profit)) if take_profit is not None else None,
                'takeProfitReason': 'Set at entry' if take_profit is not None else None,
                'takeProfitHistory': [],
                'entryDecisionSnapshotId': canonical.get('decisionSnapshotId'),
                'strategyVersion': strategy_version,
            }
            positions.append(new_pos)

        seq = (acct.get('accountSequence') or 0) + 1
        led = _ledger_entry(seq, 'FILL', asset, -notional,
                            'BUY %s %s @ %s' % (qty_dstr(qty), asset, dstr(fill_px, pq)),
                            extra={'side': 'BUY', 'asset': asset, 'qty': qty_dstr(qty),
                                   'fillPx': dstr(fill_px, pq), 'notional': dstr(notional)})
        result = {'side': 'BUY', 'asset': asset, 'qty': qty_dstr(qty),
                  'fillPrice': dstr(fill_px, pq), 'notional': dstr(notional),
                  'decisionSnapshotId': canonical.get('decisionSnapshotId'),
                  'merged': existing is not None, 'paperOnly': True}
        upd = col.find_one_and_update(
            {'paperAccountId': acct_id, 'ownerId': pid, 'version': expected_version,
             'idemKeys': {'$ne': idem_key}},
            {'$set': {'cash': to128(new_cash), 'positions': positions},
             '$push': {'ledger': led,
                       'idemKeys': {'$each': [idem_key], '$slice': -500}},
             '$inc': {'version': 1, 'accountSequence': 1}})
        if upd is not None:
            return result, None, 200
    return None, 'CONCURRENCY_RETRY_EXHAUSTED', 409


# ==================== single-document atomic SELL ============================ #
def apply_sell_atomic(col, acct_id, pid, symbol, sell_mode, sell_value,
                      mark_px, source='auto', idem_key=None,
                      strategy_version=None, strategy_hash=None):
    """Atomic SELL from the combined position for `symbol`.

    sell_mode: 'FULL' | 'PERCENTAGE' | 'DOLLAR' | 'QTY'
    sell_value: ignored for FULL, percentage (0-100), dollar amount, or quantity.

    Partial sells reduce qty and cost basis proportionally (average-cost).
    Returns (result_dict, error_code, http_status)."""
    symbol = (symbol or '').upper()
    mark = D(mark_px)
    if mark is None or not mark.is_finite() or mark <= 0:
        return None, 'NO_VALID_MARK', 422
    pq = _infer_price_q(mark)
    fill_px = round_tick(mark, pq, ROUND_HALF_UP) if pq else mark
    if fill_px is None or fill_px <= 0:
        return None, 'NO_VALID_MARK', 422
    now_iso = datetime.datetime.utcnow().isoformat()

    for _ in range(5):
        acct = col.find_one({'paperAccountId': acct_id, 'ownerId': pid})
        if not acct:
            return None, 'NOT_FOUND', 404
        if strategy_version is not None and (acct.get('strategyVersion') != strategy_version or
                                              acct.get('strategyContractHash') != strategy_hash):
            return None, 'STRATEGY_CHANGED', 409
        if idem_key:
            if idem_key in (acct.get('idemKeys') or []):
                return None, 'ALREADY_APPLIED', 200

        # Find the combined position.
        positions = list(acct.get('positions') or [])
        pos_idx = None
        pos = None
        for i, p in enumerate(positions):
            if (p.get('symbol') or '').upper() == symbol and (D(p.get('qty')) or Decimal('0')) > 0:
                pos_idx = i
                pos = p
                break
        if pos is None:
            return None, 'NO_POSITION', 404

        expected_version = acct.get('version')
        total_qty = D(pos.get('qty')) or Decimal('0')
        total_cb = D(pos.get('costBasis')) or Decimal('0')

        # Determine sell quantity based on mode.
        if sell_mode == 'FULL':
            sell_qty = total_qty
        elif sell_mode == 'PERCENTAGE':
            pct = D(sell_value) or Decimal('0')
            if pct <= 0 or pct > Decimal('100'):
                return None, 'INVALID_PERCENTAGE', 422
            sell_qty = q_qty(total_qty * pct / Decimal('100'))
        elif sell_mode == 'DOLLAR':
            dollar_amount = D(sell_value) or Decimal('0')
            if dollar_amount <= 0:
                return None, 'INVALID_AMOUNT', 422
            sell_qty = q_qty(dollar_amount / fill_px)
            sell_qty = min(sell_qty, total_qty)
        elif sell_mode == 'QTY':
            sell_qty = q_qty(D(sell_value) or Decimal('0'))
            sell_qty = min(sell_qty, total_qty)
        else:
            return None, 'INVALID_SELL_MODE', 422

        if sell_qty is None or sell_qty <= 0:
            return None, 'BELOW_MIN_NOTIONAL', 422

        # Ensure we don't sell more than we hold.
        sell_qty = min(sell_qty, total_qty)

        # Average-cost accounting.
        proceeds = q_cash(sell_qty * fill_px)
        cost_portion = q_cash(total_cb * (sell_qty / total_qty)) if total_qty > 0 else Decimal('0')
        realized = q_cash(proceeds - cost_portion)

        cash = D(acct.get('cash')) or Decimal('0')
        realized_acc = D(acct.get('realizedPnl')) or Decimal('0')
        new_cash = q_cash(cash + proceeds)
        new_realized = q_cash(realized_acc + realized)

        remaining_qty = q_qty(total_qty - sell_qty)
        closed_positions = list(acct.get('closedPositions') or [])

        is_full_close = remaining_qty <= 0
        if is_full_close:
            # Remove position entirely.
            positions = [p for i, p in enumerate(positions) if i != pos_idx]
            closed_positions.append({
                'symbol': symbol, 'qty': to128(sell_qty),
                'costBasis': to128(total_cb),
                'avgEntry': pos.get('avgEntry'),
                'exitPrice': to128(fill_px),
                'realizedPnl': to128(realized),
                'openedAt': pos.get('openedAt'),
                'closedAt': now_iso,
                'closeSource': source,
            })
        else:
            # Partial: reduce qty and cost basis proportionally.
            remaining_cb = q_cash(total_cb - cost_portion)
            # avgEntry stays the same (it's total cost / total qty, proportional reduction preserves it).
            positions[pos_idx] = {**pos,
                'qty': to128(remaining_qty),
                'costBasis': to128(remaining_cb),
                'updatedAt': now_iso}

        seq = (acct.get('accountSequence') or 0) + 1
        led = _ledger_entry(seq, 'FILL', symbol, proceeds,
                            '%s %s %s @ %s (PnL %s) · %s'
                            % ('SELL' if is_full_close else 'PARTIAL_SELL',
                               qty_dstr(sell_qty), symbol, dstr(fill_px, pq),
                               dstr(realized), source),
                            extra={'side': 'SELL', 'asset': symbol, 'qty': qty_dstr(sell_qty),
                                   'fillPx': dstr(fill_px, pq), 'proceeds': dstr(proceeds),
                                   'realized': dstr(realized), 'costPortion': dstr(cost_portion),
                                   'fullClose': is_full_close, 'source': source})

        result = {'side': 'SELL', 'asset': symbol, 'qty': qty_dstr(sell_qty),
                  'fillPrice': dstr(fill_px, pq), 'proceeds': dstr(proceeds),
                  'realized': dstr(realized), 'fullClose': is_full_close,
                  'paperOnly': True}

        setd = {'cash': to128(new_cash), 'realizedPnl': to128(new_realized),
                'positions': positions, 'closedPositions': closed_positions}
        flt = {'paperAccountId': acct_id, 'ownerId': pid, 'version': expected_version}
        push = {'ledger': led}
        if idem_key:
            push['idemKeys'] = {'$each': [idem_key], '$slice': -500}
            flt['idemKeys'] = {'$ne': idem_key}
        inc = {'version': 1, 'accountSequence': 1}
        if is_full_close:
            inc['goalStatus.tradeCount'] = 1

        upd = col.find_one_and_update(flt, {'$set': setd, '$push': push, '$inc': inc})
        if upd is not None:
            return result, None, 200
    return None, 'CONCURRENCY_RETRY_EXHAUSTED', 409


# ==================== stop-loss / take-profit updates ======================== #
def update_stop_loss(col, acct_id, pid, symbol, new_value, reason=''):
    """Atomically update the stop-loss on the combined position for `symbol`.
    Records the change in the position's history."""
    symbol = (symbol or '').upper()
    now_iso = datetime.datetime.utcnow().isoformat()
    acct = col.find_one({'paperAccountId': acct_id, 'ownerId': pid})
    if not acct:
        return None, 'NOT_FOUND'
    positions = list(acct.get('positions') or [])
    for i, p in enumerate(positions):
        if (p.get('symbol') or '').upper() == symbol and (D(p.get('qty')) or Decimal('0')) > 0:
            old_sl = D(p.get('stopLoss'))
            history = list(p.get('stopLossHistory') or [])
            history.append({'previous': dstr(old_sl) if old_sl else None,
                            'new': dstr(D(new_value)) if new_value else None,
                            'reason': reason, 'at': now_iso})
            positions[i] = {**p,
                'stopLoss': to128(D(new_value)) if new_value is not None else None,
                'stopLossReason': reason or p.get('stopLossReason'),
                'stopLossHistory': history, 'updatedAt': now_iso}
            col.update_one({'paperAccountId': acct_id, 'ownerId': pid, 'version': acct['version']},
                           {'$set': {'positions': positions}, '$inc': {'version': 1}})
            return {'symbol': symbol, 'previousStopLoss': dstr(old_sl) if old_sl else None,
                    'newStopLoss': dstr(D(new_value)) if new_value else None}, None
    return None, 'NO_POSITION'


def update_take_profit(col, acct_id, pid, symbol, new_value, reason=''):
    """Atomically update the take-profit on the combined position for `symbol`."""
    symbol = (symbol or '').upper()
    now_iso = datetime.datetime.utcnow().isoformat()
    acct = col.find_one({'paperAccountId': acct_id, 'ownerId': pid})
    if not acct:
        return None, 'NOT_FOUND'
    positions = list(acct.get('positions') or [])
    for i, p in enumerate(positions):
        if (p.get('symbol') or '').upper() == symbol and (D(p.get('qty')) or Decimal('0')) > 0:
            old_tp = D(p.get('takeProfit'))
            history = list(p.get('takeProfitHistory') or [])
            history.append({'previous': dstr(old_tp) if old_tp else None,
                            'new': dstr(D(new_value)) if new_value else None,
                            'reason': reason, 'at': now_iso})
            positions[i] = {**p,
                'takeProfit': to128(D(new_value)) if new_value is not None else None,
                'takeProfitReason': reason or p.get('takeProfitReason'),
                'takeProfitHistory': history, 'updatedAt': now_iso}
            col.update_one({'paperAccountId': acct_id, 'ownerId': pid, 'version': acct['version']},
                           {'$set': {'positions': positions}, '$inc': {'version': 1}})
            return {'symbol': symbol, 'previousTakeProfit': dstr(old_tp) if old_tp else None,
                    'newTakeProfit': dstr(D(new_value)) if new_value else None}, None
    return None, 'NO_POSITION'


def clear_take_profit(col, acct_id, pid, symbol):
    """Clear the take-profit after it has been triggered (prevent repeat execution)."""
    symbol = (symbol or '').upper()
    now_iso = datetime.datetime.utcnow().isoformat()
    acct = col.find_one({'paperAccountId': acct_id, 'ownerId': pid})
    if not acct:
        return
    positions = list(acct.get('positions') or [])
    for i, p in enumerate(positions):
        if (p.get('symbol') or '').upper() == symbol and (D(p.get('qty')) or Decimal('0')) > 0:
            positions[i] = {**p, 'takeProfit': None, 'takeProfitReason': None,
                            'updatedAt': now_iso}
            col.update_one({'paperAccountId': acct_id, 'ownerId': pid, 'version': acct['version']},
                           {'$set': {'positions': positions}, '$inc': {'version': 1}})
            return


def update_high_water(col, acct_id, pid, equity):
    """Persist the high-water equity with an atomic $max."""
    if equity is None:
        return
    col.update_one({'paperAccountId': acct_id, 'ownerId': pid},
                   {'$max': {'highWaterEquity': to128(q_cash(equity))}})


