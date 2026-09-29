"""Milestone E — Paper Workflows (strategy-bound multi-asset paper engine).

Proves: strategy + canonical must BOTH authorise an entry (universe constraint),
StrategyDecisionSnapshot materialisation & immutability, Observe = zero economic
effect, mode/pause/close require confirm + idempotency (+ cross-owner 404), idempotent
mode change, conversational command returns a CARD ONLY (no mutation), asset-specific
close, and approval strategy-revalidation binding fields.

Run:  cd /app/backend && python -m pytest tests/test_mE_paper_workflows.py -v
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
SC = server.strategy_contracts_col
SDS = server.strategy_decision_snapshots_col
PP = server.paper_proposals_col


def _user(uid):
    return {'_id': uid, 'email': f'{uid}@ex.com', 'name': uid}


def _mk_account(owner_uid, mode='APPROVAL_REQUIRED', lots=None, cash='100000', state='RUNNING'):
    econ = core.new_account_economics(Decimal(cash), Decimal('0'))
    a = {**econ, 'paperAccountId': 'pa_e_' + uuid.uuid4().hex[:10], 'ownerId': 'u_' + owner_uid,
         'name': 'e', 'baseCurrency': 'USDC', 'mode': mode, 'runtimeState': state,
         'version': 0, 'archivedAt': None, 'lots': lots or [], 'closedLots': [], 'ledger': [],
         'processedDecisionSnapshots': {}, 'marketObservationCursors': {},
         'createdAt': datetime.datetime.utcnow().isoformat()}
    PA.insert_one(dict(a))
    return PA.find_one({'paperAccountId': a['paperAccountId']})


def _mk_active_strategy(owner_uid, acct_id, syms=('SOL', 'NEAR', 'FIL')):
    assets = [{'symbol': s, 'weightPct': round(100 / len(syms), 2)} for s in syms]
    contract = server._studio_canonical({'assets': assets, 'timeframe': 'swing', 'reservePct': 20,
                                          'riskLimits': {'maxPositions': len(syms)}})
    chash = server._studio_short_hash(contract)
    sid = 'st_' + uuid.uuid4().hex[:10]
    doc = {'_id': f'{sid}:v1', 'strategyId': sid, 'ownerId': 'u_' + owner_uid, 'name': 'basket',
           'status': 'PAPER_ACTIVE', 'version': 1, 'contract': contract, 'contractHash': chash,
           'summary': 's', 'assignedPaperAccountId': acct_id, 'latest': True,
           'createdAt': 'x', 'updatedAt': 'x'}
    SC.insert_one(dict(doc))
    return doc


def _canon(sym, action='BUY', actionable=True, eligible=True, fresh=True):
    return {'asset': sym, 'action': action, 'actionable': actionable, 'eligible': eligible,
            'fresh': fresh, 'score': Decimal('80'), 'confidence': Decimal('0.8'), 'regime': 'BULL',
            'decisionSnapshotId': f's_{sym}_1', 'decisionId': f'd_{sym}_1',
            'decisionInputsHash': f'h_{sym}_1', 'engineVersion': 'test', 'mandateVersion': 1,
            'invalidationPrice': None, 'recommendedDeployNowUsd': Decimal('1000'),
            'expiresAt': (datetime.datetime.utcnow() + datetime.timedelta(hours=1)).isoformat(),
            'mandateChecks': {'mandateComplete': True}, 'sellPlan': None}


class _Patch:
    """Patch the worker's external dependencies to controlled, deterministic values."""
    def __init__(self, decisions, obs_id='obsX'):
        self.decisions = decisions
        self.obs_id = obs_id
        self._orig = {}

    def __enter__(self):
        self._orig['dec'] = server._paper_canonical_decisions
        self._orig['mark'] = server._paper_mark
        self._orig['alloc'] = server._paper_portfolio.allocate
        self._orig['size'] = server._paper_core.ticket_buy_sizing
        oid = self.obs_id
        server._paper_canonical_decisions = lambda pid, account=None: list(self.decisions)
        server._paper_mark = lambda sym: (Decimal('100'), True, {'obsId': f'{sym}:{oid}'})

        def _alloc(acct=None, equity_info=None, candidates=None, regime=None, marks=None, holding_scores=None):
            return {'intents': [{'symbol': c['symbol'], 'action': 'BUY', 'notional': Decimal('1000'),
                                 'boundBy': 'test'} for c in (candidates or []) if c['action'] == 'BUY']}
        server._paper_portfolio.allocate = _alloc

        def _size(sym, notional, px, price_q=None):
            return {'notional': Decimal('1000'), 'qty': Decimal('10'), 'fillPx': Decimal('100'),
                    'fee': Decimal('0'), 'trace': [{'gate': 'size', 'ok': True}]}
        server._paper_core.ticket_buy_sizing = _size
        return self

    def __exit__(self, *a):
        server._paper_canonical_decisions = self._orig['dec']
        server._paper_mark = self._orig['mark']
        server._paper_portfolio.allocate = self._orig['alloc']
        server._paper_core.ticket_buy_sizing = self._orig['size']


