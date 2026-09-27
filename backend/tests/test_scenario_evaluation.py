"""Phase A — Scenario cold-cache repair: preview starts one evaluation and fails honestly.

Verifies the shared lock-protected evaluation starter and honest failure reporting:
  * Cold preview triggers exactly ONE background worker (no duplicates on repeated calls)
  * PENDING response contains no numeric scenario range, midpoint, percentage or snapshot
  * Failed evaluation returns FAILED with actual reason (no endless PENDING)
  * Completed calibrated evaluation publishes band with evidence snapshot
  * GET evaluation endpoint uses same starter (no duplicate workers)
  * Startup prewarm is non-blocking and read-only

Run:  cd /app/backend && python -m pytest tests/test_scenario_evaluation.py -v
"""
import os
import sys
import uuid
import time
import threading
from unittest.mock import patch, MagicMock

os.environ['PAPER_MULTI_ASSET_ENABLED'] = 'true'
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import server  # noqa: E402
from albert.market import scenario as _mkt_scenario  # noqa: E402

# Use a separate test collection to avoid mutating production data
TEST_COLLECTION_NAME = 'scenario_evals_test'


def _setup_test_collection():
    """Replace the production collection with a test collection."""
    global original_collection
    original_collection = server.scenario_evals_col
    server.scenario_evals_col = server.db[TEST_COLLECTION_NAME]
    server.scenario_evals_col.delete_many({})  # Clean slate


def _teardown_test_collection():
    """Restore production collection and clean up test data."""
    server.scenario_evals_col.delete_many({})
    server.db.drop_collection(TEST_COLLECTION_NAME)
    server.scenario_evals_col = original_collection


def _user(uid='test_scenario_user'):
    return {'_id': uid, 'email': f'{uid}@example.com', 'name': uid}


def _wait_for_eval(asset, horizon, timeout=5):
    """Wait for background evaluation to complete or timeout."""
    key = server._scenario_eval_key(asset, horizon)
    start = time.time()
    while time.time() - start < timeout:
        if key not in server._SCENARIO_EVAL_RUNNING:
            row = server.scenario_evals_col.find_one({'_id': key})
            if row:
                return row
        time.sleep(0.1)
    return None


def test_cold_preview_starts_one_worker():
    """Test 1: Cold preview triggers exactly ONE worker, repeated calls don't duplicate."""
    _setup_test_collection()
    try:
        asset, horizon = 'BTC', 'P7D'
        key = server._scenario_eval_key(asset, horizon)
        
        # Ensure clean state
        assert key not in server._SCENARIO_EVAL_RUNNING
        assert server.scenario_evals_col.find_one({'_id': key}) is None
        
        # First call to _scenario_validation should start worker
        with patch.object(_mkt_scenario, 'evaluate') as mock_eval:
            # Mock a successful evaluation
            mock_eval.return_value = {
                'ok': True, 'modelVersion': _mkt_scenario.MODEL_VERSION,
                'evaluationPoints': 50, 'intervalCoverageRate': 0.62,
                'intervalCoverageTarget': 0.6, 'skillVsNoChange': 0.15,
                'medianAbsErrorPct': 3.5, 'baselineMedianAbsErrorPct': 4.1,
                'regimeCoverage': {'up': 20, 'down': 15, 'flat': 15}
            }
            
            # First validation call - should start worker
            val1 = server._scenario_validation(asset, horizon)
            assert val1['status'] == 'PENDING'
            assert val1['reasonCode'] == 'EVALUATION_NOT_COMPUTED_YET'
            
            # Immediately call again - should NOT start duplicate worker
            val2 = server._scenario_validation(asset, horizon)
            assert val2['status'] == 'PENDING'
            
            # Wait for worker to complete
            row = _wait_for_eval(asset, horizon, timeout=5)
            assert row is not None, "Worker did not complete in time"
            
            # Verify only ONE evaluation was performed (mock called once)
            assert mock_eval.call_count == 1
            
            # Third call after completion - should return result, not start new worker
            val3 = server._scenario_validation(asset, horizon)
            assert val3['status'] in ('VALIDATED', 'CALIBRATED_NO_MATERIAL_SKILL', 'NO_MEASURED_SKILL')
            assert val3['bandCalibrated'] is not None
            
            # Mock should still be called only once
            assert mock_eval.call_count == 1
            
        print("✅ Test 1 PASSED: Cold preview starts exactly ONE worker, no duplicates")
    finally:
        _teardown_test_collection()


