"""Phase H Lifecycle Replay + Recovery Ledger backend testing.

Tests all 5 scenarios from test_result.md:
1. EMPTY/GRACEFUL - fresh unused pid
2. REAL JOURNEY (light) - seed mandate+portfolio, call /decisions 2x
3. SEEDED FULL JOURNEY (authoritative) - full frozen journey with mixed engine versions
4. RECOVERY LEDGER - portfolio risk recovery ledger with different drawdown scenarios
5. REGRESSION - existing endpoints still work

Uses EXTERNAL API base and FRESH test pids. Cleans up MongoDB collections at the end.
"""
import requests
import time
from config import (
    decision_snapshots_col, decision_history_col, order_intents_col,
    order_ledger_col, portfolio_col, mandate_col, portfolio_risk_col,
    decision_current_col, paper_portfolio_col
)

# External API base
BASE = 'https://what-if-sandbox.preview.emergentagent.com/api'

# Fresh test PIDs
PID_EMPTY = 'u_TEST_H_EMPTY'
PID_REAL = 'u_TEST_H_REAL'
PID_SEEDED = 'u_TEST_H_SEEDED'
PID_RECOVERY = 'u_TEST_H_RECOVERY'
PID_REGRESSION = 'u_TEST_H_REGRESSION'

ALL_PIDS = [PID_EMPTY, PID_REAL, PID_SEEDED, PID_RECOVERY, PID_REGRESSION]

results = []
def check(name, ok, detail=''):
    results.append(ok)
    status = '✅ PASS' if ok else '❌ FAIL'
    print(f'{status} - {name}' + (f' | {detail}' if detail else ''))
    return ok


def cleanup_all():
    """Clean up all test data from MongoDB collections."""
    print('\n=== CLEANUP ===')
    for col_name, col in [
        ('decision_snapshots', decision_snapshots_col),
        ('decision_history', decision_history_col),
        ('order_intents', order_intents_col),
        ('order_ledger', order_ledger_col),
        ('portfolio', portfolio_col),
        ('mandate', mandate_col),
        ('portfolio_risk', portfolio_risk_col),
        ('decision_current', decision_current_col),
        ('paper_portfolio', paper_portfolio_col),
    ]:
        deleted = 0
        for pid in ALL_PIDS:
            if col_name in ('portfolio', 'mandate', 'portfolio_risk', 'paper_portfolio'):
                result = col.delete_many({'_id': pid})
            else:
                result = col.delete_many({'pid': pid})
            deleted += result.deleted_count
        if deleted > 0:
            print(f'  Deleted {deleted} docs from {col_name}')
    print('=== CLEANUP COMPLETE ===\n')


def test_scenario_1_empty():
    """Scenario 1: EMPTY/GRACEFUL - fresh unused pid should return status 'empty'."""
    print('\n=== SCENARIO 1: EMPTY/GRACEFUL ===')
    
    try:
        # Test lifecycle endpoint with fresh unused pid
        resp = requests.get(f'{BASE}/v1/albert/lifecycle/BTC', params={'pid': PID_EMPTY}, timeout=30)
        check('GET /lifecycle/BTC returns 200', resp.status_code == 200, f'status={resp.status_code}')
        
        data = resp.json()
        check('status is "empty"', data.get('status') == 'empty', f'status={data.get("status")}')
        check('events is empty array', data.get('events') == [], f'events={data.get("events")}')
        
        # Check positionTrack has exactly one BASELINE node with size 0
        track = data.get('positionTrack', [])
        check('positionTrack has exactly 1 node', len(track) == 1, f'len={len(track)}')
        if len(track) == 1:
            baseline = track[0]
            check('BASELINE node has size 0', baseline.get('size') == 0.0, f'size={baseline.get("size")}')
            check('BASELINE node kind is "BASELINE"', baseline.get('kind') == 'BASELINE', f'kind={baseline.get("kind")}')
        
        check('no error/500', resp.status_code == 200 and 'error' not in data)
        
        # Test lifecycle-assets endpoint
        resp2 = requests.get(f'{BASE}/v1/albert/lifecycle-assets', params={'pid': PID_EMPTY}, timeout=30)
        check('GET /lifecycle-assets returns 200', resp2.status_code == 200, f'status={resp2.status_code}')
        
        data2 = resp2.json()
        check('assets is empty array', data2.get('assets') == [], f'assets={data2.get("assets")}')
        
    except Exception as e:
        check('Scenario 1 exception', False, str(e))


