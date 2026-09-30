"""M5 — Expert Multi-Asset Trader: trading eligibility.

Separation of concerns (mirrors the engine's DISCOVERY vs ELIGIBILITY vs DECISION
rule): a coin may be *scored* and even look attractive, but it can only ever be
TRADED if it passes `eligible_for_trading` AND has a canonical actionable
decision. Discovery scores alone can NEVER manufacture a trade.
"""

from albert.engine.constants import STABLES

# ============================== eligibility ================================== #
# Wrapped / staked duplicates that must never be traded as independent assets.
WRAPPED = {
    'WBTC', 'WETH', 'WBETH', 'STETH', 'WSTETH', 'CBETH', 'WEETH', 'RETH', 'SFRXETH', 'FRXETH',
    'WBNB', 'WSOL', 'WAVAX', 'WMATIC', 'WHBAR', 'BSC-USD',
}


def is_leveraged(symbol):
    """Only explicit leveraged product forms; JUP/PUMP are ordinary tickers."""
    s = (symbol or '').upper()
    import re
    return bool(re.fullmatch(r'(?:[A-Z]{2,12}(?:[235][LS]|UP|DOWN|BULL|BEAR)|[235][LS][A-Z]{2,12})', s))


def is_wrapped(symbol):
    return (symbol or '').upper() in WRAPPED


def is_stable(symbol):
    return (symbol or '').upper() in STABLES


def eligible_for_trading(symbol, *, data_ok=True, excluded=None, approved=None,
                         mandate_complete=True):
    """Return (eligible: bool, reason: str|None). First failing rule wins.
    `approved` empty/None means 'no whitelist -> all non-excluded allowed'.
    An ineligible asset can be scored/shown but can NEVER become a trade."""
    sym = (symbol or '').upper()
    excluded = set(x.upper() for x in (excluded or set()))
    approved = set(x.upper() for x in (approved or set()))
    if is_stable(sym):
        return False, 'STABLECOIN'
    if is_wrapped(sym):
        return False, 'WRAPPED_DUPLICATE'
    if is_leveraged(sym):
        return False, 'LEVERAGED_TOKEN'
    if not data_ok:
        return False, 'STALE_DATA'
    if sym in excluded:
        return False, 'EXCLUDED_BY_MANDATE'
    if approved and sym not in approved:
        return False, 'NOT_IN_APPROVED_UNIVERSE'
    if not mandate_complete:
        return False, 'MANDATE_INCOMPLETE'
    return True, None