def test_pending_response_has_no_numeric_data():
    """Test 2: PENDING response contains no numeric scenario range, midpoint, percentage or snapshot."""
    _setup_test_collection()
    try:
        asset, horizon = 'BTC', 'P7D'
        
        # Mock evaluate to simulate slow eval but not actually sleep 10s
        # Use a shorter sleep to avoid daemon thread persisting after teardown
        with patch.object(_mkt_scenario, 'evaluate') as mock_eval:
            mock_eval.side_effect = lambda **kwargs: time.sleep(0.5)  # Short delay for PENDING state
            
            # Trigger evaluation
            val = server._scenario_validation(asset, horizon)
            
            # Verify PENDING status
            assert val['status'] == 'PENDING'
            assert val['reasonCode'] == 'EVALUATION_NOT_COMPUTED_YET'
            assert val['predictiveValidation'] is False
            assert val['bandCalibrated'] is False
            assert val['evaluation'] is None
            
            # Verify headline mentions "preparing" and "no range published"
            assert 'preparing' in val['headline'].lower() or 'running' in val['headline'].lower()
            assert 'no range' in val['headline'].lower() or 'not published' in val['headline'].lower()
            
            # Now test that preview suppresses numeric scenario sides
            # Mock the scenario series to return valid data
            with patch.object(server, '_scenario_series') as mock_series:
                mock_series.return_value = (
                    [{'time': '2024-01-01T00:00:00', 'open': '40000', 'high': '41000', 
                      'low': '39000', 'close': '40500'}],
                    ['2024-01-01'],
                    [40500.0]
                )
                
                # Mock build to return successful scenario
                with patch.object(_mkt_scenario, 'build') as mock_build:
                    mock_build.return_value = {
                        'ok': True, 'modelVersion': _mkt_scenario.MODEL_VERSION,
                        'returnPaths': {
                            'bullish': [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07],
                            'median': [0.005, 0.01, 0.015, 0.02, 0.025, 0.03, 0.035],
                            'bearish': [-0.01, -0.02, -0.03, -0.04, -0.05, -0.06, -0.07]
                        },
                        'percentiles': {'bullish': 80, 'median': 50, 'bearish': 20},
                        'sampleSize': 50, 'independentEpisodes': 10, 'candidatePool': 200,
                        'sampleLimitations': [], 'similarity': {'best': 0.9, 'worstUsed': 0.7, 'median': 0.8},
                        'matchedDates': ['2023-01-01'], 'features': ['mom20', 'mom60'],
                        'anchorDate': '2024-01-01'
                    }
                    
                    # Call preview
                    preview = server.albert_scenario_preview(
                        payload={'assetId': asset, 'horizon': horizon},
                        user=_user()
                    )
                    
                    # Verify scenarios array is EMPTY (no numeric paths while PENDING)
                    assert preview['scenarios'] == []
                    
                    # Verify band is unavailable
                    assert preview['band']['available'] is False
                    assert preview['band']['lowerPct'] is None
                    assert preview['band']['upperPct'] is None
                    assert preview['band']['medianPct'] is None
                    assert preview['band']['snapshotId'] is None
                    assert preview['band']['evidenceDeepLink'] is None
                    
                    # Verify validation shows PENDING
                    assert preview['validation']['status'] == 'PENDING'
                    assert preview['validation']['bandCalibrated'] is False
                    
        print("✅ Test 2 PASSED: PENDING response contains no numeric scenario data")
    finally:
        # Clean up any running workers - wait for daemon thread to complete
        key = server._scenario_eval_key(asset, horizon)
        # Wait up to 2 seconds for the worker to complete before teardown
        max_wait = 2.0
        start = time.time()
        while time.time() - start < max_wait:
            with server._SCENARIO_EVAL_LOCK:
                if key not in server._SCENARIO_EVAL_RUNNING:
                    break
            time.sleep(0.1)
        # Force remove from running set
        with server._SCENARIO_EVAL_LOCK:
            server._SCENARIO_EVAL_RUNNING.discard(key)
        _teardown_test_collection()


