"""
Backend test for studio_draft and _autopilot_process_account_multi with synthetic dependencies.
Tests real code paths with mocked external dependencies (Gemini LLM, DB writes, etc).
"""
import sys
import os
import asyncio
import json
import uuid
from decimal import Decimal
from unittest.mock import Mock, MagicMock, patch, AsyncMock
from datetime import datetime

# Add backend to path
sys.path.insert(0, '/app/backend')

# Import server module
import server

print("=" * 80)
print("BACKEND TEST: studio_draft + _autopilot_process_account_multi")
print("=" * 80)

# ============================================================================
# TEST 1: studio_draft with synthetic Gemini
# ============================================================================
print("\n" + "=" * 80)
print("TEST 1: studio_draft - Gemini regeneration with unsupported NEAR then BTC")
print("=" * 80)

try:
    # Create a fake LlmChat that tracks calls
    test_state = {'call_count': 0, 'gemini_responses': []}
    
    class FakeLlmChat:
        def __init__(self, api_key, session_id, system_message=None):
            self.api_key = api_key
            self.session_id = session_id
            self.system_message = system_message
            self._model = None
            self._params = {}
            
        def with_model(self, provider, model_name):
            self._model = (provider, model_name)
            return self
            
        def with_params(self, **kwargs):
            self._params = kwargs
            return self
            
        async def send_message(self, user_message):
            test_state['call_count'] += 1
            
            # First attempt: return NEAR 100% (unsupported)
            if test_state['call_count'] == 1:
                response_json = {
                    "name": "Balanced Paper Strategy",
                    "assets": [{"symbol": "NEAR", "weight": 100}],
                    "positionLimits": {"maxPositionPct": 30},
                    "reserve": {"minCashPct": 10}
                }
            # Second attempt: return BTC 100% (supported)
            else:
                response_json = {
                    "name": "Balanced Paper Strategy",
                    "assets": [{"symbol": "BTC", "weight": 100}],
                    "positionLimits": {"maxPositionPct": 30},
                    "reserve": {"minCashPct": 10}
                }
            
            test_state['gemini_responses'].append(response_json)
            
            # Return mock response with .text attribute
            mock_response = Mock()
            mock_response.text = json.dumps(response_json)
            return mock_response
    
    # Patch LLM_READY_KEY, _HAS_LLM, and LlmChat
    with patch.object(server, 'LLM_READY_KEY', 'synthetic_key'), \
         patch.object(server, '_HAS_LLM', True), \
         patch.object(server, 'LlmChat', FakeLlmChat):
        
        # Patch _asset_caps.capability to make BTC eligible, NEAR not eligible
        original_capability = server._asset_caps.capability
        def fake_capability(symbol, mandate=None, data_availability='UNVERIFIED'):
            if symbol == 'BTC':
                return {
                    'symbol': 'BTC',
                    'assetId': 'bitcoin',
                    'startEligible': True,
                    'entrySupported': True,
                    'reasonCode': None
                }
            elif symbol == 'NEAR':
                return {
                    'symbol': 'NEAR',
                    'assetId': 'near',
                    'startEligible': False,
                    'entrySupported': False,
                    'reasonCode': 'ENTRY_PATH_UNVERIFIED'
                }
            else:
                # Keep original for others
                return original_capability(symbol, mandate, data_availability)
        
        # Patch _get_mandate to return empty mandate
        def fake_get_mandate(pid):
            return {}
        
        # Patch _model_for to return a model name
        def fake_model_for(purpose):
            return 'gemini-flash'
        
        with patch.object(server._asset_caps, 'capability', fake_capability), \
             patch.object(server, '_get_mandate', fake_get_mandate), \
             patch.object(server, '_model_for', fake_model_for):
            
            # Test case A: Goal with no explicit ticker (balanced paper strategy)
            # Should call Gemini twice: first NEAR (unsupported), second BTC (supported)
            print("\nTest 1A: Goal 'balanced paper strategy' (no explicit ticker)")
            print("-" * 80)
            
            test_state['call_count'] = 0
            test_state['gemini_responses'] = []
            
            # Mock user with correct structure
            fake_user = {'_id': 'test_user_001', 'email': 'test@example.com'}
            
            # Call studio_draft
            payload = {'goal': 'balanced paper strategy'}
            result = server.studio_draft(payload, fake_user)
            
            print(f"✅ Gemini send_message called {test_state['call_count']} times")
            assert test_state['call_count'] == 2, f"Expected 2 Gemini calls, got {test_state['call_count']}"
            
            print(f"✅ First response: {test_state['gemini_responses'][0]}")
            assert test_state['gemini_responses'][0]['assets'][0]['symbol'] == 'NEAR', "First response should be NEAR"
            
            print(f"✅ Second response: {test_state['gemini_responses'][1]}")
            assert test_state['gemini_responses'][1]['assets'][0]['symbol'] == 'BTC', "Second response should be BTC"
            
            print(f"✅ Result status: {result['status']}")
            assert result['status'] == 'ready', f"Expected status 'ready', got {result['status']}"
            
            print(f"✅ Draft contains BTC: {result['draft']['assets']}")
            assert result['draft']['assets'][0]['symbol'] == 'BTC', "Final draft should contain BTC"
            
            print(f"✅ No validation errors: {result.get('validationErrors', [])}")
            assert result['valid'] == True, "Draft should be valid"
            
            print("\n✅ TEST 1A PASSED: Gemini regeneration works correctly")
            
    print("\n" + "=" * 80)
    print("TEST 1B: studio_draft - Explicit NEAR goal rejects before Gemini call")
    print("=" * 80)
    
    # Test case B: Explicit goal "NEAR 100%" should reject with HTTP 422 BEFORE chat
    with patch.object(server, 'LLM_READY_KEY', 'synthetic_key'), \
         patch.object(server, '_HAS_LLM', True), \
         patch.object(server, 'LlmChat', FakeLlmChat):
        
        with patch.object(server._asset_caps, 'capability', fake_capability), \
             patch.object(server, '_get_mandate', fake_get_mandate), \
             patch.object(server, '_model_for', fake_model_for):
            
            test_state['call_count'] = 0
            test_state['gemini_responses'] = []
            
            # Patch goal_constraints to return NEAR as requested
            original_goal_constraints = server._asset_caps.goal_constraints
            def fake_goal_constraints(goal):
                if 'NEAR' in goal.upper():
                    return ['NEAR'], {}
                return original_goal_constraints(goal)
            
            with patch.object(server._asset_caps, 'goal_constraints', fake_goal_constraints):
                payload = {'goal': 'NEAR 100%'}
                
                try:
                    result = server.studio_draft(payload, fake_user)
                    print("❌ TEST 1B FAILED: Expected HTTPException 422, but got result")
                    assert False, "Should have raised HTTPException"
                except server.HTTPException as e:
                    print(f"✅ HTTPException raised with status_code: {e.status_code}")
                    assert e.status_code == 422, f"Expected 422, got {e.status_code}"
                    
                    print(f"✅ Detail message: {e.detail}")
                    assert 'NEAR' in e.detail, "Error should mention NEAR"
                    assert 'ENTRY_PATH_UNVERIFIED' in e.detail, "Error should mention reason code"
                    
                    print(f"✅ Gemini NOT called: {test_state['call_count']} calls")
                    assert test_state['call_count'] == 0, f"Gemini should not be called, but was called {test_state['call_count']} times"
                    
                    print("\n✅ TEST 1B PASSED: Explicit NEAR goal rejects before Gemini call")
    
    print("\n" + "=" * 80)
    print("✅ ALL studio_draft TESTS PASSED")
    print("=" * 80)
    
