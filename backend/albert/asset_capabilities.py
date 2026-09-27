"""Authoritative capability and validation rules for Strategy Studio paper entries.

Research/alerts and generic price tickers are NOT proof that the canonical decision
engine can open a position. Historical positions may still be reduced even after
entry eligibility is lost. Provider availability is a separate, transient fact:
absence of a live probe is UNVERIFIED, never treated as permanent support/failure.
"""
import math
import re
import json
from pathlib import Path

from albert.ranking_snapshot import LEGACY_IDS

REGISTRY_VERSION = 'frozen-top50-plus22-v1'
# Frozen ranking is data, not an authorization switch. Only verifiedAssetIds,
# added AFTER per-coin provider + execution + synthetic journey verification,
# may extend the canonical discovery/entry universe. Live rank changes do not.
FROZEN = json.loads(Path(__file__).with_name('frozen_coingecko_universe.json').read_text())
CANDIDATES = tuple(FROZEN['candidates'])
CANDIDATES_BY_SYMBOL = {r['symbol']: r for r in CANDIDATES}
CANDIDATES_BY_ID = {r['id']: r for r in CANDIDATES}
STUDIO_ASSETS = tuple(r['symbol'] for r in CANDIDATES)
REQUIRED_CHECKS = ('marketIdentity', 'freshQuote', 'closedDailyHistory', 'ownAssetScoring',
                   'canonicalDecisions', 'executionPrecision', 'feesSpreadSlippageRisk',
                   'draftValidateSaveStart', 'reviewAndAutopilot', 'exitsAndAccounting', 'backtest')
_ATTESTED = FROZEN.get('verification') or {}
# Adding a ticker or ID to the final registration list ALONE is insufficient.
VERIFIED_ASSET_IDS = frozenset(
    ident for ident in (FROZEN.get('verifiedAssetIds') or [])
    if ident in CANDIDATES_BY_ID and _ATTESTED.get(ident, {}).get('status') == 'VERIFIED'
    and all(_ATTESTED[ident].get('checks', {}).get(key) is True for key in REQUIRED_CHECKS)
    and _ATTESTED[ident].get('execution', {}).get('limitsVerified') is True
    and bool(_ATTESTED[ident].get('providers'))
    and all(p.get('coinGeckoId') == ident and p.get('identitySource') == 'coingecko_coin_tickers'
            and p.get('marketId') and p.get('pair') and p.get('base')
            for p in _ATTESTED[ident]['providers'].values())
)
VERIFIED_ASSETS = tuple(r['symbol'] for r in CANDIDATES if r['id'] in VERIFIED_ASSET_IDS)
# Existing historical holdings still receive canonical evaluation. This does not
# independently authorize a NEW entry; all BUY gates use VERIFIED_ASSETS.
ENGINE_DISCOVERY_ASSETS = tuple(dict.fromkeys((
    'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'AVAX', 'DOGE', 'LINK', 'DOT', 'LTC', 'TRX',
    *VERIFIED_ASSETS)))
# Research/alert pairs are expected hints only, not proof of an active market.
DAILY_MARKET_PAIRS = {
    sym: [('kraken', f'{sym}/USD'), ('coinbase', f'{sym}/USD')]
    for sym in ('BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK', 'DOT', 'LTC',
                'MATIC', 'ATOM', 'BCH', 'XLM', 'ETC', 'UNI', 'AAVE', 'FIL', 'NEAR', 'APT')
}
ENTRY_ASSETS = frozenset(VERIFIED_ASSETS)
MAX_STRATEGY_LEGS = 8


def candidate(symbol):
    sym = str(symbol or '').upper().strip()
    if sym == 'MATIC':
        return CANDIDATES_BY_ID.get(LEGACY_IDS['MATIC'])
    return CANDIDATES_BY_SYMBOL.get(sym)


def provider_bases(symbol):
    """Exact identity aliases only. Never infer a provider base from a ticker."""
    item = candidate(symbol)
    if not item:
        return set()
    # A renamed provider base such as TON for GRAM is accepted ONLY after
    # per-provider ID evidence has been recorded and the asset fully registered.
    if item['id'] in VERIFIED_ASSET_IDS:
        attested = (FROZEN['verification'][item['id']].get('providers') or {}).values()
        return {str(p['base']).upper() for p in attested if p.get('base')}
    return {'POL'} if item['id'] == 'polygon-ecosystem-token' else {item['symbol']}


def expected_pairs(symbol):
    """Unverified test hints; market_adapter resolves real IDs from load_markets."""
    return [f'{base}/USD' for base in sorted(provider_bases(symbol))]


