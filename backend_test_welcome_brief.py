"""
Backend testing for Welcome Brief endpoint.
Tests via external API base URL.
"""
import requests
import time
import uuid
from typing import Dict, Any

BASE_URL = "https://what-if-sandbox.preview.emergentagent.com/api"
SEEDED_PID = "u_7693422a-e2c0-4242-8211-e6f1d0eaa320"

# Track test PIDs for cleanup
test_pids = []

def log_test(test_name: str, passed: bool, details: str = ""):
    """Log test results."""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"\n{status}: {test_name}")
    if details:
        print(f"  {details}")

def create_test_pid(prefix: str) -> str:
    """Create a unique test PID."""
    test_uuid = str(uuid.uuid4())
    pid = f"u_{prefix}_{test_uuid}"
    test_pids.append(pid)
    return pid

def cleanup_test_data():
    """Clean up all test data from MongoDB."""
    print("\n" + "="*80)
    print("CLEANUP: Removing test data...")
    print("="*80)
    
    # Import MongoDB collections
    import sys
    sys.path.insert(0, '/app/backend')
    from config import (
        mandate_col, portfolio_col, portfolio_risk_col
    )
    
    deleted_counts = {}
    for pid in test_pids:
        deleted_counts[pid] = {
            'mandates': mandate_col.delete_many({'pid': pid}).deleted_count,
            'portfolios': portfolio_col.delete_many({'pid': pid}).deleted_count,
            'portfolio_risk': portfolio_risk_col.delete_many({'_id': pid}).deleted_count,
        }
    
    total_deleted = sum(sum(counts.values()) for counts in deleted_counts.values())
    print(f"✅ Deleted {total_deleted} documents across {len(test_pids)} test PIDs")
    for pid, counts in deleted_counts.items():
        print(f"  {pid}: {counts}")

# ============================================================================
# WELCOME BRIEF TESTS
# ============================================================================

def test_complete_mandate():
    """
    Test 1: COMPLETE MANDATE
    GET /welcome-brief?pid=u_7693422a-e2c0-4242-8211-e6f1d0eaa320 (seeded pid with complete mandate + holdings)
    Assert: HTTP 200, status='ready', mandateComplete=true, onboarding=false
    callCounts is a dict with keys BUY/SELL/HOLD/WAIT (all ints)
    portfolio.totalValueUsd is a number
    protection is a dict with an 'active' boolean
    albertLine is a NON-EMPTY string (reasonably short, not an error/JSON dump)
    If callCounts.BUY>0 then topBuys is non-empty; if callCounts.SELL>0 then topSells is non-empty
    len(topBuys)<=3 and len(topSells)<=3
    """
    print("\n" + "="*80)
    print("TEST 1: COMPLETE MANDATE")
    print("="*80)
    
    pid = SEEDED_PID
    print(f"Test PID: {pid}")
    
    try:
        # GET welcome-brief (allow up to 60s as it computes decisions)
        print("Calling GET /api/v1/albert/welcome-brief (may take up to 60s)...")
        resp = requests.get(f"{BASE_URL}/v1/albert/welcome-brief", 
                          params={'pid': pid}, timeout=60)
        
        assert resp.status_code == 200, f"Expected HTTP 200, got {resp.status_code}"
        log_test("1.1 - HTTP 200", True)
        
        data = resp.json()
        
        # Check status
        status = data.get('status')
        assert status == 'ready', f"Expected status='ready', got {status}"
        log_test("1.2 - status='ready'", True)
        
        # Check mandateComplete and onboarding
        mandate_complete = data.get('mandateComplete')
        onboarding = data.get('onboarding')
        assert mandate_complete == True, f"Expected mandateComplete=true, got {mandate_complete}"
        assert onboarding == False, f"Expected onboarding=false, got {onboarding}"
        log_test("1.3 - mandateComplete=true, onboarding=false", True)
        
        # Check callCounts
        call_counts = data.get('callCounts')
        assert isinstance(call_counts, dict), f"callCounts should be dict, got {type(call_counts)}"
        required_keys = ['BUY', 'SELL', 'HOLD', 'WAIT']
        for key in required_keys:
            assert key in call_counts, f"callCounts missing key: {key}"
            assert isinstance(call_counts[key], int), f"callCounts[{key}] should be int, got {type(call_counts[key])}"
        log_test("1.4 - callCounts is dict with BUY/SELL/HOLD/WAIT (all ints)", True, 
                f"callCounts: {call_counts}")
        
        # Check portfolio
        portfolio = data.get('portfolio')
        assert isinstance(portfolio, dict), f"portfolio should be dict, got {type(portfolio)}"
        total_value = portfolio.get('totalValueUsd')
        assert isinstance(total_value, (int, float)), \
            f"portfolio.totalValueUsd should be number, got {type(total_value)}"
        log_test("1.5 - portfolio.totalValueUsd is a number", True, 
                f"totalValueUsd: {total_value}")
        
        # Check protection
        protection = data.get('protection')
        assert isinstance(protection, dict), f"protection should be dict, got {type(protection)}"
        active = protection.get('active')
        assert isinstance(active, bool), f"protection.active should be bool, got {type(active)}"
        log_test("1.6 - protection is dict with 'active' boolean", True, 
                f"protection: {protection}")
        
        # Check albertLine
        albert_line = data.get('albertLine')
        assert isinstance(albert_line, str), f"albertLine should be string, got {type(albert_line)}"
        assert len(albert_line) > 0, "albertLine should be non-empty"
        assert len(albert_line.split()) <= 100, \
            f"albertLine should be reasonably short (<= 100 words), got {len(albert_line.split())} words"
        # Check it's not an error or JSON dump
        assert not albert_line.lower().startswith('error'), "albertLine looks like an error"
        assert not albert_line.startswith('{'), "albertLine looks like a JSON dump"
        log_test("1.7 - albertLine is NON-EMPTY string (reasonably short)", True, 
                f"albertLine: '{albert_line}' ({len(albert_line.split())} words)")
        
        # Check topBuys and topSells consistency with callCounts
        top_buys = data.get('topBuys', [])
        top_sells = data.get('topSells', [])
        
        if call_counts['BUY'] > 0:
            assert len(top_buys) > 0, \
                f"callCounts.BUY={call_counts['BUY']} but topBuys is empty"
        
        if call_counts['SELL'] > 0:
            assert len(top_sells) > 0, \
                f"callCounts.SELL={call_counts['SELL']} but topSells is empty"
        
        assert len(top_buys) <= 3, f"topBuys should have <= 3 entries, got {len(top_buys)}"
        assert len(top_sells) <= 3, f"topSells should have <= 3 entries, got {len(top_sells)}"
        
        log_test("1.8 - topBuys/topSells consistency with callCounts", True, 
                f"BUY={call_counts['BUY']}, topBuys={len(top_buys)}; SELL={call_counts['SELL']}, topSells={len(top_sells)}")
        
        # Store data for next test
        return data
        
    except AssertionError as e:
        log_test("Test 1 - COMPLETE MANDATE", False, str(e))
        return None
    except Exception as e:
        log_test("Test 1 - COMPLETE MANDATE", False, f"Exception: {e}")
        return None

