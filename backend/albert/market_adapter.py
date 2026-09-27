"""Public-only Kraken/Coinbase observations for frozen, ID-bound paper assets.

An exact active spot USD market, usable raw quote, precision/limits and closed
candles are separate checks. A market-cap rank is NEVER proof of any of them.
Only the second APPROVED provider may be tried, always for the same asset ID.
"""
import datetime
import math
import threading
import time
from decimal import Decimal, InvalidOperation

import ccxt

from albert import asset_capabilities as caps

PROVIDERS = ('kraken', 'coinbase')
DAY_MS = 86_400_000
MIN_SCORING_CANDLES = 365  # engine uses SMA200 and a 1-year high
MARKET_CATALOG_TTL = 6 * 3600
MAX_TICKER_AGE_MS = 60_000


class MarketUnavailable(Exception):
    def __init__(self, code, detail):
        self.code, self.detail = code, detail
        super().__init__(f'{code}: {detail}')


_exchanges = {}
_locks = {name: threading.RLock() for name in PROVIDERS}
_loaded_at = {}


def _exchange(name):
    if name not in PROVIDERS:
        raise MarketUnavailable('PROVIDER_NOT_APPROVED', str(name))
    ex = _exchanges.get(name)
    if ex is None:
        ex = getattr(ccxt, name)({'enableRateLimit': True, 'timeout': 15000})
        _exchanges[name] = ex
    if time.time() - _loaded_at.get(name, 0) > MARKET_CATALOG_TTL:
        ex.load_markets(reload=bool(_loaded_at.get(name)))
        _loaded_at[name] = time.time()
    return ex


def _positive(value, label):
    try:
        result = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise MarketUnavailable('INVALID_MARKET_NUMBER', label)
    if not result.is_finite() or result <= 0:
        raise MarketUnavailable('INVALID_MARKET_NUMBER', label)
    return result


def _tick(precision, precision_mode, ref):
    """CCXT precision is either a tick size, decimal places or significant digits."""
    if precision is None:
        raise MarketUnavailable('PRECISION_UNAVAILABLE', 'market lacks price/amount precision')
    if precision_mode == ccxt.TICK_SIZE:
        return _positive(precision, 'tick size')
    if precision_mode == ccxt.DECIMAL_PLACES:
        places = int(precision)
        if not 0 <= places <= 18:
            raise MarketUnavailable('PRECISION_UNAVAILABLE', 'unsupported decimal places')
        return Decimal(1).scaleb(-places)
    if precision_mode == ccxt.SIGNIFICANT_DIGITS:
        digits = int(precision)
        if not 1 <= digits <= 18:
            raise MarketUnavailable('PRECISION_UNAVAILABLE', 'unsupported significant digits')
        return Decimal(1).scaleb(ref.adjusted() - digits + 1)
    raise MarketUnavailable('PRECISION_UNAVAILABLE', 'unknown CCXT precision mode')


def _market(name, asset):
    item = caps.candidate(asset)
    if not item:
        raise MarketUnavailable('ASSET_ID_UNKNOWN', str(asset))
    if item.get('ambiguousTicker'):
        raise MarketUnavailable('AMBIGUOUS_TICKER', f"{item['symbol']} maps to multiple frozen asset IDs")
    ex = _exchange(name)
    # Trust the exchange's loaded metadata, NOT a guessed symbol or exchange ID.
    allowed = caps.provider_bases(item['symbol'])
    matched = [m for m in ex.markets.values()
               if m.get('spot') is True and m.get('active') is not False
               and str(m.get('quote') or '').upper() == 'USD'
               and str(m.get('base') or '').upper() in allowed and m.get('id')]
    if len(matched) != 1:
        code = 'NO_EXACT_SPOT_USD_PAIR' if not matched else 'AMBIGUOUS_PROVIDER_MARKET'
        raise MarketUnavailable(code, f"{name}: {item['id']} expected bases {sorted(allowed)}; found {len(matched)}")
    m = matched[0]
    if ex.markets.get(m['symbol']) is not m:
        raise MarketUnavailable('MARKET_IDENTITY_MISMATCH', f'{name}: market missing from catalog')
    if item['id'] in caps.VERIFIED_ASSET_IDS:
        provider = (caps.FROZEN['verification'][item['id']].get('providers') or {}).get(name)
        if not provider:
            raise MarketUnavailable('PROVIDER_NOT_ATTESTED', f'{name}: no verified {item["id"]} market')
        if (provider.get('marketId') != m['id'] or provider.get('pair') != m['symbol']
                or provider.get('base') != m.get('base')):
            raise MarketUnavailable('MARKET_ID_CHANGED', f'{name}: {item["id"]} pair/base/id changed')
    return ex, m, item