def capability(symbol, mandate=None, data_availability='UNVERIFIED'):
    sym = str(symbol or '').strip().upper()
    m = mandate or {}
    approved = {str(x).upper() for x in (m.get('approved_coins') or [])}
    excluded = {str(x).upper() for x in (m.get('excluded_coins') or [])}
    item = candidate(sym)
    known = item is not None
    canonical = sym in ENGINE_DISCOVERY_ASSETS  # generic authoritative engine
    daily = known  # ID-bound closed-candle adapter implemented for every candidate
    registered = bool(item and item['id'] in VERIFIED_ASSET_IDS and sym != 'MATIC')
    evidence = (FROZEN.get('verification') or {}).get(item['id'], {}) if item else {}
    verification = ('VERIFIED_SUPPORTED' if registered else 'BLOCKED' if evidence.get('status') == 'BLOCKED'
                    else 'IMPLEMENTED_UNVERIFIED' if known else 'NOT_SELECTED')
    if not known:
        reason = 'NOT_IN_FROZEN_UNIVERSE'
    elif sym == 'MATIC':
        reason = 'RENAMED_TO_POL_NEW_ENTRIES_REQUIRE_REVIEW'
    elif item.get('ambiguousTicker'):
        reason = 'AMBIGUOUS_ASSET_IDENTITY'
    elif evidence.get('status') == 'BLOCKED':
        reason = evidence.get('reasonCode') or 'PROVIDER_CAPABILITY_BLOCKED'
    elif not registered:
        reason = 'ENTRY_PATH_UNVERIFIED'
    elif not canonical:
        reason = 'NO_CANONICAL_ENTRY_DECISION'
    elif sym in excluded:
        reason = 'EXCLUDED_BY_MANDATE'
    elif approved and sym not in approved:
        reason = 'NOT_IN_APPROVED_UNIVERSE'
    elif data_availability in ('STALE', 'MISSING'):
        reason = 'MARKET_DATA_UNAVAILABLE'
    else:
        reason = None
    return {
        'symbol': sym, 'assetId': item['id'] if item else None,
        'originalRank': item.get('rank') if item else None,
        'selectedBy': item.get('selectedBy', 'market_cap') if item else None,
        'legacySymbol': item.get('legacySymbol') if item else None,
        'expectedPairsUnverified': expected_pairs(sym) if item else [],
        'known': known, 'verificationStatus': verification,
        'implemented': {'canonicalDecision': canonical, 'dailyScoringRoute': daily,
                        'paperExecutionProfile': known, 'idBoundSpotAndBacktestFetcher': known},
        'entrySupported': registered and canonical,
        'dataAvailability': data_availability,  # FRESH/STALE/MISSING/UNVERIFIED
        'mandateStatus': ('EXCLUDED' if sym in excluded else 'NOT_APPROVED' if approved and sym not in approved
                          else 'ALLOWED'),
        'startEligible': bool(registered and canonical and sym not in excluded and
                              (not approved or sym in approved)),
        'entryEligible': reason is None and data_availability == 'FRESH',
        'reasonCode': reason,
        'missingCapability': evidence.get('detail'),
        'needsImplementation': evidence.get('status') == 'BLOCKED',
    }


def entry_allowed(symbol, mandate=None, data_ok=None):
    """At execution, fail closed on missing live data; preserve exits separately."""
    status = 'UNVERIFIED' if data_ok is None else ('FRESH' if data_ok else 'MISSING')
    row = capability(symbol, mandate, status)
    return bool(row['entryEligible']), row


def validate_assets(draft, canonical_assets, mandate=None):
    """Validate every raw leg and every canonical leg without discarding or reweighting."""
    errors = []
    raw = draft.get('assets') or []
    if not isinstance(raw, list):
        return ['Assets must be a list.']
    if not raw:
        errors.append('At least one asset is required.')
    if len(raw) > MAX_STRATEGY_LEGS:
        errors.append(f'Too many assets ({len(raw)}); the limit is {MAX_STRATEGY_LEGS}.')
    if len(raw) != len(canonical_assets):
        errors.append('Every asset row needs a symbol; no leg may be omitted.')
    seen = set()
    seen_ids = set()
    for a in canonical_assets:
        sym = a['symbol']
        if sym in seen:
            errors.append(f'{sym} is listed more than once; allocations cannot be merged.')
        seen.add(sym)
        row = capability(sym, mandate)
        if row['assetId'] and row['assetId'] in seen_ids:
            errors.append(f'{sym} duplicates the same underlying asset identity; allocations cannot be merged.')
        seen_ids.add(row['assetId'])
        reason = row['reasonCode']
        if reason == 'ENTRY_PATH_UNVERIFIED':
            errors.append(f'{sym} cannot start: its provider-to-paper entry path has not completed verification.')
        elif reason == 'RENAMED_TO_POL_NEW_ENTRIES_REQUIRE_REVIEW':
            errors.append('MATIC is now POL. Existing MATIC holdings and exits remain; request POL explicitly for a new strategy.')
        elif reason == 'NO_CANONICAL_ENTRY_DECISION':
            errors.append(f'{sym} cannot start: the decision engine does not evaluate new entries for it.')
        elif reason == 'EXCLUDED_BY_MANDATE':
            errors.append(f'{sym} is on your mandate excluded list.')
        elif reason == 'NOT_IN_APPROVED_UNIVERSE':
            errors.append(f'{sym} is not in your mandate approved list.')
        elif reason:
            errors.append(f'{sym} is not a supported strategy entry asset.')
        if not math.isfinite(a['weightPct']) or a['weightPct'] <= 0:
            errors.append(f'{sym} must have a finite, positive weight.')
    total = sum(a['weightPct'] for a in canonical_assets)
    if canonical_assets and (not math.isfinite(total) or abs(total - 100.0) > 0.0001):
        errors.append(f'Asset weights must sum to exactly 100% (currently {total:g}%). No weights will be redistributed.')
    return errors


