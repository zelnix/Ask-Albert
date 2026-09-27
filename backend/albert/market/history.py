"""Versioned, immutable daily crypto history for the scenario provider.

Yahoo is an existing best-effort source. A provider outage or malformed refresh never
replaces a previously accepted snapshot. Missing days are measured, never invented.
The model consumes only the dated close observations frozen in a snapshot.
"""
from datetime import datetime, timezone
import hashlib
import json
import math

POLICY_VERSION = 'scenario-history-policy-v3'  # v2 used an incorrect volume × close proxy
MIN_OBSERVATIONS = 180
MIN_COVERAGE = 0.97
MAX_MISSING_DAYS = 3
LIQUIDITY_DAYS = 30
MIN_LIQUID_DAYS = 24
MIN_REPORTED_NOTIONAL_USD = 1_000_000  # Yahoo reports BTC-USD quote volume in USD
EARLIEST_PERMITTED = {'BTC': '2013-01-01', 'ETH': '2015-01-01'}
FULL_COMPARE_DAYS = 7


def _day(value):
    if isinstance(value, datetime):
        return value.date().isoformat()
    return str(value or '')[:10]


def _number(value):
    try:
        v = float(value)
        return v if math.isfinite(v) else None
    except (ValueError, TypeError):
        return None


def canonicalize(asset, ticker, raw, *, now=None, requested_range='max'):
    """Return a valid canonical snapshot or an explicit rejection, without interpolation.

    Duplicate dates with conflicting closes are excluded, not resolved by input order.
    For non-BTC/ETH assets, require sustained Yahoo-reported USD quote volume;
    this is a provider-level liquidity proxy, not verified exchange-wide depth.
    """
    now = now or datetime.now(timezone.utc)
    today = now.date().isoformat()
    earliest = EARLIEST_PERMITTED.get(asset)
    dates = {}
    conflicting = set()
    duplicate_count = invalid_count = early_count = forming_count = 0
    for item in raw or []:
        day = _day(item.get('date')) if isinstance(item, dict) else ''
        if not day or len(day) != 10:
            invalid_count += 1
            continue
        try:
            datetime.fromisoformat(day)
        except ValueError:
            invalid_count += 1
            continue
        if day >= today:
            forming_count += 1
            continue
        if earliest and day < earliest:
            early_count += 1
            continue
        close = _number(item.get('close'))
        if close is None or close <= 0:
            invalid_count += 1
            continue
        volume = _number(item.get('volume'))
        volume = volume if volume is not None and volume >= 0 else None
        if day in dates:
            duplicate_count += 1
            if dates[day]['close'] != close:
                conflicting.add(day)
                continue
            # Identical duplicate closes do not change the canonical observation.
            if dates[day]['volume'] is None and volume is not None:
                dates[day]['volume'] = volume
            continue
        dates[day] = {'date': day, 'close': close, 'volume': volume}
    for day in conflicting:
        dates.pop(day, None)
    rows = [dates[d] for d in sorted(dates)]
    excluded = []
    if early_count:
        excluded.append({'reason': 'BEFORE_TRUSTWORTHY_START', 'count': early_count,
                         'before': earliest})
    if invalid_count or conflicting:
        excluded.append({'reason': 'INVALID_OR_CONFLICTING_OBSERVATION',
                         'count': invalid_count + len(conflicting)})
    if forming_count:
        excluded.append({'reason': 'OPEN_DAILY_CANDLE', 'count': forming_count})

    if asset not in EARLIEST_PERMITTED:
        # Require 30 consecutive reported dates with at least 24 days clearing an
        # explicitly declared notional-volume floor; do not backfill pre-liquid years.
        start = None
        for i in range(max(0, len(rows) - LIQUIDITY_DAYS + 1)):
            window = rows[i:i + LIQUIDITY_DAYS]
            if len(window) < LIQUIDITY_DAYS:
                break
            span = (datetime.fromisoformat(window[-1]['date'])
                    - datetime.fromisoformat(window[0]['date'])).days + 1
            liquid = sum(1 for r in window if r['volume'] is not None
                         and r['volume'] >= MIN_REPORTED_NOTIONAL_USD)
            if span <= LIQUIDITY_DAYS + MAX_MISSING_DAYS and liquid >= MIN_LIQUID_DAYS:
                start = i
                break
        if start is None:
            return {'ok': False, 'reason': 'LIQUIDITY_UNVERIFIED',
                    'detail': 'No sustained liquid daily period is supported by reported volume.'}
        if start:
            excluded.append({'reason': 'BEFORE_SUSTAINED_LIQUIDITY',
                             'firstUsableDate': rows[start]['date'], 'count': start})
        rows = rows[start:]

    # Crypto trades every day. If a provider omitted a long interval, keep only the
    # latest contiguous segment so an analogue never crosses an unexplained gap.
    last_break = 0
    for i in range(1, len(rows)):
        missing = (datetime.fromisoformat(rows[i]['date'])
                   - datetime.fromisoformat(rows[i - 1]['date'])).days - 1
        if missing > MAX_MISSING_DAYS:
            excluded.append({'reason': 'UNEXPLAINED_GAP',
                             'from': rows[i - 1]['date'], 'to': rows[i]['date'],
                             'missingDays': missing})
            last_break = i
    if last_break:
        rows = rows[last_break:]
    if len(rows) < MIN_OBSERVATIONS:
        return {'ok': False, 'reason': 'INSUFFICIENT_HISTORY',
                'detail': 'Fewer than %d trustworthy closed daily observations.' % MIN_OBSERVATIONS}
    calendar_days = (datetime.fromisoformat(rows[-1]['date'])
                     - datetime.fromisoformat(rows[0]['date'])).days + 1
    coverage = len(rows) / calendar_days
    max_gap = max(((datetime.fromisoformat(rows[i]['date'])
                    - datetime.fromisoformat(rows[i - 1]['date'])).days - 1)
                   for i in range(1, len(rows)))
    if coverage < MIN_COVERAGE or max_gap > MAX_MISSING_DAYS:
        return {'ok': False, 'reason': 'HISTORY_COVERAGE_INSUFFICIENT',
                'detail': 'Daily coverage or missing-day gap exceeds the declared policy.'}
    canonical = [{'date': r['date'], 'close': r['close']} for r in rows]
    data_hash = hashlib.sha256(json.dumps(canonical, sort_keys=True,
                                           separators=(',', ':'), allow_nan=False)
                               .encode('utf-8')).hexdigest()
    snapshot_id = 'hist_' + hashlib.sha256(
        ('%s|%s|%s' % (POLICY_VERSION, asset, data_hash)).encode('utf-8')).hexdigest()[:24]
    return {'ok': True, '_id': snapshot_id, 'snapshotId': snapshot_id,
            'assetId': asset, 'provider': 'Yahoo Finance', 'providerSymbol': ticker,
            'requestedRange': requested_range, 'earliestPermittedDate': earliest,
            'policyVersion': POLICY_VERSION, 'dataHash': data_hash,
            'sourceRevision': 'as-retrieved (provider does not publish a revision ID)',
            'retrievedAt': now.isoformat(), 'firstDate': rows[0]['date'],
            'lastDate': rows[-1]['date'], 'observationCount': len(rows),
            'coverage': {'calendarDays': calendar_days, 'observedDays': len(rows),
                         'rate': round(coverage, 6), 'maxMissingDayGap': max_gap,
                         'minRequired': MIN_COVERAGE,
                         'maxAllowedMissingDayGap': MAX_MISSING_DAYS,
                         'duplicateDates': duplicate_count, 'conflictingDates': len(conflicting),
                         'invalidPrices': invalid_count, 'openCandlesExcluded': forming_count,
                         'liquidityProxy': 'Yahoo-reported USD quote volume; not verified exchange-wide depth',
                         'minimumReportedNotionalUsd': MIN_REPORTED_NOTIONAL_USD,
                         'excludedIntervals': excluded},
            'observations': rows}


