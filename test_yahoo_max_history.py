"""Test Yahoo Finance segmented max history retrieval for BTC-USD.

This script verifies the integrated fetch_yahoo_series(symbol, rng='max', observations=True)
function that pages through 1000-day period1/period2 windows to retrieve maximum daily history.

CRITICAL: Unlike prior test_yahoo_period_bounds.py, this correctly identifies today's forming
candle by UTC date comparison, not by blindly dropping the last observation.

Tests:
1. Real Yahoo call to fetch_yahoo_series('BTC-USD', rng='max', observations=True)
2. Report actual row count, first/last UTC dates, max missing gap, daily cadence
3. Canonicalize with history.py and report firstDate, lastDate, count, hash, coverage
4. Optionally persist to ISOLATED test collections (no production DB writes)
5. Verify immutable snapshot behavior

Run: cd /app/backend && python test_yahoo_max_history.py
"""
import os
import sys
from datetime import datetime, timezone, timedelta
import traceback

backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend')
sys.path.insert(0, backend_dir)

import server
from albert.market import history as mkt_history

# ISOLATED test collections - NO production data mutations
TEST_SNAPSHOTS_COL = 'scenario_history_snapshots_TEST_YAHOO_MAX'
TEST_CURRENT_COL = 'scenario_history_current_TEST_YAHOO_MAX'


