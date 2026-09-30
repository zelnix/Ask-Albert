"""Full deterministic decision snapshot (Phase C + D1 + D2).

Pipeline (explicitly separated):
  DISCOVERY   -> score the opportunity universe (+ held assets)
  ELIGIBILITY -> mandate / data rules (an ineligible asset can be scored but NEVER bought)
  DECISION    -> BUY / SELL / HOLD / WAIT with D1 precedence
  ENVELOPE    -> immutable audit envelope (ids, hash, flip conditions, versions, ...)

The LLM only ever EXPLAINS this output. It cannot alter an action, amount, score,
reason, invalidation, or flip condition.
"""
import datetime
import uuid

from albert import deps
from albert.engine import regime as regime_mod
from albert.engine import scoring as scoring_mod
from albert.engine import sell as sell_mod
from albert.engine import flip_conditions as flip_mod
from albert.engine import universe as universe_mod
from albert.engine import portfolio_risk as pr_engine
from albert.repositories import portfolio_risk as pr_repo
from albert.engine import hashing
from albert.engine.constants import (
    ALBERT_ENGINE_VERSION, REGIME_BUY_THRESHOLD, REGIME_DEPLOY_CEILING, STABLES,
    PRECEDENCE_ORDER, RISK_BREACH_MULT, REBALANCE_TOL_PCT, NEAR_INVALIDATION_PCT,
    LARGE_LOSS_FLAG_PCT,
)

_REASON_BUY = 'OPPORTUNITY_ENTRY'
_REASON_HOLD = 'THESIS_INTACT'
_REASON_WAIT_BELOW = 'BELOW_ENTRY_LINE'
_REASON_WAIT_GATED = 'GATED_BY_MANDATE'
_REASON_WAIT_STALE = 'STALE_DATA'
_REASON_WAIT_NOROOM = 'NO_HEADROOM'
_REASON_GATED_DRAWDOWN = 'GATED_BY_DRAWDOWN'  # Phase G: BUY suppressed by portfolio protection

_INELIG_WARNING = {
    'EXCLUDED_BY_MANDATE': 'Excluded by your Trading Mandate',
    'NOT_IN_APPROVED_UNIVERSE': 'Not in your approved-coins whitelist',
    'MANDATE_INCOMPLETE': 'Set your mandate to unlock BUY recommendations',
}


def _apply_sell(base, ctx):
    res = sell_mod.evaluate_sell(ctx)
    if not res:
        return False
    plan = res['best']
    base['action'] = 'SELL'
    base['reasonCode'] = plan['reasonCode']
    base['sellReason'] = plan['reasonCode']
    base['sellPlan'] = plan
    base['precedenceRuleApplied'] = plan['reasonCode']
    base['recommendedDeployNowUsd'] = 0.0
    base['totalPlannedDeploymentUsd'] = 0.0
    base['tranches'] = []
    base['reasons'].insert(0, plan['note'])
    if len(res['signals']) > 1:
        others = [s for s in res['signals'] if s != plan['reasonCode']]
        base['reasons'].append('Other conditions also present (lower precedence): ' + ', '.join(others) + '.')
    return True


