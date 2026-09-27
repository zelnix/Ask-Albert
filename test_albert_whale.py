#!/usr/bin/env python3
"""
Backend API Test Suite for Albert Insight Sections + Whale Endpoints
Tests LLM-powered Albert insights (smartmoney, institutional, alerts, events) and whale data
"""

import requests
import json
import sys
import time
from typing import Dict, List, Any

# Base URL from environment
BASE_URL = "https://what-if-sandbox.preview.emergentagent.com/api"

# IMPORTANT: Use 75+ second timeout for LLM endpoints (can take 20-60s on cache miss)
LLM_TIMEOUT = 90

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

def print_warning(message: str):
    """Print warning message"""
    print(f"⚠️  {message}")

def test_albert_insight_section(section: str, expected_keywords: List[str] = None) -> Dict[str, Any]:
    """
    Test Albert insight endpoint for a specific section
    Returns the response data for further validation
    """
    print_test_header(f"GET /api/v1/albert/insight?section={section}&symbol=BTC")
    
    try:
        url = f"{BASE_URL}/v1/albert/insight?section={section}&symbol=BTC"
        print_info(f"Requesting: {url}")
        print_info(f"Using timeout: {LLM_TIMEOUT}s (LLM can take 20-60s on cache miss)")
        
        start_time = time.time()
        response = requests.get(url, timeout=LLM_TIMEOUT)
        elapsed = time.time() - start_time
        
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response time: {elapsed:.2f}s")
        
        if response.status_code != 200:
            print_error(f"Expected status 200, got {response.status_code}")
            return {'success': False}
        print_success("HTTP 200 OK")
        
        data = response.json()
        print_info(f"Response keys: {list(data.keys())}")
        
        # Validate status
        if data.get('status') != 'ready':
            print_error(f"Expected status='ready', got '{data.get('status')}'")
            if data.get('status') == 'fallback':
                print_warning(f"Fallback reason: {data.get('reason')}")
            return {'success': False, 'data': data}
        print_success("Status is 'ready'")
        
        # Validate required fields
        if 'text' not in data:
            print_error("Missing 'text' field in response")
            return {'success': False, 'data': data}
        
        if 'mode' not in data:
            print_error("Missing 'mode' field in response")
            return {'success': False, 'data': data}
        print_success("Required fields present (text, mode)")
        
        text = data['text']
        mode = data['mode']
        cached = data.get('cached', False)
        
        print_info(f"Mode: {mode}")
        print_info(f"Cached: {cached}")
        print_info(f"Text length: {len(text)} chars, {len(text.split())} words")
        
        # Validate text is non-empty and > 100 chars
        if not text or len(text) < 100:
            print_error(f"Text is too short (expected >100 chars, got {len(text)})")
            print_info(f"Text content: {text[:200]}...")
            return {'success': False, 'data': data}
        print_success(f"Text is non-empty and >100 chars ({len(text)} chars)")
        
        # Print the actual text for review
        print_info(f"\n--- ALBERT INSIGHT TEXT ({section}) ---")
        print(text)
        print_info(f"--- END TEXT ---\n")
        
        # Check for expected keywords if provided
        if expected_keywords:
            text_lower = text.lower()
            found_keywords = [kw for kw in expected_keywords if kw.lower() in text_lower]
            if found_keywords:
                print_success(f"Found expected keywords: {', '.join(found_keywords)}")
            else:
                print_warning(f"Expected keywords not found: {', '.join(expected_keywords)}")
                print_info("This may indicate the LLM response doesn't reference the injected context")
        
        return {'success': True, 'data': data, 'elapsed': elapsed}
        
    except requests.exceptions.Timeout:
        print_error(f"Request timed out after {LLM_TIMEOUT}s")
        return {'success': False}
    except Exception as e:
        print_error(f"Exception occurred: {str(e)}")
        import traceback
        traceback.print_exc()
        return {'success': False}

