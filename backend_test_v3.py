#!/usr/bin/env python3
"""
Backend Test for Alert Engine v3
Tests NEW Alert Engine v3 endpoints: sectors, edge, edge-board, unlocks
Real ccxt data - use 60s timeouts
"""
import requests
import json
import time
import sys

# Base URL from .env
BASE_URL = "https://what-if-sandbox.preview.emergentagent.com/api"

# Timeout for endpoints (can take 10-60s for real ccxt data)
TIMEOUT = 60

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

def test_step_1_get_sectors():
    """
    STEP 1: GET /api/v1/alert-engine/sectors
    Expect 200 {status:'ready', sectors:[...]}
    Assert sectors non-empty
    Each item has 'sector' (string), 'strength' (number or null), 'hot' (bool), 'members' (array)
    """
    print_test("STEP 1: GET /api/v1/alert-engine/sectors")
    
    try:
        url = f"{BASE_URL}/v1/alert-engine/sectors"
        print_info(f"GET {url}")
        print_info(f"⏱️  WARNING: This can take 10-60s (fetching real OHLCV via ccxt)...")
        
        start_time = time.time()
        response = requests.get(url, timeout=TIMEOUT)
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
        print_pass("status='ready'")
        
        # Check sectors array
        sectors = data.get('sectors', [])
        if not isinstance(sectors, list):
            print_fail(f"Expected sectors to be a list, got {type(sectors)}")
            return False
        
        if len(sectors) == 0:
            print_fail("Expected sectors to be non-empty")
            return False
        print_pass(f"sectors is non-empty (length: {len(sectors)})")
        
        # Check first sector structure
        first_sector = sectors[0]
        print_info(f"First sector: {json.dumps(first_sector, indent=2)}")
        
        # Check 'sector' field (string)
        if 'sector' not in first_sector:
            print_fail("Missing 'sector' field")
            return False
        if not isinstance(first_sector['sector'], str):
            print_fail(f"Expected 'sector' to be string, got {type(first_sector['sector'])}")
            return False
        print_pass(f"Each sector has 'sector' (string): '{first_sector['sector']}'")
        
        # Check 'strength' field (number or null)
        if 'strength' not in first_sector:
            print_fail("Missing 'strength' field")
            return False
        strength = first_sector['strength']
        if strength is not None and not isinstance(strength, (int, float)):
            print_fail(f"Expected 'strength' to be number or null, got {type(strength)}")
            return False
        print_pass(f"Each sector has 'strength' (number or null): {strength}")
        
        # Check 'hot' field (bool)
        if 'hot' not in first_sector:
            print_fail("Missing 'hot' field")
            return False
        if not isinstance(first_sector['hot'], bool):
            print_fail(f"Expected 'hot' to be bool, got {type(first_sector['hot'])}")
            return False
        print_pass(f"Each sector has 'hot' (bool): {first_sector['hot']}")
        
        # Check 'members' field (array)
        if 'members' not in first_sector:
            print_fail("Missing 'members' field")
            return False
        if not isinstance(first_sector['members'], list):
            print_fail(f"Expected 'members' to be array, got {type(first_sector['members'])}")
            return False
        print_pass(f"Each sector has 'members' (array): {len(first_sector['members'])} items")
        
        print_pass("STEP 1 PASSED - GET /api/v1/alert-engine/sectors returns valid structure")
        return True
        
    except requests.exceptions.Timeout:
        print_fail(f"Request timed out after {TIMEOUT}s")
        return False
    except Exception as e:
        print_fail(f"Exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_step_2_get_edge():
    """
    STEP 2: GET /api/v1/alert-engine/edge?symbol=BTC
    Expect 200 {status:'ready', symbol:'BTC', ranked:[{detector, win_10, avg_10, score}], best}
    Assert ranked is non-empty and sorted by score descending
    Assert best is present
    Repeat for symbol=SOL (also non-empty)
    """
    print_test("STEP 2: GET /api/v1/alert-engine/edge (BTC and SOL)")
    
    symbols = ['BTC', 'SOL']
    
    for symbol in symbols:
        print_info(f"\n--- Testing symbol: {symbol} ---")
        
        try:
            url = f"{BASE_URL}/v1/alert-engine/edge?symbol={symbol}"
            print_info(f"GET {url}")
            print_info(f"⏱️  WARNING: This can take 10-60s (fetching real OHLCV via ccxt)...")
            
            start_time = time.time()
            response = requests.get(url, timeout=TIMEOUT)
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
            print_pass(f"{symbol}: status='ready'")
            
            # Check symbol
            if data.get('symbol') != symbol:
                print_fail(f"Expected symbol='{symbol}', got '{data.get('symbol')}'")
                return False
            print_pass(f"{symbol}: symbol='{symbol}'")
            
            # Check ranked array
            ranked = data.get('ranked', [])
            if not isinstance(ranked, list):
                print_fail(f"{symbol}: Expected ranked to be a list, got {type(ranked)}")
                return False
            
            if len(ranked) == 0:
                print_fail(f"{symbol}: Expected ranked to be non-empty")
                return False
            print_pass(f"{symbol}: ranked is non-empty (length: {len(ranked)})")
            
            # Check first ranked item structure
            first_item = ranked[0]
            print_info(f"{symbol}: First ranked item: {json.dumps(first_item, indent=2)}")
            
            # Check required fields
            required_fields = ['detector', 'win_10', 'avg_10', 'score']
            for field in required_fields:
                if field not in first_item:
                    print_fail(f"{symbol}: Missing '{field}' field in ranked item")
                    return False
            print_pass(f"{symbol}: Each ranked item has required fields: {required_fields}")
            
            # Check score is numeric
            if not isinstance(first_item['score'], (int, float)):
                print_fail(f"{symbol}: Expected score to be numeric, got {type(first_item['score'])}")
                return False
            print_pass(f"{symbol}: score is numeric: {first_item['score']}")
            
            # Check ranked is sorted by score descending
            scores = [item['score'] for item in ranked]
            if scores != sorted(scores, reverse=True):
                print_fail(f"{symbol}: Expected ranked to be sorted by score descending, got scores: {scores}")
                return False
            print_pass(f"{symbol}: ranked is sorted by score descending: {scores}")
            
            # Check best is present
            if 'best' not in data:
                print_fail(f"{symbol}: Missing 'best' field")
                return False
            print_pass(f"{symbol}: 'best' field is present: {data['best']}")
            
            print_pass(f"{symbol}: All validations passed")
            
        except requests.exceptions.Timeout:
            print_fail(f"{symbol}: Request timed out after {TIMEOUT}s")
            return False
        except Exception as e:
            print_fail(f"{symbol}: Exception: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    print_pass("STEP 2 PASSED - GET edge for BTC and SOL both succeed")
    return True

def test_step_3_get_edge_board():
    """
    STEP 3: GET /api/v1/alert-engine/edge-board
    Expect 200 {status:'ready', board:[{symbol, best, ranked}]}
    Assert board non-empty (first call may take ~10-20s)
    Assert board is sorted by best.score descending
    """
    print_test("STEP 3: GET /api/v1/alert-engine/edge-board")
    
    try:
        url = f"{BASE_URL}/v1/alert-engine/edge-board"
        print_info(f"GET {url}")
        print_info(f"⏱️  WARNING: First call may take ~10-20s (fetching real OHLCV via ccxt)...")
        
        start_time = time.time()
        response = requests.get(url, timeout=TIMEOUT)
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
        print_pass("status='ready'")
        
        # Check board array
        board = data.get('board', [])
        if not isinstance(board, list):
            print_fail(f"Expected board to be a list, got {type(board)}")
            return False
        
        if len(board) == 0:
            print_fail("Expected board to be non-empty")
            return False
        print_pass(f"board is non-empty (length: {len(board)})")
        
        # Check first board item structure
        first_item = board[0]
        print_info(f"First board item: {json.dumps(first_item, indent=2)[:500]}")
        
        # Check required fields
        required_fields = ['symbol', 'best', 'ranked']
        for field in required_fields:
            if field not in first_item:
                print_fail(f"Missing '{field}' field in board item")
                return False
        print_pass(f"Each board item has required fields: {required_fields}")
        
        # Check best is a dict with score
        best = first_item['best']
        if not isinstance(best, dict):
            print_fail(f"Expected best to be a dict, got {type(best)}")
            return False
        if 'score' not in best:
            print_fail("Missing 'score' field in best")
            return False
        print_pass(f"Each board item has 'best' with 'score': {best['score']}")
        
        # Check ranked is a list
        ranked = first_item['ranked']
        if not isinstance(ranked, list):
            print_fail(f"Expected ranked to be a list, got {type(ranked)}")
            return False
        print_pass(f"Each board item has 'ranked' (array): {len(ranked)} items")
        
        # Check board is sorted by best.score descending
        best_scores = [item['best']['score'] for item in board]
        if best_scores != sorted(best_scores, reverse=True):
            print_fail(f"Expected board to be sorted by best.score descending, got scores: {best_scores}")
            return False
        print_pass(f"board is sorted by best.score descending: {best_scores[:5]}...")
        
        print_pass("STEP 3 PASSED - GET /api/v1/alert-engine/edge-board returns valid structure")
        return True
        
    except requests.exceptions.Timeout:
        print_fail(f"Request timed out after {TIMEOUT}s")
        return False
    except Exception as e:
        print_fail(f"Exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_step_4_get_unlocks():
    """
    STEP 4: GET /api/v1/alert-engine/unlocks?symbol=APT
    Expect 200. NO Tokenomist key is configured, so expect {status:'ready', available:false, note:...}
    This key-gated response is CORRECT (pass), not a failure.
    """
    print_test("STEP 4: GET /api/v1/alert-engine/unlocks (key-gated)")
    
    try:
        url = f"{BASE_URL}/v1/alert-engine/unlocks?symbol=APT"
        print_info(f"GET {url}")
        print_info(f"⏱️  NOTE: NO Tokenomist key configured - expect available:false")
        
        start_time = time.time()
        response = requests.get(url, timeout=TIMEOUT)
        elapsed = time.time() - start_time
        
        print_info(f"Status Code: {response.status_code} (took {elapsed:.1f}s)")
        
        if response.status_code != 200:
            print_fail(f"Expected status 200, got {response.status_code}")
            print_info(f"Response: {response.text[:500]}")
            return False
        
        data = response.json()
        print_info(f"Response: {json.dumps(data, indent=2)}")
        
        # Check status
        if data.get('status') != 'ready':
            print_fail(f"Expected status='ready', got '{data.get('status')}'")
            return False
        print_pass("status='ready'")
        
        # Check available is false (no key configured)
        if 'available' not in data:
            print_fail("Missing 'available' field")
            return False
        
        if data['available'] is not False:
            print_fail(f"Expected available=false (no Tokenomist key), got {data['available']}")
            return False
        print_pass("available=false (correct - no Tokenomist key configured)")
        
        # Check note is present
        if 'note' not in data:
            print_fail("Missing 'note' field")
            return False
        print_pass(f"note present: '{data['note']}'")
        
        print_pass("STEP 4 PASSED - GET /api/v1/alert-engine/unlocks returns correct key-gated response")
        return True
        
    except requests.exceptions.Timeout:
        print_fail(f"Request timed out after {TIMEOUT}s")
        return False
    except Exception as e:
        print_fail(f"Exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_step_5_get_config():
    """
    STEP 5: GET /api/v1/alert-engine/config
    Assert settings.filters includes 'sector':true and 'unlock':true
    Assert settings has auto_prioritise:true, suppress_negative_edge:false, unlock_days:14, unlock_pct:1.0
    """
    print_test("STEP 5: GET /api/v1/alert-engine/config (verify v3 settings)")
    
    try:
        url = f"{BASE_URL}/v1/alert-engine/config"
        print_info(f"GET {url}")
        
        response = requests.get(url, timeout=TIMEOUT)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_fail(f"Expected status 200, got {response.status_code}")
            print_info(f"Response: {response.text[:500]}")
            return False
        
        data = response.json()
        
        # Check status
        if data.get('status') != 'ready':
            print_fail(f"Expected status='ready', got '{data.get('status')}'")
            return False
        print_pass("status='ready'")
        
        settings = data.get('settings', {})
        if not isinstance(settings, dict):
            print_fail(f"Expected settings to be a dict, got {type(settings)}")
            return False
        
        # Check filters.sector
        filters = settings.get('filters', {})
        if 'sector' not in filters:
            print_fail("Missing settings.filters.sector")
            return False
        if filters['sector'] is not True:
            print_fail(f"Expected settings.filters.sector=true, got {filters['sector']}")
            return False
        print_pass("settings.filters.sector = true")
        
        # Check filters.unlock
        if 'unlock' not in filters:
            print_fail("Missing settings.filters.unlock")
            return False
        if filters['unlock'] is not True:
            print_fail(f"Expected settings.filters.unlock=true, got {filters['unlock']}")
            return False
        print_pass("settings.filters.unlock = true")
        
        # Check auto_prioritise
        if 'auto_prioritise' not in settings:
            print_fail("Missing settings.auto_prioritise")
            return False
        if settings['auto_prioritise'] is not True:
            print_fail(f"Expected settings.auto_prioritise=true, got {settings['auto_prioritise']}")
            return False
        print_pass("settings.auto_prioritise = true")
        
        # Check suppress_negative_edge
        if 'suppress_negative_edge' not in settings:
            print_fail("Missing settings.suppress_negative_edge")
            return False
        if settings['suppress_negative_edge'] is not False:
            print_fail(f"Expected settings.suppress_negative_edge=false, got {settings['suppress_negative_edge']}")
            return False
        print_pass("settings.suppress_negative_edge = false")
        
        # Check unlock_days
        if 'unlock_days' not in settings:
            print_fail("Missing settings.unlock_days")
            return False
        if settings['unlock_days'] != 14:
            print_fail(f"Expected settings.unlock_days=14, got {settings['unlock_days']}")
            return False
        print_pass("settings.unlock_days = 14")
        
        # Check unlock_pct
        if 'unlock_pct' not in settings:
            print_fail("Missing settings.unlock_pct")
            return False
        if settings['unlock_pct'] != 1.0:
            print_fail(f"Expected settings.unlock_pct=1.0, got {settings['unlock_pct']}")
            return False
        print_pass("settings.unlock_pct = 1.0")
        
        print_pass("STEP 5 PASSED - GET /api/v1/alert-engine/config has all v3 settings")
        return True
        
    except Exception as e:
        print_fail(f"Exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_step_6_regression():
    """
    STEP 6: Regression tests
    GET /api/v1/alert-engine/readings?symbol=ETH returns readings + filters (with btc_rs)
    POST /api/v1/alert-engine/scan {"symbol":"BTC"} returns 200 {status:'ready', scanned:['BTC'], result}
    """
    print_test("STEP 6: Regression tests (readings + scan)")
    
    # Test 6a: GET readings for ETH
    print_info("\n--- Test 6a: GET /api/v1/alert-engine/readings?symbol=ETH ---")
    try:
        url = f"{BASE_URL}/v1/alert-engine/readings?symbol=ETH"
        print_info(f"GET {url}")
        print_info(f"⏱️  WARNING: This can take 10-60s (fetching real OHLCV via ccxt)...")
        
        start_time = time.time()
        response = requests.get(url, timeout=TIMEOUT)
        elapsed = time.time() - start_time
        
        print_info(f"Status Code: {response.status_code} (took {elapsed:.1f}s)")
        
        if response.status_code != 200:
            print_fail(f"Expected status 200, got {response.status_code}")
            print_info(f"Response: {response.text[:500]}")
            return False
        
        data = response.json()
        
        # Check status
        if data.get('status') != 'ready':
            print_fail(f"Expected status='ready', got '{data.get('status')}'")
            return False
        print_pass("ETH readings: status='ready'")
        
        # Check readings
        readings = data.get('readings', {})
        if not isinstance(readings, dict):
            print_fail(f"Expected readings to be a dict, got {type(readings)}")
            return False
        print_pass("ETH readings: readings present")
        
        # Check filters with btc_rs
        filters = data.get('filters', {})
        if not isinstance(filters, dict):
            print_fail(f"Expected filters to be a dict, got {type(filters)}")
            return False
        
        if 'btc_rs' not in filters:
            print_fail("Missing filters.btc_rs")
            return False
        print_pass(f"ETH readings: filters.btc_rs present: {filters['btc_rs']}")
        
    except requests.exceptions.Timeout:
        print_fail(f"ETH readings: Request timed out after {TIMEOUT}s")
        return False
    except Exception as e:
        print_fail(f"ETH readings: Exception: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Test 6b: POST scan for BTC
    print_info("\n--- Test 6b: POST /api/v1/alert-engine/scan ---")
    try:
        url = f"{BASE_URL}/v1/alert-engine/scan"
        payload = {"symbol": "BTC"}
        
        print_info(f"POST {url}")
        print_info(f"Payload: {json.dumps(payload, indent=2)}")
        
        start_time = time.time()
        response = requests.post(url, json=payload, timeout=TIMEOUT)
        elapsed = time.time() - start_time
        
        print_info(f"Status Code: {response.status_code} (took {elapsed:.1f}s)")
        
        if response.status_code != 200:
            print_fail(f"Expected status 200, got {response.status_code}")
            print_info(f"Response: {response.text[:500]}")
            return False
        
        data = response.json()
        
        # Check status
        if data.get('status') != 'ready':
            print_fail(f"Expected status='ready', got '{data.get('status')}'")
            return False
        print_pass("BTC scan: status='ready'")
        
        # Check scanned
        scanned = data.get('scanned', [])
        if 'BTC' not in scanned:
            print_fail(f"Expected 'BTC' in scanned, got {scanned}")
            return False
        print_pass(f"BTC scan: scanned contains 'BTC': {scanned}")
        
        # Check result
        if 'result' not in data:
            print_fail("Missing result field")
            return False
        print_pass("BTC scan: result present")
        
    except requests.exceptions.Timeout:
        print_fail(f"BTC scan: Request timed out after {TIMEOUT}s")
        return False
    except Exception as e:
        print_fail(f"BTC scan: Exception: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    print_pass("STEP 6 PASSED - Regression tests (readings + scan) both succeed")
    return True

def main():
    print("\n" + "="*80)
    print("ALERT ENGINE V3 BACKEND TEST")
    print("Testing NEW Alert Engine v3 endpoints: sectors, edge, edge-board, unlocks")
    print("Real ccxt data - use 60s timeouts")
    print("="*80)
    
    results = []
    
    # Run all tests
    results.append(("STEP 1: GET sectors", test_step_1_get_sectors()))
    results.append(("STEP 2: GET edge (BTC+SOL)", test_step_2_get_edge()))
    results.append(("STEP 3: GET edge-board", test_step_3_get_edge_board()))
    results.append(("STEP 4: GET unlocks (key-gated)", test_step_4_get_unlocks()))
    results.append(("STEP 5: GET config (v3 settings)", test_step_5_get_config()))
    results.append(("STEP 6: Regression (readings+scan)", test_step_6_regression()))
    
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
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        return 1

if __name__ == '__main__':
    sys.exit(main())
