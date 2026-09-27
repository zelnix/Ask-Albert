#!/usr/bin/env python3
"""
Backend test for Per-user data scoping (voice preference + saved strategies).
Tests voice preference isolation and strategy isolation per user (pid).
"""
import requests
import json
import sys
import time

# Base URL from .env NEXT_PUBLIC_BASE_URL
BASE_URL = "https://what-if-sandbox.preview.emergentagent.com/api"

# Track created strategy IDs for cleanup
created_strategy_ids = []

def test_voice_pref_isolation_set():
    """Test 1-2: POST voice-pref for u_T1 (Puck) and u_T2 (Fenrir)"""
    print("\n" + "="*80)
    print("TEST 1-2: POST /api/v1/albert/voice-pref (set for u_T1 and u_T2)")
    print("="*80)
    try:
        # Set voice for u_T1
        payload_t1 = {"pid": "u_T1", "engine": "gemini", "voice": "Puck"}
        resp_t1 = requests.post(f"{BASE_URL}/v1/albert/voice-pref", json=payload_t1, timeout=30)
        print(f"u_T1 Status Code: {resp_t1.status_code}")
        data_t1 = resp_t1.json()
        print(f"u_T1 Response: {json.dumps(data_t1, indent=2)}")
        
        # Set voice for u_T2
        payload_t2 = {"pid": "u_T2", "engine": "gemini", "voice": "Fenrir"}
        resp_t2 = requests.post(f"{BASE_URL}/v1/albert/voice-pref", json=payload_t2, timeout=30)
        print(f"u_T2 Status Code: {resp_t2.status_code}")
        data_t2 = resp_t2.json()
        print(f"u_T2 Response: {json.dumps(data_t2, indent=2)}")
        
        # Validations
        assert resp_t1.status_code == 200, f"Expected 200 for u_T1, got {resp_t1.status_code}"
        assert data_t1.get('voice') == 'Puck', f"Expected voice='Puck' for u_T1, got {data_t1.get('voice')}"
        assert data_t1.get('engine') == 'gemini', f"Expected engine='gemini' for u_T1, got {data_t1.get('engine')}"
        
        assert resp_t2.status_code == 200, f"Expected 200 for u_T2, got {resp_t2.status_code}"
        assert data_t2.get('voice') == 'Fenrir', f"Expected voice='Fenrir' for u_T2, got {data_t2.get('voice')}"
        assert data_t2.get('engine') == 'gemini', f"Expected engine='gemini' for u_T2, got {data_t2.get('engine')}"
        
        print("✅ PASSED: Voice preferences set for u_T1 (Puck) and u_T2 (Fenrir)")
        return True
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        return False


def test_voice_pref_isolation_get():
    """Test 3: GET voice-pref for u_T1 and u_T2 - verify isolation"""
    print("\n" + "="*80)
    print("TEST 3: GET /api/v1/albert/voice-pref (verify isolation)")
    print("="*80)
    try:
        # Get voice for u_T1
        resp_t1 = requests.get(f"{BASE_URL}/v1/albert/voice-pref?pid=u_T1", timeout=30)
        print(f"u_T1 Status Code: {resp_t1.status_code}")
        data_t1 = resp_t1.json()
        print(f"u_T1 Response: {json.dumps(data_t1, indent=2)}")
        
        # Get voice for u_T2
        resp_t2 = requests.get(f"{BASE_URL}/v1/albert/voice-pref?pid=u_T2", timeout=30)
        print(f"u_T2 Status Code: {resp_t2.status_code}")
        data_t2 = resp_t2.json()
        print(f"u_T2 Response: {json.dumps(data_t2, indent=2)}")
        
        # Get voice with no pid (default)
        resp_default = requests.get(f"{BASE_URL}/v1/albert/voice-pref", timeout=30)
        print(f"Default (no pid) Status Code: {resp_default.status_code}")
        data_default = resp_default.json()
        print(f"Default Response: {json.dumps(data_default, indent=2)}")
        
        # Validations
        assert resp_t1.status_code == 200, f"Expected 200 for u_T1, got {resp_t1.status_code}"
        assert data_t1.get('voice') == 'Puck', f"Expected voice='Puck' for u_T1, got {data_t1.get('voice')}"
        
        assert resp_t2.status_code == 200, f"Expected 200 for u_T2, got {resp_t2.status_code}"
        assert data_t2.get('voice') == 'Fenrir', f"Expected voice='Fenrir' for u_T2, got {data_t2.get('voice')}"
        
        assert data_t1.get('voice') != data_t2.get('voice'), f"Expected different voices for u_T1 and u_T2, both got {data_t1.get('voice')}"
        
        assert resp_default.status_code == 200, f"Expected 200 for default, got {resp_default.status_code}"
        assert 'voice' in data_default, f"Expected 'voice' field in default response"
        
        print("✅ PASSED: Voice preferences are isolated (u_T1=Puck, u_T2=Fenrir, default returns a voice)")
        return True
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        return False


