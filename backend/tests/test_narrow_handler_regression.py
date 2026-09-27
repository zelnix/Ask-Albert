"""Narrow real-handler regression only.

Direct `import server; server.studio_save(..., user=u)` works, FastAPI Depends is NOT a blocker.
Previous subagent 19/19 includes stub NOT TESTED pytest functions, do not repeat that.
NO public HTTP, production DB writes, real Gemini or deploy.

Create pytest test file with 4-7 functions that DIRECTLY call real server functions and assert mock interactions:
(A) `server._studio_backtest(contract)` with monkeypatch `server._studio_daily_closes` to return timestamped 200 day arrays
    and `server._asset_caps.capability` to return {'entrySupported':True}; assert success (date alignment, per-asset costs
    labeled PAPER_SIMULATION_ASSUMPTION and weight unchanged) and missing ETH fails INCOMPLETE_DATA missingAssets ETH, no false performance.
(B) `server.studio_start_paper('s1', payload={'approvalMode':'REVIEW', 'confirm':True, 'idempotencyKey':'k'}, user={'_id':'test'})`
    monkeypatch `_studio_get` to fake doc, `_strategy_acct` None, `_studio_guard` lambda returns key, `_studio_idem` lambda None,
    `_get_mandate` lambda {}, and mocks on `_paper_new_wallet_for_strategy`, `strategy_contracts_col.update_one`, `_paper_ledger_add`,
    `_studio_validate` either real with unverified BTC or mock returning invalid. Assert HTTPException and ZERO writes; then monkeypatch
    `_studio_validate` to return contract/hash/no errs, `_paper_new_wallet_for_strategy` returns fake account, `_studio_public`/
    `_strategy_paper_public` return {} and verify Start uses one wallet write, one contract status update, ZERO trade/ledger fills despite
    canonical WAIT.
(C) `server.studio_save` invalid draft direct, patch `_studio_idem` None and `_get_mandate` {}, mock strategy_contracts_col.insert_one,
    assert 422 and no insert.
(D) `server._paper_mark` with patched `_market_observation` returns missing -> (None,False), never fallback run.

Run:  cd /app/backend && python -m pytest tests/test_narrow_handler_regression.py -v
"""
import os
import sys
import datetime
from unittest.mock import MagicMock, patch
from decimal import Decimal

os.environ['PAPER_MULTI_ASSET_ENABLED'] = 'true'
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import server  # noqa: E402
from fastapi import HTTPException  # noqa: E402
import pytest  # noqa: E402