def test_scenario_2_real_journey():
    """Scenario 2: REAL JOURNEY (light) - seed mandate+portfolio, call /decisions 2x."""
    print('\n=== SCENARIO 2: REAL JOURNEY (light) ===')
    
    try:
        # Seed mandate
        mandate_data = {
            'pid': PID_REAL,
            'risk_tolerance': 'moderate',
            'reserve_pct': 25,
            'approved_coins': ['BTC', 'ETH', 'SOL'],
            'excluded_coins': [],
            'max_alloc_pct': {'BTC': 40, 'ETH': 30, 'SOL': 30},
            'max_trade_risk_pct': 2.0,
            'max_drawdown_pct': 20
        }
        resp = requests.post(f'{BASE}/v1/albert/mandate', json=mandate_data, timeout=30)
        check('POST /mandate returns 200', resp.status_code == 200, f'status={resp.status_code}')
        
        # Seed portfolio
        portfolio_data = {
            'pid': PID_REAL,
            'usdc': 50000.0,
            'positions': [{'asset': 'BTC', 'size': 0.1, 'avg_entry': 60000}]
        }
        resp = requests.post(f'{BASE}/v1/portfolio', json=portfolio_data, timeout=30)
        check('POST /portfolio returns 200', resp.status_code == 200, f'status={resp.status_code}')
        
        # Call /decisions first time to persist snapshots
        resp = requests.get(f'{BASE}/v1/albert/decisions', params={'pid': PID_REAL}, timeout=60)
        check('GET /decisions (1st call) returns 200', resp.status_code == 200, f'status={resp.status_code}')
        data1 = resp.json()
        check('decisions response has status', 'status' in data1, f'keys={list(data1.keys())}')
        
        # Wait a bit to ensure different timestamps
        time.sleep(2)
        
        # Call /decisions second time
        resp = requests.get(f'{BASE}/v1/albert/decisions', params={'pid': PID_REAL}, timeout=60)
        check('GET /decisions (2nd call) returns 200', resp.status_code == 200, f'status={resp.status_code}')
        
        # Now test lifecycle endpoint
        resp = requests.get(f'{BASE}/v1/albert/lifecycle/BTC', params={'pid': PID_REAL}, timeout=30)
        check('GET /lifecycle/BTC returns 200', resp.status_code == 200, f'status={resp.status_code}')
        
        data = resp.json()
        check('status is "ready"', data.get('status') == 'ready', f'status={data.get("status")}')
        
        events = data.get('events', [])
        check('at least 1 event', len(events) >= 1, f'eventCount={len(events)}')
        
        if len(events) >= 1:
            event = events[0]
            check('event.engineVersion is "albert-decide-v2"', 
                  event.get('engineVersion') == 'albert-decide-v2', 
                  f'engineVersion={event.get("engineVersion")}')
            check('snapshotId present', event.get('snapshotId') is not None, f'snapshotId={event.get("snapshotId")}')
            check('decisionInputsHash present', event.get('decisionInputsHash') is not None, 
                  f'hash={event.get("decisionInputsHash")}')
            
            stage = event.get('stage')
            check('stage in {WAIT,BUY,ADD,HOLD,TRIM,SELL}', 
                  stage in ['WAIT', 'BUY', 'ADD', 'HOLD', 'TRIM', 'SELL'], 
                  f'stage={stage}')
            
            # Check previousCall chain consistency
            prev_call = event.get('previousCall')
            check('first event previousCall is None', prev_call is None, f'previousCall={prev_call}')
        
        # Test lifecycle-assets
        resp = requests.get(f'{BASE}/v1/albert/lifecycle-assets', params={'pid': PID_REAL}, timeout=30)
        check('GET /lifecycle-assets returns 200', resp.status_code == 200, f'status={resp.status_code}')
        
        data2 = resp.json()
        assets = data2.get('assets', [])
        check('lifecycle-assets includes BTC', 'BTC' in assets, f'assets={assets}')
        
    except Exception as e:
        check('Scenario 2 exception', False, str(e))


