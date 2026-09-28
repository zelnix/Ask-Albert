"""Exact, simulation-only Strategy Studio triggers. No orders or provider calls here.

BUY conditions are conjunctive with the existing canonical BUY and risk gates.
SELL conditions are disjunctive, reduce-only, and use the existing paper ledger.
All indicator inputs are completed, contiguous UTC CoinGecko daily close samples.
"""
import datetime
import hashlib
import json
import re
from decimal import Decimal, InvalidOperation

SUPPORTED_KINDS = {'PRICE', 'CHANGE_PCT_24H', 'INDICATOR', 'STOP_LOSS_PCT',
                   'TRAILING_STOP_PCT', 'TAKE_PROFIT_PCT'}
INDICATORS = {'RSI_14', 'SMA_20', 'EMA_20', 'MACD_HIST'}
COMPARISONS = {'ABOVE', 'BELOW'}
MAX_RULES = 24


def decimal(value):
    try:
        d = Decimal(str(value))
        return d if d.is_finite() else None
    except (TypeError, ValueError, InvalidOperation):
        return None


def normalize(raw, symbols):
    """Never discard invalid rows silently: return all errors for review before Save."""
    if raw is None:
        return [], []
    if not isinstance(raw, list):
        return [], ['Needs changes: rules must be a list of executable triggers.']
    if len(raw) > MAX_RULES:
        return [], [f'Needs changes: at most {MAX_RULES} triggers per strategy.']
    rules, errors, seen = [], [], set()
    for index, row in enumerate(raw):
        label = f'Rule {index + 1}'
        if not isinstance(row, dict):
            errors.append(f'{label}: Needs changes: use a structured trigger.'); continue
        kind = str(row.get('kind') or '').upper().strip()
        side = str(row.get('side') or '').upper().strip()
        symbol = str(row.get('symbol') or '').upper().strip()
        op = str(row.get('operator') or '').upper().strip()
        indicator = str(row.get('indicator') or '').upper().strip()
        value = decimal(row.get('value'))
        if kind not in SUPPORTED_KINDS or side not in ('BUY', 'SELL') or symbol not in symbols:
            errors.append(f'{label}: Needs changes: unsupported rule, side or coin {symbol}.'); continue
        if kind in ('STOP_LOSS_PCT', 'TRAILING_STOP_PCT', 'TAKE_PROFIT_PCT'):
            if side != 'SELL' or value is None or not 0 < value < 100:
                errors.append(f'{label}: Needs changes: a {kind} must be a SELL percentage between 0 and 100.'); continue
            if op or indicator:
                errors.append(f'{label}: Needs changes: {kind} does not accept an operator or indicator.'); continue
        elif kind in ('PRICE', 'CHANGE_PCT_24H', 'INDICATOR'):
            if op not in COMPARISONS or value is None or abs(value) > Decimal('1e12') or (kind == 'PRICE' and value <= 0):
                errors.append(f'{label}: Needs changes: enter an ABOVE/BELOW comparator and a finite threshold within $1 trillion.'); continue
            if kind == 'CHANGE_PCT_24H' and not -100 < value < 1000:
                errors.append(f'{label}: Needs changes: 24-hour change must be between -100% and 1000%.'); continue
            if kind == 'INDICATOR':
                if indicator not in INDICATORS or (indicator == 'RSI_14' and not 0 <= value <= 100):
                    errors.append(f'{label}: Needs changes: supported indicators are RSI_14, SMA_20, EMA_20, MACD_HIST (RSI 0–100).'); continue
            elif indicator:
                errors.append(f'{label}: Needs changes: indicator only applies to INDICATOR rules.'); continue
        rule = {'kind': kind, 'side': side, 'symbol': symbol, 'operator': op if kind in ('PRICE', 'CHANGE_PCT_24H', 'INDICATOR') else None,
                'indicator': indicator if kind == 'INDICATOR' else None, 'value': str(value.normalize())}
        sig = json.dumps(rule, sort_keys=True)
        if sig in seen:
            errors.append(f'{label}: Needs changes: duplicate trigger.'); continue
        seen.add(sig)
        rule['ruleId'] = 'rule_' + hashlib.sha256(sig.encode()).hexdigest()[:16]
        rules.append(rule)
    rules.sort(key=lambda r: (r['symbol'], r['side'], r['ruleId']))
    return rules, errors


