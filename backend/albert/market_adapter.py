"""Frozen-CoinGecko-ID public prices and history for SIMULATION ONLY.

The paper engine uses only the ID-bound CoinGecko path. A Kraken/Coinbase USD
symbol is not proof of the same asset, so those read-only feeds are not a paper
price/history fallback. Missing data means WAIT until the next normal cycle;
existing holdings remain and exits still require a usable price.
"""
import datetime
import threading
import time
from decimal import Decimal, InvalidOperation

from albert import asset_capabilities as caps

DAY_MS = 86_400_000
MIN_SCORING_CANDLES = 200  # default canonical trend; other features declare own lookback
PRICE_CACHE_TTL = 45  # retrieval-age limit for simulated fills
SOURCE_AGE_LIMIT = 15 * 60  # if a source supplies its own timestamp
HISTORY_CACHE_TTL = 2 * 3600
_CG_BACKOFF_SECONDS = 60

# The server supplies its EXISTING CoinGecko HTTP client/URL. No new key or URL.
_coingecko_get = None
_cg_lock = threading.RLock()
_cg_prices = {'ts': 0, 'rows': {}}
_cg_histories = {}
_cg_backoff_until = 0


def configure_coingecko(getter):
    global _coingecko_get
    _coingecko_get = getter


class MarketUnavailable(Exception):
    def __init__(self, code, detail, coverage=None, provider_failures=None):
        self.code, self.detail = code, detail
        self.coverage = coverage
        self.provider_failures = provider_failures or []
        super().__init__(f'{code}: {detail}')


def _positive(value, label):
    try:
        result = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise MarketUnavailable('INVALID_MARKET_NUMBER', label)
    if not result.is_finite() or result <= 0:
        raise MarketUnavailable('INVALID_MARKET_NUMBER', label)
    return result


def simulation_precision(price):
    """Fractional-paper precision; not exchange tick/quantity rules."""
    value = _positive(price, 'simulated mark')
    return {'priceQ': str(Decimal(1).scaleb(value.adjusted() - 11)),
            'qtyQ': '0.000000000001', 'simulationReady': True,
            'nature': 'PAPER_SIMULATION_PRECISION'}


def _cg_fetch(path, params):
    global _cg_backoff_until
    if not _coingecko_get:
        raise MarketUnavailable('COINGECKO_NOT_CONFIGURED', 'No existing public CoinGecko client is attached')
    if time.time() < _cg_backoff_until:
        raise MarketUnavailable('COINGECKO_TEMPORARILY_UNAVAILABLE', 'Public data request in cooldown')
    try:
        result = _coingecko_get(path, params)
    except Exception as exc:
        _cg_backoff_until = time.time() + _CG_BACKOFF_SECONDS
        raise MarketUnavailable('COINGECKO_TEMPORARILY_UNAVAILABLE', type(exc).__name__) from exc
    if result is None:
        _cg_backoff_until = time.time() + _CG_BACKOFF_SECONDS
        raise MarketUnavailable('COINGECKO_TEMPORARILY_UNAVAILABLE', 'No public response; retry after cooldown')
    return result


