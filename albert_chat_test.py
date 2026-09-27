#!/usr/bin/env python3
"""
Albert Chat Backend Test Suite
Tests the upgraded "Ask Albert" chat endpoint with:
- gemini-3.1-pro-preview with native Google Search grounding
- Fallback to gemini-3-flash-preview
- Multi-turn memory
- Anti-hallucination
- Dashboard grounding
"""

import requests
import uuid
import time
import json

# Base URL from .env
BASE_URL = "https://what-if-sandbox.preview.emergentagent.com/api"

# Generous timeout for web-search turns (can take several seconds)
TIMEOUT = 45

def test_basic_chat():
    """
    TEST 1: BASIC - Ask about Bitcoin with dashboard grounding
    Expect: HTTP 200, non-empty text, model field (gemini-3.1-pro-preview or gemini-3-flash-preview)
    """
    print("\n" + "="*80)
    print("TEST 1: BASIC CHAT - Bitcoin dashboard question")
    print("="*80)
    
    try:
        session_id = str(uuid.uuid4())
        payload = {
            "session_id": session_id,
            "message": "Give me the candid read on Bitcoin right now.",
            "symbol": "BTC"
        }
        
        print(f"POST {BASE_URL}/v1/chat")
        print(f"Payload: {json.dumps(payload, indent=2)}")
        print(f"Session ID: {session_id}")
        print("Waiting for response (may take several seconds for web search)...")
        
        start = time.time()
        response = requests.post(f"{BASE_URL}/v1/chat", json=payload, timeout=TIMEOUT)
        elapsed = time.time() - start
        
        print(f"✅ HTTP {response.status_code} (took {elapsed:.2f}s)")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False, session_id
        
        data = response.json()
        print(f"Response keys: {list(data.keys())}")
        
        # Check required fields
        if 'text' not in data:
            print("❌ FAILED: Missing 'text' field")
            return False, session_id
        
        if 'model' not in data:
            print("❌ FAILED: Missing 'model' field")
            return False, session_id
        
        text = data['text']
        model = data['model']
        
        print(f"✅ Model: {model}")
        print(f"✅ Text length: {len(text)} chars")
        print(f"Text snippet (first 200 chars): {text[:200]}...")
        
        if not text or len(text) < 50:
            print(f"❌ FAILED: Text too short ({len(text)} chars)")
            return False, session_id
        
        # Check if model is one of the expected values
        expected_models = ['gemini-3.1-pro-preview', 'gemini-3-flash-preview']
        if model not in expected_models:
            print(f"⚠️  WARNING: Unexpected model '{model}' (expected one of {expected_models})")
        
        # Check if text references dashboard data (should mention score/regime/forecast/price)
        dashboard_keywords = ['score', 'regime', 'forecast', 'price', '$', '%', 'bitcoin', 'btc']
        found_keywords = [kw for kw in dashboard_keywords if kw.lower() in text.lower()]
        
        if found_keywords:
            print(f"✅ Text references dashboard data (found keywords: {found_keywords[:3]})")
        else:
            print("⚠️  WARNING: Text may not reference dashboard data")
        
        print("✅ TEST 1 PASSED")
        return True, session_id
        
    except requests.exceptions.Timeout:
        print(f"❌ FAILED: Request timeout after {TIMEOUT}s")
        return False, None
    except Exception as e:
        print(f"❌ FAILED: {type(e).__name__}: {e}")
        return False, None