def requested_triggers(text, assets):
    """Conservative literal parser. If a conditional instruction cannot be parsed,
    return Needs changes instead of silently substituting a generic rule.
    Supports one coin per clause (or an explicit coin before each trigger).
    """
    text = str(text or '')
    symbols = [str(s).upper() for s in assets]
    clauses = re.split(r'[;\n!?]+|(?<!\d)\.|\.(?!\d)', text)
    rules, errors = [], []
    numeric = r'(-?\d+(?:\.\d+)?)'
    for clause in clauses:
        clause = clause.strip()
        if not clause:
            continue
        named = [s for s in symbols if re.search(r'\b' + re.escape(s) + r'\b', clause, re.I)]
        sym = named[0] if len(named) == 1 else (symbols[0] if len(symbols) == 1 else None)
        raw = []
        covered = []
        has_sell = bool(re.search(r'\b(?:sell|exit|close)\b', clause, re.I))
        has_buy = bool(re.search(r'\b(?:buy|enter)\b', clause, re.I))
        def add(kind, side, value, operator=None, indicator=None, span=None):
            raw.append({'kind': kind, 'side': side, 'symbol': sym,
                        'value': value, 'operator': operator, 'indicator': indicator})
            if span: covered.append(span)
        for match in re.finditer(r'\b(?:trailing\s+stop|trail(?:ing)?\s+by)\s*(?:of\s*)?' + numeric + r'\s*%', clause, re.I):
            add('TRAILING_STOP_PCT', 'SELL', match.group(1), span=match.span())
        for match in re.finditer(r'\b(?:stop[ -]?loss|stop\s+out)\s*(?:at|of|by)?\s*' + numeric + r'\s*%', clause, re.I):
            add('STOP_LOSS_PCT', 'SELL', match.group(1), span=match.span())
        for match in re.finditer(r'\b(?:take[ -]?profit|profit\s+target)\s*(?:at|of)?\s*' + numeric + r'\s*%', clause, re.I):
            add('TAKE_PROFIT_PCT', 'SELL', match.group(1), span=match.span())
        for match in re.finditer(r'\b(RSI(?:\s*\(?14\)?)?|SMA\s*\(?20\)?|EMA\s*\(?20\)?|MACD(?:\s+hist(?:ogram)?)?)\s*(?:is\s*)?(above|below|>|<)\s*\$?' + numeric, clause, re.I):
            label = match.group(1).upper()
            indicator = ('RSI_14' if label.startswith('RSI') else 'SMA_20' if label.startswith('SMA')
                         else 'EMA_20' if label.startswith('EMA') else 'MACD_HIST')
            add('INDICATOR', 'SELL' if has_sell and not has_buy else 'BUY',
                match.group(3), 'ABOVE' if match.group(2).lower() in ('above', '>') else 'BELOW', indicator, match.span())
        for match in re.finditer(r'\b(?:price\s*)?(above|below|over|under|>=?|<=?)\s*(?:\$\s*|USD\s+)([\d,]+(?:\.\d+)?)([kKmM]?)(?![\w.])', clause, re.I):
            prefix = clause[max(0, match.start() - 16):match.start()]
            if re.search(r'(?:RSI|SMA|EMA|MACD)\s*\(?\d*\)?\s*$', prefix, re.I):
                continue
            price = Decimal(match.group(2).replace(',', '')) * (1000 if match.group(3).lower() == 'k' else
                                                               1000000 if match.group(3).lower() == 'm' else 1)
            add('PRICE', 'SELL' if has_sell and not has_buy else 'BUY',
                str(price), 'ABOVE' if match.group(1).lower() in ('above', 'over', '>', '>=') else 'BELOW',
                span=match.span())
        for match in re.finditer(r'\b(?:rises?|gains?|up|increases?|drops?|falls?|down|decreases?)\s*(?:by\s*)?' + numeric + r'\s*%\s*(?:in\s*(?:24\s*h(?:ours?)?|a\s*day))?', clause, re.I):
            direction = match.group(0).lower()
            value = match.group(1)
            falling = bool(re.match(r'(drop|fall|down|decrease)', direction))
            add('CHANGE_PCT_24H', 'SELL' if has_sell and not has_buy else 'BUY',
                '-' + value.lstrip('-') if falling else value.lstrip('-'), 'BELOW' if falling else 'ABOVE', span=match.span())
        # A bare condition, unsupported indicator or narrative-gated action must not
        # quietly become the canonical preset. Explicit advisory discussion is fine.
        residual = list(clause)
        for start, end in covered:
            residual[start:end] = ' ' * (end - start)
        remaining = ''.join(residual)
        # A clause containing a parsed condition must not hide another operation
        # behind "and", "or" or free-form prose. Put separate allocations or
        # advisory context into their own clause so omissions are visible.
        uncaptured = remaining
        for s in symbols:
            uncaptured = re.sub(r'\b' + re.escape(s) + r'\b', ' ', uncaptured, flags=re.I)
        uncaptured = re.sub(r'\b(?:buy|sell|enter|exit|close|trade|if|when|unless|after|before|and|for|the|a|an|of|my|please|only|at|price|is|by|to|coin|asset|on|daily|close|indicator)\b', ' ', uncaptured, flags=re.I)
        extra_instruction = bool(raw and re.search(r'[A-Za-z]{2,}|[<>%]|\$\s*\d', uncaptured))
        unknown_trigger = bool(extra_instruction or re.search(r'\b(?:trail(?:ing)?|stop[ -]?loss|take[ -]?profit|profit\s+target|RSI|SMA|EMA|MACD|indicator|pullback|breakout|cross(?:over)?|limit\s+order|rebalance|short|leverage)\b', remaining, re.I)
                               or (raw and re.search(r'\bor\b', remaining, re.I))
                               or re.search(r'\bprice\s+(?:above|below|over|under)\b', remaining, re.I))
        expects = bool(unknown_trigger
                       or re.search(r'\b(?:buy|sell|enter|exit|trade)\b.{0,70}\b(?:if|when|unless|after|before|at\s+\$)\b', clause, re.I)
                       or re.search(r'\b(?:if|when|unless)\b.{0,70}\b(?:buy|sell|enter|exit|trade)\b', clause, re.I))
        if has_sell and has_buy and raw:
            errors.append('Needs changes: separate BUY and SELL conditions into distinct sentences or semicolon-separated clauses: ' + clause[:150])
        if unknown_trigger:
            errors.append('Needs changes: an instruction or OR condition is not supported as an exact rule: ' + clause[:150])
        if raw and not sym:
            errors.append('Needs changes: name the coin for each trigger in a multi-coin strategy.')
        elif expects and not raw:
            errors.append('Needs changes: an instruction cannot be executed as a typed price, daily-change, indicator or percentage-exit rule: ' + clause[:150])
        elif raw:
            checked, invalid = normalize(raw, symbols)
            rules.extend(checked); errors.extend(invalid)
    return rules, errors


