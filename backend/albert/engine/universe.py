"""Discovery universe + eligibility rules (Phase D2).

Explicitly separates three stages:
  * DISCOVERY   — which assets get scored (the opportunity universe).
  * ELIGIBILITY — mandate / asset / data rules that decide if a scored asset may
                  ever be BOUGHT. An ineligible asset can still be scored and
                  shown, but must NEVER become BUY regardless of score.
  * DECISION    — BUY / SELL / HOLD / WAIT (in decision.py).

Eligibility here mirrors EXACTLY the hard gates that Phase C/D1 already enforce
(so no behaviour changes) — it just names them with canonical reason codes.
"""
from albert.engine.constants import ALBERT_UNIVERSE
from albert.asset_capabilities import capability


def discovery_universe(held_symbols):
    """The set of assets to SCORE: the configured opportunity universe plus any
    asset the user actually holds (so held positions are always evaluated)."""
    return list(dict.fromkeys(list(ALBERT_UNIVERSE) + list(held_symbols or [])))


def eligibility(symbol, *, data_ok, excluded, approved, mandate_complete):
    """Return (eligible: bool, ineligibility_reason: str|None).

    approved is the set of approved coins ('' / empty means 'no whitelist -> all
    allowed'). Order matters: the first failing rule wins.
    """
    if not capability(symbol)['paperSupported']:
        return False, 'UNSUPPORTED_PAPER_CAPABILITY'
    if not data_ok:
        return False, 'STALE_DATA'
    if excluded and symbol in excluded:
        return False, 'EXCLUDED_BY_MANDATE'
    if approved and symbol not in approved:
        return False, 'NOT_IN_APPROVED_UNIVERSE'
    if not mandate_complete:
        return False, 'MANDATE_INCOMPLETE'
    return True, None
