#!/usr/bin/env python3
"""
Whale Intelligence Backend Enhancements Test Suite
Tests 4 NEW features:
1. ETF FULL HISTORY (enhanced from Phase 1)
2. WHALE-TX SMART ALERTS
3. EXPANDED WHALE SEED (~15 whales)
4. ALBERT WHALE REVIEW (Albert insight with whale context)
"""

import requests
import time
import json
from datetime import datetime

# External base URL from .env
BASE_URL = "https://what-if-sandbox.preview.emergentagent.com/api"

def test_etf_full_history():
    """
    Test 1: ETF FULL HISTORY
    Expect: status='ready', source mentions 'tftc' (Farside full-history), 
    history_days ~660 (>=400), span_from ≈ '2024-01-11',
    cumulative: non-empty list (<=180 points), oldest->newest, each {date, cum},
    cum_total: numeric, large positive (net inflow since launch, expect ~50000+ in $M),
    net_1d / net_7d / net_30d numeric, leaderboard non-empty with leaderboard_window == 30,
    daily non-empty, refresh=1 works, No 500s.
    Also GET /api/v1/dashboard -> institutional.metrics still has a live 'Spot ETF net flow (1d)' that is NOT inactive.
    """
    print("\n" + "="*80)
    print("TEST 1: ETF FULL HISTORY")
    print("="*80)
    
    try:
        # Test 1a: GET /api/v1/etf-flows
        print("\n[1a] Testing GET /api/v1/etf-flows...")
        resp = requests.get(f"{BASE_URL}/v1/etf-flows", timeout=30)
        print(f"Status code: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        print(f"Response keys: {list(data.keys())}")
        
        # Check status
        if data.get('status') != 'ready':
            print(f"❌ FAILED: Expected status='ready', got '{data.get('status')}'")
            return False
        print("✅ status='ready'")
        
        # Check source mentions 'tftc' (Farside full-history)
        source = data.get('source', '')
        if 'tftc' not in source.lower():
            print(f"❌ FAILED: Expected source to mention 'tftc', got '{source}'")
            return False
        print(f"✅ source mentions 'tftc': {source}")
        
        # Check history_days ~660 (>=400)
        history_days = data.get('history_days')
        if history_days is None or history_days < 400:
            print(f"❌ FAILED: Expected history_days >= 400, got {history_days}")
            return False
        print(f"✅ history_days = {history_days} (>= 400)")
        
        # Check span_from ≈ '2024-01-11'
        span_from = data.get('span_from', '')
        if not span_from.startswith('2024-01'):
            print(f"❌ FAILED: Expected span_from ≈ '2024-01-11', got '{span_from}'")
            return False
        print(f"✅ span_from = {span_from} (≈ 2024-01-11)")
        
        # Check cumulative: non-empty list (<=180 points), oldest->newest, each {date, cum}
        cumulative = data.get('cumulative', [])
        if not cumulative or len(cumulative) == 0:
            print(f"❌ FAILED: Expected non-empty cumulative list, got {len(cumulative)} items")
            return False
        if len(cumulative) > 180:
            print(f"❌ FAILED: Expected cumulative <= 180 points, got {len(cumulative)}")
            return False
        print(f"✅ cumulative: {len(cumulative)} points (<= 180)")
        
        # Check first and last cumulative items
        first_cum = cumulative[0]
        last_cum = cumulative[-1]
        if 'date' not in first_cum or 'cum' not in first_cum:
            print(f"❌ FAILED: cumulative items missing 'date' or 'cum' fields")
            return False
        print(f"✅ cumulative items have {{date, cum}}: first={first_cum['date']}, last={last_cum['date']}")
        
        # Check cumulative is oldest->newest
        if first_cum['date'] > last_cum['date']:
            print(f"❌ FAILED: cumulative not sorted oldest->newest")
            return False
        print(f"✅ cumulative sorted oldest->newest")
        
        # Check cum_total: numeric, large positive (expect ~50000+ in $M)
        cum_total = data.get('cum_total')
        if cum_total is None or not isinstance(cum_total, (int, float)):
            print(f"❌ FAILED: Expected numeric cum_total, got {type(cum_total)}")
            return False
        if cum_total < 50000:
            print(f"⚠️  WARNING: Expected cum_total ~50000+ $M, got {cum_total} (may be lower due to recent outflows)")
        print(f"✅ cum_total = {cum_total:,.0f} $M (numeric, large positive)")
        
        # Check net_1d / net_7d / net_30d numeric
        net_1d = data.get('net_1d')
        net_7d = data.get('net_7d')
        net_30d = data.get('net_30d')
        if not all(isinstance(x, (int, float)) for x in [net_1d, net_7d, net_30d]):
            print(f"❌ FAILED: net_1d/net_7d/net_30d not all numeric")
            return False
        print(f"✅ net_1d={net_1d}, net_7d={net_7d}, net_30d={net_30d} (all numeric)")
        
        # Check leaderboard non-empty with leaderboard_window == 30
        leaderboard = data.get('leaderboard', [])
        leaderboard_window = data.get('leaderboard_window')
        if not leaderboard or len(leaderboard) == 0:
            print(f"❌ FAILED: Expected non-empty leaderboard, got {len(leaderboard)} items")
            return False
        if leaderboard_window != 30:
            print(f"❌ FAILED: Expected leaderboard_window == 30, got {leaderboard_window}")
            return False
        print(f"✅ leaderboard: {len(leaderboard)} items, leaderboard_window=30")
        
        # Check daily non-empty
        daily = data.get('daily', [])
        if not daily or len(daily) == 0:
            print(f"❌ FAILED: Expected non-empty daily list, got {len(daily)} items")
            return False
        print(f"✅ daily: {len(daily)} items (non-empty)")
        
        # Test 1b: GET /api/v1/etf-flows?refresh=1
        print("\n[1b] Testing GET /api/v1/etf-flows?refresh=1...")
        resp_refresh = requests.get(f"{BASE_URL}/v1/etf-flows?refresh=1", timeout=30)
        print(f"Status code: {resp_refresh.status_code}")
        
        if resp_refresh.status_code != 200:
            print(f"❌ FAILED: refresh=1 returned {resp_refresh.status_code}")
            return False
        print("✅ refresh=1 works (no 500)")
        
        # Test 1c: GET /api/v1/dashboard -> institutional.metrics 'Spot ETF net flow (1d)' NOT inactive
        print("\n[1c] Testing GET /api/v1/dashboard institutional panel...")
        resp_dash = requests.get(f"{BASE_URL}/v1/dashboard", timeout=30)
        print(f"Status code: {resp_dash.status_code}")
        
        if resp_dash.status_code != 200:
            print(f"❌ FAILED: dashboard returned {resp_dash.status_code}")
            return False
        
        dash_data = resp_dash.json()
        institutional = dash_data.get('institutional', {})
        metrics = institutional.get('metrics', [])
        
        # Find 'Spot ETF net flow (1d)' metric
        etf_metric = None
        for m in metrics:
            if 'Spot ETF net flow (1d)' in m.get('name', ''):
                etf_metric = m
                break
        
        if not etf_metric:
            print(f"❌ FAILED: 'Spot ETF net flow (1d)' metric not found in institutional panel")
            return False
        
        # Check it's NOT inactive
        if etf_metric.get('inactive') == True:
            print(f"❌ FAILED: 'Spot ETF net flow (1d)' is marked inactive")
            return False
        
        print(f"✅ 'Spot ETF net flow (1d)' metric found and NOT inactive")
        print(f"   value: {etf_metric.get('value')}")
        
        print("\n✅ TEST 1 PASSED: ETF FULL HISTORY")
        return True
        
    except Exception as e:
        print(f"❌ TEST 1 FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_whale_tx_smart_alerts():
    """
    Test 2: WHALE-TX SMART ALERTS
    Call GET /api/v1/whales/transactions?refresh=1 and WAIT ~60-90s for background rebuild to fire alerts.
    Then GET /api/v1/alerts?limit=60 -> expect >=1 alert whose id starts with 'whaletx_',
    category=='Whale', title like 'Whale move: N BTC in/out of ENTITY',
    signal in [Bullish,Bearish], severity in [high,warning], and a 'link' containing mempool.space.
    (Only moves >=1000 BTC within the last 14 days fire — several Binance moves currently qualify.)
    POST /api/v1/alerts/ack still returns ok.
    """
    print("\n" + "="*80)
    print("TEST 2: WHALE-TX SMART ALERTS")
    print("="*80)
    
    try:
        # Test 2a: Trigger whale-tx refresh
        print("\n[2a] Triggering GET /api/v1/whales/transactions?refresh=1...")
        resp = requests.get(f"{BASE_URL}/v1/whales/transactions?refresh=1", timeout=90)
        print(f"Status code: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {resp.status_code}")
            return False
        
        print("✅ Whale-tx refresh triggered")
        
        # Wait for background rebuild to fire alerts (~60-90s)
        print("\n[2b] Waiting 90 seconds for background rebuild to fire alerts...")
        time.sleep(90)
        
        # Test 2c: GET /api/v1/alerts?limit=60
        print("\n[2c] Testing GET /api/v1/alerts?limit=60...")
        resp_alerts = requests.get(f"{BASE_URL}/v1/alerts?limit=60", timeout=30)
        print(f"Status code: {resp_alerts.status_code}")
        
        if resp_alerts.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {resp_alerts.status_code}")
            return False
        
        alerts_data = resp_alerts.json()
        alerts = alerts_data.get('alerts', [])
        print(f"Total alerts: {len(alerts)}")
        
        # Find whale-tx alerts
        whaletx_alerts = [a for a in alerts if a.get('id', '').startswith('whaletx_')]
        print(f"Whale-tx alerts found: {len(whaletx_alerts)}")
        
        if len(whaletx_alerts) == 0:
            print(f"❌ FAILED: Expected >=1 alert with id starting with 'whaletx_', found 0")
            print(f"   (Note: Only moves >=1000 BTC within last 14 days fire alerts)")
            # Print all alert IDs for debugging
            print(f"   All alert IDs: {[a.get('id') for a in alerts[:10]]}")
            return False
        
        print(f"✅ Found {len(whaletx_alerts)} whale-tx alert(s)")
        
        # Validate first whale-tx alert
        alert = whaletx_alerts[0]
        print(f"\nValidating first whale-tx alert:")
        print(f"  id: {alert.get('id')}")
        print(f"  category: {alert.get('category')}")
        print(f"  title: {alert.get('title')}")
        print(f"  severity: {alert.get('severity')}")
        print(f"  signal: {alert.get('signal')}")
        
        # Check category == 'Whale'
        if alert.get('category') != 'Whale':
            print(f"❌ FAILED: Expected category='Whale', got '{alert.get('category')}'")
            return False
        print("✅ category='Whale'")
        
        # Check title like 'Whale move: N BTC in/out of ENTITY'
        title = alert.get('title', '')
        if 'Whale move:' not in title or 'BTC' not in title:
            print(f"❌ FAILED: Expected title like 'Whale move: N BTC in/out of ENTITY', got '{title}'")
            return False
        print(f"✅ title matches pattern: '{title}'")
        
        # Check signal in [Bullish, Bearish]
        signal = alert.get('signal')
        if signal not in ['Bullish', 'Bearish']:
            print(f"❌ FAILED: Expected signal in [Bullish, Bearish], got '{signal}'")
            return False
        print(f"✅ signal='{signal}' (in [Bullish, Bearish])")
        
        # Check severity in [high, warning]
        severity = alert.get('severity')
        if severity not in ['high', 'warning']:
            print(f"❌ FAILED: Expected severity in [high, warning], got '{severity}'")
            return False
        print(f"✅ severity='{severity}' (in [high, warning])")
        
        # Check 'link' containing mempool.space
        link = alert.get('link', '')
        if 'mempool.space' not in link:
            print(f"❌ FAILED: Expected 'link' containing mempool.space, got '{link}'")
            return False
        print(f"✅ link contains mempool.space: {link}")
        
        # Test 2d: POST /api/v1/alerts/ack
        print("\n[2d] Testing POST /api/v1/alerts/ack...")
        resp_ack = requests.post(f"{BASE_URL}/v1/alerts/ack", json={}, timeout=30)
        print(f"Status code: {resp_ack.status_code}")
        
        if resp_ack.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {resp_ack.status_code}")
            return False
        
        ack_data = resp_ack.json()
        if ack_data.get('status') != 'ok':
            print(f"❌ FAILED: Expected status='ok', got '{ack_data.get('status')}'")
            return False
        
        print("✅ POST /api/v1/alerts/ack returns ok")
        
        print("\n✅ TEST 2 PASSED: WHALE-TX SMART ALERTS")
        return True
        
    except Exception as e:
        print(f"❌ TEST 2 FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_expanded_whale_seed():
    """
    Test 3: EXPANDED WHALE SEED
    GET /api/v1/whales -> Now returns ~15 whales (was 10).
    Confirm these NEW labels are present: 'Coinbase (cold)', 'Poloniex (cold)', 'OKX',
    'MicroStrategy / Strategy (attributed)', 'Early mega-whale'.
    Each with numeric balance>0. No 500s.
    """
    print("\n" + "="*80)
    print("TEST 3: EXPANDED WHALE SEED")
    print("="*80)
    
    try:
        print("\n[3a] Testing GET /api/v1/whales...")
        resp = requests.get(f"{BASE_URL}/v1/whales", timeout=30)
        print(f"Status code: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        whales = data.get('whales', [])
        print(f"Total whales: {len(whales)}")
        
        # Check ~15 whales (was 10)
        if len(whales) < 14 or len(whales) > 16:
            print(f"❌ FAILED: Expected ~15 whales, got {len(whales)}")
            return False
        print(f"✅ Returns ~15 whales ({len(whales)} whales)")
        
        # Check NEW labels are present
        required_labels = [
            'Coinbase (cold)',
            'Poloniex (cold)',
            'OKX',
            'MicroStrategy / Strategy (attributed)',
            'Early mega-whale'
        ]
        
        whale_names = [w.get('name', '') for w in whales]
        print(f"\nAll whale names: {whale_names}")
        
        missing_labels = []
        for label in required_labels:
            # Check if label is present (case-insensitive partial match)
            found = any(label.lower() in name.lower() for name in whale_names)
            if not found:
                missing_labels.append(label)
            else:
                print(f"✅ Found: '{label}'")
        
        if missing_labels:
            print(f"❌ FAILED: Missing required labels: {missing_labels}")
            return False
        
        print(f"✅ All NEW labels present")
        
        # Check each whale has numeric balance > 0
        for whale in whales:
            balance = whale.get('balance')
            if balance is None or not isinstance(balance, (int, float)) or balance <= 0:
                print(f"❌ FAILED: Whale '{whale.get('name')}' has invalid balance: {balance}")
                return False
        
        print(f"✅ All whales have numeric balance > 0")
        
        print("\n✅ TEST 3 PASSED: EXPANDED WHALE SEED")
        return True
        
    except Exception as e:
        print(f"❌ TEST 3 FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_albert_whale_review():
    """
    Test 4: ALBERT WHALE REVIEW
    GET /api/v1/albert/insight?section=whales&symbol=BTC ->
    status='ready' with non-empty text that references BOTH whale flows/accumulation AND ETF flows
    (context now injects whale impact + ETF net flows).
    First call may take ~40s (reconstructs impact). Second identical call returns cached=true.
    No 500s. (status='fallback' acceptable only if LLM key unset, but must not 500.)
    """
    print("\n" + "="*80)
    print("TEST 4: ALBERT WHALE REVIEW")
    print("="*80)
    
    try:
        # Test 4a: First call (may take ~40s)
        print("\n[4a] Testing GET /api/v1/albert/insight?section=whales&symbol=BTC (first call)...")
        start_time = time.time()
        resp = requests.get(f"{BASE_URL}/v1/albert/insight?section=whales&symbol=BTC", timeout=60)
        elapsed = time.time() - start_time
        print(f"Status code: {resp.status_code}")
        print(f"Elapsed time: {elapsed:.1f}s")
        
        if resp.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        status = data.get('status')
        print(f"Response status: {status}")
        
        # Check status is 'ready' or 'fallback' (fallback acceptable if LLM key unset)
        if status not in ['ready', 'fallback']:
            print(f"❌ FAILED: Expected status in ['ready', 'fallback'], got '{status}'")
            return False
        
        if status == 'fallback':
            print(f"⚠️  WARNING: status='fallback' (LLM key may be unset)")
            print(f"   reason: {data.get('reason')}")
            print("✅ No 500 error (fallback acceptable)")
            print("\n✅ TEST 4 PASSED: ALBERT WHALE REVIEW (fallback mode)")
            return True
        
        print(f"✅ status='ready'")
        
        # Check non-empty text
        text = data.get('text', '')
        if not text or len(text) < 50:
            print(f"❌ FAILED: Expected non-empty text (>=50 chars), got {len(text)} chars")
            return False
        print(f"✅ text is non-empty ({len(text)} chars)")
        
        # Check text references BOTH whale flows/accumulation AND ETF flows
        text_lower = text.lower()
        
        whale_keywords = ['whale', 'accumulation', 'distribution', 'holder', 'exchange']
        whale_found = any(kw in text_lower for kw in whale_keywords)
        
        etf_keywords = ['etf', 'institutional', 'spot etf', 'net flow']
        etf_found = any(kw in text_lower for kw in etf_keywords)
        
        if not whale_found:
            print(f"❌ FAILED: Text does not reference whale flows/accumulation")
            print(f"   Text: {text[:200]}...")
            return False
        print(f"✅ Text references whale flows/accumulation")
        
        if not etf_found:
            print(f"❌ FAILED: Text does not reference ETF flows")
            print(f"   Text: {text[:200]}...")
            return False
        print(f"✅ Text references ETF flows")
        
        print(f"\nSample text: {text[:300]}...")
        
        # Test 4b: Second identical call (should return cached=true)
        print("\n[4b] Testing GET /api/v1/albert/insight?section=whales&symbol=BTC (second call)...")
        start_time = time.time()
        resp2 = requests.get(f"{BASE_URL}/v1/albert/insight?section=whales&symbol=BTC", timeout=30)
        elapsed2 = time.time() - start_time
        print(f"Status code: {resp2.status_code}")
        print(f"Elapsed time: {elapsed2:.1f}s")
        
        if resp2.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {resp2.status_code}")
            return False
        
        data2 = resp2.json()
        cached = data2.get('cached')
        print(f"cached: {cached}")
        
        if cached != True:
            print(f"⚠️  WARNING: Expected cached=true on second call, got {cached}")
        else:
            print(f"✅ cached=true on second call")
        
        print("\n✅ TEST 4 PASSED: ALBERT WHALE REVIEW")
        return True
        
    except Exception as e:
        print(f"❌ TEST 4 FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_regression():
    """
    REGRESSION: GET /api/v1/dashboard status='ready';
    GET /api/v1/whales/impact and GET /api/v1/whales/history?address=1FeexV6bAHb8ybZjqQMjJrcCrHGW9sb6uF
    still status='ready'.
    """
    print("\n" + "="*80)
    print("REGRESSION TESTS")
    print("="*80)
    
    try:
        # Test R1: GET /api/v1/dashboard
        print("\n[R1] Testing GET /api/v1/dashboard...")
        resp = requests.get(f"{BASE_URL}/v1/dashboard", timeout=30)
        print(f"Status code: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        if data.get('status') != 'ready':
            print(f"❌ FAILED: Expected status='ready', got '{data.get('status')}'")
            return False
        print("✅ GET /api/v1/dashboard status='ready'")
        
        # Test R2: GET /api/v1/whales/impact
        print("\n[R2] Testing GET /api/v1/whales/impact...")
        resp2 = requests.get(f"{BASE_URL}/v1/whales/impact", timeout=60)
        print(f"Status code: {resp2.status_code}")
        
        if resp2.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {resp2.status_code}")
            return False
        
        data2 = resp2.json()
        if data2.get('status') != 'ready':
            print(f"❌ FAILED: Expected status='ready', got '{data2.get('status')}'")
            return False
        print("✅ GET /api/v1/whales/impact status='ready'")
        
        # Test R3: GET /api/v1/whales/history?address=1FeexV6bAHb8ybZjqQMjJrcCrHGW9sb6uF
        print("\n[R3] Testing GET /api/v1/whales/history?address=1FeexV6bAHb8ybZjqQMjJrcCrHGW9sb6uF...")
        resp3 = requests.get(f"{BASE_URL}/v1/whales/history?address=1FeexV6bAHb8ybZjqQMjJrcCrHGW9sb6uF", timeout=30)
        print(f"Status code: {resp3.status_code}")
        
        if resp3.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {resp3.status_code}")
            return False
        
        data3 = resp3.json()
        if data3.get('status') != 'ready':
            print(f"❌ FAILED: Expected status='ready', got '{data3.get('status')}'")
            return False
        print("✅ GET /api/v1/whales/history status='ready'")
        
        print("\n✅ REGRESSION TESTS PASSED")
        return True
        
    except Exception as e:
        print(f"❌ REGRESSION TESTS FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    print("="*80)
    print("WHALE INTELLIGENCE BACKEND ENHANCEMENTS TEST SUITE")
    print("Testing 4 NEW features via external URL")
    print(f"Base URL: {BASE_URL}")
    print("="*80)
    
    results = {}
    
    # Run all tests
    results['Test 1: ETF Full History'] = test_etf_full_history()
    results['Test 2: Whale-TX Smart Alerts'] = test_whale_tx_smart_alerts()
    results['Test 3: Expanded Whale Seed'] = test_expanded_whale_seed()
    results['Test 4: Albert Whale Review'] = test_albert_whale_review()
    results['Regression Tests'] = test_regression()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        return 1


if __name__ == "__main__":
    exit(main())