def _indicator(name, prices):
    if name == 'SMA_20' and len(prices) >= 20:
        return sum(prices[-20:]) / Decimal(20)
    if name == 'EMA_20' and len(prices) >= 20:
        ema = prices[0]
        alpha = Decimal(2) / Decimal(21)
        for price in prices[1:]:
            ema += (price - ema) * alpha
        return ema
    if name == 'RSI_14' and len(prices) >= 15:
        diffs = [prices[i] - prices[i-1] for i in range(1, len(prices))]
        gains = [max(d, Decimal(0)) for d in diffs]
        losses = [max(-d, Decimal(0)) for d in diffs]
        avg_gain = sum(gains[:14]) / 14
        avg_loss = sum(losses[:14]) / 14
        for g, l in zip(gains[14:], losses[14:]):
            avg_gain = (avg_gain * 13 + g) / 14
            avg_loss = (avg_loss * 13 + l) / 14
        if avg_loss == 0:
            return Decimal(50) if avg_gain == 0 else Decimal(100)
        return Decimal(100) - Decimal(100) / (1 + avg_gain / avg_loss)
    if name == 'MACD_HIST' and len(prices) >= 35:
        fast = slow = prices[0]
        signal = Decimal(0)
        for i, price in enumerate(prices):
            fast += (price - fast) * Decimal(2) / 13
            slow += (price - slow) * Decimal(2) / 27
            macd = fast - slow
            signal = macd if i == 0 else signal + (macd - signal) * Decimal(2) / 10
        return macd - signal
    return None