def test_scenario_3_seeded_full_journey():
    """Scenario 3: SEEDED FULL JOURNEY (authoritative) - full frozen journey."""
    print('\n=== SCENARIO 3: SEEDED FULL JOURNEY (authoritative) ===')
    
    ASSET = 'TESTX'
    
    try:
        # Helper functions to seed data
        def snap(did, ts, env, ver):
            env = dict(env)
            env.update({'decisionId': did, 'snapshotId': 'S_' + did, 'engineVersion': ver,
                        'decisionInputsHash': 'H_' + did})
            decision_snapshots_col.insert_one({
                '_id': did, 'decisionId': did, 'snapshotId': 'S_' + did,
                'pid': PID_SEEDED, 'asset': ASSET, 'decisionInputsHash': 'H_' + did,
                'identity': [env.get('call')], 'envelope': env, 'createdAt': ts
            })
        
        def hist(prev, new, ts, reasons, ctype):
            decision_history_col.insert_one({
                '_id': 'ev_' + new, 'pid': PID_SEEDED, 'asset': ASSET,
                'previousDecisionId': prev, 'newDecisionId': new,
                'previousSnapshotId': 'S_' + prev, 'newSnapshotId': 'S_' + new,
                'changedAt': ts, 'changeType': ctype, 'changeReason': reasons
            })
        
        def order(oid, did, side, state, amount, qty, ts, fills):
            order_intents_col.insert_one({
                '_id': oid, 'orderIntentId': oid, 'pid': PID_SEEDED, 'asset': ASSET,
                'decisionId': did, 'snapshotId': 'S_' + did, 'decisionInputsHash': 'H_' + did,
                'idempotencyScope': 'scope_' + oid + '_' + PID_SEEDED,  # Unique scope
                'idempotencyKey': 'key_' + oid,
                'engineVersion': 'albert-decide-v1', 'side': side, 'state': state,
                'amountUsd': amount, 'quantity': qty,
                'filledQuantity': sum(f['quantity'] for f in fills),
                'remainingQuantity': qty - sum(f['quantity'] for f in fills),
                'fills': fills, 'createdAt': ts
            })
        
        def fill(oid, side, q, price, ts):
            order_ledger_col.insert_one({
                '_id': 'L_' + oid + '_' + ts + '_' + PID_SEEDED,
                'pid': PID_SEEDED, 'accountId': 'paper',
                'orderIntentId': oid, 'asset': ASSET, 'side': side,
                'quantity': q, 'price': price, 'usd': round(q * price, 2), 'ts': ts
            })
        
        # Seed baseline portfolio
        portfolio_col.insert_one({'_id': PID_SEEDED, 'usdc': 50000.0, 'positions': []})
        
        # Seed 7 frozen snapshots: WAIT, BUY, ADD, HOLD, TRIM, SELL, WAIT
        # d1-d5: albert-decide-v1, d6-d7: albert-decide-v2
        snap('d1', '2026-01-01T00:00:01', {
            'call': 'WAIT', 'action': 'WAIT', 'reasonCode': 'BELOW_ENTRY_LINE',
            'score': 45, 'confidence': 30, 'regime': 'BULL', 'eligible': True,
            'positionBefore': {'valueUsd': 0, 'pct': 0, 'size': 0},
            'recommendedDeltaUsd': 0, 'flipConditions': []
        }, 'albert-decide-v1')
        
        snap('d2', '2026-01-01T00:00:02', {
            'call': 'BUY', 'action': 'BUY', 'reasonCode': 'OPPORTUNITY_ENTRY',
            'score': 78, 'confidence': 72, 'regime': 'BULL', 'eligible': True,
            'positionBefore': {'valueUsd': 0, 'pct': 0, 'size': 0},
            'recommendedDeltaUsd': 4000,
            'flipConditions': [{'toState': 'WAIT', 'condition': 'x'}]
        }, 'albert-decide-v1')
        
        snap('d3', '2026-01-01T00:00:03', {
            'call': 'BUY', 'action': 'BUY', 'reasonCode': 'OPPORTUNITY_ENTRY',
            'score': 81, 'confidence': 75, 'regime': 'BULL', 'eligible': True,
            'positionBefore': {'valueUsd': 4000, 'pct': 5, 'size': 10},
            'recommendedDeltaUsd': 1500, 'flipConditions': []
        }, 'albert-decide-v1')
        
        snap('d4', '2026-01-01T00:00:04', {
            'call': 'HOLD', 'action': 'HOLD', 'reasonCode': 'THESIS_INTACT',
            'score': 70, 'confidence': 66, 'regime': 'BULL', 'eligible': True,
            'positionBefore': {'valueUsd': 6300, 'pct': 7, 'size': 15},
            'recommendedDeltaUsd': 0, 'flipConditions': []
        }, 'albert-decide-v1')
        
        snap('d5', '2026-01-01T00:00:05', {
            'call': 'SELL', 'action': 'SELL', 'reasonCode': 'PORTFOLIO_DRAWDOWN_RISK',
            'score': 55, 'confidence': 60, 'regime': 'BEAR', 'eligible': True,
            'positionBefore': {'valueUsd': 6750, 'pct': 8, 'size': 15},
            'recommendedDeltaUsd': -1687.5,
            'sellPlan': {
                'action': 'TRIM_25', 'fraction': 0.25, 'amountUsd': 1687.5,
                'positionAfter': {'valueUsd': 5062.5, 'pct': 6, 'size': 11.25},
                'allSignals': ['PORTFOLIO_DRAWDOWN_RISK', 'RISK_REDUCTION']
            },
            'flipConditions': []
        }, 'albert-decide-v1')
        
        snap('d6', '2026-01-01T00:00:06', {
            'call': 'SELL', 'action': 'SELL', 'reasonCode': 'EMERGENCY_EXIT',
            'score': 30, 'confidence': 80, 'regime': 'BEAR', 'eligible': True,
            'positionBefore': {'valueUsd': 5175, 'pct': 6, 'size': 11.25},
            'recommendedDeltaUsd': -5175,
            'sellPlan': {
                'action': 'EXIT_100', 'fraction': 1.0, 'amountUsd': 5175,
                'positionAfter': {'valueUsd': 0, 'pct': 0, 'size': 0},
                'allSignals': ['EMERGENCY_EXIT', 'PORTFOLIO_DRAWDOWN_RISK']
            },
            'flipConditions': []
        }, 'albert-decide-v2')
        
        snap('d7', '2026-01-01T00:00:07', {
            'call': 'WAIT', 'action': 'WAIT', 'reasonCode': 'BELOW_ENTRY_LINE',
            'score': 20, 'confidence': 40, 'regime': 'BEAR', 'eligible': True,
            'positionBefore': {'valueUsd': 0, 'pct': 0, 'size': 0},
            'recommendedDeltaUsd': 0, 'flipConditions': []
        }, 'albert-decide-v2')
        
        # Seed history events
        hist('d1', 'd2', '2026-01-01T00:00:02', ['Call WAIT -> BUY'], 'WAIT->BUY')
        hist('d2', 'd3', '2026-01-01T00:00:03', ['Deployment DEPLOY -> DEPLOY', 'Score 78 -> 81'], 'CHANGED')
        hist('d3', 'd4', '2026-01-01T00:00:04', ['Call BUY -> HOLD'], 'BUY->HOLD')
        hist('d4', 'd5', '2026-01-01T00:00:05', ['Call HOLD -> SELL'], 'HOLD->SELL')
        hist('d5', 'd6', '2026-01-01T00:00:06', ['Sell action TRIM_25 -> EXIT_100'], 'TRIM_25->EXIT_100')
        hist('d6', 'd7', '2026-01-01T00:00:07', ['Call SELL -> WAIT'], 'SELL->WAIT')
        
        # Seed orders: BUY has EXPIRED (no fill) + FILLED; ADD/TRIM/EXIT filled
        order('o_exp', 'd2', 'BUY', 'EXPIRED', 4000, 10, '2026-01-01T00:00:02', [])
        order('o_buy', 'd2', 'BUY', 'FILLED', 4000, 10, '2026-01-01T00:00:02',
              [{'quantity': 10, 'price': 400, 'usd': 4000, 'ts': '2026-01-01T00:00:02'}])
        order('o_add', 'd3', 'BUY', 'FILLED', 2100, 5, '2026-01-01T00:00:03',
              [{'quantity': 5, 'price': 420, 'usd': 2100, 'ts': '2026-01-01T00:00:03'}])
        order('o_trim', 'd5', 'SELL', 'FILLED', 1687.5, 3.75, '2026-01-01T00:00:05',
              [{'quantity': 3.75, 'price': 450, 'usd': 1687.5, 'ts': '2026-01-01T00:00:05'}])
        order('o_exit', 'd6', 'SELL', 'FILLED', 5175, 11.25, '2026-01-01T00:00:06',
              [{'quantity': 11.25, 'price': 460, 'usd': 5175, 'ts': '2026-01-01T00:00:06'}])
        
        # Seed ledger fills
        fill('o_buy', 'BUY', 10, 400, '2026-01-01T00:00:02')
        fill('o_add', 'BUY', 5, 420, '2026-01-01T00:00:03')
        fill('o_trim', 'SELL', 3.75, 450, '2026-01-01T00:00:05')
        fill('o_exit', 'SELL', 11.25, 460, '2026-01-01T00:00:06')
        
        print('  Seeded 7 snapshots, 6 history events, 5 orders, 4 fills')
        
        # Now test the lifecycle endpoint
        resp = requests.get(f'{BASE}/v1/albert/lifecycle/{ASSET}', params={'pid': PID_SEEDED}, timeout=30)
        check('GET /lifecycle/TESTX returns 200', resp.status_code == 200, f'status={resp.status_code}')
        
        data = resp.json()
        check('status is "ready"', data.get('status') == 'ready', f'status={data.get("status")}')
        
        events = data.get('events', [])
        check('7 events', len(events) == 7, f'eventCount={len(events)}')
        
        if len(events) == 7:
            stages = [e['stage'] for e in events]
            check('stage order [WAIT,BUY,ADD,HOLD,TRIM,SELL,WAIT]',
                  stages == ['WAIT', 'BUY', 'ADD', 'HOLD', 'TRIM', 'SELL', 'WAIT'],
                  f'stages={stages}')
            
            # Check ADD preserves BUY call
            check('events[2].stage=="ADD"', events[2]['stage'] == 'ADD', f'stage={events[2]["stage"]}')
            check('events[2].call=="BUY"', events[2]['call'] == 'BUY', f'call={events[2]["call"]}')
            
            # Check TRIM
            check('events[4].stage=="TRIM"', events[4]['stage'] == 'TRIM', f'stage={events[4]["stage"]}')
            check('events[4].call=="SELL"', events[4]['call'] == 'SELL', f'call={events[4]["call"]}')
            check('events[4].sellPlan.action=="TRIM_25"',
                  events[4].get('sellPlan', {}).get('action') == 'TRIM_25',
                  f'action={events[4].get("sellPlan", {}).get("action")}')
            
            # Check SELL (EXIT_100)
            check('events[5].sellPlan.action=="EXIT_100"',
                  events[5].get('sellPlan', {}).get('action') == 'EXIT_100',
                  f'action={events[5].get("sellPlan", {}).get("action")}')
            
            # Check previousCall chain
            prev_calls = [e['previousCall'] for e in events]
            expected_prev = [None, 'WAIT', 'BUY', 'BUY', 'HOLD', 'SELL', 'SELL']
            check('previousCall chain correct', prev_calls == expected_prev,
                  f'prev={prev_calls}')
            
            # Check engineVersion preservation (5x v1, 2x v2)
            versions = [e['engineVersion'] for e in events]
            expected_versions = ['albert-decide-v1'] * 5 + ['albert-decide-v2'] * 2
            check('per-event engineVersion NOT rewritten',
                  versions == expected_versions,
                  f'versions={versions}')
            
            # Check currentEngineVersion
            check('currentEngineVersion=="albert-decide-v2"',
                  data.get('currentEngineVersion') == 'albert-decide-v2',
                  f'current={data.get("currentEngineVersion")}')
            
            # Check changeReason carried from history
            check('events[1].changeReason present',
                  'Call WAIT -> BUY' in events[1].get('changeReason', []),
                  f'changeReason={events[1].get("changeReason")}')
            
            # Check portfolioRiskIntervention
            check('events[4].portfolioRiskIntervention==True (PDR drove it)',
                  events[4].get('portfolioRiskIntervention') is True,
                  f'intervention={events[4].get("portfolioRiskIntervention")}')
            
            check('events[5].portfolioRiskIntervention==True',
                  events[5].get('portfolioRiskIntervention') is True,
                  f'intervention={events[5].get("portfolioRiskIntervention")}')
            
            note5 = events[5].get('portfolioRiskNote', '')
            check('events[5].portfolioRiskNote contains "took precedence"',
                  'took precedence' in note5,
                  f'note={note5}')
            
            # Check BUY event links BOTH orders
            buy_orders = events[1].get('orders', [])
            check('BUY event has 2 orders', len(buy_orders) == 2, f'orderCount={len(buy_orders)}')
            
            if len(buy_orders) == 2:
                order_ids = {o['orderIntentId'] for o in buy_orders}
                check('BUY links o_exp and o_buy', order_ids == {'o_exp', 'o_buy'},
                      f'orderIds={order_ids}')
                
                # Find expired order
                expired = [o for o in buy_orders if o['state'] == 'EXPIRED']
                if expired:
                    check('expired order has fills==[]', expired[0]['fills'] == [],
                          f'fills={expired[0]["fills"]}')
                
                # Check hasExecution
                check('BUY hasExecution==True', events[1].get('hasExecution') is True,
                      f'hasExecution={events[1].get("hasExecution")}')
        
        # Check positionTrack (fills only)
        track = data.get('positionTrack', [])
        track_sizes = [round(p['size'], 4) for p in track]
        expected_sizes = [0.0, 10.0, 15.0, 11.25, 0.0]
        check('positionTrack sizes [0,10,15,11.25,0]',
              track_sizes == expected_sizes,
              f'sizes={track_sizes}')
        
        # Check currentPaperPositionSize
        check('currentPaperPositionSize==0',
              data.get('currentPaperPositionSize') == 0.0,
              f'current={data.get("currentPaperPositionSize")}')
        
        # Check WAIT node has no orders/execution
        if len(events) >= 1:
            check('events[0].orders==[]', events[0].get('orders') == [],
                  f'orders={events[0].get("orders")}')
            check('events[0].hasExecution==False', events[0].get('hasExecution') is False,
                  f'hasExecution={events[0].get("hasExecution")}')
        
    except Exception as e:
        check('Scenario 3 exception', False, str(e))


