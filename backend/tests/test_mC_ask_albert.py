"""Milestone C — Ask Albert (authenticated, owner-scoped, read-only companion).

Covers: identity from session (forged body pid ignored), bounded owner-scoped context,
cross-owner evidence access denied, prefilled entity handoff resolves owner-scoped,
guardrail system prompt, and no mutation surface.

Run:  cd /app/backend && python -m pytest tests/test_mC_ask_albert.py -v
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

PA = server.paper_accounts_col
PP = server.paper_proposals_col


def _user(uid):
    return {'_id': uid, 'email': f'{uid}@example.com', 'name': uid}


def _mk_account(owner_uid, with_lot=False):
    econ = core.new_account_economics(Decimal('100000'), Decimal('0'))
    lot = None
    a = {'paperAccountId': 'pa_c_' + uuid.uuid4().hex[:10], 'ownerId': 'u_' + owner_uid,
         'name': 'c', 'baseCurrency': 'USDC', 'mode': 'APPROVAL_REQUIRED', 'runtimeState': 'RUNNING',
         'version': 0, 'archivedAt': None, 'lots': [], 'closedLots': [], 'ledger': [],
         'createdAt': datetime.datetime.utcnow().isoformat(), **econ}
    if with_lot:
        lot = {'lotId': 'pp_' + uuid.uuid4().hex[:8], 'asset': 'ETH', 'status': 'OPEN',
               'qty': core.to128(Decimal('1')), 'avgEntry': core.to128(Decimal('2000')),
               'costBasis': core.to128(Decimal('2000')), 'positionVersion': 1,
               'entryDecisionSnapshotId': 's_eth_x', 'openedAt': datetime.datetime.utcnow().isoformat()}
        a['lots'] = [lot]
    PA.insert_one(dict(a))
    return a, lot


def _mk_proposal(acct_id):
    pid = 'prop_' + uuid.uuid4().hex[:10]
    PP.insert_one({'proposalId': pid, 'paperAccountId': acct_id, 'status': 'CREATED',
                   'side': 'BUY', 'asset': 'BTC', 'version': 0,
                   'createdAt': datetime.datetime.utcnow().isoformat(),
                   'expiresAt': (datetime.datetime.utcnow() + datetime.timedelta(minutes=10)).isoformat(),
                   'decisionSnapshotId': 's_btc_1', 'decisionInputsHash': 'h1'})
    return pid


def test_gather_is_owner_scoped_and_bounded():
    uidA = 'caA_' + uuid.uuid4().hex[:6]
    uidB = 'caB_' + uuid.uuid4().hex[:6]
    acctA, _ = _mk_account(uidA)
    acctB, _ = _mk_account(uidB)
    ctx, evidence, used, sop = server._ask_gather(_user(uidA), 'How is my paper account doing?')
    assert acctA['paperAccountId'] in ctx
    assert acctB['paperAccountId'] not in ctx           # never another owner's data
    assert 'state_of_play' in used and 'paper_account' in used
    assert len(ctx) <= 14200                             # hard bounded
    # every evidence ref carries the required metadata
    for e in evidence:
        for k in ('sourceId', 'asOf', 'freshness', 'deepLink'):
            assert k in e


def test_keyword_selection_pulls_extra_read_functions():
    uid = 'ck_' + uuid.uuid4().hex[:6]
    _mk_account(uid)
    _, _, used, _ = server._ask_gather(_user(uid), 'Why should I buy anything? show my strategies and rotations')
    assert 'current_decisions' in used
    assert 'strategies' in used
    assert 'rotation_history' in used


def test_cross_owner_evidence_denied():
    uidA = 'cxA_' + uuid.uuid4().hex[:6]
    uidB = 'cxB_' + uuid.uuid4().hex[:6]
    acctA, _ = _mk_account(uidA)
    acctB, lotB = _mk_account(uidB, with_lot=True)
    propB = _mk_proposal(acctB['paperAccountId'])
    pidA = 'u_' + uidA
    # A cannot resolve B's proposal / position / strategy
    dto, meta = server._ask_resolve_entity(pidA, 'proposal', propB)
    assert dto is None and meta['available'] is False
    dto2, meta2 = server._ask_resolve_entity(pidA, 'position', lotB['lotId'])
    assert dto2 is None and meta2['available'] is False
    # the evidence endpoint returns 404 for A resolving B's proposal
    with pytest.raises(HTTPException) as ex:
        server.albert_ask_evidence(type='proposal', id=propB, user=_user(uidA))
    assert ex.value.status_code == 404


def test_owner_can_resolve_own_evidence_with_metadata():
    uid = 'cown_' + uuid.uuid4().hex[:6]
    acct, lot = _mk_account(uid, with_lot=True)
    prop = _mk_proposal(acct['paperAccountId'])
    out = server.albert_ask_evidence(type='proposal', id=prop, user=_user(uid))
    assert out['status'] == 'ready'
    for k in ('asOf', 'freshness', 'sourceId', 'deepLink'):
        assert k in out
    # prefilled entity handoff surfaces the owned evidence in context
    ctx, evidence, used, _ = server._ask_gather(_user(uid), 'explain this proposal',
                                                 entity={'type': 'proposal', 'id': prop})
    assert any(e['label'].startswith('evidence:') for e in evidence)
    assert prop in ctx


def test_forged_body_pid_is_ignored():
    uidA = 'cfA_' + uuid.uuid4().hex[:6]
    uidB = 'cfB_' + uuid.uuid4().hex[:6]
    acctA, _ = _mk_account(uidA)
    acctB, _ = _mk_account(uidB)
    captured = {}

    def _stub(ctx, msg, sid, deep=False, system_override=None, grounded=True):
        captured['ctx'] = ctx
        captured['system'] = system_override
        return ('ok', 'test-model', [])

    orig = server._albert_answer
    server._albert_answer = _stub
    try:
        # A calls, but forges B's pid in the body — it must be ignored.
        res = server.albert_ask(request=None if False else _FakeReq(),
                                payload={'message': 'status?', 'pid': 'u_' + uidB},
                                user=_user(uidA))
    finally:
        server._albert_answer = orig
    assert res['status'] == 'ready'
    assert acctA['paperAccountId'] in captured['system']
    assert acctB['paperAccountId'] not in captured['system']


def test_system_prompt_has_guardrails_and_no_mutation_surface():
    s = server.ASK_ALBERT_SYSTEM
    # Albert cannot connect to an exchange or place real trades.
    assert 'CANNOT connect to an exchange' in s
    # Albert cannot place real trades.
    assert 'place real trade' in s.lower()
    # Albert cannot directly change a saved strategy or wallet.
    assert 'CANNOT directly change' in s
    # The prompt mentions owner-scoped access.
    assert 'owner' in s.lower() or 'another user' in s.lower()
    # the ask module exposes no mutation helpers
    assert not hasattr(server, '_ask_place_trade')
    assert not hasattr(server, '_ask_mutate')


class _FakeReq:
    """Minimal stand-in so the rate-limiter helper can read a client key."""
    client = type('C', (), {'host': '127.0.0.1'})()
    headers = {}