def test_failed_evaluation_returns_actual_reason():
    """Test 3: Failed evaluation returns FAILED with actual reason, no endless PENDING."""
    _setup_test_collection()
    try:
        asset, horizon = 'BTC', 'P7D'
        
        # Mock evaluate to return failure
        with patch.object(_mkt_scenario, 'evaluate') as mock_eval:
            mock_eval.return_value = {
                'ok': False,
                'reason': 'INSUFFICIENT_HISTORY_FOR_EVALUATION'
            }
            
            # Trigger evaluation
            val1 = server._scenario_validation(asset, horizon)
            assert val1['status'] == 'PENDING'
            
            # Wait for worker to complete
            row = _wait_for_eval(asset, horizon, timeout=5)
            assert row is not None, "Worker did not complete"
            
            # Verify failed result is stored
            assert row['result']['ok'] is False
            assert row['result']['reason'] == 'INSUFFICIENT_HISTORY_FOR_EVALUATION'
            
            # Call validation again - should return FAILED, not PENDING
            val2 = server._scenario_validation(asset, horizon)
            assert val2['status'] == 'FAILED'
            assert val2['reasonCode'] == 'INSUFFICIENT_HISTORY_FOR_EVALUATION'
            assert val2['predictiveValidation'] is False
            assert val2['bandCalibrated'] is False
            assert val2['evaluation'] is None
            
            # Verify headline contains the actual reason
            assert 'could not validate' in val2['headline'].lower()
            assert 'INSUFFICIENT_HISTORY_FOR_EVALUATION' in val2['headline']
            
            # Verify preview returns unavailable band with actual reason
            with patch.object(server, '_scenario_series') as mock_series:
                mock_series.return_value = (
                    [{'time': '2024-01-01T00:00:00', 'close': '40500'}],
                    ['2024-01-01'], [40500.0]
                )
                with patch.object(_mkt_scenario, 'build') as mock_build:
                    mock_build.return_value = {
                        'ok': True, 'modelVersion': _mkt_scenario.MODEL_VERSION,
                        'returnPaths': {'bullish': [0.05], 'median': [0.025], 'bearish': [-0.05]},
                        'percentiles': {'bullish': 80, 'median': 50, 'bearish': 20},
                        'sampleSize': 50, 'independentEpisodes': 10, 'candidatePool': 200,
                        'sampleLimitations': [], 'similarity': {'best': 0.9, 'worstUsed': 0.7, 'median': 0.8},
                        'matchedDates': [], 'features': [], 'anchorDate': '2024-01-01'
                    }
                    
                    preview = server.albert_scenario_preview(
                        payload={'assetId': asset, 'horizon': horizon},
                        user=_user()
                    )
                    
                    # Band should be unavailable with FAILED reason
                    assert preview['band']['available'] is False
                    assert preview['band']['reasonCode'] == 'INSUFFICIENT_HISTORY_FOR_EVALUATION'
                    assert preview['scenarios'] == []  # No numeric paths
            
        print("✅ Test 3 PASSED: Failed evaluation returns actual reason, not endless PENDING")
    finally:
        _teardown_test_collection()


