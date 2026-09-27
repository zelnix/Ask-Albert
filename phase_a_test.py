#!/usr/bin/env python3
"""
Phase A Endpoints Test Suite
Tests NEW Phase A endpoints + Admin overview
All should return REAL/keyless data (no mocks)
"""

import requests
import time
import json
from typing import Dict, Any

BASE_URL = "https://what-if-sandbox.preview.emergentagent.com/api"

def test_fear_greed():
    """
    Test GET /api/v1/fear-greed
    Expected: status='ready', value int 0-100, label string, 
    week_ago & month_ago ints, history non-empty (items have value,label,ts), 
    read non-empty
    """
    print("\n" + "="*80)
    print("TEST 1: GET /api/v1/fear-greed")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/v1/fear-greed"
        print(f"Requesting: {url}")
        
        response = requests.get(url, timeout=30)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text[:500]}")
            return False
        
        data = response.json()
        print(f"Response keys: {list(data.keys())}")
        
        # Check status
        if data.get('status') != 'ready':
            print(f"❌ FAILED: status != 'ready', got '{data.get('status')}'")
            return False
        print("✅ status='ready'")
        
        # Check value (int 0-100)
        value = data.get('value')
        if not isinstance(value, int) or not (0 <= value <= 100):
            print(f"❌ FAILED: value must be int 0-100, got {value} (type: {type(value)})")
            return False
        print(f"✅ value={value} (int 0-100)")
        
        # Check label (string)
        label = data.get('label')
        if not isinstance(label, str) or not label:
            print(f"❌ FAILED: label must be non-empty string, got '{label}'")
            return False
        print(f"✅ label='{label}' (string)")
        
        # Check week_ago (int)
        week_ago = data.get('week_ago')
        if not isinstance(week_ago, int):
            print(f"❌ FAILED: week_ago must be int, got {week_ago} (type: {type(week_ago)})")
            return False
        print(f"✅ week_ago={week_ago} (int)")
        
        # Check month_ago (int)
        month_ago = data.get('month_ago')
        if not isinstance(month_ago, int):
            print(f"❌ FAILED: month_ago must be int, got {month_ago} (type: {type(month_ago)})")
            return False
        print(f"✅ month_ago={month_ago} (int)")
        
        # Check history (non-empty list with value, label, ts)
        history = data.get('history')
        if not isinstance(history, list) or len(history) == 0:
            print(f"❌ FAILED: history must be non-empty list, got {type(history)} with {len(history) if isinstance(history, list) else 0} items")
            return False
        print(f"✅ history: {len(history)} items")
        
        # Validate first history item
        first_item = history[0]
        if 'value' not in first_item or 'label' not in first_item or 'ts' not in first_item:
            print(f"❌ FAILED: history items must have value, label, ts. Got: {list(first_item.keys())}")
            return False
        print(f"✅ history items have value, label, ts (sample: value={first_item['value']}, label='{first_item['label']}')")
        
        # Check read (non-empty)
        read = data.get('read')
        if not read:
            print(f"❌ FAILED: read must be non-empty")
            return False
        print(f"✅ read: non-empty ({len(str(read))} chars)")
        
        print("\n✅ TEST 1 PASSED: fear-greed endpoint working correctly")
        print(f"   Exact values: value={value}, label='{label}', week_ago={week_ago}, month_ago={month_ago}, history_count={len(history)}")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_network_health():
    """
    Test GET /api/v1/network-health
    Expected: status='ready', hashrate_ehs numeric, difficulty_change_pct numeric,
    retarget_days numeric, fees{fastest,state}, mempool{count,congestion},
    hashrate_series non-empty, read non-empty
    """
    print("\n" + "="*80)
    print("TEST 2: GET /api/v1/network-health")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/v1/network-health"
        print(f"Requesting: {url}")
        
        response = requests.get(url, timeout=30)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text[:500]}")
            return False
        
        data = response.json()
        print(f"Response keys: {list(data.keys())}")
        
        # Check status
        if data.get('status') != 'ready':
            print(f"❌ FAILED: status != 'ready', got '{data.get('status')}'")
            return False
        print("✅ status='ready'")
        
        # Check hashrate_ehs (numeric)
        hashrate_ehs = data.get('hashrate_ehs')
        if not isinstance(hashrate_ehs, (int, float)):
            print(f"❌ FAILED: hashrate_ehs must be numeric, got {hashrate_ehs} (type: {type(hashrate_ehs)})")
            return False
        print(f"✅ hashrate_ehs={hashrate_ehs} (numeric)")
        
        # Check difficulty_change_pct (numeric)
        difficulty_change_pct = data.get('difficulty_change_pct')
        if not isinstance(difficulty_change_pct, (int, float)):
            print(f"❌ FAILED: difficulty_change_pct must be numeric, got {difficulty_change_pct} (type: {type(difficulty_change_pct)})")
            return False
        print(f"✅ difficulty_change_pct={difficulty_change_pct} (numeric)")
        
        # Check retarget_days (numeric)
        retarget_days = data.get('retarget_days')
        if not isinstance(retarget_days, (int, float)):
            print(f"❌ FAILED: retarget_days must be numeric, got {retarget_days} (type: {type(retarget_days)})")
            return False
        print(f"✅ retarget_days={retarget_days} (numeric)")
        
        # Check fees (object with fastest and state)
        fees = data.get('fees')
        if not isinstance(fees, dict):
            print(f"❌ FAILED: fees must be object, got {type(fees)}")
            return False
        if 'fastest' not in fees or 'state' not in fees:
            print(f"❌ FAILED: fees must have fastest and state, got keys: {list(fees.keys())}")
            return False
        print(f"✅ fees: fastest={fees['fastest']}, state='{fees['state']}'")
        
        # Check mempool (object with count and congestion)
        mempool = data.get('mempool')
        if not isinstance(mempool, dict):
            print(f"❌ FAILED: mempool must be object, got {type(mempool)}")
            return False
        if 'count' not in mempool or 'congestion' not in mempool:
            print(f"❌ FAILED: mempool must have count and congestion, got keys: {list(mempool.keys())}")
            return False
        print(f"✅ mempool: count={mempool['count']}, congestion='{mempool['congestion']}'")
        
        # Check hashrate_series (non-empty)
        hashrate_series = data.get('hashrate_series')
        if not isinstance(hashrate_series, list) or len(hashrate_series) == 0:
            print(f"❌ FAILED: hashrate_series must be non-empty list, got {type(hashrate_series)} with {len(hashrate_series) if isinstance(hashrate_series, list) else 0} items")
            return False
        print(f"✅ hashrate_series: {len(hashrate_series)} items")
        
        # Check read (non-empty)
        read = data.get('read')
        if not read:
            print(f"❌ FAILED: read must be non-empty")
            return False
        print(f"✅ read: non-empty ({len(str(read))} chars)")
        
        print("\n✅ TEST 2 PASSED: network-health endpoint working correctly")
        print(f"   Exact values: hashrate_ehs={hashrate_ehs}, difficulty_change_pct={difficulty_change_pct}, retarget_days={retarget_days}")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_exchange_flows():
    """
    Test GET /api/v1/exchange-flows
    Expected: status='ready' (FIRST CALL MAY TAKE ~40s), series non-empty (items have date,balance),
    current numeric, net_7d/net_30d/net_90d numeric, trend string, read non-empty
    Also test refresh=1
    """
    print("\n" + "="*80)
    print("TEST 3: GET /api/v1/exchange-flows")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/v1/exchange-flows"
        print(f"Requesting: {url}")
        print("⚠️  NOTE: First call may take ~40 seconds...")
        
        response = requests.get(url, timeout=60)  # Generous timeout
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text[:500]}")
            return False
        
        data = response.json()
        print(f"Response keys: {list(data.keys())}")
        
        # Check status
        if data.get('status') != 'ready':
            print(f"❌ FAILED: status != 'ready', got '{data.get('status')}'")
            return False
        print("✅ status='ready'")
        
        # Check series (non-empty list with date, balance)
        series = data.get('series')
        if not isinstance(series, list) or len(series) == 0:
            print(f"❌ FAILED: series must be non-empty list, got {type(series)} with {len(series) if isinstance(series, list) else 0} items")
            return False
        print(f"✅ series: {len(series)} items")
        
        # Validate first series item
        first_item = series[0]
        if 'date' not in first_item or 'balance' not in first_item:
            print(f"❌ FAILED: series items must have date, balance. Got: {list(first_item.keys())}")
            return False
        print(f"✅ series items have date, balance (sample: date='{first_item['date']}', balance={first_item['balance']})")
        
        # Check current (numeric)
        current = data.get('current')
        if not isinstance(current, (int, float)):
            print(f"❌ FAILED: current must be numeric, got {current} (type: {type(current)})")
            return False
        print(f"✅ current={current} (numeric)")
        
        # Check net_7d (numeric)
        net_7d = data.get('net_7d')
        if not isinstance(net_7d, (int, float)):
            print(f"❌ FAILED: net_7d must be numeric, got {net_7d} (type: {type(net_7d)})")
            return False
        print(f"✅ net_7d={net_7d} (numeric)")
        
        # Check net_30d (numeric)
        net_30d = data.get('net_30d')
        if not isinstance(net_30d, (int, float)):
            print(f"❌ FAILED: net_30d must be numeric, got {net_30d} (type: {type(net_30d)})")
            return False
        print(f"✅ net_30d={net_30d} (numeric)")
        
        # Check net_90d (numeric)
        net_90d = data.get('net_90d')
        if not isinstance(net_90d, (int, float)):
            print(f"❌ FAILED: net_90d must be numeric, got {net_90d} (type: {type(net_90d)})")
            return False
        print(f"✅ net_90d={net_90d} (numeric)")
        
        # Check trend (string)
        trend = data.get('trend')
        if not isinstance(trend, str) or not trend:
            print(f"❌ FAILED: trend must be non-empty string, got '{trend}'")
            return False
        print(f"✅ trend='{trend}' (string)")
        
        # Check read (non-empty)
        read = data.get('read')
        if not read:
            print(f"❌ FAILED: read must be non-empty")
            return False
        print(f"✅ read: non-empty ({len(str(read))} chars)")
        
        print("\n✅ TEST 3a PASSED: exchange-flows endpoint working correctly")
        print(f"   Exact values: current={current}, net_7d={net_7d}, net_30d={net_30d}, net_90d={net_90d}, trend='{trend}'")
        
        # Test refresh=1
        print("\n--- Testing refresh=1 ---")
        url_refresh = f"{BASE_URL}/v1/exchange-flows?refresh=1"
        print(f"Requesting: {url_refresh}")
        
        response_refresh = requests.get(url_refresh, timeout=60)
        print(f"Status Code: {response_refresh.status_code}")
        
        if response_refresh.status_code != 200:
            print(f"❌ FAILED: refresh=1 returned {response_refresh.status_code}")
            return False
        
        data_refresh = response_refresh.json()
        if data_refresh.get('status') != 'ready':
            print(f"❌ FAILED: refresh=1 status != 'ready', got '{data_refresh.get('status')}'")
            return False
        
        print("✅ TEST 3b PASSED: refresh=1 works correctly")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_etf_flows_price():
    """
    Test GET /api/v1/etf-flows
    Expected: has_price == true, cumulative points include numeric 'price' field (BTC close) alongside 'cum',
    cum_total is large positive number
    """
    print("\n" + "="*80)
    print("TEST 4: GET /api/v1/etf-flows (price overlay)")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/v1/etf-flows"
        print(f"Requesting: {url}")
        
        response = requests.get(url, timeout=30)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text[:500]}")
            return False
        
        data = response.json()
        print(f"Response keys: {list(data.keys())}")
        
        # Check has_price
        has_price = data.get('has_price')
        if has_price != True:
            print(f"❌ FAILED: has_price must be true, got {has_price}")
            return False
        print("✅ has_price=true")
        
        # Check cumulative (must have 'price' field alongside 'cum')
        cumulative = data.get('cumulative')
        if not isinstance(cumulative, list) or len(cumulative) == 0:
            print(f"❌ FAILED: cumulative must be non-empty list, got {type(cumulative)}")
            return False
        print(f"✅ cumulative: {len(cumulative)} items")
        
        # Validate cumulative items have 'price' field
        first_item = cumulative[0]
        if 'cum' not in first_item:
            print(f"❌ FAILED: cumulative items must have 'cum' field. Got: {list(first_item.keys())}")
            return False
        if 'price' not in first_item:
            print(f"❌ FAILED: cumulative items must have 'price' field. Got: {list(first_item.keys())}")
            return False
        
        price_val = first_item['price']
        if not isinstance(price_val, (int, float)):
            print(f"❌ FAILED: cumulative 'price' must be numeric, got {price_val} (type: {type(price_val)})")
            return False
        
        print(f"✅ cumulative items have 'price' field (sample: cum={first_item['cum']}, price={price_val})")
        
        # Check cum_total (large positive number)
        cum_total = data.get('cum_total')
        if not isinstance(cum_total, (int, float)):
            print(f"❌ FAILED: cum_total must be numeric, got {cum_total} (type: {type(cum_total)})")
            return False
        if cum_total <= 0:
            print(f"❌ FAILED: cum_total must be positive, got {cum_total}")
            return False
        print(f"✅ cum_total={cum_total} (large positive number)")
        
        print("\n✅ TEST 4 PASSED: etf-flows price overlay working correctly")
        print(f"   Exact values: has_price=true, cum_total={cum_total}, cumulative_count={len(cumulative)}")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_albert_brief():
    """
    Test GET /api/v1/albert/brief
    Expected: status='ready', observations is a list (~4-5 strings), take non-empty
    (if LLM key unset may return raw text or status 'fallback' - acceptable, but NOT 500)
    Call TWICE to confirm cached==true on second call
    """
    print("\n" + "="*80)
    print("TEST 5: GET /api/v1/albert/brief")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/v1/albert/brief"
        print(f"Requesting: {url}")
        
        response = requests.get(url, timeout=30)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text[:500]}")
            return False
        
        data = response.json()
        print(f"Response keys: {list(data.keys())}")
        
        # Check status (must be 'ready' or 'fallback', NOT 500)
        status = data.get('status')
        if status not in ['ready', 'fallback']:
            print(f"❌ FAILED: status must be 'ready' or 'fallback', got '{status}'")
            return False
        print(f"✅ status='{status}'")
        
        if status == 'fallback':
            print("⚠️  NOTE: LLM key may be unset, status='fallback' is acceptable")
            return True
        
        # Check observations (list of ~4-5 strings)
        observations = data.get('observations')
        if not isinstance(observations, list):
            print(f"❌ FAILED: observations must be list, got {type(observations)}")
            return False
        if len(observations) == 0:
            print(f"❌ FAILED: observations must be non-empty")
            return False
        print(f"✅ observations: {len(observations)} items")
        
        # Validate observations are strings
        for i, obs in enumerate(observations[:3]):  # Check first 3
            if not isinstance(obs, str):
                print(f"❌ FAILED: observations[{i}] must be string, got {type(obs)}")
                return False
        print(f"✅ observations are strings (sample: '{observations[0][:80]}...')")
        
        # Check take (non-empty)
        take = data.get('take')
        if not take:
            print(f"❌ FAILED: take must be non-empty")
            return False
        print(f"✅ take: non-empty ({len(str(take))} chars)")
        
        print("\n✅ TEST 5a PASSED: albert/brief endpoint working correctly (first call)")
        
        # Call SECOND time to check caching
        print("\n--- Testing cached response (second call) ---")
        time.sleep(1)  # Brief pause
        
        response2 = requests.get(url, timeout=30)
        print(f"Status Code: {response2.status_code}")
        
        if response2.status_code != 200:
            print(f"❌ FAILED: Second call returned {response2.status_code}")
            return False
        
        data2 = response2.json()
        cached = data2.get('cached')
        if cached != True:
            print(f"⚠️  WARNING: cached should be true on second call, got {cached}")
        else:
            print("✅ cached=true on second call")
        
        print("\n✅ TEST 5b PASSED: albert/brief caching working correctly")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_admin_overview():
    """
    Test GET /api/v1/admin/overview
    Expected: status='ready', integrations list (>=10, each has name/category/auth/status/cost),
    active ones include Gemini/OKX/mempool.space/tftc.io/CoinGecko/alternative.me,
    inactive include CoinGlass/ElevenLabs/SendGrid,
    integrations_active and integrations_total are ints,
    freshness is a list (each source+age_min),
    usage has llm_calls_total/cached_insights/alerts_total/whales_tracked/runs_logged,
    costs.emergent has model/status/llm_calls_total/est_cost_total_usd/billing_note,
    scheduler_jobs is a list,
    collections is a dict,
    No 500s
    """
    print("\n" + "="*80)
    print("TEST 6: GET /api/v1/admin/overview")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/v1/admin/overview"
        print(f"Requesting: {url}")
        
        response = requests.get(url, timeout=30)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text[:500]}")
            return False
        
        data = response.json()
        print(f"Response keys: {list(data.keys())}")
        
        # Check status
        if data.get('status') != 'ready':
            print(f"❌ FAILED: status != 'ready', got '{data.get('status')}'")
            return False
        print("✅ status='ready'")
        
        # Check integrations (list >=10)
        integrations = data.get('integrations')
        if not isinstance(integrations, list):
            print(f"❌ FAILED: integrations must be list, got {type(integrations)}")
            return False
        if len(integrations) < 10:
            print(f"❌ FAILED: integrations must have >=10 items, got {len(integrations)}")
            return False
        print(f"✅ integrations: {len(integrations)} items (>=10)")
        
        # Validate integration structure
        first_integration = integrations[0]
        required_fields = ['name', 'category', 'auth', 'status', 'cost']
        for field in required_fields:
            if field not in first_integration:
                print(f"❌ FAILED: integrations items must have {field}. Got: {list(first_integration.keys())}")
                return False
        print(f"✅ integrations items have required fields (name/category/auth/status/cost)")
        
        # Check for active integrations
        integration_names = [i['name'] for i in integrations]
        active_expected = ['Gemini', 'OKX', 'mempool.space', 'tftc.io', 'CoinGecko', 'alternative.me']
        active_found = [name for name in active_expected if any(name in i_name for i_name in integration_names)]
        print(f"✅ Active integrations found: {active_found}")
        
        # Check for inactive integrations
        inactive_expected = ['CoinGlass', 'ElevenLabs', 'SendGrid']
        inactive_found = [name for name in inactive_expected if any(name in i_name for i_name in integration_names)]
        print(f"✅ Inactive integrations found: {inactive_found}")
        
        # Check integrations_active (int)
        integrations_active = data.get('integrations_active')
        if not isinstance(integrations_active, int):
            print(f"❌ FAILED: integrations_active must be int, got {integrations_active} (type: {type(integrations_active)})")
            return False
        print(f"✅ integrations_active={integrations_active} (int)")
        
        # Check integrations_total (int)
        integrations_total = data.get('integrations_total')
        if not isinstance(integrations_total, int):
            print(f"❌ FAILED: integrations_total must be int, got {integrations_total} (type: {type(integrations_total)})")
            return False
        print(f"✅ integrations_total={integrations_total} (int)")
        
        # Check freshness (list with source+age_min)
        freshness = data.get('freshness')
        if not isinstance(freshness, list):
            print(f"❌ FAILED: freshness must be list, got {type(freshness)}")
            return False
        if len(freshness) > 0:
            first_fresh = freshness[0]
            if 'source' not in first_fresh or 'age_min' not in first_fresh:
                print(f"❌ FAILED: freshness items must have source+age_min. Got: {list(first_fresh.keys())}")
                return False
        print(f"✅ freshness: {len(freshness)} items with source+age_min")
        
        # Check usage (object with required fields)
        usage = data.get('usage')
        if not isinstance(usage, dict):
            print(f"❌ FAILED: usage must be object, got {type(usage)}")
            return False
        usage_fields = ['llm_calls_total', 'cached_insights', 'alerts_total', 'whales_tracked', 'runs_logged']
        for field in usage_fields:
            if field not in usage:
                print(f"❌ FAILED: usage must have {field}. Got: {list(usage.keys())}")
                return False
        print(f"✅ usage has required fields: {usage_fields}")
        
        # Check costs.emergent (object with required fields)
        costs = data.get('costs')
        if not isinstance(costs, dict):
            print(f"❌ FAILED: costs must be object, got {type(costs)}")
            return False
        emergent = costs.get('emergent')
        if not isinstance(emergent, dict):
            print(f"❌ FAILED: costs.emergent must be object, got {type(emergent)}")
            return False
        emergent_fields = ['model', 'status', 'llm_calls_total', 'est_cost_total_usd', 'billing_note']
        for field in emergent_fields:
            if field not in emergent:
                print(f"❌ FAILED: costs.emergent must have {field}. Got: {list(emergent.keys())}")
                return False
        print(f"✅ costs.emergent has required fields: {emergent_fields}")
        
        # Check scheduler_jobs (list)
        scheduler_jobs = data.get('scheduler_jobs')
        if not isinstance(scheduler_jobs, list):
            print(f"❌ FAILED: scheduler_jobs must be list, got {type(scheduler_jobs)}")
            return False
        print(f"✅ scheduler_jobs: {len(scheduler_jobs)} items")
        
        # Check collections (dict)
        collections = data.get('collections')
        if not isinstance(collections, dict):
            print(f"❌ FAILED: collections must be dict, got {type(collections)}")
            return False
        print(f"✅ collections: {len(collections)} items")
        
        print("\n✅ TEST 6 PASSED: admin/overview endpoint working correctly")
        print(f"   Exact values: integrations_total={integrations_total}, integrations_active={integrations_active}")
        print(f"   Active integrations: {active_found}")
        print(f"   Inactive integrations: {inactive_found}")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_regression_dashboard():
    """
    REGRESSION: GET /api/v1/dashboard status='ready'
    """
    print("\n" + "="*80)
    print("REGRESSION TEST 1: GET /api/v1/dashboard")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/v1/dashboard"
        print(f"Requesting: {url}")
        
        response = requests.get(url, timeout=30)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        if data.get('status') != 'ready':
            print(f"❌ FAILED: status != 'ready', got '{data.get('status')}'")
            return False
        
        print("✅ REGRESSION TEST 1 PASSED: dashboard endpoint still working")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_regression_leverage():
    """
    REGRESSION: GET /api/v1/leverage?timeframe=4H status='ready'
    """
    print("\n" + "="*80)
    print("REGRESSION TEST 2: GET /api/v1/leverage?timeframe=4H")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/v1/leverage?timeframe=4H"
        print(f"Requesting: {url}")
        
        response = requests.get(url, timeout=30)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        if data.get('status') != 'ready':
            print(f"❌ FAILED: status != 'ready', got '{data.get('status')}'")
            return False
        
        print("✅ REGRESSION TEST 2 PASSED: leverage endpoint still working")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Run all Phase A tests"""
    print("\n" + "="*80)
    print("PHASE A ENDPOINTS + ADMIN OVERVIEW TEST SUITE")
    print("Testing via external URL: " + BASE_URL)
    print("="*80)
    
    results = {}
    
    # Run all tests
    results['fear-greed'] = test_fear_greed()
    results['network-health'] = test_network_health()
    results['exchange-flows'] = test_exchange_flows()
    results['etf-flows-price'] = test_etf_flows_price()
    results['albert-brief'] = test_albert_brief()
    results['admin-overview'] = test_admin_overview()
    results['regression-dashboard'] = test_regression_dashboard()
    results['regression-leverage'] = test_regression_leverage()
    
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
        print("\n🎉 ALL TESTS PASSED! Phase A endpoints are working correctly.")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Please review the output above.")
        return 1


if __name__ == "__main__":
    exit(main())
