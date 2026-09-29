"""Refresh regression tests: isolated Mongo store, actual route bodies and dispatcher.

No production database, provider requests, model calls, or paper executions.
"""
import ast
import concurrent.futures
from pathlib import Path
import re
import sys
import threading
import time
import traceback
import uuid

import mongomock
import pytest
from fastapi import Body, Depends, FastAPI, Header, HTTPException, Request
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from albert.analysis_jobs import AnalysisJobs, normalise, refresh_scope


class Queue:
    def __init__(self):
        self.pending = []

    def submit(self, fn, *args):
        self.pending.append((fn, args))

    def drain(self):
        while self.pending:
            fn, args = self.pending.pop(0)
            fn(*args)


@pytest.fixture
def tracker():
    return AnalysisJobs(mongomock.MongoClient().db.misc, Queue())


def request(tracker, work=lambda: {'status': 'succeeded', 'dataObservedAt': '2026-09-28'}, owner='owner-a'):
    return tracker.request('market', ['BTC'], owner, 'test', [('market_BTC', 'BTC market feeds', work)])


@pytest.mark.parametrize('text,scope', [
    ('Run a full data and engine refresh', 'full'),
    ('Run a test for Albert to refresh the data / engines', 'full'),
    ('Refresh the engines', 'engine'), ('Can you update the news?', 'news'),
    ('Reassess my strategies', 'strategy'), ('Check the market', 'market'),
    ('How does the engine refresh work?', None), ('Did the refresh complete?', None),
    ('Do not refresh data', None), ('Why did the engine run fail?', None),
    ('What is a refresh?', None), ('Buy BTC', None),
    ('Update my strategy to use a 5% stop loss', None), ('Run all my paper strategies', None),
])
def test_explicit_request_routing(text, scope):
    assert refresh_scope(text) == scope


def test_unique_runs_keep_unchanged_source_time_and_prior_results(tracker):
    first = request(tracker)
    tracker.executor.drain()
    prior = tracker.get(first['jobId'], 'owner-a')
    second = request(tracker)
    tracker.executor.drain()
    assert first['jobId'] != second['jobId']
    assert tracker.get(first['jobId'], 'owner-a') == prior
    assert tracker.get(second['jobId'], 'owner-a')['status'] == 'succeeded'
    state = tracker.engine_status('owner-a')['market_BTC']
    assert state['dataObservedAt'] == '2026-09-28'
    assert state['lastSuccessfulAt'] and state['lastAttemptedAt']


def test_duplicates_join_and_other_owners_cannot_read_runs(tracker):
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        jobs = list(pool.map(lambda _: request(tracker), range(8)))
    assert len({j['jobId'] for j in jobs}) == 1
    assert len(tracker.executor.pending) == 1
    assert sum(not j['joined'] for j in jobs) == 1
    assert tracker.get(jobs[0]['jobId'], 'owner-b') is None
    assert tracker.latest('owner-b') is None


def test_engine_lock_is_shared_with_scheduler(tracker):
    started, release = threading.Event(), threading.Event()

    def work():
        started.set()
        assert release.wait(5)
        return {'status': 'succeeded'}

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        active = pool.submit(tracker.execute_engine, 'news', work)
        assert started.wait(5)
        try:
            duplicate = tracker.execute_engine('news', lambda: pytest.fail('Duplicate executed'))
            assert duplicate['status'] == 'busy'
        finally:
            release.set()
        assert active.result()['status'] == 'succeeded'


@pytest.mark.parametrize('outcome', [None, {'status': 'refreshed'}, {'status': 'failed', 'message': 'Source unavailable.'}])
def test_missing_or_failed_completion_cannot_pass(tracker, outcome):
    first = request(tracker)
    tracker.executor.drain()
    success_time = tracker.engine_status('owner-a')['market_BTC']['lastSuccessfulAt']
    failed = request(tracker, lambda: outcome)
    tracker.executor.drain()
    assert tracker.get(failed['jobId'], 'owner-a')['status'] == 'failed'
    assert tracker.engine_status('owner-a')['market_BTC']['lastSuccessfulAt'] == success_time


def test_mixed_outcomes_are_partial_and_never_hide_skipped_engines(tracker):
    job = tracker.request('full', ['BTC'], 'owner-a', 'test', [
        ('market_BTC', 'Market', lambda: {'status': 'succeeded'}),
        ('news', 'News', lambda: (_ for _ in ()).throw(RuntimeError('private secret'))),
        ('data_audit', 'Data Audit', lambda: {'status': 'skipped', 'message': 'No manual runner.'}),
    ])
    tracker.executor.drain()
    result = tracker.get(job['jobId'], 'owner-a')
    assert result['status'] == 'partially_succeeded'
    assert 'News:' in result['message'] and 'Data Audit:' in result['message']
    assert 'private secret' not in str(result)


def test_interrupted_worker_and_expired_queue_never_run_later(tracker):
    job = request(tracker, lambda: pytest.fail('Expired work executed'))
    raw = tracker.col.find_one({'_id': job['jobId']})
    tracker.col.update_one({'_id': raw['lock']}, {'$set': {'until': time.time() - 1}})
    assert tracker.get(job['jobId'], 'owner-a')['status'] == 'failed'
    tracker.executor.drain()
    assert tracker.get(job['jobId'], 'owner-a')['status'] == 'failed'


