"""ID-bound public prices and history for SIMULATION ONLY.

Prefer CoinGecko's frozen asset ID; use existing Kraken/Coinbase public prices and
candles only as fallback data sources. Venue listings, timestamps, order limits
and trading permissions never define whether a paper coin is supported.
"""
import datetime
import threading
import time
from decimal import Decimal, InvalidOperation

import ccxt

from albert import asset_capabilities as caps

PROVIDERS = ('kraken', 'coinbase')
DAY_MS = 86_400_000
MIN_SCORING_CANDLES = 200  # default canonical trend; other features declare own lookback
MARKET_CATALOG_TTL = 6 * 3600
PRICE_CACHE_TTL = 45  # retrieval-age limit for simulated fills
SOURCE_AGE_LIMIT = 15 * 60  # if a source supplies its own timestamp
HISTORY_CACHE_TTL = 2 * 3600

# Per-request scoped failure tracking instead of a blanket cooldown.
_cg_failures = {}  # key -> {'ts': float, 'code': str, 'detail': str, 'retry_after': float|None}
_CG_DEFAULT_RETRY = 60  # seconds between retries when no Retry-After header

# The server supplies its EXISTING CoinGecko HTTP client/URL. No new key or URL.
_coingecko_get = None
_cg_lock = threading.RLock()
_cg_prices = {'ts': 0, 'rows': {}}
_cg_histories = {}


def configure_coingecko(getter):
    global _coingecko_get
    _coingecko_get = getter


class MarketUnavailable(Exception):
    def __init__(self, code, detail, coverage=None, provider_failures=None):
        self.code, self.detail = code, detail
        self.coverage = coverage
        self.provider_failures = provider_failures or []
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


def _strategy_supply_positive(value):
    try:
        amount = Decimal(str(value))
        return amount.is_finite() and amount > 0
    except (InvalidOperation, TypeError, ValueError):
        return False


def simulation_precision(price):
    """Fractional-paper precision; not exchange tick/quantity rules."""
    value = _positive(price, 'simulated mark')
    return {'priceQ': str(Decimal(1).scaleb(value.adjusted() - 11)),
            'qtyQ': '0.000000000001', 'simulationReady': True,
            'nature': 'PAPER_SIMULATION_PRECISION'}


def _cg_failure_key(request_type, asset_id=None):
    return f'{request_type}:{asset_id or "all"}'


def _cg_is_blocked(request_type, asset_id=None):
    """Check whether a specific CoinGecko request type is currently in retry backoff."""
    key = _cg_failure_key(request_type, asset_id)
    entry = _cg_failures.get(key)
    if not entry:
        return False
    retry_at = entry['ts'] + (entry.get('retry_after') or _CG_DEFAULT_RETRY)
    if time.time() >= retry_at:
        _cg_failures.pop(key, None)
        return False
    return True


def _cg_record_failure(request_type, asset_id, code, detail, retry_after=None):
    """Record a scoped failure for a specific request type and asset."""
    key = _cg_failure_key(request_type, asset_id)
    _cg_failures[key] = {
        'ts': time.time(), 'code': code, 'detail': detail,
        'retry_after': retry_after, 'provider': 'coingecko',
        'asset': asset_id, 'request_type': request_type,
    }


def _cg_clear_failure(request_type, asset_id=None):
    """Clear scoped failure state on success."""
    key = _cg_failure_key(request_type, asset_id)
    _cg_failures.pop(key, None)


