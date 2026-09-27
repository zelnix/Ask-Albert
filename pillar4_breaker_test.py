#!/usr/bin/env python3
"""
Pillar 4 (Proactive Alerts Data) + Breaker Demo Toggle Test Suite
Tests cost_basis, leverage_snapshot in dashboard and the simulate-shock admin toggle.
"""

import requests
import sys
import time
from typing import Dict, Any

# Base URL from .env
BASE_URL = "https://what-if-sandbox.preview.emergentagent.com/api"

def test_dashboard_pillar4_data():
    """
    TEST 1: GET /api/v1/dashboard
    Verify cost_basis and leverage_snapshot blocks exist with correct structure.
    
    Expected cost_basis structure:
    - sth (number)
    - lth (number)
    - sth_window (=155)
    - lth_window (=365)
    - price (number)
    - sth_reclaimed (boolean)
    - lth_reclaimed (boolean)
    - method (string)
    
    Expected leverage_snapshot structure:
    - funding_rate (number)
    - oi_change_tf_pct (number)
    - oi_state (string)
    - squeeze (object with long_risk, short_risk)
    """
    print("\n" + "="*80)
    print("TEST 1: GET /api/v1/dashboard (Pillar 4 - cost_basis + leverage_snapshot)")
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
        
        # Check status
        if data.get('status') != 'ready':
            print(f"❌ FAILED: Expected status='ready', got '{data.get('status')}'")
            return False
        print(f"✓ status = 'ready'")
        
        # ===== TEST cost_basis block =====
        print("\n📊 VALIDATING cost_basis BLOCK:")
        cost_basis = data.get('cost_basis')
        if not cost_basis:
            print(f"❌ FAILED: cost_basis block not present in dashboard")
            return False
        print(f"✓ cost_basis block present")
        
        # Check required fields
        required_cb_fields = {
            'sth': (int, float),
            'lth': (int, float),
            'sth_window': int,
            'lth_window': int,
            'price': (int, float),
            'sth_reclaimed': bool,
            'lth_reclaimed': bool,
            'method': str
        }
        
        for field, expected_type in required_cb_fields.items():
            if field not in cost_basis:
                print(f"❌ FAILED: cost_basis missing field '{field}'")
                return False
            
            value = cost_basis[field]
            if isinstance(expected_type, tuple):
                if not isinstance(value, expected_type):
                    print(f"❌ FAILED: cost_basis.{field} should be {expected_type}, got {type(value)}")
                    return False
            else:
                if not isinstance(value, expected_type):
                    print(f"❌ FAILED: cost_basis.{field} should be {expected_type.__name__}, got {type(value).__name__}")
                    return False
        
        print(f"✓ All cost_basis fields present with correct types")
        
        # Validate specific values
        if cost_basis['sth_window'] != 155:
            print(f"❌ FAILED: cost_basis.sth_window should be 155, got {cost_basis['sth_window']}")
            return False
        print(f"✓ cost_basis.sth_window = 155")
        
        if cost_basis['lth_window'] != 365:
            print(f"❌ FAILED: cost_basis.lth_window should be 365, got {cost_basis['lth_window']}")
            return False
        print(f"✓ cost_basis.lth_window = 365")
        
        # Report values
        print(f"\n📈 COST BASIS VALUES:")
        print(f"  STH (155-day): ${cost_basis['sth']:,.2f}")
        print(f"  LTH (365-day): ${cost_basis['lth']:,.2f}")
        print(f"  Current Price: ${cost_basis['price']:,.2f}")
        print(f"  STH Reclaimed: {cost_basis['sth_reclaimed']}")
        print(f"  LTH Reclaimed: {cost_basis['lth_reclaimed']}")
        print(f"  Method: {cost_basis['method']}")
        
        # ===== TEST leverage_snapshot block =====
        print("\n📊 VALIDATING leverage_snapshot BLOCK:")
        leverage_snapshot = data.get('leverage_snapshot')
        if not leverage_snapshot:
            print(f"❌ FAILED: leverage_snapshot block not present in dashboard")
            return False
        print(f"✓ leverage_snapshot block present")
        
        # Check required fields
        required_ls_fields = ['funding_rate', 'oi_change_tf_pct', 'oi_state', 'squeeze']
        for field in required_ls_fields:
            if field not in leverage_snapshot:
                print(f"❌ FAILED: leverage_snapshot missing field '{field}'")
                return False
        print(f"✓ All leverage_snapshot required fields present")
        
        # Validate types
        if not isinstance(leverage_snapshot['funding_rate'], (int, float)):
            print(f"❌ FAILED: leverage_snapshot.funding_rate should be number, got {type(leverage_snapshot['funding_rate'])}")
            return False
        print(f"✓ leverage_snapshot.funding_rate is number")
        
        if not isinstance(leverage_snapshot['oi_change_tf_pct'], (int, float)):
            print(f"❌ FAILED: leverage_snapshot.oi_change_tf_pct should be number, got {type(leverage_snapshot['oi_change_tf_pct'])}")
            return False
        print(f"✓ leverage_snapshot.oi_change_tf_pct is number")
        
        if not isinstance(leverage_snapshot['oi_state'], str):
            print(f"❌ FAILED: leverage_snapshot.oi_state should be string, got {type(leverage_snapshot['oi_state'])}")
            return False
        print(f"✓ leverage_snapshot.oi_state is string")
        
        # Validate squeeze object
        squeeze = leverage_snapshot.get('squeeze')
        if not squeeze or not isinstance(squeeze, dict):
            print(f"❌ FAILED: leverage_snapshot.squeeze should be object, got {type(squeeze)}")
            return False
        print(f"✓ leverage_snapshot.squeeze is object")
        
        if 'long_risk' not in squeeze or not isinstance(squeeze['long_risk'], (int, float)):
            print(f"❌ FAILED: leverage_snapshot.squeeze.long_risk should be number")
            return False
        print(f"✓ leverage_snapshot.squeeze.long_risk is number")
        
        if 'short_risk' not in squeeze or not isinstance(squeeze['short_risk'], (int, float)):
            print(f"❌ FAILED: leverage_snapshot.squeeze.short_risk should be number")
            return False
        print(f"✓ leverage_snapshot.squeeze.short_risk is number")
        
        # Report values
        print(f"\n📈 LEVERAGE SNAPSHOT VALUES:")
        print(f"  Funding Rate: {leverage_snapshot['funding_rate']:.6f}%")
        print(f"  OI Change (timeframe %): {leverage_snapshot['oi_change_tf_pct']:.2f}%")
        print(f"  OI State: {leverage_snapshot['oi_state']}")
        print(f"  Squeeze Long Risk: {squeeze['long_risk']}")
        print(f"  Squeeze Short Risk: {squeeze['short_risk']}")
        
        print("\n✅ TEST 1 PASSED: Dashboard Pillar 4 data validated")
        return True
        
    except Exception as e:
        print(f"❌ TEST 1 FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_breaker_toggle_roundtrip():
    """
    TEST 2: Breaker Demo Toggle Round-Trip
    
    a) POST /api/v1/admin/simulate-shock with {"passcode":"000000","on":true} → expect {status:'ok', active:true}
    b) GET /api/v1/drift → expect circuit_breaker=true, status='breaker', simulated=true, confidence_level='Low'
    c) GET /api/v1/dashboard → expect decision.circuit_breaker.active=true and decision.confidence_level='Low'
    d) POST /api/v1/admin/simulate-shock {"passcode":"000000","on":false} → expect {active:false}
    e) GET /api/v1/drift → expect circuit_breaker=false again (restored)
    f) POST /api/v1/admin/simulate-shock {"passcode":"wrong","on":true} → expect HTTP 401
    
    IMPORTANT: Ensure toggle ends in OFF state
    """
    print("\n" + "="*80)
    print("TEST 2: Breaker Demo Toggle Round-Trip")
    print("="*80)
    
    try:
        # ===== Step a) Turn ON the breaker simulation =====
        print("\n→ Step a) POST /api/v1/admin/simulate-shock (ON)")
        url = f"{BASE_URL}/v1/admin/simulate-shock"
        payload = {"passcode": "000000", "on": True}
        
        response = requests.post(url, json=payload, timeout=30)
        print(f"  HTTP Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {response.status_code}")
            return False
        
        data = response.json()
        print(f"  Response: {data}")
        
        if data.get('status') != 'ok':
            print(f"❌ FAILED: Expected status='ok', got '{data.get('status')}'")
            return False
        
        if data.get('active') != True:
            print(f"❌ FAILED: Expected active=true, got {data.get('active')}")
            return False
        
        print(f"✓ Breaker simulation turned ON (status='ok', active=true)")
        
        # Small delay to ensure state propagates
        time.sleep(1)
        
        # ===== Step b) GET /api/v1/drift - verify breaker is active =====
        print("\n→ Step b) GET /api/v1/drift (verify breaker active)")
        url = f"{BASE_URL}/v1/drift"
        
        response = requests.get(url, timeout=30)
        print(f"  HTTP Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        if data.get('circuit_breaker') != True:
            print(f"❌ FAILED: Expected circuit_breaker=true, got {data.get('circuit_breaker')}")
            return False
        print(f"✓ drift.circuit_breaker = true")
        
        if data.get('status') != 'breaker':
            print(f"❌ FAILED: Expected status='breaker', got '{data.get('status')}'")
            return False
        print(f"✓ drift.status = 'breaker'")
        
        if data.get('simulated') != True:
            print(f"❌ FAILED: Expected simulated=true, got {data.get('simulated')}")
            return False
        print(f"✓ drift.simulated = true")
        
        if data.get('confidence_level') != 'Low':
            print(f"❌ FAILED: Expected confidence_level='Low', got '{data.get('confidence_level')}'")
            return False
        print(f"✓ drift.confidence_level = 'Low'")
        
        # ===== Step c) GET /api/v1/dashboard - verify decision reflects breaker =====
        print("\n→ Step c) GET /api/v1/dashboard (verify decision reflects breaker)")
        url = f"{BASE_URL}/v1/dashboard"
        
        response = requests.get(url, timeout=30)
        print(f"  HTTP Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {response.status_code}")
            return False
        
        data = response.json()
        decision = data.get('decision')
        
        if not decision:
            print(f"❌ FAILED: decision object not present")
            return False
        
        if decision.get('confidence_level') != 'Low':
            print(f"❌ FAILED: Expected decision.confidence_level='Low', got '{decision.get('confidence_level')}'")
            return False
        print(f"✓ decision.confidence_level = 'Low'")
        
        circuit_breaker = decision.get('circuit_breaker')
        if not circuit_breaker or not isinstance(circuit_breaker, dict):
            print(f"❌ FAILED: decision.circuit_breaker should be object")
            return False
        
        if circuit_breaker.get('active') != True:
            print(f"❌ FAILED: Expected decision.circuit_breaker.active=true, got {circuit_breaker.get('active')}")
            return False
        print(f"✓ decision.circuit_breaker.active = true")
        
        # ===== Step d) Turn OFF the breaker simulation =====
        print("\n→ Step d) POST /api/v1/admin/simulate-shock (OFF)")
        url = f"{BASE_URL}/v1/admin/simulate-shock"
        payload = {"passcode": "000000", "on": False}
        
        response = requests.post(url, json=payload, timeout=30)
        print(f"  HTTP Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {response.status_code}")
            return False
        
        data = response.json()
        print(f"  Response: {data}")
        
        if data.get('active') != False:
            print(f"❌ FAILED: Expected active=false, got {data.get('active')}")
            return False
        
        print(f"✓ Breaker simulation turned OFF (active=false)")
        
        # Small delay to ensure state propagates
        time.sleep(1)
        
        # ===== Step e) GET /api/v1/drift - verify breaker is restored (OFF) =====
        print("\n→ Step e) GET /api/v1/drift (verify breaker restored)")
        url = f"{BASE_URL}/v1/drift"
        
        response = requests.get(url, timeout=30)
        print(f"  HTTP Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        if data.get('circuit_breaker') != False:
            print(f"❌ FAILED: Expected circuit_breaker=false (restored), got {data.get('circuit_breaker')}")
            return False
        print(f"✓ drift.circuit_breaker = false (restored)")
        
        # ===== Step f) Test wrong passcode - expect HTTP 401 =====
        print("\n→ Step f) POST /api/v1/admin/simulate-shock (wrong passcode)")
        url = f"{BASE_URL}/v1/admin/simulate-shock"
        payload = {"passcode": "wrong", "on": True}
        
        response = requests.post(url, json=payload, timeout=30)
        print(f"  HTTP Status: {response.status_code}")
        
        if response.status_code != 401:
            print(f"❌ FAILED: Expected HTTP 401 for wrong passcode, got {response.status_code}")
            return False
        
        print(f"✓ Wrong passcode correctly rejected with HTTP 401")
        
        # ===== FINAL VERIFICATION: Ensure toggle is OFF =====
        print("\n→ FINAL VERIFICATION: Ensure toggle is OFF")
        url = f"{BASE_URL}/v1/drift"
        
        response = requests.get(url, timeout=30)
        data = response.json()
        
        if data.get('circuit_breaker') != False:
            print(f"⚠️  WARNING: Final state check - circuit_breaker should be false, got {data.get('circuit_breaker')}")
            print(f"  Attempting to turn OFF again...")
            
            # Try to turn off again
            url = f"{BASE_URL}/v1/admin/simulate-shock"
            payload = {"passcode": "000000", "on": False}
            response = requests.post(url, json=payload, timeout=30)
            
            if response.status_code == 200:
                print(f"✓ Successfully turned OFF breaker simulation")
            else:
                print(f"❌ FAILED to turn OFF breaker simulation")
                return False
        else:
            print(f"✓ Final state verified: circuit_breaker = false (OFF)")
        
        print("\n✅ TEST 2 PASSED: Breaker Demo Toggle round-trip validated")
        return True
        
    except Exception as e:
        print(f"❌ TEST 2 FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        
        # Emergency cleanup: try to turn off breaker
        print("\n⚠️  Attempting emergency cleanup: turning OFF breaker...")
        try:
            url = f"{BASE_URL}/v1/admin/simulate-shock"
            payload = {"passcode": "000000", "on": False}
            response = requests.post(url, json=payload, timeout=30)
            if response.status_code == 200:
                print(f"✓ Emergency cleanup successful")
            else:
                print(f"❌ Emergency cleanup failed")
        except Exception:
            print(f"❌ Emergency cleanup failed with exception")
        
        return False


def test_regression_endpoints():
    """
    TEST 3: Regression Tests
    - GET /api/v1/health → HTTP 200
    - GET /api/v1/alerts?symbol=BTC → HTTP 200 with alerts array
    """
    print("\n" + "="*80)
    print("TEST 3: Regression Tests")
    print("="*80)
    
    all_passed = True
    
    # Test 3.1: GET /api/v1/health
    print("\n→ TEST 3.1: GET /api/v1/health")
    try:
        url = f"{BASE_URL}/v1/health"
        response = requests.get(url, timeout=30)
        print(f"  HTTP Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"  ❌ FAILED: Expected HTTP 200, got {response.status_code}")
            all_passed = False
        else:
            print(f"  ✅ PASSED: /api/v1/health")
    
    except Exception as e:
        print(f"  ❌ FAILED with exception: {e}")
        all_passed = False
    
    # Test 3.2: GET /api/v1/alerts?symbol=BTC
    print("\n→ TEST 3.2: GET /api/v1/alerts?symbol=BTC")
    try:
        url = f"{BASE_URL}/v1/alerts?symbol=BTC"
        response = requests.get(url, timeout=30)
        print(f"  HTTP Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"  ❌ FAILED: Expected HTTP 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            
            # Check for alerts array
            if 'alerts' not in data:
                print(f"  ❌ FAILED: Response should contain 'alerts' array")
                all_passed = False
            elif not isinstance(data['alerts'], list):
                print(f"  ❌ FAILED: 'alerts' should be a list, got {type(data['alerts'])}")
                all_passed = False
            else:
                print(f"  ✓ Response contains 'alerts' array with {len(data['alerts'])} items")
                print(f"  ✅ PASSED: /api/v1/alerts?symbol=BTC")
    
    except Exception as e:
        print(f"  ❌ FAILED with exception: {e}")
        all_passed = False
    
    if all_passed:
        print("\n✅ TEST 3 PASSED: All regression tests")
    else:
        print("\n❌ TEST 3 FAILED: Some regression tests failed")
    
    return all_passed


def main():
    """Run all tests"""
    print("="*80)
    print("Pillar 4 (Proactive Alerts Data) + Breaker Demo Toggle Test Suite")
    print("Base URL:", BASE_URL)
    print("="*80)
    print("\nIMPORTANT NOTES:")
    print("- Do NOT POST /api/v1/refresh (expensive)")
    print("- Do NOT hit /email endpoints")
    print("- Breaker toggle will be left in OFF state at the end")
    print("="*80)
    
    results = {
        'test_1_dashboard_pillar4': False,
        'test_2_breaker_toggle': False,
        'test_3_regression': False
    }
    
    # Run tests
    results['test_1_dashboard_pillar4'] = test_dashboard_pillar4_data()
    results['test_2_breaker_toggle'] = test_breaker_toggle_roundtrip()
    results['test_3_regression'] = test_regression_endpoints()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{test_name}: {status}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED - Pillar 4 + Breaker Toggle are production-ready")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
