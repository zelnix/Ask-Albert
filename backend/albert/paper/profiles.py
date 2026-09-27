"""M5 — Expert Multi-Asset Trader: risk profile, cap tiers, per-asset execution
profiles and trading eligibility.

EVERYTHING monetary/fractional is Decimal. No binary floats. These values are
versioned WITH the engine/profile: any change to a limit MUST bump the profile
version so simulated results stay reproducible.

Separation of concerns (mirrors the engine's DISCOVERY vs ELIGIBILITY vs DECISION
rule): a coin may be *scored* and even look attractive, but it can only ever be
TRADED if it passes `eligible_for_trading` AND has a canonical actionable
decision. Discovery scores alone can NEVER manufacture a trade.
"""
from decimal import Decimal

from albert.engine.constants import STABLES

# =========================== AGGRESSIVE_EXPERIENCED_V1 ======================= #
# The agreed starting configuration (percentages are of TOTAL EQUITY unless the
# name says otherwise). All Decimal so downstream math never touches a float.
AGGRESSIVE_EXPERIENCED_V1 = {
    'profileId': 'AGGRESSIVE_EXPERIENCED_V1',
    'version': 'v1.0.0',
    'maxDeployedEquityPct': Decimal('90'),      # max % of equity deployed into positions
    'protectedUsdcPct': Decimal('10'),          # always-protected virtual USDC
    'normalRiskPct': Decimal('1.5'),            # per-trade risk (normal conviction)
    'highConvictionRiskPct': Decimal('2.5'),    # per-trade risk (high conviction)
    'maxSingleTradeRiskPct': Decimal('3'),      # hard ceiling on any single trade risk
    'maxCombinedOpenRiskPct': Decimal('12'),    # sum of open risk-at-invalidation
    'btcAllocPct': Decimal('50'),               # BTC single-asset cap
    'largeCapAllocPct': Decimal('25'),          # per large-cap altcoin cap
    'midCapAllocPct': Decimal('12'),            # per mid-cap altcoin cap
    'specAllocPct': Decimal('5'),               # per speculative altcoin cap
    'totalAltcoinPct': Decimal('70'),           # total altcoin exposure cap
    'maxConcurrentPositions': 8,
    'softDrawdownPct': Decimal('15'),           # soft response (tighten new risk)
    'hardDrawdownPct': Decimal('25'),           # hard pause (no new entries)
    'highConvictionScore': Decimal('85'),       # score at/above -> high-conviction risk
    'rotationMargin': Decimal('8'),             # score gap needed to rotate out a laggard
}

# Regime -> exposure band. Engine emits BULL/RANGE/BEAR; we widen it with two
# derived regimes (ALT_ROTATION, DISTRIBUTION) that the caller may pass explicitly.
# maxDeployPct = ceiling on TOTAL deployed equity; altCeilingPct = ceiling on the
# altcoin slice of equity.
REGIME_BANDS = {
    'STRONG_BULL':  {'maxDeployPct': Decimal('90'), 'altCeilingPct': Decimal('70')},
    'BULL':         {'maxDeployPct': Decimal('90'), 'altCeilingPct': Decimal('70')},
    'ALT_ROTATION': {'maxDeployPct': Decimal('90'), 'altCeilingPct': Decimal('70')},
    'RANGE':        {'maxDeployPct': Decimal('60'), 'altCeilingPct': Decimal('45')},
    'MIXED':        {'maxDeployPct': Decimal('60'), 'altCeilingPct': Decimal('45')},
    'DISTRIBUTION': {'maxDeployPct': Decimal('35'), 'altCeilingPct': Decimal('20')},
    'BEAR':         {'maxDeployPct': Decimal('10'), 'altCeilingPct': Decimal('5')},
    'CRISIS':       {'maxDeployPct': Decimal('10'), 'altCeilingPct': Decimal('0')},
}


def regime_band(regime, profile=AGGRESSIVE_EXPERIENCED_V1):
    """Resolve the deploy/altcoin ceilings for a regime, never exceeding the
    profile's own hard maxima."""
    band = REGIME_BANDS.get((regime or 'RANGE').upper(), REGIME_BANDS['RANGE'])
    max_deploy = min(band['maxDeployPct'], profile['maxDeployedEquityPct'])
    alt_ceiling = min(band['altCeilingPct'], profile['totalAltcoinPct'])
    return {'maxDeployPct': max_deploy, 'altCeilingPct': alt_ceiling, 'regime': (regime or 'RANGE').upper()}


