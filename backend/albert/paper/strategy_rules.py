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
                   'TRAILING_STOP_PCT', 'TAKE_PROFIT_PCT',
                   'PARTIAL_TAKE_PROFIT_PCT', 'TIME_EXIT'}
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
        elif kind == 'PARTIAL_TAKE_PROFIT_PCT':
            if side != 'SELL' or value is None or not 0 < value < 100:
                errors.append(f'{label}: Needs changes: PARTIAL_TAKE_PROFIT_PCT must be a SELL percentage between 0 and 100.'); continue
            portion_pct = decimal(row.get('portionPct'))
            portion_of = str(row.get('portionOf') or 'original').lower()
            if portion_pct is None or not 0 < portion_pct <= 100:
                errors.append(f'{label}: Needs changes: portionPct (how much of the position to sell) is required, 1–100.'); continue
            if portion_of not in ('original', 'remaining'):
                errors.append(f'{label}: Needs changes: portionOf must be "original" or "remaining".'); continue
        elif kind == 'TIME_EXIT':
            if side != 'SELL':
                errors.append(f'{label}: Needs changes: TIME_EXIT must be a SELL rule.'); continue
            deadline = str(row.get('deadline') or '').strip()
            try:
                datetime.datetime.fromisoformat(deadline.replace('Z', '+00:00'))
            except (ValueError, TypeError):
                errors.append(f'{label}: Needs changes: TIME_EXIT requires a valid ISO datetime deadline.'); continue
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
                'indicator': indicator if kind == 'INDICATOR' else None,
                'value': str(value.normalize()) if value is not None else None}
        if kind == 'PARTIAL_TAKE_PROFIT_PCT':
            rule['portionPct'] = str(decimal(row.get('portionPct')).normalize())
            rule['portionOf'] = str(row.get('portionOf') or 'original').lower()
        if kind == 'TIME_EXIT':
            rule['deadline'] = str(row.get('deadline') or '').strip()
            rule['value'] = None  # time exits have no price value
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
    When a clause names multiple coins and contains generic percentage exits,
    expand those rules to every named coin rather than rejecting the clause.
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
        # Portfolio-level goals (profit target, equity floor, drawdown) are not
        # per-coin rules — skip them here. They're extracted by extract_portfolio_goals().
        if is_portfolio_goal_clause(clause):
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
        # Reverse order: "5% stop-loss"
        for match in re.finditer(numeric + r'\s*%\s*(?:stop[ -]?loss|stop\s+out)\b', clause, re.I):
            if not any(match.start() < c[1] and match.end() > c[0] for c in covered):
                add('STOP_LOSS_PCT', 'SELL', match.group(1), span=match.span())
        for match in re.finditer(r'\b(?:take[ -]?profit|profit\s+target)\s*(?:at|of)?\s*' + numeric + r'\s*%', clause, re.I):
            add('TAKE_PROFIT_PCT', 'SELL', match.group(1), span=match.span())
        # Reverse order: "8% take-profit"
        for match in re.finditer(numeric + r'\s*%\s*(?:take[ -]?profit|profit\s+target)\b', clause, re.I):
            if not any(match.start() < c[1] and match.end() > c[0] for c in covered):
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
        for match in re.finditer(r'(?:\b(?:24\s*h(?:ours?)?|daily?)\s+)?\b(?:rises?|gains?|up|increases?|drops?|falls?|down|decreases?)\s*(?:by\s*|[><]=?\s*)?' + numeric + r'\s*%\s*(?:in\s*(?:24\s*h(?:ours?)?|a\s*day))?', clause, re.I):
            direction = match.group(0).lower()
            value = match.group(1)
            falling = bool(re.search(r'\b(drop|fall|down|decrease)', direction))
            add('CHANGE_PCT_24H', 'SELL' if has_sell and not has_buy else 'BUY',
                '-' + value.lstrip('-') if falling else value.lstrip('-'), 'BELOW' if falling else 'ABOVE', span=match.span())

        # ---- Multi-coin expansion: when sym is None because the clause names
        # multiple coins and the parsed triggers are generic percentage exits,
        # expand each trigger to every named coin. ----
        expanded_multi = False
        if raw and not sym and len(named) > 1:
            # Only expand generic percentage exits (TP/SL/trailing) that are
            # coin-agnostic — price/indicator rules require an explicit coin.
            expandable_kinds = {'STOP_LOSS_PCT', 'TAKE_PROFIT_PCT', 'CHANGE_PCT_24H',
                                'TRAILING_STOP_PCT', 'PARTIAL_TAKE_PROFIT_PCT'}
            if all(r['kind'] in expandable_kinds for r in raw):
                expanded = []
                for r in raw:
                    for s in named:
                        expanded.append({**r, 'symbol': s})
                raw = expanded
                sym = named[0]  # suppress "name the coin" error
                expanded_multi = True

        # When no specific coins are named but the clause references "all positions",
        # "per position", "each position", "every position/asset/coin", resolve
        # generic percentage exits against ALL strategy symbols.
        if raw and not sym and not named and symbols:
            all_positions = bool(re.search(
                r'\b(?:all|every|each|per)[\s-]+(?:position|asset|coin)s?\b', clause, re.I))
            expandable_kinds = {'STOP_LOSS_PCT', 'TAKE_PROFIT_PCT', 'CHANGE_PCT_24H',
                                'TRAILING_STOP_PCT', 'PARTIAL_TAKE_PROFIT_PCT'}
            if all_positions and all(r['kind'] in expandable_kinds for r in raw):
                expanded = []
                for r in raw:
                    for s in symbols:
                        expanded.append({**r, 'symbol': s})
                raw = expanded
                sym = symbols[0]
                expanded_multi = True

        # Short coin-agnostic fragment: when the clause is just a bare percentage
        # exit (e.g. "take-profit 8%") with no coin names, no scope phrase, and no
        # additional instructions, expand it to all strategy symbols. This handles
        # LLM-fragmented unresolved instructions that are actually valid.
        if raw and not sym and not named and symbols and not expanded_multi:
            expandable_kinds = {'STOP_LOSS_PCT', 'TAKE_PROFIT_PCT', 'CHANGE_PCT_24H',
                                'TRAILING_STOP_PCT', 'PARTIAL_TAKE_PROFIT_PCT'}
            residual_check = clause
            for start, end in covered:
                residual_check = residual_check[:start] + ' ' * (end - start) + residual_check[end:]
            residual_words = re.sub(r'[^A-Za-z]+', ' ', residual_check).strip().split()
            # Only expand when the residual is empty or contains only trivial words
            trivial = {'', 'and', 'or', 'with', 'per', 'position', 'positions', 'target',
                       'targets', 'strict', 'limit', 'limits', 'the', 'a', 'an', 'of', 'at',
                       '24h', '24', 'hour', 'hours', 'day', 'daily',
                       'buy', 'sell', 'enter', 'exit', 'close', 'trade',
                       'if', 'when', 'unless', 'after', 'before', 'for'}
            if (all(r['kind'] in expandable_kinds for r in raw) and
                    all(w.lower() in trivial for w in residual_words)):
                expanded = []
                for r in raw:
                    for s in symbols:
                        expanded.append({**r, 'symbol': s})
                raw = expanded
                sym = symbols[0]
                expanded_multi = True

        # A bare condition, unsupported indicator or narrative-gated action must not
        # quietly become the canonical preset. Explicit advisory discussion is fine.
        residual = list(clause)
        for start, end in covered:
            residual[start:end] = ' ' * (end - start)
        remaining = ''.join(residual)
        # Strip exclusion/negation phrases that are NOT trading conditions:
        # "no other assets or conditions", "nothing else", "no additional", etc.
        # These are plain English constraints, not OR-logic branching.
        remaining_for_or = re.sub(
            r'\bno\s+(?:other|additional|further|more)\b[^.;!?\n]{0,60}?\bor\b[^.;!?\n]{0,40}',
            ' ', remaining, flags=re.I)
        remaining_for_or = re.sub(r'\bnothing\s+(?:else|more|further)\b', ' ', remaining_for_or, flags=re.I)
        remaining_for_or = re.sub(r'\bwithout\s+(?:any\s+)?(?:other|additional)\b', ' ', remaining_for_or, flags=re.I)
        # A clause containing a parsed condition must not hide another operation
        # behind "and", "or" or free-form prose. Put separate allocations or
        # advisory context into their own clause so omissions are visible.
        uncaptured = remaining
        for s in symbols:
            uncaptured = re.sub(r'\b' + re.escape(s) + r'\b', ' ', uncaptured, flags=re.I)
        uncaptured = re.sub(r'\b(?:buy|sell|enter|exit|close|trade|if|when|unless|after|before|and|for|the|a|an|of|my|please|only|at|price|is|by|to|coin|asset|on|daily|close|indicator)\b', ' ', uncaptured, flags=re.I)
        # Also strip common descriptive/summary words that are not actionable
        # triggers to avoid flagging strategy descriptions as unsupported instructions.
        uncaptured = re.sub(r'\b(?:strategy|paper|virtual|allocating|allocated|allocation|strict|limits?|per|with|its|this|from|entry|reserves?|protected|starting|cash|wallet|balance|budget|named|called|positions?|targets?|implements?|trading|across|all|every|each|no|other|additional|further|nothing|else|more|without|any|conditions?|assets?|implement)\b', ' ', uncaptured, flags=re.I)
        extra_instruction = bool(raw and re.search(r'[A-Za-z]{2,}|[<>%]|\$\s*\d', uncaptured))
        unknown_trigger = bool(extra_instruction or re.search(r'\b(?:trail(?:ing)?|stop[ -]?loss|take[ -]?profit|profit\s+target|RSI|SMA|EMA|MACD|indicator|pullback|breakout|cross(?:over)?|limit\s+order|rebalance|short|leverage)\b', remaining, re.I)
                               or (raw and re.search(r'\bor\b', remaining_for_or, re.I))
                               or re.search(r'\bprice\s+(?:above|below|over|under)\b', remaining, re.I))
        expects = bool(unknown_trigger
                       or re.search(r'\b(?:buy|sell|enter|exit|trade)\b.{0,70}\b(?:if|when|unless|after|before|at\s+\$)\b', clause, re.I)
                       or re.search(r'\b(?:if|when|unless)\b.{0,70}\b(?:buy|sell|enter|exit|trade)\b', clause, re.I))

        # When triggers were successfully parsed and expanded to all named coins,
        # the clause is a valid multi-coin description — suppress residual-text
        # false positives. Only suppress when extra_instruction is the sole reason
        # for unknown_trigger (not real unrecognised trigger keywords or OR logic).
        if expanded_multi and raw:
            real_trigger_keyword = bool(re.search(r'\b(?:pullback|breakout|cross(?:over)?|limit\s+order|rebalance|short|leverage)\b', remaining, re.I))
            real_or_logic = bool(re.search(r'\bor\b', remaining_for_or, re.I))
            if not real_trigger_keyword and not real_or_logic:
                unknown_trigger = False
                extra_instruction = False
                expects = False

        if has_sell and has_buy and raw:
            errors.append('Needs changes: separate BUY and SELL conditions into distinct sentences or semicolon-separated clauses: ' + clause[:150])
        if unknown_trigger:
            errors.append('Needs changes: an instruction or OR condition is not supported as an exact rule: ' + clause[:150])
        if raw and not sym and not expanded_multi:
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


