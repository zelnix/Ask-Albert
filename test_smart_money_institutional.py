#!/usr/bin/env python3
"""
Backend API Test Suite for Smart Money & Institutional Panels
Tests the NEW real data panels (replacing DEMO) using free live data sources
"""

import requests
import json
import sys
import time
from typing import Dict, List, Any

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

def test_dashboard_initial():
    """Test 1: GET /api/v1/dashboard - check initial state of smart_money and institutional"""
    print_test_header("GET /api/v1/dashboard - Initial State Check")
    
    try:
        url = f"{BASE_URL}/v1/dashboard"
        print_info(f"Requesting: {url}")
        
        response = requests.get(url, timeout=30)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_error(f"Expected status 200, got {response.status_code}")
            return False, None
        
        data = response.json()
        
        # Check status
        if data.get('status') != 'ready':
            print_error(f"Expected status='ready', got '{data.get('status')}'")
            return False, None
        print_success("Dashboard status is 'ready'")
        
        # Check for smart_money and institutional objects
        if 'smart_money' not in data:
            print_error("Missing 'smart_money' field in dashboard response")
            return False, None
        if 'institutional' not in data:
            print_error("Missing 'institutional' field in dashboard response")
            return False, None
        print_success("Both 'smart_money' and 'institutional' objects present")
        
        smart_money = data['smart_money']
        institutional = data['institutional']
        
        # Check demo status
        sm_demo = smart_money.get('demo')
        inst_demo = institutional.get('demo')
        
        print_info(f"smart_money.demo = {sm_demo}")
        print_info(f"institutional.demo = {inst_demo}")
        
        return True, data
        
    except Exception as e:
        print_error(f"Test failed with exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return False, None

def test_refresh_and_poll():
    """Test 2: POST /api/v1/refresh and poll until panels become demo:false"""
    print_test_header("POST /api/v1/refresh and Poll for Real Data")
    
    try:
        # Trigger refresh
        refresh_url = f"{BASE_URL}/v1/refresh"
        print_info(f"POST {refresh_url}")
        
        refresh_response = requests.post(refresh_url, timeout=30)
        print_info(f"Refresh Status Code: {refresh_response.status_code}")
        
        if refresh_response.status_code != 200:
            print_error(f"Expected status 200, got {refresh_response.status_code}")
            return False, None
        
        refresh_data = refresh_response.json()
        print_info(f"Refresh response: {refresh_data}")
        print_success("Refresh triggered successfully")
        
        # Poll dashboard for up to 2 minutes
        print_info("Polling dashboard for up to 2 minutes until demo:false...")
        max_attempts = 24  # 24 attempts * 5 seconds = 2 minutes
        attempt = 0
        
        dashboard_url = f"{BASE_URL}/v1/dashboard"
        
        while attempt < max_attempts:
            attempt += 1
            print_info(f"Poll attempt {attempt}/{max_attempts}...")
            
            time.sleep(5)  # Wait 5 seconds between polls
            
            response = requests.get(dashboard_url, timeout=30)
            if response.status_code != 200:
                print_error(f"Dashboard returned status {response.status_code}")
                continue
            
            data = response.json()
            
            if data.get('status') != 'ready':
                print_info(f"Dashboard status: {data.get('status')} (waiting for 'ready')")
                continue
            
            smart_money = data.get('smart_money', {})
            institutional = data.get('institutional', {})
            
            sm_demo = smart_money.get('demo')
            inst_demo = institutional.get('demo')
            
            print_info(f"smart_money.demo = {sm_demo}, institutional.demo = {inst_demo}")
            
            if sm_demo == False and inst_demo == False:
                print_success(f"Both panels now have demo:false after {attempt} attempts ({attempt * 5}s)")
                return True, data
            
            if sm_demo == False:
                print_info("smart_money is now demo:false (waiting for institutional)")
            if inst_demo == False:
                print_info("institutional is now demo:false (waiting for smart_money)")
        
        # Timeout reached
        print_error(f"Timeout: Panels did not become demo:false after {max_attempts * 5} seconds")
        return False, None
        
    except Exception as e:
        print_error(f"Test failed with exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return False, None

def validate_smart_money(smart_money: Dict[str, Any]):
    """Validate smart_money object structure and content"""
    print_test_header("Validate smart_money Panel")
    
    try:
        # Check demo field
        demo = smart_money.get('demo')
        if demo != False:
            print_error(f"Expected demo=false, got demo={demo}")
            return False
        print_success("demo == false ✅")
        
        # Check source field
        source = smart_money.get('source')
        if not source or not isinstance(source, str) or len(source) == 0:
            print_error(f"source is empty or invalid: {source}")
            return False
        print_success(f"source is non-empty string: '{source[:100]}...'")
        
        # Check if source mentions expected providers
        source_lower = source.lower()
        expected_providers = ['bgeometrics', 'blockchain.com', 'glassnode', 'bitcoin-data.com']
        found_providers = [p for p in expected_providers if p in source_lower]
        if found_providers:
            print_success(f"source mentions expected providers: {found_providers}")
        else:
            print_info(f"source does not mention expected providers (may be OK): {source}")
        
        # Check headline field
        headline = smart_money.get('headline')
        if not headline or not isinstance(headline, str) or len(headline) == 0:
            print_error(f"headline is empty or invalid: {headline}")
            return False
        print_success(f"headline is non-empty string: '{headline}'")
        
        # Check metrics field
        metrics = smart_money.get('metrics')
        if not metrics or not isinstance(metrics, list) or len(metrics) == 0:
            print_error(f"metrics is empty or invalid: {metrics}")
            return False
        print_success(f"metrics is non-empty list with {len(metrics)} items")
        
        # Validate each metric
        expected_metric_names = ['MVRV Z-score', 'SOPR', 'Active addresses', 'Fear & Greed']
        found_metrics = []
        
        for i, metric in enumerate(metrics):
            if not isinstance(metric, dict):
                print_error(f"Metric {i} is not a dict: {metric}")
                return False
            
            # Check required fields
            name = metric.get('name')
            value = metric.get('value')
            signal = metric.get('signal')
            
            if not name or not isinstance(name, str):
                print_error(f"Metric {i} has invalid name: {name}")
                return False
            
            if not value or not isinstance(value, str):
                print_error(f"Metric {i} has invalid value: {value}")
                return False
            
            if signal not in ['Bullish', 'Bearish', 'Neutral']:
                print_error(f"Metric {i} has invalid signal: {signal} (expected Bullish/Bearish/Neutral)")
                return False
            
            found_metrics.append(name)
            print_info(f"Metric {i+1}: name='{name}', value='{value}', signal='{signal}' ✅")
        
        # Check for expected metric names
        for expected in expected_metric_names:
            matching = [m for m in found_metrics if expected in m]
            if matching:
                print_success(f"Found expected metric containing '{expected}': {matching}")
            else:
                print_info(f"Did not find metric containing '{expected}' (may be OK)")
        
        print_success("smart_money panel validation PASSED ✅")
        return True
        
    except Exception as e:
        print_error(f"Validation failed with exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def validate_institutional(institutional: Dict[str, Any]):
    """Validate institutional object structure and content"""
    print_test_header("Validate institutional Panel")
    
    try:
        # Check demo field
        demo = institutional.get('demo')
        if demo != False:
            print_error(f"Expected demo=false, got demo={demo}")
            return False
        print_success("demo == false ✅")
        
        # Check source field
        source = institutional.get('source')
        if not source or not isinstance(source, str) or len(source) == 0:
            print_error(f"source is empty or invalid: {source}")
            return False
        print_success(f"source is non-empty string: '{source[:100]}...'")
        
        # Check if source mentions OKX
        if 'okx' not in source.lower():
            print_error(f"source does not mention OKX: {source}")
            return False
        print_success("source mentions OKX ✅")
        
        # Check headline field
        headline = institutional.get('headline')
        if not headline or not isinstance(headline, str) or len(headline) == 0:
            print_error(f"headline is empty or invalid: {headline}")
            return False
        print_success(f"headline is non-empty string: '{headline}'")
        
        # Check metrics field
        metrics = institutional.get('metrics')
        if not metrics or not isinstance(metrics, list) or len(metrics) == 0:
            print_error(f"metrics is empty or invalid: {metrics}")
            return False
        print_success(f"metrics is non-empty list with {len(metrics)} items")
        
        # Validate each metric
        expected_metric_names = [
            'Futures open interest',
            'Funding rate',
            'Long/short account ratio',
            'Taker buy/sell ratio',
            'Spot ETF net flow'
        ]
        found_metrics = []
        etf_metric_found = False
        etf_metric_inactive = False
        
        for i, metric in enumerate(metrics):
            if not isinstance(metric, dict):
                print_error(f"Metric {i} is not a dict: {metric}")
                return False
            
            # Check required fields
            name = metric.get('name')
            value = metric.get('value')
            signal = metric.get('signal')
            
            if not name or not isinstance(name, str):
                print_error(f"Metric {i} has invalid name: {name}")
                return False
            
            if not value or not isinstance(value, str):
                print_error(f"Metric {i} has invalid value: {value}")
                return False
            
            if signal not in ['Bullish', 'Bearish', 'Neutral']:
                print_error(f"Metric {i} has invalid signal: {signal} (expected Bullish/Bearish/Neutral)")
                return False
            
            found_metrics.append(name)
            
            # Check for ETF metric with inactive flag
            if 'Spot ETF' in name or 'ETF net flow' in name:
                etf_metric_found = True
                inactive = metric.get('inactive')
                if inactive == True:
                    etf_metric_inactive = True
                    print_success(f"Metric {i+1}: '{name}' has inactive=true (expected for ETF) ✅")
                else:
                    print_error(f"Metric {i+1}: '{name}' should have inactive=true but got inactive={inactive}")
                    return False
            
            print_info(f"Metric {i+1}: name='{name}', value='{value}', signal='{signal}' ✅")
        
        # Check for expected metric names
        for expected in expected_metric_names:
            matching = [m for m in found_metrics if expected in m]
            if matching:
                print_success(f"Found expected metric containing '{expected}': {matching}")
            else:
                print_info(f"Did not find metric containing '{expected}' (may be OK)")
        
        # CRITICAL: Check for ETF metric with inactive flag
        if not etf_metric_found:
            print_error("CRITICAL: 'Spot ETF net flow' metric NOT FOUND")
            return False
        print_success("'Spot ETF net flow' metric found ✅")
        
        if not etf_metric_inactive:
            print_error("CRITICAL: 'Spot ETF net flow' metric does NOT have inactive=true")
            return False
        print_success("'Spot ETF net flow' metric has inactive=true (marked Inactive) ✅")
        
        print_success("institutional panel validation PASSED ✅")
        return True
        
    except Exception as e:
        print_error(f"Validation failed with exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_regression(data: Dict[str, Any]):
    """Test 4: Regression - ensure other dashboard fields are still present"""
    print_test_header("Regression Test - Other Dashboard Fields")
    
    try:
        # Check status
        if data.get('status') != 'ready':
            print_error(f"Dashboard status is not 'ready': {data.get('status')}")
            return False
        print_success("status == 'ready' ✅")
        
        # Check for core fields
        required_fields = [
            'signal',
            'quant_score',
            'regime',
            'forecasts',
            'decision',
            'risk',
            'smart_alerts'
        ]
        
        missing_fields = []
        for field in required_fields:
            if field not in data:
                missing_fields.append(field)
            else:
                print_success(f"Field '{field}' present ✅")
        
        if missing_fields:
            print_error(f"Missing required fields: {missing_fields}")
            return False
        
        print_success("All core dashboard fields present (no regression) ✅")
        return True
        
    except Exception as e:
        print_error(f"Regression test failed with exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Run all Smart Money & Institutional Panel tests"""
    print("\n" + "="*80)
    print("BTCIQ SMART MONEY & INSTITUTIONAL PANELS - BACKEND TEST SUITE")
    print("Testing NEW real data panels (replacing DEMO)")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print("="*80)
    
    results = []
    
    # Test 1: Initial dashboard state
    print_info("Step 1: Check initial dashboard state...")
    result, initial_data = test_dashboard_initial()
    results.append(("GET /api/v1/dashboard - Initial State", result))
    
    if not result or not initial_data:
        print_error("Failed to get initial dashboard data. Aborting tests.")
        sys.exit(1)
    
    # Check if panels are already demo:false
    smart_money = initial_data.get('smart_money', {})
    institutional = initial_data.get('institutional', {})
    
    sm_demo = smart_money.get('demo')
    inst_demo = institutional.get('demo')
    
    final_data = initial_data
    
    if sm_demo == True or inst_demo == True:
        print_info("Panels are in DEMO mode (demo:true). Triggering refresh...")
        
        # Test 2: Refresh and poll
        result, refreshed_data = test_refresh_and_poll()
        results.append(("POST /api/v1/refresh and Poll", result))
        
        if not result or not refreshed_data:
            print_error("Failed to get real data after refresh. Aborting validation tests.")
            sys.exit(1)
        
        final_data = refreshed_data
    else:
        print_success("Panels already have demo:false. Skipping refresh.")
    
    # Test 3a: Validate smart_money
    smart_money = final_data.get('smart_money', {})
    result = validate_smart_money(smart_money)
    results.append(("Validate smart_money Panel", result))
    
    # Test 3b: Validate institutional
    institutional = final_data.get('institutional', {})
    result = validate_institutional(institutional)
    results.append(("Validate institutional Panel", result))
    
    # Test 4: Regression
    result = test_regression(final_data)
    results.append(("Regression Test - Other Dashboard Fields", result))
    
    # Print actual metric names and values
    print_test_header("ACTUAL METRIC DATA")
    print_info("smart_money metrics:")
    for i, metric in enumerate(smart_money.get('metrics', [])):
        print(f"  {i+1}. {metric.get('name')}: {metric.get('value')} ({metric.get('signal')})")
    
    print_info("\ninstitutional metrics:")
    for i, metric in enumerate(institutional.get('metrics', [])):
        inactive_flag = " [INACTIVE]" if metric.get('inactive') else ""
        print(f"  {i+1}. {metric.get('name')}: {metric.get('value')} ({metric.get('signal')}){inactive_flag}")
    
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
    
    if failed > 0:
        print("\n❌ SOME TESTS FAILED")
        sys.exit(1)
    else:
        print("\n✅ ALL TESTS PASSED")
        sys.exit(0)

if __name__ == "__main__":
    main()