def test_scenario_4_recovery_ledger():
    """Scenario 4: RECOVERY LEDGER - portfolio risk recovery ledger."""
    print('\n=== SCENARIO 4: RECOVERY LEDGER ===')
    
    try:
        # Seed mandate with max_drawdown_pct=20
        mandate_data = {
            'pid': PID_RECOVERY,
            'risk_tolerance': 'moderate',
            'reserve_pct': 25,
            'approved_coins': ['BTC', 'ETH'],
            'excluded_coins': [],
            'max_alloc_pct': {'BTC': 40, 'ETH': 30},
            'max_trade_risk_pct': 2.0,
            'max_drawdown_pct': 20
        }
        resp = requests.post(f'{BASE}/v1/albert/mandate', json=mandate_data, timeout=30)
        check('POST /mandate returns 200', resp.status_code == 200, f'status={resp.status_code}')
        
        # Seed portfolio
        portfolio_data = {
            'pid': PID_RECOVERY,
            'usdc': 50000.0,
            'positions': []
        }
        resp = requests.post(f'{BASE}/v1/portfolio', json=portfolio_data, timeout=30)
        check('POST /portfolio returns 200', resp.status_code == 200, f'status={resp.status_code}')
        
        # Get current portfolio value via portfolio-risk endpoint
        resp = requests.get(f'{BASE}/v1/albert/portfolio-risk', params={'pid': PID_RECOVERY}, timeout=30)
        check('GET /portfolio-risk returns 200', resp.status_code == 200, f'status={resp.status_code}')
        
        data = resp.json()
        current_value = data.get('portfolioRisk', {}).get('currentPortfolioValueUsd', 50000.0)
        print(f'  Current portfolio value: ${current_value}')
        
        # Set HWM to trigger protection mode (drawdown ~25%)
        # HWM = currentValue / 0.75 means drawdown = 25%
        hwm_breach = round(current_value / 0.75, 2)
        print(f'  Setting HWM to ${hwm_breach} to trigger protection (drawdown ~25%)')
        
        portfolio_risk_col.update_one(
            {'_id': PID_RECOVERY},
            {'$set': {
                'highWaterMarkUsd': hwm_breach,
                'protectionMode': False,  # Will be activated on next call
            }},
            upsert=True
        )
        
        # Call portfolio-risk again to trigger protection
        resp = requests.get(f'{BASE}/v1/albert/portfolio-risk', params={'pid': PID_RECOVERY}, timeout=30)
        check('GET /portfolio-risk (breach) returns 200', resp.status_code == 200, f'status={resp.status_code}')
        
        data = resp.json()
        pr = data.get('portfolioRisk', {})
        rl = pr.get('recoveryLedger')
        
        check('recoveryLedger present', rl is not None, f'recoveryLedger={rl}')
        
        if rl:
            check('protectionMode==True', rl.get('protectionMode') is True,
                  f'protectionMode={rl.get("protectionMode")}')
            check('lifted==False', rl.get('lifted') is False,
                  f'lifted={rl.get("lifted")}')
            
            breach_dd = rl.get('breachDrawdownPct')
            check('breachDrawdownPct set', breach_dd is not None and breach_dd > 20,
                  f'breachDrawdownPct={breach_dd}')
            
            recovery_threshold = rl.get('recoveryThresholdPct')
            check('recoveryThresholdPct==16.0', recovery_threshold == 16.0,
                  f'recoveryThresholdPct={recovery_threshold}')
            
            recovery_line = rl.get('recoveryLineUsd')
            expected_line = round(hwm_breach * 0.84, 2)
            check('recoveryLineUsd ≈ HWM*0.84',
                  abs(recovery_line - expected_line) < 1.0,
                  f'recoveryLineUsd={recovery_line}, expected≈{expected_line}')
            
            pp_until_lift = rl.get('ppUntilLift')
            check('ppUntilLift present', pp_until_lift is not None,
                  f'ppUntilLift={pp_until_lift}')
        
        # Now set HWM to lift protection (drawdown <=16%)
        # HWM = currentValue / 0.88 means drawdown = 12%
        hwm_lift = round(current_value / 0.88, 2)
        print(f'  Setting HWM to ${hwm_lift} to lift protection (drawdown ~12%)')
        
        portfolio_risk_col.update_one(
            {'_id': PID_RECOVERY},
            {'$set': {
                'highWaterMarkUsd': hwm_lift,
                'protectionMode': True,  # Currently in protection
            }},
            upsert=True
        )
        
        # Call portfolio-risk again to lift protection
        resp = requests.get(f'{BASE}/v1/albert/portfolio-risk', params={'pid': PID_RECOVERY}, timeout=30)
        check('GET /portfolio-risk (lift) returns 200', resp.status_code == 200, f'status={resp.status_code}')
        
        data = resp.json()
        pr = data.get('portfolioRisk', {})
        rl = pr.get('recoveryLedger')
        
        if rl:
            check('lifted==True', rl.get('lifted') is True,
                  f'lifted={rl.get("lifted")}')
            check('liftedAt set', rl.get('liftedAt') is not None,
                  f'liftedAt={rl.get("liftedAt")}')
        
        # Test pid that never breached
        pid_no_breach = 'u_TEST_H_NO_BREACH'
        ALL_PIDS.append(pid_no_breach)
        
        mandate_data['pid'] = pid_no_breach
        resp = requests.post(f'{BASE}/v1/albert/mandate', json=mandate_data, timeout=30)
        
        portfolio_data['pid'] = pid_no_breach
        resp = requests.post(f'{BASE}/v1/portfolio', json=portfolio_data, timeout=30)
        
        resp = requests.get(f'{BASE}/v1/albert/portfolio-risk', params={'pid': pid_no_breach}, timeout=30)
        check('GET /portfolio-risk (no breach) returns 200', resp.status_code == 200, f'status={resp.status_code}')
        
        data = resp.json()
        pr = data.get('portfolioRisk', {})
        rl = pr.get('recoveryLedger')
        
        check('recoveryLedger is null for never-breached pid', rl is None,
              f'recoveryLedger={rl}')
        
    except Exception as e:
        check('Scenario 4 exception', False, str(e))