def load(asset, ticker, fetch, snapshots, current, *, now=None, refresh=True):
    """Read latest valid persisted snapshot, then refresh with an overlapping window.

    Immutable/content-addressed snapshot writes happen BEFORE moving the pointer.
    A provider failure returns the last valid snapshot with honest freshness.
    """
    now = now or datetime.now(timezone.utc)
    pointer = current.find_one({'_id': asset}) or {}
    prior = snapshots.find_one({'_id': pointer.get('snapshotId')}) if pointer else None
    if prior and prior.get('policyVersion') != POLICY_VERSION:
        prior = None  # a different policy cannot validate this model's history
    if not refresh and prior:
        return _serving(prior, now, 'PERSISTED')
    last_full = pointer.get('lastFullComparedAt')
    try:
        last_full_day = datetime.fromisoformat(str(last_full).replace('Z', '+00:00')).date()
        full_due = (now.date() - last_full_day).days >= FULL_COMPARE_DAYS
    except (ValueError, TypeError):
        full_due = True
    last_day = datetime.fromisoformat(prior['lastDate']).date() if prior else None
    full = not prior or full_due or (now.date() - last_day).days > 75
    requested_range = 'max' if full else '3mo'  # overlaps recent days for revisions
    try:
        incoming = fetch(ticker, rng=requested_range, observations=True)
        if not incoming:
            raise ValueError('Provider returned no daily observations')
        # A response containing only the still-open UTC candle is not a refresh.
        if not any(_day(r.get('date')) < now.date().isoformat()
                   and (_number(r.get('close')) or 0) > 0 for r in incoming):
            raise ValueError('Provider returned no closed daily observations')
        if prior and not full:
            # New provider rows supersede overlapping stored dates: a legitimate
            # upstream close revision must produce a NEW hash, not a conflict.
            incoming_dates = {_day(r.get('date')) for r in incoming}
            raw = [r for r in prior['observations']
                   if r['date'] not in incoming_dates] + incoming
        else:
            raw = incoming
        accepted = canonicalize(asset, ticker, raw, now=now,
                                requested_range=requested_range)
        if not accepted.get('ok'):
            raise ValueError(accepted.get('reason') or 'Invalid provider history')
        # An incremental response that loses the current tail must not replace it.
        if prior and accepted['lastDate'] < prior['lastDate']:
            raise ValueError('Provider returned an older tail')
        if prior and full and accepted['firstDate'] > prior['firstDate']:
            raise ValueError('Provider truncated the previously accepted record')
        if prior and accepted['dataHash'] == prior['dataHash']:
            current.update_one({'_id': asset}, {'$set': {
                'lastCheckedAt': now.isoformat(),
                **({'lastFullComparedAt': now.isoformat()} if full else {})}},
                upsert=False)
            return _serving(prior, now, 'UNCHANGED')
        snapshots.update_one({'_id': accepted['_id']},
                             {'$setOnInsert': accepted}, upsert=True)
        current.update_one({'_id': asset}, {'$set': {
            'snapshotId': accepted['snapshotId'], 'dataHash': accepted['dataHash'],
            'policyVersion': POLICY_VERSION, 'lastCheckedAt': now.isoformat(),
            **({'lastFullComparedAt': now.isoformat()} if full else {})}}, upsert=True)
        return _serving(accepted, now, 'REFRESHED')
    except Exception as exc:
        if prior:
            result = _serving(prior, now, 'PROVIDER_UNAVAILABLE')
            result['refreshReason'] = type(exc).__name__  # no URL or secret leakage
            return result
        return {'ok': False, 'reason': 'HISTORY_PROVIDER_UNAVAILABLE',
                'detail': type(exc).__name__, 'assetId': asset,
                'policyVersion': POLICY_VERSION}


def _serving(snapshot, now, provider_status):
    out = {k: v for k, v in snapshot.items() if k != '_id'}
    age = (now.date() - datetime.fromisoformat(snapshot['lastDate']).date()).days
    out.update({'ok': True, 'freshness': 'FRESH' if age <= 2 else 'STALE',
                'ageDays': max(age, 0), 'providerStatus': provider_status})
    return out