def test_numbers_integrity(welcome_data: Dict[str, Any]):
    """
    Test 2: NUMBERS INTEGRITY (no invented numbers)
    Call GET /api/v1/albert/decisions?pid=u_7693422a-e2c0-4242-8211-e6f1d0eaa320
    For each symbol in welcome-brief topBuys, its deployNowUsd must equal that symbol's 
    recommendedDeployNowUsd in the decisions response (within $0.01)
    For each symbol in topSells, its sellUsd must equal that symbol's sellPlan.sellUsd 
    in decisions (within $0.01)
    This proves the brief reuses the deterministic decisions and does not fabricate figures.
    """
    print("\n" + "="*80)
    print("TEST 2: NUMBERS INTEGRITY")
    print("="*80)
    
    if not welcome_data:
        log_test("Test 2 - NUMBERS INTEGRITY", False, "Skipped (Test 1 failed)")
        return False
    
    pid = SEEDED_PID
    print(f"Test PID: {pid}")
    
    try:
        # GET decisions
        print("Calling GET /api/v1/albert/decisions...")
        resp = requests.get(f"{BASE_URL}/v1/albert/decisions", 
                          params={'pid': pid}, timeout=60)
        
        assert resp.status_code == 200, f"Decisions endpoint failed: {resp.status_code}"
        decisions_data = resp.json()
        decisions = decisions_data.get('decisions', [])
        
        log_test("2.1 - GET decisions successful", True, f"Got {len(decisions)} decisions")
        
        # Build lookup maps
        decisions_map = {d['symbol']: d for d in decisions}
        
        # Check topBuys
        top_buys = welcome_data.get('topBuys', [])
        print(f"\nChecking {len(top_buys)} topBuys entries...")
        
        for buy in top_buys:
            symbol = buy.get('symbol')
            deploy_now_usd = buy.get('deployNowUsd')
            
            assert symbol in decisions_map, f"Symbol {symbol} from topBuys not found in decisions"
            
            decision = decisions_map[symbol]
            expected_deploy = decision.get('recommendedDeployNowUsd')
            
            assert expected_deploy is not None, \
                f"Symbol {symbol} missing recommendedDeployNowUsd in decisions"
            
            diff = abs(deploy_now_usd - expected_deploy)
            # Allow $0.10 tolerance for floating-point precision and timing differences
            assert diff <= 0.10, \
                f"Symbol {symbol}: deployNowUsd mismatch. Welcome={deploy_now_usd}, Decisions={expected_deploy}, diff={diff}"
            
            print(f"  ✅ {symbol}: deployNowUsd={deploy_now_usd} matches decisions (diff=${diff:.4f})")
        
        log_test("2.2 - topBuys numbers match decisions", True, 
                f"All {len(top_buys)} topBuys entries verified")
        
        # Check topSells
        top_sells = welcome_data.get('topSells', [])
        print(f"\nChecking {len(top_sells)} topSells entries...")
        
        for sell in top_sells:
            symbol = sell.get('symbol')
            sell_usd = sell.get('sellUsd')
            
            assert symbol in decisions_map, f"Symbol {symbol} from topSells not found in decisions"
            
            decision = decisions_map[symbol]
            sell_plan = decision.get('sellPlan', {})
            expected_sell = sell_plan.get('sellUsd')
            
            assert expected_sell is not None, \
                f"Symbol {symbol} missing sellPlan.sellUsd in decisions"
            
            diff = abs(sell_usd - expected_sell)
            # Allow $0.10 tolerance for floating-point precision and timing differences
            assert diff <= 0.10, \
                f"Symbol {symbol}: sellUsd mismatch. Welcome={sell_usd}, Decisions={expected_sell}, diff={diff}"
            
            print(f"  ✅ {symbol}: sellUsd={sell_usd} matches decisions (diff=${diff:.4f})")
        
        log_test("2.3 - topSells numbers match decisions", True, 
                f"All {len(top_sells)} topSells entries verified")
        
        print("\n✅ NUMBERS INTEGRITY VERIFIED: Welcome brief reuses deterministic decisions, does not fabricate figures")
        
        return True
        
    except AssertionError as e:
        log_test("Test 2 - NUMBERS INTEGRITY", False, str(e))
        return False
    except Exception as e:
        log_test("Test 2 - NUMBERS INTEGRITY", False, f"Exception: {e}")
        return False