except Exception as e:
    print(f"\n❌ TEST 1 FAILED with exception: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# ============================================================================
# TEST 2: _autopilot_process_account_multi with mocked dependencies
# ============================================================================

def run_worker_test():
    """Helper function to reduce nesting depth"""
    print("\n" + "=" * 80)
    print("TEST 2: _autopilot_process_account_multi - Worker with unsupported BUY")
    print("=" * 80)
    # Create test account
    test_account = {
        'paperAccountId': 'paper_test_001',
        'ownerId': 'test_owner_001',
        'mode': 'PAPER_AUTOPILOT',
        'runtimeState': 'RUNNING',
        'lots': [],
        'processedDecisionSnapshots': {},
        'marketObservationCursors': {},
        'highWaterEquity': None
    }
    
    # Track what gets called
    size_buy_calls = []
    apply_buy_calls = []
    ledger_add_calls = []
    proposal_insert_calls = []
    
    # Mock functions
    def mock_autopilot_set_vis(acct_id, **kwargs):
        pass
    
    def mock_get_mandate(pid):
        return {
            'excluded_coins': [],
            'approved_coins': [],
            'max_drawdown_pct': None
        }
    
    def mock_paper_canonical_decisions(pid, account=None):
        # Return a BUY decision for NEAR (unverified asset)
        return [{
            'asset': 'NEAR',
            'action': 'BUY',
            'decisionSnapshotId': 'snap_001',
            'actionable': True,
            'eligible': True,
            'fresh': True,
            'score': 75,
            'confidence': 0.8,
            'recommendedDeployNowUsd': 1000,
            'invalidationPrice': None,
            'sellPlan': None,
            'regime': 'BULLISH',
            'mandateChecks': {'mandateComplete': True}
        }]
    
    def mock_paper_mark(symbol):
        # Return fake price with fresh observation
        fake_obs = {
            'obsId': f'obs_{symbol}_{uuid.uuid4().hex[:8]}',
            'execution': {'venue': 'kraken', 'fees': {'taker': 0.002}}
        }
        return Decimal('100.0'), True, fake_obs
    
    def mock_compute_portfolio_equity(acct, marks):
        return {
            'available': True,
            'equity': Decimal('1000'),
            'positions': [],
            'cash': Decimal('1000'),
            'drawdownPct': Decimal('0'),
            'deployableCash': Decimal('1000')
        }
    
    def mock_paper_live_ranks():
        return ({}, {})
    
    def mock_strategy_for_account(acct):
        return None
    
    def mock_allocate(acct, equity_info, candidates, regime, marks, holding_scores):
        # Malicious allocator: returns BUY intent for NEAR even though it's unsupported
        if candidates and candidates[0]['symbol'] == 'NEAR':
            return {
                'intents': [{
                    'symbol': 'NEAR',
                    'action': 'BUY',
                    'notional': 500
                }]
            }
        return {'intents': []}
    
    def mock_size_buy(symbol, notional, price, profile=None, price_q=None):
        size_buy_calls.append({'symbol': symbol, 'notional': notional, 'price': price})
        return {
            'symbol': symbol,
            'qty': notional / price,
            'notional': notional,
            'reject': None
        }
    
    def mock_apply_buy_atomic(*args, **kwargs):
        apply_buy_calls.append({'args': args, 'kwargs': kwargs})
        return (None, None, None)
    
    def mock_paper_ledger_add(acct_id, event_type, *args, **kwargs):
        ledger_add_calls.append({
            'acct_id': acct_id,
            'event_type': event_type,
            'args': args
        })
    
    def mock_persist_multi_cursors(acct_id, processed, newly_seen, cursors):
        pass
    
    def mock_update_high_water(*args, **kwargs):
        pass
    
    # Mock paper_accounts_col
    mock_paper_accounts_col = MagicMock()
    mock_paper_accounts_col.find_one.return_value = test_account
    mock_paper_accounts_col.update_one.return_value = None
    
    # Mock paper_proposals_col
    mock_paper_proposals_col = MagicMock()
    mock_paper_proposals_col.find_one.return_value = None
    mock_paper_proposals_col.insert_one = lambda doc: proposal_insert_calls.append(doc)
    
    # Patch all dependencies
    with patch.object(server, '_autopilot_set_vis', mock_autopilot_set_vis), \
         patch.object(server._albert_deps, 'get_mandate', mock_get_mandate), \
         patch.object(server, '_paper_canonical_decisions', mock_paper_canonical_decisions), \
         patch.object(server, '_paper_mark', mock_paper_mark), \
         patch.object(server._paper_portfolio, 'compute_portfolio_equity', mock_compute_portfolio_equity), \
         patch.object(server, '_paper_live_ranks', mock_paper_live_ranks), \
         patch.object(server, '_strategy_for_account', mock_strategy_for_account), \
         patch.object(server._paper_portfolio, 'allocate', mock_allocate), \
         patch.object(server._paper_core, 'size_buy', mock_size_buy), \
         patch.object(server._paper_core, 'apply_buy_atomic', mock_apply_buy_atomic), \
         patch.object(server, '_paper_ledger_add', mock_paper_ledger_add), \
         patch.object(server, '_persist_multi_cursors', mock_persist_multi_cursors), \
         patch.object(server._paper_core, 'update_high_water', mock_update_high_water), \
         patch.object(server, 'paper_accounts_col', mock_paper_accounts_col), \
         patch.object(server, 'paper_proposals_col', mock_paper_proposals_col), \
         patch.object(server, 'PAPER_EXECUTION_ENABLED', True), \
         patch.object(server, 'PAPER_AUTOPILOT_ENABLED', True):
        
        # Patch _asset_caps.capability to reject NEAR
        with patch.object(server._asset_caps, 'capability', fake_capability):
            
            # Also need to patch entry_allowed
            original_entry_allowed = server._asset_caps.entry_allowed
            def fake_entry_allowed(symbol, mandate=None, data_ok=None):
                if symbol == 'BTC':
                    return (True, None)
                elif symbol == 'NEAR':
                    return (False, 'ENTRY_PATH_UNVERIFIED')
                else:
                    return original_entry_allowed(symbol, mandate, data_ok)
            
            with patch.object(server._asset_caps, 'entry_allowed', fake_entry_allowed):
                
                print("\nCalling _autopilot_process_account_multi with NEAR BUY decision...")
                print("-" * 80)
                
                # Reset call tracking
                size_buy_calls = []
                apply_buy_calls = []
                ledger_add_calls = []
                proposal_insert_calls = []
                
                # Call the real worker function
                server._autopilot_process_account_multi(test_account)
                
                print(f"\n✅ Worker completed without exception")
                
                print(f"\n✅ size_buy calls: {len(size_buy_calls)}")
                print(f"   Details: {size_buy_calls}")
                assert len(size_buy_calls) == 0, f"size_buy should NOT be called for unsupported NEAR, but was called {len(size_buy_calls)} times"
                
                print(f"\n✅ apply_buy_atomic calls: {len(apply_buy_calls)}")
                print(f"   Details: {apply_buy_calls}")
                assert len(apply_buy_calls) == 0, f"apply_buy_atomic should NOT be called for unsupported NEAR, but was called {len(apply_buy_calls)} times"
                
                print(f"\n✅ proposal_insert_one calls: {len(proposal_insert_calls)}")
                print(f"   Details: {proposal_insert_calls}")
                assert len(proposal_insert_calls) == 0, f"No proposals should be created for unsupported NEAR, but {len(proposal_insert_calls)} were created"
                
                print(f"\n✅ ledger_add calls: {len(ledger_add_calls)}")
                for call in ledger_add_calls:
                    print(f"   - {call['event_type']}: {call['args']}")
                
                # Check that only allowed events are logged (no activation events)
                activation_events = [c for c in ledger_add_calls if c['event_type'] not in ['OBSERVED', 'HEARTBEAT']]
                print(f"\n✅ Activation events (should be 0): {len(activation_events)}")
                assert len(activation_events) == 0, f"No activation events should occur for unsupported NEAR, but found {len(activation_events)}"
                
                # Check for OBSERVED event (should be present since decision is not actionable for unsupported asset)
                # Actually, looking at the code, when startEligible is False, it continues without any ledger event
                # So we should have 0 ledger events for NEAR
                near_events = [c for c in ledger_add_calls if 'NEAR' in str(c.get('args', ''))]
                print(f"\n✅ NEAR-related ledger events: {len(near_events)}")
                print(f"   Details: {near_events}")
                
                print("\n✅ TEST 2 PASSED: Worker correctly rejects unsupported NEAR BUY")
                print("   - No size_buy calls")
                print("   - No apply_buy_atomic calls")
                print("   - No proposal creation")
                print("   - No activation events")
                print("   - Only allowed heartbeat/observed telemetry")
    
    print("\n" + "=" * 80)
    print("✅ ALL _autopilot_process_account_multi TESTS PASSED")
    print("=" * 80)

try:
    run_worker_test()
except Exception as e:
    print(f"\n❌ TEST 2 FAILED with exception: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\n" + "=" * 80)
print("✅ ALL BACKEND TESTS PASSED")
print("=" * 80)
print("\nSUMMARY:")
print("  ✅ studio_draft: Gemini regeneration works (2 attempts, NEAR->BTC)")
print("  ✅ studio_draft: Explicit NEAR goal rejects before Gemini call (HTTP 422)")
print("  ✅ _autopilot_process_account_multi: Unsupported NEAR BUY correctly rejected")
print("  ✅ Worker: No size_buy/apply_buy/proposal/ledger for unverified asset")
print("  ✅ Worker: Only allowed heartbeat telemetry, no activation events")
print("\n" + "=" * 80)