def evaluate(rules, side, symbol, mark, *, history=None, lot=None, peak=None, change_pct_24h=None, completed_targets=None):
    """Return matching/wait reason with per-rule evidence; never manufacture a fill.
    BUY: all explicit conditions must pass. SELL: any one exit condition may pass.

    completed_targets: set of ruleIds that have already been executed (partial or full).
                       These are skipped to prevent re-execution on every cycle.
    """
    completed_targets = completed_targets or set()
    selected = [r for r in rules if r['symbol'] == symbol and r['side'] == side and r['ruleId'] not in completed_targets]
    if not selected:
        return {'ready': side == 'BUY', 'reason': 'Waiting for a reviewed exit rule.' if side == 'SELL' else None,
                'results': [], 'matchedRuleId': None, 'partial': None}
    px = decimal(mark)
    if px is None or px <= 0:
        return {'ready': False, 'reason': f'WAIT: a current verified {symbol} price is unavailable.',
                'results': [], 'matchedRuleId': None, 'partial': None}
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
        # ── TIME_EXIT: compare current time against saved deadline ──
        if kind == 'TIME_EXIT':
            try:
                deadline = datetime.datetime.fromisoformat(r['deadline'].replace('Z', '+00:00'))
                now = datetime.datetime.now(datetime.timezone.utc)
                meets = now >= deadline
                results.append({'ruleId': r['ruleId'], 'kind': kind, 'state': 'MET' if meets else 'WAIT',
                                'observed': now.isoformat(), 'threshold': r['deadline'],
                                'reason': None if meets else f'WAIT: time exit at {r["deadline"]}, current {now.isoformat()[:16]}.'})
            except (ValueError, TypeError):
                results.append({'ruleId': r['ruleId'], 'kind': kind, 'state': 'WAIT',
                                'reason': f'WAIT: invalid deadline {r.get("deadline")}'})
            continue
        if kind == 'PRICE':
            observed = px
        elif kind == 'CHANGE_PCT_24H':
            observed = decimal(change_pct_24h)
            if observed is not None and not -100 <= observed <= 1000:
                observed = None
        elif kind == 'INDICATOR':
            observed = _indicator(r['indicator'], closes) if closes and all(x is not None and x > 0 for x in closes) else None
        elif kind == 'PARTIAL_TAKE_PROFIT_PCT':
            # Partial take profit: same as TAKE_PROFIT_PCT but affects only a portion.
            if lot and decimal(lot.get('avgEntry')):
                entry = decimal(lot['avgEntry'])
                observed = (px - entry) / entry * 100
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
        result_row = {'ruleId': r['ruleId'], 'kind': kind, 'state': 'MET' if meets else 'WAIT',
                      'observed': str(observed.quantize(Decimal('0.0001'))), 'threshold': str(threshold) if threshold is not None else None,
                      'reason': None if meets else f'WAIT: {symbol} {kind} is {observed:.4f}; waiting for {r.get("operator") or "at least"} {threshold}.'}
        # Attach partial info so the caller knows how much to sell.
        if kind == 'PARTIAL_TAKE_PROFIT_PCT' and meets:
            result_row['portionPct'] = r.get('portionPct')
            result_row['portionOf'] = r.get('portionOf', 'original')
        results.append(result_row)
    matching = next((r for r in results if r['state'] == 'MET'), None)
    missing = next((r for r in results if r['state'] != 'MET'), None)
    ready = bool(matching) if side == 'SELL' else missing is None
    partial = None
    if ready and matching and matching['kind'] == 'PARTIAL_TAKE_PROFIT_PCT':
        partial = {'portionPct': matching.get('portionPct'), 'portionOf': matching.get('portionOf', 'original')}
    return {'ready': ready, 'reason': None if ready else (missing or results[0])['reason'],
            'results': results, 'matchedRuleId': matching['ruleId'] if ready and matching else None,
            'partial': partial}