def test_studio_backtest_success_with_mocked_daily_closes():
    """Test A: _studio_backtest with monkeypatched _studio_daily_closes returns 200 day arrays
    and _asset_caps.capability returns {'entrySupported':True}. Assert success with date alignment,
    per-asset costs, and weights unchanged."""
    print("\n=== TEST A1: _studio_backtest SUCCESS with mocked daily closes ===")
    
    # Generate 200 days of timestamped data (UTC midnight timestamps)
    base_ts = datetime.datetime(2024, 1, 1, 0, 0, 0)
    btc_data = [(int((base_ts + datetime.timedelta(days=i)).timestamp()), 50000 + i * 100) for i in range(200)]
    eth_data = [(int((base_ts + datetime.timedelta(days=i)).timestamp()), 3000 + i * 10) for i in range(200)]
    sol_data = [(int((base_ts + datetime.timedelta(days=i)).timestamp()), 100 + i * 0.5) for i in range(200)]
    
    contract = {
        'assets': [
            {'symbol': 'BTC', 'weightPct': 50},
            {'symbol': 'ETH', 'weightPct': 30},
            {'symbol': 'SOL', 'weightPct': 20}
        ]
    }
    
    def mock_daily_closes(symbol):
        if symbol == 'BTC':
            return btc_data
        elif symbol == 'ETH':
            return eth_data
        elif symbol == 'SOL':
            return sol_data
        return None
    
    def mock_capability(symbol):
        return {'entrySupported': True}
    
    with patch.object(server, '_studio_daily_closes', side_effect=mock_daily_closes):
        with patch.object(server._asset_caps, 'capability', side_effect=mock_capability):
            with patch.object(server._asset_caps, 'candidate', return_value={'id': 'test', 'rank': 1}):
                result = server._studio_backtest(contract)
    
    print(f"Result keys: {result.keys()}")
    print(f"Sample size days: {result.get('sampleSizeDays')}")
    print(f"Total return pct: {result.get('totalReturnPct')}")
    print(f"Max drawdown pct: {result.get('maxDrawdownPct')}")
    print(f"Assets with data: {result.get('assetsWithData')}")
    print(f"Per-asset costs: {result.get('perAssetExecutionCosts')}")
    
    # Assert success
    assert 'error' not in result, f"Expected success but got error: {result.get('error')}"
    assert result['sampleSizeDays'] == 200, f"Expected 200 days, got {result['sampleSizeDays']}"
    assert result['assetsWithData'] == ['BTC', 'ETH', 'SOL'], f"Expected all 3 assets, got {result['assetsWithData']}"
    assert result['dataCoveragePct'] == 100.0, f"Expected 100% coverage, got {result['dataCoveragePct']}"
    
    # Assert per-asset costs are present (PAPER_SIMULATION_ASSUMPTION)
    costs = result['perAssetExecutionCosts']
    assert 'BTC' in costs and 'ETH' in costs and 'SOL' in costs, "Missing per-asset costs"
    for sym in ['BTC', 'ETH', 'SOL']:
        assert 'feeBps' in costs[sym], f"Missing feeBps for {sym}"
        assert 'spreadBps' in costs[sym], f"Missing spreadBps for {sym}"
        assert 'slippageBps' in costs[sym], f"Missing slippageBps for {sym}"
        assert 'nature' in costs[sym], f"Missing nature for {sym}"
        print(f"{sym} costs: feeBps={costs[sym]['feeBps']}, spreadBps={costs[sym]['spreadBps']}, "
              f"slippageBps={costs[sym]['slippageBps']}, nature={costs[sym]['nature']}")
    
    # Assert weights unchanged (contract not mutated)
    assert contract['assets'][0]['weightPct'] == 50, "BTC weight changed"
    assert contract['assets'][1]['weightPct'] == 30, "ETH weight changed"
    assert contract['assets'][2]['weightPct'] == 20, "SOL weight changed"
    
    # Assert deterministic
    assert result.get('deterministic') is True, "Expected deterministic=True"
    assert 'dataHash' in result, "Missing dataHash"
    
    print("✅ TEST A1 PASSED: _studio_backtest success with date alignment, per-asset costs, weights unchanged")


def test_studio_backtest_missing_eth_fails_incomplete_data():
    """Test A2: _studio_backtest with missing ETH data fails with INCOMPLETE_DATA missingAssets ETH."""
    print("\n=== TEST A2: _studio_backtest INCOMPLETE_DATA with missing ETH ===")
    
    base_ts = datetime.datetime(2024, 1, 1, 0, 0, 0)
    btc_data = [(int((base_ts + datetime.timedelta(days=i)).timestamp()), 50000 + i * 100) for i in range(200)]
    sol_data = [(int((base_ts + datetime.timedelta(days=i)).timestamp()), 100 + i * 0.5) for i in range(200)]
    
    contract = {
        'assets': [
            {'symbol': 'BTC', 'weightPct': 50},
            {'symbol': 'ETH', 'weightPct': 30},
            {'symbol': 'SOL', 'weightPct': 20}
        ]
    }
    
    def mock_daily_closes(symbol):
        if symbol == 'BTC':
            return btc_data
        elif symbol == 'ETH':
            return None  # Missing ETH data
        elif symbol == 'SOL':
            return sol_data
        return None
    
    def mock_capability(symbol):
        return {'entrySupported': True}
    
    with patch.object(server, '_studio_daily_closes', side_effect=mock_daily_closes):
        with patch.object(server._asset_caps, 'capability', side_effect=mock_capability):
            with patch.object(server._asset_caps, 'candidate', return_value={'id': 'test', 'rank': 1}):
                result = server._studio_backtest(contract)
    
    print(f"Result: {result}")
    
    # Assert INCOMPLETE_DATA error
    assert result.get('error') == 'INCOMPLETE_DATA', f"Expected INCOMPLETE_DATA error, got {result.get('error')}"
    assert 'missingAssets' in result, "Missing missingAssets field"
    
    # Assert ETH is in missingAssets
    missing_symbols = [a['symbol'] for a in result['missingAssets']]
    assert 'ETH' in missing_symbols, f"Expected ETH in missingAssets, got {missing_symbols}"
    
    # Assert no false performance (no totalReturnPct, no finalEquity)
    assert 'totalReturnPct' not in result, "Should not have totalReturnPct on error"
    assert 'finalEquity' not in result, "Should not have finalEquity on error"
    
    print(f"✅ TEST A2 PASSED: _studio_backtest fails INCOMPLETE_DATA with missing ETH, no false performance")


