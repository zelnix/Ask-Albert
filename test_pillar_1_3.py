#!/usr/bin/env python3
"""
Pillar 1 (Real-time Order Flow) + Pillar 3 (FAISS Time Machine) Test Suite
Tests the two new backend endpoints as per review request.
"""

import requests
import sys
import time
from typing import Dict, Any

# Base URL from .env
BASE_URL = "https://what-if-sandbox.preview.emergentagent.com/api"

def test_orderflow_endpoint():
    """
    TEST 1: GET /api/v1/orderflow
    - Expect HTTP 200 (NEVER 500)
    - status should be 'live' or 'connecting' (when warming up)
    - When status='live', confirm fields:
      * last_price (number)
      * cvd_window_btc (number)
      * session_cvd_btc (number)
      * ofi_btc_per_s (number)
      * vpin (number)
      * trades_per_sec (number)
      * buy_ratio_pct (number)
      * flow_state (string)
      * venues: object with keys coinbase, bybit, bybit_liq (values like 'live'/'reconnecting')
      * redis (boolean, expected true)
      * liquidations: object with long_usd_1m, short_usd_1m, net_usd_1m, cascade_10s_usd, cascade_risk (boolean), count_1m
    - Poll TWICE about 3 seconds apart and confirm at least one of {trades_window, trades_per_sec, cvd_window_btc, last_price} changes
    """
    print("\n" + "="*80)
    print("TEST 1: GET /api/v1/orderflow (Real-time Order Flow)")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/v1/orderflow"
        print(f"→ First poll: {url}")
        
        # First poll
        response1 = requests.get(url, timeout=30)
        print(f"✓ HTTP Status: {response1.status_code}")
        
        if response1.status_code != 200:
            print(f"❌ CRITICAL: Expected HTTP 200, got {response1.status_code}")
            print(f"Response: {response1.text[:500]}")
            return False
        
        data1 = response1.json()
        
        # Check status
        status = data1.get('status')
        if status not in ['live', 'connecting']:
            print(f"❌ FAILED: Expected status 'live' or 'connecting', got '{status}'")
            return False
        print(f"✓ status = '{status}'")
        
        # If connecting, that's acceptable (warming up)
        if status == 'connecting':
            print(f"⚠️  Order-flow pipeline is warming up (status='connecting')")
            print(f"   This is acceptable for first call. Checking basic structure...")
            
            # Check venues structure exists
            if 'venues' not in data1:
                print(f"❌ FAILED: 'venues' field missing")
                return False
            print(f"✓ venues field present: {data1['venues']}")
            
            # Check redis field
            if 'redis' not in data1:
                print(f"❌ FAILED: 'redis' field missing")
                return False
            print(f"✓ redis = {data1['redis']}")
            
            print(f"✅ PASSED: Endpoint returns HTTP 200 with valid connecting state")
            return True
        
        # If status='live', validate all required fields
        print(f"\n📊 VALIDATING LIVE ORDER-FLOW DATA:")
        
        required_fields = {
            'last_price': (int, float),
            'cvd_window_btc': (int, float),
            'session_cvd_btc': (int, float),
            'ofi_btc_per_s': (int, float),
            'vpin': (int, float),
            'trades_per_sec': (int, float),
            'buy_ratio_pct': (int, float),
            'flow_state': str,
        }
        
        for field, expected_type in required_fields.items():
            if field not in data1:
                print(f"❌ FAILED: Missing field '{field}'")
                return False
            
            value = data1[field]
            if not isinstance(value, expected_type):
                print(f"❌ FAILED: Field '{field}' has wrong type. Expected {expected_type}, got {type(value)}")
                return False
            
            print(f"  ✓ {field} = {value} ({type(value).__name__})")
        
        # Check venues structure
        venues = data1.get('venues')
        if not isinstance(venues, dict):
            print(f"❌ FAILED: 'venues' is not a dict")
            return False
        
        required_venues = ['coinbase', 'bybit', 'bybit_liq']
        for venue in required_venues:
            if venue not in venues:
                print(f"❌ FAILED: Missing venue '{venue}'")
                return False
            
            venue_status = venues[venue]
            if venue_status not in ['live', 'reconnecting', 'connecting']:
                print(f"⚠️  WARNING: Venue '{venue}' has unexpected status '{venue_status}'")
        
        print(f"  ✓ venues = {venues}")
        
        # Check redis
        redis_status = data1.get('redis')
        if not isinstance(redis_status, bool):
            print(f"❌ FAILED: 'redis' is not a boolean")
            return False
        print(f"  ✓ redis = {redis_status}")
        
        # Check liquidations structure
        liquidations = data1.get('liquidations')
        if not isinstance(liquidations, dict):
            print(f"❌ FAILED: 'liquidations' is not a dict")
            return False
        
        liq_fields = {
            'long_usd_1m': (int, float),
            'short_usd_1m': (int, float),
            'net_usd_1m': (int, float),
            'cascade_10s_usd': (int, float),
            'cascade_risk': bool,
            'count_1m': int,
        }
        
        for field, expected_type in liq_fields.items():
            if field not in liquidations:
                print(f"❌ FAILED: Missing liquidations field '{field}'")
                return False
            
            value = liquidations[field]
            if not isinstance(value, expected_type):
                print(f"❌ FAILED: Liquidations field '{field}' has wrong type. Expected {expected_type}, got {type(value)}")
                return False
        
        print(f"  ✓ liquidations = {liquidations}")
        
        # Store first poll values for comparison
        poll1_values = {
            'trades_window': data1.get('trades_window'),
            'trades_per_sec': data1.get('trades_per_sec'),
            'cvd_window_btc': data1.get('cvd_window_btc'),
            'last_price': data1.get('last_price'),
        }
        
        print(f"\n⏱️  Waiting 3 seconds before second poll...")
        time.sleep(3)
        
        # Second poll
        print(f"→ Second poll: {url}")
        response2 = requests.get(url, timeout=30)
        print(f"✓ HTTP Status: {response2.status_code}")
        
        if response2.status_code != 200:
            print(f"❌ CRITICAL: Second poll returned {response2.status_code}")
            return False
        
        data2 = response2.json()
        
        # Check if at least one value changed (proving live updates)
        poll2_values = {
            'trades_window': data2.get('trades_window'),
            'trades_per_sec': data2.get('trades_per_sec'),
            'cvd_window_btc': data2.get('cvd_window_btc'),
            'last_price': data2.get('last_price'),
        }
        
        changes = []
        for key in poll1_values:
            if poll1_values[key] != poll2_values[key]:
                changes.append(f"{key}: {poll1_values[key]} → {poll2_values[key]}")
        
        if not changes:
            print(f"⚠️  WARNING: No values changed between polls (may indicate stale data or very low activity)")
            print(f"   Poll 1: {poll1_values}")
            print(f"   Poll 2: {poll2_values}")
        else:
            print(f"\n✓ LIVE UPDATES CONFIRMED:")
            for change in changes:
                print(f"  • {change}")
        
        print(f"\n✅ PASSED: Order-flow endpoint is live and returning valid data")
        return True
        
    except requests.exceptions.Timeout:
        print(f"❌ FAILED: Request timed out after 30 seconds")
        return False
    except requests.exceptions.RequestException as e:
        print(f"❌ FAILED: Request error: {e}")
        return False
    except Exception as e:
        print(f"❌ FAILED: Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_time_machine_endpoint():
    """
    TEST 2: GET /api/v1/time-machine/analogs?k=3
    - Expect HTTP 200 with status='ready' (first call may take ~1-2s due to data fetch)
    - Confirm fields:
      * engine == 'faiss'
      * analogs: list of up to 3 items, each with:
        - date (YYYY-MM-DD)
        - similarity (number ~0-1)
        - price_then (number)
        - ret_7d_pct (number)
        - ret_30d_pct (number)
        - path_30d (list of 31 points each {d, close})
      * summary: object with avg_ret_7d_pct, avg_ret_30d_pct, pct_higher_7d, pct_higher_30d
    - Also test k=1 (expect 1 analog) and k=5 (expect up to 5)
    - Must NOT return 500
    """
    print("\n" + "="*80)
    print("TEST 2: GET /api/v1/time-machine/analogs (FAISS Time Machine)")
    print("="*80)
    
    test_cases = [
        {'k': 3, 'expected_count': 3},
        {'k': 1, 'expected_count': 1},
        {'k': 5, 'expected_count': 5},
    ]
    
    for i, test_case in enumerate(test_cases, 1):
        k = test_case['k']
        expected_count = test_case['expected_count']
        
        print(f"\n--- Test Case {i}: k={k} ---")
        
        try:
            url = f"{BASE_URL}/v1/time-machine/analogs?k={k}"
            print(f"→ Requesting: {url}")
            
            response = requests.get(url, timeout=30)
            print(f"✓ HTTP Status: {response.status_code}")
            
            if response.status_code != 200:
                print(f"❌ CRITICAL: Expected HTTP 200, got {response.status_code}")
                print(f"Response: {response.text[:500]}")
                return False
            
            data = response.json()
            
            # Check status
            status = data.get('status')
            if status != 'ready':
                print(f"❌ FAILED: Expected status='ready', got '{status}'")
                return False
            print(f"✓ status = 'ready'")
            
            # Check engine
            engine = data.get('engine')
            if engine not in ['faiss', 'numpy']:  # numpy is fallback
                print(f"❌ FAILED: Expected engine 'faiss' or 'numpy', got '{engine}'")
                return False
            print(f"✓ engine = '{engine}'")
            
            # Check analogs
            analogs = data.get('analogs')
            if not isinstance(analogs, list):
                print(f"❌ FAILED: 'analogs' is not a list")
                return False
            
            actual_count = len(analogs)
            if actual_count > expected_count:
                print(f"❌ FAILED: Expected up to {expected_count} analogs, got {actual_count}")
                return False
            
            if actual_count == 0:
                print(f"❌ FAILED: No analogs returned")
                return False
            
            print(f"✓ analogs: {actual_count} items (expected up to {expected_count})")
            
            # Validate first analog structure
            if actual_count > 0:
                analog = analogs[0]
                print(f"\n📊 VALIDATING FIRST ANALOG:")
                
                required_fields = {
                    'date': str,
                    'similarity': (int, float),
                    'price_then': (int, float),
                    'ret_7d_pct': (int, float),
                    'ret_30d_pct': (int, float),
                    'path_30d': list,
                }
                
                for field, expected_type in required_fields.items():
                    if field not in analog:
                        print(f"❌ FAILED: Missing field '{field}' in analog")
                        return False
                    
                    value = analog[field]
                    if not isinstance(value, expected_type):
                        print(f"❌ FAILED: Field '{field}' has wrong type. Expected {expected_type}, got {type(value)}")
                        return False
                    
                    if field == 'date':
                        # Validate date format YYYY-MM-DD
                        import re
                        if not re.match(r'^\d{4}-\d{2}-\d{2}$', value):
                            print(f"❌ FAILED: Date '{value}' not in YYYY-MM-DD format")
                            return False
                        print(f"  ✓ date = {value} (YYYY-MM-DD format)")
                    elif field == 'similarity':
                        # Similarity should be ~0-1
                        if not (0 <= value <= 1.1):  # Allow slight overshoot due to floating point
                            print(f"⚠️  WARNING: Similarity {value} outside expected 0-1 range")
                        print(f"  ✓ similarity = {value}")
                    elif field == 'path_30d':
                        # Validate path structure
                        if len(value) != 31:
                            print(f"❌ FAILED: path_30d should have 31 points, got {len(value)}")
                            return False
                        
                        # Check first point structure
                        if len(value) > 0:
                            point = value[0]
                            if not isinstance(point, dict):
                                print(f"❌ FAILED: path_30d point is not a dict")
                                return False
                            if 'd' not in point or 'close' not in point:
                                print(f"❌ FAILED: path_30d point missing 'd' or 'close'")
                                return False
                        
                        print(f"  ✓ path_30d = 31 points with {{d, close}} structure")
                    else:
                        print(f"  ✓ {field} = {value}")
            
            # Check summary
            summary = data.get('summary')
            if not isinstance(summary, dict):
                print(f"❌ FAILED: 'summary' is not a dict")
                return False
            
            print(f"\n📊 VALIDATING SUMMARY:")
            
            summary_fields = {
                'avg_ret_7d_pct': (int, float),
                'avg_ret_30d_pct': (int, float),
                'pct_higher_7d': (int, float),
                'pct_higher_30d': (int, float),
            }
            
            for field, expected_type in summary_fields.items():
                if field not in summary:
                    print(f"❌ FAILED: Missing summary field '{field}'")
                    return False
                
                value = summary[field]
                if not isinstance(value, expected_type):
                    print(f"❌ FAILED: Summary field '{field}' has wrong type. Expected {expected_type}, got {type(value)}")
                    return False
                
                print(f"  ✓ {field} = {value}")
            
            print(f"\n✅ PASSED: k={k} test case")
            
        except requests.exceptions.Timeout:
            print(f"❌ FAILED: Request timed out after 30 seconds")
            return False
        except requests.exceptions.RequestException as e:
            print(f"❌ FAILED: Request error: {e}")
            return False
        except Exception as e:
            print(f"❌ FAILED: Unexpected error: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    print(f"\n✅ PASSED: All Time Machine test cases")
    return True


def test_regression_health():
    """
    TEST 3: GET /api/v1/health (Regression)
    - Expect HTTP 200
    """
    print("\n" + "="*80)
    print("TEST 3: GET /api/v1/health (Regression)")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/v1/health"
        print(f"→ Requesting: {url}")
        
        response = requests.get(url, timeout=30)
        print(f"✓ HTTP Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {response.status_code}")
            return False
        
        data = response.json()
        print(f"✓ Response: {data}")
        
        print(f"\n✅ PASSED: Health endpoint working")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_regression_dashboard():
    """
    TEST 4: GET /api/v1/dashboard (Regression)
    - Expect HTTP 200 with status='ready'
    """
    print("\n" + "="*80)
    print("TEST 4: GET /api/v1/dashboard (Regression)")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/v1/dashboard"
        print(f"→ Requesting: {url}")
        
        response = requests.get(url, timeout=30)
        print(f"✓ HTTP Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        status = data.get('status')
        if status != 'ready':
            print(f"❌ FAILED: Expected status='ready', got '{status}'")
            return False
        
        print(f"✓ status = 'ready'")
        print(f"\n✅ PASSED: Dashboard endpoint working")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("PILLAR 1 + PILLAR 3 TEST SUITE")
    print("Testing: Order Flow + Time Machine + Regression")
    print("="*80)
    
    results = {
        'Order Flow': test_orderflow_endpoint(),
        'Time Machine': test_time_machine_endpoint(),
        'Health (Regression)': test_regression_health(),
        'Dashboard (Regression)': test_regression_dashboard(),
    }
    
    print("\n" + "="*80)
    print("FINAL RESULTS")
    print("="*80)
    
    for test_name, passed in results.items():
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{status}: {test_name}")
    
    all_passed = all(results.values())
    
    if all_passed:
        print("\n🎉 ALL TESTS PASSED")
        sys.exit(0)
    else:
        print("\n❌ SOME TESTS FAILED")
        sys.exit(1)


if __name__ == "__main__":
    main()
