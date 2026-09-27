"""Candidate historical-analogue v2: immutable-history, purged, era-evaluated.

This module deliberately does NOT replace v1 by import. The server publishes a v2
range only after an independently persisted, same-hash walk-forward report passes
its calibration and provenance gates. All inputs are dated CLOSED daily candles.
"""
from datetime import date
import hashlib
import json
import math
import statistics

from . import scenario as v1
from . import history

MODEL_VERSION = 'historical-analog-scenario-v2'
EVALUATION_VERSION = 'scenario-walk-forward-v2-eras-2026-01'
HISTORY_POLICY_VERSION = history.POLICY_VERSION
MAX_DISTANCE = 3.0  # fixed normalized v1 feature distance; NOT fitted to this history
MIN_MATCHED_DAYS = 40
MIN_INDEPENDENT_EPISODES = 20
MIN_EVAL_POINTS = 60
MIN_SLICE_POINTS = 20
EVAL_STRIDE = 14
WEIGHTING_HALF_LIFE_DAYS = 1095  # comparison ONLY, not used by published v2

# Fixed REPORTING partitions. Era labels never appear in features, matches or weights.
ERAS = (
    ('early_market', '2013-01-01', '2016-12-31'),
    ('2017_cycle', '2017-01-01', '2017-12-31'),
    ('2018_2020', '2018-01-01', '2020-12-31'),
    ('2021_cycle', '2021-01-01', '2021-12-31'),
    ('2022_contraction', '2022-01-01', '2022-12-31'),
    ('recent_market', '2023-01-01', '9999-12-31'),
)


def evaluation_key(asset, horizon, data_hash):
    return 'eval:%s:%s:%s:%s:%s:%s' % (
        MODEL_VERSION, EVALUATION_VERSION, HISTORY_POLICY_VERSION, asset, horizon,
        data_hash)


def _ordinal_dates(dates):
    return [date.fromisoformat(str(d)[:10]).toordinal() for d in dates]


def _pctl_weighted(values, weights, percentile):
    """Alternative policy for OFFLINE paired evaluation, never an untested live input."""
    pairs = sorted(zip(values, weights))
    total = sum(w for _v, w in pairs)
    target = total * percentile / 100.0
    acc = 0.0
    for value, weight in pairs:
        acc += weight
        if acc >= target:
            return value
    return pairs[-1][0]


