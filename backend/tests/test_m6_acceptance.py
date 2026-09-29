"""Ask-Albert remediation — Milestone 6 (external-review hardening) tests.

Covers blockers #2 (single portfolio source) and #3 (provider-observation binding),
and the end-to-end ACCEPTANCE SEQUENCE the reviewer required:

  create account -> canonical BUY sized from THAT account -> a genuinely later
  provider observation -> fill -> the NEXT decision's portfolio reflects the fill ->
  altcoin manual close -> reconciliation.

The engine's economic core, the account-derived portfolio summary, the provider
observation binding, the fills, the manual close and the reconciliation all run for
REAL here (only the canonical decision CONTENT and the market provider feed are
injected, because we cannot force the live engine to emit a BUY on demand).

Run:  cd /app/backend && python -m pytest tests/test_m6_acceptance.py -v
"""
import os
import sys
import time
import uuid
import datetime
from decimal import Decimal

import pytest

os.environ['PAPER_EXECUTION_ENABLED'] = 'true'
os.environ['PAPER_AUTOPILOT_ENABLED'] = 'true'
os.environ['PAPER_MULTI_ASSET_ENABLED'] = 'true'
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import server  # noqa: E402
from albert.paper import core  # noqa: E402

PA = server.paper_accounts_col


def _acct(cash='100000', lots=None):
    econ = core.new_account_economics(Decimal(cash), Decimal('0'))
    a = {'paperAccountId': 'pa_m6_' + uuid.uuid4().hex[:10], 'ownerId': 'u_m6_' + uuid.uuid4().hex[:6],
         'name': 'm6', 'baseCurrency': 'USDC', 'mode': 'PAPER_AUTOPILOT', 'runtimeState': 'RUNNING',
         'version': 0, 'archivedAt': None, 'createdAt': datetime.datetime.utcnow().isoformat(), **econ}
    a['lots'] = lots or []
    return a


def _lot(sym, qty, avg, inv=None):
    return {'lotId': 'pp_' + uuid.uuid4().hex[:8], 'asset': sym, 'status': 'OPEN',
            'qty': core.to128(Decimal(qty)), 'avgEntry': core.to128(Decimal(avg)),
            'costBasis': core.to128(Decimal(qty) * Decimal(avg)), 'positionVersion': 1,
            'invalidationPrice': core.to128(Decimal(inv)) if inv else None}


def _canon(sym, action='BUY', score='90', deploy='20000', price='100', inv='90', minutes_ago=2):
    dt = (datetime.datetime.utcnow() - datetime.timedelta(minutes=minutes_ago)).isoformat()
    return {'asset': sym, 'action': action, 'actionable': action in ('BUY', 'SELL'),
            'decisionSnapshotId': 's_%s_%s' % (sym, uuid.uuid4().hex[:6]), 'decisionId': 'd_' + sym,
            'decisionInputsHash': 'h_' + sym, 'engineVersion': 'albert-decide-v2', 'mandateVersion': 'mv',
            'regime': 'BULL', 'score': score, 'confidence': '80', 'rank': None,
            'currentPrice': price, 'invalidationPrice': inv,
            'mandateChecks': {'excluded': False, 'inApprovedUniverse': True, 'withinCap': True,
                              'withinRiskBudget': True, 'mandateComplete': True},
            'eligible': True, 'recommendedDeployNowUsd': deploy, 'sellPlan': None,
            'fresh': True, 'decisionTime': dt}


MANDATE = {'max_alloc_pct': {}, 'max_trade_risk_pct': '3', 'max_drawdown_pct': '30',
           'reserve_pct': 0, 'approved_coins': [], 'excluded_coins': []}


