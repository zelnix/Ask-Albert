"""Two actual direct-code tests: paper_proposal_action invalid BUY gate and market_adapter.ticker provenance.

Test 1: Invoke actual server.paper_proposal_action with an invalid BUY (unverified asset BTC) before canonical resolver.
Test 2: Invoke actual albert.market_adapter.ticker('BTC') with fake ccxt exchange for timestamp provenance.

No network, no DB, no real Gemini, no frontend agent, no deploy.
Run: cd /app/backend && python -m pytest tests/test_approval_and_ticker_provenance.py -v
"""
import os
import sys
import datetime
import time
from unittest.mock import MagicMock, patch
from decimal import Decimal

os.environ['PAPER_MULTI_ASSET_ENABLED'] = 'true'
os.environ['PAPER_EXECUTION_ENABLED'] = 'true'
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import server  # noqa: E402
from fastapi import HTTPException  # noqa: E402
import pytest  # noqa: E402
import ccxt  # noqa: E402
from albert import market_adapter  # noqa: E402


def test_paper_proposal_action_invalid_buy_unverified_asset_rejects_before_resolver():
    """Test 1: paper_proposal_action with invalid BUY (unverified asset BTC) rejects with 409 BEFORE
    any canonical resolver, wallet, ledger, or proposal writes.
    
    Setup: Patch PAPER_EXECUTION_ENABLED=True, _paper_get returns fake owned account, 
    paper_proposals_col.find_one returns fake CREATED proposal with future expiresAt, version=1,
    decisionSnapshotId='snap1', side='BUY', asset='BTC', account ID, owner.
    Payload: expectedProposalVersion=1, decisionSnapshotId='snap1', idempotencyKey='key'.
    Patch: _get_mandate={}, _paper_canonical_decisions mock, _paper_ledger_add mock,
    paper_proposals_col.update_one mock, paper_accounts_col.update_one mock.
    
    Since no verified assets registered (BTC not in VERIFIED_ASSET_IDS), real _asset_caps.capability('BTC')
    should reject with HTTPException 409 BEFORE resolver or writes.
    """
    print("\n=== TEST 1: paper_proposal_action invalid BUY with unverified asset rejects before resolver ===")
    
    # Create fake proposal (CREATED, future expiry, BUY, BTC)
    future_expiry = (datetime.datetime.utcnow() + datetime.timedelta(hours=1)).isoformat()
    fake_proposal = {
        'proposalId': 'prop_test_1',
        'paperAccountId': 'pa_test_1',
        'status': 'CREATED',
        'expiresAt': future_expiry,
        'version': 1,
        'decisionSnapshotId': 'snap1',
        'decisionInputsHash': 'hash123',
        'side': 'BUY',
        'asset': 'BTC',
        'strategyId': None,  # No strategy binding
    }
    
    # Create fake account (owned by test user)
    fake_account = {
        'paperAccountId': 'pa_test_1',
        'ownerId': 'u_test',
        'mode': 'OBSERVE',
        'runtimeState': 'RUNNING',
        'baseCurrency': 'USDC',
        'version': 0,
        'lots': []
    }
    
    user = {'_id': 'test', 'email': 'test@ex.com'}
    payload = {
        'expectedProposalVersion': 1,
        'decisionSnapshotId': 'snap1',
        'idempotencyKey': 'key1'
    }
    
    # Mock all dependencies
    mock_find_one = MagicMock(return_value=fake_proposal)
    mock_update_one = MagicMock()
    mock_ledger_add = MagicMock()
    mock_canonical_for = MagicMock()
    
    def mock_paper_get(account_id, pid):
        if account_id == 'pa_test_1' and pid == 'u_test':
            return fake_account
        return None
    
    def mock_get_mandate(pid):
        return {}  # Empty mandate (no approved_coins, no excluded_coins)
    
    # Patch PAPER_EXECUTION_ENABLED to True
    with patch.object(server, 'PAPER_EXECUTION_ENABLED', True):
        with patch.object(server.paper_proposals_col, 'find_one', mock_find_one):
            with patch.object(server, '_paper_get', side_effect=mock_paper_get):
                with patch.object(server, '_get_mandate', side_effect=mock_get_mandate):
                    with patch.object(server.paper_proposals_col, 'update_one', mock_update_one):
                        with patch.object(server, '_paper_ledger_add', mock_ledger_add):
                            with patch.object(server, '_paper_canonical_for', mock_canonical_for):
                                # Should raise HTTPException 409 BEFORE canonical resolver
                                with pytest.raises(HTTPException) as exc_info:
                                    server.paper_proposal_action('prop_test_1', 'approve', payload=payload, user=user)
    
    print(f"Exception status code: {exc_info.value.status_code}")
    print(f"Exception detail: {exc_info.value.detail}")
    
    # Assert HTTPException 409 (conflict)
    assert exc_info.value.status_code == 409, f"Expected 409, got {exc_info.value.status_code}"
    assert 'BTC cannot open new exposure' in exc_info.value.detail or 'ENTRY_PATH_UNVERIFIED' in exc_info.value.detail, \
        f"Expected BTC rejection message, got: {exc_info.value.detail}"
    
    # Assert ZERO calls to canonical resolver (never reached)
    assert mock_canonical_for.call_count == 0, f"Expected 0 canonical resolver calls, got {mock_canonical_for.call_count}"
    
    # Assert ZERO proposal status updates (never reached)
    assert mock_update_one.call_count == 0, f"Expected 0 proposal updates, got {mock_update_one.call_count}"
    
    # Assert ZERO ledger writes (never reached)
    assert mock_ledger_add.call_count == 0, f"Expected 0 ledger writes, got {mock_ledger_add.call_count}"
    
    print("✅ TEST 1 PASSED: paper_proposal_action invalid BUY rejected with 409 BEFORE resolver/writes")
    print(f"   Rejection reason: {exc_info.value.detail}")