def build(*, closes, dates, horizon, snapshot_id, data_hash,
          cutoff=None, features_cache=None, ordinals=None):
    """Use ONLY features and completed forward outcomes strictly before the query.

    `cutoff` is the simulated present in an evaluation; values after cutoff are never
    inspected for a match, scaling, weighting or candidate eligibility. Calendar-day
    gaps are not interpolated into a false N-day outcome.
    """
    if not closes or len(closes) != len(dates) or len(closes) < v1.WARMUP + horizon + MIN_MATCHED_DAYS:
        return {'ok': False, 'reason': 'INSUFFICIENT_HISTORY'}
    if not snapshot_id or not data_hash:
        return {'ok': False, 'reason': 'HISTORY_PROVENANCE_MISSING'}
    qi = cutoff if cutoff is not None else len(closes) - 1
    if qi < v1.WARMUP + horizon + MIN_MATCHED_DAYS or qi >= len(closes):
        return {'ok': False, 'reason': 'INSUFFICIENT_HISTORY'}
    day_ordinals = ordinals if ordinals is not None else _ordinal_dates(dates)

    def fingerprint(index):
        return features_cache[index] if features_cache is not None else v1.features_at(closes, index)

    query = fingerprint(qi)
    if not query:
        return {'ok': False, 'reason': 'INSUFFICIENT_HISTORY'}
    eligible = []
    rejected_distance = 0
    rejected_gap = 0
    # range end is exclusive. Candidate forward windows end BEFORE qi; no
    # self-match, shared outcome window or access to the query's future.
    for i in range(v1.WARMUP, qi - horizon):
        if day_ordinals[i + horizon] - day_ordinals[i] != horizon:
            rejected_gap += 1
            continue
        fp = fingerprint(i)
        if not fp:
            continue
        distance = v1._distance(query, fp)
        if distance is None:
            continue
        if distance > MAX_DISTANCE:
            rejected_distance += 1
            continue
        eligible.append((distance, i))
    if len(eligible) < MIN_MATCHED_DAYS:
        return {'ok': False, 'reason': 'INSUFFICIENT_COMPARABLE_SAMPLE',
                'candidatePool': len(eligible), 'rejectedByDistance': rejected_distance,
                'rejectedByCalendarGap': rejected_gap}
    # Similarity decides first. Only effectively equal distances (rounded to 1e-6)
    # use the more recent observation as a deterministic tie-breaker.
    eligible.sort(key=lambda pair: (round(pair[0], 6), -pair[1]))
    selected = []
    scanned = 0
    min_scan = max(MIN_MATCHED_DAYS, int(len(eligible) * v1.TOP_FRACTION))
    for distance, i in eligible:
        scanned += 1
        if all(abs(i - prev_i) > horizon for _prev_d, prev_i in selected):
            selected.append((distance, i))
        if scanned >= min_scan and len(selected) >= MIN_INDEPENDENT_EPISODES:
            break
    if len(selected) < MIN_INDEPENDENT_EPISODES:
        return {'ok': False, 'reason': 'INSUFFICIENT_INDEPENDENT_EPISODES',
                'matchedDays': scanned, 'independentEpisodes': len(selected),
                'candidatePool': len(eligible), 'rejectedByDistance': rejected_distance}
    paths = v1._forward_paths(closes, selected, horizon)
    if len(paths) < MIN_INDEPENDENT_EPISODES:
        return {'ok': False, 'reason': 'INSUFFICIENT_INDEPENDENT_EPISODES'}
    out = {'bullish': [], 'median': [], 'bearish': []}
    for h in range(horizon):
        vals = sorted(p[h] for p in paths)
        for label, pct in (('bullish', v1.BULL_PCTL), ('median', v1.MID_PCTL),
                           ('bearish', v1.BEAR_PCTL)):
            out[label].append(v1._pctl(vals, pct))
    sims = [1 / (1 + d) for d, _i in selected]
    age_weights = [2 ** (-(qi - i) / WEIGHTING_HALF_LIFE_DAYS) for _d, i in selected]
    weighted_end = {label: _pctl_weighted([p[-1] for p in paths], age_weights, pct)
                    for label, pct in (('bullish', v1.BULL_PCTL),
                                       ('median', v1.MID_PCTL), ('bearish', v1.BEAR_PCTL))}
    return {
        'ok': True, 'modelVersion': MODEL_VERSION,
        'evaluationVersion': EVALUATION_VERSION,
        'historyPolicyVersion': HISTORY_POLICY_VERSION,
        'historySnapshotId': snapshot_id, 'historyDataHash': data_hash,
        'horizonDays': horizon, 'anchorPrice': float(closes[qi]),
        'anchorDate': dates[qi], 'sampleSize': len(selected),
        'matchedDays': scanned, 'independentEpisodes': len(selected),
        'candidatePool': len(eligible), 'rejectedByDistance': rejected_distance,
        'rejectedByCalendarGap': rejected_gap, 'maximumDistance': MAX_DISTANCE,
        'recencyPolicy': 'no weighting; tie-break only if normalized distances match to 1e-6',
        'sampleLimitations': [
            '%d matched days are not independent observations; %d non-overlapping '
            'episodes form this range.' % (scanned, len(selected)),
            'A fixed distance threshold rejected %d weak matches.' % rejected_distance,
            'Historical scenarios are descriptive ranges, not forecasts or probabilities.',
        ],
        'similarity': {'best': round(max(sims), 4), 'worstUsed': round(min(sims), 4),
                       'median': round(statistics.median(sims), 4)},
        'matchedDates': [dates[i] for _d, i in selected[:8]],
        'maxCandidateEndIndex': max(i + horizon for _d, i in selected),
        'returnPaths': out, 'weightedEndpointsForOfflineComparison': weighted_end,
        'endpoints': {label + 'Pct': round(path[-1] * 100, 2)
                      for label, path in out.items()},
        'percentiles': {'bullish': v1.BULL_PCTL, 'median': v1.MID_PCTL,
                        'bearish': v1.BEAR_PCTL},
        'features': [name for name, _scale, _weight in v1.FEATURES],
    }


def _metrics(points):
    if len(points) < MIN_SLICE_POINTS:
        return {'status': 'INSUFFICIENT_EVALUATION_POINTS',
                'evaluationPoints': len(points), 'minimumRequired': MIN_SLICE_POINTS}
    coverage = sum(p['covered'] for p in points) / len(points)
    mae = statistics.median(p['error'] for p in points)
    baseline = statistics.median(p['baselineError'] for p in points)
    regimes = {}
    for label in ('up', 'down', 'flat'):
        subset = [p for p in points if p['regime'] == label]
        regimes[label] = {'points': len(subset),
                          'coverageRate': round(sum(p['covered'] for p in subset) /
                                                len(subset), 4) if subset else None}
    return {'status': 'READY', 'evaluationPoints': len(points),
            'intervalCoverageRate': round(coverage, 4),
            'intervalCoverageTarget': (v1.BULL_PCTL - v1.BEAR_PCTL) / 100,
            'medianAbsErrorPct': round(mae * 100, 3),
            'baselineMedianAbsErrorPct': round(baseline * 100, 3),
            'skillVsNoChange': round(1 - mae / baseline, 4) if baseline > 0 else None,
            'medianIntervalWidthPct': round(statistics.median(p['width'] for p in points) * 100, 3),
            'regimeCoverage': regimes,
            'firstEvaluatedAt': points[0]['date'], 'lastEvaluatedAt': points[-1]['date']}