# ============================ BLOCKER #2: portfolio source =================== #
def test_engine_portfolio_source_is_the_selected_account(monkeypatch):
    monkeypatch.setattr(server, '_spot_price', lambda s: {'BTC': 60000, 'ETH': 3000}.get((s or '').upper(), 100))
    monkeypatch.setattr(server, '_get_mandate', lambda pid: dict(MANDATE))
    monkeypatch.setattr(server, '_mandate_complete', lambda m: True)

    # A FRESH $100k account must look like $100k of deployable capital (never $0).
    fresh = _acct('100000')
    summ = server._portfolio_summary_from_account(fresh)
    assert summ['usdc'] == 100000 and summ['total_value'] == 100000
    assert summ['deployable_usdc'] == 100000 and summ['holdings'] == []

    # An account holding ETH must surface that holding + reduced cash.
    held = _acct('70000', [_lot('ETH', '10', '3000')])
    s2 = server._portfolio_summary_from_account(held)
    assert s2['usdc'] == 70000 and s2['total_value'] == 100000
    assert any(h['asset'] == 'ETH' and h['size'] == 10 for h in s2['holdings'])

    # SEAM: _albert_decisions(pid, account) feeds THAT account's summary into the
    # engine (not portfolio_col / paper_portfolio_col).
    captured = {}

    def _fake_build(pid, summary_override=None):
        captured['ov'] = summary_override
        return {'decisions': [], 'snapshotId': 'x', 'summary': summary_override}
    monkeypatch.setattr(server._albert_decision_mod, 'build_decisions', _fake_build)
    server._albert_decisions('u_x', account=held)
    assert captured['ov'] is not None and captured['ov']['usdc'] == 70000
    # Without an account, the legacy portfolio summary is used (override is None).
    server._albert_decisions('u_x', account=None)
    assert captured['ov'] is None


# ============================ BLOCKER #3: observation binding ================ #
def test_provider_observation_id_binding(monkeypatch):
    seq = {'ts': '2025-01-01T00:00:00'}
    monkeypatch.setattr(server, 'ticker', lambda symbol='BTC': {'price': 60000, 'source': 'kraken', 'ts': seq['ts']})
    monkeypatch.setattr(server, '_ticker_cache', {'BTC': {'ts': time.time()}})

    o1 = server._market_observation('BTC')
    o2 = server._market_observation('BTC')
    assert o1['obsId'] and o1['obsId'] == o2['obsId']       # same provider tick -> same id
    assert o1['source'] == 'kraken' and o1['fresh'] is True

    seq['ts'] = '2025-01-01T00:00:09'                        # provider refreshed
    o3 = server._market_observation('BTC')
    assert o3['obsId'] != o1['obsId']                        # genuinely new observation -> new id

    # BTC mark now binds to the LIVE ticker observation (not the stale daily-run ts),
    # so BTC is executable inside its decision window.
    px, fresh, obs = server._paper_mark('BTC')
    assert fresh and px == Decimal('60000') and obs['source'] == 'kraken' and obs['obsId']


def test_stale_provider_observation_is_not_tradable(monkeypatch):
    monkeypatch.setattr(server, 'ticker', lambda symbol='BTC': {'price': 60000, 'source': 'kraken', 'ts': 't'})
    monkeypatch.setattr(server, '_ticker_cache', {'BTC': {'ts': time.time() - 600}})  # 10 min old
    monkeypatch.setattr(server, '_paper_btc_mark', lambda: (None, False, None))
    px, fresh, obs = server._paper_mark('BTC')
    assert fresh is False        # stale provider observation -> not a fresh mark