def evaluate(rules, side, symbol, mark, *, history=None, lot=None, peak=None, change_pct_24h=None):
    """Return matching/wait reason with per-rule evidence; never manufacture a fill.
    BUY: all explicit conditions must pass. SELL: any one exit condition may pass.
    """
    selected = [r for r in rules if r['symbol'] == symbol and r['side'] == side]
    if not selected:
        return {'ready': side == 'BUY', 'reason': 'Waiting for a reviewed exit rule.' if side == 'SELL' else None,
                'results': [], 'matchedRuleId': None}
    px = decimal(mark)
    if px is None or px <= 0:
        return {'ready': False, 'reason': f'WAIT: a current verified {symbol} price is unavailable.', 'results': [], 'matchedRuleId': None}
    closes = []
    if history:
        try:
            bars = history['bars']
            today = datetime.datetime.now(datetime.timezone.utc).date()
            last = datetime.datetime.fromtimestamp(bars[-1][0] / 1000, datetime.timezone.utc).date()
            if last == today - datetime.timedelta(days=1):
                needed = max((35 if r['kind'] == 'INDICATOR' and r.get('indicator') == 'MACD_HIST' else 20
                              if r['kind'] == 'INDICATOR' else 1) for r in selected if r['kind'] == 'INDICATOR')
                recent = bars[-max(needed, 35):]
                if all(b[0] - a[0] == 86_400_000 for a, b in zip(recent, recent[1:])):
                    closes = [decimal(row[4]) for row in recent]
        except (ValueError, TypeError, KeyError):
            closes = []
    results = []
    for r in selected:
        kind = r['kind']; threshold = decimal(r['value']); observed = None
        if kind == 'PRICE':
            observed = px
        elif kind == 'CHANGE_PCT_24H':
            observed = decimal(change_pct_24h)
            if observed is not None and not -100 <= observed <= 1000:
                observed = None
        elif kind == 'INDICATOR':
            observed = _indicator(r['indicator'], closes) if closes and all(x is not None and x > 0 for x in closes) else None
        elif lot and decimal(lot.get('avgEntry')):
            entry = decimal(lot['avgEntry'])
            if kind == 'STOP_LOSS_PCT': observed = (entry - px) / entry * 100
            elif kind == 'TAKE_PROFIT_PCT': observed = (px - entry) / entry * 100
            elif kind == 'TRAILING_STOP_PCT':
                high = max(entry, decimal(peak) or entry, px)
                observed = (high - px) / high * 100
        if observed is None:
            data_need = ("the asset's rolling 24-hour percentage change" if kind == 'CHANGE_PCT_24H' else
                         'complete, current closed daily candles' if kind == 'INDICATOR' else 'an open position')
            results.append({'ruleId': r['ruleId'], 'kind': kind, 'state': 'WAIT',
                            'reason': f'WAIT: {symbol} {kind} needs {data_need}; no signal was substituted.'})
            continue
        meets = (observed > threshold if r['operator'] == 'ABOVE' else observed < threshold) if r.get('operator') else observed >= threshold
        results.append({'ruleId': r['ruleId'], 'kind': kind, 'state': 'MET' if meets else 'WAIT',
                        'observed': str(observed.quantize(Decimal('0.0001'))), 'threshold': str(threshold),
                        'reason': None if meets else f'WAIT: {symbol} {kind} is {observed:.4f}; waiting for {r.get("operator") or "at least"} {threshold}.'})
    matching = next((r for r in results if r['state'] == 'MET'), None)
    missing = next((r for r in results if r['state'] != 'MET'), None)
    ready = bool(matching) if side == 'SELL' else missing is None
    return {'ready': ready, 'reason': None if ready else (missing or results[0])['reason'],
            'results': results, 'matchedRuleId': matching['ruleId'] if ready and matching else None}