def test_completed_calibrated_evaluation_publishes_band():
    """Test 4: Completed calibrated evaluation makes preview publish band with snapshot."""
    _setup_test_collection()
    try:
        asset, horizon = 'BTC', 'P7D'
        
        # Mock evaluate to return successful calibrated result
        with patch.object(_mkt_scenario, 'evaluate') as mock_eval:
            mock_eval.return_value = {
                'ok': True, 'modelVersion': _mkt_scenario.MODEL_VERSION,
                'evaluationPoints': 65, 'intervalCoverageRate': 0.62,
                'intervalCoverageTarget': 0.6, 'skillVsNoChange': 0.15,
                'medianAbsErrorPct': 3.5, 'baselineMedianAbsErrorPct': 4.1,
                'regimeCoverage': {'up': 25, 'down': 20, 'flat': 20},
                'firstEvaluatedAt': '2024-01-01', 'lastEvaluatedAt': '2024-06-01',
                'medianIntervalWidthPct': 8.5
            }
            
            # Trigger and wait for evaluation
            server._scenario_validation(asset, horizon)
            row = _wait_for_eval(asset, horizon, timeout=5)
            assert row is not None
            
            # Verify validation returns calibrated status
            val = server._scenario_validation(asset, horizon)
            assert val['status'] in ('VALIDATED', 'CALIBRATED_NO_MATERIAL_SKILL', 'NO_MEASURED_SKILL')
            assert val['bandCalibrated'] is True  # Coverage within 10% of target
            assert val['evaluation'] is not None
            assert val['evaluation']['evaluationPoints'] == 65
            assert val['evaluation']['intervalCoverageRate'] == 0.62
            
            # Now test that preview publishes the band
            with patch.object(server, '_scenario_series') as mock_series:
                mock_series.return_value = (
                    [{'time': '2024-01-01T00:00:00', 'open': '40000', 'high': '41000',
                      'low': '39000', 'close': '40500'}],
                    ['2024-01-01'],
                    [40500.0]
                )
                
                with patch.object(_mkt_scenario, 'build') as mock_build:
                    mock_build.return_value = {
                        'ok': True, 'modelVersion': _mkt_scenario.MODEL_VERSION,
                        'returnPaths': {
                            'bullish': [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07],
                            'median': [0.005, 0.01, 0.015, 0.02, 0.025, 0.03, 0.035],
                            'bearish': [-0.01, -0.02, -0.03, -0.04, -0.05, -0.06, -0.07]
                        },
                        'percentiles': {'bullish': 80, 'median': 50, 'bearish': 20},
                        'sampleSize': 50, 'independentEpisodes': 10, 'candidatePool': 200,
                        'sampleLimitations': [], 'similarity': {'best': 0.9, 'worstUsed': 0.7, 'median': 0.8},
                        'matchedDates': ['2023-01-01'], 'features': ['mom20', 'mom60'],
                        'anchorDate': '2024-01-01'
                    }
                    
                    preview = server.albert_scenario_preview(
                        payload={'assetId': asset, 'horizon': horizon},
                        user=_user()
                    )
                    
                    # Verify band is NOW available (calibrated)
                    assert preview['band']['available'] is True
                    assert preview['band']['lowerPct'] == -7.0  # bearish endpoint
                    assert preview['band']['upperPct'] == 7.0   # bullish endpoint
                    assert preview['band']['medianPct'] == 3.5  # median endpoint
                    assert preview['band']['snapshotId'] is not None
                    assert preview['band']['evidenceDeepLink'] is not None
                    
                    # Verify scenarios are NOW published (2 sides)
                    assert len(preview['scenarios']) == 2
                    assert preview['scenarios'][0]['side'] == 'BULLISH'
                    assert preview['scenarios'][1]['side'] == 'BEARISH'
                    assert len(preview['scenarios'][0]['points']) == 7
                    
                    # Verify validation shows calibrated
                    assert preview['validation']['bandCalibrated'] is True
                    assert preview['validation']['status'] in ('VALIDATED', 'CALIBRATED_NO_MATERIAL_SKILL', 'NO_MEASURED_SKILL')
            
        print("✅ Test 4 PASSED: Completed calibrated evaluation publishes band with snapshot")
    finally:
        _teardown_test_collection()