def test_market_adapter_ticker_case_a_trade_event_timestamp():
    """Test 2A: market_adapter.ticker('BTC') with fake exchange where ticker timestamp is None,
    but recent trade has timestamp (now-1000ms) and price 123.4.
    
    Result should have: price='123.4', timestampSource='public_trade_event', 
    providerObservedAt distinct from receivedAt.
    """
    print("\n=== TEST 2A: market_adapter.ticker with trade event timestamp ===")
    
    now_ms = int(time.time() * 1000)
    trade_ts = now_ms - 1000  # 1 second ago
    
    # Create fake market dict
    fake_market = {
        'spot': True,
        'active': True,
        'id': 'XXBTZUSD',
        'symbol': 'BTC/USD',
        'base': 'BTC',
        'baseId': 'XXBT',
        'quote': 'USD',
        'precision': {'price': 0.1, 'amount': 0.00000001},
        'limits': {
            'amount': {'min': 0.0001},
            'cost': {'min': 10}
        }
    }
    
    # Create fake exchange
    fake_exchange = MagicMock()
    fake_exchange.markets = {'BTC/USD': fake_market}
    fake_exchange.precisionMode = ccxt.TICK_SIZE
    fake_exchange.has = {'fetchTrades': True}
    
    # fetch_ticker returns ticker with no timestamp
    fake_exchange.fetch_ticker = MagicMock(return_value={
        'last': 123.4,
        'timestamp': None,  # No ticker event time
        'bid': 123.3,
        'ask': 123.5
    })
    
    # fetch_trades returns recent trade with timestamp and price
    fake_exchange.fetch_trades = MagicMock(return_value=[
        {'timestamp': trade_ts, 'price': 123.4}
    ])
    
    # Patch _exchange to return our fake exchange
    def mock_exchange(name):
        if name == 'kraken':
            return fake_exchange
        raise market_adapter.MarketUnavailable('PROVIDER_NOT_APPROVED', name)
    
    # Patch PROVIDERS to only try kraken
    with patch.object(market_adapter, 'PROVIDERS', ('kraken',)):
        with patch.object(market_adapter, '_exchange', side_effect=mock_exchange):
            # Patch candidate to return fake BTC item
            with patch.object(market_adapter.caps, 'candidate', return_value={
                'id': 'bitcoin', 'symbol': 'BTC', 'rank': 1
            }):
                # Patch provider_bases to return ['BTC']
                with patch.object(market_adapter.caps, 'provider_bases', return_value=['BTC']):
                    result = market_adapter.ticker('BTC')
    
    print(f"Result keys: {result.keys()}")
    print(f"Price: {result['price']}")
    print(f"Timestamp source: {result['timestampSource']}")
    print(f"Provider timestamp: {result['providerTimestamp']}")
    print(f"Provider observed at: {result['providerObservedAt']}")
    print(f"Received at: {result['receivedAt']}")
    
    # Assert price from trade
    assert result['price'] == '123.4', f"Expected price='123.4', got {result['price']}"
    
    # Assert timestamp source is public_trade_event
    assert result['timestampSource'] == 'public_trade_event', \
        f"Expected timestampSource='public_trade_event', got {result['timestampSource']}"
    
    # Assert providerTimestamp is the trade timestamp
    assert result['providerTimestamp'] == trade_ts, \
        f"Expected providerTimestamp={trade_ts}, got {result['providerTimestamp']}"
    
    # Assert providerObservedAt is distinct from receivedAt
    assert result['providerObservedAt'] != result['receivedAt'], \
        "Expected providerObservedAt to be distinct from receivedAt"
    
    # Assert fetch_trades was called (fallback to trades)
    assert fake_exchange.fetch_trades.call_count == 1, \
        f"Expected fetch_trades called once, got {fake_exchange.fetch_trades.call_count}"
    
    print("✅ TEST 2A PASSED: ticker with trade event timestamp, price from trade, providerObservedAt distinct")


