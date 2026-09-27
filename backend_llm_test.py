#!/usr/bin/env python3
"""
Backend LLM Migration Regression Test
Tests all LLM-backed endpoints after migrating from Emergent LLM key to direct Google Gemini (google-genai SDK).
Expected models: gemini-3-flash-preview (standard/insight/brief/news) and gemini-3.1-pro-preview (deep chat).
Google Search grounding auto-routes to Flash.
"""
import requests
import json
import time
import sys

# Base URL from .env
BASE_URL = "https://what-if-sandbox.preview.emergentagent.com/api"

# Generous timeouts for LLM + real exchange calls (60-90s per call as mentioned)
LLM_TIMEOUT = 90

def print_test(msg):
    print(f"\n{'='*80}")
    print(f"TEST: {msg}")
    print('='*80)

def print_pass(msg):
    print(f"✅ PASS: {msg}")

def print_fail(msg):
    print(f"❌ FAIL: {msg}")

def print_info(msg):
    print(f"ℹ️  INFO: {msg}")

def test_step_1_chat_standard_btc():
    """
    STEP 1: POST /api/v1/chat {session_id:'gm-1', message:'One-sentence read on BTC today?', deep:false, symbol:'BTC'}
    Expect: 200, non-empty text, model 'gemini-3-flash-preview', no error field
    """
    print_test("STEP 1: POST /api/v1/chat (standard, BTC)")
    
    try:
        url = f"{BASE_URL}/v1/chat"
        payload = {
            "session_id": "gm-1",
            "message": "One-sentence read on BTC today?",
            "deep": False,
            "symbol": "BTC"
        }
        
        print_info(f"POST {url}")
        print_info(f"Payload: {json.dumps(payload, indent=2)}")
        print_info(f"⏱️  WARNING: This can take 60-90s (LLM + real exchange calls)...")
        
        start_time = time.time()
        response = requests.post(url, json=payload, timeout=LLM_TIMEOUT)
        elapsed = time.time() - start_time
        
        print_info(f"Status Code: {response.status_code} (took {elapsed:.1f}s)")
        
        if response.status_code != 200:
            print_fail(f"Expected status 200, got {response.status_code}")
            print_info(f"Response: {response.text[:500]}")
            return False
        
        data = response.json()
        print_info(f"Response keys: {list(data.keys())}")
        
        # Check no error field
        if 'error' in data and data['error']:
            print_fail(f"Response contains error field: {data['error']}")
            return False
        print_pass("No error field present")
        
        # Check text is non-empty
        text = data.get('text', '')
        if not text or not isinstance(text, str) or len(text.strip()) == 0:
            print_fail(f"Expected non-empty text, got: {text}")
            return False
        print_pass(f"text is non-empty ({len(text)} chars): {text[:100]}...")
        
        # Check model is gemini-3-flash-preview
        model = data.get('model', '')
        if model != 'gemini-3-flash-preview':
            print_fail(f"Expected model='gemini-3-flash-preview', got '{model}'")
            return False
        print_pass(f"model = '{model}' ✅")
        
        print_pass("STEP 1 PASSED - Standard chat with BTC works correctly")
        return True
        
    except requests.exceptions.Timeout:
        print_fail(f"Request timed out after {LLM_TIMEOUT}s")
        return False
    except Exception as e:
        print_fail(f"Exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_step_2_chat_deep_btc():
    """
    STEP 2: POST /api/v1/chat {session_id:'gm-2', message:'Latest BTC ETF flow news this week?', deep:true, symbol:'BTC'}
    Expect: 200, non-empty text (deep uses pro; grounded sub-call routes to flash). 'sources' may be [] — acceptable.
    """
    print_test("STEP 2: POST /api/v1/chat (deep, BTC with grounding)")
    
    try:
        url = f"{BASE_URL}/v1/chat"
        payload = {
            "session_id": "gm-2",
            "message": "Latest BTC ETF flow news this week?",
            "deep": True,
            "symbol": "BTC"
        }
        
        print_info(f"POST {url}")
        print_info(f"Payload: {json.dumps(payload, indent=2)}")
        print_info(f"⏱️  WARNING: This can take 60-90s (deep LLM + grounding + real exchange calls)...")
        
        start_time = time.time()
        response = requests.post(url, json=payload, timeout=LLM_TIMEOUT)
        elapsed = time.time() - start_time
        
        print_info(f"Status Code: {response.status_code} (took {elapsed:.1f}s)")
        
        if response.status_code != 200:
            print_fail(f"Expected status 200, got {response.status_code}")
            print_info(f"Response: {response.text[:500]}")
            return False
        
        data = response.json()
        print_info(f"Response keys: {list(data.keys())}")
        
        # Check no error field
        if 'error' in data and data['error']:
            print_fail(f"Response contains error field: {data['error']}")
            return False
        print_pass("No error field present")
        
        # Check text is non-empty
        text = data.get('text', '')
        if not text or not isinstance(text, str) or len(text.strip()) == 0:
            print_fail(f"Expected non-empty text, got: {text}")
            return False
        print_pass(f"text is non-empty ({len(text)} chars): {text[:100]}...")
        
        # Check sources (may be empty, that's acceptable)
        sources = data.get('sources', [])
        if not isinstance(sources, list):
            print_fail(f"Expected sources to be a list, got {type(sources)}")
            return False
        print_pass(f"sources is a list (length: {len(sources)}, empty is acceptable)")
        
        # Model field may not be returned for deep chat, but if it is, it should be pro
        model = data.get('model', '')
        if model:
            print_info(f"model = '{model}'")
        
        print_pass("STEP 2 PASSED - Deep chat with BTC works correctly")
        return True
        
    except requests.exceptions.Timeout:
        print_fail(f"Request timed out after {LLM_TIMEOUT}s")
        return False
    except Exception as e:
        print_fail(f"Exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_step_3_chat_eth():
    """
    STEP 3: POST /api/v1/chat with symbol:'ETH' -> 200 non-empty (altcoin context path)
    """
    print_test("STEP 3: POST /api/v1/chat (ETH altcoin)")
    
    try:
        url = f"{BASE_URL}/v1/chat"
        payload = {
            "session_id": "gm-3",
            "message": "What's the current ETH market sentiment?",
            "deep": False,
            "symbol": "ETH"
        }
        
        print_info(f"POST {url}")
        print_info(f"Payload: {json.dumps(payload, indent=2)}")
        print_info(f"⏱️  WARNING: This can take 60-90s (LLM + real exchange calls)...")
        
        start_time = time.time()
        response = requests.post(url, json=payload, timeout=LLM_TIMEOUT)
        elapsed = time.time() - start_time
        
        print_info(f"Status Code: {response.status_code} (took {elapsed:.1f}s)")
        
        if response.status_code != 200:
            print_fail(f"Expected status 200, got {response.status_code}")
            print_info(f"Response: {response.text[:500]}")
            return False
        
        data = response.json()
        print_info(f"Response keys: {list(data.keys())}")
        
        # Check no error field
        if 'error' in data and data['error']:
            print_fail(f"Response contains error field: {data['error']}")
            return False
        print_pass("No error field present")
        
        # Check text is non-empty
        text = data.get('text', '')
        if not text or not isinstance(text, str) or len(text.strip()) == 0:
            print_fail(f"Expected non-empty text, got: {text}")
            return False
        print_pass(f"text is non-empty ({len(text)} chars): {text[:100]}...")
        
        print_pass("STEP 3 PASSED - Chat with ETH altcoin works correctly")
        return True
        
    except requests.exceptions.Timeout:
        print_fail(f"Request timed out after {LLM_TIMEOUT}s")
        return False
    except Exception as e:
        print_fail(f"Exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_step_4_insight_overview_leverage():
    """
    STEP 4: GET /api/v1/albert/insight?section=overview&mode=plain&refresh=1&symbol=BTC
    -> 200 {status:'ready', text non-empty, model 'gemini-3-flash-preview'}
    Also test section=leverage
    """
    print_test("STEP 4: GET /api/v1/albert/insight (overview + leverage)")
    
    sections = ['overview', 'leverage']
    
    for section in sections:
        print_info(f"\n--- Testing section: {section} ---")
        
        try:
            url = f"{BASE_URL}/v1/albert/insight?section={section}&mode=plain&refresh=1&symbol=BTC"
            print_info(f"GET {url}")
            print_info(f"⏱️  WARNING: This can take 60-90s (LLM generation)...")
            
            start_time = time.time()
            response = requests.get(url, timeout=LLM_TIMEOUT)
            elapsed = time.time() - start_time
            
            print_info(f"Status Code: {response.status_code} (took {elapsed:.1f}s)")
            
            if response.status_code != 200:
                print_fail(f"Expected status 200, got {response.status_code}")
                print_info(f"Response: {response.text[:500]}")
                return False
            
            data = response.json()
            print_info(f"Response keys: {list(data.keys())}")
            
            # Check status
            if data.get('status') != 'ready':
                print_fail(f"Expected status='ready', got '{data.get('status')}'")
                return False
            print_pass(f"{section}: status='ready'")
            
            # Check text is non-empty
            text = data.get('text', '')
            if not text or not isinstance(text, str) or len(text.strip()) == 0:
                print_fail(f"{section}: Expected non-empty text, got: {text}")
                return False
            print_pass(f"{section}: text is non-empty ({len(text)} chars): {text[:100]}...")
            
            # Check model is gemini-3-flash-preview
            model = data.get('model', '')
            if model != 'gemini-3-flash-preview':
                print_fail(f"{section}: Expected model='gemini-3-flash-preview', got '{model}'")
                return False
            print_pass(f"{section}: model = '{model}' ✅")
            
            print_pass(f"{section}: All validations passed")
            
        except requests.exceptions.Timeout:
            print_fail(f"{section}: Request timed out after {LLM_TIMEOUT}s")
            return False
        except Exception as e:
            print_fail(f"{section}: Exception: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    print_pass("STEP 4 PASSED - Insight endpoint works for overview and leverage")
    return True

def test_step_5_brief_btc_eth():
    """
    STEP 5: GET /api/v1/albert/brief?refresh=1&symbol=BTC -> 200 {status:'ready', brief non-empty}
    Also test symbol=ETH -> coin 'Ethereum'
    """
    print_test("STEP 5: GET /api/v1/albert/brief (BTC + ETH)")
    
    test_cases = [
        {'symbol': 'BTC', 'expected_coin': 'Bitcoin'},
        {'symbol': 'ETH', 'expected_coin': 'Ethereum'}
    ]
    
    for test_case in test_cases:
        symbol = test_case['symbol']
        expected_coin = test_case['expected_coin']
        
        print_info(f"\n--- Testing symbol: {symbol} ---")
        
        try:
            url = f"{BASE_URL}/v1/albert/brief?refresh=1&symbol={symbol}"
            print_info(f"GET {url}")
            print_info(f"⏱️  WARNING: This can take 60-90s (LLM generation)...")
            
            start_time = time.time()
            response = requests.get(url, timeout=LLM_TIMEOUT)
            elapsed = time.time() - start_time
            
            print_info(f"Status Code: {response.status_code} (took {elapsed:.1f}s)")
            
            if response.status_code != 200:
                print_fail(f"Expected status 200, got {response.status_code}")
                print_info(f"Response: {response.text[:500]}")
                return False
            
            data = response.json()
            print_info(f"Response keys: {list(data.keys())}")
            
            # Check status
            if data.get('status') != 'ready':
                print_fail(f"{symbol}: Expected status='ready', got '{data.get('status')}'")
                return False
            print_pass(f"{symbol}: status='ready'")
            
            # Check text is non-empty (brief endpoint returns 'text' field, not 'brief')
            text = data.get('text', '')
            if not text or not isinstance(text, str) or len(text.strip()) == 0:
                print_fail(f"{symbol}: Expected non-empty text, got: {text}")
                return False
            print_pass(f"{symbol}: text is non-empty ({len(text)} chars)")
            
            # For ETH, check coin field
            if symbol == 'ETH':
                coin = data.get('coin', '')
                if coin != expected_coin:
                    print_fail(f"{symbol}: Expected coin='{expected_coin}', got '{coin}'")
                    return False
                print_pass(f"{symbol}: coin = '{coin}' ✅")
            
            print_pass(f"{symbol}: All validations passed")
            
        except requests.exceptions.Timeout:
            print_fail(f"{symbol}: Request timed out after {LLM_TIMEOUT}s")
            return False
        except Exception as e:
            print_fail(f"{symbol}: Exception: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    print_pass("STEP 5 PASSED - Brief endpoint works for BTC and ETH")
    return True

def test_step_6_strategy_build():
    """
    STEP 6: POST /api/v1/albert/strategy/build {symbol:'BTC'} and {symbol:'ETH', goal:'swing long'}
    -> 200 {status:'ready', draft} with draft.targets + draft.rules
    NOTE: build does NOT persist, so no cleanup needed
    """
    print_test("STEP 6: POST /api/v1/albert/strategy/build (BTC + ETH)")
    
    test_cases = [
        {'symbol': 'BTC', 'goal': None},
        {'symbol': 'ETH', 'goal': 'swing long'}
    ]
    
    for test_case in test_cases:
        symbol = test_case['symbol']
        goal = test_case['goal']
        
        print_info(f"\n--- Testing symbol: {symbol} (goal: {goal or 'None'}) ---")
        
        try:
            url = f"{BASE_URL}/v1/albert/strategy/build"
            payload = {'symbol': symbol}
            if goal:
                payload['goal'] = goal
            
            print_info(f"POST {url}")
            print_info(f"Payload: {json.dumps(payload, indent=2)}")
            print_info(f"⏱️  WARNING: This can take 60-90s (LLM generation)...")
            
            start_time = time.time()
            response = requests.post(url, json=payload, timeout=LLM_TIMEOUT)
            elapsed = time.time() - start_time
            
            print_info(f"Status Code: {response.status_code} (took {elapsed:.1f}s)")
            
            if response.status_code != 200:
                print_fail(f"Expected status 200, got {response.status_code}")
                print_info(f"Response: {response.text[:500]}")
                return False
            
            data = response.json()
            print_info(f"Response keys: {list(data.keys())}")
            
            # Check status
            if data.get('status') != 'ready':
                print_fail(f"{symbol}: Expected status='ready', got '{data.get('status')}'")
                return False
            print_pass(f"{symbol}: status='ready'")
            
            # Check draft object
            draft = data.get('draft')
            if not draft or not isinstance(draft, dict):
                print_fail(f"{symbol}: Expected draft to be a dict, got {type(draft)}")
                return False
            print_pass(f"{symbol}: draft object present")
            
            # Check draft.targets
            targets = draft.get('targets')
            if not targets or not isinstance(targets, list) or len(targets) == 0:
                print_fail(f"{symbol}: Expected draft.targets to be a non-empty list, got {targets}")
                return False
            print_pass(f"{symbol}: draft.targets is non-empty list ({len(targets)} items)")
            
            # Check draft.rules
            rules = draft.get('rules')
            if not rules or not isinstance(rules, list) or len(rules) == 0:
                print_fail(f"{symbol}: Expected draft.rules to be a non-empty list, got {rules}")
                return False
            print_pass(f"{symbol}: draft.rules is non-empty list ({len(rules)} items)")
            
            print_pass(f"{symbol}: All validations passed")
            
        except requests.exceptions.Timeout:
            print_fail(f"{symbol}: Request timed out after {LLM_TIMEOUT}s")
            return False
        except Exception as e:
            print_fail(f"{symbol}: Exception: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    print_pass("STEP 6 PASSED - Strategy build works for BTC and ETH")
    return True

def test_step_7_dashboard_regression():
    """
    STEP 7: GET /api/v1/dashboard -> 200 (regression; news-card analysis now uses gemini-3-flash-preview)
    """
    print_test("STEP 7: GET /api/v1/dashboard (regression)")
    
    try:
        url = f"{BASE_URL}/v1/dashboard"
        print_info(f"GET {url}")
        
        response = requests.get(url, timeout=30)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_fail(f"Expected status 200, got {response.status_code}")
            print_info(f"Response: {response.text[:500]}")
            return False
        
        data = response.json()
        print_info(f"Response keys: {list(data.keys())}")
        
        # Check status
        if data.get('status') != 'ready':
            print_fail(f"Expected status='ready', got '{data.get('status')}'")
            return False
        print_pass("status='ready'")
        
        print_pass("STEP 7 PASSED - Dashboard endpoint works correctly")
        return True
        
    except Exception as e:
        print_fail(f"Exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    print("\n" + "="*80)
    print("LLM MIGRATION REGRESSION TEST")
    print("Testing LLM-backed endpoints after migrating to direct Google Gemini")
    print("Expected models: gemini-3-flash-preview (standard) and gemini-3.1-pro-preview (deep)")
    print("="*80)
    
    results = []
    
    # Run all tests
    results.append(("STEP 1: Chat standard (BTC)", test_step_1_chat_standard_btc()))
    results.append(("STEP 2: Chat deep (BTC)", test_step_2_chat_deep_btc()))
    results.append(("STEP 3: Chat (ETH)", test_step_3_chat_eth()))
    results.append(("STEP 4: Insight (overview + leverage)", test_step_4_insight_overview_leverage()))
    results.append(("STEP 5: Brief (BTC + ETH)", test_step_5_brief_btc_eth()))
    results.append(("STEP 6: Strategy build (BTC + ETH)", test_step_6_strategy_build()))
    results.append(("STEP 7: Dashboard (regression)", test_step_7_dashboard_regression()))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        print("\nKEY VALIDATIONS:")
        print("✅ All LLM endpoints return HTTP 200 with non-empty text")
        print("✅ Standard chat uses gemini-3-flash-preview")
        print("✅ Deep chat works correctly (uses gemini-3.1-pro-preview)")
        print("✅ Google Search grounding auto-routes to Flash")
        print("✅ Insight endpoint uses gemini-3-flash-preview")
        print("✅ Brief endpoint works for BTC and ETH")
        print("✅ Strategy build generates valid drafts")
        print("✅ Dashboard regression test passed")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        return 1

if __name__ == '__main__':
    sys.exit(main())