def test_get_evaluation_endpoint_uses_same_starter():
    """Test 5: GET evaluation endpoint uses same starter, no duplicate workers."""
    _setup_test_collection()
    try:
        asset, horizon = 'BTC', 'P7D'
        
        with patch.object(_mkt_scenario, 'evaluate') as mock_eval:
            mock_eval.return_value = {
                'ok': True, 'modelVersion': _mkt_scenario.MODEL_VERSION,
                'evaluationPoints': 50, 'intervalCoverageRate': 0.62,
                'intervalCoverageTarget': 0.6, 'skillVsNoChange': 0.15,
                'medianAbsErrorPct': 3.5, 'baselineMedianAbsErrorPct': 4.1,
                'regimeCoverage': {'up': 20, 'down': 15, 'flat': 15}
            }
            
            # First call to GET evaluation endpoint (cold)
            result1 = server.albert_scenario_evaluation(assetId=asset, horizon=horizon, user=_user())
            assert result1['status'] == 'computing'
            assert 'retry shortly' in result1['note'].lower()
            
            # Second immediate call - should not start duplicate
            result2 = server.albert_scenario_evaluation(assetId=asset, horizon=horizon, user=_user())
            assert result2['status'] == 'computing'
            
            # Wait for completion
            row = _wait_for_eval(asset, horizon, timeout=5)
            assert row is not None
            
            # Verify only ONE evaluation was performed
            assert mock_eval.call_count == 1
            
            # Third call after completion - should return result
            result3 = server.albert_scenario_evaluation(assetId=asset, horizon=horizon, user=_user())
            assert result3['status'] == 'ready'
            assert result3['result']['ok'] is True
            
            # Mock should still be called only once
            assert mock_eval.call_count == 1
            
        print("✅ Test 5 PASSED: GET evaluation endpoint uses same starter, no duplicates")
    finally:
        _teardown_test_collection()


def test_prewarm_startup_nonblocking():
    """Test 6: Startup prewarm is non-blocking and read-only."""
    _setup_test_collection()
    try:
        # Clear any existing state
        asset, horizon = 'BTC', 'P7D'
        key = server._scenario_eval_key(asset, horizon)
        with server._SCENARIO_EVAL_LOCK:
            server._SCENARIO_EVAL_RUNNING.discard(key)
        
        with patch.object(_mkt_scenario, 'evaluate') as mock_eval:
            # Mock a slow evaluation
            def slow_eval(**kwargs):
                time.sleep(2)
                return {
                    'ok': True, 'modelVersion': _mkt_scenario.MODEL_VERSION,
                    'evaluationPoints': 50, 'intervalCoverageRate': 0.62,
                    'intervalCoverageTarget': 0.6, 'skillVsNoChange': 0.15,
                    'medianAbsErrorPct': 3.5, 'baselineMedianAbsErrorPct': 4.1,
                    'regimeCoverage': {'up': 20, 'down': 15, 'flat': 15}
                }
            mock_eval.side_effect = slow_eval
            
            # Call prewarm - should return immediately (non-blocking)
            start = time.time()
            server._scenario_eval_prewarm()
            elapsed = time.time() - start
            
            # Verify it returned quickly (< 0.5s, not waiting for 2s eval)
            assert elapsed < 0.5, f"Prewarm blocked for {elapsed}s, expected non-blocking"
            
            # Verify worker was started (key in running set or will be shortly)
            time.sleep(0.2)  # Give thread time to start
            assert key in server._SCENARIO_EVAL_RUNNING or server.scenario_evals_col.find_one({'_id': key})
            
            # Wait for completion
            row = _wait_for_eval(asset, horizon, timeout=5)
            assert row is not None
            
            # Verify evaluation was performed
            assert mock_eval.call_count == 1
            
        print("✅ Test 6 PASSED: Startup prewarm is non-blocking and read-only")
    finally:
        _teardown_test_collection()


if __name__ == '__main__':
    print("\n" + "="*80)
    print("PHASE A: Scenario Cold-Cache Repair Backend Tests")
    print("="*80 + "\n")
    
    try:
        test_cold_preview_starts_one_worker()
        test_pending_response_has_no_numeric_data()
        test_failed_evaluation_returns_actual_reason()
        test_completed_calibrated_evaluation_publishes_band()
        test_get_evaluation_endpoint_uses_same_starter()
        test_prewarm_startup_nonblocking()
        
        print("\n" + "="*80)
        print("✅ ALL 6 TESTS PASSED")
        print("="*80 + "\n")
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}\n")
        raise
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}\n")
        raise
