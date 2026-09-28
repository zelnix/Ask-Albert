"""Deterministic market regime (BULL / RANGE / BEAR).

Exact port of server.py `_albert_regime` (Phase C). Uses BTC vs its 200-day
trend + 30-day slope + sector breadth, with hysteresis (a change must be seen
twice before it is adopted). No behaviour change.
"""
from albert import deps


def compute_regime():
    """Deterministic BULL/RANGE/BEAR from BTC vs its 200d trend + 50d slope + breadth."""
    try:
        df = deps.daily_ohlcv('BTC', 260)
        close = df['close'].astype(float)
        price = float(close.iloc[-1])
        sma200 = float(close.rolling(200).mean().iloc[-1])
        sma50 = float(close.rolling(50).mean().iloc[-1])  # noqa: F841 (retained for parity)
        slope = float(close.iloc[-1] - close.iloc[-30]) / max(1e-9, float(close.iloc[-30]))
    except Exception:  # noqa
        return {'regime': 'RANGE', 'confidence': 30,
                'reasons': ['Insufficient BTC data \u2014 defaulting to RANGE. This is not an observed market regime.'],
                'btc_price': None, 'sma200': None, 'dataFallback': True,
                'failureDetail': 'Daily BTC history unavailable for regime computation'}
    try:
        strengths = deps.sector_strength() or {}
        vals = list(strengths.values())
        breadth = (sum(1 for v in vals if (v or 0) > 0) / len(vals) * 100) if vals else 50
    except Exception:  # noqa
        breadth = 50
    above = price > sma200
    reasons = []
    if above and slope > 0.02 and breadth >= 55:
        regime = 'BULL'
        reasons = ['BTC $%s is above its 200-day ($%s)' % (format(price, ',.0f'), format(sma200, ',.0f')),
                   '30-day trend rising (%+.1f%%)' % (slope * 100), 'breadth healthy (%.0f%% sectors positive)' % breadth]
    elif (not above) and slope < -0.02 and breadth <= 45:
        regime = 'BEAR'
        reasons = ['BTC $%s is below its 200-day ($%s)' % (format(price, ',.0f'), format(sma200, ',.0f')),
                   '30-day trend falling (%+.1f%%)' % (slope * 100), 'breadth weak (%.0f%% sectors positive)' % breadth]
    else:
        regime = 'RANGE'
        reasons = ['BTC %s its 200-day but momentum/breadth mixed' % ('above' if above else 'below'),
                   '30-day trend %+.1f%%, breadth %.0f%%' % (slope * 100, breadth)]
    # hysteresis: keep prior regime unless the new one has been seen twice
    conf = int(min(95, 45 + abs(slope) * 400 + abs(breadth - 50)))
    try:
        prev = deps.regime_col.find_one({'_id': 'albert_regime'}) or {}
        if prev.get('pending') == regime:
            deps.regime_col.update_one({'_id': 'albert_regime'}, {'$set': {'regime': regime, 'pending': regime}}, upsert=True)
        elif prev.get('regime') and prev.get('regime') != regime:
            deps.regime_col.update_one({'_id': 'albert_regime'}, {'$set': {'pending': regime}}, upsert=True)
            regime = prev.get('regime')  # hold until confirmed twice
            reasons.append('(regime change pending confirmation \u2014 holding prior regime)')
        else:
            deps.regime_col.update_one({'_id': 'albert_regime'}, {'$set': {'regime': regime, 'pending': regime}}, upsert=True)
    except Exception:  # noqa
        pass
    return {'regime': regime, 'confidence': conf, 'reasons': reasons, 'btc_price': price, 'sma200': sma200}
