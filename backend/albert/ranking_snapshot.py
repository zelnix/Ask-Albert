"""Frozen CoinGecko candidate selection. Ranking is never trading permission.

Use the market-cap order/IDs *before* checking exchange availability. A frozen
snapshot is reviewed and committed as data; refreshing Discovery cannot enable a
new coin. Selection is pure so the snapshot can be reproduced and audited.
"""
import re

LEGACY_IDS = {
    'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana', 'XRP': 'ripple',
    'ADA': 'cardano', 'DOGE': 'dogecoin', 'AVAX': 'avalanche-2',
    'LINK': 'chainlink', 'DOT': 'polkadot', 'LTC': 'litecoin',
    'MATIC': 'polygon-ecosystem-token', 'ATOM': 'cosmos', 'NEAR': 'near',
    'FIL': 'filecoin', 'APT': 'aptos', 'ARB': 'arbitrum', 'OP': 'optimism',
    'INJ': 'injective-protocol', 'SUI': 'sui', 'TIA': 'celestia',
    'BNB': 'binancecoin', 'TRX': 'tron',
}
# MATIC is the historical contract/position label. POL is the renamed asset's
# current provider code. Never rewrite an old contract, lot or ledger entry.
CANONICAL_SYMBOL_BY_ID = {'polygon-ecosystem-token': 'POL'}
LEGACY_SYMBOL_BY_ID = {'polygon-ecosystem-token': 'MATIC'}
STABLE_SYMBOLS = {
    'USDC', 'USDT', 'DAI', 'USDE', 'USDS', 'USD1', 'FDUSD', 'TUSD', 'BUSD',
    'PYUSD', 'USDD', 'USDP', 'GHO', 'RLUSD', 'EURC', 'EURCV', 'EURS',
    'FRAX', 'LUSD', 'SUSD', 'CRVUSD', 'USD0', 'USDY', 'USDN', 'UUSD',
}
WRAPPED_SYMBOLS = {'WBTC', 'WETH', 'STETH', 'WSTETH', 'CBETH', 'WEETH',
                   'RETH', 'WBNB', 'WSOL', 'WAVAX', 'WMATIC', 'CBBTC',
                   'LBTC', 'EZETH', 'RSETH', 'WBETH', 'EETH', 'BNSOL'}


def exclusion_reason(row):
    """Classify intrinsic asset type, never based on provider support or liquidity."""
    sym = str(row.get('symbol') or '').upper()
    name = str(row.get('name') or '').lower()
    ident = str(row.get('id') or '').lower()
    if (sym in STABLE_SYMBOLS or sym.endswith('USD') or sym.startswith('USD')
            or ident in {'hashnote-usyc', 'blackrock-usd-institutional-digital-liquidity-fund',
                         'global-dollar', 'falcon-finance', 'united-stables', 'bfusd'}
            or re.search(r'\b(stablecoin|stable coin|dollar-pegged|usd peg|dollar)\b', name)
            or re.search(r'\busd\b', name)
            or ident in {'tether', 'usd-coin', 'ethena-usde', 'dai', 'usds', 'first-digital-usd'}):
        return 'STABLECOIN'
    if (sym in WRAPPED_SYMBOLS or re.search(r'\b(wrapped|staked|restaked|bridged|liquid staking)\b', name)
            or ident.startswith(('wrapped-', 'staked-', 'bridged-'))):
        return 'WRAPPED_OR_STAKED_DUPLICATE'
    if (re.search(r'\b(leveraged|inverse|[235]x long|[235]x short)\b', name)
            or re.search(r'\d+[LS]$', sym) or sym.endswith(('BULL', 'BEAR', 'DOWN'))):
        return 'LEVERAGED_TOKEN'
    return None


def select_candidates(rows, count=50):
    """Take first N qualifying distinct CoinGecko IDs in original cap rank order.

    Returns included rows + exclusions with original rank/id, then appends the
    original 22 by identity if outside that N. Symbols are not primary keys.
    Ambiguous ticker collisions remain candidates but must fail identity gating.
    """
    ordered = sorted((r for r in rows if r.get('id') and r.get('market_cap_rank')),
                     key=lambda r: (int(r['market_cap_rank']), str(r['id'])))
    chosen, skipped, ids = [], [], set()
    for r in ordered:
        if len(chosen) >= count:
            break
        ident = str(r['id']).lower()
        rank = int(r['market_cap_rank'])
        reason = exclusion_reason(r)
        item = {'id': ident, 'symbol': str(r.get('symbol') or '').upper(),
                'name': str(r.get('name') or ''), 'originalRank': rank}
        if reason:
            skipped.append({**item, 'excludedAs': reason})
        elif ident not in ids:
            chosen.append({**item, 'selectedBy': 'market_cap'})
            ids.add(ident)
    if len(chosen) < count:
        raise ValueError('CoinGecko ranking has fewer than 50 qualifying candidates; never fill from provider support')
    for old_sym, ident in LEGACY_IDS.items():
        if ident in ids:
            continue
        old_row = next((r for r in ordered if r['id'].lower() == ident), None)
        rank = int(old_row['market_cap_rank']) if old_row else None
        chosen.append({'id': ident, 'symbol': (old_row or {}).get('symbol', old_sym).upper(),
                       'name': (old_row or {}).get('name', old_sym), 'originalRank': rank,
                       'selectedBy': 'original_22', 'legacySymbol': old_sym})
        ids.add(ident)
    for item in chosen:
        ident = item['id']
        if ident in CANONICAL_SYMBOL_BY_ID:
            item['symbol'] = CANONICAL_SYMBOL_BY_ID[ident]
            item['legacySymbol'] = LEGACY_SYMBOL_BY_ID[ident]
        if ident in LEGACY_IDS.values() and not item.get('legacySymbol'):
            item['legacySymbol'] = next(s for s, value in LEGACY_IDS.items() if value == ident)
    by_symbol = {}
    for item in chosen:
        by_symbol.setdefault(item['symbol'], []).append(item['id'])
    for item in chosen:
        item['ambiguousTicker'] = len(by_symbol[item['symbol']]) != 1
        if item['originalRank'] is None:
            item['rankStatus'] = 'UNVERIFIED_OUTSIDE_FETCHED_RANKING'
    return {'candidates': chosen, 'excluded': skipped,
            'marketCapSelectedCount': count, 'totalCount': len(chosen)}