def analyze_observations(obs, now=None):
    """Analyze raw observations for cadence, gaps, and forming candle detection."""
    if not obs:
        return None
    
    now = now or datetime.now(timezone.utc)
    today_str = now.date().isoformat()
    
    # Separate closed vs forming observations
    closed = []
    forming = []
    invalid = []
    
    for o in obs:
        date_str = o.get('date', '')
        close = o.get('close')
        
        if not date_str or close is None or close <= 0:
            invalid.append(o)
            continue
        
        if date_str >= today_str:
            forming.append(o)
        else:
            closed.append(o)
    
    if not closed:
        return {
            'total_obs': len(obs),
            'closed_obs': 0,
            'forming_obs': len(forming),
            'invalid_obs': len(invalid),
            'error': 'No closed observations found'
        }
    
    # Sort by date
    closed.sort(key=lambda x: x['date'])
    
    first_date = closed[0]['date']
    last_date = closed[-1]['date']
    
    # Calculate gaps
    gaps = []
    for i in range(1, len(closed)):
        d1 = datetime.fromisoformat(closed[i-1]['date'])
        d2 = datetime.fromisoformat(closed[i]['date'])
        gap_days = (d2 - d1).days - 1
        if gap_days > 0:
            gaps.append({
                'from': closed[i-1]['date'],
                'to': closed[i]['date'],
                'missing_days': gap_days
            })
    
    max_gap = max([g['missing_days'] for g in gaps]) if gaps else 0
    
    # Calculate cadence (median gap between consecutive observations)
    if len(closed) > 1:
        day_gaps = []
        for i in range(1, len(closed)):
            d1 = datetime.fromisoformat(closed[i-1]['date'])
            d2 = datetime.fromisoformat(closed[i]['date'])
            day_gaps.append((d2 - d1).days)
        
        day_gaps.sort()
        median_gap = day_gaps[len(day_gaps) // 2]
        min_gap = min(day_gaps)
        max_gap_in_series = max(day_gaps)
    else:
        median_gap = min_gap = max_gap_in_series = 0
    
    # Determine cadence type
    if median_gap == 1:
        cadence = 'DAILY'
    elif 28 <= median_gap <= 31:
        cadence = 'MONTHLY'
    elif 6 <= median_gap <= 8:
        cadence = 'WEEKLY'
    else:
        cadence = f'IRREGULAR (median {median_gap} days)'
    
    # Calculate calendar span
    first_dt = datetime.fromisoformat(first_date)
    last_dt = datetime.fromisoformat(last_date)
    calendar_days = (last_dt - first_dt).days + 1
    coverage_rate = len(closed) / calendar_days if calendar_days > 0 else 0
    
    return {
        'total_obs': len(obs),
        'closed_obs': len(closed),
        'forming_obs': len(forming),
        'invalid_obs': len(invalid),
        'first_date': first_date,
        'last_date': last_date,
        'first_close': closed[0]['close'],
        'last_close': closed[-1]['close'],
        'calendar_days': calendar_days,
        'coverage_rate': round(coverage_rate, 6),
        'median_gap_days': median_gap,
        'min_gap_days': min_gap,
        'max_gap_days': max_gap_in_series,
        'max_missing_gap': max_gap,
        'cadence': cadence,
        'gaps_over_3_days': [g for g in gaps if g['missing_days'] > 3],
        'forming_candles': [{'date': f['date'], 'close': f['close']} for f in forming],
        'today_utc': today_str
    }


def test_yahoo_max_btc():
    """Test 1: Real Yahoo call for BTC-USD with rng='max' and observations=True."""
    print("=" * 80)
    print("TEST 1: Real Yahoo Finance BTC-USD max history fetch")
    print("=" * 80)
    
    try:
        now = datetime.now(timezone.utc)
        print(f"Current UTC time: {now.isoformat()}")
        print(f"Calling fetch_yahoo_series('BTC-USD', rng='max', observations=True)...")
        print()
        
        start_time = datetime.now()
        obs = server.fetch_yahoo_series('BTC-USD', rng='max', observations=True)
        elapsed = (datetime.now() - start_time).total_seconds()
        
        print(f"✅ Yahoo API call successful (took {elapsed:.2f}s)")
        print()
        
        analysis = analyze_observations(obs, now)
        
        print("RAW OBSERVATIONS ANALYSIS:")
        print(f"  Total observations returned: {analysis['total_obs']}")
        print(f"  Closed observations (historical): {analysis['closed_obs']}")
        print(f"  Forming candles (today UTC): {analysis['forming_obs']}")
        print(f"  Invalid observations: {analysis['invalid_obs']}")
        print()
        
        print("DATE RANGE:")
        print(f"  First date: {analysis['first_date']}")
        print(f"  Last date: {analysis['last_date']}")
        print(f"  Calendar days span: {analysis['calendar_days']} days")
        print(f"  Years span: {analysis['calendar_days'] / 365.25:.2f} years")
        print()
        
        print("CLOSE PRICES:")
        print(f"  First close ({analysis['first_date']}): ${analysis['first_close']:,.2f}")
        print(f"  Last close ({analysis['last_date']}): ${analysis['last_close']:,.2f}")
        print()
        
        print("CADENCE ANALYSIS:")
        print(f"  Median gap: {analysis['median_gap_days']} days")
        print(f"  Min gap: {analysis['min_gap_days']} days")
        print(f"  Max gap: {analysis['max_gap_days']} days")
        print(f"  Cadence: {analysis['cadence']}")
        print(f"  Coverage rate: {analysis['coverage_rate']:.4f} ({analysis['closed_obs']}/{analysis['calendar_days']})")
        print()
        
        print("GAP ANALYSIS:")
        print(f"  Maximum missing gap: {analysis['max_missing_gap']} days")
        if analysis['gaps_over_3_days']:
            print(f"  Gaps over 3 days: {len(analysis['gaps_over_3_days'])}")
            for gap in analysis['gaps_over_3_days'][:5]:  # Show first 5
                print(f"    - {gap['from']} to {gap['to']}: {gap['missing_days']} days missing")
        else:
            print("  No gaps over 3 days ✅")
        print()
        
        print("FORMING CANDLE DETECTION:")
        print(f"  Today UTC: {analysis['today_utc']}")
        if analysis['forming_candles']:
            print(f"  Forming candles detected: {len(analysis['forming_candles'])}")
            for fc in analysis['forming_candles']:
                print(f"    - {fc['date']}: ${fc['close']:,.2f} (correctly excluded from closed)")
        else:
            print("  No forming candles (all observations are historical) ✅")
        print()
        
        # Sample data
        print("SAMPLE DATA (first 3 closed observations):")
        for i, o in enumerate(obs[:3]):
            if o.get('date', '') < analysis['today_utc']:
                print(f"  {o['date']}: ${o['close']:,.2f} (volume: {o.get('volume', 0):,.0f})")
        print()
        
        print("SAMPLE DATA (last 3 closed observations):")
        closed_obs = [o for o in obs if o.get('date', '') < analysis['today_utc'] and o.get('close') is not None]
        for o in closed_obs[-3:]:
            vol = o.get('volume', 0) or 0
            print(f"  {o['date']}: ${o['close']:,.2f} (volume: {vol:,.0f})")
        print()
        
        # Verdict
        if analysis['cadence'] == 'DAILY':
            print("✅ VERDICT: Yahoo Finance returns DAILY granularity for BTC-USD with rng='max'")
        elif analysis['cadence'] == 'MONTHLY':
            print("❌ VERDICT: Yahoo Finance returns MONTHLY granularity (not daily) for BTC-USD with rng='max'")
        else:
            print(f"⚠️  VERDICT: Yahoo Finance returns {analysis['cadence']} granularity for BTC-USD with rng='max'")
        
        print()
        return obs, analysis
        
    except Exception as e:
        print(f"❌ ERROR: {type(e).__name__}: {e}")
        traceback.print_exc()
        return None, None


def test_canonicalize_btc(obs, analysis):
    """Test 2: Canonicalize BTC observations with history.py."""
    print("=" * 80)
    print("TEST 2: Canonicalize BTC with history.py")
    print("=" * 80)
    
    if not obs or not analysis:
        print("⏭️  SKIPPED: No observations from Test 1")
        return None
    
    try:
        now = datetime.now(timezone.utc)
        print(f"Calling history.canonicalize('BTC', 'BTC-USD', raw_obs, now={now.isoformat()})...")
        print()
        
        result = mkt_history.canonicalize('BTC', 'BTC-USD', obs, now=now, requested_range='max')
        
        if not result.get('ok'):
            print(f"❌ CANONICALIZATION FAILED:")
            print(f"  Reason: {result.get('reason')}")
            print(f"  Detail: {result.get('detail')}")
            return result
        
        print("✅ CANONICALIZATION SUCCESSFUL")
        print()
        
        print("SNAPSHOT METADATA:")
        print(f"  Snapshot ID: {result['snapshotId']}")
        print(f"  Asset ID: {result['assetId']}")
        print(f"  Provider: {result['provider']}")
        print(f"  Provider Symbol: {result['providerSymbol']}")
        print(f"  Policy Version: {result['policyVersion']}")
        print(f"  Data Hash: {result['dataHash']}")
        print(f"  Retrieved At: {result['retrievedAt']}")
        print()
        
        print("CANONICAL HISTORY:")
        print(f"  First Date: {result['firstDate']}")
        print(f"  Last Date: {result['lastDate']}")
        print(f"  Observation Count: {result['observationCount']}")
        print()
        
        cov = result['coverage']
        print("COVERAGE:")
        print(f"  Calendar Days: {cov['calendarDays']}")
        print(f"  Observed Days: {cov['observedDays']}")
        print(f"  Coverage Rate: {cov['rate']:.6f}")
        print(f"  Max Missing Day Gap: {cov['maxMissingDayGap']}")
        print(f"  Min Required Coverage: {cov['minRequired']:.2f}")
        print(f"  Max Allowed Missing Day Gap: {cov['maxAllowedMissingDayGap']}")
        print()
        
        print("EXCLUSIONS:")
        print(f"  Duplicate Dates: {cov['duplicateDates']}")
        print(f"  Conflicting Dates: {cov['conflictingDates']}")
        print(f"  Invalid Prices: {cov['invalidPrices']}")
        print(f"  Open Candles Excluded: {cov['openCandlesExcluded']}")
        print()
        
        if cov.get('excludedIntervals'):
            print("EXCLUDED INTERVALS:")
            for ex in cov['excludedIntervals']:
                print(f"  - {ex['reason']}: {ex.get('count', 'N/A')} observations")
                if 'from' in ex and 'to' in ex:
                    print(f"    Gap: {ex['from']} to {ex['to']} ({ex.get('missingDays', 0)} days)")
        print()
        
        # Verify policy compliance
        print("POLICY COMPLIANCE:")
        min_obs = mkt_history.MIN_OBSERVATIONS
        min_cov = mkt_history.MIN_COVERAGE
        max_gap = mkt_history.MAX_MISSING_DAYS
        
        obs_ok = result['observationCount'] >= min_obs
        cov_ok = cov['rate'] >= min_cov
        gap_ok = cov['maxMissingDayGap'] <= max_gap
        
        print(f"  Observation Count: {result['observationCount']} >= {min_obs} {'✅' if obs_ok else '❌'}")
        print(f"  Coverage Rate: {cov['rate']:.4f} >= {min_cov:.2f} {'✅' if cov_ok else '❌'}")
        print(f"  Max Gap: {cov['maxMissingDayGap']} <= {max_gap} {'✅' if gap_ok else '❌'}")
        print()
        
        if obs_ok and cov_ok and gap_ok:
            print("✅ VERDICT: BTC canonical history meets all policy requirements")
        else:
            print("❌ VERDICT: BTC canonical history FAILS policy requirements")
        
        print()
        return result
        
    except Exception as e:
        print(f"❌ ERROR: {type(e).__name__}: {e}")
        traceback.print_exc()
        return None


def test_persist_isolated(canonical):
    """Test 3: Persist to ISOLATED test collections (no production writes)."""
    print("=" * 80)
    print("TEST 3: Persist to ISOLATED test collections")
    print("=" * 80)
    
    if not canonical or not canonical.get('ok'):
        print("⏭️  SKIPPED: No valid canonical snapshot from Test 2")
        return
    
    try:
        # Save original collections
        orig_snapshots = server.scenario_history_snapshots_col
        orig_current = server.scenario_history_current_col
        
        # Switch to test collections
        server.scenario_history_snapshots_col = server.db[TEST_SNAPSHOTS_COL]
        server.scenario_history_current_col = server.db[TEST_CURRENT_COL]
        
        # Clean slate
        server.scenario_history_snapshots_col.delete_many({})
        server.scenario_history_current_col.delete_many({})
        
        print(f"Using ISOLATED test collections:")
        print(f"  Snapshots: {TEST_SNAPSHOTS_COL}")
        print(f"  Current: {TEST_CURRENT_COL}")
        print()
        
        # Mock fetch function that returns our observations
        def mock_fetch(symbol, rng='max', observations=True):
            # Return the same observations we got from the real Yahoo call
            return canonical['observations']
        
        # Call history.load with the mock fetch
        print("Calling history.load('BTC', 'BTC-USD', mock_fetch, ...)...")
        result = mkt_history.load(
            'BTC', 'BTC-USD', mock_fetch,
            server.scenario_history_snapshots_col,
            server.scenario_history_current_col,
            now=datetime.now(timezone.utc),
            refresh=True
        )
        
        if not result.get('ok'):
            print(f"❌ LOAD FAILED:")
            print(f"  Reason: {result.get('reason')}")
            print(f"  Detail: {result.get('detail')}")
            return
        
        print("✅ LOAD SUCCESSFUL")
        print()
        
        print("PERSISTED SNAPSHOT:")
        print(f"  Snapshot ID: {result['snapshotId']}")
        print(f"  Data Hash: {result['dataHash']}")
        print(f"  First Date: {result['firstDate']}")
        print(f"  Last Date: {result['lastDate']}")
        print(f"  Observation Count: {result['observationCount']}")
        print(f"  Provider Status: {result['providerStatus']}")
        print(f"  Freshness: {result['freshness']}")
        print(f"  Age Days: {result['ageDays']}")
        print()
        
        # Verify immutable snapshot
        print("VERIFYING IMMUTABLE SNAPSHOT:")
        snapshot_doc = server.scenario_history_snapshots_col.find_one({'_id': result['snapshotId']})
        current_doc = server.scenario_history_current_col.find_one({'_id': 'BTC'})
        
        if snapshot_doc:
            print(f"  ✅ Snapshot document exists in {TEST_SNAPSHOTS_COL}")
            print(f"     Snapshot ID: {snapshot_doc['_id']}")
            print(f"     Data Hash: {snapshot_doc['dataHash']}")
        else:
            print(f"  ❌ Snapshot document NOT found in {TEST_SNAPSHOTS_COL}")
        
        if current_doc:
            print(f"  ✅ Current pointer exists in {TEST_CURRENT_COL}")
            print(f"     Asset: {current_doc['_id']}")
            print(f"     Points to: {current_doc['snapshotId']}")
            print(f"     Data Hash: {current_doc['dataHash']}")
        else:
            print(f"  ❌ Current pointer NOT found in {TEST_CURRENT_COL}")
        
        print()
        
        # Test immutability: try to load again with same data
        print("TESTING IMMUTABILITY (reload with same data):")
        result2 = mkt_history.load(
            'BTC', 'BTC-USD', mock_fetch,
            server.scenario_history_snapshots_col,
            server.scenario_history_current_col,
            now=datetime.now(timezone.utc),
            refresh=True
        )
        
        if result2['providerStatus'] == 'UNCHANGED':
            print("  ✅ Provider status: UNCHANGED (immutable snapshot preserved)")
            print(f"     Same data hash: {result2['dataHash'] == result['dataHash']}")
        else:
            print(f"  ⚠️  Provider status: {result2['providerStatus']}")
        
        print()
        
        # Cleanup
        print("CLEANUP:")
        snap_count = server.scenario_history_snapshots_col.count_documents({})
        curr_count = server.scenario_history_current_col.count_documents({})
        print(f"  Snapshots in test collection: {snap_count}")
        print(f"  Current pointers in test collection: {curr_count}")
        
        server.scenario_history_snapshots_col.delete_many({})
        server.scenario_history_current_col.delete_many({})
        server.db.drop_collection(TEST_SNAPSHOTS_COL)
        server.db.drop_collection(TEST_CURRENT_COL)
        print(f"  ✅ Test collections cleaned up")
        
        # Restore original collections
        server.scenario_history_snapshots_col = orig_snapshots
        server.scenario_history_current_col = orig_current
        print(f"  ✅ Production collections restored")
        
        print()
        
    except Exception as e:
        print(f"❌ ERROR: {type(e).__name__}: {e}")
        traceback.print_exc()
        
        # Ensure cleanup even on error
        try:
            server.scenario_history_snapshots_col.delete_many({})
            server.scenario_history_current_col.delete_many({})
            server.db.drop_collection(TEST_SNAPSHOTS_COL)
            server.db.drop_collection(TEST_CURRENT_COL)
            server.scenario_history_snapshots_col = orig_snapshots
            server.scenario_history_current_col = orig_current
        except:
            pass


def main():
    """Run all tests."""
    print()
    print("╔" + "=" * 78 + "╗")
    print("║" + " " * 78 + "║")
    print("║" + "  Yahoo Finance Segmented Max History Integration Test".center(78) + "║")
    print("║" + "  BTC-USD with period1/period2 paging".center(78) + "║")
    print("║" + " " * 78 + "║")
    print("╚" + "=" * 78 + "╝")
    print()
    
    # Test 1: Real Yahoo call
    obs, analysis = test_yahoo_max_btc()
    
    # Test 2: Canonicalize
    canonical = test_canonicalize_btc(obs, analysis) if obs else None
    
    # Test 3: Persist to isolated collections
    if canonical and canonical.get('ok'):
        test_persist_isolated(canonical)
    
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    
    if analysis:
        print(f"✅ Test 1: Yahoo max fetch - {analysis['closed_obs']} closed observations")
        print(f"   Cadence: {analysis['cadence']}")
        print(f"   Date range: {analysis['first_date']} to {analysis['last_date']}")
        print(f"   Max gap: {analysis['max_missing_gap']} days")
    else:
        print("❌ Test 1: Yahoo max fetch - FAILED")
    
    if canonical and canonical.get('ok'):
        print(f"✅ Test 2: Canonicalization - {canonical['observationCount']} observations")
        print(f"   Hash: {canonical['dataHash'][:16]}...")
        print(f"   Coverage: {canonical['coverage']['rate']:.4f}")
    else:
        print("❌ Test 2: Canonicalization - FAILED")
    
    print()
    print("=" * 80)
    print()


if __name__ == '__main__':
    main()