# ── Portfolio-level goal extraction ─────────────────────────────────────── #

_PORTFOLIO_GOAL_PATTERNS = [
    # "portfolio profit target 15%"  /  "profit target of 15% on the portfolio"
    (r'\b(?:portfolio\s+)?(?:profit\s+target|target\s+profit|target\s+gain)\s*(?:of|at|:)?\s*(\d+(?:\.\d+)?)\s*%',
     'profitTargetPct'),
    # "equity floor $8500"  /  "floor of $8,500"  /  "minimum equity $8500"
    (r'\b(?:equity\s+floor|floor|minimum\s+equity|equity\s+minimum)\s*(?:of|at|:)?\s*\$?\s*([\d,]+(?:\.\d+)?)',
     'equityFloorUsd'),
    # "max drawdown 20%"  /  "maximum drawdown of 20%"
    (r'\b(?:max(?:imum)?\s+)?drawdown\s*(?:of|at|:)?\s*(\d+(?:\.\d+)?)\s*%',
     'maxDrawdownPct'),
    # "stop trading if portfolio loses 10%"  /  "loss floor 10%"  /  "loss limit 10%"
    (r'\b(?:(?:portfolio\s+)?loss\s+(?:floor|limit)|stop\s+(?:trading\s+)?if\s+(?:portfolio\s+)?los(?:es?|s))\s*(?:of|at|:)?\s*(\d+(?:\.\d+)?)\s*%',
     'lossFloorPct'),
]


def extract_portfolio_goals(text):
    """Parse portfolio-level goals from free text. Returns a dict of goal
    fields (profitTargetPct, equityFloorUsd, maxDrawdownPct, lossFloorPct)
    with Decimal-string values. Unmatched fields are omitted."""
    goals = {}
    text = str(text or '')
    for pattern, field in _PORTFOLIO_GOAL_PATTERNS:
        m = re.search(pattern, text, re.I)
        if m:
            try:
                val = Decimal(m.group(1).replace(',', ''))
                goals[field] = str(val)
            except (InvalidOperation, IndexError):
                pass
    return goals


def is_portfolio_goal_clause(clause):
    """Return True if the clause is ONLY a portfolio-level goal (not a per-coin rule).
    Used to suppress 'unresolved instruction' errors for portfolio goals."""
    clause = str(clause or '').strip()
    for pattern, _field in _PORTFOLIO_GOAL_PATTERNS:
        if re.search(pattern, clause, re.I):
            return True
    return False