def test_market_adapter_ticker_case_b_no_timestamp_no_recent_trade():
    """Test 2B: market_adapter.ticker('BTC') with fake exchange where ticker timestamp is None
    and no recent trade (or trades too old).
    
    Should raise MarketUnavailable with code QUOTE_UNAVAILABLE and detail containing FRESHNESS_UNPROVEN.
    """
    print("\n=== TEST 2B: market_adapter.ticker with no timestamp and no recent trade ===")
    
    now_ms = int(time.time() * 1000)
    old_trade_ts = now_ms - 120_000  # 2 minutes ago (too old, MAX_TICKER_AGE_MS=60000)
    
    fake_market = {
        'spot': True,
        'active': True,
        'id': 'XXBTZUSD',
        'symbol': 'BTC/USD',
        'base': 'BTC',
        'baseId': 'XXBT',
        'quote': 'USD',
        'precision': {'price': 0.1, 'amount': 0.00000001},
        'limits': {
            'amount': {'min': 0.0001},
            'cost': {'min': 10}
        }
    }
    
    fake_exchange = MagicMock()
    fake_exchange.markets = {'BTC/USD': fake_market}
    fake_exchange.precisionMode = ccxt.TICK_SIZE
    fake_exchange.has = {'fetchTrades': True}
    
    # fetch_ticker returns ticker with no timestamp
    fake_exchange.fetch_ticker = MagicMock(return_value={
        'last': 123.4,
        'timestamp': None,
        'bid': 123.3,
        'ask': 123.5
    })
    
    # fetch_trades returns old trade (too stale)
    fake_exchange.fetch_trades = MagicMock(return_value=[
        {'timestamp': old_trade_ts, 'price': 123.4}
    ])
    
    def mock_exchange(name):
        if name == 'kraken':
            return fake_exchange
        raise market_adapter.MarketUnavailable('PROVIDER_NOT_APPROVED', name)
    
    with patch.object(market_adapter, 'PROVIDERS', ('kraken',)):
        with patch.object(market_adapter, '_exchange', side_effect=mock_exchange):
            with patch.object(market_adapter.caps, 'candidate', return_value={
                'id': 'bitcoin', 'symbol': 'BTC', 'rank': 1
            }):
                with patch.object(market_adapter.caps, 'provider_bases', return_value=['BTC']):
                    # Should raise MarketUnavailable
                    with pytest.raises(market_adapter.MarketUnavailable) as exc_info:
                        market_adapter.ticker('BTC')
    
    print(f"Exception code: {exc_info.value.code}")
    print(f"Exception detail: {exc_info.value.detail}")
    
    # Assert code is QUOTE_UNAVAILABLE
    assert exc_info.value.code == 'QUOTE_UNAVAILABLE', \
        f"Expected code='QUOTE_UNAVAILABLE', got {exc_info.value.code}"
    
    # Assert detail contains FRESHNESS_UNPROVEN
    assert 'FRESHNESS_UNPROVEN' in exc_info.value.detail, \
        f"Expected 'FRESHNESS_UNPROVEN' in detail, got: {exc_info.value.detail}"
    
    print("✅ TEST 2B PASSED: ticker with no timestamp and no recent trade raises MarketUnavailable FRESHNESS_UNPROVEN")


