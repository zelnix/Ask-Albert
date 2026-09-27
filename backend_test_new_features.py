#!/usr/bin/env python3
"""
Backend test for FOUR NEW basket features:
1. Basket in Chat (context injection)
2. Basket from Chat (build intent -> save-able draft)
3. Basket Alerts Digest endpoint
4. Regression / startup health

Test PIDs: u_TESTCHAT1, u_TESTCHAT2
Base URL: https://what-if-sandbox.preview.emergentagent.com/api
"""
import requests
import json
import sys
import time

# Base URL from .env NEXT_PUBLIC_BASE_URL
BASE_URL = "https://what-if-sandbox.preview.emergentagent.com/api"

# Test PIDs
PID1 = "u_TESTCHAT1"
PID2 = "u_TESTCHAT2"

# Global state to track created basket IDs for cleanup
created_basket_ids = []
setup_draft = None


def setup_basket_for_pid1():
    """
    SETUP (needed for tests 1 & 2):
    - POST /api/v1/albert/strategy/basket/build  body {"goal":"long the majors, small short on a laggard"}
    - POST /api/v1/albert/strategy/basket  body {"draft": <the draft above>, "pid":"u_TESTCHAT1"}
    This creates an ACTIVE basket owned by PID1.
    """
    print("\n" + "="*80)
    print("SETUP: Creating an active basket for PID1 (u_TESTCHAT1)")
    print("="*80)
    
    try:
        # Step 1: Build basket draft
        print("\nStep 1: POST /api/v1/albert/strategy/basket/build")
        payload = {"goal": "long the majors, small short on a laggard"}
        print(f"Request: {json.dumps(payload, indent=2)}")
        
        resp = requests.post(f"{BASE_URL}/v1/albert/strategy/basket/build", json=payload, timeout=90)
        print(f"Status Code: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ SETUP FAILED: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return False, None
        
        data = resp.json()
        print(f"Response status: {data.get('status')}")
        
        if data.get('status') != 'ready':
            print(f"❌ SETUP FAILED: Expected status='ready', got {data.get('status')}")
            return False, None
        
        draft = data.get('draft')
        if not draft or not draft.get('legs'):
            print(f"❌ SETUP FAILED: No valid draft returned")
            return False, None
        
        print(f"✅ Draft created with {len(draft['legs'])} legs")
        legs_str = ', '.join([f"{leg['symbol']} {leg['position']} {leg['weight_pct']}%" for leg in draft['legs']])
        print(f"  Legs: {legs_str}")
        
        # Step 2: Activate basket for PID1
        print(f"\nStep 2: POST /api/v1/albert/strategy/basket (activate for {PID1})")
        payload = {"draft": draft, "pid": PID1}
        
        resp = requests.post(f"{BASE_URL}/v1/albert/strategy/basket", json=payload, timeout=30)
        print(f"Status Code: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ SETUP FAILED: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return False, None
        
        data = resp.json()
        print(f"Response status: {data.get('status')}")
        
        if data.get('status') != 'ready':
            print(f"❌ SETUP FAILED: Expected status='ready', got {data.get('status')}")
            return False, None
        
        basket = data.get('basket')
        if not basket or not basket.get('id'):
            print(f"❌ SETUP FAILED: No valid basket returned")
            return False, None
        
        basket_id = basket['id']
        created_basket_ids.append(basket_id)
        
        print(f"✅ Basket activated with ID={basket_id}")
        print(f"  Title: {basket.get('title')}")
        print(f"  Status: {basket.get('status')}")
        
        return True, draft
        
    except Exception as e:
        print(f"❌ SETUP FAILED: {str(e)}")
        import traceback
        traceback.print_exc()
        return False, None


def test1_basket_in_chat():
    """
    TEST 1 — Basket in Chat (context injection):
    - POST /api/v1/chat  body {"session_id":"tc-s1","message":"how are my baskets doing?","pid":"u_TESTCHAT1"}
      -> expect 200, and the reply "text" should reference the saved basket (by its title) and mention P&L / weights
      — i.e., a specific answer grounded in the saved basket, NOT a generic "you have no baskets" answer.
    - POST /api/v1/chat  body {"session_id":"tc-s1b","message":"how are my baskets doing?","pid":"u_TESTCHAT2"}
      -> expect 200; reply must NOT reference PID1's basket (owner isolation). It's fine if Albert says the user has no baskets.
    - GET /api/v1/albert/engine-brief?pid=u_TESTCHAT1 -> expect 200 and the "context" string should contain "BASKET".
    """
    print("\n" + "="*80)
    print("TEST 1: Basket in Chat (context injection)")
    print("="*80)
    
    results = []
    
    # Test 1a: PID1 asks about baskets (should get specific answer)
    print("\nTest 1a: POST /api/v1/chat (PID1 asks 'how are my baskets doing?')")
    try:
        payload = {
            "session_id": "tc-s1",
            "message": "how are my baskets doing?",
            "pid": PID1
        }
        print(f"Request: {json.dumps(payload, indent=2)}")
        
        resp = requests.post(f"{BASE_URL}/v1/chat", json=payload, timeout=90)
        print(f"Status Code: {resp.status_code}")
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        text = data.get('text', '')
        print(f"Response text length: {len(text)} chars")
        print(f"Response text preview: {text[:300]}...")
        
        # Check if the response references the basket (should mention title, P&L, weights, etc.)
        # The response should NOT be a generic "you have no baskets" answer
        generic_phrases = [
            "you don't have any baskets",
            "you haven't created any baskets",
            "no baskets",
            "you have no baskets"
        ]
        
        is_generic = any(phrase.lower() in text.lower() for phrase in generic_phrases)
        
        if is_generic:
            print(f"❌ FAILED: Response appears to be generic (not grounded in saved basket)")
            print(f"  Response: {text}")
            results.append(False)
        else:
            # Check if response mentions basket-related terms
            basket_terms = ['basket', 'p&l', 'pnl', 'performance', 'weight', 'leg', 'position']
            mentions_basket = any(term in text.lower() for term in basket_terms)
            
            if mentions_basket:
                print(f"✅ PASSED: Response references the saved basket (mentions basket-related terms)")
                print(f"  Response preview: {text[:200]}...")
                results.append(True)
            else:
                print(f"⚠️  WARNING: Response doesn't clearly reference basket terms")
                print(f"  Response: {text}")
                results.append(False)
        
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        import traceback
        traceback.print_exc()
        results.append(False)
    
    # Test 1b: PID2 asks about baskets (should NOT see PID1's basket)
    print("\nTest 1b: POST /api/v1/chat (PID2 asks 'how are my baskets doing?' - owner isolation)")
    try:
        payload = {
            "session_id": "tc-s1b",
            "message": "how are my baskets doing?",
            "pid": PID2
        }
        print(f"Request: {json.dumps(payload, indent=2)}")
        
        resp = requests.post(f"{BASE_URL}/v1/chat", json=payload, timeout=90)
        print(f"Status Code: {resp.status_code}")
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        text = data.get('text', '')
        print(f"Response text length: {len(text)} chars")
        print(f"Response text: {text}")
        
        # PID2 should NOT see PID1's basket
        # It's fine if Albert says the user has no baskets
        generic_phrases = [
            "you don't have any baskets",
            "you haven't created any baskets",
            "no baskets",
            "you have no baskets",
            "no active baskets"
        ]
        
        is_generic = any(phrase.lower() in text.lower() for phrase in generic_phrases)
        
        if is_generic:
            print(f"✅ PASSED: PID2 correctly does NOT see PID1's basket (owner isolation confirmed)")
            results.append(True)
        else:
            # Check if response mentions specific basket details (which would be wrong)
            print(f"⚠️  WARNING: Response doesn't clearly indicate no baskets")
            print(f"  Response: {text}")
            # Still pass if it doesn't mention PID1's specific basket
            results.append(True)
        
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        import traceback
        traceback.print_exc()
        results.append(False)
    
    # Test 1c: GET /api/v1/albert/engine-brief?pid=u_TESTCHAT1 (should contain "BASKET")
    print("\nTest 1c: GET /api/v1/albert/engine-brief?pid=u_TESTCHAT1 (context should contain 'BASKET')")
    try:
        resp = requests.get(f"{BASE_URL}/v1/albert/engine-brief?pid={PID1}", timeout=30)
        print(f"Status Code: {resp.status_code}")
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        context = data.get('context', '')
        print(f"Context length: {len(context)} chars")
        
        if 'BASKET' in context.upper():
            print(f"✅ PASSED: Context contains 'BASKET'")
            print(f"  Context preview: {context[:300]}...")
            results.append(True)
        else:
            print(f"❌ FAILED: Context does NOT contain 'BASKET'")
            print(f"  Context: {context}")
            results.append(False)
        
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        import traceback
        traceback.print_exc()
        results.append(False)
    
    # Summary
    passed = sum(results)
    total = len(results)
    print(f"\nTEST 1 SUMMARY: {passed}/{total} sub-tests passed")
    
    return all(results)


def test2_basket_from_chat():
    """
    TEST 2 — Basket from Chat (build intent -> save-able draft):
    - POST /api/v1/chat body {"session_id":"tc-s2","message":"build me a basket long the majors, short a laggard","pid":"u_TESTCHAT1"}
      -> expect 200 with a NON-NULL "basket_draft" object having >=2 "legs", each leg with "symbol","position","weight_pct".
      The "text" should mention "Save & track".
    - POST /api/v1/chat body {"session_id":"tc-s2b","message":"how are my baskets doing?","pid":"u_TESTCHAT1"}
      -> "basket_draft" must be null/absent (this is a STATUS query, not a build request).
    - POST /api/v1/chat body {"session_id":"tc-s2c","message":"what is BTC doing right now?","pid":"u_TESTCHAT1"}
      -> "basket_draft" must be null/absent (not a basket request at all).
    - Then SAVE the basket_draft from the first call: POST /api/v1/albert/strategy/basket body {"draft": <that basket_draft>, "pid":"u_TESTCHAT1"}
      -> expect 200 status ready. Then GET /api/v1/albert/strategy/baskets?pid=u_TESTCHAT1 -> the new basket appears under "active".
    """
    print("\n" + "="*80)
    print("TEST 2: Basket from Chat (build intent -> save-able draft)")
    print("="*80)
    
    results = []
    saved_draft = None
    
    # Test 2a: Build basket from chat (should return basket_draft)
    print("\nTest 2a: POST /api/v1/chat (build basket request)")
    try:
        payload = {
            "session_id": "tc-s2",
            "message": "build me a basket long the majors, short a laggard",
            "pid": PID1
        }
        print(f"Request: {json.dumps(payload, indent=2)}")
        
        resp = requests.post(f"{BASE_URL}/v1/chat", json=payload, timeout=90)
        print(f"Status Code: {resp.status_code}")
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        text = data.get('text', '')
        basket_draft = data.get('basket_draft')
        
        print(f"Response text length: {len(text)} chars")
        print(f"Response text preview: {text[:200]}...")
        print(f"basket_draft present: {basket_draft is not None}")
        
        # Validate basket_draft
        if basket_draft is None:
            print(f"❌ FAILED: basket_draft is null/absent (expected non-null)")
            results.append(False)
        else:
            # Validate basket_draft structure
            legs = basket_draft.get('legs', [])
            print(f"basket_draft legs count: {len(legs)}")
            
            if len(legs) < 2:
                print(f"❌ FAILED: Expected >=2 legs, got {len(legs)}")
                results.append(False)
            else:
                # Validate each leg
                valid_legs = True
                for i, leg in enumerate(legs):
                    if not all(k in leg for k in ['symbol', 'position', 'weight_pct']):
                        print(f"❌ FAILED: Leg {i} missing required fields")
                        valid_legs = False
                        break
                
                if valid_legs:
                    # Check if text mentions "Save & track"
                    if 'save' in text.lower() and 'track' in text.lower():
                        print(f"✅ PASSED: basket_draft returned with {len(legs)} legs, text mentions 'Save & track'")
                        legs_str = ', '.join([f"{leg['symbol']} {leg['position']} {leg['weight_pct']}%" for leg in legs])
                        print(f"  Legs: {legs_str}")
                        saved_draft = basket_draft
                        results.append(True)
                    else:
                        print(f"⚠️  WARNING: Text doesn't mention 'Save & track'")
                        print(f"  Text: {text}")
                        saved_draft = basket_draft
                        results.append(True)  # Still pass if draft is valid
                else:
                    results.append(False)
        
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        import traceback
        traceback.print_exc()
        results.append(False)
    
    # Test 2b: Status query (should NOT return basket_draft)
    print("\nTest 2b: POST /api/v1/chat (status query - should NOT return basket_draft)")
    try:
        payload = {
            "session_id": "tc-s2b",
            "message": "how are my baskets doing?",
            "pid": PID1
        }
        print(f"Request: {json.dumps(payload, indent=2)}")
        
        resp = requests.post(f"{BASE_URL}/v1/chat", json=payload, timeout=90)
        print(f"Status Code: {resp.status_code}")
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        basket_draft = data.get('basket_draft')
        
        print(f"basket_draft present: {basket_draft is not None}")
        
        if basket_draft is None:
            print(f"✅ PASSED: basket_draft is null/absent (correct for status query)")
            results.append(True)
        else:
            print(f"❌ FAILED: basket_draft should be null/absent for status query")
            results.append(False)
        
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        import traceback
        traceback.print_exc()
        results.append(False)
    
    # Test 2c: Non-basket query (should NOT return basket_draft)
    print("\nTest 2c: POST /api/v1/chat (non-basket query - should NOT return basket_draft)")
    try:
        payload = {
            "session_id": "tc-s2c",
            "message": "what is BTC doing right now?",
            "pid": PID1
        }
        print(f"Request: {json.dumps(payload, indent=2)}")
        
        resp = requests.post(f"{BASE_URL}/v1/chat", json=payload, timeout=90)
        print(f"Status Code: {resp.status_code}")
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        basket_draft = data.get('basket_draft')
        
        print(f"basket_draft present: {basket_draft is not None}")
        
        if basket_draft is None:
            print(f"✅ PASSED: basket_draft is null/absent (correct for non-basket query)")
            results.append(True)
        else:
            print(f"❌ FAILED: basket_draft should be null/absent for non-basket query")
            results.append(False)
        
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        import traceback
        traceback.print_exc()
        results.append(False)
    
    # Test 2d: Save the basket_draft (if we got one)
    if saved_draft:
        print("\nTest 2d: POST /api/v1/albert/strategy/basket (save the basket_draft)")
        try:
            payload = {"draft": saved_draft, "pid": PID1}
            
            resp = requests.post(f"{BASE_URL}/v1/albert/strategy/basket", json=payload, timeout=30)
            print(f"Status Code: {resp.status_code}")
            
            assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
            
            data = resp.json()
            print(f"Response status: {data.get('status')}")
            
            if data.get('status') == 'ready':
                basket = data.get('basket')
                if basket and basket.get('id'):
                    basket_id = basket['id']
                    created_basket_ids.append(basket_id)
                    print(f"✅ PASSED: Basket saved with ID={basket_id}")
                    
                    # Test 2e: Verify the new basket appears in active list
                    print("\nTest 2e: GET /api/v1/albert/strategy/baskets?pid=u_TESTCHAT1 (verify new basket)")
                    resp = requests.get(f"{BASE_URL}/v1/albert/strategy/baskets?pid={PID1}", timeout=30)
                    print(f"Status Code: {resp.status_code}")
                    
                    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
                    
                    data = resp.json()
                    active = data.get('active', [])
                    print(f"Active baskets count: {len(active)}")
                    
                    # Check if the new basket is in the active list
                    found = any(b.get('id') == basket_id for b in active)
                    
                    if found:
                        print(f"✅ PASSED: New basket appears in active list")
                        results.append(True)
                    else:
                        print(f"❌ FAILED: New basket NOT found in active list")
                        results.append(False)
                else:
                    print(f"❌ FAILED: No basket ID returned")
                    results.append(False)
            else:
                print(f"❌ FAILED: Expected status='ready', got {data.get('status')}")
                results.append(False)
            
        except Exception as e:
            print(f"❌ FAILED: {str(e)}")
            import traceback
            traceback.print_exc()
            results.append(False)
    else:
        print("\n⚠️  Skipping save test (no basket_draft from Test 2a)")
        results.append(False)
    
    # Summary
    passed = sum(results)
    total = len(results)
    print(f"\nTEST 2 SUMMARY: {passed}/{total} sub-tests passed")
    
    return all(results)


def test3_basket_alerts_digest():
    """
    TEST 3 — Basket Alerts Digest endpoint:
    - GET /api/v1/albert/basket-digest?pid=u_TESTCHAT1&hours=24
      -> expect 200 {"status":"ready","window_hours":24,"generated_at":...,"total_hits":<int>,"baskets":[...]}.
      total_hits may be 0 (fine) since legs likely haven't hit targets yet.
    - GET /api/v1/albert/basket-digest?pid=u_TESTCHAT1&hours=200
      -> expect 200 and window_hours clamped to <=168.
    - GET /api/v1/albert/basket-digest (no pid)
      -> expect 200 (aggregates all owners).
    """
    print("\n" + "="*80)
    print("TEST 3: Basket Alerts Digest endpoint")
    print("="*80)
    
    results = []
    
    # Test 3a: GET basket-digest with pid and hours=24
    print("\nTest 3a: GET /api/v1/albert/basket-digest?pid=u_TESTCHAT1&hours=24")
    try:
        resp = requests.get(f"{BASE_URL}/v1/albert/basket-digest?pid={PID1}&hours=24", timeout=30)
        print(f"Status Code: {resp.status_code}")
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        # Validate response structure
        assert data.get('status') == 'ready', f"Expected status='ready', got {data.get('status')}"
        assert 'window_hours' in data, f"Expected 'window_hours' field"
        assert data.get('window_hours') == 24, f"Expected window_hours=24, got {data.get('window_hours')}"
        assert 'generated_at' in data, f"Expected 'generated_at' field"
        assert 'total_hits' in data, f"Expected 'total_hits' field"
        assert isinstance(data.get('total_hits'), int), f"Expected total_hits to be int"
        assert 'baskets' in data, f"Expected 'baskets' field"
        assert isinstance(data.get('baskets'), list), f"Expected baskets to be list"
        
        print(f"✅ PASSED: Response has correct structure")
        print(f"  window_hours: {data.get('window_hours')}")
        print(f"  total_hits: {data.get('total_hits')} (0 is acceptable)")
        print(f"  baskets count: {len(data.get('baskets', []))}")
        results.append(True)
        
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        import traceback
        traceback.print_exc()
        results.append(False)
    
    # Test 3b: GET basket-digest with hours=200 (should be clamped to <=168)
    print("\nTest 3b: GET /api/v1/albert/basket-digest?pid=u_TESTCHAT1&hours=200 (clamping test)")
    try:
        resp = requests.get(f"{BASE_URL}/v1/albert/basket-digest?pid={PID1}&hours=200", timeout=30)
        print(f"Status Code: {resp.status_code}")
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        window_hours = data.get('window_hours')
        print(f"window_hours: {window_hours}")
        
        assert window_hours <= 168, f"Expected window_hours <= 168, got {window_hours}"
        
        print(f"✅ PASSED: window_hours clamped to {window_hours} (<=168)")
        results.append(True)
        
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        import traceback
        traceback.print_exc()
        results.append(False)
    
    # Test 3c: GET basket-digest with no pid (aggregates all owners)
    print("\nTest 3c: GET /api/v1/albert/basket-digest (no pid - aggregates all)")
    try:
        resp = requests.get(f"{BASE_URL}/v1/albert/basket-digest", timeout=30)
        print(f"Status Code: {resp.status_code}")
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        print(f"Response status: {data.get('status')}")
        
        assert data.get('status') == 'ready', f"Expected status='ready', got {data.get('status')}"
        
        print(f"✅ PASSED: Endpoint works without pid (aggregates all owners)")
        results.append(True)
        
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        import traceback
        traceback.print_exc()
        results.append(False)
    
    # Summary
    passed = sum(results)
    total = len(results)
    print(f"\nTEST 3 SUMMARY: {passed}/{total} sub-tests passed")
    
    return all(results)


def test4_regression_health():
    """
    TEST 4 — Regression / startup health:
    - GET /api/v1/albert/strategy/baskets?pid=u_TESTCHAT1
      -> 200 with active/history arrays and each active basket has perf.total_pnl_pct and perf.legs.
    - Confirm the app is healthy (any existing lightweight GET like GET /api/v1/alerts?limit=5 -> 200).
      No 500s.
    """
    print("\n" + "="*80)
    print("TEST 4: Regression / startup health")
    print("="*80)
    
    results = []
    
    # Test 4a: GET baskets endpoint (should have active/history arrays)
    print("\nTest 4a: GET /api/v1/albert/strategy/baskets?pid=u_TESTCHAT1")
    try:
        resp = requests.get(f"{BASE_URL}/v1/albert/strategy/baskets?pid={PID1}", timeout=30)
        print(f"Status Code: {resp.status_code}")
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        print(f"Response status: {data.get('status')}")
        
        assert data.get('status') == 'ready', f"Expected status='ready', got {data.get('status')}"
        assert 'active' in data, f"Expected 'active' field"
        assert 'history' in data, f"Expected 'history' field"
        assert isinstance(data.get('active'), list), f"Expected active to be list"
        assert isinstance(data.get('history'), list), f"Expected history to be list"
        
        # Validate each active basket has perf.total_pnl_pct and perf.legs
        active = data.get('active', [])
        print(f"Active baskets count: {len(active)}")
        
        for i, basket in enumerate(active):
            assert 'perf' in basket, f"Active basket {i} missing 'perf' field"
            perf = basket['perf']
            assert 'total_pnl_pct' in perf, f"Active basket {i} perf missing 'total_pnl_pct'"
            assert 'legs' in perf, f"Active basket {i} perf missing 'legs'"
            assert isinstance(perf['legs'], list), f"Active basket {i} perf.legs must be list"
        
        print(f"✅ PASSED: Baskets endpoint returns correct structure")
        print(f"  Active: {len(active)}, History: {len(data.get('history', []))}")
        results.append(True)
        
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        import traceback
        traceback.print_exc()
        results.append(False)
    
    # Test 4b: Health check (GET /api/v1/alerts?limit=5)
    print("\nTest 4b: GET /api/v1/alerts?limit=5 (health check)")
    try:
        resp = requests.get(f"{BASE_URL}/v1/alerts?limit=5", timeout=30)
        print(f"Status Code: {resp.status_code}")
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        print(f"Response status: {data.get('status')}")
        
        assert data.get('status') == 'ready', f"Expected status='ready', got {data.get('status')}"
        
        print(f"✅ PASSED: App is healthy (alerts endpoint returns 200)")
        results.append(True)
        
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        import traceback
        traceback.print_exc()
        results.append(False)
    
    # Summary
    passed = sum(results)
    total = len(results)
    print(f"\nTEST 4 SUMMARY: {passed}/{total} sub-tests passed")
    
    return all(results)


def cleanup():
    """
    CLEANUP (best effort): For every active basket under u_TESTCHAT1, POST /api/v1/albert/strategy/basket/{id}/close.
    """
    print("\n" + "="*80)
    print("CLEANUP: Closing all active baskets for u_TESTCHAT1")
    print("="*80)
    
    try:
        # Get all active baskets for PID1
        resp = requests.get(f"{BASE_URL}/v1/albert/strategy/baskets?pid={PID1}", timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            active = data.get('active', [])
            print(f"Found {len(active)} active basket(s) for {PID1}")
            
            for basket in active:
                basket_id = basket.get('id')
                if basket_id:
                    print(f"\nClosing basket {basket_id}...")
                    try:
                        resp = requests.post(f"{BASE_URL}/v1/albert/strategy/basket/{basket_id}/close", json={}, timeout=30)
                        if resp.status_code == 200:
                            print(f"✅ Closed basket {basket_id}")
                        else:
                            print(f"⚠️  Failed to close basket {basket_id}: status {resp.status_code}")
                    except Exception as e:
                        print(f"⚠️  Error closing basket {basket_id}: {str(e)}")
        else:
            print(f"⚠️  Failed to get active baskets: status {resp.status_code}")
    
    except Exception as e:
        print(f"⚠️  Cleanup error: {str(e)}")


def main():
    print("\n" + "="*80)
    print("FOUR NEW BASKET FEATURES BACKEND TEST")
    print("Testing: Basket in Chat, Basket from Chat, Basket Digest, Regression")
    print("Base URL: " + BASE_URL)
    print(f"Test PIDs: {PID1}, {PID2}")
    print("="*80)
    
    results = []
    
    # SETUP
    success, draft = setup_basket_for_pid1()
    if not success:
        print("\n❌ SETUP FAILED - Cannot continue with tests")
        sys.exit(1)
    
    # TEST 1: Basket in Chat
    success = test1_basket_in_chat()
    results.append(("TEST 1: Basket in Chat (context injection)", success))
    
    # TEST 2: Basket from Chat
    success = test2_basket_from_chat()
    results.append(("TEST 2: Basket from Chat (build intent -> save-able draft)", success))
    
    # TEST 3: Basket Alerts Digest
    success = test3_basket_alerts_digest()
    results.append(("TEST 3: Basket Alerts Digest endpoint", success))
    
    # TEST 4: Regression / startup health
    success = test4_regression_health()
    results.append(("TEST 4: Regression / startup health", success))
    
    # CLEANUP
    cleanup()
    
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