def _cg_fetch(path, params, request_type='quote', asset_id=None):
    if not _coingecko_get:
        raise MarketUnavailable('COINGECKO_NOT_CONFIGURED', 'No existing public CoinGecko client is attached',
                                provider_failures=[{'provider': 'coingecko', 'code': 'NOT_CONFIGURED',
                                                    'detail': 'No client attached', 'ts': time.time()}])
    if _cg_is_blocked(request_type, asset_id):
        entry = _cg_failures.get(_cg_failure_key(request_type, asset_id), {})
        raise MarketUnavailable(
            'COINGECKO_RETRY_PENDING',
            f"Retrying {request_type} for {asset_id or 'batch'} after earlier failure: {entry.get('detail', 'unknown')}",
            provider_failures=[{'provider': 'coingecko', 'code': entry.get('code', 'RETRY_PENDING'),
                                'detail': entry.get('detail', ''), 'ts': entry.get('ts'),
                                'request_type': request_type, 'asset': asset_id}])
    try:
        result = _coingecko_get(path, params)
    except Exception as exc:
        code = 'COINGECKO_TIMEOUT' if 'timeout' in str(exc).lower() or 'connect' in str(exc).lower() else 'COINGECKO_REQUEST_FAILED'
        _cg_record_failure(request_type, asset_id, code, type(exc).__name__)
        raise MarketUnavailable(code, f'{type(exc).__name__}: {exc}',
                                provider_failures=[{'provider': 'coingecko', 'code': code,
                                                    'detail': str(exc), 'ts': time.time(),
                                                    'request_type': request_type, 'asset': asset_id}]) from exc
    if result is None:
        _cg_record_failure(request_type, asset_id, 'COINGECKO_EMPTY_RESPONSE', 'No response body')
        raise MarketUnavailable('COINGECKO_EMPTY_RESPONSE', 'No public response',
                                provider_failures=[{'provider': 'coingecko', 'code': 'EMPTY_RESPONSE',
                                                    'detail': 'Null response', 'ts': time.time(),
                                                    'request_type': request_type, 'asset': asset_id}])
    _cg_clear_failure(request_type, asset_id)
    return result


def _cg_quote(item):
    now = time.time()
    with _cg_lock:
        if now - _cg_prices['ts'] >= PRICE_CACHE_TTL:
            params = {'vs_currency': 'usd', 'ids': ','.join(r['id'] for r in caps.CANDIDATES),
                      'per_page': len(caps.CANDIDATES), 'page': 1}
            response = _cg_fetch('/coins/markets', params, request_type='quote', asset_id='batch')
            if not isinstance(response, list):
                raise MarketUnavailable('COINGECKO_INVALID_RESPONSE', 'Expected an array of identified assets')
            _cg_prices['rows'] = {str(row.get('id')): row for row in response if isinstance(row, dict)}
            _cg_prices['ts'] = time.time()
        row = _cg_prices['rows'].get(item['id'])
        retrieved = _cg_prices['ts']
    if not row:
        raise MarketUnavailable('COINGECKO_PRICE_MISSING', f"No price for asset ID {item['id']}",
                                provider_failures=[{'provider': 'coingecko', 'code': 'PRICE_MISSING',
                                                    'detail': f"ID {item['id']} not in batch", 'ts': time.time(),
                                                    'asset': item['id']}])
    value = _positive(row.get('current_price'), 'CoinGecko current_price')
    reported = row.get('last_updated')
    observed_ms = None
    if reported:
        try:
            observed_ms = int(datetime.datetime.fromisoformat(str(reported).replace('Z', '+00:00')).timestamp() * 1000)
        except (ValueError, TypeError):
            reported = None
    if observed_ms is not None and (observed_ms > time.time() * 1000 + 60_000
                                    or time.time() * 1000 - observed_ms > SOURCE_AGE_LIMIT * 1000):
        raise MarketUnavailable('STALE_COINGECKO_PRICE', f"Asset {item['id']} reported update {reported}",
                                provider_failures=[{'provider': 'coingecko', 'code': 'STALE_PRICE',
                                                    'detail': f'last_updated={reported}', 'ts': time.time(),
                                                    'asset': item['id']}])
    if time.time() - retrieved > PRICE_CACHE_TTL:
        raise MarketUnavailable('STALE_RETRIEVAL', f"Asset {item['id']} quote cache expired",
                                provider_failures=[{'provider': 'coingecko', 'code': 'CACHE_EXPIRED',
                                                    'detail': f'age={time.time()-retrieved:.0f}s', 'ts': time.time(),
                                                    'asset': item['id']}])
    supply = {k: str(row[k]) if _strategy_supply_positive(row.get(k)) else None
              for k in ('circulating_supply', 'total_supply', 'max_supply')}
    change = row.get('price_change_percentage_24h')
    try:
        change_24h = str(Decimal(str(change))) if Decimal(str(change)).is_finite() else None
    except (InvalidOperation, TypeError, ValueError):
        change_24h = None
    return {'assetId': item['id'], 'asset': item['symbol'], 'price': str(value),
            'changePct24h': change_24h,
            'tokenomics': {'source': 'coingecko', 'assetId': item['id'],
                           'circulatingSupply': supply['circulating_supply'],
                           'totalSupply': supply['total_supply'], 'maxSupply': supply['max_supply'],
                           'asOf': reported if observed_ms is not None else None},
            'provider': 'coingecko', 'pair': None, 'marketId': None, 'marketBase': None,
            'quote': 'USD', 'receivedAt': datetime.datetime.fromtimestamp(retrieved, datetime.timezone.utc).isoformat(),
            'providerTimestamp': observed_ms, 'providerObservedAt': reported if observed_ms is not None else None,
            'timestampSource': 'provider' if observed_ms is not None else 'retrieval_only',
            'retrievalAgeSec': round(time.time() - retrieved, 3),
            'execution': simulation_precision(value)}


