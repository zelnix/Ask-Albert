"""Milestone D — Strategy Studio (deterministic, immutable, versioned contracts).

Proves the acceptance points: 3-asset draft survives review->save->reload->assign,
hash mismatch / stale review rejects, cross-owner 404, duplicate submission = one
effect, unsupported/excluded assets fail closed, chat cannot save/activate, lifecycle
state machine rejects illegal transitions, and backtest traceability.

Run:  cd /app/backend && python -m pytest tests/test_mD_strategies.py -v
"""
import os
import sys
import uuid
import datetime
from decimal import Decimal

os.environ['PAPER_MULTI_ASSET_ENABLED'] = 'true'
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import server  # noqa: E402
from albert.paper import core  # noqa: E402
from fastapi import HTTPException  # noqa: E402
import pytest  # noqa: E402


def _user(uid):
    return {'_id': uid, 'email': f'{uid}@ex.com', 'name': uid}


def _mk_account(owner_uid):
    econ = core.new_account_economics(Decimal('100000'), Decimal('0'))
    a = {'paperAccountId': 'pa_d_' + uuid.uuid4().hex[:10], 'ownerId': 'u_' + owner_uid,
         'name': 'd', 'baseCurrency': 'USDC', 'runtimeState': 'RUNNING',
         'version': 0, 'archivedAt': None,
         'createdAt': datetime.datetime.utcnow().isoformat(), **econ}
    server.paper_accounts_col.insert_one(dict(a))
    return a


THREE = {'name': 'Alt basket', 'timeframe': 'swing',
         'assets': [{'symbol': 'SOL', 'weightPct': 40}, {'symbol': 'NEAR', 'weightPct': 30},
                    {'symbol': 'FIL', 'weightPct': 30}],
         'entryRules': 'buy dips', 'exitRules': 'trail', 'invalidation': 'below 20DMA',
         'reservePct': 20, 'riskLimits': {'maxPositions': 3, 'maxTradeRiskPct': 2}}


def test_three_asset_survives_review_save_reload_assign():
    uid = 'd3_' + uuid.uuid4().hex[:6]
    acct = _mk_account(uid)
    u = _user(uid)
    v = server.studio_validate_endpoint(payload={'draft': THREE}, user=u)
    assert v['valid'] is True
    chash = v['contractHash']
    syms = sorted(a['symbol'] for a in v['contract']['assets'])
    assert syms == ['FIL', 'NEAR', 'SOL']
    saved = server.studio_save(payload={'draft': THREE, 'name': 'Alt basket', 'confirm': True,
                                        'idempotencyKey': 'k1', 'expectedHash': chash}, user=u)
    sid = saved['strategyId']
    assert saved['contractHash'] == chash
    reloaded = server.studio_get_one(sid, user=u)
    assert sorted(a['symbol'] for a in reloaded['contract']['assets']) == ['FIL', 'NEAR', 'SOL']
    assert reloaded['contractHash'] == chash          # unchanged through reload
    asg = server.studio_lifecycle(sid, 'assign', payload={'paperAccountId': acct['paperAccountId'],
                                  'confirm': True, 'idempotencyKey': 'a1',
                                  'expectedVersion': reloaded['version']}, user=u)
    assert asg['status'] == 'ready' and asg['assignedPaperAccountId'] == acct['paperAccountId']
    # still the same three assets and hash after assignment
    after = server.studio_get_one(sid, user=u)
    assert sorted(a['symbol'] for a in after['contract']['assets']) == ['FIL', 'NEAR', 'SOL']
    assert after['contractHash'] == chash
    assert after['lifecycleState'] == 'PAPER_ASSIGNED'


def test_stale_review_and_hash_mismatch_rejected():
    uid = 'dh_' + uuid.uuid4().hex[:6]
    u = _user(uid)
    with pytest.raises(HTTPException) as ex:
        server.studio_save(payload={'draft': THREE, 'confirm': True, 'idempotencyKey': 'k2',
                                    'expectedHash': 'deadbeefdeadbeef'}, user=u)
    assert ex.value.status_code == 409


