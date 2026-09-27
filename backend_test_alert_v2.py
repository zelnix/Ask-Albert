#!/usr/bin/env python3
"""
Backend Test for Alert Engine v2
Tests NEW Alert Engine v2 additions: backtest, digest, BTC relative-strength filter, 
correlation cap, perishability, look-ahead fix.
"""
import requests
import json
import time
import sys

# Base URL from .env
BASE_URL = "https://what-if-sandbox.preview.emergentagent.com/api"

# Timeout for backtest endpoints (can take 30-60s per request due to real ccxt data)
BACKTEST_TIMEOUT = 60

# Default timeout for other endpoints
DEFAULT_TIMEOUT = 30

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

def test_step_1_get_config_v2():
    """
    STEP 1: GET /api/v1/alert-engine/config
    Expect 200 JSON with NEW v2 fields:
    - settings.filters.btc_rs exists (true)
    - settings.corr_cap (3)
    - settings.expiry_candles (2)
    - settings.friction_bps (10)
    """
    print_test("STEP 1: GET /api/v1/alert-engine/config (v2 fields)")
    
    try:
        url = f"{BASE_URL}/v1/alert-engine/config"
        print_info(f"GET {url}")
        
        response = requests.get(url, timeout=DEFAULT_TIMEOUT)
        print_info(f"Status Code: {response.status_code}")
        
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
        
        # Check settings structure
        settings = data.get('settings', {})
        if not isinstance(settings, dict):
            print_fail(f"Expected settings to be a dict, got {type(settings)}")
            return False
        
        # Check NEW v2 field: settings.filters.btc_rs
        filters = settings.get('filters', {})
        if 'btc_rs' not in filters:
            print_fail("Missing settings.filters.btc_rs (NEW v2 field)")
            return False
        btc_rs = filters['btc_rs']
        if btc_rs is not True:
            print_fail(f"Expected settings.filters.btc_rs=true, got {btc_rs}")
            return False
        print_pass(f"settings.filters.btc_rs = {btc_rs} (NEW v2 field)")
        
        # Check NEW v2 field: settings.corr_cap
        if 'corr_cap' not in settings:
            print_fail("Missing settings.corr_cap (NEW v2 field)")
            return False
        corr_cap = settings['corr_cap']
        if corr_cap != 3:
            print_fail(f"Expected settings.corr_cap=3, got {corr_cap}")
            return False
        print_pass(f"settings.corr_cap = {corr_cap} (NEW v2 field)")
        
        # Check NEW v2 field: settings.expiry_candles
        if 'expiry_candles' not in settings:
            print_fail("Missing settings.expiry_candles (NEW v2 field)")
            return False
        expiry_candles = settings['expiry_candles']
        if expiry_candles != 2:
            print_fail(f"Expected settings.expiry_candles=2, got {expiry_candles}")
            return False
        print_pass(f"settings.expiry_candles = {expiry_candles} (NEW v2 field)")
        
        # Check NEW v2 field: settings.friction_bps
        if 'friction_bps' not in settings:
            print_fail("Missing settings.friction_bps (NEW v2 field)")
            return False
        friction_bps = settings['friction_bps']
        if friction_bps != 10:
            print_fail(f"Expected settings.friction_bps=10, got {friction_bps}")
            return False
        print_pass(f"settings.friction_bps = {friction_bps} (NEW v2 field)")
        
        print_pass("STEP 1 PASSED - GET config returns all NEW v2 fields")
        return True
        
    except Exception as e:
        print_fail(f"Exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_step_2_get_backtest_btc():
    """
    STEP 2: GET /api/v1/alert-engine/backtest?symbol=BTC
    Expect 200 {status:'ready', candles, from, to, detectors:{gmma_crossover, dip_buy, 
    squeeze, rsi_oversold, rsi_overbought}}
    Assert candles > 300 (ideally ~700)
    Assert each detector object has 'triggers' plus win_5/avg_5/win_10/avg_10 keys
    """
    print_test("STEP 2: GET /api/v1/alert-engine/backtest?symbol=BTC")
    
    try:
        url = f"{BASE_URL}/v1/alert-engine/backtest?symbol=BTC"
        print_info(f"GET {url}")
        print_info(f"⏱️  WARNING: This can take 30-60s (fetching real OHLCV via ccxt)...")
        
        start_time = time.time()
        response = requests.get(url, timeout=BACKTEST_TIMEOUT)
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
        
        # Check candles count
        candles = data.get('candles')
        if not isinstance(candles, int):
            print_fail(f"Expected candles to be an int, got {type(candles)}")
            return False
        if candles <= 300:
            print_fail(f"Expected candles > 300, got {candles}")
            return False
        print_pass(f"candles = {candles} (> 300, ideally ~700)")
        
        # Check from/to dates
        from_date = data.get('from')
        to_date = data.get('to')
        if not from_date or not to_date:
            print_fail(f"Missing from/to dates: from={from_date}, to={to_date}")
            return False
        print_pass(f"from = {from_date}, to = {to_date}")
        
        # Check detectors
        detectors = data.get('detectors', {})
        if not isinstance(detectors, dict):
            print_fail(f"Expected detectors to be a dict, got {type(detectors)}")
            return False
        
        required_detectors = ['gmma_crossover', 'dip_buy', 'squeeze', 'rsi_oversold', 'rsi_overbought']
        for detector_name in required_detectors:
            if detector_name not in detectors:
                print_fail(f"Missing detector: {detector_name}")
                return False
            
            detector = detectors[detector_name]
            if not isinstance(detector, dict):
                print_fail(f"Expected detector {detector_name} to be a dict, got {type(detector)}")
                return False
            
            # Check required keys
            required_keys = ['triggers', 'win_5', 'avg_5', 'win_10', 'avg_10']
            for key in required_keys:
                if key not in detector:
                    print_fail(f"Detector {detector_name} missing key: {key}")
                    return False
            
            # Values may be numbers or null
            print_pass(f"Detector {detector_name}: triggers={detector['triggers']}, win_5={detector['win_5']}, avg_5={detector['avg_5']}, win_10={detector['win_10']}, avg_10={detector['avg_10']}")
        
        print_pass("STEP 2 PASSED - GET backtest BTC returns valid structure with all detectors")
        return True
        
    except requests.exceptions.Timeout:
        print_fail(f"Request timed out after {BACKTEST_TIMEOUT}s")
        return False
    except Exception as e:
        print_fail(f"Exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_step_3_get_backtest_sol():
    """
    STEP 3: GET /api/v1/alert-engine/backtest?symbol=SOL
    Expect 200 with status:'ready' and detectors present
    """
    print_test("STEP 3: GET /api/v1/alert-engine/backtest?symbol=SOL")
    
    try:
        url = f"{BASE_URL}/v1/alert-engine/backtest?symbol=SOL"
        print_info(f"GET {url}")
        print_info(f"⏱️  WARNING: This can take 30-60s (fetching real OHLCV via ccxt)...")
        
        start_time = time.time()
        response = requests.get(url, timeout=BACKTEST_TIMEOUT)
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
        print_pass("status='ready'")
        
        # Check detectors present
        detectors = data.get('detectors', {})
        if not isinstance(detectors, dict):
            print_fail(f"Expected detectors to be a dict, got {type(detectors)}")
            return False
        
        if len(detectors) == 0:
            print_fail("Expected detectors to be non-empty")
            return False
        
        print_pass(f"detectors present with {len(detectors)} items")
        
        print_pass("STEP 3 PASSED - GET backtest SOL returns valid structure")
        return True
        
    except requests.exceptions.Timeout:
        print_fail(f"Request timed out after {BACKTEST_TIMEOUT}s")
        return False
    except Exception as e:
        print_fail(f"Exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_step_4_get_readings_eth_btc_rs():
    """
    STEP 4: GET /api/v1/alert-engine/readings?symbol=ETH
    Expect 200; assert filters includes keys 'btc_rs' (number or null) and 
    'btc_rs_suppress_long' (boolean)
    """
    print_test("STEP 4: GET /api/v1/alert-engine/readings?symbol=ETH (btc_rs filter)")
    
    try:
        url = f"{BASE_URL}/v1/alert-engine/readings?symbol=ETH"
        print_info(f"GET {url}")
        print_info(f"⏱️  WARNING: This can take 30-60s (fetching real OHLCV via ccxt)...")
        
        start_time = time.time()
        response = requests.get(url, timeout=BACKTEST_TIMEOUT)
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
        print_pass("status='ready'")
        
        # Check filters
        filters = data.get('filters', {})
        if not isinstance(filters, dict):
            print_fail(f"Expected filters to be a dict, got {type(filters)}")
            return False
        
        # Check NEW v2 field: filters.btc_rs (number or null)
        if 'btc_rs' not in filters:
            print_fail("Missing filters.btc_rs (NEW v2 field)")
            return False
        btc_rs = filters['btc_rs']
        if btc_rs is not None and not isinstance(btc_rs, (int, float)):
            print_fail(f"Expected filters.btc_rs to be number or null, got {type(btc_rs)}: {btc_rs}")
            return False
        print_pass(f"filters.btc_rs = {btc_rs} (number or null, NEW v2 field)")
        
        # Check NEW v2 field: filters.btc_rs_suppress_long (boolean)
        if 'btc_rs_suppress_long' not in filters:
            print_fail("Missing filters.btc_rs_suppress_long (NEW v2 field)")
            return False
        btc_rs_suppress_long = filters['btc_rs_suppress_long']
        if not isinstance(btc_rs_suppress_long, bool):
            print_fail(f"Expected filters.btc_rs_suppress_long to be boolean, got {type(btc_rs_suppress_long)}: {btc_rs_suppress_long}")
            return False
        print_pass(f"filters.btc_rs_suppress_long = {btc_rs_suppress_long} (boolean, NEW v2 field)")
        
        print_pass("STEP 4 PASSED - GET readings ETH returns NEW v2 btc_rs filter fields")
        return True
        
    except requests.exceptions.Timeout:
        print_fail(f"Request timed out after {BACKTEST_TIMEOUT}s")
        return False
    except Exception as e:
        print_fail(f"Exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_step_5_get_digest():
    """
    STEP 5: GET /api/v1/alert-engine/digest
    Expect 200 {status:'ready', count, coins, by_coin, alerts}
    count may be 0 (acceptable)
    """
    print_test("STEP 5: GET /api/v1/alert-engine/digest")
    
    try:
        url = f"{BASE_URL}/v1/alert-engine/digest"
        print_info(f"GET {url}")
        
        response = requests.get(url, timeout=DEFAULT_TIMEOUT)
        print_info(f"Status Code: {response.status_code}")
        
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
        
        # Check count (may be 0)
        count = data.get('count')
        if not isinstance(count, int):
            print_fail(f"Expected count to be an int, got {type(count)}")
            return False
        print_pass(f"count = {count} (may be 0, acceptable)")
        
        # Check coins
        coins = data.get('coins')
        if not isinstance(coins, int):
            print_fail(f"Expected coins to be an int, got {type(coins)}")
            return False
        print_pass(f"coins = {coins}")
        
        # Check by_coin
        by_coin = data.get('by_coin')
        if not isinstance(by_coin, dict):
            print_fail(f"Expected by_coin to be a dict, got {type(by_coin)}")
            return False
        print_pass(f"by_coin is a dict with {len(by_coin)} items")
        
        # Check alerts
        alerts = data.get('alerts')
        if not isinstance(alerts, list):
            print_fail(f"Expected alerts to be a list, got {type(alerts)}")
            return False
        print_pass(f"alerts is a list with {len(alerts)} items")
        
        print_pass("STEP 5 PASSED - GET digest returns valid structure")
        return True
        
    except Exception as e:
        print_fail(f"Exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_step_6_post_config_modify():
    """
    STEP 6: POST /api/v1/alert-engine/config with {"settings":{"corr_cap":5}}
    Expect 200; GET and confirm corr_cap==5
    """
    print_test("STEP 6: POST /api/v1/alert-engine/config (modify corr_cap)")
    
    try:
        url = f"{BASE_URL}/v1/alert-engine/config"
        payload = {
            "settings": {
                "corr_cap": 5
            }
        }
        
        print_info(f"POST {url}")
        print_info(f"Payload: {json.dumps(payload, indent=2)}")
        
        response = requests.post(url, json=payload, timeout=DEFAULT_TIMEOUT)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_fail(f"Expected status 200, got {response.status_code}")
            print_info(f"Response: {response.text[:500]}")
            return False
        
        print_pass("POST returned 200")
        
        # Now GET to verify persistence
        print_info("Verifying persistence with GET...")
        get_response = requests.get(url, timeout=DEFAULT_TIMEOUT)
        
        if get_response.status_code != 200:
            print_fail(f"GET after POST failed with status {get_response.status_code}")
            return False
        
        get_data = get_response.json()
        settings = get_data.get('settings', {})
        
        # Check corr_cap is 5
        corr_cap = settings.get('corr_cap')
        if corr_cap != 5:
            print_fail(f"Expected settings.corr_cap=5, got {corr_cap}")
            return False
        print_pass(f"settings.corr_cap = {corr_cap} (persisted)")
        
        print_pass("STEP 6 PASSED - POST config modifies corr_cap and persists")
        return True
        
    except Exception as e:
        print_fail(f"Exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_cleanup_reset_config():
    """
    CLEANUP (REQUIRED): POST /api/v1/alert-engine/config to reset defaults
    Reset to: enabled:true, all signals on, all filters on (including btc_rs:true), 
    corr_cap:3, expiry_candles:2, friction_bps:10, watchlist all 20 coins
    """
    print_test("CLEANUP: Reset config to defaults")
    
    try:
        url = f"{BASE_URL}/v1/alert-engine/config"
        
        # Default settings from backend code (including NEW v2 fields)
        payload = {
            "settings": {
                "enabled": True,
                "signals": {
                    "gmma_crossover": True,
                    "dip_buy": True,
                    "squeeze": True,
                    "rsi_exhaustion": True
                },
                "filters": {
                    "volume": True,
                    "funding": True,
                    "netflow": True,
                    "fng": True,
                    "btc_rs": True
                },
                "volume_mult": 1.5,
                "rsi_low": 30,
                "rsi_high": 80,
                "funding_threshold": 0.05,
                "greed_threshold": 78,
                "fear_threshold": 22,
                "corr_cap": 3,
                "expiry_candles": 2,
                "friction_bps": 10,
                "watchlist": ["BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "AVAX", "LINK", 
                             "DOT", "LTC", "MATIC", "ATOM", "BCH", "XLM", "ETC", "UNI", 
                             "AAVE", "FIL", "NEAR", "APT"]
            }
        }
        
        print_info(f"POST {url}")
        print_info(f"Resetting to defaults (including NEW v2 fields)...")
        
        response = requests.post(url, json=payload, timeout=DEFAULT_TIMEOUT)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_fail(f"Expected status 200, got {response.status_code}")
            print_info(f"Response: {response.text[:500]}")
            return False
        
        print_pass("POST returned 200")
        
        # Verify with GET
        print_info("Verifying reset with GET...")
        get_response = requests.get(url, timeout=DEFAULT_TIMEOUT)
        
        if get_response.status_code != 200:
            print_fail(f"GET after reset failed with status {get_response.status_code}")
            return False
        
        get_data = get_response.json()
        settings = get_data.get('settings', {})
        
        # Check corr_cap is 3
        corr_cap = settings.get('corr_cap')
        if corr_cap != 3:
            print_fail(f"Expected settings.corr_cap=3 after reset, got {corr_cap}")
            return False
        print_pass(f"settings.corr_cap = {corr_cap} (reset confirmed)")
        
        # Check expiry_candles is 2
        expiry_candles = settings.get('expiry_candles')
        if expiry_candles != 2:
            print_fail(f"Expected settings.expiry_candles=2 after reset, got {expiry_candles}")
            return False
        print_pass(f"settings.expiry_candles = {expiry_candles} (reset confirmed)")
        
        # Check friction_bps is 10
        friction_bps = settings.get('friction_bps')
        if friction_bps != 10:
            print_fail(f"Expected settings.friction_bps=10 after reset, got {friction_bps}")
            return False
        print_pass(f"settings.friction_bps = {friction_bps} (reset confirmed)")
        
        # Check btc_rs filter is True
        btc_rs = settings.get('filters', {}).get('btc_rs')
        if btc_rs is not True:
            print_fail(f"Expected settings.filters.btc_rs=true after reset, got {btc_rs}")
            return False
        print_pass(f"settings.filters.btc_rs = {btc_rs} (reset confirmed)")
        
        print_pass("CLEANUP PASSED - Config reset to defaults (including NEW v2 fields)")
        return True
        
    except Exception as e:
        print_fail(f"Exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    print("\n" + "="*80)
    print("ALERT ENGINE V2 BACKEND TEST")
    print("Testing NEW Alert Engine v2 additions: backtest, digest, btc_rs filter, etc.")
    print("="*80)
    
    results = []
    
    # Run all tests
    results.append(("STEP 1: GET config (v2 fields)", test_step_1_get_config_v2()))
    results.append(("STEP 2: GET backtest BTC", test_step_2_get_backtest_btc()))
    results.append(("STEP 3: GET backtest SOL", test_step_3_get_backtest_sol()))
    results.append(("STEP 4: GET readings ETH (btc_rs)", test_step_4_get_readings_eth_btc_rs()))
    results.append(("STEP 5: GET digest", test_step_5_get_digest()))
    results.append(("STEP 6: POST config (modify corr_cap)", test_step_6_post_config_modify()))
    results.append(("CLEANUP: Reset config", test_cleanup_reset_config()))
    
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