def _cg_quote(item):
    now = time.time()
    with _cg_lock:
        if now - _cg_prices['ts'] >= PRICE_CACHE_TTL:
            params = {'vs_currency': 'usd', 'ids': ','.join(r['id'] for r in caps.CANDIDATES),
                      'per_page': len(caps.CANDIDATES), 'page': 1}
            response = _cg_fetch('/coins/markets', params)
            if not isinstance(response, list):
                raise MarketUnavailable('COINGECKO_INVALID_RESPONSE', 'Expected an array of identified assets')
            # Never match by symbol; only the pinned CoinGecko asset ID is valid.
            _cg_prices['rows'] = {str(row.get('id')): row for row in response if isinstance(row, dict)}
            _cg_prices['ts'] = time.time()
        row = _cg_prices['rows'].get(item['id'])
        retrieved = _cg_prices['ts']
    if not row:
        raise MarketUnavailable('COINGECKO_PRICE_MISSING', f"No price for asset ID {item['id']}")
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
        raise MarketUnavailable('STALE_COINGECKO_PRICE', f"Asset {item['id']} reported update {reported}")
    if time.time() - retrieved > PRICE_CACHE_TTL:
        raise MarketUnavailable('STALE_RETRIEVAL', f"Asset {item['id']} quote cache expired")
    return {'assetId': item['id'], 'asset': item['symbol'], 'price': str(value),
            'provider': 'coingecko', 'pair': None, 'marketId': None, 'marketBase': None,
            'quote': 'USD', 'receivedAt': datetime.datetime.fromtimestamp(retrieved, datetime.timezone.utc).isoformat(),
            'providerTimestamp': observed_ms, 'providerObservedAt': reported if observed_ms is not None else None,
            'timestampSource': 'provider' if observed_ms is not None else 'retrieval_only',
            'retrievalAgeSec': round(time.time() - retrieved, 3),
            'execution': simulation_precision(value)}


def _cg_history(item, limit):
    now = time.time()
    cache_key = item['id']
    with _cg_lock:
        cached = _cg_histories.get(cache_key)
        if cached and now - cached['ts'] < HISTORY_CACHE_TTL and cached['requested'] >= limit:
            return cached['observation']
        # Market-chart prices are daily observations, NOT fabricated OHLC bars.
        # Public history is capped by the existing source; do not pad gaps.
        days = min(365, max(int(limit) + 2, 32))
        result = _cg_fetch('/coins/' + item['id'] + '/market_chart',
                           {'vs_currency': 'usd', 'days': days})
        if not isinstance(result, dict) or not isinstance(result.get('prices'), list):
            raise MarketUnavailable('COINGECKO_HISTORY_MISSING', f"No daily prices for {item['id']}")
        today_start = int(now * 1000) // DAY_MS * DAY_MS
        observations = {}
        for point in result['prices']:
            if not isinstance(point, (list, tuple)) or len(point) < 2:
                continue
            try:
                ts = int(point[0]); price = _positive(point[1], 'daily sampled price')
            except (MarketUnavailable, ValueError, TypeError):
                continue
            # Only already-completed UTC dates; discard intraday/current points.
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
        # open/high/low are deliberately None: this source did not supply OHLC.
        bars = [[ts, None, None, None, float(observations[ts]),
                 float(volumes[ts]) if ts in volumes else None]
                for ts in sorted(observations)]
        if not bars:
            raise MarketUnavailable('COINGECKO_HISTORY_MISSING', f"No completed USD daily samples for {item['id']}")
        bars = bars[-max(limit, 32):]
        report = history_coverage(bars, int(now * 1000))
        observation = {'assetId': item['id'], 'asset': item['symbol'], 'provider': 'coingecko',
                       'pair': None, 'marketId': None, 'bars': bars, 'coverage': report,
                       'volumeUnit': 'USD', 'priceType': 'DAILY_UTC_SAMPLE_NOT_OHLC',
                       'closedCount': len(bars), 'latestClosedTs': bars[-1][0]}
        _cg_histories[cache_key] = {'ts': time.time(), 'requested': limit, 'observation': observation}
        return observation


def ticker(asset):
    """Only the frozen CoinGecko ID can supply a simulated paper mark."""
    item = caps.candidate(asset)
    if not item:
        raise MarketUnavailable('ASSET_ID_UNKNOWN', str(asset))
    return _cg_quote(item)



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
    # Coverage/feature lookbacks are assessed by the selected analysis, not by
    # the data connector. Never pad gaps or replace incomplete OHLC candles.
    return ordered


def daily(asset, limit=400):
    """ID-bound completed CoinGecko daily samples, including honest data gaps.

    The canonical scorer decides whether the actual observations satisfy its
    required lookback. A missing/short history stays unavailable, never padded
    with a same-ticker exchange series.
    """
    item = caps.candidate(asset)
    if not item:
        raise MarketUnavailable('ASSET_ID_UNKNOWN', str(asset))
    return _cg_history(item, limit)