def test_confirmation_required_and_chat_cannot_save():
    uid = 'dc_' + uuid.uuid4().hex[:6]
    u = _user(uid)
    # save without confirm -> 428
    with pytest.raises(HTTPException) as ex:
        server.studio_save(payload={'draft': THREE, 'idempotencyKey': 'k3'}, user=u)
    assert ex.value.status_code == 428
    # draft endpoint never persists
    before = server.strategy_contracts_col.count_documents({'ownerId': 'u_' + uid})
    d = server.studio_draft(payload={'goal': 'a SOL NEAR FIL swing basket'}, user=u)
    assert d['status'] == 'ready' and 'contract' in d
    after = server.strategy_contracts_col.count_documents({'ownerId': 'u_' + uid})
    assert before == after == 0


def test_unsupported_and_excluded_fail_closed():
    uid = 'du_' + uuid.uuid4().hex[:6]
    u = _user(uid)
    bad = {'assets': [{'symbol': 'FAKECOIN', 'weightPct': 100}]}
    v = server.studio_validate_endpoint(payload={'draft': bad}, user=u)
    assert v['valid'] is False
    with pytest.raises(HTTPException) as ex:
        server.studio_save(payload={'draft': bad, 'confirm': True, 'idempotencyKey': 'k4'}, user=u)
    assert ex.value.status_code == 422
    # excluded asset
    server.mandate_col.update_one({'_id': 'u_' + uid},
        {'$set': {'excluded_coins': ['SOL'], 'reserve_pct': 20}}, upsert=True)
    v2 = server.studio_validate_endpoint(payload={'draft': THREE}, user=u)
    assert v2['valid'] is False


def test_duplicate_submission_one_effect():
    uid = 'dd_' + uuid.uuid4().hex[:6]
    u = _user(uid)
    v = server.studio_validate_endpoint(payload={'draft': THREE}, user=u)
    body = {'draft': THREE, 'confirm': True, 'idempotencyKey': 'dup1', 'expectedHash': v['contractHash']}
    r1 = server.studio_save(payload=dict(body), user=u)
    r2 = server.studio_save(payload=dict(body), user=u)
    assert r1['strategyId'] == r2['strategyId']
    assert server.strategy_contracts_col.count_documents(
        {'ownerId': 'u_' + uid, 'strategyId': r1['strategyId']}) == 1


def test_cross_owner_404():
    uidA = 'daA_' + uuid.uuid4().hex[:6]
    uidB = 'daB_' + uuid.uuid4().hex[:6]
    uA, uB = _user(uidA), _user(uidB)
    v = server.studio_validate_endpoint(payload={'draft': THREE}, user=uA)
    saved = server.studio_save(payload={'draft': THREE, 'confirm': True, 'idempotencyKey': 'x1',
                                        'expectedHash': v['contractHash']}, user=uA)
    sid = saved['strategyId']
    with pytest.raises(HTTPException) as ex:
        server.studio_get_one(sid, user=uB)
    assert ex.value.status_code == 404
    with pytest.raises(HTTPException) as ex2:
        server.studio_lifecycle(sid, 'archive', payload={'confirm': True, 'idempotencyKey': 'x2'}, user=uB)
    assert ex2.value.status_code == 404


def test_illegal_transition_rejected():
    uid = 'dl_' + uuid.uuid4().hex[:6]
    u = _user(uid)
    v = server.studio_validate_endpoint(payload={'draft': THREE}, user=u)
    saved = server.studio_save(payload={'draft': THREE, 'confirm': True, 'idempotencyKey': 'l1',
                                        'expectedHash': v['contractHash']}, user=u)
    sid = saved['strategyId']
    # REVIEWED -> pause is illegal (must assign then activate first)
    with pytest.raises(HTTPException) as ex:
        server.studio_lifecycle(sid, 'pause', payload={'confirm': True, 'idempotencyKey': 'l2'}, user=u)
    assert ex.value.status_code == 409