def _execution(m, ex, ref):
    price_q = _tick((m.get('precision') or {}).get('price'), ex.precisionMode, ref)
    amount_q = _tick((m.get('precision') or {}).get('amount'), ex.precisionMode, Decimal(1))
    limits = m.get('limits') or {}
    def _optional(field, key):
        v = (limits.get(field) or {}).get(key)
        if v is None:
            return None
        return str(_positive(v, f'{field}.{key}'))
    # Missing limits are not invented: core still enforces its own stricter
    # $10 minimum and profile risk ceilings; absent provider limits are reported.
    taker = m.get('taker')
    return {'priceQ': str(price_q), 'qtyQ': str(amount_q),
            'minAmount': _optional('amount', 'min'), 'maxAmount': _optional('amount', 'max'),
            'minCost': _optional('cost', 'min'), 'maxCost': _optional('cost', 'max'),
            'minPrice': _optional('price', 'min'), 'maxPrice': _optional('price', 'max'),
            'takerFeeBps': str(_positive(taker, 'taker fee') * 10000) if taker else None,
            'limitsVerified': bool(m.get('limits') and (m.get('limits').get('amount') or m.get('limits').get('cost')))}


def ticker(asset):
    """Fetch exactly one live observation from an approved provider, no fake price."""
    failures = []
    for name in PROVIDERS:
        try:
            with _locks[name]:
                ex, market, item = _market(name, asset)
                row = ex.fetch_ticker(market['symbol'])
                received_ms = int(time.time() * 1000)
                value = None
                source_ms = row.get('timestamp')
                provenance = 'ticker_event'
                if source_ms is not None and 0 <= received_ms - int(source_ms) <= MAX_TICKER_AGE_MS:
                    value = _positive(row.get('last'), 'ticker.last')
                else:
                    # Kraken ticker has no event time. Successful HTTP retrieval
                    # is NOT proof that its last price is fresh. Use a recent
                    # public trade's OWN timestamp and OWN price or fail closed.
                    if not ex.has.get('fetchTrades'):
                        raise MarketUnavailable('FRESHNESS_UNPROVEN', f'{name}: no ticker event time or public trades')
                    trades = ex.fetch_trades(market['symbol'], limit=10) or []
                    recent = [t for t in trades if t.get('timestamp') is not None and t.get('price') is not None
                              and 0 <= received_ms - int(t['timestamp']) <= MAX_TICKER_AGE_MS]
                    if not recent:
                        raise MarketUnavailable('FRESHNESS_UNPROVEN',
                                                f'{name}: ticker event={source_ms}, no trade within 60s')
                    latest = max(recent, key=lambda t: int(t['timestamp']))
                    source_ms = int(latest['timestamp'])
                    value = _positive(latest['price'], 'trade.price')
                    provenance = 'public_trade_event'
                settings = _execution(market, ex, value)
                if not settings['limitsVerified']:
                    raise MarketUnavailable('EXECUTION_LIMITS_UNVERIFIED', f'{name} market has no amount/cost limits')
                bid = row.get('bid'); ask = row.get('ask')
                if provenance == 'ticker_event' and bid is not None and ask is not None:
                    bid_d, ask_d = _positive(bid, 'bid'), _positive(ask, 'ask')
                    if ask_d < bid_d:
                        raise MarketUnavailable('INVALID_SPREAD', f'{name} ask below bid')
                    settings['observedSpreadBps'] = str((ask_d - bid_d) / value * 10000)
                return {'assetId': item['id'], 'asset': str(asset).upper(), 'price': str(value),
                        'provider': name, 'pair': market['symbol'], 'marketId': market['id'],
                        'marketBase': market['base'], 'marketBaseId': market.get('baseId'),
                        'quote': market['quote'],
                        'receivedAt': datetime.datetime.fromtimestamp(received_ms / 1000,
                                                                      datetime.timezone.utc).isoformat(),
                        'providerTimestamp': source_ms,
                        'providerObservedAt': datetime.datetime.fromtimestamp(source_ms / 1000,
                                                                              datetime.timezone.utc).isoformat(),
                        'timestampSource': provenance,
                        'execution': settings}
        except (ccxt.BaseError, MarketUnavailable, KeyError, ValueError, TypeError) as exc:
            failures.append(f'{name}: {exc}')
    raise MarketUnavailable('QUOTE_UNAVAILABLE', '; '.join(failures))