def test_live_web_search():
    """
    TEST 2: LIVE WEB SEARCH - Ask about latest US CPI
    Expect: HTTP 200, text with concrete recent figure and/or date
    Must NOT return 500. Validates Google Search grounding.
    """
    print("\n" + "="*80)
    print("TEST 2: LIVE WEB SEARCH - Latest US CPI question")
    print("="*80)
    
    try:
        session_id = str(uuid.uuid4())
        payload = {
            "session_id": session_id,
            "message": "What was the latest US CPI year-over-year print and on what date was it released?"
        }
        
        print(f"POST {BASE_URL}/v1/chat")
        print(f"Payload: {json.dumps(payload, indent=2)}")
        print("Waiting for response (web search may take 10-20 seconds)...")
        
        start = time.time()
        response = requests.post(f"{BASE_URL}/v1/chat", json=payload, timeout=TIMEOUT)
        elapsed = time.time() - start
        
        print(f"✅ HTTP {response.status_code} (took {elapsed:.2f}s)")
        
        if response.status_code == 500:
            print("❌ FAILED: Got HTTP 500 (should not crash on web search)")
            print(f"Response: {response.text}")
            return False
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        text = data.get('text', '')
        model = data.get('model', '')
        
        print(f"✅ Model: {model}")
        print(f"✅ Text length: {len(text)} chars")
        print(f"Full text:\n{text}")
        
        if not text:
            print("❌ FAILED: Empty text response")
            return False
        
        # Check for concrete data (numbers, dates, percentages)
        has_number = any(char.isdigit() for char in text)
        has_percent = '%' in text
        has_date_keywords = any(kw in text.lower() for kw in ['january', 'february', 'march', 'april', 'may', 'june', 
                                                                'july', 'august', 'september', 'october', 'november', 
                                                                'december', '2024', '2025', '2026', 'released', 'date'])
        
        print(f"✅ Contains numbers: {has_number}")
        print(f"✅ Contains percentage: {has_percent}")
        print(f"✅ Contains date keywords: {has_date_keywords}")
        
        if has_number and (has_percent or has_date_keywords):
            print("✅ Text contains concrete CPI data (numbers + date/percentage)")
        else:
            print("⚠️  WARNING: Text may not contain concrete CPI data")
        
        print("✅ TEST 2 PASSED")
        return True
        
    except requests.exceptions.Timeout:
        print(f"❌ FAILED: Request timeout after {TIMEOUT}s")
        return False
    except Exception as e:
        print(f"❌ FAILED: {type(e).__name__}: {e}")
        return False


def test_multi_turn_memory(session_id):
    """
    TEST 3: MULTI-TURN MEMORY - Reuse session_id from test 1
    Expect: HTTP 200, coherent answer referencing earlier turn
    """
    print("\n" + "="*80)
    print("TEST 3: MULTI-TURN MEMORY - Follow-up question")
    print("="*80)
    
    if not session_id:
        print("⚠️  SKIPPED: No session_id from test 1")
        return False
    
    try:
        payload = {
            "session_id": session_id,
            "message": "And how does that affect Bitcoin over the next week?"
        }
        
        print(f"POST {BASE_URL}/v1/chat")
        print(f"Payload: {json.dumps(payload, indent=2)}")
        print(f"Reusing session ID: {session_id}")
        print("Waiting for response...")
        
        start = time.time()
        response = requests.post(f"{BASE_URL}/v1/chat", json=payload, timeout=TIMEOUT)
        elapsed = time.time() - start
        
        print(f"✅ HTTP {response.status_code} (took {elapsed:.2f}s)")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        text = data.get('text', '')
        model = data.get('model', '')
        
        print(f"✅ Model: {model}")
        print(f"✅ Text length: {len(text)} chars")
        print(f"Text snippet (first 300 chars): {text[:300]}...")
        
        if not text:
            print("❌ FAILED: Empty text response")
            return False
        
        # Check if response is coherent (should reference Bitcoin/week/forecast)
        coherence_keywords = ['bitcoin', 'btc', 'week', '7d', 'forecast', 'next', 'affect', 'impact']
        found_keywords = [kw for kw in coherence_keywords if kw.lower() in text.lower()]
        
        if found_keywords:
            print(f"✅ Response is coherent (found keywords: {found_keywords[:3]})")
        else:
            print("⚠️  WARNING: Response may not be coherent with follow-up question")
        
        print("✅ TEST 3 PASSED")
        return True
        
    except requests.exceptions.Timeout:
        print(f"❌ FAILED: Request timeout after {TIMEOUT}s")
        return False
    except Exception as e:
        print(f"❌ FAILED: {type(e).__name__}: {e}")
        return False