# ============================ ACCEPTANCE SEQUENCE ============================ #
def test_full_acceptance_sequence(monkeypatch):
    """create -> canonical BUY from the account -> later observation -> fill ->
    next decision sees the fill -> altcoin manual close -> reconciliation."""
    monkeypatch.setattr(server._albert_deps, 'get_mandate', lambda pid: dict(MANDATE))
    monkeypatch.setattr(server, '_get_mandate', lambda pid: dict(MANDATE))
    monkeypatch.setattr(server, '_mandate_complete', lambda m: True)
    monkeypatch.setattr(server, '_spot_price', lambda s: {'BTC': 60000, 'ETH': 3000}.get((s or '').upper(), 100))
    # avoid the live discovery/coingecko rank feed in the test
    monkeypatch.setattr(server, '_paper_live_ranks', lambda: ({}, {'available': False, 'fresh': False,
                                                               'snapshotId': None, 'source': None, 'observedAt': None}))
    # REAL provider-observation path via a controlled ticker feed (advancing ts).
    feed = {'BTC': {'price': 60000, 'source': 'kraken', 'ts': 'T0'},
            'ETH': {'price': 3000, 'source': 'kraken', 'ts': 'T0'}}
    monkeypatch.setattr(server, 'ticker', lambda symbol='BTC': dict(feed.get((symbol or 'BTC').upper(), {'price': None})))
    monkeypatch.setattr(server, '_ticker_cache', {'BTC': {'ts': time.time()}, 'ETH': {'ts': time.time()}})

    # 1) CREATE a fresh $100k account.
    a = _acct('100000')
    PA.insert_one(dict(a))
    aid = a['paperAccountId']; pid = a['ownerId']

    # 2) Canonical BUYs sized from THIS account (BTC + ETH). Injected content only.
    decisions = [_canon('BTC', 'BUY', score='92', deploy='20000', price='60000', inv='54000'),
                 _canon('ETH', 'BUY', score='84', deploy='15000', price='3000', inv='2700')]
    monkeypatch.setattr(server, '_paper_canonical_decisions', lambda pid, account=None: decisions)

    # 3+4) A genuinely later provider observation (T0) drives a real FILL via the worker.
    server._autopilot_process_account_multi(PA.find_one({'paperAccountId': aid}))
    a1 = PA.find_one({'paperAccountId': aid})
    assert core.position_qty(a1, 'BTC') > 0 and core.position_qty(a1, 'ETH') > 0
    cash_after = core.D(a1['cash'])
    assert cash_after < Decimal('100000')                  # real cash was spent

    # 5) The NEXT decision's portfolio source reflects the fill (holdings + reduced cash).
    summ = server._portfolio_summary_from_account(a1)
    held_syms = {h['asset'] for h in summ['holdings']}
    assert 'BTC' in held_syms and 'ETH' in held_syms
    assert summ['usdc'] == float(cash_after)               # engine now sees the real cash
    assert summ['holdings_value'] > 0

    # Same provider observation (T0) must NOT re-fill (no duplicate) ...
    n_fills = len([e for e in (a1.get('ledger') or []) if e.get('side')])
    server._autopilot_process_account_multi(PA.find_one({'paperAccountId': aid}))
    a2 = PA.find_one({'paperAccountId': aid})
    assert len([e for e in (a2.get('ledger') or []) if e.get('side')]) == n_fills

    # 6) ALTCOIN MANUAL CLOSE — closes ETH (not BTC). Uses a later observation (T1).
    feed['ETH']['ts'] = 'T1'; feed['BTC']['ts'] = 'T1'
    eth_lot = next(l for l in a2['lots'] if l['asset'] == 'ETH')
    px, fresh, _o = server._paper_mark('ETH')
    prof = server._paper_profiles.asset_profile('ETH')
    sizing = core.ticket_sell_sizing('ETH', core.D(eth_lot['qty']), px)
    res, err, code = core.apply_sell_atomic(PA, aid, pid, sizing, source='manual_close',
                                            idem_key='close_eth_' + eth_lot['lotId'], asset='ETH')
    assert err is None and res['asset'] == 'ETH'
    a3 = PA.find_one({'paperAccountId': aid})
    assert core.position_qty(a3, 'ETH') == 0               # ETH closed
    assert core.position_qty(a3, 'BTC') > 0                # BTC untouched (not the BTC-only bug)

    # 7) RECONCILIATION — the multi-asset ledger replay matches stored state exactly.
    recon = core.reconcile_multi(a3)
    assert recon['ok'] is True, recon['checks']

    PA.delete_one({'paperAccountId': aid})
    server.paper_notif_col.delete_many({'paperAccountId': aid})
    server.paper_rotations_col.delete_many({'paperAccountId': aid})
