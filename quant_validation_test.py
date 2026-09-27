#!/usr/bin/env python3
"""
Comprehensive backend test for CQR conformal corridors + Triple-Barrier labels + quant validation engine
Base URL: https://what-if-sandbox.preview.emergentagent.com/api
"""

import requests
import sys

BASE_URL = "https://what-if-sandbox.preview.emergentagent.com/api"

def test_dashboard_forecasts():
    """
    Test 1: GET /api/v1/dashboard - validate forecasts with triple_barrier labels and conformal corridors
    """
    print("\n" + "="*80)
    print("TEST 1: GET /api/v1/dashboard - Forecasts with CQR + Triple-Barrier")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/v1/dashboard"
        print(f"\nRequesting: {url}")
        resp = requests.get(url, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        
        if data.get('status') != 'ready':
            print(f"❌ FAILED: Expected status='ready', got '{data.get('status')}'")
            return False
        
        print("✅ HTTP 200, status='ready'")
        
        # Check forecasts field
        forecasts = data.get('forecasts')
        if not forecasts or not isinstance(forecasts, list):
            print(f"❌ FAILED: forecasts field missing or not a list")
            return False
        
        print(f"✅ forecasts field present with {len(forecasts)} items")
        
        # Validate each forecast (24H, 7D, 30D)
        horizons_to_check = ['24H', '7D', '30D']
        for horizon in horizons_to_check:
            print(f"\n--- Validating {horizon} forecast ---")
            forecast = next((f for f in forecasts if f.get('horizon') == horizon), None)
            
            if not forecast:
                print(f"❌ FAILED: {horizon} forecast not found")
                return False
            
            # 1. Check label_method == "triple_barrier"
            label_method = forecast.get('label_method')
            if label_method != 'triple_barrier':
                print(f"❌ FAILED: {horizon} label_method='{label_method}', expected 'triple_barrier'")
                return False
            print(f"✅ {horizon} label_method='triple_barrier'")
            
            # 2. Check conformal present
            conformal = forecast.get('conformal')
            if not conformal or not isinstance(conformal, dict):
                print(f"❌ FAILED: {horizon} conformal field missing or not a dict")
                return False
            
            # 2a. Check lower < upper
            lower = conformal.get('lower')
            upper = conformal.get('upper')
            if not isinstance(lower, (int, float)) or not isinstance(upper, (int, float)):
                print(f"❌ FAILED: {horizon} conformal lower/upper not numbers")
                return False
            if lower >= upper:
                print(f"❌ FAILED: {horizon} conformal lower ({lower}) >= upper ({upper})")
                return False
            print(f"✅ {horizon} conformal.lower={lower:.2f} < upper={upper:.2f}")
            
            # 2b. Check width_pct > 0
            width_pct = conformal.get('width_pct')
            if not isinstance(width_pct, (int, float)) or width_pct <= 0:
                print(f"❌ FAILED: {horizon} conformal width_pct={width_pct}, expected > 0")
                return False
            print(f"✅ {horizon} conformal.width_pct={width_pct:.2f}% > 0")
            
            # 2c. Check coverage between 80 and 100
            coverage = conformal.get('coverage')
            if not isinstance(coverage, (int, float)) or coverage < 80 or coverage > 100:
                print(f"❌ FAILED: {horizon} conformal coverage={coverage}, expected 80-100")
                return False
            print(f"✅ {horizon} conformal.coverage={coverage:.1f}% (80-100)")
            
            # 2d. Check target_coverage == 90
            target_coverage = conformal.get('target_coverage')
            if target_coverage != 90:
                print(f"❌ FAILED: {horizon} conformal target_coverage={target_coverage}, expected 90")
                return False
            print(f"✅ {horizon} conformal.target_coverage={target_coverage}")
            
            # 2e. Check q_hat_pct present
            q_hat_pct = conformal.get('q_hat_pct')
            if not isinstance(q_hat_pct, (int, float)):
                print(f"❌ FAILED: {horizon} conformal q_hat_pct missing or not a number")
                return False
            print(f"✅ {horizon} conformal.q_hat_pct={q_hat_pct:.2f}%")
            
            # 2f. Check n_calib > 20
            n_calib = conformal.get('n_calib')
            if not isinstance(n_calib, int) or n_calib <= 20:
                print(f"❌ FAILED: {horizon} conformal n_calib={n_calib}, expected > 20")
                return False
            print(f"✅ {horizon} conformal.n_calib={n_calib} > 20")
            
            # 3. Check calibrated == true
            calibrated = forecast.get('calibrated')
            if calibrated != True:
                print(f"❌ FAILED: {horizon} calibrated={calibrated}, expected true")
                return False
            print(f"✅ {horizon} calibrated=true")
            
            # 4. Check quantiles monotonic (p10<=p25<=p50<=p75<=p90)
            quantiles = forecast.get('quantiles')
            if not quantiles or not isinstance(quantiles, dict):
                print(f"❌ FAILED: {horizon} quantiles field missing or not a dict")
                return False
            
            p10 = quantiles.get('p10')
            p25 = quantiles.get('p25')
            p50 = quantiles.get('p50')
            p75 = quantiles.get('p75')
            p90 = quantiles.get('p90')
            
            if not all(isinstance(x, (int, float)) for x in [p10, p25, p50, p75, p90]):
                print(f"❌ FAILED: {horizon} quantiles not all numbers")
                return False
            
            if not (p10 <= p25 <= p50 <= p75 <= p90):
                print(f"❌ FAILED: {horizon} quantiles not monotonic: p10={p10}, p25={p25}, p50={p50}, p75={p75}, p90={p90}")
                return False
            print(f"✅ {horizon} quantiles monotonic: p10={p10:.0f} <= p25={p25:.0f} <= p50={p50:.0f} <= p75={p75:.0f} <= p90={p90:.0f}")
            
            # 5. Check ev present
            ev = forecast.get('ev')
            if not ev or not isinstance(ev, dict):
                print(f"❌ FAILED: {horizon} ev field missing or not a dict")
                return False
            print(f"✅ {horizon} ev field present")
        
        # Check long_outlook items (conformal may be null)
        print(f"\n--- Validating long_outlook items (conformal may be null) ---")
        long_outlook = data.get('long_outlook')
        if long_outlook and isinstance(long_outlook, list):
            for item in long_outlook:
                horizon = item.get('horizon')
                conformal = item.get('conformal')
                if conformal is None:
                    print(f"✅ {horizon} conformal=null (expected for light horizons)")
                else:
                    print(f"✅ {horizon} conformal present (coverage={conformal.get('coverage', 'N/A')}%)")
        
        print("\n✅ TEST 1 PASSED: All dashboard forecast validations passed")
        return True
        
    except Exception as e:
        print(f"❌ TEST 1 FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_validation_endpoint():
    """
    Test 2: GET /api/v1/validation - validate quant metrics
    """
    print("\n" + "="*80)
    print("TEST 2: GET /api/v1/validation - Quant Validation Engine")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/v1/validation"
        print(f"\nRequesting: {url}")
        resp = requests.get(url, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        
        if data.get('status') != 'ready':
            print(f"❌ FAILED: Expected status='ready', got '{data.get('status')}'")
            return False
        
        print("✅ HTTP 200, status='ready'")
        
        # 1. Check n_trades (int > 100)
        n_trades = data.get('n_trades')
        if not isinstance(n_trades, int) or n_trades <= 100:
            print(f"❌ FAILED: n_trades={n_trades}, expected int > 100")
            return False
        print(f"✅ n_trades={n_trades} (int > 100)")
        
        # 2. Check horizon_bars (int)
        horizon_bars = data.get('horizon_bars')
        if not isinstance(horizon_bars, int):
            print(f"❌ FAILED: horizon_bars={horizon_bars}, expected int")
            return False
        print(f"✅ horizon_bars={horizon_bars} (int)")
        
        # 3. Check brier_score (float ~0-0.5)
        brier_score = data.get('brier_score')
        if not isinstance(brier_score, (int, float)) or brier_score < 0 or brier_score > 0.5:
            print(f"❌ FAILED: brier_score={brier_score}, expected float ~0-0.5")
            return False
        print(f"✅ brier_score={brier_score:.4f} (float ~0-0.5)")
        
        # 4. Check probabilistic_sharpe_ratio (float 0-1 or null)
        psr = data.get('probabilistic_sharpe_ratio')
        if psr is not None and (not isinstance(psr, (int, float)) or psr < 0 or psr > 1):
            print(f"❌ FAILED: probabilistic_sharpe_ratio={psr}, expected float 0-1 or null")
            return False
        print(f"✅ probabilistic_sharpe_ratio={psr} (float 0-1 or null)")
        
        # 5. Check deflated_sharpe_ratio (float 0-1 or null)
        dsr = data.get('deflated_sharpe_ratio')
        if dsr is not None and (not isinstance(dsr, (int, float)) or dsr < 0 or dsr > 1):
            print(f"❌ FAILED: deflated_sharpe_ratio={dsr}, expected float 0-1 or null")
            return False
        print(f"✅ deflated_sharpe_ratio={dsr} (float 0-1 or null)")
        
        # 6. Check annualized_sharpe (float)
        annualized_sharpe = data.get('annualized_sharpe')
        if not isinstance(annualized_sharpe, (int, float)):
            print(f"❌ FAILED: annualized_sharpe={annualized_sharpe}, expected float")
            return False
        print(f"✅ annualized_sharpe={annualized_sharpe:.4f} (float)")
        
        # 7. Check max_drawdown_pct (float)
        max_drawdown_pct = data.get('max_drawdown_pct')
        if not isinstance(max_drawdown_pct, (int, float)):
            print(f"❌ FAILED: max_drawdown_pct={max_drawdown_pct}, expected float")
            return False
        print(f"✅ max_drawdown_pct={max_drawdown_pct:.2f}% (float)")
        
        # 8. Check rolling_brier_slope (float)
        rolling_brier_slope = data.get('rolling_brier_slope')
        if not isinstance(rolling_brier_slope, (int, float)):
            print(f"❌ FAILED: rolling_brier_slope={rolling_brier_slope}, expected float")
            return False
        print(f"✅ rolling_brier_slope={rolling_brier_slope:.6f} (float)")
        
        # 9. Check rolling_brier_history (non-empty list)
        rolling_brier_history = data.get('rolling_brier_history')
        if not isinstance(rolling_brier_history, list) or len(rolling_brier_history) == 0:
            print(f"❌ FAILED: rolling_brier_history not a non-empty list")
            return False
        print(f"✅ rolling_brier_history: {len(rolling_brier_history)} items (non-empty list)")
        
        # 10. Check benchmarks (dict with booleans)
        benchmarks = data.get('benchmarks')
        if not isinstance(benchmarks, dict):
            print(f"❌ FAILED: benchmarks not a dict")
            return False
        
        required_benchmark_keys = ['brier_pass', 'psr_pass', 'dsr_pass', 'brier_decay_pass']
        for key in required_benchmark_keys:
            if key not in benchmarks or not isinstance(benchmarks[key], bool):
                print(f"❌ FAILED: benchmarks.{key} missing or not a boolean")
                return False
        print(f"✅ benchmarks: brier_pass={benchmarks['brier_pass']}, psr_pass={benchmarks['psr_pass']}, dsr_pass={benchmarks['dsr_pass']}, brier_decay_pass={benchmarks['brier_decay_pass']}")
        
        # 11. Check thresholds (dict)
        thresholds = data.get('thresholds')
        if not isinstance(thresholds, dict):
            print(f"❌ FAILED: thresholds not a dict")
            return False
        print(f"✅ thresholds: {len(thresholds)} items (dict)")
        
        print("\n✅ TEST 2 PASSED: All validation endpoint checks passed")
        print(f"\nOBSERVED VALUES:")
        print(f"  n_trades: {n_trades}")
        print(f"  brier_score: {brier_score:.4f}")
        print(f"  PSR: {psr}")
        print(f"  DSR: {dsr}")
        print(f"  annualized_sharpe: {annualized_sharpe:.4f}")
        
        return True
        
    except Exception as e:
        print(f"❌ TEST 2 FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_regression_dashboard():
    """
    Test 3: GET /api/v1/dashboard - regression checks
    """
    print("\n" + "="*80)
    print("TEST 3: GET /api/v1/dashboard - Regression (weights_mode, scenarios_block)")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/v1/dashboard"
        print(f"\nRequesting: {url}")
        resp = requests.get(url, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        
        if data.get('status') != 'ready':
            print(f"❌ FAILED: Expected status='ready', got '{data.get('status')}'")
            return False
        
        print("✅ HTTP 200, status='ready'")
        
        # Check decision.weights_mode == "dynamic"
        decision = data.get('decision')
        if not decision or not isinstance(decision, dict):
            print(f"❌ FAILED: decision field missing or not a dict")
            return False
        
        weights_mode = decision.get('weights_mode')
        if weights_mode != 'dynamic':
            print(f"❌ FAILED: decision.weights_mode='{weights_mode}', expected 'dynamic'")
            return False
        print(f"✅ decision.weights_mode='dynamic'")
        
        # Check decision.scenarios_block present
        scenarios_block = decision.get('scenarios_block')
        if not scenarios_block or not isinstance(scenarios_block, dict):
            print(f"❌ FAILED: decision.scenarios_block missing or not a dict")
            return False
        print(f"✅ decision.scenarios_block present")
        
        print("\n✅ TEST 3 PASSED: Dashboard regression checks passed")
        return True
        
    except Exception as e:
        print(f"❌ TEST 3 FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_regression_regime():
    """
    Test 4: GET /api/v1/forecast/regime - regression
    """
    print("\n" + "="*80)
    print("TEST 4: GET /api/v1/forecast/regime - Regression")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/v1/forecast/regime"
        print(f"\nRequesting: {url}")
        resp = requests.get(url, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        
        if data.get('status') != 'ready':
            print(f"❌ FAILED: Expected status='ready', got '{data.get('status')}'")
            return False
        
        print("✅ HTTP 200, status='ready'")
        print("\n✅ TEST 4 PASSED: Forecast regime regression passed")
        return True
        
    except Exception as e:
        print(f"❌ TEST 4 FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_regression_data_audit():
    """
    Test 5: GET /api/v1/data-audit - regression (10 feeds)
    """
    print("\n" + "="*80)
    print("TEST 5: GET /api/v1/data-audit - Regression (10 feeds)")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/v1/data-audit"
        print(f"\nRequesting: {url}")
        resp = requests.get(url, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        
        if data.get('status') != 'ready':
            print(f"❌ FAILED: Expected status='ready', got '{data.get('status')}'")
            return False
        
        print("✅ HTTP 200, status='ready'")
        
        # Check 10 feeds
        feeds = data.get('feeds')
        if not isinstance(feeds, list) or len(feeds) != 10:
            print(f"❌ FAILED: Expected 10 feeds, got {len(feeds) if isinstance(feeds, list) else 'not a list'}")
            return False
        print(f"✅ feeds: 10 items")
        
        print("\n✅ TEST 5 PASSED: Data audit regression passed")
        return True
        
    except Exception as e:
        print(f"❌ TEST 5 FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_regression_scorecard():
    """
    Test 6: GET /api/v1/scorecard - regression (reliability block)
    """
    print("\n" + "="*80)
    print("TEST 6: GET /api/v1/scorecard - Regression (reliability block)")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/v1/scorecard"
        print(f"\nRequesting: {url}")
        resp = requests.get(url, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        
        if data.get('status') != 'ready':
            print(f"❌ FAILED: Expected status='ready', got '{data.get('status')}'")
            return False
        
        print("✅ HTTP 200, status='ready'")
        
        # Check reliability block
        reliability = data.get('reliability')
        if not reliability or not isinstance(reliability, dict):
            print(f"❌ FAILED: reliability block missing or not a dict")
            return False
        print(f"✅ reliability block present")
        
        print("\n✅ TEST 6 PASSED: Scorecard regression passed")
        return True
        
    except Exception as e:
        print(f"❌ TEST 6 FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_regression_health():
    """
    Test 7: GET /api/v1/health - regression
    """
    print("\n" + "="*80)
    print("TEST 7: GET /api/v1/health - Regression")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/v1/health"
        print(f"\nRequesting: {url}")
        resp = requests.get(url, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {resp.status_code}")
            return False
        
        print("✅ HTTP 200")
        print("\n✅ TEST 7 PASSED: Health regression passed")
        return True
        
    except Exception as e:
        print(f"❌ TEST 7 FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("BITMARKAI FASTAPI QUANT UPGRADES - FINAL VALIDATION")
    print("Base URL: https://what-if-sandbox.preview.emergentagent.com/api")
    print("="*80)
    
    tests = [
        ("Dashboard Forecasts (CQR + Triple-Barrier)", test_dashboard_forecasts),
        ("Validation Endpoint (Quant Metrics)", test_validation_endpoint),
        ("Dashboard Regression (weights_mode, scenarios_block)", test_regression_dashboard),
        ("Forecast Regime Regression", test_regression_regime),
        ("Data Audit Regression (10 feeds)", test_regression_data_audit),
        ("Scorecard Regression (reliability block)", test_regression_scorecard),
        ("Health Regression", test_regression_health),
    ]
    
    results = []
    for name, test_func in tests:
        result = test_func()
        results.append((name, result))
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED - Feature is production-ready")
        sys.exit(0)
    else:
        print(f"\n❌ {total - passed} test(s) failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