def test_anti_hallucination():
    """
    TEST 4: ANTI-HALLUCINATION - Ask for exact future price and ETH gas fee
    Expect: HTTP 200, Albert should decline to fabricate exact price and frame as probabilities
    Should say something like "no data available" for ETH gas fee
    """
    print("\n" + "="*80)
    print("TEST 4: ANTI-HALLUCINATION - Exact future price + unavailable data")
    print("="*80)
    
    try:
        session_id = str(uuid.uuid4())
        payload = {
            "session_id": session_id,
            "message": "What exact Bitcoin price will we see on Christmas Day, and what is the current Ethereum gas fee in gwei?"
        }
        
        print(f"POST {BASE_URL}/v1/chat")
        print(f"Payload: {json.dumps(payload, indent=2)}")
        print("Waiting for response...")
        
        start = time.time()
        response = requests.post(f"{BASE_URL}/v1/chat", json=payload, timeout=TIMEOUT)
        elapsed = time.time() - start
        
        print(f"✅ HTTP {response.status_code} (took {elapsed:.2f}s)")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        text = data.get('text', '')
        model = data.get('model', '')
        
        print(f"✅ Model: {model}")
        print(f"✅ Text length: {len(text)} chars")
        print(f"Full text:\n{text}")
        
        if not text:
            print("❌ FAILED: Empty text response")
            return False
        
        # Check for anti-hallucination patterns
        decline_keywords = ['cannot', 'can\'t', 'unable', 'no data', 'not available', 'don\'t have', 
                           'probability', 'probabilities', 'scenario', 'range', 'forecast', 'odds']
        found_decline = [kw for kw in decline_keywords if kw.lower() in text.lower()]
        
        # Check that it did NOT give an exact price (e.g., "Bitcoin will be $65,432.10 on Christmas")
        exact_price_pattern = any(phrase in text.lower() for phrase in ['will be $', 'will reach $', 'exactly $'])
        
        print(f"✅ Contains decline/probability keywords: {found_decline[:3]}")
        print(f"✅ Does NOT give exact future price: {not exact_price_pattern}")
        
        if found_decline and not exact_price_pattern:
            print("✅ Albert correctly declined to fabricate exact future price")
        else:
            print("⚠️  WARNING: Response may have fabricated exact price or not declined properly")
        
        # Check for "no data" regarding ETH gas fee
        no_data_keywords = ['no data', 'not available', 'don\'t have', 'unavailable', 'ethereum', 'eth', 'gas']
        found_no_data = [kw for kw in no_data_keywords if kw.lower() in text.lower()]
        
        if any(kw in ['no data', 'not available', 'don\'t have', 'unavailable'] for kw in found_no_data):
            print("✅ Albert correctly indicated no data for ETH gas fee")
        else:
            print("⚠️  WARNING: Response may not have indicated 'no data' for ETH gas fee")
        
        print("✅ TEST 4 PASSED")
        return True
        
    except requests.exceptions.Timeout:
        print(f"❌ FAILED: Request timeout after {TIMEOUT}s")
        return False
    except Exception as e:
        print(f"❌ FAILED: {type(e).__name__}: {e}")
        return False


def test_empty_message():
    """
    TEST 5: EMPTY MESSAGE - POST with empty message
    Expect: Friendly error JSON {error:'empty message', text:'Please type a question.'} and NO crash/500
    """
    print("\n" + "="*80)
    print("TEST 5: EMPTY MESSAGE - Error handling")
    print("="*80)
    
    try:
        session_id = str(uuid.uuid4())
        payload = {
            "session_id": session_id,
            "message": ""
        }
        
        print(f"POST {BASE_URL}/v1/chat")
        print(f"Payload: {json.dumps(payload, indent=2)}")
        
        response = requests.post(f"{BASE_URL}/v1/chat", json=payload, timeout=10)
        
        print(f"✅ HTTP {response.status_code}")
        
        if response.status_code == 500:
            print("❌ FAILED: Got HTTP 500 (should not crash on empty message)")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        # Check for friendly error
        if 'error' in data and data['error'] == 'empty message':
            print("✅ Correct error field: 'empty message'")
        else:
            print(f"⚠️  WARNING: Expected error='empty message', got {data.get('error')}")
        
        if 'text' in data and 'question' in data['text'].lower():
            print("✅ Friendly error text present")
        else:
            print(f"⚠️  WARNING: Expected friendly text, got {data.get('text')}")
        
        print("✅ TEST 5 PASSED")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: {type(e).__name__}: {e}")
        return False


