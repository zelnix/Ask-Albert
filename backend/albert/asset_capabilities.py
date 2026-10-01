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
    """Code-path capability, distinct from observed availability and approved QA.

    These checks describe configured routes, not evidence of an end-to-end run.
    Generic multi-asset accounting is implemented for the frozen, unambiguous
    ID-bound asset; a ticker or top-50 ranking alone never grants paper support.
    """
    sym = str(symbol or '').strip().upper()
    m = mandate or {}
    approved = {str(x).upper() for x in (m.get('approved_coins') or [])}
    excluded = {str(x).upper() for x in (m.get('excluded_coins') or [])}
    item = candidate(sym)
    unique_id = bool(item and sym != 'MATIC' and item.get('symbol') == sym
                     and item.get('id') and not item.get('ambiguousTicker')
                     and sum(r.get('id') == item['id'] for r in CANDIDATES) == 1)
    # market_adapter.ticker/daily both resolve the pinned ID from CANDIDATES;
    # _daily_ohlcv feeds scoring through that same route (no ticker fallback).
    own_data = bool(unique_id and item['id'] in CANDIDATES_BY_ID)
    # decision.build_decisions(strategy_symbols=...) injects requested symbols;
    # scoring.score_asset uses deps.daily_ohlcv and its own asset price.
    decisions = bool(own_data and sym in ENTRY_ASSETS)
    # portfolio.compute_portfolio_equity + core.ticket_buy_sizing/ticket_sell_sizing
    # and atomic apply_buy_atomic/apply_sell_atomic use the same symbol's account lot.
    wallet = bool(decisions and sym in ENTRY_ASSETS)
    capabilities = {
        'uniqueAssetIdentity': {'implemented': unique_id, 'reasonCode': None if unique_id else 'NO_UNIQUE_ASSET_IDENTITY',
                                'reason': None if unique_id else (f'{sym} has no unique, unambiguous frozen asset identity.' if sym != 'MATIC' else 'MATIC was renamed; request POL explicitly for new paper entries.')},
        'ownPriceAndDailyHistory': {'implemented': own_data, 'reasonCode': None if own_data else 'OWN_PRICE_HISTORY_ROUTE_MISSING',
                                    'reason': None if own_data else f'Albert cannot obtain an ID-bound {sym} price and completed daily history.'},
        'entryAndExitDecisions': {'implemented': decisions, 'reasonCode': None if decisions else 'ENTRY_EXIT_DECISION_ROUTE_MISSING',
                                  'reason': None if decisions else f'Albert cannot yet evaluate entry and exit decisions for {sym}.'},
        'walletBuyHoldSell': {'implemented': wallet, 'reasonCode': None if wallet else 'WALLET_BUY_HOLD_SELL_MISSING',
                              'reason': None if wallet else f'Paper-wallet BUY, holding and SELL accounting is not implemented for {sym}.'},
    }
    missing = [{'capability': key, 'reasonCode': value['reasonCode'], 'reason': value['reason']}
               for key, value in capabilities.items() if not value['implemented']]
    implemented = not missing
    restriction = ('EXCLUDED_BY_MANDATE' if sym in excluded else
                   'NOT_IN_APPROVED_UNIVERSE' if approved and sym not in approved else None)
    restriction_reason = (f'{sym} is excluded by this wallet’s trading mandate.' if restriction == 'EXCLUDED_BY_MANDATE' else
                          f'{sym} is not in this wallet’s approved coin list.' if restriction else None)
    data_reason = ('STALE_OWN_DAILY_HISTORY_OR_PRICE' if data_availability == 'STALE' else
                   'OWN_DAILY_HISTORY_OR_PRICE_MISSING' if data_availability == 'MISSING' else None)
    state = ('UNSUPPORTED' if not implemented else
             'WAITING_FOR_DATA' if data_reason else 'SUPPORTED')
    return {
        'symbol': sym, 'assetId': item['id'] if item else None,
        'originalRank': item.get('rank') if item else None,
        'selectedBy': item.get('selectedBy', 'market_cap') if item else None,
        'legacySymbol': item.get('legacySymbol') if item else None,
        'expectedPairsUnverified': expected_pairs(sym) if item else [],
        'known': item is not None, 'capabilities': capabilities, 'missingCapabilities': missing,
        'implemented': {'canonicalDecision': decisions, 'dailyScoringRoute': own_data,
                        'paperSimulation': wallet, 'idBoundPriceAndHistory': own_data},
        'paperSupported': implemented, 'paperSupportVerified': False,
        'verificationStatus': 'NOT_END_TO_END_VERIFIED',
        'supportState': state, 'restrictionReason': restriction_reason,
        'mandateWarning': restriction_reason,
        'dataReason': (f'Waiting for current {sym} price or complete daily history; no quote or candle is substituted.' if data_reason else None),
        'entrySupported': implemented, 'dataAvailability': data_availability,
        'mandateStatus': ('EXCLUDED' if restriction == 'EXCLUDED_BY_MANDATE' else 'NOT_APPROVED' if restriction else 'ALLOWED'),
        'startEligible': implemented and not data_reason,
        'entryEligible': implemented and data_availability == 'FRESH',
        'reasonCode': (missing[0]['reasonCode'] if missing else data_reason),
        'reason': (missing[0]['reason'] if missing else
                   (f'Waiting for current {sym} price or complete daily history.' if data_reason else None)),
        'missingCapability': missing[0] if missing else None,
        'needsImplementation': not implemented,
    }


def entry_allowed(symbol, mandate=None, data_ok=None):
    """At execution, fail closed on missing live data; preserve exits separately."""
    status = 'UNVERIFIED' if data_ok is None else ('FRESH' if data_ok else 'MISSING')
    row = capability(symbol, mandate, status)
    return bool(row['entryEligible']), row


def validate_assets(draft, canonical_assets, mandate=None, reserve_pct=0.0):
    """Validate every raw leg and every canonical leg without discarding or reweighting.
    When a protected cash reserve is specified, asset weights + reservePct must equal 100%.
    Returns (errors, warnings) — mandate restrictions are warnings, not blocking errors."""
    errors = []
    warnings = []
    raw = draft.get('assets') or []
    if not isinstance(raw, list):
        return ['Assets must be a list.'], []
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
        if row['missingCapabilities']:
            errors.append(f'{sym}: Unsupported for paper trading. ' + ' '.join(x['reason'] for x in row['missingCapabilities']))
        elif row['mandateStatus'] != 'ALLOWED':
            warnings.append(f'{sym}: Outside current mandate ({row["restrictionReason"]}). Strategy settings will apply.')
        if not math.isfinite(a['weightPct']) or a['weightPct'] <= 0:
            errors.append(f'{sym} must have a finite, positive weight.')
    total = sum(a['weightPct'] for a in canonical_assets)
    try:
        rpct = float(reserve_pct or 0)
    except (ValueError, TypeError):
        rpct = 0.0
    expected = 100.0 - max(0.0, min(100.0, rpct))
    if canonical_assets and (not math.isfinite(total) or abs(total - expected) > 0.5):
        if rpct > 0:
            errors.append(f'Asset weights must sum to {expected:g}% (100% minus {rpct:g}% reserve); currently {total:g}%. No weights will be redistributed.')
        else:
            errors.append(f'Asset weights must sum to exactly 100% (currently {total:g}%). No weights will be redistributed.')
    return errors, warnings


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