def history_coverage(rows, received_ms):
    """Describe raw OHLCV coverage without claiming the series is scoreable.

    No forward fill: each missing UTC interval is explicitly counted. Malformed
    values are checked separately by _valid_closed, not silently accepted.
    """
    closed = sorted({int(r[0]) for r in rows if isinstance(r, (list, tuple)) and len(r) >= 6
                     and r[0] is not None and int(r[0]) % DAY_MS == 0
                     and int(r[0]) + DAY_MS <= received_ms})
    window = closed[-MIN_SCORING_CANDLES:]
    gaps = [(a + DAY_MS, b - DAY_MS) for a, b in zip(window, window[1:]) if b - a != DAY_MS]
    expected = received_ms // DAY_MS * DAY_MS - DAY_MS
    return {'rawRows': len(rows), 'closedUniqueDays': len(closed),
            'discardedOpenOrDuplicateRows': len(rows) - len(closed),
            'firstClosedUtcMs': closed[0] if closed else None,
            'lastClosedUtcMs': closed[-1] if closed else None,
            'expectedLastClosedUtcMs': expected,
            'missingIntervalsInFeatureWindow': gaps,
            'lookbacksRequiredDays': {'sma50': 50, 'sma200': 200, 'rsi14': 15,
                                      'roc30': 31, 'realizedVolatility': 31,
                                      'usdLiquidity': 30, 'invalidationLow': 20,
                                      'yearHigh': 365, 'confidenceCompleteness': 365},
            'yearHighCoverageMet': len(window) >= 365 and not gaps
                                   and bool(closed and closed[-1] == expected)}



def _valid_closed(rows, received_ms):
    """Remove open candle and reject fabricated/nonfinite/malformed observations."""
    clean = {}
    for r in rows:
        if not isinstance(r, (list, tuple)) or len(r) < 6:
            continue
        ts = int(r[0])
        if ts % DAY_MS != 0 or ts + DAY_MS > received_ms:
            continue
        op, hi, lo, cl = (_positive(r[i], f'OHLC[{i}]') for i in (1, 2, 3, 4))
        if hi < max(op, cl) or lo > min(op, cl) or lo > hi:
            raise MarketUnavailable('MALFORMED_CANDLE', str(ts))
        vol = Decimal(str(r[5]))
        if not vol.is_finite() or vol < 0:
            raise MarketUnavailable('MALFORMED_CANDLE', 'invalid volume')
        clean[ts] = [ts, float(op), float(hi), float(lo), float(cl), float(vol)]
    ordered = [clean[k] for k in sorted(clean)]
    report = history_coverage(rows, received_ms)
    if len(ordered) < MIN_SCORING_CANDLES:
        raise MarketUnavailable('INSUFFICIENT_YEAR_HIGH_LOOKBACK',
                                f"{len(ordered)} closed days, yearHigh/confidence need 365; "
                                f"missing intervals: {report['missingIntervalsInFeatureWindow'][:5]}")
    gaps = report['missingIntervalsInFeatureWindow']
    if gaps:
        raise MarketUnavailable('GAPPED_DAILY_HISTORY',
                                f'{len(ordered)} closed; {len(gaps)} missing intervals in yearHigh lookback; '
                                f'first gaps (UTC ms): {gaps[:5]}')
    if ordered[-1][0] != report['expectedLastClosedUtcMs']:
        raise MarketUnavailable('STALE_DAILY_HISTORY',
                                f"latest closed UTC start {ordered[-1][0]}; expected {report['expectedLastClosedUtcMs']}")
    return ordered


def daily(asset, limit=400):
    """Closed 1d bars for the exact same asset, paginated where necessary.

    Kraken caps history at 720, Coinbase at 300 per request. Fail closed if a
    partial window lacks 365 consecutive UTC days; never pad or forward-fill.
    """
    failures = []
    for name in PROVIDERS:
        try:
            with _locks[name]:
                ex, market, item = _market(name, asset)
                if not ex.has.get('fetchOHLCV'):
                    raise MarketUnavailable('OHLCV_NOT_SUPPORTED', name)
                now = int(time.time() * 1000)
                max_per = 720 if name == 'kraken' else 300
                requested = min(max(int(limit), MIN_SCORING_CANDLES), 720)
                # Explicit UTC millisecond cursor; overlap and dedupe later.
                since = (now // DAY_MS - requested - 2) * DAY_MS
                rows = []
                for _ in range(1 if name == 'kraken' else 3):
                    batch = ex.fetch_ohlcv(market['symbol'], timeframe='1d', since=since,
                                           limit=min(max_per, requested + 2))
                    if not batch:
                        break
                    rows.extend(batch)
                    last_ts = max(int(b[0]) for b in batch if b and b[0] is not None)
                    if last_ts + DAY_MS >= now // DAY_MS * DAY_MS or len(rows) >= requested + 2:
                        break
                    new_since = last_ts + DAY_MS
                    if new_since <= since:
                        break
                    since = new_since
                coverage = history_coverage(rows, now)
                bars = _valid_closed(rows, now)[-requested:]
                return {'assetId': item['id'], 'asset': str(asset).upper(), 'provider': name,
                        'ccxtAdapter': f'ccxt.{name}', 'ccxtMethod': 'fetch_ohlcv',
                        'pair': market['symbol'], 'marketId': market['id'], 'bars': bars,
                        'coverage': coverage, 'closedCount': len(bars), 'latestClosedTs': bars[-1][0]}
        except (ccxt.BaseError, MarketUnavailable, KeyError, ValueError, TypeError) as exc:
            failures.append(f'{name}: {exc}')
    raise MarketUnavailable('DAILY_DATA_UNAVAILABLE', '; '.join(failures))