def test_market_adapter_ticker_case_c_ticker_has_timestamp():
    """Test 2C: market_adapter.ticker('BTC') with fake exchange where ticker has timestamp (now-1000ms).
    
    Should use ticker timestamp and price, NOT call fetch_trades.
    """
    print("\n=== TEST 2C: market_adapter.ticker with ticker timestamp ===")
    
    now_ms = int(time.time() * 1000)
    ticker_ts = now_ms - 1000  # 1 second ago
    
    fake_market = {
        'spot': True,
        'active': True,
        'id': 'XXBTZUSD',
        'symbol': 'BTC/USD',
        'base': 'BTC',
        'baseId': 'XXBT',
        'quote': 'USD',
        'precision': {'price': 0.1, 'amount': 0.00000001},
        'limits': {
            'amount': {'min': 0.0001},
            'cost': {'min': 10}
        }
    }
    
    fake_exchange = MagicMock()
    fake_exchange.markets = {'BTC/USD': fake_market}
    fake_exchange.precisionMode = ccxt.TICK_SIZE
    fake_exchange.has = {'fetchTrades': True}
    
    # fetch_ticker returns ticker WITH timestamp
    fake_exchange.fetch_ticker = MagicMock(return_value={
        'last': 456.78,
        'timestamp': ticker_ts,  # Ticker has event time
        'bid': 456.7,
        'ask': 456.9
    })
    
    # fetch_trades should NOT be called
    fake_exchange.fetch_trades = MagicMock()
    
    def mock_exchange(name):
        if name == 'kraken':
            return fake_exchange
        raise market_adapter.MarketUnavailable('PROVIDER_NOT_APPROVED', name)
    
    with patch.object(market_adapter, 'PROVIDERS', ('kraken',)):
        with patch.object(market_adapter, '_exchange', side_effect=mock_exchange):
            with patch.object(market_adapter.caps, 'candidate', return_value={
                'id': 'bitcoin', 'symbol': 'BTC', 'rank': 1
            }):
                with patch.object(market_adapter.caps, 'provider_bases', return_value=['BTC']):
                    result = market_adapter.ticker('BTC')
    
    print(f"Result keys: {result.keys()}")
    print(f"Price: {result['price']}")
    print(f"Timestamp source: {result['timestampSource']}")
    print(f"Provider timestamp: {result['providerTimestamp']}")
    
    # Assert price from ticker
    assert result['price'] == '456.78', f"Expected price='456.78', got {result['price']}"
    
    # Assert timestamp source is ticker_event
    assert result['timestampSource'] == 'ticker_event', \
        f"Expected timestampSource='ticker_event', got {result['timestampSource']}"
    
    # Assert providerTimestamp is the ticker timestamp
    assert result['providerTimestamp'] == ticker_ts, \
        f"Expected providerTimestamp={ticker_ts}, got {result['providerTimestamp']}"
    
    # Assert fetch_trades was NOT called (ticker had timestamp)
    assert fake_exchange.fetch_trades.call_count == 0, \
        f"Expected fetch_trades NOT called, got {fake_exchange.fetch_trades.call_count} calls"
    
    print("✅ TEST 2C PASSED: ticker with timestamp uses ticker price, no trades called")


if __name__ == '__main__':
    print("\n" + "="*80)
    print("APPROVAL PREFLIGHT AND TICKER PROVENANCE TESTS")
    print("="*80)
    
    # Run all tests
    test_paper_proposal_action_invalid_buy_unverified_asset_rejects_before_resolver()
    test_market_adapter_ticker_case_a_trade_event_timestamp()
    test_market_adapter_ticker_case_b_no_timestamp_no_recent_trade()
    test_market_adapter_ticker_case_c_ticker_has_timestamp()
    
    print("\n" + "="*80)
    print("ALL TESTS PASSED")
    print("="*80)