def test_strategy_build():
    """Test 4: POST /api/v1/albert/strategy/build - build BTC draft"""
    print("\n" + "="*80)
    print("TEST 4: POST /api/v1/albert/strategy/build (BTC)")
    print("="*80)
    try:
        payload = {"symbol": "BTC"}
        resp = requests.post(f"{BASE_URL}/v1/albert/strategy/build", json=payload, timeout=90)
        print(f"Status Code: {resp.status_code}")
        data = resp.json()
        print(f"Response keys: {list(data.keys())}")
        if 'draft' in data:
            draft = data['draft']
            print(f"Draft keys: {list(draft.keys())}")
            print(f"Draft title: {draft.get('title', 'N/A')}")
            print(f"Draft targets: {len(draft.get('targets', []))} items")
            print(f"Draft rules: {len(draft.get('rules', []))} items")
        
        # Validations
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        assert data.get('status') == 'ready', f"Expected status='ready', got {data.get('status')}"
        assert 'draft' in data, f"Expected 'draft' field in response"
        draft = data['draft']
        assert 'title' in draft, f"Expected 'title' in draft"
        assert 'targets' in draft, f"Expected 'targets' in draft"
        assert 'rules' in draft, f"Expected 'rules' in draft"
        assert len(draft.get('targets', [])) > 0, f"Expected at least 1 target, got {len(draft.get('targets', []))}"
        
        print("✅ PASSED: BTC strategy draft built successfully")
        return True, draft
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        return False, None


def test_strategy_activate_u_t1(draft):
    """Test 5: POST /api/v1/albert/strategy - activate for u_T1"""
    print("\n" + "="*80)
    print("TEST 5: POST /api/v1/albert/strategy (activate for u_T1)")
    print("="*80)
    try:
        payload = {"draft": draft, "pid": "u_T1"}
        resp = requests.post(f"{BASE_URL}/v1/albert/strategy", json=payload, timeout=30)
        print(f"Status Code: {resp.status_code}")
        data = resp.json()
        print(f"Response keys: {list(data.keys())}")
        if 'strategy' in data:
            strategy = data['strategy']
            print(f"Strategy ID: {strategy.get('id', 'N/A')}")
            print(f"Strategy status: {strategy.get('status', 'N/A')}")
            print(f"Strategy owner: {strategy.get('owner', 'N/A')}")
            print(f"Entry price: {strategy.get('entry_price', 'N/A')}")
            created_strategy_ids.append(strategy.get('id'))
        
        # Validations
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        assert data.get('status') == 'ready', f"Expected status='ready', got {data.get('status')}"
        assert 'strategy' in data, f"Expected 'strategy' field in response"
        strategy = data['strategy']
        assert strategy.get('status') == 'active', f"Expected strategy status='active', got {strategy.get('status')}"
        assert strategy.get('owner') == 'u_T1', f"Expected owner='u_T1', got {strategy.get('owner')}"
        assert 'id' in strategy, f"Expected 'id' in strategy"
        assert strategy.get('entry_price', 0) > 0, f"Expected entry_price > 0, got {strategy.get('entry_price')}"
        
        print("✅ PASSED: BTC strategy activated for u_T1")
        return True, strategy.get('id')
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        return False, None


def test_strategy_isolation_u_t1():
    """Test 6: GET /api/v1/albert/strategies?symbol=BTC&pid=u_T1 - verify u_T1 sees active strategy"""
    print("\n" + "="*80)
    print("TEST 6: GET /api/v1/albert/strategies (u_T1 - should see active)")
    print("="*80)
    try:
        resp = requests.get(f"{BASE_URL}/v1/albert/strategies?symbol=BTC&pid=u_T1", timeout=30)
        print(f"Status Code: {resp.status_code}")
        data = resp.json()
        print(f"Response keys: {list(data.keys())}")
        print(f"Active strategy: {'Present' if data.get('active') else 'None'}")
        if data.get('active'):
            print(f"Active strategy owner: {data['active'].get('owner', 'N/A')}")
        
        # Validations
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        assert data.get('status') == 'ready', f"Expected status='ready', got {data.get('status')}"
        assert data.get('active') is not None, f"Expected active strategy for u_T1, got None"
        assert data['active'].get('owner') == 'u_T1', f"Expected owner='u_T1', got {data['active'].get('owner')}"
        
        print("✅ PASSED: u_T1 sees their active BTC strategy")
        return True
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        return False


def test_strategy_isolation_u_t2():
    """Test 7: GET /api/v1/albert/strategies?symbol=BTC&pid=u_T2 - verify u_T2 does NOT see u_T1's strategy"""
    print("\n" + "="*80)
    print("TEST 7: GET /api/v1/albert/strategies (u_T2 - should NOT see u_T1's strategy)")
    print("="*80)
    try:
        resp = requests.get(f"{BASE_URL}/v1/albert/strategies?symbol=BTC&pid=u_T2", timeout=30)
        print(f"Status Code: {resp.status_code}")
        data = resp.json()
        print(f"Response keys: {list(data.keys())}")
        print(f"Active strategy: {'Present' if data.get('active') else 'None'}")
        print(f"History count: {len(data.get('history', []))}")
        
        # Validations
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        assert data.get('status') == 'ready', f"Expected status='ready', got {data.get('status')}"
        assert data.get('active') is None, f"Expected no active strategy for u_T2, got {data.get('active')}"
        assert len(data.get('history', [])) == 0, f"Expected empty history for u_T2, got {len(data.get('history', []))} items"
        
        print("✅ PASSED: u_T2 does NOT see u_T1's strategy (isolation confirmed)")
        return True
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        return False


