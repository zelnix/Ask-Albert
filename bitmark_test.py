#!/usr/bin/env python3
"""
BitMarkAI Engine Certification Test
Tests the NEW BitMarkAI engine on BTCIQ backend via Next.js proxy
Data is real; no keys needed. Does NOT test WebSockets.
"""
import requests
import sys
import time
from datetime import datetime, timedelta

# External base URL from .env
BASE_URL = "https://what-if-sandbox.preview.emergentagent.com"


def test_bitmark_dashboard():
    """
    TEST 1: GET /api/v1/dashboard -> validate top-level `bitmark` object
    """
    print("\n" + "="*80)
    print("TEST 1 - BitMarkAI Dashboard Object")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/api/v1/dashboard"
        print(f"Testing: GET {url}")
        resp = requests.get(url, timeout=30)
        
        if resp.status_code != 200:
            print(f"❌ FAILED: HTTP {resp.status_code}")
            return False
        
        data = resp.json()
        
        # Validate bitmark object exists
        if 'bitmark' not in data:
            print("❌ FAILED: Missing 'bitmark' field in dashboard")
            return False
        
        bitmark = data['bitmark']
        print(f"✓ bitmark object present")
        
        # Validate top-level fields
        required_top = ['model_version', 'trigger', 'issued', 'next_scheduled_update', 
                       'current_price', 'regime', 'change_explanation', 'generated_at', 'horizons']
        for field in required_top:
            if field not in bitmark:
                print(f"❌ FAILED: Missing bitmark.{field}")
                return False
        print(f"✓ All required top-level fields present")
        
        # Validate model_version
        if bitmark['model_version'] != 'bitmark-v1':
            print(f"❌ FAILED: model_version='{bitmark['model_version']}' != 'bitmark-v1'")
            return False
        print(f"✓ model_version='bitmark-v1'")
        
        # Validate trigger
        if bitmark['trigger'] not in ['scheduled', 'manual', 'event']:
            print(f"❌ FAILED: trigger='{bitmark['trigger']}' not in [scheduled, manual, event]")
            return False
        print(f"✓ trigger='{bitmark['trigger']}' (valid)")
        
        # Validate issued (YYYY-MM-DD)
        issued = bitmark['issued']
        try:
            datetime.strptime(issued, '%Y-%m-%d')
            print(f"✓ issued='{issued}' (valid YYYY-MM-DD)")
        except Exception:
            print(f"❌ FAILED: issued='{issued}' not valid YYYY-MM-DD")
            return False
        
        # Validate next_scheduled_update (YYYY-MM-DD, = issued + 7 days)
        next_upd = bitmark['next_scheduled_update']
        try:
            issued_dt = datetime.strptime(issued, '%Y-%m-%d')
            next_dt = datetime.strptime(next_upd, '%Y-%m-%d')
            expected_next = issued_dt + timedelta(days=7)
            if next_dt.date() != expected_next.date():
                print(f"❌ FAILED: next_scheduled_update='{next_upd}' != issued + 7 days (expected {expected_next.strftime('%Y-%m-%d')})")
                return False
            print(f"✓ next_scheduled_update='{next_upd}' (= issued + 7 days)")
        except Exception as e:
            print(f"❌ FAILED: next_scheduled_update='{next_upd}' validation error: {e}")
            return False
        
        # Validate current_price
        price = bitmark['current_price']
        if not isinstance(price, (int, float)) or price <= 0:
            print(f"❌ FAILED: current_price={price} not a positive number")
            return False
        print(f"✓ current_price=${price:,.2f} (valid)")
        
        # Validate regime
        regime = bitmark['regime']
        if not isinstance(regime, str) or not regime:
            print(f"❌ FAILED: regime='{regime}' not a non-empty string")
            return False
        print(f"✓ regime='{regime}' (non-empty string)")
        
        # Validate change_explanation
        change_exp = bitmark['change_explanation']
        if not isinstance(change_exp, str) or not change_exp:
            print(f"❌ FAILED: change_explanation is empty or not string")
            return False
        print(f"✓ change_explanation present ({len(change_exp)} chars)")
        
        # Validate generated_at
        gen_at = bitmark['generated_at']
        try:
            datetime.fromisoformat(gen_at.replace('Z', ''))
            print(f"✓ generated_at='{gen_at}' (valid ISO format)")
        except Exception:
            print(f"❌ FAILED: generated_at='{gen_at}' not valid ISO format")
            return False
        
        # Validate horizons (EXACTLY 7)
        horizons = bitmark['horizons']
        if not isinstance(horizons, list) or len(horizons) != 7:
            print(f"❌ FAILED: horizons has {len(horizons)} items, expected EXACTLY 7")
            return False
        print(f"✓ horizons list has EXACTLY 7 items")
        
        # Validate horizon codes (must be exactly [1W, 1M, 3M, 6M, 1Y, 2Y, 5Y] in order)
        codes = [h['horizon'] for h in horizons]
        expected_codes = ['1W', '1M', '3M', '6M', '1Y', '2Y', '5Y']
        if codes != expected_codes:
            print(f"❌ FAILED: horizon codes={codes} != {expected_codes}")
            return False
        print(f"✓ horizon codes are exactly {expected_codes} in order")
        
        # Validate first 5 horizons (1W, 1M, 3M, 6M, 1Y) - type=='model'
        print(f"\n--- Validating MODEL horizons (1W, 1M, 3M, 6M, 1Y) ---")
        for i in range(5):
            h = horizons[i]
            code = h['horizon']
            print(f"\nValidating {code}:")
            
            # Validate type
            if h.get('type') != 'model':
                print(f"  ❌ FAILED: {code} type='{h.get('type')}' != 'model'")
                return False
            print(f"  ✓ type='model'")
            
            # Validate required fields for model horizons
            model_required = ['label', 'prob_above', 'prob_below', 'base_low', 'base_high',
                            'bull_low', 'bull_high', 'bear_low', 'bear_high',
                            'expected_volatility', 'model_confidence', 'weighting',
                            'top_positive', 'top_risk', 'issued', 'next_update']
            for field in model_required:
                if field not in h:
                    print(f"  ❌ FAILED: {code} missing '{field}'")
                    return False
            print(f"  ✓ All required fields present")
            
            # Validate probabilities
            prob_above = h['prob_above']
            prob_below = h['prob_below']
            if not isinstance(prob_above, (int, float)) or not (0 <= prob_above <= 100):
                print(f"  ❌ FAILED: {code} prob_above={prob_above} not in 0-100")
                return False
            if not isinstance(prob_below, (int, float)) or not (0 <= prob_below <= 100):
                print(f"  ❌ FAILED: {code} prob_below={prob_below} not in 0-100")
                return False
            if abs(prob_above + prob_below - 100) > 0.5:
                print(f"  ❌ FAILED: {code} prob_above + prob_below = {prob_above + prob_below} != 100")
                return False
            print(f"  ✓ prob_above={prob_above}%, prob_below={prob_below}% (sum=100)")
            
            # Validate ranges (all numeric)
            ranges = ['base_low', 'base_high', 'bull_low', 'bull_high', 'bear_low', 'bear_high']
            for r in ranges:
                if not isinstance(h[r], (int, float)):
                    print(f"  ❌ FAILED: {code} {r}={h[r]} not numeric")
                    return False
            
            # Validate range logic: bear_low <= base_low <= base_high <= bull_high
            if not (h['bear_low'] <= h['base_low'] <= h['base_high'] <= h['bull_high']):
                print(f"  ❌ FAILED: {code} range logic violated: bear_low({h['bear_low']}) <= base_low({h['base_low']}) <= base_high({h['base_high']}) <= bull_high({h['bull_high']})")
                return False
            print(f"  ✓ Range logic valid: bear_low({h['bear_low']}) <= base_low({h['base_low']}) <= base_high({h['base_high']}) <= bull_high({h['bull_high']})")
            
            # Validate expected_volatility
            if h['expected_volatility'] not in ['Low', 'Elevated', 'High', 'Very High']:
                print(f"  ❌ FAILED: {code} expected_volatility='{h['expected_volatility']}' not in [Low,Elevated,High,Very High]")
                return False
            print(f"  ✓ expected_volatility='{h['expected_volatility']}' (valid)")
            
            # Validate model_confidence
            if h['model_confidence'] not in ['Low', 'Moderate', 'High', 'Very Low']:
                print(f"  ❌ FAILED: {code} model_confidence='{h['model_confidence']}' not in [Low,Moderate,High,Very Low]")
                return False
            print(f"  ✓ model_confidence='{h['model_confidence']}' (valid)")
            
            # Validate weighting (list of {category, weight}, weights sum ~100)
            weighting = h['weighting']
            if not isinstance(weighting, list) or len(weighting) == 0:
                print(f"  ❌ FAILED: {code} weighting is not a non-empty list")
                return False
            
            total_weight = sum(w['weight'] for w in weighting)
            if abs(total_weight - 100) > 1:
                print(f"  ❌ FAILED: {code} weighting sum={total_weight} != 100")
                return False
            print(f"  ✓ weighting: {len(weighting)} categories, sum={total_weight}% (~100)")
            
            # Validate top_positive and top_risk
            if not isinstance(h['top_positive'], str) or not h['top_positive']:
                print(f"  ❌ FAILED: {code} top_positive is empty or not string")
                return False
            if not isinstance(h['top_risk'], str) or not h['top_risk']:
                print(f"  ❌ FAILED: {code} top_risk is empty or not string")
                return False
            print(f"  ✓ top_positive and top_risk present")
            
            # Validate issued and next_update
            if h['issued'] != issued:
                print(f"  ❌ FAILED: {code} issued='{h['issued']}' != top-level issued '{issued}'")
                return False
            if h['next_update'] != next_upd:
                print(f"  ❌ FAILED: {code} next_update='{h['next_update']}' != top-level next_scheduled_update '{next_upd}'")
                return False
            print(f"  ✓ issued and next_update match top-level")
        
        # Validate last 2 horizons (2Y, 5Y) - type=='scenario'
        print(f"\n--- Validating SCENARIO horizons (2Y, 5Y) ---")
        for i in range(5, 7):
            h = horizons[i]
            code = h['horizon']
            print(f"\nValidating {code}:")
            
            # Validate type
            if h.get('type') != 'scenario':
                print(f"  ❌ FAILED: {code} type='{h.get('type')}' != 'scenario'")
                return False
            print(f"  ✓ type='scenario'")
            
            # Validate required fields for scenario horizons
            scenario_required = ['prob_above', 'prob_below', 'expected_volatility', 
                               'model_confidence', 'scenarios', 'weighting']
            for field in scenario_required:
                if field not in h:
                    print(f"  ❌ FAILED: {code} missing '{field}'")
                    return False
            print(f"  ✓ All required fields present")
            
            # Validate probabilities
            prob_above = h['prob_above']
            prob_below = h['prob_below']
            if not isinstance(prob_above, (int, float)) or not (0 <= prob_above <= 100):
                print(f"  ❌ FAILED: {code} prob_above={prob_above} not in 0-100")
                return False
            if not isinstance(prob_below, (int, float)) or not (0 <= prob_below <= 100):
                print(f"  ❌ FAILED: {code} prob_below={prob_below} not in 0-100")
                return False
            print(f"  ✓ prob_above={prob_above}%, prob_below={prob_below}%")
            
            # Validate expected_volatility (must be 'Very High')
            if h['expected_volatility'] != 'Very High':
                print(f"  ❌ FAILED: {code} expected_volatility='{h['expected_volatility']}' != 'Very High'")
                return False
            print(f"  ✓ expected_volatility='Very High'")
            
            # Validate model_confidence (must be 'Low' or 'Very Low')
            if h['model_confidence'] not in ['Low', 'Very Low']:
                print(f"  ❌ FAILED: {code} model_confidence='{h['model_confidence']}' not in [Low, Very Low]")
                return False
            print(f"  ✓ model_confidence='{h['model_confidence']}' (valid)")
            
            # Validate scenarios (list of 4 named exactly [Adoption Expansion, Base Adoption, Restrictive Policy, Severe Disruption])
            scenarios = h['scenarios']
            if not isinstance(scenarios, list) or len(scenarios) != 4:
                print(f"  ❌ FAILED: {code} scenarios has {len(scenarios)} items, expected EXACTLY 4")
                return False
            
            scenario_names = [s['name'] for s in scenarios]
            expected_names = ['Adoption Expansion', 'Base Adoption', 'Restrictive Policy', 'Severe Disruption']
            if scenario_names != expected_names:
                print(f"  ❌ FAILED: {code} scenario names={scenario_names} != {expected_names}")
                return False
            print(f"  ✓ scenarios: 4 items with correct names {expected_names}")
            
            # Validate each scenario
            total_prob = 0
            for s in scenarios:
                # Validate required fields
                if not all(k in s for k in ['name', 'prob', 'low', 'high', 'note']):
                    print(f"  ❌ FAILED: {code} scenario '{s.get('name')}' missing required fields")
                    return False
                
                # Validate prob (int)
                if not isinstance(s['prob'], int):
                    print(f"  ❌ FAILED: {code} scenario '{s['name']}' prob={s['prob']} not int")
                    return False
                total_prob += s['prob']
                
                # Validate low and high (numeric, high > low)
                if not isinstance(s['low'], (int, float)) or not isinstance(s['high'], (int, float)):
                    print(f"  ❌ FAILED: {code} scenario '{s['name']}' low/high not numeric")
                    return False
                if s['high'] <= s['low']:
                    print(f"  ❌ FAILED: {code} scenario '{s['name']}' high({s['high']}) <= low({s['low']})")
                    return False
                
                # Validate note (non-empty string)
                if not isinstance(s['note'], str) or not s['note']:
                    print(f"  ❌ FAILED: {code} scenario '{s['name']}' note is empty or not string")
                    return False
            
            # Validate total probability (must sum to 100)
            if total_prob != 100:
                print(f"  ❌ FAILED: {code} scenario probabilities sum={total_prob} != 100")
                return False
            print(f"  ✓ All scenarios validated, probabilities sum=100%")
            
            # Validate weighting present
            if not isinstance(h['weighting'], list) or len(h['weighting']) == 0:
                print(f"  ❌ FAILED: {code} weighting is not a non-empty list")
                return False
            print(f"  ✓ weighting present ({len(h['weighting'])} categories)")
        
        print(f"\n✅ TEST 1 PASSED - BitMarkAI Dashboard Object fully validated")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_bitmark_run():
    """
    TEST 2: POST /api/v1/bitmark/run
    - First call (if not recently run) -> {status:'started'} OR {status:'busy'}
    - Immediately call again -> MUST return {status:'rate_limited', retry_in (<=300)}
    """
    print("\n" + "="*80)
    print("TEST 2 - BitMarkAI Manual Run + Rate Limiting")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/api/v1/bitmark/run"
        
        # First call
        print(f"\nTest 2.1: POST {url} (first call)")
        resp1 = requests.post(url, timeout=30)
        
        if resp1.status_code != 200:
            print(f"❌ FAILED: HTTP {resp1.status_code}")
            return False
        
        data1 = resp1.json()
        status1 = data1.get('status')
        
        # Accept either 'started' or 'busy' as valid (both are non-error states)
        if status1 not in ['started', 'busy']:
            print(f"❌ FAILED: First call returned status='{status1}', expected 'started' or 'busy'")
            return False
        
        print(f"✓ First call returned status='{status1}' (valid non-error state)")
        if 'message' in data1:
            print(f"  Message: {data1['message']}")
        
        # Second call immediately (should be rate-limited)
        print(f"\nTest 2.2: POST {url} (immediate second call - testing rate limit)")
        resp2 = requests.post(url, timeout=30)
        
        if resp2.status_code != 200:
            print(f"❌ FAILED: HTTP {resp2.status_code}")
            return False
        
        data2 = resp2.json()
        status2 = data2.get('status')
        
        # MUST return rate_limited
        if status2 != 'rate_limited':
            print(f"❌ FAILED: Second call returned status='{status2}', expected 'rate_limited' (5-minute cooldown)")
            return False
        
        print(f"✓ Second call returned status='rate_limited' (correct)")
        
        # Validate retry_in field
        if 'retry_in' not in data2:
            print(f"❌ FAILED: rate_limited response missing 'retry_in' field")
            return False
        
        retry_in = data2['retry_in']
        if not isinstance(retry_in, int) or not (0 <= retry_in <= 300):
            print(f"❌ FAILED: retry_in={retry_in} not int in range 0-300")
            return False
        
        print(f"✓ retry_in={retry_in}s (valid, <=300s)")
        
        # Validate message field
        if 'message' not in data2:
            print(f"❌ FAILED: rate_limited response missing 'message' field")
            return False
        
        message = data2['message']
        if not isinstance(message, str) or not message:
            print(f"❌ FAILED: message is empty or not string")
            return False
        
        print(f"✓ message present: '{message}'")
        
        print(f"\n✅ TEST 2 PASSED - BitMarkAI Manual Run + Rate Limiting validated")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_regression():
    """
    TEST 3: REGRESSION - Ensure all prior endpoints still work
    - GET /api/v1/dashboard: status=='ready', decision, news_forecast_link, data_health, 
      event_calendar, prediction_ledger, forecasts(3), long_outlook(3), quant_score, 
      regime, dominance, cycle, policy, chart, alerts
    - GET /api/v1/scorecard: status=='ready'
    - GET /api/v1/health: compute_status, runs>0
    - GET /api/v1/ticker: price, price_aud
    """
    print("\n" + "="*80)
    print("TEST 3 - REGRESSION (Prior Endpoints)")
    print("="*80)
    
    try:
        # Test GET /api/v1/dashboard
        url = f"{BASE_URL}/api/v1/dashboard"
        print(f"\nTest 3.1: GET {url}")
        resp = requests.get(url, timeout=30)
        
        if resp.status_code != 200:
            print(f"❌ FAILED: HTTP {resp.status_code}")
            return False
        
        data = resp.json()
        
        if data.get('status') != 'ready':
            print(f"❌ FAILED: dashboard status='{data.get('status')}' != 'ready'")
            return False
        print(f"✓ dashboard status='ready'")
        
        # Check all prior fields
        prior_fields = [
            'decision', 'news_forecast_link', 'data_health', 'event_calendar', 
            'prediction_ledger', 'forecasts', 'long_outlook', 'quant_score', 
            'regime', 'dominance', 'cycle', 'policy', 'chart', 'alerts'
        ]
        
        missing = []
        for field in prior_fields:
            if field not in data:
                missing.append(field)
        
        if missing:
            print(f"❌ FAILED: Missing prior fields: {missing}")
            return False
        
        print(f"✓ All {len(prior_fields)} prior fields present")
        
        # Validate forecasts (3 items)
        forecasts = data['forecasts']
        if len(forecasts) != 3:
            print(f"❌ FAILED: forecasts has {len(forecasts)} items, expected 3")
            return False
        print(f"✓ forecasts has 3 items")
        
        # Validate long_outlook (3 items)
        long_outlook = data['long_outlook']
        if len(long_outlook) != 3:
            print(f"❌ FAILED: long_outlook has {len(long_outlook)} items, expected 3")
            return False
        print(f"✓ long_outlook has 3 items")
        
        # Test GET /api/v1/scorecard
        url2 = f"{BASE_URL}/api/v1/scorecard"
        print(f"\nTest 3.2: GET {url2}")
        resp2 = requests.get(url2, timeout=30)
        
        if resp2.status_code != 200:
            print(f"❌ FAILED: HTTP {resp2.status_code}")
            return False
        
        scorecard = resp2.json()
        
        if scorecard.get('status') != 'ready':
            print(f"❌ FAILED: scorecard status='{scorecard.get('status')}' != 'ready'")
            return False
        print(f"✓ scorecard status='ready'")
        
        # Test GET /api/v1/health
        url3 = f"{BASE_URL}/api/v1/health"
        print(f"\nTest 3.3: GET {url3}")
        resp3 = requests.get(url3, timeout=30)
        
        if resp3.status_code != 200:
            print(f"❌ FAILED: HTTP {resp3.status_code}")
            return False
        
        health = resp3.json()
        
        if 'compute_status' not in health:
            print(f"❌ FAILED: health missing 'compute_status'")
            return False
        
        if 'runs' not in health or not isinstance(health['runs'], int) or health['runs'] <= 0:
            print(f"❌ FAILED: health.runs={health.get('runs')} invalid")
            return False
        
        print(f"✓ health returns compute_status='{health['compute_status']}', runs={health['runs']}")
        
        # Test GET /api/v1/ticker
        url4 = f"{BASE_URL}/api/v1/ticker"
        print(f"\nTest 3.4: GET {url4}")
        resp4 = requests.get(url4, timeout=30)
        
        if resp4.status_code != 200:
            print(f"❌ FAILED: HTTP {resp4.status_code}")
            return False
        
        ticker = resp4.json()
        
        ticker_fields = ['price', 'price_aud']
        for field in ticker_fields:
            if field not in ticker:
                print(f"❌ FAILED: ticker missing '{field}'")
                return False
            if not isinstance(ticker[field], (int, float)) or ticker[field] <= 0:
                print(f"❌ FAILED: ticker.{field}={ticker[field]} invalid")
                return False
        
        print(f"✓ ticker returns price=${ticker['price']:,.2f}, price_aud=${ticker['price_aud']:,.2f}")
        
        print(f"\n✅ TEST 3 PASSED - All prior endpoints working correctly")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    print("\n" + "="*80)
    print("BitMarkAI ENGINE CERTIFICATION TEST")
    print("Testing via external URL: " + BASE_URL)
    print("="*80)
    
    results = {}
    
    # Run all tests
    results['test_1_bitmark_dashboard'] = test_bitmark_dashboard()
    results['test_2_bitmark_run'] = test_bitmark_run()
    results['test_3_regression'] = test_regression()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    for test_name, passed in results.items():
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{test_name}: {status}")
    
    all_passed = all(results.values())
    
    print("\n" + "="*80)
    if all_passed:
        print("✅ ALL TESTS PASSED - BitMarkAI ENGINE CERTIFIED")
    else:
        print("❌ SOME TESTS FAILED")
    print("="*80)
    
    return 0 if all_passed else 1


if __name__ == '__main__':
    sys.exit(main())