def _market(name, asset):
    item = caps.candidate(asset)
    if not item:
        raise MarketUnavailable('ASSET_ID_UNKNOWN', str(asset))
    if item.get('ambiguousTicker'):
        raise MarketUnavailable('AMBIGUOUS_TICKER', f"{item['symbol']} maps to multiple frozen asset IDs")
    ex = _exchange(name)
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
    return ex, m, item


def _cg_history(item, limit):
    now = time.time()
    cache_key = item['id']
    with _cg_lock:
        cached = _cg_histories.get(cache_key)
        if cached and now - cached['ts'] < HISTORY_CACHE_TTL and cached['requested'] >= limit:
            return cached['observation']
        days = min(365, max(int(limit) + 2, 32))
        result = _cg_fetch('/coins/' + item['id'] + '/market_chart',
                           {'vs_currency': 'usd', 'days': days},
                           request_type='history', asset_id=item['id'])
        if not isinstance(result, dict) or not isinstance(result.get('prices'), list):
            raise MarketUnavailable('COINGECKO_HISTORY_MISSING', f"No daily prices for {item['id']}",
                                    provider_failures=[{'provider': 'coingecko', 'code': 'HISTORY_MISSING',
                                                        'detail': f"Invalid response for {item['id']}", 'ts': now,
                                                        'asset': item['id'], 'request_type': 'history'}])
        today_start = int(now * 1000) // DAY_MS * DAY_MS
        observations = {}
        for point in result['prices']:
            if not isinstance(point, (list, tuple)) or len(point) < 2:
                continue
            try:
                ts = int(point[0]); price = _positive(point[1], 'daily sampled price')
            except (MarketUnavailable, ValueError, TypeError):
                continue
            if ts % DAY_MS == 0 and ts < today_start:
                observations[ts] = price
        volumes = {}
        for point in result.get('total_volumes') or []:
            if isinstance(point, (list, tuple)) and len(point) >= 2:
                try:
                    ts = int(point[0]); vol = Decimal(str(point[1]))
                    if ts % DAY_MS == 0 and vol.is_finite() and vol >= 0:
                        volumes[ts] = vol
                except (ValueError, TypeError, InvalidOperation):
                    continue
        bars = [[ts, None, None, None, float(observations[ts]),
                 float(volumes[ts]) if ts in volumes else None]
                for ts in sorted(observations)]
        if not bars:
            raise MarketUnavailable('COINGECKO_HISTORY_MISSING', f"No completed USD daily samples for {item['id']}",
                                    provider_failures=[{'provider': 'coingecko', 'code': 'HISTORY_EMPTY',
                                                        'detail': f"0 completed samples for {item['id']}", 'ts': now,
                                                        'asset': item['id'], 'request_type': 'history'}])
        bars = bars[-max(limit, 32):]
        report = history_coverage(bars, int(now * 1000))
        observation = {'assetId': item['id'], 'asset': item['symbol'], 'provider': 'coingecko',
                       'pair': None, 'marketId': None, 'bars': bars, 'coverage': report,
                       'volumeUnit': 'USD', 'priceType': 'DAILY_UTC_SAMPLE_NOT_OHLC',
                       'closedCount': len(bars), 'latestClosedTs': bars[-1][0]}
        _cg_histories[cache_key] = {'ts': time.time(), 'requested': limit, 'observation': observation}
        return observation