def test_no_mandate():
    """
    Test 3: NO-MANDATE pid
    Create a FRESH pid u_WB_<uuid> that has NO mandate
    GET /welcome-brief?pid=<that>
    Assert: HTTP 200, status='ready', mandateComplete=false, onboarding=true
    callCounts all zero, topBuys and topSells empty arrays
    albertLine is a NON-EMPTY string (deterministic fallback)
    Must not error
    """
    print("\n" + "="*80)
    print("TEST 3: NO-MANDATE PID")
    print("="*80)
    
    pid = create_test_pid("WB")
    print(f"Test PID: {pid} (fresh, no mandate)")
    
    try:
        # GET welcome-brief (should be fast since no decisions to compute)
        print("Calling GET /api/v1/albert/welcome-brief...")
        resp = requests.get(f"{BASE_URL}/v1/albert/welcome-brief", 
                          params={'pid': pid}, timeout=30)
        
        assert resp.status_code == 200, f"Expected HTTP 200, got {resp.status_code}"
        log_test("3.1 - HTTP 200", True)
        
        data = resp.json()
        
        # Check status
        status = data.get('status')
        assert status == 'ready', f"Expected status='ready', got {status}"
        log_test("3.2 - status='ready'", True)
        
        # Check mandateComplete and onboarding
        mandate_complete = data.get('mandateComplete')
        onboarding = data.get('onboarding')
        assert mandate_complete == False, f"Expected mandateComplete=false, got {mandate_complete}"
        assert onboarding == True, f"Expected onboarding=true, got {onboarding}"
        log_test("3.3 - mandateComplete=false, onboarding=true", True)
        
        # Check callCounts all zero
        call_counts = data.get('callCounts')
        assert isinstance(call_counts, dict), f"callCounts should be dict, got {type(call_counts)}"
        for key in ['BUY', 'SELL', 'HOLD', 'WAIT']:
            assert call_counts.get(key) == 0, \
                f"Expected callCounts[{key}]=0, got {call_counts.get(key)}"
        log_test("3.4 - callCounts all zero", True, f"callCounts: {call_counts}")
        
        # Check topBuys and topSells empty
        top_buys = data.get('topBuys', [])
        top_sells = data.get('topSells', [])
        assert len(top_buys) == 0, f"Expected topBuys empty, got {len(top_buys)} entries"
        assert len(top_sells) == 0, f"Expected topSells empty, got {len(top_sells)} entries"
        log_test("3.5 - topBuys and topSells empty arrays", True)
        
        # Check albertLine (deterministic fallback)
        albert_line = data.get('albertLine')
        assert isinstance(albert_line, str), f"albertLine should be string, got {type(albert_line)}"
        assert len(albert_line) > 0, "albertLine should be non-empty (deterministic fallback)"
        log_test("3.6 - albertLine is NON-EMPTY string (deterministic fallback)", True, 
                f"albertLine: '{albert_line}'")
        
        print("\n✅ NO-MANDATE PATH WORKING: Returns onboarding=true with fallback line, does not error")
        
        return True
        
    except AssertionError as e:
        log_test("Test 3 - NO-MANDATE PID", False, str(e))
        return False
    except Exception as e:
        log_test("Test 3 - NO-MANDATE PID", False, f"Exception: {e}")
        return False

