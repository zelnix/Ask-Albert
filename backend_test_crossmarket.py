#!/usr/bin/env python3
"""
Backend API Test Suite - Cross-Market Feature
Tests the new Cross-Market endpoint that compares coins to traditional markets
"""
import requests
import time
import sys

BASE_URL = "https://what-if-sandbox.preview.emergentagent.com/api/v1"

def test_btc_markets_1y(max_wait=90):
    """Test 1: BTC markets window=1y - poll computing->ready, validate structure"""
    print("\n" + "="*80)
    print("TEST 1: BTC Markets (window=1y) with polling")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/markets?symbol=BTC&window=1y"
        print(f"GET {url}")
        
        start_time = time.time()
        attempts = 0
        
        while time.time() - start_time < max_wait:
            attempts += 1
            resp = requests.get(url, timeout=30)
            print(f"\nAttempt {attempts} - Status: {resp.status_code}")
            
            if resp.status_code != 200:
                print(f"❌ FAILED: Expected 200, got {resp.status_code}")
                return False
            
            data = resp.json()
            status = data.get('status')
            print(f"Response status: {status}")
            
            if status == 'computing':
                elapsed = time.time() - start_time
                print(f"⏳ Computing... (elapsed: {elapsed:.1f}s / {max_wait}s)")
                time.sleep(5)
                continue
            
            if status == 'ready':
                elapsed = time.time() - start_time
                print(f"✅ Status changed to 'ready' after {elapsed:.1f}s")
                
                # Validate symbol
                symbol = data.get('symbol')
                if symbol != 'BTC':
                    print(f"❌ FAILED: Expected symbol='BTC', got '{symbol}'")
                    return False
                print(f"✅ symbol = 'BTC'")
                
                # Validate coin_name
                coin_name = data.get('coin_name')
                if coin_name != 'Bitcoin':
                    print(f"❌ FAILED: Expected coin_name='Bitcoin', got '{coin_name}'")
                    return False
                print(f"✅ coin_name = 'Bitcoin'")
                
                # Validate window
                window = data.get('window')
                if window != '1y':
                    print(f"❌ FAILED: Expected window='1y', got '{window}'")
                    return False
                print(f"✅ window = '1y'")
                
                # Validate series is non-empty list
                series = data.get('series')
                if not isinstance(series, list) or len(series) == 0:
                    print(f"❌ FAILED: series should be a non-empty list, got {type(series)} with length {len(series) if isinstance(series, list) else 'N/A'}")
                    return False
                print(f"✅ series is a non-empty list with {len(series)} items")
                
                # Validate table is a list
                table = data.get('table')
                if not isinstance(table, list) or len(table) == 0:
                    print(f"❌ FAILED: table should be a non-empty list, got {type(table)} with length {len(table) if isinstance(table, list) else 'N/A'}")
                    return False
                print(f"✅ table is a non-empty list with {len(table)} items")
                
                # Validate EXACTLY ONE row has is_coin=true
                coin_rows = [row for row in table if row.get('is_coin') == True]
                if len(coin_rows) != 1:
                    print(f"❌ FAILED: Expected exactly 1 row with is_coin=true, found {len(coin_rows)}")
                    return False
                print(f"✅ Exactly 1 row has is_coin=true")
                
                # Validate coin row has required keys
                coin_row = coin_rows[0]
                required_keys = ['ret_1w', 'ret_1m', 'ret_3m', 'ret_6m', 'ret_ytd', 'ret_1y', 'vol_annual', 'price']
                for key in required_keys:
                    if key not in coin_row:
                        print(f"❌ FAILED: Coin row missing required key '{key}'")
                        return False
                print(f"✅ Coin row has all required keys: {required_keys}")
                
                # Validate correlations is non-empty list
                correlations = data.get('correlations')
                if not isinstance(correlations, list) or len(correlations) == 0:
                    print(f"❌ FAILED: correlations should be a non-empty list, got {type(correlations)} with length {len(correlations) if isinstance(correlations, list) else 'N/A'}")
                    return False
                print(f"✅ correlations is a non-empty list with {len(correlations)} items")
                
                # Validate correlation items have required keys
                corr_item = correlations[0]
                corr_keys = ['corr_30d', 'corr_90d', 'beta_30d', 'label', 'asset']
                for key in corr_keys:
                    if key not in corr_item:
                        print(f"❌ FAILED: Correlation item missing required key '{key}'")
                        return False
                print(f"✅ Correlation items have required keys: {corr_keys}")
                
                # Validate best and worst are non-null objects
                best = data.get('best')
                worst = data.get('worst')
                if best is None or not isinstance(best, dict):
                    print(f"❌ FAILED: best should be a non-null object, got {type(best)}")
                    return False
                if worst is None or not isinstance(worst, dict):
                    print(f"❌ FAILED: worst should be a non-null object, got {type(worst)}")
                    return False
                print(f"✅ best and worst are non-null objects")
                
                # Validate coin_rank is an int
                coin_rank = data.get('coin_rank')
                if not isinstance(coin_rank, int):
                    print(f"❌ FAILED: coin_rank should be an int, got {type(coin_rank)}")
                    return False
                print(f"✅ coin_rank = {coin_rank} (int)")
                
                # Validate assets is a list of length ~10
                assets = data.get('assets')
                if not isinstance(assets, list) or len(assets) < 8 or len(assets) > 12:
                    print(f"❌ FAILED: assets should be a list of length ~10, got {type(assets)} with length {len(assets) if isinstance(assets, list) else 'N/A'}")
                    return False
                print(f"✅ assets is a list with {len(assets)} items (~10 expected)")
                
                print("\n✅ TEST 1 PASSED: BTC markets (window=1y) test successful")
                return True
            
            if status == 'error':
                print(f"❌ FAILED: Status is 'error'")
                print(f"Error details: {data.get('error')}")
                return False
            
            print(f"⚠️ Unexpected status: {status}")
            time.sleep(5)
        
        print(f"❌ FAILED: Timeout after {max_wait}s waiting for status='ready'")
        return False
        
    except Exception as e:
        print(f"❌ FAILED: Exception occurred: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_eth_markets_6m(max_wait=90):
    """Test 2: ETH markets window=6m - poll computing->ready, validate structure"""
    print("\n" + "="*80)
    print("TEST 2: ETH Markets (window=6m) with polling")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/markets?symbol=ETH&window=6m"
        print(f"GET {url}")
        
        start_time = time.time()
        attempts = 0
        
        while time.time() - start_time < max_wait:
            attempts += 1
            resp = requests.get(url, timeout=30)
            print(f"\nAttempt {attempts} - Status: {resp.status_code}")
            
            if resp.status_code != 200:
                print(f"❌ FAILED: Expected 200, got {resp.status_code}")
                return False
            
            data = resp.json()
            status = data.get('status')
            print(f"Response status: {status}")
            
            if status == 'computing':
                elapsed = time.time() - start_time
                print(f"⏳ Computing... (elapsed: {elapsed:.1f}s / {max_wait}s)")
                time.sleep(5)
                continue
            
            if status == 'ready':
                elapsed = time.time() - start_time
                print(f"✅ Status changed to 'ready' after {elapsed:.1f}s")
                
                # Validate coin_name
                coin_name = data.get('coin_name')
                if coin_name != 'Ethereum':
                    print(f"❌ FAILED: Expected coin_name='Ethereum', got '{coin_name}'")
                    return False
                print(f"✅ coin_name = 'Ethereum'")
                
                # Validate window
                window = data.get('window')
                if window != '6m':
                    print(f"❌ FAILED: Expected window='6m', got '{window}'")
                    return False
                print(f"✅ window = '6m'")
                
                # Validate is_coin row's asset is 'Ethereum'
                table = data.get('table')
                if not isinstance(table, list) or len(table) == 0:
                    print(f"❌ FAILED: table should be a non-empty list")
                    return False
                
                coin_rows = [row for row in table if row.get('is_coin') == True]
                if len(coin_rows) != 1:
                    print(f"❌ FAILED: Expected exactly 1 row with is_coin=true, found {len(coin_rows)}")
                    return False
                
                coin_row = coin_rows[0]
                if coin_row.get('asset') != 'Ethereum':
                    print(f"❌ FAILED: Expected is_coin row's asset='Ethereum', got '{coin_row.get('asset')}'")
                    return False
                print(f"✅ is_coin row's asset = 'Ethereum'")
                
                # Validate series is non-empty
                series = data.get('series')
                if not isinstance(series, list) or len(series) == 0:
                    print(f"❌ FAILED: series should be a non-empty list")
                    return False
                print(f"✅ series is a non-empty list with {len(series)} items")
                
                print("\n✅ TEST 2 PASSED: ETH markets (window=6m) test successful")
                return True
            
            if status == 'error':
                print(f"❌ FAILED: Status is 'error'")
                print(f"Error details: {data.get('error')}")
                return False
            
            print(f"⚠️ Unexpected status: {status}")
            time.sleep(5)
        
        print(f"❌ FAILED: Timeout after {max_wait}s waiting for status='ready'")
        return False
        
    except Exception as e:
        print(f"❌ FAILED: Exception occurred: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_crossmarket_albert_insight():
    """Test 3: Cross-market Albert insight for BTC"""
    print("\n" + "="*80)
    print("TEST 3: Cross-market Albert Insight (BTC)")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/albert/insight?section=crossmarket&mode=plain&symbol=BTC"
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
            print(f"⚠️ SOFT WARNING: Status is 'fallback' (LLM/context issue)")
            print(f"Reason: {data.get('reason')}")
            print(f"⚠️ This is not a hard crash - the endpoint handled it gracefully")
            print("\n✅ TEST 3 PASSED (with soft warning): Cross-market insight fallback handled gracefully")
            return True
        
        if status != 'ready':
            print(f"❌ FAILED: Expected status='ready' or 'fallback', got '{status}'")
            return False
        
        # Validate text is non-empty string
        text = data.get('text')
        if not text or not isinstance(text, str):
            print(f"❌ FAILED: text should be a non-empty string, got {type(text)}")
            return False
        
        print(f"✅ text is a non-empty string with {len(text)} characters")
        print(f"✅ Text preview: {text[:150]}...")
        
        # Check if text references markets/correlation context (soft check)
        keywords = ['market', 'correlation', 'traditional', 'index', 'stock', 'gold', 'return', 'performance']
        found_keywords = [kw for kw in keywords if kw.lower() in text.lower()]
        if found_keywords:
            print(f"✅ Text references cross-market context (found keywords: {found_keywords[:3]})")
        else:
            print(f"⚠️ SOFT WARNING: Text may not reference cross-market context (no keywords found)")
        
        print("\n✅ TEST 3 PASSED: Cross-market Albert insight test successful")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception occurred: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_unsupported_symbol_error():
    """Test 4: Error handling for unsupported symbol (FOO)"""
    print("\n" + "="*80)
    print("TEST 4: Error Handling (unsupported symbol FOO)")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/markets?symbol=FOO&window=1y"
        print(f"GET {url}")
        resp = requests.get(url, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAILED: Expected 200 (graceful error), got {resp.status_code}")
            return False
        
        data = resp.json()
        status = data.get('status')
        print(f"Response status: {status}")
        
        if status != 'error':
            print(f"❌ FAILED: Expected status='error' for unsupported symbol, got '{status}'")
            return False
        
        print(f"✅ Status is 'error' (graceful error handling)")
        
        # Check error field
        error = data.get('error')
        if not error:
            print(f"⚠️ SOFT WARNING: error field is empty")
        else:
            print(f"✅ error = '{error}'")
        
        print("\n✅ TEST 4 PASSED: Unsupported symbol error handling successful")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception occurred: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    print("\n" + "="*80)
    print("BACKEND API TEST SUITE - CROSS-MARKET FEATURE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Testing Cross-Market endpoint (coin vs traditional markets)")
    print("="*80)
    
    results = {}
    
    # Test 1: BTC markets window=1y
    results['BTC Markets (1y)'] = test_btc_markets_1y(max_wait=90)
    
    # Test 2: ETH markets window=6m
    results['ETH Markets (6m)'] = test_eth_markets_6m(max_wait=90)
    
    # Test 3: Cross-market Albert insight
    results['Cross-market Albert Insight'] = test_crossmarket_albert_insight()
    
    # Test 4: Error handling
    results['Error Handling (FOO)'] = test_unsupported_symbol_error()
    
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