def ticker(asset):
    """Real ID-bound USD price for paper marks; no venue execution conditions.
    Try CoinGecko first, then fall back to Kraken/Coinbase."""
    item = caps.candidate(asset)
    if not item:
        raise MarketUnavailable('ASSET_ID_UNKNOWN', str(asset))
    failures = []
    try:
        obs = _cg_quote(item)
        return obs
    except MarketUnavailable as exc:
        failures.append({'provider': 'coingecko', 'code': exc.code, 'detail': exc.detail,
                         'ts': time.time(), 'asset': item['id']})
    # Fallback to exchange providers.
    for name in PROVIDERS:
        try:
            with _locks[name]:
                ex, listed, resolved_item = _market(name, asset)
                row = ex.fetch_ticker(listed['symbol'])
                received_ms = int(time.time() * 1000)
                value = _positive(row.get('last'), 'ticker.last')
                observed_ms = row.get('timestamp')
                if observed_ms is not None:
                    try:
                        observed_ms = int(observed_ms)
                        if observed_ms > received_ms + 60_000 or received_ms - observed_ms > SOURCE_AGE_LIMIT * 1000:
                            raise MarketUnavailable('STALE_PROVIDER_PRICE', f'{name} price event is too old')
                    except (ValueError, TypeError):
                        observed_ms = None
                # Preserve changePct24h from the exchange ticker when available.
                exchange_pct = row.get('percentage')
                try:
                    exchange_pct_str = str(Decimal(str(exchange_pct))) if exchange_pct is not None and Decimal(str(exchange_pct)).is_finite() else None
                except (InvalidOperation, TypeError, ValueError):
                    exchange_pct_str = None
                return {'assetId': resolved_item['id'], 'asset': str(asset).upper(), 'price': str(value),
                        'changePct24h': exchange_pct_str,
                        'tokenomics': None,  # Exchange does not supply tokenomics.
                        'provider': name, 'pair': listed['symbol'], 'marketId': listed['id'],
                        'marketBase': listed['base'], 'marketBaseId': listed.get('baseId'),
                        'quote': listed['quote'],
                        'receivedAt': datetime.datetime.fromtimestamp(received_ms / 1000,
                                                                      datetime.timezone.utc).isoformat(),
                        'providerTimestamp': observed_ms,
                        'providerObservedAt': (datetime.datetime.fromtimestamp(observed_ms / 1000,
                                                                               datetime.timezone.utc).isoformat()
                                               if observed_ms is not None else None),
                        'timestampSource': 'provider' if observed_ms is not None else 'retrieval_only',
                        'retrievalAgeSec': 0,
                        'execution': simulation_precision(value)}
        except (ccxt.BaseError, MarketUnavailable, KeyError, ValueError, TypeError) as exc:
            failures.append({'provider': name, 'code': exc.code if isinstance(exc, MarketUnavailable) else type(exc).__name__,
                             'detail': str(exc), 'ts': time.time(), 'asset': item['id']})
    raise MarketUnavailable('QUOTE_UNAVAILABLE', '; '.join(f"{f['provider']}: {f['detail']}" for f in failures),
                            provider_failures=failures)