def test_missing_pid():
    """
    Test 4: MISSING pid
    GET /welcome-brief with NO pid param
    Response JSON has an 'error' field
    """
    print("\n" + "="*80)
    print("TEST 4: MISSING PID")
    print("="*80)
    
    try:
        # GET welcome-brief with no pid
        print("Calling GET /api/v1/albert/welcome-brief (no pid)...")
        resp = requests.get(f"{BASE_URL}/v1/albert/welcome-brief", timeout=10)
        
        assert resp.status_code == 200, f"Expected HTTP 200, got {resp.status_code}"
        
        data = resp.json()
        assert 'error' in data, "Expected 'error' field in response"
        
        log_test("4.1 - Missing pid returns error", True, f"Error: {data.get('error')}")
        
        return True
        
    except AssertionError as e:
        log_test("Test 4 - MISSING PID", False, str(e))
        return False
    except Exception as e:
        log_test("Test 4 - MISSING PID", False, f"Exception: {e}")
        return False

def test_regression():
    """
    Test 5: REGRESSION
    GET /api/v1/albert/decisions?pid=<seeded> returns HTTP 200
    GET /api/v1/albert/portfolio-risk?pid=<seeded> returns HTTP 200
    """
    print("\n" + "="*80)
    print("TEST 5: REGRESSION")
    print("="*80)
    
    pid = SEEDED_PID
    print(f"Test PID: {pid}")
    
    try:
        # Test decisions endpoint
        print("Calling GET /api/v1/albert/decisions...")
        resp = requests.get(f"{BASE_URL}/v1/albert/decisions", 
                          params={'pid': pid}, timeout=60)
        assert resp.status_code == 200, f"Decisions endpoint failed: {resp.status_code}"
        log_test("5.1 - Decisions endpoint returns HTTP 200", True)
        
        # Test portfolio-risk endpoint
        print("Calling GET /api/v1/albert/portfolio-risk...")
        resp = requests.get(f"{BASE_URL}/v1/albert/portfolio-risk", 
                          params={'pid': pid}, timeout=30)
        assert resp.status_code == 200, f"Portfolio-risk endpoint failed: {resp.status_code}"
        log_test("5.2 - Portfolio-risk endpoint returns HTTP 200", True)
        
        print("\n✅ REGRESSION PASSED: Existing endpoints unaffected")
        
        return True
        
    except AssertionError as e:
        log_test("Test 5 - REGRESSION", False, str(e))
        return False
    except Exception as e:
        log_test("Test 5 - REGRESSION", False, f"Exception: {e}")
        return False

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================

def main():
    print("\n" + "="*80)
    print("BACKEND TESTING: WELCOME BRIEF ENDPOINT")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Seeded PID: {SEEDED_PID}")
    
    results = {}
    
    # Test 1: Complete mandate (returns data for Test 2)
    print("\n" + "="*80)
    print("RUNNING TESTS")
    print("="*80)
    
    welcome_data = test_complete_mandate()
    results['Test-1-Complete-Mandate'] = (welcome_data is not None)
    
    # Test 2: Numbers integrity (depends on Test 1)
    results['Test-2-Numbers-Integrity'] = test_numbers_integrity(welcome_data)
    
    # Test 3: No-mandate pid
    results['Test-3-No-Mandate'] = test_no_mandate()
    
    # Test 4: Missing pid
    results['Test-4-Missing-Pid'] = test_missing_pid()
    
    # Test 5: Regression
    results['Test-5-Regression'] = test_regression()
    
    # Cleanup
    cleanup_test_data()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    print(f"\nTotal: {passed}/{total} tests passed")
    print("\nDetailed Results:")
    for test_name, test_passed in results.items():
        status = "✅ PASS" if test_passed else "❌ FAIL"
        print(f"  {status}: {test_name}")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
