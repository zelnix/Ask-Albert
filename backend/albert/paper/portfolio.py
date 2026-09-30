"""M5 — Multi-asset portfolio valuation and transparent capital allocation.

Uses combined positions (one per coin). No tickets, lots, regime bands,
profile limits, risk haircuts or hidden allocation scaling.
"""
from decimal import Decimal, ROUND_HALF_UP

from albert.paper import core

MIN_NOTIONAL = core.MIN_NOTIONAL


def _d(x):
    return core.D(x)


def compute_portfolio_equity(acct, marks):
    """Delegate to core's multi-asset equity computation."""
    return core.compute_equity_multi(acct, marks)


def rank_opportunities(candidates):
    """Deterministic ranking. Tie-breaks: score desc, confidence desc, symbol asc."""
    def key(c):
        return (-(_d(c.get('score')) or Decimal('0')),
                -(_d(c.get('confidence')) or Decimal('0')),
                (c.get('symbol') or ''))
    return sorted(candidates, key=key)


def allocate(*, acct, equity_info, candidates, regime, marks,
             profile=None, holding_scores=None):
    """Produce per-asset trade intents from ranked canonical opportunities.

    The reviewed strategy sizing is authoritative. This allocator ranks and
    passes through without hidden caps. Max open positions is enforced by
    counting combined coin positions (not tickets).

    Returns {'intents': [...], 'diagnostics': {...}}.
    """
    equity = equity_info.get('equity')
    intents = []
    diag = {'ranked': [], 'skipped': [], 'blocked': None}

    # SELLs first — always allowed.
    held_map = {}
    for p in equity_info.get('positions', []):
        sym = (p.get('symbol') or '').upper()
        if sym not in held_map:
            held_map[sym] = p
    for c in candidates:
        if c.get('action') != 'SELL':
            continue
        sym = (c.get('symbol') or '').upper()
        pos = held_map.get(sym)
        if not pos or pos['qty'] <= 0:
            continue
        px, fresh = marks.get(sym, (None, False))
        if _d(px) is None or not fresh:
            continue
        intents.append({'symbol': sym, 'action': 'SELL', 'reason': 'CANONICAL_SELL',
                        'canonical': c})

    if equity is None or not equity_info.get('available'):
        diag['blocked'] = 'EQUITY_UNAVAILABLE'
        return {'intents': intents, 'diagnostics': diag}

    deployable = equity_info.get('deployableCash') or Decimal('0')
    open_count = equity_info.get('openPositionsCount') or 0

    ranked = rank_opportunities([c for c in candidates if c.get('action') == 'BUY'])

    for c in ranked:
        sym = (c.get('symbol') or '').upper()
        px, fresh = marks.get(sym, (None, False))
        px = _d(px)
        rec = _d(c.get('recommendedDeployNowUsd')) or Decimal('0')
        entry = {'symbol': sym, 'score': str(_d(c.get('score')) or 0)}
        if px is None or not fresh or rec <= 0:
            entry['skip'] = 'NO_MARK_OR_AMOUNT'
            diag['skipped'].append(entry)
            continue

        notional = min(rec, deployable)
        notional = core.q_cash(notional)

        if notional is None or notional < MIN_NOTIONAL:
            entry['skip'] = 'BELOW_MIN_OR_NO_ROOM'
            diag['skipped'].append(entry)
            continue

        intents.append({'symbol': sym, 'action': 'BUY', 'notional': notional,
                        'markPx': px, 'canonical': c,
                        'invalidationPrice': _d(c.get('invalidationPrice'))})
        deployable -= notional
        entry['funded'] = str(notional)
        diag['ranked'].append(entry)

    return {'intents': intents, 'diagnostics': diag}