def history_coverage(rows, received_ms):
    """Describe raw OHLCV coverage without claiming the series is scoreable."""
    closed = sorted({int(r[0]) for r in rows if isinstance(r, (list, tuple)) and len(r) >= 6
                     and r[0] is not None and int(r[0]) % DAY_MS == 0
                     and int(r[0]) + DAY_MS <= received_ms})
    window = closed[-MIN_SCORING_CANDLES:]
    gaps = [(a + DAY_MS, b - DAY_MS) for a, b in zip(window, window[1:]) if b - a != DAY_MS]
    year_window = closed[-365:]
    year_gaps = [(a + DAY_MS, b - DAY_MS) for a, b in zip(year_window, year_window[1:])
                  if b - a != DAY_MS]
    expected = received_ms // DAY_MS * DAY_MS - DAY_MS
    return {'rawRows': len(rows), 'closedUniqueDays': len(closed),
            'discardedOpenOrDuplicateRows': len(rows) - len(closed),
            'firstClosedUtcMs': closed[0] if closed else None,
            'lastClosedUtcMs': closed[-1] if closed else None,
            'expectedLastClosedUtcMs': expected,
            'missingIntervalsInFeatureWindow': gaps,
            'missingIntervalsInYearHighWindow': year_gaps,
            'lookbacksRequiredDays': {'sma50': 50, 'sma200': 200, 'rsi14': 15,
                                      'roc30': 31, 'realizedVolatility': 31,
                                      'usdLiquidity': 30, 'invalidationLow': 20,
                                      'yearHigh': 365},
            'yearHighCoverageMet': len(year_window) >= 365 and not year_gaps
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
    if not ordered:
        raise MarketUnavailable('DAILY_DATA_UNAVAILABLE', 'No completed valid daily candles')
    return ordered


def daily(asset, limit=400):
    """Real daily observations for the frozen ID; never synthesize missing bars.

    CoinGecko daily samples have no OHLC ranges and USD-volume units. Exchange
    OHLCV is only an optional public data fallback, not an eligibility test.
    """
    item = caps.candidate(asset)
    if not item:
        raise MarketUnavailable('ASSET_ID_UNKNOWN', str(asset))
    failures = []
    cg = None
    try:
        cg = _cg_history(item, limit)
        report = cg['coverage']
        if (len(cg['bars']) >= min(limit, MIN_SCORING_CANDLES)
                and not report['missingIntervalsInFeatureWindow']
                and report['lastClosedUtcMs'] == report['expectedLastClosedUtcMs']
                and all(b[5] is not None for b in cg['bars'][-30:])):
            return cg
    except MarketUnavailable as exc:
        failures.append({'provider': 'coingecko', 'code': exc.code, 'detail': exc.detail,
                         'ts': time.time(), 'asset': item['id'], 'request_type': 'history'})
    # Fallback to exchange OHLCV.
    for name in PROVIDERS:
        try:
            with _locks[name]:
                ex, listed, resolved_item = _market(name, asset)
                if not ex.has.get('fetchOHLCV'):
                    raise MarketUnavailable('OHLCV_NOT_SUPPORTED', name)
                now = int(time.time() * 1000)
                max_per = 720 if name == 'kraken' else 300
                requested = min(max(int(limit), 32), 720)
                since = (now // DAY_MS - requested - 2) * DAY_MS
                rows = []
                for _ in range(1 if name == 'kraken' else 3):
                    batch = ex.fetch_ohlcv(listed['symbol'], timeframe='1d', since=since,
                                           limit=min(max_per, requested + 2))
                    if not batch:
                        break
                    rows.extend(batch)
                    last_ts = max(int(b[0]) for b in batch if b and b[0] is not None)
                    if last_ts + DAY_MS >= now // DAY_MS * DAY_MS or len(rows) >= requested + 2:
                        break
                    next_since = last_ts + DAY_MS
                    if next_since <= since:
                        break
                    since = next_since
                bars = _valid_closed(rows, now)[-requested:]
                coverage = history_coverage(bars, now)
                if coverage['lastClosedUtcMs'] != coverage['expectedLastClosedUtcMs']:
                    raise MarketUnavailable('STALE_DAILY_HISTORY', f'{name} daily feed lacks latest closed date',
                                            coverage=coverage)
                return {'assetId': resolved_item['id'], 'asset': str(asset).upper(), 'provider': name,
                        'ccxtAdapter': f'ccxt.{name}', 'ccxtMethod': 'fetch_ohlcv',
                        'pair': listed['symbol'], 'marketId': listed['id'], 'bars': bars,
                        'coverage': coverage, 'volumeUnit': 'BASE', 'priceType': 'OHLCV',
                        'closedCount': len(bars), 'latestClosedTs': bars[-1][0]}
        except (ccxt.BaseError, MarketUnavailable, KeyError, ValueError, TypeError) as exc:
            failures.append({'provider': name, 'code': exc.code if isinstance(exc, MarketUnavailable) else type(exc).__name__,
                             'detail': str(exc), 'coverage': exc.coverage if isinstance(exc, MarketUnavailable) else None,
                             'ts': time.time(), 'asset': item['id'], 'request_type': 'history'})
    if cg:
        return cg  # partial history is reported to analysis, not padded or hidden
    raise MarketUnavailable('DAILY_DATA_UNAVAILABLE', '; '.join(f"{f['provider']}: {f['detail']}" for f in failures),
                            provider_failures=failures)