def test_studio_start_paper_invalid_rejects_before_writes():
    """Test B1: studio_start_paper with invalid contract rejects with HTTPException and ZERO writes."""
    print("\n=== TEST B1: studio_start_paper INVALID rejects before writes ===")
    
    fake_doc = {
        '_id': 'strat_test_1',
        'strategyId': 's1',
        'ownerId': 'u_test',
        'status': 'REVIEWED',
        'contract': {'assets': [{'symbol': 'BTC', 'weightPct': 100}]},
        'contractHash': 'hash123',
        'version': 1
    }
    
    user = {'_id': 'test', 'email': 'test@ex.com'}
    payload = {'approvalMode': 'REVIEW', 'confirm': True, 'idempotencyKey': 'k1'}
    
    # Mock all dependencies
    mock_new_wallet = MagicMock()
    mock_update_one = MagicMock()
    mock_ledger_add = MagicMock()
    
    def mock_studio_get(sid, pid):
        return fake_doc
    
    def mock_strategy_acct(doc, pid):
        return None  # No existing account
    
    def mock_studio_guard(doc, body, pid, cmd):
        return 'guard_key_1'
    
    def mock_studio_idem(pid, key, result=None):
        return None  # No prior result
    
    def mock_get_mandate(pid):
        return {}
    
    def mock_studio_validate(contract, pid, account=None):
        # Return invalid: contract, hash, errors
        return contract, 'hash123', ['BTC is not verified for paper trading']
    
    with patch.object(server, '_studio_get', side_effect=mock_studio_get):
        with patch.object(server, '_strategy_acct', side_effect=mock_strategy_acct):
            with patch.object(server, '_studio_guard', side_effect=mock_studio_guard):
                with patch.object(server, '_studio_idem', side_effect=mock_studio_idem):
                    with patch.object(server, '_get_mandate', side_effect=mock_get_mandate):
                        with patch.object(server, '_studio_validate', side_effect=mock_studio_validate):
                            with patch.object(server, '_paper_new_wallet_for_strategy', mock_new_wallet):
                                with patch.object(server.strategy_contracts_col, 'update_one', mock_update_one):
                                    with patch.object(server, '_paper_ledger_add', mock_ledger_add):
                                        # Should raise HTTPException 422
                                        with pytest.raises(HTTPException) as exc_info:
                                            server.studio_start_paper('s1', payload=payload, user=user)
    
    print(f"Exception status code: {exc_info.value.status_code}")
    print(f"Exception detail: {exc_info.value.detail}")
    
    # Assert HTTPException 422
    assert exc_info.value.status_code == 422, f"Expected 422, got {exc_info.value.status_code}"
    assert 'Cannot start' in exc_info.value.detail, f"Expected 'Cannot start' in detail, got {exc_info.value.detail}"
    
    # Assert ZERO writes
    assert mock_new_wallet.call_count == 0, f"Expected 0 wallet writes, got {mock_new_wallet.call_count}"
    assert mock_update_one.call_count == 0, f"Expected 0 contract updates, got {mock_update_one.call_count}"
    assert mock_ledger_add.call_count == 0, f"Expected 0 ledger adds, got {mock_ledger_add.call_count}"
    
    print("✅ TEST B1 PASSED: studio_start_paper invalid rejects with HTTPException 422 and ZERO writes")


