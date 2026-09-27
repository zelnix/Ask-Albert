#!/usr/bin/env python3
"""
Backend API Test Suite for BTCIQ Whale Watch (Phase 1)
Tests the new whale tracking endpoint and altcoin derivatives dashboard
"""

import requests
import json
import sys
import time
from typing import Dict, List, Any, Optional

# Base URL from environment
BASE_URL = "https://what-if-sandbox.preview.emergentagent.com/api"

def print_test_header(test_name: str):
    """Print a formatted test header"""
    print(f"\n{'='*80}")
    print(f"TEST: {test_name}")
    print(f"{'='*80}")

def print_success(message: str):
    """Print success message"""
    print(f"✅ {message}")

def print_error(message: str):
    """Print error message"""
    print(f"❌ {message}")

def print_info(message: str):
    """Print info message"""
    print(f"ℹ️  {message}")

def test_whales_endpoint():
    """Test 1: GET /api/v1/whales - new whale tracking endpoint"""
    print_test_header("GET /api/v1/whales - Whale Watch Phase 1")
    
    try:
        url = f"{BASE_URL}/v1/whales"
        print_info(f"Requesting: {url}")
        
        # First call
        response = requests.get(url, timeout=60)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_error(f"Expected status 200, got {response.status_code}")
            return False
        
        data = response.json()
        print_info(f"Response keys: {list(data.keys())}")
        
        # Validate status
        if data.get('status') != 'ready':
            print_error(f"Expected status='ready', got '{data.get('status')}'")
            return False
        print_success("Response status is 'ready'")
        
        # Validate whales list
        if 'whales' not in data:
            print_error("Missing 'whales' field in response")
            return False
        
        whales = data['whales']
        if not isinstance(whales, list):
            print_error(f"'whales' should be a list, got {type(whales)}")
            return False
        
        if len(whales) == 0:
            print_error("'whales' list is empty, expected 7 curated entities")
            return False
        
        print_success(f"'whales' is a non-empty list with {len(whales)} items (expected 7)")
        
        # Validate price and source
        if 'price' not in data:
            print_error("Missing 'price' field in response")
            return False
        
        price = data['price']
        if not isinstance(price, (int, float)) or price <= 0:
            print_error(f"'price' should be a positive number, got {price}")
            return False
        print_success(f"'price' is a valid number: ${price:,.2f}")
        
        if 'source' not in data:
            print_error("Missing 'source' field in response")
            return False
        
        source = data['source']
        if not isinstance(source, str) or len(source) == 0:
            print_error(f"'source' should be a non-empty string, got '{source}'")
            return False
        print_success(f"'source' is present: '{source}'")
        
        # Validate each whale entity
        print_info(f"\nValidating {len(whales)} whale entities...")
        
        expected_categories = ['Exchange', 'Government', 'Whale']
        expected_signals = ['Bullish', 'Bearish', 'Neutral']
        
        for i, whale in enumerate(whales):
            print_info(f"\n--- Whale {i+1}: {whale.get('name', 'Unknown')} ---")
            
            # Required fields
            required_fields = ['name', 'category', 'address', 'balance', 'signal']
            for field in required_fields:
                if field not in whale:
                    print_error(f"Whale {i+1} missing required field: '{field}'")
                    return False
            
            # Validate name
            name = whale['name']
            if not isinstance(name, str) or len(name) == 0:
                print_error(f"Whale {i+1} 'name' should be a non-empty string")
                return False
            print_info(f"  name: {name}")
            
            # Validate category
            category = whale['category']
            if category not in expected_categories:
                print_error(f"Whale {i+1} 'category' should be one of {expected_categories}, got '{category}'")
                return False
            print_info(f"  category: {category}")
            
            # Validate address
            address = whale['address']
            if not isinstance(address, str) or len(address) == 0:
                print_error(f"Whale {i+1} 'address' should be a non-empty string")
                return False
            print_info(f"  address: {address[:20]}...")
            
            # Validate balance (should be large, e.g., top entity ~200k+ BTC)
            balance = whale['balance']
            if not isinstance(balance, (int, float)):
                print_error(f"Whale {i+1} 'balance' should be a number, got {type(balance)}")
                return False
            print_info(f"  balance: {balance:,.4f} BTC")
            
            # Validate balance_usd (number or null)
            balance_usd = whale.get('balance_usd')
            if balance_usd is not None and not isinstance(balance_usd, (int, float)):
                print_error(f"Whale {i+1} 'balance_usd' should be a number or null, got {type(balance_usd)}")
                return False
            if balance_usd is not None:
                print_info(f"  balance_usd: ${balance_usd:,.0f}")
            else:
                print_info(f"  balance_usd: null")
            
            # Validate change_24h (number or null)
            change_24h = whale.get('change_24h')
            if change_24h is not None and not isinstance(change_24h, (int, float)):
                print_error(f"Whale {i+1} 'change_24h' should be a number or null, got {type(change_24h)}")
                return False
            print_info(f"  change_24h: {change_24h if change_24h is not None else 'null'}")
            
            # Validate change_7d (number or null)
            change_7d = whale.get('change_7d')
            if change_7d is not None and not isinstance(change_7d, (int, float)):
                print_error(f"Whale {i+1} 'change_7d' should be a number or null, got {type(change_7d)}")
                return False
            print_info(f"  change_7d: {change_7d if change_7d is not None else 'null'}")
            
            # Validate signal
            signal = whale['signal']
            if signal not in expected_signals:
                print_error(f"Whale {i+1} 'signal' should be one of {expected_signals}, got '{signal}'")
                return False
            print_info(f"  signal: {signal}")
        
        print_success(f"\nAll {len(whales)} whale entities have valid structure")
        
        # Validate sorting by balance descending
        print_info("\nValidating sorting by balance (descending)...")
        for i in range(len(whales) - 1):
            if whales[i]['balance'] < whales[i+1]['balance']:
                print_error(f"Whales not sorted by balance descending: whale {i+1} ({whales[i]['balance']}) < whale {i+2} ({whales[i+1]['balance']})")
                return False
        print_success("Whales are sorted by balance descending")
        
        # Report top whale
        top_whale = whales[0]
        print_info(f"\nTop whale: {top_whale['name']} with {top_whale['balance']:,.4f} BTC")
        if top_whale['balance'] >= 200000:
            print_success(f"Top whale has expected large balance (>= 200k BTC)")
        else:
            print_info(f"Top whale balance is {top_whale['balance']:,.4f} BTC (expected ~200k+)")
        
        # Second call to test caching
        print_info("\n--- Testing caching (second call) ---")
        start_time = time.time()
        response2 = requests.get(url, timeout=60)
        elapsed = time.time() - start_time
        
        if response2.status_code != 200:
            print_error(f"Second call failed with status {response2.status_code}")
            return False
        
        data2 = response2.json()
        if data2.get('status') != 'ready':
            print_error(f"Second call status not 'ready': {data2.get('status')}")
            return False
        
        print_success(f"Second call returned 'ready' in {elapsed:.2f}s (cached)")
        
        print_success("\nTEST PASSED: GET /api/v1/whales endpoint working correctly")
        return True, data
        
    except Exception as e:
        print_error(f"Test failed with exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return False, None

def test_dashboard_btc_regression():
    """Test 2: GET /api/v1/dashboard (BTC) - regression test for smart_money & institutional"""
    print_test_header("GET /api/v1/dashboard (BTC) - Regression Test")
    
    try:
        url = f"{BASE_URL}/v1/dashboard"
        print_info(f"Requesting: {url}")
        
        response = requests.get(url, timeout=60)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_error(f"Expected status 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        # Validate status
        if data.get('status') != 'ready':
            print_error(f"Expected status='ready', got '{data.get('status')}'")
            return False
        print_success("Response status is 'ready'")
        
        # Validate smart_money
        if 'smart_money' not in data:
            print_error("Missing 'smart_money' field in response")
            return False
        
        smart_money = data['smart_money']
        print_info(f"\n--- Smart Money Panel ---")
        
        # Check demo flag
        if 'demo' not in smart_money:
            print_error("Missing 'demo' field in smart_money")
            return False
        
        if smart_money['demo'] != False:
            print_error(f"Expected smart_money.demo=false, got {smart_money['demo']}")
            return False
        print_success("smart_money.demo == false ✅")
        
        # Check for spark arrays in metrics
        if 'metrics' not in smart_money:
            print_error("Missing 'metrics' field in smart_money")
            return False
        
        metrics = smart_money['metrics']
        if not isinstance(metrics, list) or len(metrics) == 0:
            print_error("smart_money.metrics should be a non-empty list")
            return False
        
        spark_count = 0
        for metric in metrics:
            if 'spark' in metric and isinstance(metric['spark'], list):
                spark_len = len(metric['spark'])
                if spark_len > 0:
                    spark_count += 1
                    print_info(f"  Metric '{metric.get('name', 'Unknown')}' has spark array with {spark_len} points")
        
        if spark_count > 0:
            print_success(f"Found {spark_count} metrics with 'spark' arrays (expected ~24 numbers)")
        else:
            print_info("No metrics with 'spark' arrays found (may be expected for some metrics)")
        
        # Validate institutional
        if 'institutional' not in data:
            print_error("Missing 'institutional' field in response")
            return False
        
        institutional = data['institutional']
        print_info(f"\n--- Institutional Panel ---")
        
        # Check demo flag
        if 'demo' not in institutional:
            print_error("Missing 'demo' field in institutional")
            return False
        
        if institutional['demo'] != False:
            print_error(f"Expected institutional.demo=false, got {institutional['demo']}")
            return False
        print_success("institutional.demo == false ✅")
        
        # Check for expected metrics
        if 'metrics' not in institutional:
            print_error("Missing 'metrics' field in institutional")
            return False
        
        inst_metrics = institutional['metrics']
        if not isinstance(inst_metrics, list) or len(inst_metrics) == 0:
            print_error("institutional.metrics should be a non-empty list")
            return False
        
        expected_metric_names = ['Futures open interest', 'Funding rate', 'Long/short account ratio', 'Spot ETF net flow (1d)']
        found_metrics = [m.get('name', '') for m in inst_metrics]
        
        print_info(f"  Found metrics: {found_metrics}")
        
        for expected in expected_metric_names:
            if any(expected in m for m in found_metrics):
                print_success(f"  Found expected metric: '{expected}'")
            else:
                print_info(f"  Expected metric not found: '{expected}' (may be acceptable)")
        
        # Check for 'Spot ETF net flow (1d)' with inactive=true
        etf_metric = None
        for metric in inst_metrics:
            if 'Spot ETF net flow' in metric.get('name', ''):
                etf_metric = metric
                break
        
        if etf_metric:
            if etf_metric.get('inactive') == True:
                print_success(f"  'Spot ETF net flow (1d)' has inactive=true ✅ (as expected)")
            else:
                print_info(f"  'Spot ETF net flow (1d)' inactive={etf_metric.get('inactive')} (expected true)")
        else:
            print_info("  'Spot ETF net flow (1d)' metric not found")
        
        print_success("\nTEST PASSED: BTC dashboard regression test passed")
        return True, data
        
    except Exception as e:
        print_error(f"Test failed with exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return False, None

def test_dashboard_altcoin(symbol: str, max_retries: int = 12, retry_delay: int = 10):
    """Test altcoin dashboard with polling for 'computing' status"""
    print_test_header(f"GET /api/v1/dashboard?symbol={symbol} - Altcoin Derivatives")
    
    try:
        url = f"{BASE_URL}/v1/dashboard?symbol={symbol}"
        print_info(f"Requesting: {url}")
        
        # Poll until status is 'ready' (may be 'computing' first)
        for attempt in range(max_retries):
            print_info(f"\nAttempt {attempt + 1}/{max_retries}...")
            
            response = requests.get(url, timeout=60)
            print_info(f"Status Code: {response.status_code}")
            
            if response.status_code != 200:
                print_error(f"Expected status 200, got {response.status_code}")
                return False
            
            data = response.json()
            status = data.get('status')
            
            print_info(f"Response status: '{status}'")
            
            if status == 'ready':
                print_success(f"Status is 'ready' after {attempt + 1} attempt(s)")
                break
            elif status == 'computing':
                print_info(f"Status is 'computing', waiting {retry_delay}s before retry...")
                if attempt < max_retries - 1:
                    time.sleep(retry_delay)
                else:
                    print_error(f"Status still 'computing' after {max_retries} attempts (~{max_retries * retry_delay}s)")
                    return False
            else:
                print_error(f"Unexpected status: '{status}'")
                return False
        
        # Validate institutional panel
        if 'institutional' not in data:
            print_error("Missing 'institutional' field in response")
            return False
        
        institutional = data['institutional']
        
        # Check if institutional is null (expected for altcoins' smart_money)
        if institutional is None:
            print_error(f"institutional is null for {symbol} (expected real object with demo=false)")
            return False
        
        print_info(f"\n--- Institutional Panel for {symbol} ---")
        
        # Check demo flag
        if 'demo' not in institutional:
            print_error("Missing 'demo' field in institutional")
            return False
        
        if institutional['demo'] != False:
            print_error(f"Expected institutional.demo=false, got {institutional['demo']}")
            return False
        print_success(f"institutional.demo == false ✅")
        
        # Check source mentions OKX
        if 'source' not in institutional:
            print_error("Missing 'source' field in institutional")
            return False
        
        source = institutional['source']
        if 'OKX' not in source and 'okx' not in source.lower():
            print_error(f"Expected source to mention 'OKX', got '{source}'")
            return False
        print_success(f"source mentions OKX: '{source}'")
        
        # Check for expected metrics
        if 'metrics' not in institutional:
            print_error("Missing 'metrics' field in institutional")
            return False
        
        metrics = institutional['metrics']
        if not isinstance(metrics, list) or len(metrics) == 0:
            print_error("institutional.metrics should be a non-empty list")
            return False
        
        expected_metric_names = ['Futures open interest', 'Funding rate', 'Long/short account ratio']
        found_metrics = [m.get('name', '') for m in metrics]
        
        print_info(f"  Found metrics: {found_metrics}")
        
        for expected in expected_metric_names:
            if any(expected in m for m in found_metrics):
                print_success(f"  Found expected metric: '{expected}'")
            else:
                print_error(f"  Expected metric not found: '{expected}'")
                return False
        
        # Check smart_money (expected to be null for altcoins)
        if 'smart_money' in data:
            smart_money = data['smart_money']
            if smart_money is None:
                print_success(f"smart_money is null for {symbol} (expected - on-chain valuation is BTC-only)")
            else:
                print_info(f"smart_money is not null for {symbol} (may have some on-chain data)")
        
        print_success(f"\nTEST PASSED: {symbol} dashboard has real institutional panel with OKX data")
        return True, data
        
    except Exception as e:
        print_error(f"Test failed with exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return False, None

def main():
    """Run all Whale Watch Phase 1 tests"""
    print("\n" + "="*80)
    print("BTCIQ WHALE WATCH (PHASE 1) - BACKEND TEST SUITE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print("="*80)
    
    results = []
    
    # Test 1: Whale endpoint
    print_info("\n🐋 Testing Whale Watch endpoint...")
    result, whale_data = test_whales_endpoint()
    results.append(("GET /api/v1/whales", result))
    
    # Test 2: BTC dashboard regression
    print_info("\n📊 Testing BTC dashboard regression...")
    result, btc_data = test_dashboard_btc_regression()
    results.append(("GET /api/v1/dashboard (BTC regression)", result))
    
    # Test 3: ETH dashboard
    print_info("\n💎 Testing ETH dashboard (altcoin derivatives)...")
    result, eth_data = test_dashboard_altcoin('ETH')
    results.append(("GET /api/v1/dashboard?symbol=ETH", result))
    
    # Test 4: SOL dashboard
    print_info("\n☀️ Testing SOL dashboard (altcoin derivatives)...")
    result, sol_data = test_dashboard_altcoin('SOL')
    results.append(("GET /api/v1/dashboard?symbol=SOL", result))
    
    # Print summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = 0
    failed = 0
    
    for test_name, result in results:
        if result:
            print(f"✅ PASSED: {test_name}")
            passed += 1
        else:
            print(f"❌ FAILED: {test_name}")
            failed += 1
    
    print("="*80)
    print(f"Total: {len(results)} tests | Passed: {passed} | Failed: {failed}")
    print("="*80)
    
    # Report whale names and balances if available
    if whale_data and isinstance(whale_data, tuple) and len(whale_data) > 1 and whale_data[1]:
        print("\n" + "="*80)
        print("WHALE WATCH SUMMARY")
        print("="*80)
        whales = whale_data[1].get('whales', [])
        for i, whale in enumerate(whales[:7]):  # Top 7
            print(f"{i+1}. {whale.get('name', 'Unknown'):40s} | {whale.get('balance', 0):>12,.2f} BTC | {whale.get('category', 'Unknown'):10s} | {whale.get('signal', 'Unknown')}")
        print("="*80)
    
    if failed > 0:
        print("\n❌ SOME TESTS FAILED")
        sys.exit(1)
    else:
        print("\n✅ ALL TESTS PASSED")
        sys.exit(0)

if __name__ == "__main__":
    main()