# =============================== cap tiers =================================== #
# Static market-cap RANK fallback for the liquid canonical universe (used only
# when a live discovery rank is unavailable). Tiers are then derived from rank:
#   BTC          -> its own 50% tier
#   rank <= 10   -> LARGE   (25% each)
#   rank <= 50   -> MID     (12% each)
#   otherwise    -> SPEC    (5% each)
RANK_FALLBACK = {
    'BTC': 1, 'ETH': 2, 'BNB': 4, 'SOL': 5, 'XRP': 6, 'DOGE': 8, 'ADA': 9, 'TRX': 10,
    'AVAX': 12, 'LINK': 15, 'DOT': 18, 'LTC': 20, 'MATIC': 22, 'SHIB': 14, 'BCH': 19,
    'UNI': 24, 'ATOM': 30, 'ETC': 28, 'FIL': 35, 'APT': 32, 'ARB': 40, 'OP': 45, 'NEAR': 38,
}


def asset_rank(symbol, rank=None):
    if rank is not None:
        try:
            return int(rank)
        except (TypeError, ValueError):
            pass
    return RANK_FALLBACK.get((symbol or '').upper(), 999)


def cap_tier(symbol, rank=None):
    """Return one of 'BTC' | 'LARGE' | 'MID' | 'SPEC'. Deterministic."""
    sym = (symbol or '').upper()
    if sym == 'BTC':
        return 'BTC'
    r = asset_rank(sym, rank)
    if r <= 10:
        return 'LARGE'
    if r <= 50:
        return 'MID'
    return 'SPEC'


def per_asset_cap_pct(symbol, rank=None, profile=AGGRESSIVE_EXPERIENCED_V1, tier=None):
    tier = tier or cap_tier(symbol, rank)
    return {
        'BTC': profile['btcAllocPct'], 'LARGE': profile['largeCapAllocPct'],
        'MID': profile['midCapAllocPct'], 'SPEC': profile['specAllocPct'],
    }[tier]


# =========================== per-asset exec profiles ========================= #
# Price precision + conservative (fee/spread/slippage) + liquidity SCALE (<=1)
# that shrinks position sizing for less-liquid / more-volatile assets. Higher
# tiers = tighter markets = larger allowable size.
BPS = Decimal('10000')

_TIER_EXEC = {
    'BTC':   {'priceQ': Decimal('0.01'),   'feeBps': Decimal('40'), 'spreadBps': Decimal('5'),  'slippageBps': Decimal('8'),  'liquidityScale': Decimal('1.00')},
    'LARGE': {'priceQ': Decimal('0.01'),   'feeBps': Decimal('40'), 'spreadBps': Decimal('8'),  'slippageBps': Decimal('12'), 'liquidityScale': Decimal('0.90')},
    'MID':   {'priceQ': Decimal('0.0001'), 'feeBps': Decimal('45'), 'spreadBps': Decimal('15'), 'slippageBps': Decimal('30'), 'liquidityScale': Decimal('0.65')},
    'SPEC':  {'priceQ': Decimal('0.00001'),'feeBps': Decimal('50'), 'spreadBps': Decimal('25'), 'slippageBps': Decimal('60'), 'liquidityScale': Decimal('0.40')},
}

# Per-symbol price-precision overrides (only where the tier default is too coarse).
_PRICE_Q_OVERRIDE = {
    'BTC': Decimal('0.01'), 'ETH': Decimal('0.01'), 'BNB': Decimal('0.01'), 'SOL': Decimal('0.001'),
    'LTC': Decimal('0.01'), 'AVAX': Decimal('0.001'), 'LINK': Decimal('0.001'), 'DOT': Decimal('0.001'),
    'XRP': Decimal('0.00001'), 'ADA': Decimal('0.00001'), 'DOGE': Decimal('0.000001'), 'TRX': Decimal('0.000001'),
}


def asset_profile(symbol, rank=None, tier=None, market=None, mark_price=None):
    """Paper-only fractional precision and disclosed cost assumptions.

    Venue fees/limits/permissions are NOT part of simulated eligibility. A fill
    still requires a real, fresh market mark supplied separately by the caller.
    """
    sym = (symbol or '').upper()
    tier = tier or cap_tier(sym, rank)
    prof = dict(_TIER_EXEC[tier])
    if sym in _PRICE_Q_OVERRIDE:
        prof['priceQ'] = _PRICE_Q_OVERRIDE[sym]
    observed = market or {}
    prof['simulationReady'] = bool(observed.get('simulationReady') or mark_price)
    prof['qtyQ'] = Decimal('0.000000000001')
    if observed.get('priceQ'):
        prof['priceQ'] = Decimal(str(observed['priceQ']))
    elif mark_price:
        mark = Decimal(str(mark_price))
        if mark.is_finite() and mark > 0:
            prof['priceQ'] = Decimal(1).scaleb(mark.adjusted() - 11)
    prof['costNature'] = 'PAPER_SIMULATION_ASSUMPTION'
    prof['providerTakerFeeBps'] = None
    prof['providerObservedSpreadBps'] = None
    prof['tier'] = tier
    prof['symbol'] = sym
    prof['model'] = 'conservative_%s' % tier.lower()
    return prof


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


def eligible_for_trading(symbol, *, rank=None, data_ok=True, excluded=None, approved=None,
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