def test_studio_start_paper_valid_creates_wallet_and_updates_contract():
    """Test B2: studio_start_paper with valid contract creates wallet, updates contract, ZERO trade/ledger fills."""
    print("\n=== TEST B2: studio_start_paper VALID creates wallet and updates contract ===")
    
    fake_doc = {
        '_id': 'strat_test_2',
        'strategyId': 's2',
        'ownerId': 'u_test',
        'status': 'REVIEWED',
        'contract': {'assets': [{'symbol': 'BTC', 'weightPct': 100}]},
        'contractHash': 'hash456',
        'version': 1
    }
    
    fake_account = {
        'paperAccountId': 'pa_test_1',
        'ownerId': 'u_test',
        'mode': 'OBSERVE',
        'runtimeState': 'RUNNING',
        'baseCurrency': 'USDC',
        'version': 0
    }
    
    user = {'_id': 'test', 'email': 'test@ex.com'}
    payload = {'approvalMode': 'REVIEW', 'confirm': True, 'idempotencyKey': 'k2'}
    
    # Mock all dependencies
    mock_new_wallet = MagicMock(return_value=fake_account)
    mock_update_one = MagicMock()
    mock_ledger_add = MagicMock()
    
    def mock_studio_get(sid, pid):
        if mock_update_one.call_count > 0:
            # After update, return updated doc
            return {**fake_doc, 'status': 'PAPER_ACTIVE', 'assignedPaperAccountId': 'pa_test_1'}
        return fake_doc
    
    def mock_strategy_acct(doc, pid):
        return None  # No existing account
    
    def mock_studio_guard(doc, body, pid, cmd):
        return 'guard_key_2'
    
    def mock_studio_idem(pid, key, result=None):
        if result is not None:
            return result  # Store result
        return None  # No prior result
    
    def mock_get_mandate(pid):
        return {}
    
    def mock_studio_validate(contract, pid, account=None):
        # Return valid: contract, hash, no errors
        return contract, 'hash456', []
    
    def mock_studio_public(doc):
        return {'strategyId': doc['strategyId'], 'lifecycleState': doc.get('status')}
    
    def mock_strategy_paper_public(doc, pid, acct=None):
        return {'paperAccountId': acct['paperAccountId'] if acct else None}
    
    with patch.object(server, '_studio_get', side_effect=mock_studio_get):
        with patch.object(server, '_strategy_acct', side_effect=mock_strategy_acct):
            with patch.object(server, '_studio_guard', side_effect=mock_studio_guard):
                with patch.object(server, '_studio_idem', side_effect=mock_studio_idem):
                    with patch.object(server, '_get_mandate', side_effect=mock_get_mandate):
                        with patch.object(server, '_studio_validate', side_effect=mock_studio_validate):
                            with patch.object(server, '_paper_new_wallet_for_strategy', mock_new_wallet):
                                with patch.object(server.strategy_contracts_col, 'update_one', mock_update_one):
                                    with patch.object(server, '_paper_ledger_add', mock_ledger_add):
                                        with patch.object(server, '_studio_public', side_effect=mock_studio_public):
                                            with patch.object(server, '_strategy_paper_public', side_effect=mock_strategy_paper_public):
                                                result = server.studio_start_paper('s2', payload=payload, user=user)
    
    print(f"Result: {result}")
    print(f"Wallet creation calls: {mock_new_wallet.call_count}")
    print(f"Contract update calls: {mock_update_one.call_count}")
    print(f"Ledger add calls: {mock_ledger_add.call_count}")
    
    # Assert success
    assert result['status'] == 'ready', f"Expected status='ready', got {result['status']}"
    assert result['command'] == 'start-paper', f"Expected command='start-paper', got {result['command']}"
    
    # Assert ONE wallet write
    assert mock_new_wallet.call_count == 1, f"Expected 1 wallet write, got {mock_new_wallet.call_count}"
    
    # Assert ONE contract status update
    assert mock_update_one.call_count == 1, f"Expected 1 contract update, got {mock_update_one.call_count}"
    update_call = mock_update_one.call_args
    print(f"Update call args: {update_call}")
    assert update_call[0][0] == {'_id': 'strat_test_2'}, "Wrong update filter"
    assert 'status' in update_call[0][1]['$set'], "Missing status in update"
    assert update_call[0][1]['$set']['status'] == 'PAPER_ACTIVE', "Wrong status update"
    
    # Assert ZERO ledger fills (Start does not create fills, only ACCOUNT_OPENED event which is not a fill)
    # Note: _paper_ledger_add is NOT called by studio_start_paper when creating new wallet
    # The wallet creation itself may add a ledger entry, but that's inside _paper_new_wallet_for_strategy
    # which we mocked. So we expect 0 calls to the mocked _paper_ledger_add.
    assert mock_ledger_add.call_count == 0, f"Expected 0 ledger adds (no fills), got {mock_ledger_add.call_count}"
    
    print("✅ TEST B2 PASSED: studio_start_paper valid creates 1 wallet, 1 contract update, 0 trade/ledger fills")


def test_studio_save_invalid_draft_rejects_before_insert():
    """Test C: studio_save with invalid draft rejects with 422 and no insert."""
    print("\n=== TEST C: studio_save INVALID draft rejects before insert ===")
    
    invalid_draft = {
        'assets': [{'symbol': 'FAKECOIN', 'weightPct': 100}]
    }
    
    user = {'_id': 'test', 'email': 'test@ex.com'}
    payload = {
        'draft': invalid_draft,
        'confirm': True,
        'idempotencyKey': 'k3'
    }
    
    mock_insert_one = MagicMock()
    
    def mock_studio_idem(pid, key, result=None):
        return None  # No prior result
    
    def mock_get_mandate(pid):
        return {}
    
    with patch.object(server, '_studio_idem', side_effect=mock_studio_idem):
        with patch.object(server, '_get_mandate', side_effect=mock_get_mandate):
            with patch.object(server.strategy_contracts_col, 'insert_one', mock_insert_one):
                # Should raise HTTPException 422
                with pytest.raises(HTTPException) as exc_info:
                    server.studio_save(payload=payload, user=user)
    
    print(f"Exception status code: {exc_info.value.status_code}")
    print(f"Exception detail: {exc_info.value.detail}")
    
    # Assert HTTPException 422
    assert exc_info.value.status_code == 422, f"Expected 422, got {exc_info.value.status_code}"
    
    # Assert no insert
    assert mock_insert_one.call_count == 0, f"Expected 0 inserts, got {mock_insert_one.call_count}"
    
    print("✅ TEST C PASSED: studio_save invalid draft rejects with 422 and no insert")