def evaluate(*, closes, dates, horizon, snapshot_id, data_hash, stride=EVAL_STRIDE):
    """Leak-free, paired aggregate + fixed-era evaluation and offline weighting study."""
    if not closes or len(closes) != len(dates) or len(closes) < 2 * v1.WARMUP + horizon:
        return {'ok': False, 'reason': 'INSUFFICIENT_HISTORY_FOR_EVALUATION'}
    ordinals = _ordinal_dates(dates)
    features = [v1.features_at(closes, i) for i in range(len(closes))]
    points, v1_common, weighted_points = [], [], []
    last = len(closes) - horizon - 1
    for qi in range(v1.WARMUP + MIN_MATCHED_DAYS + horizon, last + 1, stride):
        if ordinals[qi + horizon] - ordinals[qi] != horizon:
            continue
        built = build(closes=closes, dates=dates, horizon=horizon,
                      snapshot_id=snapshot_id, data_hash=data_hash, cutoff=qi,
                      features_cache=features, ordinals=ordinals)
        if not built.get('ok'):
            continue
        if built['maxCandidateEndIndex'] >= qi:
            raise AssertionError('Look-ahead candidate detected')
        actual = closes[qi + horizon] / closes[qi] - 1
        lower, upper = built['returnPaths']['bearish'][-1], built['returnPaths']['bullish'][-1]
        median = built['returnPaths']['median'][-1]
        mom20 = closes[qi] / closes[qi - 20] - 1
        regime = 'up' if mom20 > .05 else ('down' if mom20 < -.05 else 'flat')
        point = {'date': dates[qi], 'queryIndex': qi,
                 'latestCandidateOutcomeIndex': built['maxCandidateEndIndex'],
                 'covered': lower <= actual <= upper, 'error': abs(median - actual),
                 'baselineError': abs(actual), 'width': upper - lower,
                 'regime': regime}
        points.append(point)
        alt = built['weightedEndpointsForOfflineComparison']
        weighted_points.append({**point,
                                'covered': alt['bearish'] <= actual <= alt['bullish'],
                                'error': abs(alt['median'] - actual),
                                'width': alt['bullish'] - alt['bearish']})
        old = v1.build(closes=closes, dates=dates, horizon=horizon, cutoff=qi)
        if old.get('ok'):
            old_lo = old['returnPaths']['bearish'][-1]
            old_hi = old['returnPaths']['bullish'][-1]
            v1_common.append((point, {'date': dates[qi], 'covered': old_lo <= actual <= old_hi,
                                      'error': abs(old['returnPaths']['median'][-1] - actual),
                                      'baselineError': abs(actual), 'width': old_hi - old_lo,
                                      'regime': regime}))
    aggregate = _metrics(points)
    slices = {}
    for label, first, last_day in ERAS:
        slices[label] = {'from': first, 'through': last_day,
                         **_metrics([p for p in points if first <= p['date'] <= last_day])}
    common_v2 = _metrics([a for a, _b in v1_common])
    common_v1 = _metrics([b for _a, b in v1_common])
    weighted = _metrics(weighted_points)
    return {
        'ok': aggregate['status'] == 'READY' and len(points) >= MIN_EVAL_POINTS,
        'reason': None if len(points) >= MIN_EVAL_POINTS else 'INSUFFICIENT_EVALUATION_POINTS',
        'modelVersion': MODEL_VERSION, 'evaluationVersion': EVALUATION_VERSION,
        'historyPolicyVersion': HISTORY_POLICY_VERSION,
        'historySnapshotId': snapshot_id, 'historyDataHash': data_hash,
        'method': ('Chronological purged walk-forward on exact frozen daily history; '
                   'each candidate outcome ended before the query day. Era labels '
                   'only partition scores AFTER evaluation; never model inputs.'),
        **aggregate, 'eraSlices': slices, 'evaluationStride': stride,
        'pairedV1': {'commonPoints': len(v1_common),
                     'commonDatesHash': hashlib.sha256(json.dumps(
                         [a['date'] for a, _b in v1_common],
                         separators=(',', ':')).encode()).hexdigest(),
                     'v1': common_v1, 'v2': common_v2},
        'candidateWeightingComparison': {'method': 'exponential 1095-day half-life',
                                         'usedForPublishedBand': False,
                                         'unweighted': aggregate,
                                         'candidateWeighted': weighted,
                                         'policy': 'keep unweighted unless separately versioned and calibrated'},
        'leakCheck': {'checkedPoints': len(points),
                      'allCandidateOutcomesBeforeQuery': all(
                          p['latestCandidateOutcomeIndex'] < p['queryIndex'] for p in points),
                      'firstQuery': points[0]['date'] if points else None,
                      'lastQuery': points[-1]['date'] if points else None},
    }