def build_decisions(pid, summary_override=None, strategy_symbols=None):
    reg = regime_mod.compute_regime()
    regime = reg['regime']
    # M6 blocker #2: when an M5 paper account is the portfolio source, decisions are
    # built from THAT account's embedded cash + positions (single source of truth),
    # never the legacy portfolio_col / paper_portfolio_col.
    summary = summary_override if summary_override is not None else deps.portfolio_summary(pid)
    mandate = deps.get_mandate(pid)
    total = summary['total_value'] or 0.0
    deployable = summary['deployable_usdc'] or 0.0
    approved = set(mandate.get('approved_coins') or [])
    excluded = set(mandate.get('excluded_coins') or [])
    max_alloc = mandate.get('max_alloc_pct') or {}
    trade_risk_pct = mandate.get('max_trade_risk_pct') or 2.0
    held = {h['asset']: h for h in summary['holdings']}
    complete = summary['mandate_complete']
    buy_thresh = REGIME_BUY_THRESHOLD[regime]
    regime_pool = round(deployable * REGIME_DEPLOY_CEILING[regime], 2)

    # ---- audit versions (stable hashes of the material inputs) ----
    mandate_version = hashing.short_hash({k: mandate.get(k) for k in (
        'goal', 'risk_tolerance', 'time_horizon', 'max_drawdown_pct', 'reserve_pct', 'approved_coins',
        'excluded_coins', 'max_alloc_pct', 'max_trade_risk_pct', 'leverage_enabled', 'preferred_strategies')})
    portfolio_version = hashing.short_hash({'usdc': summary.get('usdc'), 'holdings': sorted(
        [[h['asset'], h.get('size'), h.get('avg_entry')] for h in summary['holdings']])})
    regime_snapshot_id = hashing.short_hash({'regime': regime, 'confidence': reg.get('confidence'),
                                             'btc_price': round(reg.get('btc_price') or 0, 2),
                                             'sma200': round(reg.get('sma200') or 0, 2)})
    pass_ts = datetime.datetime.utcnow().isoformat()

    # Evaluate this saved paper strategy's exact legs through the SAME canonical
    # engine. Do not globally scan 57 price feeds or insert/reweight other coins.
    extra = [str(s).upper() for s in (strategy_symbols or []) if str(s).upper() not in STABLES]
    if extra:
        # Strategy-specific account: score ONLY the strategy's coins + any held
        # positions. Avoids 50+ price-feed fetches that cause worker timeouts.
        universe = list(dict.fromkeys([*held.keys(), *extra]))
    else:
        # Legacy / read-only account: full discovery universe.
        universe = list(dict.fromkeys([*universe_mod.discovery_universe(held.keys()), *extra]))
    universe = [s for s in universe if s not in STABLES]
    decisions = []
    for sym in universe:
        sc = scoring_mod.score_asset(sym, regime)
        held_h = held.get(sym)
        cur_val = (held_h or {}).get('value', 0.0)
        cur_pct = (held_h or {}).get('portfolio_pct', 0.0)
        cap_pct = max_alloc.get(sym, 100.0)
        target_pct = cap_pct
        base = {'symbol': sym, 'regime': regime, 'currentPrice': (sc or {}).get('currentPrice'),
                'currentAllocationPct': cur_pct, 'targetAllocationPct': target_pct,
                'recommendedDeployNowUsd': 0.0, 'totalPlannedDeploymentUsd': 0.0,
                'tranches': [], 'warnings': [], 'reasons': [], 'engineVersion': ALBERT_ENGINE_VERSION,
                'reasonCode': None, 'sellReason': None, 'sellPlan': None, 'precedenceRuleApplied': None,
                'evaluatedAt': pass_ts, '_dataOk': bool(sc.get('ok'))}

        if not sc.get('ok'):
            failure_code = sc.get('failureCode', 'STALE_DATA')
            failure_detail = sc.get('failureDetail', 'Market data is stale or insufficient')
            base.update({'action': 'WAIT', 'opportunityScore': 0, 'confidence': 20,
                         'scoreComponents': {}, 'invalidationPrice': None,
                         'eligible': False, 'ineligibilityReason': failure_code,
                         'reasonCode': _REASON_WAIT_STALE,
                         'scoringFailure': {'code': failure_code, 'detail': failure_detail,
                                            'category': sc.get('failureCategory', 'data'),
                                            'provider': sc.get('failureProvider')},
                         'reasons': [f'{failure_detail} \u2014 Albert waits rather than guesses.']})
            base['precedenceRuleApplied'] = 'WAIT'
            if held_h is not None:
                _apply_sell(base, {
                    'symbol': sym, 'positionValue': cur_val, 'positionSize': held_h.get('size'),
                    'unrealizedPct': held_h.get('unrealized_pct'), 'currentPrice': (sc or {}).get('currentPrice'),
                    'invalidationPrice': None, 'currentAllocationPct': cur_pct, 'capPct': cap_pct,
                    'totalValue': total, 'excluded': excluded, 'tradeRiskPct': trade_risk_pct, 'dataOk': False})
            decisions.append(base)
            continue

        headroom_pct = max(0.0, cap_pct - cur_pct)
        comps = dict(sc['components'])
        comps['portfolioFit'] = round(min(10.0, headroom_pct / max(1.0, cap_pct) * 10.0), 1)
        score = round(sum(comps.values()), 1)
        base.update({'opportunityScore': score, 'confidence': sc['confidence'], 'scoreComponents': comps,
                     'invalidationPrice': sc['invalidation'], 'reasons': list(sc['reasons'])})

        # ELIGIBILITY (mirrors the Phase C/D1 hard gates, now with canonical codes)
        eligible, inelig = universe_mod.eligibility(
            sym, data_ok=True, excluded=excluded, approved=approved, mandate_complete=complete)
        base['eligible'] = eligible
        base['ineligibilityReason'] = inelig
        if inelig and inelig in _INELIG_WARNING:
            base['warnings'].append(_INELIG_WARNING[inelig])

        base['_score'] = score
        base['_cur_val'] = cur_val
        base['_cap_val'] = total * cap_pct / 100.0
        base['_owned'] = held_h is not None
        # DECISION default (BUY amount decided in the allocation pass; ineligible NEVER buys)
        if score >= buy_thresh and eligible:
            base['action'] = 'BUY'
            base['reasonCode'] = _REASON_BUY
        elif held_h is not None:
            base['action'] = 'HOLD'
            base['reasonCode'] = _REASON_HOLD
            base['reasons'].insert(0, 'You own this and its thesis still holds \u2014 keep it, no add right now.')
        else:
            base['action'] = 'WAIT'
            if not eligible:
                base['reasonCode'] = _REASON_WAIT_GATED
            else:
                base['reasonCode'] = _REASON_WAIT_BELOW
                if score < buy_thresh:
                    base['reasons'].insert(0, 'Score %.0f is below the %s BUY line (%s).' % (score, regime, buy_thresh))
        base['precedenceRuleApplied'] = base['action']

        if held_h is not None:
            _apply_sell(base, {
                'symbol': sym, 'positionValue': cur_val, 'positionSize': held_h.get('size'),
                'unrealizedPct': held_h.get('unrealized_pct'), 'currentPrice': sc.get('currentPrice'),
                'invalidationPrice': sc.get('invalidation'), 'currentAllocationPct': cur_pct,
                'capPct': cap_pct, 'totalValue': total, 'excluded': excluded,
                'tradeRiskPct': trade_risk_pct, 'dataOk': True})
        decisions.append(base)

    # ---- Phase G: portfolio-level drawdown protection (stateful, hysteresis) ----
    # Evaluate/persist the HWM + protection state on every engine pass. When protection
    # is active we (1) inject a portfolio-wide risk-reduction SELL into held assets, which
    # ranks just under EMERGENCY_EXIT, and (2) suppress ALL new BUYs (no averaging down).
    portfolio_risk = pr_repo.evaluate(pid, total, mandate.get('max_drawdown_pct'))
    reductions = None
    if portfolio_risk.get('protectionMode'):
        scored = {d['symbol']: {'currentPrice': d.get('currentPrice'),
                                'invalidation': d.get('invalidationPrice')} for d in decisions}
        reductions = pr_engine.compute_reductions(
            holdings=summary['holdings'], scored=scored,
            max_drawdown_pct=portfolio_risk['maxDrawdownPct'],
            drawdown_pct=portfolio_risk['drawdownPct'])
        per_asset = reductions['perAsset']
        # Re-resolve SELLs for held assets WITH the portfolio-drawdown cut injected so
        # precedence picks the winner (EMERGENCY_EXIT still outranks PORTFOLIO_DRAWDOWN_RISK).
        for d in decisions:
            sym = d['symbol']
            held_h = held.get(sym)
            if held_h is None:
                continue
            _apply_sell(d, {
                'symbol': sym, 'positionValue': held_h.get('value', 0.0),
                'positionSize': held_h.get('size'), 'unrealizedPct': held_h.get('unrealized_pct'),
                'currentPrice': d.get('currentPrice'), 'invalidationPrice': d.get('invalidationPrice'),
                'currentAllocationPct': d.get('currentAllocationPct'), 'capPct': max_alloc.get(sym, 100.0),
                'totalValue': total, 'excluded': excluded, 'tradeRiskPct': trade_risk_pct,
                'dataOk': bool(d.get('_dataOk')),
                'portfolioDrawdownFraction': per_asset.get(sym, {}).get('fraction')})
        # Suppress ALL new BUYs while protection is active.
        for d in decisions:
            if d.get('action') == 'BUY':
                owned = held.get(d['symbol']) is not None
                d['action'] = 'HOLD' if owned else 'WAIT'
                d['reasonCode'] = _REASON_GATED_DRAWDOWN
                d['precedenceRuleApplied'] = d['action']
                d['recommendedDeployNowUsd'] = 0.0
                d['totalPlannedDeploymentUsd'] = 0.0
                d['tranches'] = []
                d['reasons'].insert(0, 'Portfolio drawdown protection is active \u2014 new BUYs are suspended until drawdown recovers.')

    # ---- BUY allocation pass (unchanged from D1; empty while protection active) ----
    buys = [d for d in decisions if d.get('action') == 'BUY']
    remaining = regime_pool
    if buys and remaining > 0:
        weights = []
        for d in buys:
            excess = max(0.0, d['_score'] - buy_thresh)
            weights.append((excess ** 2) * (d['confidence'] / 100.0))
        wsum = sum(weights) or 1.0
        for d, w in zip(buys, weights):
            opp_alloc = remaining * (w / wsum)
            alloc_headroom = max(0.0, d['_cap_val'] - d['_cur_val'])
            price = d['currentPrice'] or 0.0
            inv = d.get('invalidationPrice') or 0.0
            stop_dist = abs(price - inv) / price if price else 0.15
            risk_sized = (total * trade_risk_pct / 100.0) / stop_dist if stop_dist > 0 else opp_alloc
            planned = round(max(0.0, min(opp_alloc, alloc_headroom, risk_sized, remaining)), 2)
            if planned < 50:
                d['action'] = 'HOLD' if d['_owned'] else 'WAIT'
                d['reasonCode'] = _REASON_HOLD if d['_owned'] else _REASON_WAIT_NOROOM
                d['precedenceRuleApplied'] = d['action']
                d['reasons'].insert(0, 'Qualifies, but allocation/risk ceilings leave no meaningful room to add now.')
                continue
            deploy_now = round(planned * 0.40, 2)
            d['totalPlannedDeploymentUsd'] = planned
            d['recommendedDeployNowUsd'] = deploy_now
            d['tranches'] = [
                {'number': 1, 'pct': 40, 'amountUsd': deploy_now, 'trigger': 'ENTRY_CONDITIONS_VALID'},
                {'number': 2, 'pct': 35, 'amountUsd': round(planned * 0.35, 2), 'trigger': 'CONTROLLED_PULLBACK'},
                {'number': 3, 'pct': 25, 'amountUsd': round(planned - deploy_now - round(planned * 0.35, 2), 2), 'trigger': 'TREND_RECONFIRMATION'},
            ]
            if alloc_headroom < opp_alloc:
                d['reasons'].insert(0, 'Your %.0f%% cap limits this to $%s.' % (d['targetAllocationPct'], format(planned, ',.0f')))
            remaining = round(remaining - deploy_now, 2)

    # ---- D2 FINALIZATION: immutable audit envelope for every decision ----
    for d in decisions:
        for k in ('_eligible', '_score', '_cur_val', '_cap_val', '_owned', '_dataOk'):
            d.pop(k, None)
        sym = d['symbol']
        held_h = held.get(sym)
        pos_val = (held_h or {}).get('value', 0.0)
        pos_size = (held_h or {}).get('size')
        upnl = (held_h or {}).get('unrealized_pct')
        cur_pct = d.get('currentAllocationPct') or 0.0
        cap = d.get('targetAllocationPct')
        price = d.get('currentPrice')
        inv = d.get('invalidationPrice')
        action = d['action']

        # mandate checks + risk flags
        stop_dist = (abs(price - inv) / price) if (price and inv) else None
        risk_at_stop = (pos_val * stop_dist) if (stop_dist and pos_val) else 0.0
        budget = total * (trade_risk_pct / 100.0)
        within_risk = (risk_at_stop <= budget * RISK_BREACH_MULT) if budget > 0 else True
        within_cap = cur_pct <= ((cap if cap is not None else 100.0) + 1e-9)
        mandate_checks = {
            'excluded': sym in excluded,
            'inApprovedUniverse': (not approved) or (sym in approved),
            'withinCap': bool(within_cap),
            'withinRiskBudget': bool(within_risk),
            'mandateComplete': bool(complete),
        }
        flags = []
        if cap is not None and cur_pct > cap + REBALANCE_TOL_PCT:
            flags.append('OVER_ALLOCATION')
        if not within_risk:
            flags.append('RISK_BUDGET_BREACH')
        if price and inv and price > inv and (price - inv) / price * 100 <= NEAR_INVALIDATION_PCT:
            flags.append('NEAR_INVALIDATION')
        if upnl is not None and upnl <= -LARGE_LOSS_FLAG_PCT:
            flags.append('LARGE_UNREALIZED_LOSS')
        if d.get('reasonCode') == _REASON_WAIT_STALE:
            flags.append('STALE_DATA')

        # position before/after + recommended delta
        before = {'valueUsd': round(pos_val, 2), 'pct': round(cur_pct, 2),
                  'size': round(pos_size, 8) if pos_size else None}
        if action == 'SELL' and d.get('sellPlan'):
            after = d['sellPlan']['positionAfter']
            delta = d['sellPlan']['recommendedDeltaUsd']
        elif action == 'BUY':
            delta = d['recommendedDeployNowUsd']
            after_val = pos_val + delta
            after = {'valueUsd': round(after_val, 2),
                     'pct': round(after_val / total * 100, 2) if total else 0.0,
                     'size': (round((pos_size or 0.0) + (delta / price), 8) if price else None)}
        else:
            delta = 0.0
            after = dict(before)

        flips = flip_mod.build_flip_conditions(
            action=action, reason_code=d.get('reasonCode'), regime=regime,
            score=d.get('opportunityScore') or 0, confidence=d.get('confidence') or 0,
            owned=held_h is not None, current_price=price, invalidation=inv,
            unrealized_pct=upnl, cap_pct=cap, current_allocation_pct=cur_pct,
            eligible=d.get('eligible'), ineligibility_reason=d.get('ineligibilityReason'))

        ci = hashing.canonical_inputs(
            engine_version=ALBERT_ENGINE_VERSION, symbol=sym, regime=regime, buy_threshold=buy_thresh,
            score=d.get('opportunityScore'), confidence=d.get('confidence'), eligible=d.get('eligible'),
            ineligibility_reason=d.get('ineligibilityReason'), mandate_checks=mandate_checks,
            current_allocation_pct=cur_pct, cap_pct=cap, unrealized_pct=upnl, current_price=price,
            invalidation=inv, position_value=pos_val, deployable_usdc=deployable, total_value=total,
            regime_deploy_ceiling=regime_pool)

        d['call'] = action
        d['score'] = d.get('opportunityScore')
        d['invalidation'] = inv
        d['positionBefore'] = before
        d['positionAfter'] = after
        d['recommendedDeltaUsd'] = round(delta, 2)
        d['flipConditions'] = flips
        d['riskFlags'] = flags
        d['mandateChecks'] = mandate_checks
        d['deploymentPlan'] = ({'deployNowUsd': d['recommendedDeployNowUsd'],
                                'totalPlannedUsd': d['totalPlannedDeploymentUsd'],
                                'tranches': d['tranches']} if action == 'BUY' else None)
        d['mandateVersion'] = mandate_version
        d['portfolioVersion'] = portfolio_version
        d['regimeSnapshotId'] = regime_snapshot_id
        d['decisionInputs'] = ci
        d['decisionInputsHash'] = hashing.hash_inputs(ci)
        d['decisionId'] = str(uuid.uuid4())   # provisional; repository may stabilise
        d['snapshotId'] = None                # set by repository / endpoint
        d['marketDataTimestamp'] = pass_ts

    decisions.sort(key=lambda d: d.get('opportunityScore', 0), reverse=True)
    qualifying = sum(1 for d in decisions if d['action'] == 'BUY')
    total_deploy_now = round(sum(d['recommendedDeployNowUsd'] for d in decisions), 2)

    sell_decisions = [d for d in decisions if d['action'] == 'SELL']
    urgent_sells = [d for d in sell_decisions if d['reasonCode'] in ('EMERGENCY_EXIT', 'THESIS_INVALIDATION')]

    if portfolio_risk.get('protectionMode'):
        albert_call = ('PORTFOLIO PROTECTION ACTIVE \u2014 drawdown %.1f%% vs your %.1f%% limit. New BUYs suspended; reducing portfolio risk.'
                       % (portfolio_risk.get('drawdownPct') or 0.0, portfolio_risk.get('maxDrawdownPct') or 0.0))
        if sell_decisions:
            albert_call += ' ' + ', '.join('%s %s' % (d['symbol'], d['sellPlan']['action']) for d in sell_decisions) + '.'
    elif urgent_sells:
        parts = ['%s %s (%s)' % (d['symbol'], d['sellPlan']['action'], d['reasonCode']) for d in urgent_sells]
        albert_call = 'REDUCE RISK NOW \u2014 ' + '; '.join(parts) + '.'
    elif total_deploy_now > 0:
        albert_call = ('DEPLOY $%s \u2014 %s opportunit%s qualify; retaining $%s of deployable USDC as dry powder.'
                       % (format(total_deploy_now, ',.0f'), qualifying, ('y' if qualifying == 1 else 'ies'),
                          format(deployable - total_deploy_now, ',.0f')))
        if sell_decisions:
            albert_call += ' Also managing %d position%s: %s.' % (
                len(sell_decisions), '' if len(sell_decisions) == 1 else 's',
                ', '.join('%s %s' % (d['symbol'], d['sellPlan']['action']) for d in sell_decisions))
    elif sell_decisions:
        parts = ['%s %s' % (d['symbol'], d['sellPlan']['action']) for d in sell_decisions]
        albert_call = 'MANAGE POSITIONS \u2014 ' + '; '.join(parts) + '.'
    else:
        albert_call = 'WAIT \u2014 no high-quality entry justifies deploying capital in a %s market right now.' % regime

    # ---- Phase G: portfolio-risk audit block (top-level, snapshot-auditable) ----
    portfolio_risk_out = dict(portfolio_risk)
    portfolio_risk_out['triggeredAt'] = portfolio_risk.get('protectionActivatedAt')
    if reductions is not None:
        portfolio_risk_out.update({
            'severity': reductions['severity'],
            'targetRiskReductionFraction': reductions['targetRiskReductionFraction'],
            'totalRiskExposureUsd': reductions['totalRiskExposureUsd'],
            'riskReductionRequiredUsd': reductions['riskReductionRequiredUsd'],
            'reductions': reductions['perAsset'],
        })
    else:
        portfolio_risk_out.update({
            'severity': 0.0, 'targetRiskReductionFraction': 0.0,
            'totalRiskExposureUsd': None, 'riskReductionRequiredUsd': 0.0, 'reductions': {},
        })

    return {'snapshotId': str(uuid.uuid4()), 'passId': str(uuid.uuid4()), 'marketDataTimestamp': pass_ts,
            'engineVersion': ALBERT_ENGINE_VERSION, 'regime': reg, 'regimeSnapshotId': regime_snapshot_id,
            'mandateVersion': mandate_version, 'portfolioVersion': portfolio_version, 'summary': summary,
            'mandate_complete': complete, 'buyThreshold': buy_thresh, 'regimeDeployCeiling': regime_pool,
            'deployableUsdc': deployable, 'totalDeployNowUsd': total_deploy_now, 'albertCall': albert_call,
            'qualifying': qualifying, 'sellCount': len(sell_decisions), 'precedenceOrder': dict(PRECEDENCE_ORDER),
            'portfolioRisk': portfolio_risk_out, 'decisions': decisions}