def test_units_strategy_binding_and_sds_immutability():
    uid = 'eu_' + uuid.uuid4().hex[:6]
    acct = _mk_account(uid)
    strat = _mk_active_strategy(uid, acct['paperAccountId'])
    assert server._strategy_for_account(acct)['strategyId'] == strat['strategyId']
    assert server._strategy_syms(strat) == {'SOL', 'NEAR', 'FIL'}
    can = _canon('SOL')
    sds1 = server._materialize_sds(acct, strat, can, {'obsId': 'o1'}, 'BUY', 'SOL',
                                   {'notional': Decimal('1000'), 'qty': Decimal('10'), 'fillPx': Decimal('100')},
                                   [{'gate': 'x'}], 'OBSERVED')
    # write-once: a second call with a different outcome must not overwrite
    sds2 = server._materialize_sds(acct, strat, can, {'obsId': 'o1'}, 'BUY', 'SOL', None, [], 'EXECUTED')
    assert sds1 == sds2
    doc = SDS.find_one({'_id': sds1})
    assert doc['outcome'] == 'OBSERVED'                    # unchanged (immutable)
    assert doc['strategyContractHash'] == strat['contractHash']
    assert doc['canonicalDecisionSnapshotId'] == 's_SOL_1'
    assert doc['ruleResults']['bothAuthorized'] is True


def test_approval_mode_both_authorize_and_proposal_binding():
    uid = 'ea_' + uuid.uuid4().hex[:6]
    acct = _mk_account(uid, mode='APPROVAL_REQUIRED')
    strat = _mk_active_strategy(uid, acct['paperAccountId'])
    # SOL is in the strategy universe; DOGE is NOT.
    with _Patch([_canon('SOL'), _canon('DOGE')]):
        server._autopilot_process_account_multi(PA.find_one({'paperAccountId': acct['paperAccountId']}))
    props = list(PP.find({'paperAccountId': acct['paperAccountId']}))
    by_asset = {p['asset']: p for p in props}
    assert 'SOL' in by_asset and 'DOGE' not in by_asset       # both must authorise
    sol = by_asset['SOL']
    assert sol['strategyId'] == strat['strategyId']
    assert sol['strategyVersion'] == 1
    assert sol['strategyContractHash'] == strat['contractHash']
    assert sol['strategyDecisionSnapshotId']
    sds = SDS.find_one({'_id': sol['strategyDecisionSnapshotId']})
    assert sds['outcome'] == 'PROPOSED' and sds['gateTrace']
    # DOGE recorded as observed-outside-strategy, no economic effect
    acct2 = PA.find_one({'paperAccountId': acct['paperAccountId']})
    assert not acct2.get('lots')
    assert any('outside the active strategy' in (e.get('note') or '') for e in (acct2.get('ledger') or []))


def test_observe_mode_zero_economic_effect():
    uid = 'eo_' + uuid.uuid4().hex[:6]
    acct = _mk_account(uid, mode='OBSERVE')
    strat = _mk_active_strategy(uid, acct['paperAccountId'])
    before_cash = acct['cashUSDC'] if 'cashUSDC' in acct else None
    with _Patch([_canon('SOL')]):
        server._autopilot_process_account_multi(PA.find_one({'paperAccountId': acct['paperAccountId']}))
    assert PP.count_documents({'paperAccountId': acct['paperAccountId']}) == 0    # no proposals
    acct2 = PA.find_one({'paperAccountId': acct['paperAccountId']})
    assert not acct2.get('lots')                                                  # no positions
    sds = SDS.find_one({'strategyId': strat['strategyId'], 'asset': 'SOL'})
    assert sds and sds['outcome'] == 'OBSERVED'


def test_mode_pause_close_require_confirm_and_idempotency():
    uid = 'em_' + uuid.uuid4().hex[:6]
    acct = _mk_account(uid, mode='OBSERVE')
    aid = acct['paperAccountId']; u = _user(uid)
    with pytest.raises(HTTPException) as e1:
        server.paper_set_mode(aid, payload={'mode': 'PAPER_AUTOPILOT'}, user=u)
    assert e1.value.status_code == 428                       # confirm required
    with pytest.raises(HTTPException) as e2:
        server.paper_set_mode(aid, payload={'mode': 'PAPER_AUTOPILOT', 'confirm': True}, user=u)
    assert e2.value.status_code == 422                       # idempotency required
    # idempotent: same key twice = one effect (version increments once)
    r1 = server.paper_set_mode(aid, payload={'mode': 'PAPER_AUTOPILOT', 'confirm': True, 'idempotencyKey': 'm1'}, user=u)
    v_after = PA.find_one({'paperAccountId': aid})['version']
    r2 = server.paper_set_mode(aid, payload={'mode': 'PAPER_AUTOPILOT', 'confirm': True, 'idempotencyKey': 'm1'}, user=u)
    assert r1 == r2 and PA.find_one({'paperAccountId': aid})['version'] == v_after
    # pause needs confirm
    with pytest.raises(HTTPException) as e3:
        server.paper_lifecycle(aid, 'pause', payload={}, user=u)
    assert e3.value.status_code == 428