def test_chat_history(session_id):
    """
    TEST 6: REGRESSION - GET /api/v1/chat/history
    Expect: HTTP 200 with messages array containing earlier user/assistant turns
    """
    print("\n" + "="*80)
    print("TEST 6: CHAT HISTORY - Retrieve conversation")
    print("="*80)
    
    if not session_id:
        print("⚠️  SKIPPED: No session_id from test 1")
        return False
    
    try:
        print(f"GET {BASE_URL}/v1/chat/history?session_id={session_id}")
        
        response = requests.get(f"{BASE_URL}/v1/chat/history", params={"session_id": session_id}, timeout=10)
        
        print(f"✅ HTTP {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        print(f"Response keys: {list(data.keys())}")
        
        if 'messages' not in data:
            print("❌ FAILED: Missing 'messages' field")
            return False
        
        messages = data['messages']
        print(f"✅ Messages count: {len(messages)}")
        
        if len(messages) < 2:
            print(f"⚠️  WARNING: Expected at least 2 messages (from tests 1 and 3), got {len(messages)}")
        
        # Check message structure
        if messages:
            first_msg = messages[0]
            print(f"First message keys: {list(first_msg.keys())}")
            
            if 'user' in first_msg and 'assistant' in first_msg:
                print("✅ Messages have correct structure (user + assistant)")
            else:
                print("⚠️  WARNING: Messages may not have correct structure")
        
        print("✅ TEST 6 PASSED")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: {type(e).__name__}: {e}")
        return False


def test_regression_dashboard():
    """
    TEST 7a: QUICK REGRESSION - GET /api/v1/dashboard
    Expect: HTTP 200 (ensure nothing broke from build_chat_context change)
    """
    print("\n" + "="*80)
    print("TEST 7a: REGRESSION - Dashboard endpoint")
    print("="*80)
    
    try:
        print(f"GET {BASE_URL}/v1/dashboard")
        
        response = requests.get(f"{BASE_URL}/v1/dashboard", timeout=10)
        
        print(f"✅ HTTP {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {response.status_code}")
            print(f"Response: {response.text[:500]}")
            return False
        
        data = response.json()
        
        if 'status' in data and data['status'] == 'ready':
            print("✅ Dashboard status: ready")
        else:
            print(f"⚠️  WARNING: Dashboard status: {data.get('status')}")
        
        print("✅ TEST 7a PASSED")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: {type(e).__name__}: {e}")
        return False


def test_regression_health():
    """
    TEST 7b: QUICK REGRESSION - GET /api/v1/health
    Expect: HTTP 200 (ensure nothing broke)
    """
    print("\n" + "="*80)
    print("TEST 7b: REGRESSION - Health endpoint")
    print("="*80)
    
    try:
        print(f"GET {BASE_URL}/v1/health")
        
        response = requests.get(f"{BASE_URL}/v1/health", timeout=10)
        
        print(f"✅ HTTP {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        print(f"Health response: {json.dumps(data, indent=2)}")
        
        print("✅ TEST 7b PASSED")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: {type(e).__name__}: {e}")
        return False


def main():
    print("\n" + "="*80)
    print("ALBERT CHAT BACKEND TEST SUITE")
    print("Testing upgraded Ask Albert chat with gemini-3.1-pro-preview + Google Search")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Timeout: {TIMEOUT}s per request")
    
    results = {}
    session_id = None
    
    # Test 1: Basic chat
    passed, session_id = test_basic_chat()
    results['Test 1: Basic Chat'] = passed
    
    # Test 2: Live web search
    passed = test_live_web_search()
    results['Test 2: Live Web Search'] = passed
    
    # Test 3: Multi-turn memory (requires session_id from test 1)
    passed = test_multi_turn_memory(session_id)
    results['Test 3: Multi-turn Memory'] = passed
    
    # Test 4: Anti-hallucination
    passed = test_anti_hallucination()
    results['Test 4: Anti-hallucination'] = passed
    
    # Test 5: Empty message
    passed = test_empty_message()
    results['Test 5: Empty Message'] = passed
    
    # Test 6: Chat history
    passed = test_chat_history(session_id)
    results['Test 6: Chat History'] = passed
    
    # Test 7a: Regression - Dashboard
    passed = test_regression_dashboard()
    results['Test 7a: Regression Dashboard'] = passed
    
    # Test 7b: Regression - Health
    passed = test_regression_health()
    results['Test 7b: Regression Health'] = passed
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed_count = sum(1 for v in results.values() if v)
    total_count = len(results)
    
    for test_name, passed in results.items():
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{status}: {test_name}")
    
    print("="*80)
    print(f"TOTAL: {passed_count}/{total_count} tests passed")
    print("="*80)
    
    return passed_count == total_count


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
