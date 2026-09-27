#!/usr/bin/env python3
"""
Backend Test Suite for Pillar 2 — Feature-Drift Circuit Breaker
Tests the new drift monitoring endpoints via external URL.
"""
import requests
import sys
import json

# Base URL from .env
BASE_URL = "https://what-if-sandbox.preview.emergentagent.com/api"

def test_drift_endpoint():
    """Test GET /api/v1/drift endpoint"""
    print("\n" + "="*80)
    print("TEST 1: GET /api/v1/drift - Feature Drift Circuit Breaker")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/v1/drift"
        print(f"Requesting: {url}")
        
        response = requests.get(url, timeout=30)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {response.status_code}")
            print(f"Response: {response.text[:500]}")
            return False
        
        data = response.json()
        print(f"Response keys: {list(data.keys())}")
        
        # Note: The 'status' field in /api/v1/drift is the drift status (stable/watch/breaker),
        # not the API status. The endpoint returns HTTP 200 to indicate success.
        
        # Validate required keys (note: 'status' here is the drift status, not API status)
        required_keys = [
            'circuit_breaker', 'status', 'confidence_level', 'max_psi',
            'per_feature', 'ood', 'data_completeness_pct', 'completeness_min',
            'model_mode', 'ml_signal', 'effective_signal', 'fallback_signal', 'reasons'
        ]
        
        missing_keys = [k for k in required_keys if k not in data]
        if missing_keys:
            print(f"❌ FAILED: Missing required keys: {missing_keys}")
            return False
        print(f"✅ All required keys present: {required_keys}")
        
        # Validate circuit_breaker (boolean)
        cb = data.get('circuit_breaker')
        if not isinstance(cb, bool):
            print(f"❌ FAILED: circuit_breaker should be boolean, got {type(cb)}")
            return False
        print(f"✅ circuit_breaker={cb} (boolean)")
        
        # Validate status (string, one of stable/watch/breaker)
        status_val = data.get('status')
        if status_val not in ['stable', 'watch', 'breaker']:
            print(f"❌ FAILED: status should be in [stable,watch,breaker], got '{status_val}'")
            return False
        print(f"✅ status='{status_val}' (valid enum)")
        
        # Validate confidence_level (string, one of Normal/Guarded/Low)
        conf_level = data.get('confidence_level')
        if conf_level not in ['Normal', 'Guarded', 'Low']:
            print(f"❌ FAILED: confidence_level should be in [Normal,Guarded,Low], got '{conf_level}'")
            return False
        print(f"✅ confidence_level='{conf_level}' (valid enum)")
        
        # Validate max_psi (number)
        max_psi = data.get('max_psi')
        if not isinstance(max_psi, (int, float)):
            print(f"❌ FAILED: max_psi should be number, got {type(max_psi)}")
            return False
        print(f"✅ max_psi={max_psi} (number)")
        
        # Validate per_feature (list of 8 items)
        per_feature = data.get('per_feature')
        if not isinstance(per_feature, list):
            print(f"❌ FAILED: per_feature should be list, got {type(per_feature)}")
            return False
        if len(per_feature) != 8:
            print(f"❌ FAILED: per_feature should have 8 items, got {len(per_feature)}")
            return False
        print(f"✅ per_feature: list with {len(per_feature)} items")
        
        # Validate first per_feature item structure
        pf0 = per_feature[0]
        required_pf_keys = ['feature', 'label', 'psi', 'ks_stat', 'ks_significant', 'status']
        missing_pf_keys = [k for k in required_pf_keys if k not in pf0]
        if missing_pf_keys:
            print(f"❌ FAILED: per_feature[0] missing keys: {missing_pf_keys}")
            return False
        
        # Validate types in per_feature[0]
        if not isinstance(pf0['psi'], (int, float)):
            print(f"❌ FAILED: per_feature[0].psi should be number, got {type(pf0['psi'])}")
            return False
        if not isinstance(pf0['ks_stat'], (int, float)):
            print(f"❌ FAILED: per_feature[0].ks_stat should be number, got {type(pf0['ks_stat'])}")
            return False
        if not isinstance(pf0['ks_significant'], bool):
            print(f"❌ FAILED: per_feature[0].ks_significant should be bool, got {type(pf0['ks_significant'])}")
            return False
        if not isinstance(pf0['status'], str):
            print(f"❌ FAILED: per_feature[0].status should be string, got {type(pf0['status'])}")
            return False
        print(f"✅ per_feature[0] structure valid: feature='{pf0['feature']}', label='{pf0['label']}', psi={pf0['psi']}, ks_stat={pf0['ks_stat']}, ks_significant={pf0['ks_significant']}, status='{pf0['status']}'")
        
        # Validate ood (object)
        ood = data.get('ood')
        if not isinstance(ood, dict):
            print(f"❌ FAILED: ood should be object, got {type(ood)}")
            return False
        
        required_ood_keys = ['robust_z', 'mahalanobis', 'maha_threshold', 'extreme_features']
        missing_ood_keys = [k for k in required_ood_keys if k not in ood]
        if missing_ood_keys:
            print(f"❌ FAILED: ood missing keys: {missing_ood_keys}")
            return False
        
        # Validate ood.robust_z (map of feature->number)
        robust_z = ood.get('robust_z')
        if not isinstance(robust_z, dict):
            print(f"❌ FAILED: ood.robust_z should be dict, got {type(robust_z)}")
            return False
        if len(robust_z) == 0:
            print(f"❌ FAILED: ood.robust_z should not be empty")
            return False
        # Check first entry is feature->number
        first_key = list(robust_z.keys())[0]
        first_val = robust_z[first_key]
        if not isinstance(first_val, (int, float)):
            print(f"❌ FAILED: ood.robust_z values should be numbers, got {type(first_val)}")
            return False
        print(f"✅ ood.robust_z: dict with {len(robust_z)} features (e.g., '{first_key}': {first_val})")
        
        # Validate ood.mahalanobis (number)
        maha = ood.get('mahalanobis')
        if not isinstance(maha, (int, float)):
            print(f"❌ FAILED: ood.mahalanobis should be number, got {type(maha)}")
            return False
        print(f"✅ ood.mahalanobis={maha} (number)")
        
        # Validate ood.maha_threshold (number)
        maha_thr = ood.get('maha_threshold')
        if not isinstance(maha_thr, (int, float)):
            print(f"❌ FAILED: ood.maha_threshold should be number, got {type(maha_thr)}")
            return False
        print(f"✅ ood.maha_threshold={maha_thr} (number)")
        
        # Validate ood.extreme_features (list)
        extreme_feats = ood.get('extreme_features')
        if not isinstance(extreme_feats, list):
            print(f"❌ FAILED: ood.extreme_features should be list, got {type(extreme_feats)}")
            return False
        print(f"✅ ood.extreme_features: list with {len(extreme_feats)} items")
        
        # Validate data_completeness_pct (number)
        completeness = data.get('data_completeness_pct')
        if not isinstance(completeness, (int, float)):
            print(f"❌ FAILED: data_completeness_pct should be number, got {type(completeness)}")
            return False
        print(f"✅ data_completeness_pct={completeness} (number)")
        
        # Validate completeness_min (should be 95)
        completeness_min = data.get('completeness_min')
        if completeness_min != 95:
            print(f"❌ FAILED: completeness_min should be 95, got {completeness_min}")
            return False
        print(f"✅ completeness_min={completeness_min}")
        
        # Validate model_mode (string, one of ml/rule_based)
        model_mode = data.get('model_mode')
        if model_mode not in ['ml', 'rule_based']:
            print(f"❌ FAILED: model_mode should be in [ml,rule_based], got '{model_mode}'")
            return False
        print(f"✅ model_mode='{model_mode}' (valid enum)")
        
        # Validate ml_signal (string)
        ml_signal = data.get('ml_signal')
        if not isinstance(ml_signal, str):
            print(f"❌ FAILED: ml_signal should be string, got {type(ml_signal)}")
            return False
        print(f"✅ ml_signal='{ml_signal}' (string)")
        
        # Validate effective_signal (string)
        effective_signal = data.get('effective_signal')
        if not isinstance(effective_signal, str):
            print(f"❌ FAILED: effective_signal should be string, got {type(effective_signal)}")
            return False
        print(f"✅ effective_signal='{effective_signal}' (string)")
        
        # Validate fallback_signal (object with signal, confidence, basis)
        fallback = data.get('fallback_signal')
        if not isinstance(fallback, dict):
            print(f"❌ FAILED: fallback_signal should be object, got {type(fallback)}")
            return False
        required_fallback_keys = ['signal', 'confidence', 'basis']
        missing_fallback_keys = [k for k in required_fallback_keys if k not in fallback]
        if missing_fallback_keys:
            print(f"❌ FAILED: fallback_signal missing keys: {missing_fallback_keys}")
            return False
        print(f"✅ fallback_signal: {{signal='{fallback['signal']}', confidence={fallback['confidence']}, basis='{fallback['basis'][:50]}...'}}")
        
        # Validate reasons (list)
        reasons = data.get('reasons')
        if not isinstance(reasons, list):
            print(f"❌ FAILED: reasons should be list, got {type(reasons)}")
            return False
        print(f"✅ reasons: list with {len(reasons)} items")
        
        # Report key metrics
        print("\n" + "-"*80)
        print("KEY METRICS:")
        print(f"  circuit_breaker: {cb}")
        print(f"  status: {status_val}")
        print(f"  confidence_level: {conf_level}")
        print(f"  mahalanobis: {maha} vs threshold: {maha_thr} (OOD if maha > threshold)")
        print(f"  data_completeness: {completeness}% (min required: {completeness_min}%)")
        print(f"  model_mode: {model_mode}")
        print(f"  ml_signal: {ml_signal}")
        print(f"  effective_signal: {effective_signal}")
        
        # Under normal conditions, expect circuit_breaker=false and effective_signal==ml_signal
        if not cb:
            print(f"  ✅ Circuit breaker is OFF (normal market conditions)")
        else:
            print(f"  ⚠️  Circuit breaker is ON (market anomaly detected)")
        
        if effective_signal == ml_signal:
            print(f"  ✅ ML model is in control (effective_signal == ml_signal)")
        else:
            print(f"  ⚠️  Fallback to rule-based model (effective_signal != ml_signal)")
        
        if maha < maha_thr:
            print(f"  ✅ Live inputs are in-distribution (Mahalanobis < threshold)")
        else:
            print(f"  ⚠️  Live inputs are out-of-distribution (Mahalanobis >= threshold)")
        
        print("-"*80)
        print("✅ TEST 1 PASSED: GET /api/v1/drift")
        return True
        
    except Exception as e:
        print(f"❌ TEST 1 FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_dashboard_drift():
    """Test GET /api/v1/dashboard - confirm decision has confidence_level and circuit_breaker, and drift block present"""
    print("\n" + "="*80)
    print("TEST 2: GET /api/v1/dashboard - Decision confidence_level + circuit_breaker + drift block")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/v1/dashboard"
        print(f"Requesting: {url}")
        
        response = requests.get(url, timeout=30)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        # Validate status
        if data.get('status') != 'ready':
            print(f"❌ FAILED: Expected status='ready', got '{data.get('status')}'")
            return False
        print("✅ status='ready'")
        
        # Validate decision object exists
        decision = data.get('decision')
        if not isinstance(decision, dict):
            print(f"❌ FAILED: decision should be object, got {type(decision)}")
            return False
        print("✅ decision object present")
        
        # Validate decision.confidence_level
        conf_level = decision.get('confidence_level')
        if conf_level not in ['Normal', 'Guarded', 'Low']:
            print(f"❌ FAILED: decision.confidence_level should be in [Normal,Guarded,Low], got '{conf_level}'")
            return False
        print(f"✅ decision.confidence_level='{conf_level}' (valid enum)")
        
        # Validate decision.circuit_breaker object
        cb_obj = decision.get('circuit_breaker')
        if not isinstance(cb_obj, dict):
            print(f"❌ FAILED: decision.circuit_breaker should be object, got {type(cb_obj)}")
            return False
        
        # Validate circuit_breaker.active (boolean)
        cb_active = cb_obj.get('active')
        if not isinstance(cb_active, bool):
            print(f"❌ FAILED: decision.circuit_breaker.active should be boolean, got {type(cb_active)}")
            return False
        print(f"✅ decision.circuit_breaker.active={cb_active} (boolean)")
        
        # Validate circuit_breaker.model_mode
        cb_mode = cb_obj.get('model_mode')
        if cb_mode not in ['ml', 'rule_based']:
            print(f"❌ FAILED: decision.circuit_breaker.model_mode should be in [ml,rule_based], got '{cb_mode}'")
            return False
        print(f"✅ decision.circuit_breaker.model_mode='{cb_mode}' (valid enum)")
        
        # Validate top-level drift block
        drift = data.get('drift')
        if not isinstance(drift, dict):
            print(f"❌ FAILED: top-level drift should be object, got {type(drift)}")
            return False
        print("✅ top-level drift block present")
        
        # Validate drift.circuit_breaker matches decision.circuit_breaker.active
        drift_cb = drift.get('circuit_breaker')
        if not isinstance(drift_cb, bool):
            print(f"❌ FAILED: drift.circuit_breaker should be boolean, got {type(drift_cb)}")
            return False
        if drift_cb != cb_active:
            print(f"❌ FAILED: drift.circuit_breaker ({drift_cb}) should match decision.circuit_breaker.active ({cb_active})")
            return False
        print(f"✅ drift.circuit_breaker={drift_cb} matches decision.circuit_breaker.active")
        
        # Validate drift.status matches decision confidence_level mapping
        drift_status = drift.get('status')
        if drift_status not in ['stable', 'watch', 'breaker']:
            print(f"❌ FAILED: drift.status should be in [stable,watch,breaker], got '{drift_status}'")
            return False
        print(f"✅ drift.status='{drift_status}' (valid enum)")
        
        # Validate drift.confidence_level matches decision.confidence_level
        drift_conf = drift.get('confidence_level')
        if drift_conf != conf_level:
            print(f"❌ FAILED: drift.confidence_level ({drift_conf}) should match decision.confidence_level ({conf_level})")
            return False
        print(f"✅ drift.confidence_level='{drift_conf}' matches decision.confidence_level")
        
        print("\n" + "-"*80)
        print("KEY VALIDATIONS:")
        print(f"  decision.confidence_level: {conf_level}")
        print(f"  decision.circuit_breaker.active: {cb_active}")
        print(f"  decision.circuit_breaker.model_mode: {cb_mode}")
        print(f"  drift.circuit_breaker: {drift_cb}")
        print(f"  drift.status: {drift_status}")
        print(f"  drift.confidence_level: {drift_conf}")
        print("-"*80)
        print("✅ TEST 2 PASSED: GET /api/v1/dashboard")
        return True
        
    except Exception as e:
        print(f"❌ TEST 2 FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_regression_endpoints():
    """Test regression endpoints: /api/v1/validation, /api/v1/scorecard, /api/v1/health"""
    print("\n" + "="*80)
    print("TEST 3: REGRESSION - /api/v1/validation, /api/v1/scorecard, /api/v1/health")
    print("="*80)
    
    all_passed = True
    
    # Test /api/v1/validation
    try:
        url = f"{BASE_URL}/v1/validation"
        print(f"\nRequesting: {url}")
        response = requests.get(url, timeout=30)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: /api/v1/validation - Expected HTTP 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            if data.get('status') != 'ready':
                print(f"❌ FAILED: /api/v1/validation - Expected status='ready', got '{data.get('status')}'")
                all_passed = False
            else:
                print(f"✅ /api/v1/validation: HTTP 200, status='ready'")
    except Exception as e:
        print(f"❌ FAILED: /api/v1/validation - Exception: {e}")
        all_passed = False
    
    # Test /api/v1/scorecard
    try:
        url = f"{BASE_URL}/v1/scorecard"
        print(f"\nRequesting: {url}")
        response = requests.get(url, timeout=30)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: /api/v1/scorecard - Expected HTTP 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            if data.get('status') != 'ready':
                print(f"❌ FAILED: /api/v1/scorecard - Expected status='ready', got '{data.get('status')}'")
                all_passed = False
            else:
                print(f"✅ /api/v1/scorecard: HTTP 200, status='ready'")
    except Exception as e:
        print(f"❌ FAILED: /api/v1/scorecard - Exception: {e}")
        all_passed = False
    
    # Test /api/v1/health
    try:
        url = f"{BASE_URL}/v1/health"
        print(f"\nRequesting: {url}")
        response = requests.get(url, timeout=30)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: /api/v1/health - Expected HTTP 200, got {response.status_code}")
            all_passed = False
        else:
            print(f"✅ /api/v1/health: HTTP 200")
    except Exception as e:
        print(f"❌ FAILED: /api/v1/health - Exception: {e}")
        all_passed = False
    
    if all_passed:
        print("\n✅ TEST 3 PASSED: All regression endpoints working")
    else:
        print("\n❌ TEST 3 FAILED: Some regression endpoints failed")
    
    return all_passed


def main():
    print("\n" + "="*80)
    print("PILLAR 2 — FEATURE-DRIFT CIRCUIT BREAKER BACKEND TEST SUITE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print("="*80)
    
    results = []
    
    # Test 1: GET /api/v1/drift
    results.append(("GET /api/v1/drift", test_drift_endpoint()))
    
    # Test 2: GET /api/v1/dashboard (decision + drift)
    results.append(("GET /api/v1/dashboard", test_dashboard_drift()))
    
    # Test 3: Regression endpoints
    results.append(("Regression endpoints", test_regression_endpoints()))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {test_name}")
    
    print("="*80)
    print(f"TOTAL: {passed}/{total} tests passed")
    print("="*80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED - Pillar 2 Feature-Drift Circuit Breaker is working correctly!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} TEST(S) FAILED - Please review the failures above")
        return 1


if __name__ == "__main__":
    sys.exit(main())
