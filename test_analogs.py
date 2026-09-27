#!/usr/bin/env python3
"""
Backend API Test Suite - Happening Again Historical-Analog Engine
Tests the new historical-analog engine for Bitcoin
"""
import requests
import time
import sys

BASE_URL = "https://what-if-sandbox.preview.emergentagent.com/api/v1"

def test_analogs_endpoint(max_wait=90):
    """Test 1: GET /api/v1/analogs - poll until ready, validate structure"""
    print("\n" + "="*80)
    print("TEST 1: GET /api/v1/analogs - Historical Analog Engine")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/analogs"
        print(f"GET {url}")
        
        start_time = time.time()
        attempts = 0
        
        while time.time() - start_time < max_wait:
            attempts += 1
            resp = requests.get(url, timeout=30)
            elapsed = time.time() - start_time
            print(f"\nAttempt {attempts} - Status: {resp.status_code} (elapsed: {elapsed:.1f}s)")
            
            if resp.status_code != 200:
                print(f"❌ FAILED: Expected 200, got {resp.status_code}")
                return False
            
            data = resp.json()
            status = data.get('status')
            print(f"Response status: {status}")
            
            if status == 'computing':
                print(f"⏳ Computing... (elapsed: {elapsed:.1f}s / {max_wait}s)")
                time.sleep(5)
                continue
            
            if status == 'error':
                print(f"❌ FAILED: Status is 'error'")
                print(f"Error details: {data.get('error')}")
                return False
            
            if status == 'ready':
                print(f"✅ Status changed to 'ready' after {elapsed:.1f}s")
                
                # Validate 'current' fingerprint
                current = data.get('current')
                if not current or not isinstance(current, dict):
                    print(f"❌ FAILED: 'current' should be a dict, got {type(current)}")
                    return False
                
                print(f"\n✅ 'current' fingerprint present")
                
                # Check exactly 8 keys
                expected_keys = ['rates_dir', 'dxy_dir', 'nasdaq_corr', 'gold_corr', 
                                'vol_regime', 'drawdown', 'momentum', 'cycle']
                current_keys = set(current.keys())
                if current_keys != set(expected_keys):
                    print(f"❌ FAILED: 'current' should have exactly these 8 keys: {expected_keys}")
                    print(f"   Got: {list(current_keys)}")
                    return False
                
                print(f"✅ 'current' has exactly 8 keys: {list(current.keys())}")
                
                # Print current values for eyeballing
                print(f"\n📊 Current fingerprint values:")
                for key in expected_keys:
                    val = current[key]
                    print(f"   {key}: {val}")
                
                # Validate value ranges
                momentum = current.get('momentum')
                if momentum is None or not isinstance(momentum, (int, float)):
                    print(f"❌ FAILED: momentum should be a number, got {momentum}")
                    return False
                
                if not (-95 <= momentum <= 400):
                    print(f"❌ FAILED: momentum should be between -95 and +400, got {momentum}")
                    print(f"   REGRESSION CHECK: Earlier bug produced momentum ~1465 (monthly data bug)")
                    return False
                
                print(f"✅ momentum = {momentum} (valid range -95 to +400)")
                
                nasdaq_corr = current.get('nasdaq_corr')
                if nasdaq_corr is not None and not (-1 <= nasdaq_corr <= 1):
                    print(f"❌ FAILED: nasdaq_corr should be between -1 and 1, got {nasdaq_corr}")
                    return False
                print(f"✅ nasdaq_corr = {nasdaq_corr} (valid range -1 to 1)")
                
                gold_corr = current.get('gold_corr')
                if gold_corr is not None and not (-1 <= gold_corr <= 1):
                    print(f"❌ FAILED: gold_corr should be between -1 and 1, got {gold_corr}")
                    return False
                print(f"✅ gold_corr = {gold_corr} (valid range -1 to 1)")
                
                drawdown = current.get('drawdown')
                if drawdown is not None and not (-100 <= drawdown <= 5):
                    print(f"❌ FAILED: drawdown should be between -100 and 5, got {drawdown}")
                    return False
                print(f"✅ drawdown = {drawdown} (valid range -100 to 5)")
                
                cycle = current.get('cycle')
                if cycle is not None and not (0 <= cycle <= 60):
                    print(f"❌ FAILED: cycle should be between 0 and 60, got {cycle}")
                    return False
                print(f"✅ cycle = {cycle} (valid range 0 to 60)")
                
                # Validate 'signals'
                signals = data.get('signals')
                if not signals or not isinstance(signals, list):
                    print(f"❌ FAILED: 'signals' should be a list, got {type(signals)}")
                    return False
                
                if len(signals) != 8:
                    print(f"❌ FAILED: 'signals' should have 8 items, got {len(signals)}")
                    return False
                
                print(f"\n✅ 'signals' is a list of 8 items")
                
                # Check each signal has key, label, cat
                for i, sig in enumerate(signals):
                    if not isinstance(sig, dict):
                        print(f"❌ FAILED: signals[{i}] should be a dict, got {type(sig)}")
                        return False
                    if 'key' not in sig or 'label' not in sig or 'cat' not in sig:
                        print(f"❌ FAILED: signals[{i}] missing required fields (key, label, cat)")
                        print(f"   Got: {sig}")
                        return False
                
                print(f"✅ All signals have required fields (key, label, cat)")
                
                # Validate 'norm'
                norm = data.get('norm')
                if not norm or not isinstance(norm, dict):
                    print(f"❌ FAILED: 'norm' should be a dict, got {type(norm)}")
                    return False
                
                print(f"\n✅ 'norm' is a dict with {len(norm)} keys")
                
                # Check norm has std per signal
                for key in expected_keys:
                    if key not in norm:
                        print(f"❌ FAILED: 'norm' missing key '{key}'")
                        return False
                    if 'std' not in norm[key]:
                        print(f"❌ FAILED: norm['{key}'] missing 'std' field")
                        return False
                
                print(f"✅ 'norm' has std for all 8 signals")
                
                # Validate 'episodes'
                episodes = data.get('episodes')
                if not episodes or not isinstance(episodes, list):
                    print(f"❌ FAILED: 'episodes' should be a non-empty list, got {type(episodes)}")
                    return False
                
                if len(episodes) == 0:
                    print(f"❌ FAILED: 'episodes' should be non-empty")
                    return False
                
                print(f"\n✅ 'episodes' is a non-empty list with {len(episodes)} items")
                
                # Validate episode_count
                episode_count = data.get('episode_count')
                if episode_count != len(episodes):
                    print(f"❌ FAILED: episode_count ({episode_count}) != len(episodes) ({len(episodes)})")
                    return False
                
                print(f"✅ episode_count = {episode_count} (matches len(episodes))")
                
                # Check first episode structure
                ep = episodes[0]
                required_ep_fields = ['label', 'type', 'start', 'end', 'move_pct', 
                                     'duration_days', 'fingerprint', 'match', 
                                     'fwd_30', 'fwd_90', 'fwd_180', 'tags']
                
                for field in required_ep_fields:
                    if field not in ep:
                        print(f"❌ FAILED: episodes[0] missing field '{field}'")
                        return False
                
                print(f"✅ episodes[0] has all required fields")
                
                # Check episode type
                if ep['type'] not in ['rally', 'drawdown']:
                    print(f"❌ FAILED: episodes[0]['type'] should be 'rally' or 'drawdown', got '{ep['type']}'")
                    return False
                
                print(f"✅ episodes[0]['type'] = '{ep['type']}' (valid)")
                
                # Check fingerprint has 8 keys
                fp = ep['fingerprint']
                if not isinstance(fp, dict) or set(fp.keys()) != set(expected_keys):
                    print(f"❌ FAILED: episodes[0]['fingerprint'] should have 8 keys")
                    return False
                
                print(f"✅ episodes[0]['fingerprint'] has 8 keys")
                
                # Check match is 0-100
                match = ep['match']
                if not isinstance(match, (int, float)) or not (0 <= match <= 100):
                    print(f"❌ FAILED: episodes[0]['match'] should be 0-100, got {match}")
                    return False
                
                print(f"✅ episodes[0]['match'] = {match} (valid range 0-100)")
                
                # Check tags is a list
                if not isinstance(ep['tags'], list):
                    print(f"❌ FAILED: episodes[0]['tags'] should be a list, got {type(ep['tags'])}")
                    return False
                
                print(f"✅ episodes[0]['tags'] is a list with {len(ep['tags'])} items")
                
                # Check episodes are sorted by match descending
                matches = [e['match'] for e in episodes]
                if matches != sorted(matches, reverse=True):
                    print(f"❌ FAILED: episodes should be sorted by match descending")
                    print(f"   First 5 matches: {matches[:5]}")
                    return False
                
                print(f"✅ episodes sorted by match descending (first: {matches[0]}, last: {matches[-1]})")
                
                print("\n✅ TEST 1 PASSED: /api/v1/analogs endpoint fully validated")
                return True
            
            print(f"⚠️ Unexpected status: {status}")
            time.sleep(5)
        
        print(f"❌ FAILED: Timeout after {max_wait}s waiting for status='ready'")
        return False
        
    except Exception as e:
        print(f"❌ FAILED: Exception occurred: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_albert_insight_analogs():
    """Test 2: GET /api/v1/albert/insight?section=analogs&mode=plain&symbol=BTC"""
    print("\n" + "="*80)
    print("TEST 2: GET /api/v1/albert/insight?section=analogs")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/albert/insight?section=analogs&mode=plain&symbol=BTC"
        print(f"GET {url}")
        
        resp = requests.get(url, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        status = data.get('status')
        print(f"Response status: {status}")
        
        if status == 'fallback':
            print(f"⚠️ SOFT WARNING: Status is 'fallback' (LLM may be unconfigured or rate-limited)")
            print(f"   Reason: {data.get('reason')}")
            print(f"   This is acceptable per requirements (not a hard fail)")
            print("\n✅ TEST 2 PASSED (with soft warning): Albert insight fallback handled gracefully")
            return True
        
        if status != 'ready':
            print(f"❌ FAILED: Expected status='ready' or 'fallback', got '{status}'")
            return False
        
        print(f"✅ Status is 'ready'")
        
        # Check text field
        text = data.get('text')
        if not text or not isinstance(text, str):
            print(f"❌ FAILED: 'text' should be a non-empty string, got {type(text)}")
            return False
        
        if len(text) == 0:
            print(f"❌ FAILED: 'text' should be non-empty")
            return False
        
        print(f"✅ 'text' is a non-empty string ({len(text)} chars)")
        print(f"\n📝 Insight text preview (first 200 chars):")
        print(f"   {text[:200]}...")
        
        # Check if text references a historical period/analog
        # Look for year patterns (e.g., "2020", "2021") or words like "similar", "analog", "episode"
        has_historical_ref = any(word in text.lower() for word in 
                                ['2020', '2021', '2022', '2023', '2024', 
                                 'similar', 'analog', 'episode', 'past', 'historical'])
        
        if has_historical_ref:
            print(f"✅ Text appears to reference historical period/analog")
        else:
            print(f"⚠️ SOFT WARNING: Text may not reference historical analog (but not a hard fail)")
        
        print("\n✅ TEST 2 PASSED: Albert insight for analogs section working")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception occurred: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_dashboard_regression():
    """Test 3: GET /api/v1/dashboard - regression check (ensure new code didn't break main pipeline)"""
    print("\n" + "="*80)
    print("TEST 3: GET /api/v1/dashboard - Regression Check")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/dashboard"
        print(f"GET {url}")
        
        resp = requests.get(url, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        status = data.get('status')
        print(f"Response status: {status}")
        
        if status != 'ready':
            print(f"❌ FAILED: Expected status='ready', got '{status}'")
            return False
        
        print(f"✅ Status is 'ready'")
        
        # Check key fields still present
        required_fields = ['signal', 'confidence', 'last_close', 'quant_score', 
                          'regime', 'forecasts', 'decision']
        
        for field in required_fields:
            if field not in data:
                print(f"❌ FAILED: Missing required field '{field}'")
                return False
        
        print(f"✅ All required fields present")
        
        # Check signal
        signal = data.get('signal')
        if signal not in ['UP', 'DOWN']:
            print(f"❌ FAILED: signal should be 'UP' or 'DOWN', got '{signal}'")
            return False
        
        print(f"✅ signal = '{signal}' (valid)")
        
        # Check last_close
        last_close = data.get('last_close')
        if not isinstance(last_close, (int, float)) or last_close <= 0:
            print(f"❌ FAILED: last_close should be a number > 0, got {last_close}")
            return False
        
        print(f"✅ last_close = ${last_close:,.2f} (valid)")
        
        print("\n✅ TEST 3 PASSED: Dashboard regression check successful")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception occurred: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    print("\n" + "="*80)
    print("BACKEND API TEST SUITE - HAPPENING AGAIN HISTORICAL-ANALOG ENGINE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Testing new historical-analog engine for Bitcoin")
    print("="*80)
    
    results = {}
    
    # Test 1: Analogs endpoint
    results['Analogs Endpoint'] = test_analogs_endpoint(max_wait=90)
    
    # Test 2: Albert insight for analogs
    results['Albert Insight (Analogs)'] = test_albert_insight_analogs()
    
    # Test 3: Dashboard regression
    results['Dashboard Regression'] = test_dashboard_regression()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    for test_name, passed in results.items():
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{status}: {test_name}")
    
    all_passed = all(results.values())
    
    print("\n" + "="*80)
    if all_passed:
        print("✅ ALL TESTS PASSED")
    else:
        print("❌ SOME TESTS FAILED")
    print("="*80)
    
    return 0 if all_passed else 1


if __name__ == '__main__':
    sys.exit(main())