def test_scenario_5_regression():
    """Scenario 5: REGRESSION - existing endpoints still work."""
    print('\n=== SCENARIO 5: REGRESSION ===')
    
    try:
        # Seed mandate and portfolio
        mandate_data = {
            'pid': PID_REGRESSION,
            'risk_tolerance': 'moderate',
            'reserve_pct': 25,
            'approved_coins': ['BTC', 'ETH'],
            'excluded_coins': [],
            'max_alloc_pct': {'BTC': 40, 'ETH': 30},
            'max_trade_risk_pct': 2.0,
            'max_drawdown_pct': 20
        }
        resp = requests.post(f'{BASE}/v1/albert/mandate', json=mandate_data, timeout=30)
        check('POST /mandate returns 200', resp.status_code == 200, f'status={resp.status_code}')
        
        portfolio_data = {
            'pid': PID_REGRESSION,
            'usdc': 50000.0,
            'positions': []
        }
        resp = requests.post(f'{BASE}/v1/portfolio', json=portfolio_data, timeout=30)
        check('POST /portfolio returns 200', resp.status_code == 200, f'status={resp.status_code}')
        
        # Test /decisions endpoint
        resp = requests.get(f'{BASE}/v1/albert/decisions', params={'pid': PID_REGRESSION}, timeout=60)
        check('GET /decisions returns 200', resp.status_code == 200, f'status={resp.status_code}')
        
        data = resp.json()
        check('/decisions has correct fields', 'status' in data and 'decisions' in data,
              f'keys={list(data.keys())}')
        
        # Test /portfolio-risk endpoint
        resp = requests.get(f'{BASE}/v1/albert/portfolio-risk', params={'pid': PID_REGRESSION}, timeout=30)
        check('GET /portfolio-risk returns 200', resp.status_code == 200, f'status={resp.status_code}')
        
        data = resp.json()
        check('/portfolio-risk has correct fields',
              'status' in data and 'portfolioRisk' in data,
              f'keys={list(data.keys())}')
        
        # Test Phase E paper-order create/confirm/execute
        # First, get a decision to create an order
        resp = requests.get(f'{BASE}/v1/albert/decisions', params={'pid': PID_REGRESSION}, timeout=60)
        decisions_data = resp.json()
        
        # Find a BUY decision
        buy_decision = None
        for d in decisions_data.get('decisions', []):
            if d.get('action') == 'BUY':
                buy_decision = d
                break
        
        if buy_decision:
            # Create order intent
            create_data = {
                'pid': PID_REGRESSION,
                'portfolioId': PID_REGRESSION,
                'accountId': 'paper',
                'decisionId': buy_decision['decisionId'],
                'snapshotId': buy_decision['snapshotId'],
                'decisionInputsHash': buy_decision['decisionInputsHash'],
                'engineVersion': buy_decision['engineVersion'],
                'asset': buy_decision['asset'],
                'side': 'BUY',
                'amountUsd': min(1000, buy_decision.get('recommendedDeltaUsd', 1000)),
                'idempotencyKey': 'test_regression_order'
            }
            
            resp = requests.post(f'{BASE}/v1/albert/order/create', json=create_data, timeout=30)
            check('POST /order/create returns 200', resp.status_code == 200, f'status={resp.status_code}')
            
            if resp.status_code == 200:
                order_data = resp.json()
                order_id = order_data.get('orderIntentId')
                
                if order_id:
                    # Confirm order
                    resp = requests.post(f'{BASE}/v1/albert/order/{order_id}/confirm',
                                       json={'pid': PID_REGRESSION}, timeout=30)
                    check('POST /order/confirm returns 200', resp.status_code == 200,
                          f'status={resp.status_code}')
                    
                    # Execute order
                    resp = requests.post(f'{BASE}/v1/albert/order/{order_id}/execute',
                                       json={'pid': PID_REGRESSION}, timeout=30)
                    check('POST /order/execute returns 200', resp.status_code == 200,
                          f'status={resp.status_code}')
                    
                    if resp.status_code == 200:
                        exec_data = resp.json()
                        check('order reaches FILLED', exec_data.get('state') == 'FILLED',
                              f'state={exec_data.get("state")}')
        else:
            print('  No BUY decision found, skipping Phase E order test')
        
    except Exception as e:
        check('Scenario 5 exception', False, str(e))


def main():
    print('=== PHASE H LIFECYCLE REPLAY + RECOVERY LEDGER BACKEND TESTING ===')
    print(f'Using external API: {BASE}')
    print(f'Test PIDs: {ALL_PIDS}\n')
    
    try:
        # Run all scenarios
        test_scenario_1_empty()
        test_scenario_2_real_journey()
        test_scenario_3_seeded_full_journey()
        test_scenario_4_recovery_ledger()
        test_scenario_5_regression()
        
    finally:
        # Always cleanup
        cleanup_all()
    
    # Print summary
    passed = sum(results)
    total = len(results)
    print(f'\n=== FINAL RESULTS: {passed}/{total} PASSED ===')
    
    if passed == total:
        print('✅ ALL TESTS PASSED')
    else:
        print(f'❌ {total - passed} TESTS FAILED')


if __name__ == '__main__':
    main()
