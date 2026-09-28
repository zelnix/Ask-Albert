"""Transparent 0-100 opportunity score + confidence.

Exact port of server.py `_score_asset` / `_rsi` (Phase C). No behaviour change.
Data is fetched via the injected `albert.deps.daily_ohlcv` / `deps.spot_price`.
"""
import numpy as np

from albert import deps
from albert.market_adapter import MIN_SCORING_CANDLES

# Canonical trend requires its real 200-day average. The 365-day high is
# optional analysis: if absent, disclose it and award ZERO valuation points.
# Neither a shorter high nor a different trend period is ever substituted.
FEATURE_LOOKBACKS = {'sma50': 50, 'sma200': 200, 'rsi14': 15,
                     'roc30': 31, 'realizedVolatility': 31,
                     'usdLiquidity': 30, 'invalidationLow': 20,
                     'yearHigh': 365}


def rsi(series, n=14):
    d = series.diff()
    up = d.clip(lower=0).rolling(n).mean()
    dn = (-d.clip(upper=0)).rolling(n).mean()
    rs = up / dn.replace(0, np.nan)
    return (100 - 100 / (1 + rs))


def score_asset(symbol, regime):
    """Transparent 0-100 opportunity score with retained components. Returns an
    `ok: False` dict on stale/insufficient data so the caller can force WAIT."""
    df = deps.daily_ohlcv(symbol, 400)
    if df is None:
        return {'ok': False, 'reason': 'missing_or_stale_closed_daily_history',
                'failureCode': 'HISTORY_UNAVAILABLE', 'failureCategory': 'data',
                'failureDetail': f'{symbol} daily history could not be retrieved from any configured provider',
                'failureProvider': df.attrs.get('provider') if df is not None else None,
                'requiredByFeature': FEATURE_LOOKBACKS,
                'currentPrice': deps.spot_price(symbol) or None}
    coverage = df.attrs.get('coverage') or {}
    if coverage.get('lastClosedUtcMs') is not None and (coverage.get('lastClosedUtcMs')
            != coverage.get('expectedLastClosedUtcMs')):
        return {'ok': False, 'reason': 'stale_daily_history',
                'failureCode': 'STALE_HISTORY', 'failureCategory': 'data',
                'failureDetail': f'{symbol} daily history is stale (last closed date does not match expected)',
                'failureProvider': df.attrs.get('provider'),
                'availableClosedDays': len(df), 'requiredByFeature': FEATURE_LOOKBACKS}
    if coverage.get('missingIntervalsInFeatureWindow'):
        return {'ok': False, 'reason': 'gapped_required_history',
                'failureCode': 'GAPPED_HISTORY', 'failureCategory': 'data',
                'failureDetail': f'{symbol} daily history has gaps in the required feature window',
                'failureProvider': df.attrs.get('provider'),
                'missingIntervals': coverage['missingIntervalsInFeatureWindow'][:8],
                'requiredByFeature': FEATURE_LOOKBACKS}
    if len(df) < MIN_SCORING_CANDLES:
        return {'ok': False, 'reason': 'insufficient_feature_lookback',
                'failureCode': 'INSUFFICIENT_LOOKBACK', 'failureCategory': 'data',
                'failureDetail': f'{symbol} has {len(df)} daily candles but {MIN_SCORING_CANDLES} are required',
                'failureProvider': df.attrs.get('provider'),
                'availableClosedDays': len(df),
                'missingFeatureLookbacks': {k: n for k, n in FEATURE_LOOKBACKS.items()
                                            if k != 'yearHigh' and len(df) < n},
                'requiredByFeature': FEATURE_LOOKBACKS}
    close = df['close'].astype(float)
    vol = df['volume'].astype(float)
    price = float(close.iloc[-1])
    sma50 = float(close.rolling(50).mean().iloc[-1])
    sma200 = float(close.rolling(200).mean().iloc[-1])
    rsi_raw = rsi(close).iloc[-1]
    rsi_v = float(rsi_raw) if np.isfinite(rsi_raw) else (100.0 if close.iloc[-1] > close.iloc[-15] else 50.0)
    roc30 = (price - float(close.iloc[-31])) / float(close.iloc[-31]) * 100
    year_high_available = (len(close) >= 365 and
                           not coverage.get('missingIntervalsInYearHighWindow'))
    hi1y = float(close.tail(365).max()) if year_high_available else None
    dd = (price - hi1y) / hi1y * 100 if hi1y else None
    ret = close.pct_change().dropna()
    realized_vol = float(ret.tail(30).std() * (365 ** 0.5) * 100)
    avg_usd_vol = (float(vol.tail(30).mean()) if df.attrs.get('volumeUnit') == 'USD'
                   else float((vol.tail(30) * close.tail(30)).mean()))
    required_values = (price, sma50, sma200, rsi_v, roc30, realized_vol, avg_usd_vol)
    if not all(np.isfinite(x) for x in required_values) or avg_usd_vol <= 0:
        return {'ok': False, 'reason': 'invalid_own_asset_price_or_liquidity',
                'currentPrice': None}

    # Components (each capped to its weight)
    trend = 0.0
    if price > sma50:
        trend += 13
    if price > sma200:
        trend += 12
    trend = min(25.0, trend)
    momentum = max(0.0, min(15.0, 7.5 + roc30 / 4.0))
    if rsi_v > 78:
        momentum = min(momentum, 8.0)  # overextended penalty
    valuation = max(0.0, min(15.0, (-dd) / 4.0)) if dd is not None else 0.0  # unavailable: no invented high
    volatility = max(0.0, min(10.0, 10.0 - abs(realized_vol - 60.0) / 12.0))
    liquidity = min(10.0, (avg_usd_vol / 5e7) * 10.0)
    if regime == 'BULL':
        regime_fit = 15.0 if price > sma200 else 7.0
    elif regime == 'BEAR':
        regime_fit = 4.0 if price < sma200 else 8.0
    else:
        regime_fit = 9.0
    comps = {'trend': round(trend, 1), 'momentum': round(momentum, 1), 'valuation': round(valuation, 1),
             'volatility': round(volatility, 1), 'liquidity': round(liquidity, 1),
             'regimeFit': round(regime_fit, 1), 'portfolioFit': 10.0}  # portfolioFit finalised later
    score = sum(comps.values())
    # confidence from data completeness + liquidity + signal agreement
    completeness = min(1.0, len(close) / 365.0)
    agree = 1.0 if (trend >= 13 and momentum >= 7.5) or (trend < 13 and momentum < 7.5) else 0.6
    confidence = int(min(96, 40 + completeness * 30 + (liquidity / 10) * 20 + agree * 10))
    invalidation = float(min(float(close.tail(20).min()), sma50) * 0.98)  # keep sub-cent tokens' precision
    reasons = []
    if price > sma200:
        reasons.append('above the 200-day trend')
    else:
        reasons.append('below the 200-day trend')
    reasons.append('RSI %.0f' % rsi_v + (' (overbought)' if rsi_v > 70 else ' (oversold)' if rsi_v < 30 else ''))
    if dd is not None:
        reasons.append('%.0f%% from 1y high' % dd)
    else:
        reasons.append('1y high unavailable: 365 actual daily observations required; valuation points withheld')
    return {'ok': True, 'symbol': symbol, 'currentPrice': price, 'score': round(score, 1), 'components': comps,
            'confidence': confidence, 'invalidation': invalidation, 'realized_vol': round(realized_vol, 1),
            'rsi': round(rsi_v, 1), 'reasons': reasons,
            'unavailableIndicators': ['yearHigh'] if dd is None else [],
            'requiredByFeature': FEATURE_LOOKBACKS, 'observedDays': len(close),
            'sourcePriceType': df.attrs.get('priceType', 'OHLCV')}