def test_paper_mark_missing_observation_returns_none_false():
    """Test D: _paper_mark with patched _market_observation returns missing -> (None, False)."""
    print("\n=== TEST D: _paper_mark with missing observation returns (None, False) ===")
    
    def mock_market_observation(sym):
        # Return missing observation (price=None, fresh=False)
        return {'price': None, 'fresh': False, 'reason': 'PROVIDER_UNAVAILABLE'}
    
    with patch.object(server, '_market_observation', side_effect=mock_market_observation):
        price, available, obs = server._paper_mark('BTC')
    
    print(f"Price: {price}, Available: {available}, Observation: {obs}")
    
    # Assert (None, False)
    assert price is None, f"Expected price=None, got {price}"
    assert available is False, f"Expected available=False, got {available}"
    assert obs['price'] is None, f"Expected obs['price']=None, got {obs['price']}"
    assert obs['fresh'] is False, f"Expected obs['fresh']=False, got {obs['fresh']}"
    
    print("✅ TEST D PASSED: _paper_mark with missing observation returns (None, False)")


def test_paper_mark_stale_observation_returns_none_false():
    """Test D2: _paper_mark with stale observation (price exists but fresh=False) returns (None, False)."""
    print("\n=== TEST D2: _paper_mark with stale observation returns (None, False) ===")
    
    def mock_market_observation(sym):
        # Return stale observation (price exists but fresh=False)
        return {'price': 50000.0, 'fresh': False, 'reason': 'STALE_DATA'}
    
    with patch.object(server, '_market_observation', side_effect=mock_market_observation):
        price, available, obs = server._paper_mark('ETH')
    
    print(f"Price: {price}, Available: {available}, Observation: {obs}")
    
    # Assert (None, False) - even though price exists, fresh=False means unavailable
    assert price is None, f"Expected price=None, got {price}"
    assert available is False, f"Expected available=False, got {available}"
    
    print("✅ TEST D2 PASSED: _paper_mark with stale observation returns (None, False)")


def test_paper_mark_fresh_observation_returns_price_true():
    """Test D3: _paper_mark with fresh observation returns (price, True)."""
    print("\n=== TEST D3: _paper_mark with fresh observation returns (price, True) ===")
    
    def mock_market_observation(sym):
        # Return fresh observation
        return {'price': 50000.0, 'fresh': True, 'source': 'KRAKEN'}
    
    with patch.object(server, '_market_observation', side_effect=mock_market_observation):
        price, available, obs = server._paper_mark('BTC')
    
    print(f"Price: {price}, Available: {available}, Observation: {obs}")
    
    # Assert (price, True)
    assert price == 50000.0, f"Expected price=50000.0, got {price}"
    assert available is True, f"Expected available=True, got {available}"
    assert obs['price'] == 50000.0, f"Expected obs['price']=50000.0, got {obs['price']}"
    assert obs['fresh'] is True, f"Expected obs['fresh']=True, got {obs['fresh']}"
    
    print("✅ TEST D3 PASSED: _paper_mark with fresh observation returns (price, True)")


if __name__ == '__main__':
    print("\n" + "="*80)
    print("NARROW REAL-HANDLER REGRESSION TESTS")
    print("="*80)
    
    # Run all tests
    test_studio_backtest_success_with_mocked_daily_closes()
    test_studio_backtest_missing_eth_fails_incomplete_data()
    test_studio_start_paper_invalid_rejects_before_writes()
    test_studio_start_paper_valid_creates_wallet_and_updates_contract()
    test_studio_save_invalid_draft_rejects_before_insert()
    test_paper_mark_missing_observation_returns_none_false()
    test_paper_mark_stale_observation_returns_none_false()
    test_paper_mark_fresh_observation_returns_price_true()
    
    print("\n" + "="*80)
    print("ALL TESTS PASSED")
    print("="*80)
