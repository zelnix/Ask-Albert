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

REGISTRY_VERSION = 'frozen-top50-simulation-v2'
# The ranking is frozen for candidate selection, not a live-trading allow-list.
# CoinGecko IDs bind prices/history to the intended asset. Source availability
# is transient; a paper strategy may Start on WAIT, but cannot fill without data.
FROZEN = json.loads(Path(__file__).with_name('frozen_coingecko_universe.json').read_text())
CANDIDATES = tuple(FROZEN['candidates'])
CANDIDATES_BY_SYMBOL = {r['symbol']: r for r in CANDIDATES}
CANDIDATES_BY_ID = {r['id']: r for r in CANDIDATES}
STUDIO_ASSETS = tuple(r['symbol'] for r in CANDIDATES)
# Unsolicited discovery remains intentionally small. A paper strategy's own
# selected symbols are added to canonical analysis at runtime, not globally.
ENGINE_DISCOVERY_ASSETS = ('BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'AVAX', 'DOGE',
                           'LINK', 'DOT', 'LTC', 'TRX')
# Read-only legacy alert hints; these are never simulated execution requirements.
DAILY_MARKET_PAIRS = {
    sym: [('kraken', f'{sym}/USD'), ('coinbase', f'{sym}/USD')]
    for sym in ('BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK', 'DOT', 'LTC',
                'MATIC', 'ATOM', 'BCH', 'XLM', 'ETC', 'UNI', 'AAVE', 'FIL', 'NEAR', 'APT')
}
ENTRY_ASSETS = frozenset(STUDIO_ASSETS)
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
    # Only explicit aliases: legacy MATIC positions are valued as current POL
    # without rewriting lots, allocations, or joining two historical series.
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
    canonical = known and sym != 'MATIC'  # selected symbols enter the same engine on demand
    data_route = known  # CoinGecko by frozen ID, public CCXT only as optional fallback
    if not known:
        reason = 'NOT_IN_FROZEN_UNIVERSE'
    elif sym == 'MATIC':
        reason = 'RENAMED_TO_POL_NEW_ENTRIES_REQUIRE_REVIEW'
    elif item.get('ambiguousTicker'):
        reason = 'AMBIGUOUS_ASSET_IDENTITY'
    elif sym in excluded:
        reason = 'EXCLUDED_BY_MANDATE'
    elif approved and sym not in approved:
        reason = 'NOT_IN_APPROVED_UNIVERSE'
    else:
        reason = None
    can_start = reason is None
    data_reason = 'MARKET_DATA_UNAVAILABLE' if data_availability in ('STALE', 'MISSING') else None
    return {
        'symbol': sym, 'assetId': item['id'] if item else None,
        'originalRank': item.get('rank') if item else None,
        'selectedBy': item.get('selectedBy', 'market_cap') if item else None,
        'legacySymbol': item.get('legacySymbol') if item else None,
        'expectedPairsUnverified': expected_pairs(sym) if item else [],
        'known': known,
        'verificationStatus': ('DATA_AVAILABLE' if data_availability == 'FRESH' and can_start else
                               'DATA_UNAVAILABLE' if data_reason else
                               'IMPLEMENTED_DATA_UNVERIFIED' if can_start else 'UNAVAILABLE'),
        'implemented': {'canonicalDecision': canonical, 'dailyScoringRoute': data_route,
                        'paperSimulation': known, 'idBoundPriceAndHistory': data_route},
        'entrySupported': can_start,  # not permission to BUY without live data/decision/risk
        'dataAvailability': data_availability,
        'mandateStatus': ('EXCLUDED' if sym in excluded else 'NOT_APPROVED' if approved and sym not in approved
                          else 'ALLOWED'),
        'startEligible': can_start,  # WAIT may Start; it cannot place a trade
        'entryEligible': can_start and data_availability == 'FRESH',
        'reasonCode': reason or data_reason,
        'missingCapability': data_reason,
        'needsImplementation': not known,
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
        if reason == 'RENAMED_TO_POL_NEW_ENTRIES_REQUIRE_REVIEW':
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