def test_cross_owner_404_and_command_card_only():
    uidA = 'exA_' + uuid.uuid4().hex[:6]
    uidB = 'exB_' + uuid.uuid4().hex[:6]
    acctA = _mk_account(uidA, mode='OBSERVE')
    aid = acctA['paperAccountId']
    with pytest.raises(HTTPException) as e1:
        server.paper_set_mode(aid, payload={'mode': 'OBSERVE', 'confirm': True, 'idempotencyKey': 'z'}, user=_user(uidB))
    assert e1.value.status_code == 404
    # conversational command returns a CARD ONLY — no mutation
    before = PA.find_one({'paperAccountId': aid})['mode']
    out = server.paper_command(payload={'message': 'please switch to autopilot', 'paperAccountId': aid}, user=_user(uidA))
    assert out['card']['type'] == 'SET_MODE'
    assert out['card']['requiresConfirmation'] is True
    assert out['card']['mutation']['body']['confirm'] is True and out['card']['mutation']['body']['idempotencyKey']
    assert PA.find_one({'paperAccountId': aid})['mode'] == before    # unchanged — card only


def test_command_close_is_asset_specific():
    uid = 'ec_' + uuid.uuid4().hex[:6]
    lots = [{'lotId': 'pp_sol', 'asset': 'SOL', 'qty': core.to128(Decimal('10')),
             'avgEntry': core.to128(Decimal('100')), 'costBasis': core.to128(Decimal('1000')),
             'status': 'OPEN', 'positionVersion': 1},
            {'lotId': 'pp_btc', 'asset': 'BTC', 'qty': core.to128(Decimal('0.1')),
             'avgEntry': core.to128(Decimal('50000')), 'costBasis': core.to128(Decimal('5000')),
             'status': 'OPEN', 'positionVersion': 1}]
    acct = _mk_account(uid, mode='OBSERVE', lots=lots)
    orig = server._paper_mark
    server._paper_mark = lambda sym: (Decimal('110') if sym == 'SOL' else Decimal('51000'), True, {'obsId': 'o'})
    try:
        out = server.paper_command(payload={'message': 'close my SOL', 'paperAccountId': acct['paperAccountId']},
                                   user=_user(uid))
    finally:
        server._paper_mark = orig
    assert out['card']['type'] == 'CLOSE_POSITION'
    assert out['card']['asset'] == 'SOL'
    assert 'pp_sol' in out['card']['mutation']['path'] and 'pp_btc' not in out['card']['mutation']['path']
    assert out['card']['preview']['asset'] == 'SOL'


def test_paused_blocks_entries_allows_protective_exit():
    uid = 'ep_' + uuid.uuid4().hex[:6]
    # held SOL lot with an invalidation ABOVE the mark -> protective exit should fire even when paused
    lots = [{'lotId': 'pp_sol2', 'asset': 'SOL', 'qty': core.to128(Decimal('10')),
             'avgEntry': core.to128(Decimal('100')), 'costBasis': core.to128(Decimal('1000')),
             'invalidationPrice': core.to128(Decimal('120')), 'status': 'OPEN', 'positionVersion': 1}]
    acct = _mk_account(uid, mode='PAPER_AUTOPILOT', lots=lots, state='PAUSED_BY_USER')
    _mk_active_strategy(uid, acct['paperAccountId'])
    _exec_orig = server.PAPER_EXECUTION_ENABLED
    server.PAPER_EXECUTION_ENABLED = True
    orig_sell = server._paper_core.apply_sell_atomic
    sold = {'n': 0}

    def _sell(col, aid, pid, sizing, source=None, idem_key=None, proposal_id=None, canonical=None, asset=None):
        sold['n'] += 1
        return ({'proceeds': '1100'}, None, 200)
    server._paper_core.apply_sell_atomic = _sell
    try:
        with _Patch([_canon('SOL')]):
            server._autopilot_process_account_multi(PA.find_one({'paperAccountId': acct['paperAccountId']}))
    finally:
        server._paper_core.apply_sell_atomic = orig_sell
        server.PAPER_EXECUTION_ENABLED = _exec_orig
    # protective exit ran (>=1 sell) while paused; no BUY proposal/entry created
    assert sold['n'] >= 1
    assert PP.count_documents({'paperAccountId': acct['paperAccountId'], 'side': 'BUY'}) == 0