def test_strategy_get_u_t2():
    """Test 8: GET /api/v1/albert/strategy?symbol=BTC&pid=u_T2 - verify status 'none'"""
    print("\n" + "="*80)
    print("TEST 8: GET /api/v1/albert/strategy (u_T2 - should return status 'none')")
    print("="*80)
    try:
        resp = requests.get(f"{BASE_URL}/v1/albert/strategy?symbol=BTC&pid=u_T2", timeout=30)
        print(f"Status Code: {resp.status_code}")
        data = resp.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        # Validations
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        assert data.get('status') == 'none', f"Expected status='none' for u_T2, got {data.get('status')}"
        
        print("✅ PASSED: u_T2 has no active BTC strategy (status='none')")
        return True
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        return False


def test_strategy_cleanup(strategy_id):
    """Test 9: POST /api/v1/albert/strategy/{id}/close - cleanup"""
    print("\n" + "="*80)
    print(f"TEST 9: POST /api/v1/albert/strategy/{strategy_id}/close (cleanup)")
    print("="*80)
    try:
        payload = {"reason": "test-cleanup"}
        resp = requests.post(f"{BASE_URL}/v1/albert/strategy/{strategy_id}/close", json=payload, timeout=30)
        print(f"Status Code: {resp.status_code}")
        data = resp.json()
        print(f"Response keys: {list(data.keys())}")
        if 'strategy' in data:
            strategy = data['strategy']
            print(f"Strategy status: {strategy.get('status', 'N/A')}")
            print(f"Close reason: {strategy.get('close_reason', 'N/A')}")
        
        # Validations
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        assert data.get('status') == 'ready', f"Expected status='ready', got {data.get('status')}"
        assert 'strategy' in data, f"Expected 'strategy' field in response"
        strategy = data['strategy']
        assert strategy.get('status') == 'closed', f"Expected strategy status='closed', got {strategy.get('status')}"
        
        print("✅ PASSED: Strategy closed successfully")
        return True
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        return False


def test_regression_chat():
    """Test 10: POST /api/v1/chat - regression test"""
    print("\n" + "="*80)
    print("TEST 10: POST /api/v1/chat (regression)")
    print("="*80)
    try:
        payload = {
            "session_id": "scope-reg",
            "message": "one line btc read",
            "deep": False,
            "symbol": "BTC",
            "pid": "u_T1"
        }
        resp = requests.post(f"{BASE_URL}/v1/chat", json=payload, timeout=60)
        print(f"Status Code: {resp.status_code}")
        data = resp.json()
        print(f"Response keys: {list(data.keys())}")
        if 'text' in data:
            print(f"Text length: {len(data['text'])} chars")
            print(f"Text preview: {data['text'][:100]}...")
        
        # Validations
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        assert 'text' in data, f"Expected 'text' field in response"
        assert len(data['text']) > 0, f"Expected non-empty text, got empty string"
        
        print("✅ PASSED: Chat endpoint regression test passed")
        return True
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        return False


def main():
    print("\n" + "="*80)
    print("PER-USER DATA SCOPING TEST")
    print("Testing voice preference isolation and strategy isolation")
    print("Base URL: " + BASE_URL)
    print("="*80)
    
    results = []
    draft = None
    strategy_id = None
    
    # Voice preference isolation tests
    results.append(("Test 1-2: POST voice-pref (set u_T1 and u_T2)", test_voice_pref_isolation_set()))
    results.append(("Test 3: GET voice-pref (verify isolation)", test_voice_pref_isolation_get()))
    
    # Strategy isolation tests
    success, draft = test_strategy_build()
    results.append(("Test 4: POST strategy/build (BTC)", success))
    
    if success and draft:
        success, strategy_id = test_strategy_activate_u_t1(draft)
        results.append(("Test 5: POST strategy (activate for u_T1)", success))
        
        if success:
            results.append(("Test 6: GET strategies (u_T1 sees active)", test_strategy_isolation_u_t1()))
            results.append(("Test 7: GET strategies (u_T2 isolation)", test_strategy_isolation_u_t2()))
            results.append(("Test 8: GET strategy (u_T2 status none)", test_strategy_get_u_t2()))
            
            if strategy_id:
                results.append(("Test 9: POST strategy/close (cleanup)", test_strategy_cleanup(strategy_id)))
    
    # Regression test
    results.append(("Test 10: POST chat (regression)", test_regression_chat()))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {test_name}")
    
    print("\n" + "="*80)
    print(f"TOTAL: {passed}/{total} tests passed")
    print("="*80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
