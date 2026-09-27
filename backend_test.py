#!/usr/bin/env python3
"""
Backend testing for TWO new features:
1. Bell Integration (unified notification feed)
2. Weekly Brief

Uses external /api base URL and FRESH test PIDs.
Cleans up all test data at the end.
"""

import requests
import uuid
import datetime
import time
from pymongo import MongoClient
import os
from dotenv import load_dotenv

load_dotenv('/app/.env')

# Configuration
BASE_URL = os.environ.get('NEXT_PUBLIC_BASE_URL', 'https://what-if-sandbox.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'btciq')

# MongoDB connection
client = MongoClient(MONGO_URL)
db = client[DB_NAME]
watchlist_alerts_col = db['albert_watchlist_alerts']
albert_notif_seen_col = db['albert_notif_seen']
order_ledger_col = db['albert_paper_ledger']
portfolio_risk_col = db['albert_portfolio_risk']
decision_history_col = db['albert_decision_history']

# Track test PIDs for cleanup
test_pids = []

def generate_test_pid(prefix):
    """Generate a fresh test PID with the given prefix."""
    pid = f"u_{prefix}_{uuid.uuid4().hex[:8]}"
    test_pids.append(pid)
    return pid

def cleanup_all():
    """Clean up all test data from MongoDB."""
    print("\n" + "="*80)
    print("CLEANUP: Removing all test data...")
    print("="*80)
    
    total_deleted = 0
    for pid in test_pids:
        # Clean up watchlist_alerts_col
        result = watchlist_alerts_col.delete_many({'pid': pid})
        if result.deleted_count > 0:
            print(f"✓ Deleted {result.deleted_count} watchlist alerts for {pid}")
            total_deleted += result.deleted_count
        
        # Clean up albert_notif_seen_col
        result = albert_notif_seen_col.delete_many({'_id': pid})
        if result.deleted_count > 0:
            print(f"✓ Deleted {result.deleted_count} notif_seen docs for {pid}")
            total_deleted += result.deleted_count
        
        # Clean up order_ledger_col
        result = order_ledger_col.delete_many({'pid': pid})
        if result.deleted_count > 0:
            print(f"✓ Deleted {result.deleted_count} order ledger entries for {pid}")
            total_deleted += result.deleted_count
        
        # Clean up portfolio_risk_col
        result = portfolio_risk_col.delete_many({'_id': pid})
        if result.deleted_count > 0:
            print(f"✓ Deleted {result.deleted_count} portfolio_risk docs for {pid}")
            total_deleted += result.deleted_count
        
        # Clean up decision_history_col
        result = decision_history_col.delete_many({'pid': pid})
        if result.deleted_count > 0:
            print(f"✓ Deleted {result.deleted_count} decision_history entries for {pid}")
            total_deleted += result.deleted_count
    
    print(f"\n✅ CLEANUP COMPLETE: Deleted {total_deleted} total documents for {len(test_pids)} test PIDs")
    print("="*80)

def test_feature_1_bell_integration():
    """Test FEATURE 1 — UNIFIED BELL FEED"""
    print("\n" + "="*80)
    print("FEATURE 1 — UNIFIED BELL FEED")
    print("="*80)
    
    # Test A: Empty pid
    print("\n--- TEST A: Empty pid ---")
    try:
        resp = requests.get(f"{API_BASE}/v1/albert/notifications", params={'pid': ''}, timeout=30)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert data.get('status') == 'ready', f"Expected status='ready', got {data.get('status')}"
        assert data.get('alerts') == [], f"Expected empty alerts, got {data.get('alerts')}"
        assert data.get('unseen') == 0, f"Expected unseen=0, got {data.get('unseen')}"
        print("✅ TEST A PASSED: Empty pid returns status='ready', alerts=[], unseen=0")
    except Exception as e:
        print(f"❌ TEST A FAILED: {e}")
        return False
    
    # Test B: Watchlist flip
    print("\n--- TEST B: Watchlist flip ---")
    pid_b = generate_test_pid('BELL')
    flip_id = uuid.uuid4().hex
    now_iso = datetime.datetime.utcnow().isoformat()
    
    try:
        # Insert a watchlist alert
        watchlist_alerts_col.insert_one({
            'id': flip_id,
            'pid': pid_b,
            'symbol': 'SOL',
            'fromCall': 'WAIT',
            'toCall': 'BUY',
            'at': now_iso,
            'seen': False
        })
        print(f"✓ Inserted watchlist alert: id={flip_id}, pid={pid_b}, SOL WAIT->BUY")
        
        # GET notifications
        resp = requests.get(f"{API_BASE}/v1/albert/notifications", params={'pid': pid_b}, timeout=30)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert data.get('status') == 'ready', f"Expected status='ready'"
        alerts = data.get('alerts', [])
        assert len(alerts) == 1, f"Expected 1 alert, got {len(alerts)}"
        
        alert = alerts[0]
        expected_id = f"flip_{flip_id}"
        assert alert.get('id') == expected_id, f"Expected id='{expected_id}', got {alert.get('id')}"
        assert alert.get('category') == 'flip', f"Expected category='flip', got {alert.get('category')}"
        assert alert.get('seen') == False, f"Expected seen=False, got {alert.get('seen')}"
        assert data.get('unseen') == 1, f"Expected unseen=1, got {data.get('unseen')}"
        print(f"✓ GET notifications returned 1 flip alert: id={expected_id}, category='flip', seen=False, unseen=1")
        
        # POST ack
        ack_resp = requests.post(f"{API_BASE}/v1/albert/notifications/ack", 
                                 json={'pid': pid_b, 'ids': [expected_id]}, timeout=30)
        assert ack_resp.status_code == 200, f"Expected 200, got {ack_resp.status_code}"
        ack_data = ack_resp.json()
        assert ack_data.get('acked', 0) >= 1, f"Expected acked>=1, got {ack_data.get('acked')}"
        print(f"✓ POST ack returned acked={ack_data.get('acked')}")
        
        # Verify watchlist_alerts_col doc now has seen=True
        doc = watchlist_alerts_col.find_one({'pid': pid_b, 'id': flip_id})
        assert doc is not None, "Watchlist alert doc not found"
        assert doc.get('seen') == True, f"Expected seen=True in DB, got {doc.get('seen')}"
        print(f"✓ Watchlist alert in DB now has seen=True")
        
        # GET again to verify seen=True, unseen=0
        resp2 = requests.get(f"{API_BASE}/v1/albert/notifications", params={'pid': pid_b}, timeout=30)
        data2 = resp2.json()
        alerts2 = data2.get('alerts', [])
        assert len(alerts2) == 1, f"Expected 1 alert, got {len(alerts2)}"
        assert alerts2[0].get('seen') == True, f"Expected seen=True, got {alerts2[0].get('seen')}"
        assert data2.get('unseen') == 0, f"Expected unseen=0, got {data2.get('unseen')}"
        print(f"✓ GET notifications again: alert seen=True, unseen=0")
        
        print("✅ TEST B PASSED: Watchlist flip alert lifecycle working correctly")
    except Exception as e:
        print(f"❌ TEST B FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Test C: Paper fill
    print("\n--- TEST C: Paper fill ---")
    pid_c = generate_test_pid('BELL')
    fill_id = str(uuid.uuid4())
    fill_ts = datetime.datetime.utcnow().isoformat()
    
    try:
        # Insert a paper fill
        order_ledger_col.insert_one({
            '_id': fill_id,
            'pid': pid_c,
            'accountId': 'paper',
            'orderIntentId': 'x',
            'asset': 'ETH',
            'side': 'BUY',
            'quantity': 1.0,
            'price': 2000.0,
            'usd': 2000.0,
            'ts': fill_ts
        })
        print(f"✓ Inserted paper fill: _id={fill_id}, pid={pid_c}, ETH BUY 1.0 @ $2000")
        
        # GET notifications
        resp = requests.get(f"{API_BASE}/v1/albert/notifications", params={'pid': pid_c}, timeout=30)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        alerts = data.get('alerts', [])
        assert len(alerts) == 1, f"Expected 1 alert, got {len(alerts)}"
        
        alert = alerts[0]
        expected_id = f"fill_{fill_id}"
        assert alert.get('id') == expected_id, f"Expected id='{expected_id}', got {alert.get('id')}"
        assert alert.get('category') == 'fill', f"Expected category='fill', got {alert.get('category')}"
        assert alert.get('severity') == 'success', f"Expected severity='success', got {alert.get('severity')}"
        assert alert.get('seen') == False, f"Expected seen=False, got {alert.get('seen')}"
        print(f"✓ GET notifications returned 1 fill alert: id={expected_id}, category='fill', severity='success', seen=False")
        
        # POST ack by id
        ack_resp = requests.post(f"{API_BASE}/v1/albert/notifications/ack", 
                                 json={'pid': pid_c, 'ids': [expected_id]}, timeout=30)
        assert ack_resp.status_code == 200, f"Expected 200, got {ack_resp.status_code}"
        print(f"✓ POST ack successful")
        
        # Verify albert_notif_seen_col contains the id
        seen_doc = albert_notif_seen_col.find_one({'_id': pid_c})
        assert seen_doc is not None, "Notif seen doc not found"
        assert expected_id in seen_doc.get('ids', []), f"Expected {expected_id} in ids array"
        print(f"✓ albert_notif_seen_col for pid contains {expected_id}")
        
        # GET again to verify seen=True
        resp2 = requests.get(f"{API_BASE}/v1/albert/notifications", params={'pid': pid_c}, timeout=30)
        data2 = resp2.json()
        alerts2 = data2.get('alerts', [])
        assert len(alerts2) == 1, f"Expected 1 alert, got {len(alerts2)}"
        assert alerts2[0].get('seen') == True, f"Expected seen=True, got {alerts2[0].get('seen')}"
        print(f"✓ GET notifications again: fill alert seen=True")
        
        print("✅ TEST C PASSED: Paper fill alert lifecycle working correctly")
    except Exception as e:
        print(f"❌ TEST C FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Test D: Ack all (no ids)
    print("\n--- TEST D: Ack all (no ids) ---")
    pid_d = generate_test_pid('BELL')
    flip_id_d = uuid.uuid4().hex
    fill_id_d = str(uuid.uuid4())
    now_d = datetime.datetime.utcnow().isoformat()
    
    try:
        # Insert both a flip and a fill
        watchlist_alerts_col.insert_one({
            'id': flip_id_d,
            'pid': pid_d,
            'symbol': 'BTC',
            'fromCall': 'HOLD',
            'toCall': 'SELL',
            'at': now_d,
            'seen': False
        })
        order_ledger_col.insert_one({
            '_id': fill_id_d,
            'pid': pid_d,
            'accountId': 'paper',
            'orderIntentId': 'y',
            'asset': 'BTC',
            'side': 'SELL',
            'quantity': 0.5,
            'price': 80000.0,
            'usd': 40000.0,
            'ts': now_d
        })
        print(f"✓ Inserted flip and fill for pid={pid_d}")
        
        # GET notifications - should have 2 unseen
        resp = requests.get(f"{API_BASE}/v1/albert/notifications", params={'pid': pid_d}, timeout=30)
        data = resp.json()
        assert data.get('unseen') == 2, f"Expected unseen=2, got {data.get('unseen')}"
        print(f"✓ GET notifications: unseen=2")
        
        # POST ack with NO ids (ack all)
        ack_resp = requests.post(f"{API_BASE}/v1/albert/notifications/ack", 
                                 json={'pid': pid_d}, timeout=30)
        assert ack_resp.status_code == 200, f"Expected 200, got {ack_resp.status_code}"
        print(f"✓ POST ack (no ids) successful")
        
        # GET again - unseen should be 0
        resp2 = requests.get(f"{API_BASE}/v1/albert/notifications", params={'pid': pid_d}, timeout=30)
        data2 = resp2.json()
        assert data2.get('unseen') == 0, f"Expected unseen=0, got {data2.get('unseen')}"
        print(f"✓ GET notifications: unseen=0 (all marked seen)")
        
        print("✅ TEST D PASSED: Ack all (no ids) working correctly")
    except Exception as e:
        print(f"❌ TEST D FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Test E: Ordering (ts desc)
    print("\n--- TEST E: Ordering (ts desc) ---")
    pid_e = generate_test_pid('BELL')
    
    try:
        # Create timestamps: flip LATER than fill
        fill_ts = datetime.datetime.utcnow()
        flip_ts = fill_ts + datetime.timedelta(seconds=10)
        
        flip_id_e = uuid.uuid4().hex
        fill_id_e = str(uuid.uuid4())
        
        # Insert fill first (earlier timestamp)
        order_ledger_col.insert_one({
            '_id': fill_id_e,
            'pid': pid_e,
            'accountId': 'paper',
            'orderIntentId': 'z',
            'asset': 'ADA',
            'side': 'BUY',
            'quantity': 100.0,
            'price': 0.5,
            'usd': 50.0,
            'ts': fill_ts.isoformat()
        })
        
        # Insert flip second (later timestamp)
        watchlist_alerts_col.insert_one({
            'id': flip_id_e,
            'pid': pid_e,
            'symbol': 'ADA',
            'fromCall': 'WAIT',
            'toCall': 'BUY',
            'at': flip_ts.isoformat(),
            'seen': False
        })
        print(f"✓ Inserted fill at {fill_ts.isoformat()}")
        print(f"✓ Inserted flip at {flip_ts.isoformat()} (10s later)")
        
        # GET notifications
        resp = requests.get(f"{API_BASE}/v1/albert/notifications", params={'pid': pid_e}, timeout=30)
        data = resp.json()
        alerts = data.get('alerts', [])
        assert len(alerts) == 2, f"Expected 2 alerts, got {len(alerts)}"
        
        # First alert should be the flip (later timestamp)
        first_alert = alerts[0]
        assert first_alert.get('category') == 'flip', f"Expected first alert to be 'flip', got {first_alert.get('category')}"
        assert first_alert.get('id') == f"flip_{flip_id_e}", f"Expected flip alert first"
        
        # Second alert should be the fill (earlier timestamp)
        second_alert = alerts[1]
        assert second_alert.get('category') == 'fill', f"Expected second alert to be 'fill', got {second_alert.get('category')}"
        assert second_alert.get('id') == f"fill_{fill_id_e}", f"Expected fill alert second"
        
        print(f"✓ Alerts correctly ordered by ts desc: flip (later) appears first, fill (earlier) appears second")
        print("✅ TEST E PASSED: Ordering (ts desc) working correctly")
    except Exception as e:
        print(f"❌ TEST E FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    print("\n" + "="*80)
    print("✅ FEATURE 1 — ALL TESTS PASSED (5/5)")
    print("="*80)
    return True

def test_feature_2_weekly_brief():
    """Test FEATURE 2 — WEEKLY BRIEF"""
    print("\n" + "="*80)
    print("FEATURE 2 — WEEKLY BRIEF")
    print("="*80)
    
    # Test A: No pid, fresh pid with no data
    print("\n--- TEST A: No pid, fresh pid with no data ---")
    
    # A1: No pid
    try:
        resp = requests.get(f"{API_BASE}/v1/albert/weekly-brief", params={}, timeout=60)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert 'error' in data, f"Expected 'error' field, got {data}"
        assert data.get('error') == 'pid required', f"Expected error='pid required', got {data.get('error')}"
        print("✓ No pid returns error='pid required'")
    except Exception as e:
        print(f"❌ TEST A1 FAILED: {e}")
        return False
    
    # A2: Fresh pid with no data
    pid_a = generate_test_pid('WK')
    try:
        resp = requests.get(f"{API_BASE}/v1/albert/weekly-brief", params={'pid': pid_a}, timeout=60)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert data.get('status') == 'ready', f"Expected status='ready', got {data.get('status')}"
        assert data.get('empty') == True, f"Expected empty=True, got {data.get('empty')}"
        
        calls = data.get('calls', {})
        fills = data.get('fills', {})
        recoveries = data.get('recoveries', {})
        
        assert calls.get('total') == 0, f"Expected calls.total=0, got {calls.get('total')}"
        assert fills.get('total') == 0, f"Expected fills.total=0, got {fills.get('total')}"
        assert recoveries.get('total') == 0, f"Expected recoveries.total=0, got {recoveries.get('total')}"
        
        albert_line = data.get('albertLine', '')
        assert len(albert_line) > 0, f"Expected non-empty albertLine, got '{albert_line}'"
        print(f"✓ Fresh pid returns status='ready', empty=True, all totals=0, albertLine='{albert_line[:50]}...'")
        
        print("✅ TEST A PASSED: No pid and fresh pid handling working correctly")
    except Exception as e:
        print(f"❌ TEST A2 FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Test B: Seed data within 7 days
    print("\n--- TEST B: Seed data within 7 days ---")
    pid_b = generate_test_pid('WK')
    
    try:
        # Calculate timestamps
        now = datetime.datetime.utcnow()
        within_7d = now - datetime.timedelta(days=3)  # 3 days ago
        older_than_7d = now - datetime.timedelta(days=10)  # 10 days ago
        
        # Seed decision_history events within 7 days
        decision_history_col.insert_one({
            'pid': pid_b,
            'asset': 'ETH',
            'changedAt': within_7d.isoformat(),
            'toLabel': 'Buy',
            'headline': 'Wait -> Buy',
            'changeType': 'WAIT->BUY'
        })
        decision_history_col.insert_one({
            'pid': pid_b,
            'asset': 'BTC',
            'changedAt': within_7d.isoformat(),
            'toLabel': 'Exit 100%',
            'headline': 'Hold -> Exit 100%',
            'changeType': 'HOLD->SELL'
        })
        print(f"✓ Inserted 2 decision_history events within 7 days (1 Buy, 1 Exit 100%)")
        
        # Seed order_ledger fills within 7 days
        order_ledger_col.insert_one({
            '_id': str(uuid.uuid4()),
            'pid': pid_b,
            'accountId': 'paper',
            'orderIntentId': 'intent1',
            'asset': 'ETH',
            'side': 'BUY',
            'quantity': 1.0,
            'price': 2000.0,
            'usd': 2000.0,
            'ts': within_7d.isoformat()
        })
        order_ledger_col.insert_one({
            '_id': str(uuid.uuid4()),
            'pid': pid_b,
            'accountId': 'paper',
            'orderIntentId': 'intent2',
            'asset': 'BTC',
            'side': 'SELL',
            'quantity': 0.01,
            'price': 50000.0,
            'usd': 500.0,
            'ts': within_7d.isoformat()
        })
        print(f"✓ Inserted 2 order_ledger fills within 7 days (1 BUY $2000, 1 SELL $500)")
        
        # Seed an event OLDER than 7 days (should be excluded)
        decision_history_col.insert_one({
            'pid': pid_b,
            'asset': 'SOL',
            'changedAt': older_than_7d.isoformat(),
            'toLabel': 'Buy',
            'headline': 'Wait -> Buy',
            'changeType': 'WAIT->BUY'
        })
        print(f"✓ Inserted 1 decision_history event OLDER than 7 days (should be excluded)")
        
        # GET weekly-brief with refresh=true
        resp = requests.get(f"{API_BASE}/v1/albert/weekly-brief", 
                           params={'pid': pid_b, 'refresh': 'true'}, timeout=60)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        
        assert data.get('status') == 'ready', f"Expected status='ready'"
        assert data.get('empty') == False, f"Expected empty=False, got {data.get('empty')}"
        
        calls = data.get('calls', {})
        fills = data.get('fills', {})
        
        # Verify calls
        assert calls.get('total') == 2, f"Expected calls.total=2, got {calls.get('total')}"
        assert calls.get('buys') >= 1, f"Expected calls.buys>=1, got {calls.get('buys')}"
        assert calls.get('sells') >= 1, f"Expected calls.sells>=1, got {calls.get('sells')}"
        print(f"✓ calls.total={calls.get('total')}, buys={calls.get('buys')}, sells={calls.get('sells')}")
        
        # Verify fills
        assert fills.get('total') == 2, f"Expected fills.total=2, got {fills.get('total')}"
        assert fills.get('buys') == 1, f"Expected fills.buys=1, got {fills.get('buys')}"
        assert fills.get('sells') == 1, f"Expected fills.sells=1, got {fills.get('sells')}"
        assert fills.get('totalBuyUsd') == 2000.0, f"Expected totalBuyUsd=2000.0, got {fills.get('totalBuyUsd')}"
        assert fills.get('totalSellUsd') == 500.0, f"Expected totalSellUsd=500.0, got {fills.get('totalSellUsd')}"
        print(f"✓ fills.total={fills.get('total')}, buys={fills.get('buys')}, sells={fills.get('sells')}, totalBuyUsd={fills.get('totalBuyUsd')}, totalSellUsd={fills.get('totalSellUsd')}")
        
        # Verify old event is excluded (calls.total should be 2, not 3)
        assert calls.get('total') == 2, f"Old event should be excluded, expected calls.total=2, got {calls.get('total')}"
        print(f"✓ Event older than 7 days correctly excluded")
        
        print("✅ TEST B PASSED: Data aggregation within 7 days working correctly")
    except Exception as e:
        print(f"❌ TEST B FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Test C: Cache behavior and albertLine validation
    print("\n--- TEST C: Cache behavior and albertLine validation ---")
    pid_c = generate_test_pid('WK')
    
    try:
        # Seed some data
        within_7d = datetime.datetime.utcnow() - datetime.timedelta(days=2)
        decision_history_col.insert_one({
            'pid': pid_c,
            'asset': 'ETH',
            'changedAt': within_7d.isoformat(),
            'toLabel': 'Buy',
            'headline': 'Wait -> Buy',
            'changeType': 'WAIT->BUY'
        })
        
        # First call with refresh=true (recompute)
        start_time = time.time()
        resp1 = requests.get(f"{API_BASE}/v1/albert/weekly-brief", 
                            params={'pid': pid_c, 'refresh': 'true'}, timeout=60)
        time1 = time.time() - start_time
        assert resp1.status_code == 200, f"Expected 200, got {resp1.status_code}"
        data1 = resp1.json()
        print(f"✓ refresh=true call took {time1:.2f}s")
        
        # Second call with refresh=false (cached)
        start_time = time.time()
        resp2 = requests.get(f"{API_BASE}/v1/albert/weekly-brief", 
                            params={'pid': pid_c, 'refresh': 'false'}, timeout=60)
        time2 = time.time() - start_time
        assert resp2.status_code == 200, f"Expected 200, got {resp2.status_code}"
        data2 = resp2.json()
        print(f"✓ refresh=false call took {time2:.2f}s (should be faster, cached)")
        
        # Verify both return same data
        assert data1.get('calls', {}).get('total') == data2.get('calls', {}).get('total'), "Cached data should match"
        print(f"✓ Cached response matches recomputed response")
        
        # Verify albertLine is present and qualitative (no $ or %)
        albert_line = data1.get('albertLine', '')
        assert len(albert_line) > 0, f"Expected non-empty albertLine"
        assert '$' not in albert_line, f"albertLine should not contain '$', got: {albert_line}"
        assert '%' not in albert_line, f"albertLine should not contain '%', got: {albert_line}"
        print(f"✓ albertLine present and qualitative (no $ or %): '{albert_line[:80]}...'")
        
        print("✅ TEST C PASSED: Cache behavior and albertLine validation working correctly")
    except Exception as e:
        print(f"❌ TEST C FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    print("\n" + "="*80)
    print("✅ FEATURE 2 — ALL TESTS PASSED (3/3)")
    print("="*80)
    return True

def main():
    """Run all tests."""
    print("\n" + "="*80)
    print("BACKEND TESTING: Bell Integration + Weekly Brief")
    print(f"API Base: {API_BASE}")
    print(f"MongoDB: {MONGO_URL}/{DB_NAME}")
    print("="*80)
    
    try:
        # Test Feature 1
        feature1_passed = test_feature_1_bell_integration()
        
        # Test Feature 2
        feature2_passed = test_feature_2_weekly_brief()
        
        # Cleanup
        cleanup_all()
        
        # Final summary
        print("\n" + "="*80)
        print("FINAL SUMMARY")
        print("="*80)
        if feature1_passed and feature2_passed:
            print("✅ ALL TESTS PASSED (8/8)")
            print("  • Feature 1 (Bell Integration): 5/5 tests passed")
            print("  • Feature 2 (Weekly Brief): 3/3 tests passed")
            return 0
        else:
            print("❌ SOME TESTS FAILED")
            if not feature1_passed:
                print("  • Feature 1 (Bell Integration): FAILED")
            if not feature2_passed:
                print("  • Feature 2 (Weekly Brief): FAILED")
            return 1
    except Exception as e:
        print(f"\n❌ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        cleanup_all()
        return 1

if __name__ == '__main__':
    exit(main())
