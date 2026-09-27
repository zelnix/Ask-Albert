#!/usr/bin/env python3
"""
Data Audit Phase 1 & 2 + FRED Macro Backend Test
Tests 4 new endpoints via external URL:
1. GET /api/v1/composite-price
2. GET /api/v1/cross-asset
3. GET /api/v1/news-signals
4. GET /api/v1/macro-fred
Plus quick dashboard regression test.
"""

import requests
import sys
import time

BASE_URL = "https://what-if-sandbox.preview.emergentagent.com/api"

def test_composite_price():
    """Test 1: GET /api/v1/composite-price - Composite Spot Price"""
    print("\n" + "="*80)
    print("TEST 1: GET /api/v1/composite-price - Composite Spot Price")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/v1/composite-price"
        print(f"Requesting: {url}")
        
        response = requests.get(url, timeout=30)
        print(f"HTTP Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {response.status_code}")
            return False
        
        data = response.json()
        print(f"Response keys: {list(data.keys())}")
        
        # Validation 1: status='ready'
        status = data.get('status')
        print(f"✓ status: {status}")
        if status != 'ready':
            print(f"❌ FAILED: Expected status='ready', got '{status}'")
            return False
        
        # Validation 2: numeric composite > 0
        composite = data.get('composite')
        print(f"✓ composite: ${composite:,.2f}")
        if not isinstance(composite, (int, float)) or composite <= 0:
            print(f"❌ FAILED: composite must be numeric > 0, got {composite}")
            return False
        
        # Validation 3: numeric median > 0
        median = data.get('median')
        print(f"✓ median: ${median:,.2f}")
        if not isinstance(median, (int, float)) or median <= 0:
            print(f"❌ FAILED: median must be numeric > 0, got {median}")
            return False
        
        # Validation 4: venue_count between 1 and 4
        venue_count = data.get('venue_count')
        print(f"✓ venue_count: {venue_count}")
        if not isinstance(venue_count, int) or venue_count < 1 or venue_count > 4:
            print(f"❌ FAILED: venue_count must be int 1-4, got {venue_count}")
            return False
        
        # Validation 5: confidence in [HIGH, MEDIUM, LOW]
        confidence = data.get('confidence')
        print(f"✓ confidence: {confidence}")
        if confidence not in ['HIGH', 'MEDIUM', 'LOW']:
            print(f"❌ FAILED: confidence must be in [HIGH, MEDIUM, LOW], got '{confidence}'")
            return False
        
        # Validation 6: venues is a non-empty list
        venues = data.get('venues', [])
        print(f"✓ venues: {len(venues)} items")
        if not isinstance(venues, list) or len(venues) == 0:
            print(f"❌ FAILED: venues must be non-empty list, got {venues}")
            return False
        
        # Validation 7: Each venue has source and ok fields
        for i, venue in enumerate(venues):
            source = venue.get('source')
            ok = venue.get('ok')
            print(f"  - Venue {i+1}: {source}, ok={ok}")
            if not source or not isinstance(ok, bool):
                print(f"❌ FAILED: Venue missing source or ok field: {venue}")
                return False
            
            # If ok=True, must have numeric price and dev_pct
            if ok:
                price = venue.get('price')
                dev_pct = venue.get('dev_pct')
                if not isinstance(price, (int, float)) or price <= 0:
                    print(f"❌ FAILED: ok venue must have numeric price > 0, got {price}")
                    return False
                print(f"    price=${price:,.2f}, dev_pct={dev_pct}%")
                
                # Check if outlier flagged
                if venue.get('outlier'):
                    print(f"    ⚠️  OUTLIER flagged (excluded from composite)")
        
        # Validation 8: fallback_chain present
        fallback_chain = data.get('fallback_chain')
        print(f"✓ fallback_chain: {fallback_chain}")
        if not fallback_chain:
            print(f"❌ FAILED: fallback_chain must be present")
            return False
        
        # Validation 9: method present
        method = data.get('method')
        print(f"✓ method: {method}")
        if not method:
            print(f"❌ FAILED: method must be present")
            return False
        
        print("\n✅ TEST 1 PASSED: Composite Price endpoint working correctly")
        print(f"   Composite: ${composite:,.2f}, Median: ${median:,.2f}, Venues: {venue_count}, Confidence: {confidence}")
        return True
        
    except Exception as e:
        print(f"❌ TEST 1 FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_cross_asset():
    """Test 2: GET /api/v1/cross-asset - Cross-Asset Context"""
    print("\n" + "="*80)
    print("TEST 2: GET /api/v1/cross-asset - Cross-Asset Context")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/v1/cross-asset"
        print(f"Requesting: {url}")
        
        response = requests.get(url, timeout=30)
        print(f"HTTP Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {response.status_code}")
            return False
        
        data = response.json()
        print(f"Response keys: {list(data.keys())}")
        
        # Validation 1: status='ready'
        status = data.get('status')
        print(f"✓ status: {status}")
        if status != 'ready':
            print(f"❌ FAILED: Expected status='ready', got '{status}'")
            return False
        
        # Validation 2: numeric btc_dominance > 0
        btc_dominance = data.get('btc_dominance')
        print(f"✓ btc_dominance: {btc_dominance}%")
        if not isinstance(btc_dominance, (int, float)) or btc_dominance <= 0:
            print(f"❌ FAILED: btc_dominance must be numeric > 0, got {btc_dominance}")
            return False
        
        # Validation 3: eth_dominance is numeric (may be 0)
        eth_dominance = data.get('eth_dominance')
        print(f"✓ eth_dominance: {eth_dominance}%")
        if not isinstance(eth_dominance, (int, float)):
            print(f"❌ FAILED: eth_dominance must be numeric, got {eth_dominance}")
            return False
        
        # Validation 4: regime is a non-empty string
        regime = data.get('regime')
        print(f"✓ regime: {regime}")
        if not isinstance(regime, str) or len(regime) == 0:
            print(f"❌ FAILED: regime must be non-empty string, got '{regime}'")
            return False
        
        # Validation 5: read is a non-empty string
        read = data.get('read')
        print(f"✓ read: {read[:100]}..." if len(read) > 100 else f"✓ read: {read}")
        if not isinstance(read, str) or len(read) == 0:
            print(f"❌ FAILED: read must be non-empty string, got '{read}'")
            return False
        
        # Validation 6: source present
        source = data.get('source')
        print(f"✓ source: {source}")
        if not source:
            print(f"❌ FAILED: source must be present")
            return False
        
        # NOTE: eth_btc MAY be null (OKX ETH-BTC sometimes unavailable) - this is acceptable
        eth_btc = data.get('eth_btc')
        if eth_btc is None:
            print(f"⚠️  eth_btc: null (OKX ETH-BTC unavailable - ACCEPTABLE)")
        else:
            print(f"✓ eth_btc: {eth_btc}")
        
        print("\n✅ TEST 2 PASSED: Cross-Asset endpoint working correctly")
        print(f"   BTC Dominance: {btc_dominance}%, Regime: {regime}")
        return True
        
    except Exception as e:
        print(f"❌ TEST 2 FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_news_signals():
    """Test 3: GET /api/v1/news-signals - GDELT News Tone"""
    print("\n" + "="*80)
    print("TEST 3: GET /api/v1/news-signals - GDELT News Tone")
    print("="*80)
    print("NOTE: GDELT rate-limits shared IPs. Both status='ready' and status='unavailable' are ACCEPTABLE.")
    print("Using timeout >= 45 seconds (builder retries GDELT up to 3x with 6s backoff)...")
    
    try:
        url = f"{BASE_URL}/v1/news-signals"
        print(f"Requesting: {url}")
        
        response = requests.get(url, timeout=50)  # 50s timeout for GDELT retries
        print(f"HTTP Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {response.status_code}")
            return False
        
        data = response.json()
        print(f"Response keys: {list(data.keys())}")
        
        status = data.get('status')
        print(f"✓ status: {status}")
        
        # ACCEPTABLE OUTCOME A: status='ready' with data
        if status == 'ready':
            print("\n✓ OUTCOME A: status='ready' (GDELT data available)")
            
            # Validation: numeric tone_latest
            tone_latest = data.get('tone_latest')
            print(f"✓ tone_latest: {tone_latest}")
            if not isinstance(tone_latest, (int, float)):
                print(f"❌ FAILED: tone_latest must be numeric, got {tone_latest}")
                return False
            
            # Validation: numeric tone_avg_21d
            tone_avg_21d = data.get('tone_avg_21d')
            print(f"✓ tone_avg_21d: {tone_avg_21d}")
            if not isinstance(tone_avg_21d, (int, float)):
                print(f"❌ FAILED: tone_avg_21d must be numeric, got {tone_avg_21d}")
                return False
            
            # Validation: numeric tone_recent_3d
            tone_recent_3d = data.get('tone_recent_3d')
            print(f"✓ tone_recent_3d: {tone_recent_3d}")
            if not isinstance(tone_recent_3d, (int, float)):
                print(f"❌ FAILED: tone_recent_3d must be numeric, got {tone_recent_3d}")
                return False
            
            # Validation: mood in [Positive, Negative, Neutral]
            mood = data.get('mood')
            print(f"✓ mood: {mood}")
            if mood not in ['Positive', 'Negative', 'Neutral']:
                print(f"❌ FAILED: mood must be in [Positive, Negative, Neutral], got '{mood}'")
                return False
            
            # Validation: direction in [Improving, Worsening, Stable]
            direction = data.get('direction')
            print(f"✓ direction: {direction}")
            if direction not in ['Improving', 'Worsening', 'Stable']:
                print(f"❌ FAILED: direction must be in [Improving, Worsening, Stable], got '{direction}'")
                return False
            
            # Validation: series is non-empty list with {date, tone}
            series = data.get('series', [])
            print(f"✓ series: {len(series)} data points")
            if not isinstance(series, list) or len(series) == 0:
                print(f"❌ FAILED: series must be non-empty list, got {series}")
                return False
            
            # Check first series item
            first = series[0]
            if 'date' not in first or 'tone' not in first:
                print(f"❌ FAILED: series items must have date and tone, got {first}")
                return False
            print(f"  - First point: date={first['date']}, tone={first['tone']}")
            
            print("\n✅ TEST 3 PASSED (OUTCOME A): News Signals endpoint returned GDELT data")
            print(f"   Tone Latest: {tone_latest}, Mood: {mood}, Direction: {direction}, Series: {len(series)} points")
            return True
        
        # ACCEPTABLE OUTCOME B: status='unavailable' with reason
        elif status == 'unavailable':
            print("\n✓ OUTCOME B: status='unavailable' (GDELT throttled - ACCEPTABLE)")
            
            # Validation: active=false
            active = data.get('active')
            print(f"✓ active: {active}")
            if active != False:
                print(f"❌ FAILED: When status='unavailable', active must be False, got {active}")
                return False
            
            # Validation: reason is non-empty string
            reason = data.get('reason')
            print(f"✓ reason: {reason}")
            if not isinstance(reason, str) or len(reason) == 0:
                print(f"❌ FAILED: reason must be non-empty string, got '{reason}'")
                return False
            
            print("\n✅ TEST 3 PASSED (OUTCOME B): News Signals endpoint gracefully handled GDELT throttling")
            print(f"   Reason: {reason}")
            return True
        
        else:
            print(f"❌ FAILED: status must be 'ready' or 'unavailable', got '{status}'")
            return False
        
    except Exception as e:
        print(f"❌ TEST 3 FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_macro_fred():
    """Test 4: GET /api/v1/macro-fred - FRED US Macro"""
    print("\n" + "="*80)
    print("TEST 4: GET /api/v1/macro-fred - FRED US Macro")
    print("="*80)
    print("NOTE: FRED_API_KEY is set in /app/.env, so expect status='ready' (NOT 'inactive')")
    
    try:
        url = f"{BASE_URL}/v1/macro-fred"
        print(f"Requesting: {url}")
        
        response = requests.get(url, timeout=30)
        print(f"HTTP Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {response.status_code}")
            return False
        
        data = response.json()
        print(f"Response keys: {list(data.keys())}")
        
        # Validation 1: status='ready' (must NOT be 'inactive')
        status = data.get('status')
        print(f"✓ status: {status}")
        if status != 'ready':
            print(f"❌ FAILED: Expected status='ready' (FRED_API_KEY is set), got '{status}'")
            if status == 'inactive':
                print(f"   CRITICAL: FRED_API_KEY is set but endpoint returned 'inactive'")
            return False
        
        # Validation 2: series is a non-empty list (>=5 items)
        series = data.get('series', [])
        print(f"✓ series: {len(series)} items")
        if not isinstance(series, list) or len(series) < 5:
            print(f"❌ FAILED: series must be non-empty list with >=5 items, got {len(series)} items")
            return False
        
        # Validation 3: Each series item has numeric value, non-empty label, and date string
        print("\nValidating series items:")
        for i, item in enumerate(series):
            item_id = item.get('id')
            label = item.get('label')
            value = item.get('value')
            date = item.get('date')
            
            print(f"  {i+1}. {label} ({item_id}): {value} (as of {date})")
            
            # Check label is non-empty string
            if not isinstance(label, str) or len(label) == 0:
                print(f"❌ FAILED: label must be non-empty string, got '{label}'")
                return False
            
            # Check value is numeric
            if not isinstance(value, (int, float)):
                print(f"❌ FAILED: value must be numeric, got {value}")
                return False
            
            # Check date is non-empty string
            if not isinstance(date, str) or len(date) == 0:
                print(f"❌ FAILED: date must be non-empty string, got '{date}'")
                return False
        
        # Validation 4: confidence='HIGH'
        confidence = data.get('confidence')
        print(f"\n✓ confidence: {confidence}")
        if confidence != 'HIGH':
            print(f"⚠️  WARNING: Expected confidence='HIGH', got '{confidence}'")
        
        # Validation 5: source present
        source = data.get('source')
        print(f"✓ source: {source}")
        if not source:
            print(f"❌ FAILED: source must be present")
            return False
        
        print("\n✅ TEST 4 PASSED: FRED Macro endpoint working correctly")
        print(f"   Series Count: {len(series)}, Confidence: {confidence}")
        return True
        
    except Exception as e:
        print(f"❌ TEST 4 FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_dashboard_regression():
    """Regression Test: GET /api/v1/dashboard (default BTC) still returns status='ready'"""
    print("\n" + "="*80)
    print("REGRESSION TEST: GET /api/v1/dashboard (default BTC)")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/v1/dashboard"
        print(f"Requesting: {url}")
        
        response = requests.get(url, timeout=30)
        print(f"HTTP Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        # Validation: status='ready'
        status = data.get('status')
        print(f"✓ status: {status}")
        if status != 'ready':
            print(f"❌ FAILED: Expected status='ready', got '{status}'")
            return False
        
        print("\n✅ REGRESSION TEST PASSED: Dashboard endpoint still working correctly")
        return True
        
    except Exception as e:
        print(f"❌ REGRESSION TEST FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    print("\n" + "="*80)
    print("DATA AUDIT PHASE 1 & 2 + FRED MACRO BACKEND TEST")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Testing 4 new endpoints + 1 regression test")
    print("="*80)
    
    results = {}
    
    # Test 1: Composite Price
    results['composite_price'] = test_composite_price()
    
    # Test 2: Cross-Asset
    results['cross_asset'] = test_cross_asset()
    
    # Test 3: News Signals (GDELT)
    results['news_signals'] = test_news_signals()
    
    # Test 4: FRED Macro
    results['macro_fred'] = test_macro_fred()
    
    # Regression: Dashboard
    results['dashboard_regression'] = test_dashboard_regression()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED! Data Audit endpoints are working correctly.")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. See details above.")
        sys.exit(1)


if __name__ == '__main__':
    main()