# A user naming a coin has not consented to a replacement. Prefer definite
# tickers ($TOKEN or uppercase symbols); also recognise unambiguous full names.
COIN_NAMES = {'BITCOIN': 'BTC', 'ETHEREUM': 'ETH', 'SOLANA': 'SOL', 'RIPPLE': 'XRP',
              'CARDANO': 'ADA', 'DOGECOIN': 'DOGE', 'AVALANCHE': 'AVAX',
              'CHAINLINK': 'LINK', 'POLKADOT': 'DOT', 'LITECOIN': 'LTC',
              'POLYGON': 'MATIC', 'COSMOS': 'ATOM', 'FILECOIN': 'FIL',
              'APTOS': 'APT', 'ARBITRUM': 'ARB', 'OPTIMISM': 'OP',
              'INJECTIVE': 'INJ', 'CELESTIA': 'TIA', 'BINANCE COIN': 'BNB',
              'TRON': 'TRX'}
# Long, distinct frozen CoinGecko names complement ticker detection. Never infer
# an asset from an arbitrary ticker that is absent from the frozen snapshot.
for _item in CANDIDATES:
    _name = re.sub(r'\s*\([^)]*\)', '', _item['name']).upper().strip()
    if len(_name) >= 4 and _name not in {'RAIN', 'SKY', 'GRAM', 'PEPE'}:
        COIN_NAMES.setdefault(_name, _item['symbol'])


def goal_constraints(goal):
    """Conservative extraction of explicit coins/weights; unparseable prose stays
    subject to human review, never automatically triggers a substitution."""
    text = str(goal or '')
    found = []
    hits = []
    # Scan independently: consuming preceding prose must never swallow a ticker.
    for match in re.finditer(r'\$[A-Za-z][A-Za-z0-9_]{0,13}\b|\b[A-Z][A-Z0-9_]{0,13}\b', text):
        raw = match.group().lstrip('$').upper()
        if raw in STUDIO_ASSETS or raw == 'MATIC' or match.group().startswith('$'):
            hits.append((match.start(), raw))
    for name, sym in COIN_NAMES.items():
        for match in re.finditer(r'\b' + re.escape(name) + r'\b', text, re.I):
            hits.append((match.start(), sym))
    for _pos, sym in sorted(hits):
        if sym not in found:
            found.append(sym)
    weights = {}
    for sym in found:
        match = re.search(r'\b' + re.escape(sym) + r'\s*(?:at\s*)?(\d+(?:\.\d+)?)\s*%', text, re.I)
        if not match:
            match = re.search(r'(\d+(?:\.\d+)?)\s*%\s*(?:in|of)?\s*\b' + re.escape(sym) + r'\b', text, re.I)
        if match:
            weights[sym] = float(match.group(1))
    grouped = re.search(r'\bweighted\s+((?:\d+(?:\.\d+)?\s*/\s*)+\d+(?:\.\d+)?)\b', text, re.I)
    if grouped and len(found) > 1:
        values = [float(v.strip()) for v in grouped.group(1).split('/')]
        if len(values) == len(found):
            weights.update(zip(found, values))
    return found, weights


def explicit_request_errors(goal, draft):
    """A Gemini response cannot drop, insert, or resize explicitly requested legs."""
    requested, weights = goal_constraints(goal)
    actual = [str(a.get('symbol') or a.get('asset') or '').strip().upper()
              for a in (draft.get('assets') or []) if isinstance(a, dict)]
    errors = []
    if requested and (set(actual) != set(requested) or len(actual) != len(requested)):
        errors.append('Your requested assets must be kept exactly (' + ', '.join(requested)
                      + '). No substitutions or added legs without your agreement.')
    for sym, weight in weights.items():
        matches = [a for a in (draft.get('assets') or [])
                   if isinstance(a, dict) and str(a.get('symbol') or a.get('asset') or '').upper() == sym]
        try:
            if len(matches) != 1 or abs(float(matches[0].get('weightPct')) - weight) > 0.0001:
                errors.append(f'Your requested {sym} weight is {weight:g}%; changing it requires your agreement.')
        except (ValueError, TypeError):
            errors.append(f'Your requested {sym} weight is {weight:g}%; changing it requires your agreement.')
    return errors