def test_whales_endpoint():
    """Test GET /api/v1/whales endpoint"""
    print_test_header("GET /api/v1/whales")
    
    try:
        url = f"{BASE_URL}/v1/whales"
        print_info(f"Requesting: {url}")
        
        response = requests.get(url, timeout=30)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_error(f"Expected status 200, got {response.status_code}")
            return False
        print_success("HTTP 200 OK")
        
        data = response.json()
        print_info(f"Response keys: {list(data.keys())}")
        
        # Validate status
        if data.get('status') != 'ready':
            print_error(f"Expected status='ready', got '{data.get('status')}'")
            return False
        print_success("Status is 'ready'")
        
        # Validate whales list
        if 'whales' not in data:
            print_error("Missing 'whales' field in response")
            return False
        
        whales = data['whales']
        if not isinstance(whales, list):
            print_error(f"Expected 'whales' to be a list, got {type(whales)}")
            return False
        
        print_info(f"Number of whales: {len(whales)}")
        
        if len(whales) < 10:
            print_warning(f"Expected at least 10 whales, got {len(whales)}")
        else:
            print_success(f"Whales list has {len(whales)} items (>=10)")
        
        # Validate first few whale items
        for i, whale in enumerate(whales[:3]):
            print_info(f"\nValidating whale #{i+1}:")
            
            required_fields = ['name', 'category', 'balance', 'signal']
            missing_fields = [f for f in required_fields if f not in whale]
            
            if missing_fields:
                print_error(f"Whale #{i+1} missing fields: {', '.join(missing_fields)}")
                return False
            
            print_info(f"  Name: {whale['name']}")
            print_info(f"  Category: {whale['category']}")
            print_info(f"  Balance: {whale['balance']} BTC")
            print_info(f"  Signal: {whale['signal']}")
            print_success(f"Whale #{i+1} has all required fields")
        
        print_success("All whale items validated successfully")
        return True
        
    except Exception as e:
        print_error(f"Exception occurred: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_whale_activity_endpoint():
    """Test GET /api/v1/whale-activity endpoint"""
    print_test_header("GET /api/v1/whale-activity?address=bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h")
    
    try:
        address = "bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h"
        url = f"{BASE_URL}/v1/whale-activity?address={address}"
        print_info(f"Requesting: {url}")
        
        response = requests.get(url, timeout=30)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_error(f"Expected status 200, got {response.status_code}")
            return False
        print_success("HTTP 200 OK")
        
        data = response.json()
        print_info(f"Response keys: {list(data.keys())}")
        
        # Validate status
        if data.get('status') != 'ready':
            print_error(f"Expected status='ready', got '{data.get('status')}'")
            return False
        print_success("Status is 'ready'")
        
        # Validate activity list
        if 'activity' not in data:
            print_error("Missing 'activity' field in response")
            return False
        
        activity = data['activity']
        if not isinstance(activity, list):
            print_error(f"Expected 'activity' to be a list, got {type(activity)}")
            return False
        
        print_info(f"Number of activity items: {len(activity)}")
        print_success(f"Activity is a list with {len(activity)} items")
        
        # Validate first few activity items
        for i, item in enumerate(activity[:3]):
            print_info(f"\nValidating activity #{i+1}:")
            
            required_fields = ['direction', 'amount', 'txid']
            missing_fields = [f for f in required_fields if f not in item]
            
            if missing_fields:
                print_error(f"Activity #{i+1} missing fields: {', '.join(missing_fields)}")
                return False
            
            # Validate direction is 'in' or 'out'
            if item['direction'] not in ['in', 'out']:
                print_error(f"Invalid direction: {item['direction']} (expected 'in' or 'out')")
                return False
            
            # Validate amount is a number
            if not isinstance(item['amount'], (int, float)):
                print_error(f"Invalid amount type: {type(item['amount'])} (expected number)")
                return False
            
            # Validate txid is a string
            if not isinstance(item['txid'], str):
                print_error(f"Invalid txid type: {type(item['txid'])} (expected string)")
                return False
            
            print_info(f"  Direction: {item['direction']}")
            print_info(f"  Amount: {item['amount']} BTC")
            print_info(f"  TxID: {item['txid'][:16]}...")
            print_success(f"Activity #{i+1} has all required fields with valid types")
        
        print_success("All activity items validated successfully")
        return True
        
    except Exception as e:
        print_error(f"Exception occurred: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_dashboard_smart_money_institutional():
    """Test GET /api/v1/dashboard for smart_money and institutional demo flags"""
    print_test_header("GET /api/v1/dashboard - smart_money.demo and institutional.demo")
    
    try:
        url = f"{BASE_URL}/v1/dashboard"
        print_info(f"Requesting: {url}")
        
        response = requests.get(url, timeout=30)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_error(f"Expected status 200, got {response.status_code}")
            return False
        print_success("HTTP 200 OK")
        
        data = response.json()
        
        # Validate status
        if data.get('status') != 'ready':
            print_error(f"Expected status='ready', got '{data.get('status')}'")
            return False
        print_success("Status is 'ready'")
        
        # Validate smart_money
        if 'smart_money' not in data:
            print_error("Missing 'smart_money' field in response")
            return False
        
        smart_money = data['smart_money']
        if 'demo' not in smart_money:
            print_error("Missing 'demo' field in smart_money")
            return False
        
        sm_demo = smart_money['demo']
        print_info(f"smart_money.demo = {sm_demo}")
        
        if sm_demo != False:
            print_error(f"Expected smart_money.demo == false, got {sm_demo}")
            return False
        print_success("smart_money.demo == false (REAL DATA)")
        
        # Validate institutional
        if 'institutional' not in data:
            print_error("Missing 'institutional' field in response")
            return False
        
        institutional = data['institutional']
        if 'demo' not in institutional:
            print_error("Missing 'demo' field in institutional")
            return False
        
        inst_demo = institutional['demo']
        print_info(f"institutional.demo = {inst_demo}")
        
        if inst_demo != False:
            print_error(f"Expected institutional.demo == false, got {inst_demo}")
            return False
        print_success("institutional.demo == false (REAL DATA)")
        
        return True
        
    except Exception as e:
        print_error(f"Exception occurred: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("BTCIQ BACKEND TEST SUITE - ALBERT INSIGHTS + WHALE ENDPOINTS")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"LLM Timeout: {LLM_TIMEOUT}s")
    print("="*80)
    
    results = {}
    
    # Test 1: Albert insight - smartmoney (FIRST CALL - may be slow)
    print_info("\n🔍 Testing Albert insight sections (LLM-powered, may take 20-60s each on cache miss)")
    result = test_albert_insight_section('smartmoney')
    results['albert_smartmoney_1'] = result.get('success', False)
    smartmoney_text = result.get('data', {}).get('text', '')
    
    # Test 2: Albert insight - smartmoney (SECOND CALL - should be cached and fast)
    if results['albert_smartmoney_1']:
        print_info("\n🔍 Testing smartmoney AGAIN to verify caching...")
        time.sleep(1)  # Brief pause
        result2 = test_albert_insight_section('smartmoney')
        results['albert_smartmoney_2_cached'] = result2.get('success', False)
        
        # Check if second call was faster (cached)
        if result2.get('success') and result2.get('data', {}).get('cached'):
            print_success("Second call returned cached=true (caching works!)")
        elif result2.get('success') and result2.get('elapsed', 999) < 5:
            print_success(f"Second call was fast ({result2.get('elapsed', 0):.2f}s), likely cached")
        else:
            print_warning("Second call did not appear to be cached")
    
    # Test 3: Albert insight - institutional (check for derivatives keywords)
    print_info("\n🔍 Testing institutional section (should reference derivatives concepts)...")
    derivatives_keywords = ['funding', 'open interest', 'long/short', 'taker', 'positioning', 'futures', 'derivatives']
    result = test_albert_insight_section('institutional', expected_keywords=derivatives_keywords)
    results['albert_institutional'] = result.get('success', False)
    institutional_text = result.get('data', {}).get('text', '')
    
    # Test 4: Albert insight - alerts
    print_info("\n🔍 Testing alerts section...")
    result = test_albert_insight_section('alerts')
    results['albert_alerts'] = result.get('success', False)
    
    # Test 5: Albert insight - events
    print_info("\n🔍 Testing events section...")
    result = test_albert_insight_section('events')
    results['albert_events'] = result.get('success', False)
    
    # Test 6: Quick regression - whales endpoint
    print_info("\n🔍 Quick regression tests...")
    results['whales'] = test_whales_endpoint()
    
    # Test 7: Quick regression - whale-activity endpoint
    results['whale_activity'] = test_whale_activity_endpoint()
    
    # Test 8: Quick regression - dashboard smart_money/institutional demo flags
    results['dashboard_demo_flags'] = test_dashboard_smart_money_institutional()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    total_tests = len(results)
    passed_tests = sum(1 for v in results.values() if v)
    
    for test_name, passed in results.items():
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{status}: {test_name}")
    
    print("="*80)
    print(f"TOTAL: {passed_tests}/{total_tests} tests passed")
    print("="*80)
    
    # Print actual insight texts for review
    print("\n" + "="*80)
    print("ACTUAL INSIGHT TEXTS FOR REVIEW")
    print("="*80)
    
    if smartmoney_text:
        print("\n--- SMARTMONEY INSIGHT ---")
        print(smartmoney_text)
        print("--- END SMARTMONEY ---")
    
    if institutional_text:
        print("\n--- INSTITUTIONAL INSIGHT ---")
        print(institutional_text)
        print("--- END INSTITUTIONAL ---")
    
    print("\n" + "="*80)
    
    # Exit with appropriate code
    if passed_tests == total_tests:
        print("\n✅ ALL TESTS PASSED")
        sys.exit(0)
    else:
        print(f"\n❌ {total_tests - passed_tests} TEST(S) FAILED")
        sys.exit(1)

if __name__ == "__main__":
    main()
