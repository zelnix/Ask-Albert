#!/usr/bin/env python3
"""
Whale Intelligence Backend Test Suite (Phases 1-3)
Tests ETF Flows, Whale History/Impact, and Large Transaction Feed endpoints
"""

import requests
import json
import sys
import time
from typing import Dict, List, Any

# Base URL from environment
BASE_URL = "https://what-if-sandbox.preview.emergentagent.com/api"

def print_test_header(test_name: str):
    """Print a formatted test header"""
    print(f"\n{'='*80}")
    print(f"TEST: {test_name}")
    print(f"{'='*80}")

def print_success(message: str):
    """Print success message"""
    print(f"✅ {message}")

def print_error(message: str):
    """Print error message"""
    print(f"❌ {message}")

def print_info(message: str):
    """Print info message"""
    print(f"ℹ️  {message}")

def print_warning(message: str):
    """Print warning message"""
    print(f"⚠️  {message}")

# ============================================================================
# PHASE 1: ETF FLOWS
# ============================================================================

def test_etf_flows():
    """Test GET /api/v1/etf-flows - ETF daily net flows"""
    print_test_header("PHASE 1.1: GET /api/v1/etf-flows")
    
    try:
        url = f"{BASE_URL}/v1/etf-flows"
        print_info(f"Requesting: {url}")
        
        response = requests.get(url, timeout=60)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_error(f"Expected status 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        # Validate status
        if data.get('status') != 'ready':
            print_error(f"Expected status='ready', got '{data.get('status')}'")
            return False
        print_success("Response status is 'ready'")
        
        # Validate unit
        if data.get('unit') != 'USD millions':
            print_error(f"Expected unit='USD millions', got '{data.get('unit')}'")
            return False
        print_success("Unit is 'USD millions'")
        
        # Validate issuers includes IBIT
        issuers = data.get('issuers', [])
        if 'IBIT' not in issuers:
            print_error(f"Expected 'IBIT' in issuers, got: {issuers}")
            return False
        print_success(f"Issuers includes 'IBIT' (total {len(issuers)} issuers)")
        
        # Validate daily data
        daily = data.get('daily', [])
        if not daily:
            print_error("Daily data is empty")
            return False
        print_success(f"Daily data has {len(daily)} entries")
        
        # Check first daily entry structure
        first_entry = daily[0]
        if 'date' not in first_entry:
            print_error("Daily entry missing 'date' field")
            return False
        if 'flows' not in first_entry or not isinstance(first_entry['flows'], dict):
            print_error("Daily entry missing 'flows' dict")
            return False
        if 'total' not in first_entry or not isinstance(first_entry['total'], (int, float)):
            print_error("Daily entry missing numeric 'total'")
            return False
        print_success(f"Daily entry structure valid (date={first_entry['date']}, total={first_entry['total']})")
        
        # Validate net flows
        net_1d = data.get('net_1d')
        net_7d = data.get('net_7d')
        net_30d = data.get('net_30d')
        
        if not isinstance(net_1d, (int, float)):
            print_error(f"net_1d is not numeric: {net_1d}")
            return False
        if not isinstance(net_7d, (int, float)):
            print_error(f"net_7d is not numeric: {net_7d}")
            return False
        if not isinstance(net_30d, (int, float)):
            print_error(f"net_30d is not numeric: {net_30d}")
            return False
        print_success(f"Net flows: 1d=${net_1d}M, 7d=${net_7d}M, 30d=${net_30d}M")
        
        # Validate cumulative data
        cumulative = data.get('cumulative', [])
        if not cumulative:
            print_error("Cumulative data is empty")
            return False
        print_success(f"Cumulative data has {len(cumulative)} entries")
        
        # Validate leaderboard
        leaderboard = data.get('leaderboard', [])
        if not leaderboard:
            print_error("Leaderboard is empty")
            return False
        print_success(f"Leaderboard has {len(leaderboard)} entries")
        
        # Validate summary
        summary = data.get('summary')
        if not summary:
            print_error("Summary is missing")
            return False
        print_success("Summary present")
        
        print_success("✅ PHASE 1.1 PASSED: ETF flows endpoint returns REAL data")
        return True
        
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

def test_etf_flows_refresh():
    """Test GET /api/v1/etf-flows?refresh=1"""
    print_test_header("PHASE 1.2: GET /api/v1/etf-flows?refresh=1")
    
    try:
        url = f"{BASE_URL}/v1/etf-flows?refresh=1"
        print_info(f"Requesting: {url}")
        
        response = requests.get(url, timeout=60)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_error(f"Expected status 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        if data.get('status') != 'ready':
            print_error(f"Expected status='ready', got '{data.get('status')}'")
            return False
        
        print_success("✅ PHASE 1.2 PASSED: refresh=1 works without 500 error")
        return True
        
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

def test_dashboard_etf_metrics():
    """Test GET /api/v1/dashboard - institutional panel has ETF metrics"""
    print_test_header("PHASE 1.3: GET /api/v1/dashboard - ETF metrics in institutional panel")
    
    try:
        url = f"{BASE_URL}/v1/dashboard"
        print_info(f"Requesting: {url}")
        
        response = requests.get(url, timeout=60)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_error(f"Expected status 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        if data.get('status') != 'ready':
            print_error(f"Expected status='ready', got '{data.get('status')}'")
            return False
        
        # Check institutional panel
        institutional = data.get('institutional')
        if not institutional:
            print_error("Missing 'institutional' field")
            return False
        
        metrics = institutional.get('metrics', [])
        if not metrics:
            print_error("Institutional metrics is empty")
            return False
        
        # Find ETF flow metrics
        etf_1d_found = False
        etf_7d_found = False
        
        for metric in metrics:
            name = metric.get('name', '')
            if 'Spot ETF net flow (1d)' in name:
                etf_1d_found = True
                # Check it's NOT marked inactive
                if metric.get('inactive'):
                    print_error("'Spot ETF net flow (1d)' is marked inactive")
                    return False
                # Check it has a value with $ and M
                value = metric.get('value', '')
                if not ('$' in str(value) and 'M' in str(value)):
                    print_error(f"'Spot ETF net flow (1d)' value doesn't match '$...M' pattern: {value}")
                    return False
                # Check it has a spark array
                if 'spark' not in metric or not isinstance(metric['spark'], list):
                    print_error("'Spot ETF net flow (1d)' missing 'spark' array")
                    return False
                print_success(f"'Spot ETF net flow (1d)' found: value={value}, spark={len(metric['spark'])} points")
            
            if 'Spot ETF net flow (7d)' in name:
                etf_7d_found = True
                print_success(f"'Spot ETF net flow (7d)' found")
        
        if not etf_1d_found:
            print_error("'Spot ETF net flow (1d)' metric NOT found in institutional panel")
            return False
        
        if not etf_7d_found:
            print_error("'Spot ETF net flow (7d)' metric NOT found in institutional panel")
            return False
        
        # Check source mentions Farside/bitbo
        source = institutional.get('source', '')
        if 'Farside' not in source and 'bitbo' not in source:
            print_error(f"Source doesn't mention 'Farside/bitbo': {source}")
            return False
        print_success(f"Source mentions Farside/bitbo: {source}")
        
        print_success("✅ PHASE 1.3 PASSED: Dashboard institutional panel has REAL ETF metrics")
        return True
        
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

# ============================================================================
# PHASE 2: WHALE HISTORY + IMPACT
# ============================================================================

def test_whale_history_dormant():
    """Test GET /api/v1/whales/history for dormant whale"""
    print_test_header("PHASE 2.1: GET /api/v1/whales/history (dormant whale)")
    
    try:
        address = "1FeexV6bAHb8ybZjqQMjJrcCrHGW9sb6uF"
        url = f"{BASE_URL}/v1/whales/history?address={address}"
        print_info(f"Requesting: {url}")
        print_warning("This may take 30-60s on first call (reconstructs from mempool.space)")
        
        response = requests.get(url, timeout=90)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_error(f"Expected status 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        # Validate status
        if data.get('status') != 'ready':
            print_error(f"Expected status='ready', got '{data.get('status')}'")
            return False
        print_success("Response status is 'ready'")
        
        # Validate points
        points = data.get('points', [])
        if not points:
            print_error("Points array is empty")
            return False
        print_success(f"Points array has {len(points)} entries")
        
        # Check first point structure
        first_point = points[0]
        if 'date' not in first_point:
            print_error("Point missing 'date' field")
            return False
        if 'bal' not in first_point or not isinstance(first_point['bal'], (int, float)):
            print_error("Point missing numeric 'bal' field")
            return False
        if 'usd' not in first_point or not isinstance(first_point['usd'], (int, float)):
            print_error("Point missing numeric 'usd' field")
            return False
        print_success(f"Point structure valid (date={first_point['date']}, bal={first_point['bal']}, usd={first_point['usd']})")
        
        # Validate change fields
        change_30d = data.get('change_30d')
        change_90d = data.get('change_90d')
        
        if not isinstance(change_30d, (int, float)):
            print_error(f"change_30d is not numeric: {change_30d}")
            return False
        if not isinstance(change_90d, (int, float)):
            print_error(f"change_90d is not numeric: {change_90d}")
            return False
        print_success(f"Change fields: 30d={change_30d}, 90d={change_90d}")
        
        # Validate span
        span_from = data.get('span_from')
        span_to = data.get('span_to')
        
        if not span_from or not span_to:
            print_error("Missing span_from or span_to")
            return False
        if span_from > span_to:
            print_error(f"span_from ({span_from}) > span_to ({span_to})")
            return False
        print_success(f"Span: {span_from} to {span_to}")
        
        # Validate balance
        balance = data.get('balance')
        if not isinstance(balance, (int, float)) or balance <= 0:
            print_error(f"Invalid balance: {balance}")
            return False
        print_success(f"Balance: {balance} BTC")
        
        print_success("✅ PHASE 2.1 PASSED: Whale history for dormant whale returns REAL data")
        return True
        
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

def test_whale_history_exchange():
    """Test GET /api/v1/whales/history for exchange address"""
    print_test_header("PHASE 2.2: GET /api/v1/whales/history (exchange address)")
    
    try:
        address = "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo"  # Binance
        url = f"{BASE_URL}/v1/whales/history?address={address}"
        print_info(f"Requesting: {url}")
        print_warning("This may take 30-60s on first call")
        
        response = requests.get(url, timeout=90)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_error(f"Expected status 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        # Validate status (should be 'ready' or 'empty', NOT 500)
        status = data.get('status')
        if status not in ['ready', 'empty']:
            print_error(f"Expected status='ready' or 'empty', got '{status}'")
            return False
        print_success(f"Response status is '{status}' (no 500 error)")
        
        if status == 'ready':
            points = data.get('points', [])
            print_success(f"Exchange history has {len(points)} points")
        
        print_success("✅ PHASE 2.2 PASSED: Exchange address returns valid response (no 500)")
        return True
        
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

def test_whale_history_refresh():
    """Test GET /api/v1/whales/history?refresh=1"""
    print_test_header("PHASE 2.3: GET /api/v1/whales/history?refresh=1")
    
    try:
        address = "1FeexV6bAHb8ybZjqQMjJrcCrHGW9sb6uF"
        url = f"{BASE_URL}/v1/whales/history?address={address}&refresh=1"
        print_info(f"Requesting: {url}")
        
        response = requests.get(url, timeout=90)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_error(f"Expected status 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        if data.get('status') != 'ready':
            print_error(f"Expected status='ready', got '{data.get('status')}'")
            return False
        
        print_success("✅ PHASE 2.3 PASSED: refresh=1 works without 500 error")
        return True
        
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

def test_whale_impact():
    """Test GET /api/v1/whales/impact"""
    print_test_header("PHASE 2.4: GET /api/v1/whales/impact")
    
    try:
        url = f"{BASE_URL}/v1/whales/impact"
        print_info(f"Requesting: {url}")
        print_warning("FIRST CALL MAY TAKE 30-60s (reconstructs all 10 whales)")
        
        response = requests.get(url, timeout=90)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_error(f"Expected status 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        # Validate status
        if data.get('status') != 'ready':
            print_error(f"Expected status='ready', got '{data.get('status')}'")
            return False
        print_success("Response status is 'ready'")
        
        # Validate total_balance
        total_balance = data.get('total_balance')
        if not isinstance(total_balance, (int, float)) or total_balance <= 0:
            print_error(f"Invalid total_balance: {total_balance}")
            return False
        print_success(f"Total balance: {total_balance} BTC")
        
        # Validate total_usd
        total_usd = data.get('total_usd')
        if not isinstance(total_usd, (int, float)):
            print_error(f"total_usd is not numeric: {total_usd}")
            return False
        print_success(f"Total USD: ${total_usd:,.0f}")
        
        # Validate holder_balance and exchange_balance
        holder_balance = data.get('holder_balance')
        exchange_balance = data.get('exchange_balance')
        
        if not isinstance(holder_balance, (int, float)):
            print_error(f"holder_balance is not numeric: {holder_balance}")
            return False
        if not isinstance(exchange_balance, (int, float)):
            print_error(f"exchange_balance is not numeric: {exchange_balance}")
            return False
        print_success(f"Holder balance: {holder_balance} BTC, Exchange balance: {exchange_balance} BTC")
        
        # Validate net_flow_30d
        net_flow_30d = data.get('net_flow_30d')
        if not isinstance(net_flow_30d, (int, float)):
            print_error(f"net_flow_30d is not numeric: {net_flow_30d}")
            return False
        print_success(f"Net flow 30d: {net_flow_30d} BTC")
        
        # Validate trend
        trend = data.get('trend')
        if trend not in ['Accumulation', 'Distribution', 'Neutral']:
            print_error(f"Invalid trend: {trend}")
            return False
        print_success(f"Trend: {trend}")
        
        # Validate contributors
        contributors = data.get('contributors', [])
        if not contributors:
            print_error("Contributors list is empty")
            return False
        print_success(f"Contributors: {len(contributors)} entries")
        
        # Check first contributor structure
        first_contrib = contributors[0]
        required_fields = ['name', 'category', 'address', 'delta_30d', 'signal']
        for field in required_fields:
            if field not in first_contrib:
                print_error(f"Contributor missing '{field}' field")
                return False
        
        if first_contrib['signal'] not in ['Bullish', 'Bearish']:
            print_error(f"Invalid signal: {first_contrib['signal']}")
            return False
        
        print_success(f"Contributor structure valid (name={first_contrib['name']}, signal={first_contrib['signal']})")
        
        print_success("✅ PHASE 2.4 PASSED: Whale impact returns REAL data")
        return True
        
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

# ============================================================================
# PHASE 3: LABELED LARGE-TRANSACTION FEED
# ============================================================================

def test_whale_transactions():
    """Test GET /api/v1/whales/transactions?min_btc=50&limit=40"""
    print_test_header("PHASE 3.1: GET /api/v1/whales/transactions?min_btc=50&limit=40")
    
    try:
        url = f"{BASE_URL}/v1/whales/transactions?min_btc=50&limit=40"
        print_info(f"Requesting: {url}")
        print_warning("FIRST CALL MAY TAKE 30-60s")
        
        response = requests.get(url, timeout=90)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_error(f"Expected status 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        # Validate status
        if data.get('status') != 'ready':
            print_error(f"Expected status='ready', got '{data.get('status')}'")
            return False
        print_success("Response status is 'ready'")
        
        # Validate feed
        feed = data.get('feed', [])
        if not feed:
            print_error("Feed is empty")
            return False
        print_success(f"Feed has {len(feed)} entries")
        
        # Check first entry structure
        first_entry = feed[0]
        required_fields = ['txid', 'entity', 'category', 'direction', 'amount', 'amount_usd', 'signal', 'impact', 'date']
        for field in required_fields:
            if field not in first_entry:
                print_error(f"Feed entry missing '{field}' field")
                return False
        
        # Validate direction
        if first_entry['direction'] not in ['in', 'out']:
            print_error(f"Invalid direction: {first_entry['direction']}")
            return False
        
        # Validate amount >= min_btc
        amount = first_entry['amount']
        if not isinstance(amount, (int, float)) or amount < 50:
            print_error(f"Amount {amount} is less than min_btc=50")
            return False
        
        # Validate amount_usd
        amount_usd = first_entry['amount_usd']
        if not isinstance(amount_usd, (int, float)):
            print_error(f"amount_usd is not numeric: {amount_usd}")
            return False
        
        # Validate signal
        if first_entry['signal'] not in ['Bullish', 'Bearish']:
            print_error(f"Invalid signal: {first_entry['signal']}")
            return False
        
        # Validate date is ISO format
        date = first_entry['date']
        if not isinstance(date, str) or 'T' not in date:
            print_error(f"Date is not ISO format: {date}")
            return False
        
        print_success(f"Feed entry structure valid (entity={first_entry['entity']}, amount={amount} BTC, signal={first_entry['signal']})")
        
        print_success("✅ PHASE 3.1 PASSED: Whale transactions returns REAL labeled data")
        return True
        
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

def test_whale_transactions_filter():
    """Test GET /api/v1/whales/transactions?min_btc=500 - verify filter works"""
    print_test_header("PHASE 3.2: GET /api/v1/whales/transactions?min_btc=500 (filter test)")
    
    try:
        url = f"{BASE_URL}/v1/whales/transactions?min_btc=500"
        print_info(f"Requesting: {url}")
        
        response = requests.get(url, timeout=90)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_error(f"Expected status 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        if data.get('status') != 'ready':
            print_error(f"Expected status='ready', got '{data.get('status')}'")
            return False
        
        feed = data.get('feed', [])
        print_info(f"Feed has {len(feed)} entries with min_btc=500")
        
        # Verify all amounts >= 500
        for entry in feed:
            amount = entry.get('amount', 0)
            if amount < 500:
                print_error(f"Found entry with amount {amount} < 500 BTC")
                return False
        
        print_success(f"All {len(feed)} entries have amount >= 500 BTC")
        print_success("✅ PHASE 3.2 PASSED: min_btc filter works correctly")
        return True
        
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

def test_whale_transactions_limit():
    """Test GET /api/v1/whales/transactions?limit=10 - verify limit is honored"""
    print_test_header("PHASE 3.3: GET /api/v1/whales/transactions?limit=10 (limit test)")
    
    try:
        url = f"{BASE_URL}/v1/whales/transactions?limit=10"
        print_info(f"Requesting: {url}")
        
        response = requests.get(url, timeout=90)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_error(f"Expected status 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        if data.get('status') != 'ready':
            print_error(f"Expected status='ready', got '{data.get('status')}'")
            return False
        
        feed = data.get('feed', [])
        
        if len(feed) > 10:
            print_error(f"Feed has {len(feed)} entries, expected <= 10")
            return False
        
        print_success(f"Feed has {len(feed)} entries (limit honored)")
        print_success("✅ PHASE 3.3 PASSED: limit parameter works correctly")
        return True
        
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

def test_whale_transactions_refresh():
    """Test GET /api/v1/whales/transactions?refresh=1"""
    print_test_header("PHASE 3.4: GET /api/v1/whales/transactions?refresh=1")
    
    try:
        url = f"{BASE_URL}/v1/whales/transactions?refresh=1"
        print_info(f"Requesting: {url}")
        
        response = requests.get(url, timeout=90)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_error(f"Expected status 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        if data.get('status') != 'ready':
            print_error(f"Expected status='ready', got '{data.get('status')}'")
            return False
        
        print_success("✅ PHASE 3.4 PASSED: refresh=1 works without 500 error")
        return True
        
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

# ============================================================================
# REGRESSION TESTS
# ============================================================================

def test_dashboard_regression():
    """Test GET /api/v1/dashboard - regression test"""
    print_test_header("REGRESSION 1: GET /api/v1/dashboard")
    
    try:
        url = f"{BASE_URL}/v1/dashboard"
        print_info(f"Requesting: {url}")
        
        response = requests.get(url, timeout=60)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_error(f"Expected status 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        if data.get('status') != 'ready':
            print_error(f"Expected status='ready', got '{data.get('status')}'")
            return False
        
        # Check key fields exist
        required_fields = ['decision', 'risk', 'forecasts', 'quant_score', 'smart_money', 'smart_alerts']
        for field in required_fields:
            if field not in data:
                print_error(f"Missing required field: {field}")
                return False
        
        print_success(f"All required fields present: {', '.join(required_fields)}")
        print_success("✅ REGRESSION 1 PASSED: Dashboard still works")
        return True
        
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

def test_whales_regression():
    """Test GET /api/v1/whales - regression test"""
    print_test_header("REGRESSION 2: GET /api/v1/whales")
    
    try:
        url = f"{BASE_URL}/v1/whales"
        print_info(f"Requesting: {url}")
        
        response = requests.get(url, timeout=60)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_error(f"Expected status 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        if data.get('status') != 'ready':
            print_error(f"Expected status='ready', got '{data.get('status')}'")
            return False
        
        whales = data.get('whales', [])
        
        if len(whales) != 10:
            print_error(f"Expected 10 whales, got {len(whales)}")
            return False
        
        print_success(f"Returns 10 whales as expected")
        print_success("✅ REGRESSION 2 PASSED: Whales endpoint still works")
        return True
        
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================

def main():
    """Run all Whale Intelligence tests"""
    print("\n" + "="*80)
    print("WHALE INTELLIGENCE BACKEND TEST SUITE (PHASES 1-3)")
    print("="*80)
    
    results = {}
    
    # Phase 1: ETF Flows
    print("\n" + "="*80)
    print("PHASE 1: ETF FLOWS")
    print("="*80)
    results['etf_flows'] = test_etf_flows()
    results['etf_flows_refresh'] = test_etf_flows_refresh()
    results['dashboard_etf'] = test_dashboard_etf_metrics()
    
    # Phase 2: Whale History + Impact
    print("\n" + "="*80)
    print("PHASE 2: WHALE HISTORY + IMPACT")
    print("="*80)
    results['whale_history_dormant'] = test_whale_history_dormant()
    results['whale_history_exchange'] = test_whale_history_exchange()
    results['whale_history_refresh'] = test_whale_history_refresh()
    results['whale_impact'] = test_whale_impact()
    
    # Phase 3: Labeled Large-Transaction Feed
    print("\n" + "="*80)
    print("PHASE 3: LABELED LARGE-TRANSACTION FEED")
    print("="*80)
    results['whale_transactions'] = test_whale_transactions()
    results['whale_transactions_filter'] = test_whale_transactions_filter()
    results['whale_transactions_limit'] = test_whale_transactions_limit()
    results['whale_transactions_refresh'] = test_whale_transactions_refresh()
    
    # Regression Tests
    print("\n" + "="*80)
    print("REGRESSION TESTS")
    print("="*80)
    results['dashboard_regression'] = test_dashboard_regression()
    results['whales_regression'] = test_whales_regression()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    print(f"\nTotal Tests: {total}")
    print(f"Passed: {passed}")
    print(f"Failed: {total - passed}")
    
    print("\nDetailed Results:")
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {status}: {test_name}")
    
    if passed == total:
        print("\n" + "="*80)
        print("🎉 ALL TESTS PASSED!")
        print("="*80)
        return 0
    else:
        print("\n" + "="*80)
        print("❌ SOME TESTS FAILED")
        print("="*80)
        return 1

if __name__ == "__main__":
    sys.exit(main())