def test_failed_submission_records_failed_job(tracker):
    def unavailable(*args):
        raise RuntimeError('executor stopped')
    tracker.executor.submit = unavailable
    job = request(tracker)
    assert job['status'] == 'failed'
    assert 'could not start' in job['message']


def test_owner_specific_assessment_history_does_not_leak(tracker):
    tracker.execute_engine('strategy', lambda: {'status': 'succeeded', 'message': 'Private assessment.'}, owner='owner-a')
    assert 'strategy' not in tracker.engine_status('owner-b')


@pytest.mark.parametrize('symbols', [[], ['BTC', 1], {'BTC': True}, [None], ['BTC/USD'], ['A'] * 9])
def test_invalid_symbols_rejected(symbols):
    with pytest.raises(ValueError):
        normalise('full', symbols)


@pytest.fixture
def routes(tracker):
    # Compile the REAL handlers without importing server.py, whose import starts
    # external clients. Dependencies below are isolated work units, not providers.
    names = {'_analysis_steps', '_analysis_strategy_work', '_analysis_audit_work', 'request_analysis', 'get_analysis_job',
             '_analysis_chat_response', 'albert_ask', 'chat_endpoint', 'analysis_run_endpoint',
             'analysis_status_endpoint', 'analysis_latest_endpoint'}
    source = ast.parse((Path(__file__).resolve().parents[1] / 'server.py').read_text())
    module = ast.Module(body=[n for n in source.body if isinstance(n, ast.FunctionDef) and n.name in names], type_ignores=[])
    app = FastAPI()

    def current_user(x_owner: str = Header(default='owner-a')):
        return {'pid': x_owner}

    calls = []
    ns = dict(app=app, Body=Body, Depends=Depends, Request=Request, HTTPException=HTTPException,
              get_current_user=current_user, owner_pid=lambda u: u['pid'], re=re, uuid=uuid,
              traceback=traceback, _analysis_jobs=tracker, _normalise_analysis=normalise,
              _refresh_scope=refresh_scope, _too_many=lambda *a, **kw: None,
              LLM_READY_KEY=None, _HAS_LLM=False,
              COINGECKO_IDS={'BTC': 'bitcoin', 'ETH': 'ethereum'},
              _refresh_onchain_work=lambda sym: calls.append(('market', sym)) or {'status': 'succeeded'},
              _news_refresh_work=lambda: calls.append(('news',)) or {'status': 'succeeded'},
              _engine_snapshot_work=lambda: calls.append(('snapshot',)) or {'status': 'succeeded'},
              _albert_decisions=lambda pid: calls.append(('assessment', pid)) or {'decisions': []},
              data_audit_live=lambda: calls.append(('audit',)) or {'status': 'ready', 'checked_at': '2026-09-29T05:00:00Z'},
              _strategy_eval_job=lambda: pytest.fail('Refresh invoked strategy mutation worker'))
    exec(compile(module, 'server.py', 'exec'), ns)
    return TestClient(app), calls


@pytest.mark.parametrize('path', ['/api/v1/albert/ask', '/api/v1/chat'])
def test_both_chat_routes_start_full_refresh_without_model_and_report_results(routes, tracker, path):
    client, calls = routes
    response = client.post(path, json={'message': 'Please run a full data and engine refresh.', 'pid': 'victim'})
    assert response.status_code == 200
    job = response.json()['analysisJob']
    assert job['scope'] == 'full' and job['jobId']
    tracker.executor.drain()
    result = client.get('/api/v1/albert/analysis/status/' + job['jobId']).json()
    assert result['status'] == 'partially_succeeded'
    assert calls == [('market', 'BTC'), ('news',), ('snapshot',), ('assessment', 'owner-a'), ('audit',)]
    assert client.get('/api/v1/albert/analysis/status/' + job['jobId'], headers={'x-owner': 'owner-b'}).status_code == 404
    followup = client.post(path, json={'message': 'Did the refresh complete?'}).json()
    assert followup['analysisJob']['jobId'] == job['jobId']
    assert followup['analysisJob']['status'] == 'partially_succeeded'
    assert not tracker.executor.pending


def test_status_read_does_not_claim_missing_run_and_bad_scope_is_422(routes):
    client, calls = routes
    result = client.post('/api/v1/albert/ask', json={'message': 'Did the refresh complete?'}).json()
    assert result['analysisJob'] is None and 'unconfirmed' in result['reply']
    assert client.post('/api/v1/albert/analysis/run', json={'scope': 'typo'}).status_code == 422
    assert not calls


def test_explicit_asset_is_not_replaced_by_default_bitcoin(routes, tracker):
    client, calls = routes
    result = client.post('/api/v1/albert/ask', json={'message': 'Refresh ETH data'}).json()
    assert result['analysisJob']['symbols'] == ['ETH']
    tracker.executor.drain()
    assert calls == [('market', 'ETH')]
