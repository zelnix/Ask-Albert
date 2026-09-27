#!/usr/bin/env python3
"""
BitMarkAI Coverage Alerts + Self-Healing Corridor Widen + Model-Health Badge Test
Tests the latest additions to the BitMarkAI validation system.
Base URL: https://what-if-sandbox.preview.emergentagent.com/api
IMPORTANT: Do NOT POST to any /api/v1/email/* endpoints. GET only.
"""

import requests
import sys

BASE_URL = "https://what-if-sandbox.preview.emergentagent.com/api"

def test_validation_endpoint():
    """
    Test 1: GET /api/v1/validation
    - 200, status "ready"
    - recent_coverage present: dict with 24H/7D/30D numeric values (0-100)
    - coverage_alerts present: a list (may be empty); if non-empty each item has horizon, coverage, threshold(==80)
    - coverage_history_by_horizon still present
    """
    print("\n" + "="*80)
    print("TEST 1: GET /api/v1/validation — Coverage Alerts + Recent Coverage")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/v1/validation"
        print(f"Requesting: {url}")
        response = requests.get(url, timeout=30)
        
        print(f"✅ HTTP Status: {response.status_code}")
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        # Check status
        if data.get('status') != 'ready':
            print(f"❌ FAILED: Expected status='ready', got '{data.get('status')}'")
            return False
        print(f"✅ status='ready'")
        
        # Check recent_coverage
        if 'recent_coverage' not in data:
            print(f"❌ FAILED: recent_coverage field missing")
            return False
        
        recent_coverage = data['recent_coverage']
        if not isinstance(recent_coverage, dict):
            print(f"❌ FAILED: recent_coverage is not a dict, got {type(recent_coverage)}")
            return False
        print(f"✅ recent_coverage present (dict)")
        
        # Check required horizons in recent_coverage
        required_horizons = ['24H', '7D', '30D']
        for horizon in required_horizons:
            if horizon not in recent_coverage:
                print(f"❌ FAILED: recent_coverage missing horizon '{horizon}'")
                return False
            
            value = recent_coverage[horizon]
            if not isinstance(value, (int, float)):
                print(f"❌ FAILED: recent_coverage['{horizon}'] is not numeric, got {type(value)}")
                return False
            
            if not (0 <= value <= 100):
                print(f"❌ FAILED: recent_coverage['{horizon}'] = {value} not in range [0, 100]")
                return False
            
            print(f"✅ recent_coverage['{horizon}'] = {value}% (valid 0-100)")
        
        # Check coverage_alerts
        if 'coverage_alerts' not in data:
            print(f"❌ FAILED: coverage_alerts field missing")
            return False
        
        coverage_alerts = data['coverage_alerts']
        if not isinstance(coverage_alerts, list):
            print(f"❌ FAILED: coverage_alerts is not a list, got {type(coverage_alerts)}")
            return False
        
        print(f"✅ coverage_alerts present (list with {len(coverage_alerts)} items)")
        
        # If non-empty, validate structure
        if len(coverage_alerts) > 0:
            for i, alert in enumerate(coverage_alerts):
                if 'horizon' not in alert:
                    print(f"❌ FAILED: coverage_alerts[{i}] missing 'horizon' field")
                    return False
                if 'coverage' not in alert:
                    print(f"❌ FAILED: coverage_alerts[{i}] missing 'coverage' field")
                    return False
                if 'threshold' not in alert:
                    print(f"❌ FAILED: coverage_alerts[{i}] missing 'threshold' field")
                    return False
                
                if alert['threshold'] != 80:
                    print(f"❌ FAILED: coverage_alerts[{i}] threshold = {alert['threshold']}, expected 80")
                    return False
                
                print(f"✅ coverage_alerts[{i}]: horizon={alert['horizon']}, coverage={alert['coverage']}%, threshold={alert['threshold']}")
        else:
            print(f"✅ coverage_alerts is empty (no alerts - coverage is healthy)")
        
        # Check coverage_history_by_horizon still present
        if 'coverage_history_by_horizon' not in data:
            print(f"❌ FAILED: coverage_history_by_horizon field missing (regression)")
            return False
        
        coverage_history = data['coverage_history_by_horizon']
        if not isinstance(coverage_history, dict):
            print(f"❌ FAILED: coverage_history_by_horizon is not a dict")
            return False
        
        for horizon in required_horizons:
            if horizon not in coverage_history:
                print(f"❌ FAILED: coverage_history_by_horizon missing horizon '{horizon}'")
                return False
            
            if not isinstance(coverage_history[horizon], list):
                print(f"❌ FAILED: coverage_history_by_horizon['{horizon}'] is not a list")
                return False
        
        print(f"✅ coverage_history_by_horizon still present (dict with 24H/7D/30D)")
        
        print("\n📊 SUMMARY:")
        print(f"   recent_coverage: 24H={recent_coverage['24H']}%, 7D={recent_coverage['7D']}%, 30D={recent_coverage['30D']}%")
        print(f"   coverage_alerts: {len(coverage_alerts)} alert(s)")
        
        print("\n✅ TEST 1 PASSED: /api/v1/validation")
        return True
        
    except Exception as e:
        print(f"❌ TEST 1 FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_dashboard_endpoint():
    """
    Test 2: GET /api/v1/dashboard
    - 200, status "ready"
    - forecasts[].conformal has a "widen" field (number >= 1.0)
    - Report widen + coverage for 24H/7D/30D
    - decision.ensemble_health present (0-1)
    - decision.overall_score + overall_score_raw present
    - forecasts still have label_method=="triple_barrier", calibrated, quantiles, ev
    """
    print("\n" + "="*80)
    print("TEST 2: GET /api/v1/dashboard — Self-Healing Widen + Ensemble Health")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/v1/dashboard"
        print(f"Requesting: {url}")
        response = requests.get(url, timeout=30)
        
        print(f"✅ HTTP Status: {response.status_code}")
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        # Check status
        if data.get('status') != 'ready':
            print(f"❌ FAILED: Expected status='ready', got '{data.get('status')}'")
            return False
        print(f"✅ status='ready'")
        
        # Check forecasts
        if 'forecasts' not in data:
            print(f"❌ FAILED: forecasts field missing")
            return False
        
        forecasts = data['forecasts']
        if not isinstance(forecasts, list):
            print(f"❌ FAILED: forecasts is not a list")
            return False
        
        if len(forecasts) < 3:
            print(f"❌ FAILED: Expected at least 3 forecasts, got {len(forecasts)}")
            return False
        
        print(f"✅ forecasts present (list with {len(forecasts)} items)")
        
        # Check each forecast for required fields
        required_horizons = ['24H', '7D', '30D']
        widen_values = {}
        
        for horizon in required_horizons:
            forecast = next((f for f in forecasts if f.get('horizon') == horizon), None)
            if not forecast:
                print(f"❌ FAILED: Forecast for horizon '{horizon}' not found")
                return False
            
            # Check conformal.widen
            if 'conformal' not in forecast:
                print(f"❌ FAILED: {horizon} forecast missing 'conformal' field")
                return False
            
            conformal = forecast['conformal']
            if 'widen' not in conformal:
                print(f"❌ FAILED: {horizon} forecast conformal missing 'widen' field")
                return False
            
            widen = conformal['widen']
            if not isinstance(widen, (int, float)):
                print(f"❌ FAILED: {horizon} conformal.widen is not numeric, got {type(widen)}")
                return False
            
            if widen < 1.0:
                print(f"❌ FAILED: {horizon} conformal.widen = {widen} < 1.0")
                return False
            
            widen_values[horizon] = widen
            
            # Check coverage in conformal
            if 'coverage' in conformal:
                coverage = conformal['coverage']
                print(f"✅ {horizon}: conformal.widen = {widen}, coverage = {coverage}%")
            else:
                print(f"✅ {horizon}: conformal.widen = {widen}")
            
            # Check label_method
            if forecast.get('label_method') != 'triple_barrier':
                print(f"❌ FAILED: {horizon} label_method = '{forecast.get('label_method')}', expected 'triple_barrier'")
                return False
            print(f"✅ {horizon}: label_method = 'triple_barrier'")
            
            # Check calibrated
            if 'calibrated' not in forecast:
                print(f"❌ FAILED: {horizon} forecast missing 'calibrated' field")
                return False
            print(f"✅ {horizon}: calibrated = {forecast['calibrated']}")
            
            # Check quantiles
            if 'quantiles' not in forecast:
                print(f"❌ FAILED: {horizon} forecast missing 'quantiles' field")
                return False
            print(f"✅ {horizon}: quantiles present")
            
            # Check ev
            if 'ev' not in forecast:
                print(f"❌ FAILED: {horizon} forecast missing 'ev' field")
                return False
            print(f"✅ {horizon}: ev present")
        
        # Check decision.ensemble_health
        if 'decision' not in data:
            print(f"❌ FAILED: decision field missing")
            return False
        
        decision = data['decision']
        
        if 'ensemble_health' not in decision:
            print(f"❌ FAILED: decision.ensemble_health field missing")
            return False
        
        ensemble_health = decision['ensemble_health']
        if not isinstance(ensemble_health, (int, float)):
            print(f"❌ FAILED: decision.ensemble_health is not numeric, got {type(ensemble_health)}")
            return False
        
        if not (0 <= ensemble_health <= 1):
            print(f"❌ FAILED: decision.ensemble_health = {ensemble_health} not in range [0, 1]")
            return False
        
        print(f"✅ decision.ensemble_health = {ensemble_health} (valid 0-1)")
        
        # Check decision.overall_score
        if 'overall_score' not in decision:
            print(f"❌ FAILED: decision.overall_score field missing")
            return False
        
        overall_score = decision['overall_score']
        if not isinstance(overall_score, (int, float)):
            print(f"❌ FAILED: decision.overall_score is not numeric")
            return False
        
        if not (0 <= overall_score <= 100):
            print(f"❌ FAILED: decision.overall_score = {overall_score} not in range [0, 100]")
            return False
        
        print(f"✅ decision.overall_score = {overall_score} (valid 0-100)")
        
        # Check decision.overall_score_raw
        if 'overall_score_raw' not in decision:
            print(f"❌ FAILED: decision.overall_score_raw field missing")
            return False
        
        overall_score_raw = decision['overall_score_raw']
        if not isinstance(overall_score_raw, (int, float)):
            print(f"❌ FAILED: decision.overall_score_raw is not numeric")
            return False
        
        if not (0 <= overall_score_raw <= 100):
            print(f"❌ FAILED: decision.overall_score_raw = {overall_score_raw} not in range [0, 100]")
            return False
        
        print(f"✅ decision.overall_score_raw = {overall_score_raw} (valid 0-100)")
        
        print("\n📊 SUMMARY:")
        print(f"   Widen values: 24H={widen_values['24H']}, 7D={widen_values['7D']}, 30D={widen_values['30D']}")
        print(f"   Ensemble health: {ensemble_health}")
        print(f"   Overall score: {overall_score} (raw: {overall_score_raw})")
        
        print("\n✅ TEST 2 PASSED: /api/v1/dashboard")
        return True
        
    except Exception as e:
        print(f"❌ TEST 2 FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_regression_endpoints():
    """
    Test 3: Regression tests
    - GET /api/v1/scorecard (ready, reliability + by_horizon ensemble_weight)
    - GET /api/v1/forecast/regime (ready)
    - GET /api/v1/data-audit (ready, 10 feeds)
    - GET /api/v1/health
    """
    print("\n" + "="*80)
    print("TEST 3: Regression Tests — All Endpoints Still Working")
    print("="*80)
    
    all_passed = True
    
    # Test /api/v1/scorecard
    try:
        url = f"{BASE_URL}/v1/scorecard"
        print(f"\nTesting: {url}")
        response = requests.get(url, timeout=30)
        
        if response.status_code != 200:
            print(f"❌ FAILED: /api/v1/scorecard returned {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            if data.get('status') != 'ready':
                print(f"❌ FAILED: /api/v1/scorecard status = '{data.get('status')}', expected 'ready'")
                all_passed = False
            else:
                print(f"✅ /api/v1/scorecard: status='ready'")
                
                # Check reliability
                if 'reliability' not in data:
                    print(f"❌ FAILED: /api/v1/scorecard missing 'reliability' field")
                    all_passed = False
                else:
                    print(f"✅ /api/v1/scorecard: reliability present")
                
                # Check by_horizon ensemble_weight
                if 'by_horizon' not in data:
                    print(f"❌ FAILED: /api/v1/scorecard missing 'by_horizon' field")
                    all_passed = False
                else:
                    by_horizon = data['by_horizon']
                    if '24H' in by_horizon and 'ensemble_weight' in by_horizon['24H']:
                        print(f"✅ /api/v1/scorecard: by_horizon['24H'].ensemble_weight = {by_horizon['24H']['ensemble_weight']}")
                    else:
                        print(f"⚠️  /api/v1/scorecard: by_horizon['24H'].ensemble_weight not found")
                    
                    if '7D' in by_horizon and 'ensemble_weight' in by_horizon['7D']:
                        print(f"✅ /api/v1/scorecard: by_horizon['7D'].ensemble_weight = {by_horizon['7D']['ensemble_weight']}")
                    else:
                        print(f"⚠️  /api/v1/scorecard: by_horizon['7D'].ensemble_weight not found")
    except Exception as e:
        print(f"❌ FAILED: /api/v1/scorecard exception: {e}")
        all_passed = False
    
    # Test /api/v1/forecast/regime
    try:
        url = f"{BASE_URL}/v1/forecast/regime"
        print(f"\nTesting: {url}")
        response = requests.get(url, timeout=30)
        
        if response.status_code != 200:
            print(f"❌ FAILED: /api/v1/forecast/regime returned {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            if data.get('status') != 'ready':
                print(f"❌ FAILED: /api/v1/forecast/regime status = '{data.get('status')}', expected 'ready'")
                all_passed = False
            else:
                print(f"✅ /api/v1/forecast/regime: status='ready'")
    except Exception as e:
        print(f"❌ FAILED: /api/v1/forecast/regime exception: {e}")
        all_passed = False
    
    # Test /api/v1/data-audit
    try:
        url = f"{BASE_URL}/v1/data-audit"
        print(f"\nTesting: {url}")
        response = requests.get(url, timeout=30)
        
        if response.status_code != 200:
            print(f"❌ FAILED: /api/v1/data-audit returned {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            if data.get('status') != 'ready':
                print(f"❌ FAILED: /api/v1/data-audit status = '{data.get('status')}', expected 'ready'")
                all_passed = False
            else:
                print(f"✅ /api/v1/data-audit: status='ready'")
                
                # Check feeds count
                if 'feeds' not in data:
                    print(f"❌ FAILED: /api/v1/data-audit missing 'feeds' field")
                    all_passed = False
                else:
                    feeds = data['feeds']
                    if len(feeds) != 10:
                        print(f"⚠️  /api/v1/data-audit: feeds count = {len(feeds)}, expected 10")
                    else:
                        print(f"✅ /api/v1/data-audit: 10 feeds present")
    except Exception as e:
        print(f"❌ FAILED: /api/v1/data-audit exception: {e}")
        all_passed = False
    
    # Test /api/v1/health
    try:
        url = f"{BASE_URL}/v1/health"
        print(f"\nTesting: {url}")
        response = requests.get(url, timeout=30)
        
        if response.status_code != 200:
            print(f"❌ FAILED: /api/v1/health returned {response.status_code}")
            all_passed = False
        else:
            print(f"✅ /api/v1/health: HTTP 200")
    except Exception as e:
        print(f"❌ FAILED: /api/v1/health exception: {e}")
        all_passed = False
    
    if all_passed:
        print("\n✅ TEST 3 PASSED: All regression endpoints working")
    else:
        print("\n❌ TEST 3 FAILED: Some regression endpoints failed")
    
    return all_passed


def main():
    print("="*80)
    print("BitMarkAI Coverage Alerts + Self-Healing Corridor Widen + Model-Health Badge")
    print("Comprehensive Backend Test Suite")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print("IMPORTANT: Do NOT POST to any /api/v1/email/* endpoints. GET only.")
    
    results = {
        'test_1_validation': False,
        'test_2_dashboard': False,
        'test_3_regression': False
    }
    
    # Run all tests
    results['test_1_validation'] = test_validation_endpoint()
    results['test_2_dashboard'] = test_dashboard_endpoint()
    results['test_3_regression'] = test_regression_endpoints()
    
    # Final summary
    print("\n" + "="*80)
    print("FINAL TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED! BitMarkAI additions are fully functional.")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Please review the output above.")
        sys.exit(1)


if __name__ == "__main__":
    main()
