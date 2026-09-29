"""M5 — Expert Multi-Asset Trader: portfolio valuation, deterministic opportunity
ranking, capital allocation across the strongest opportunities, and deterministic
rotation from weakening holdings into stronger approved opportunities.

DESIGN
------
* EXACT. Every number is Decimal. No floats anywhere in this module.
* PURE. No DB and no network. The worker fetches marks + canonical decisions and
  passes them in; this module only decides. That makes it fully unit-testable and
  guarantees identical inputs -> identical outputs (determinism proof).
* CANONICAL ONLY. `allocate` acts on canonical actionable decisions passed by the
  caller. A discovery score alone is never enough — the caller must only pass
  eligible, actionable canonical decisions.
* SIZING REDUCES, NEVER ENLARGES the canonical recommended amount, and always
  respects every portfolio-level limit in the profile + regime band.
"""
from decimal import Decimal, ROUND_DOWN, ROUND_HALF_UP

from albert.paper import core
from albert.paper import profiles as P

MIN_NOTIONAL = core.MIN_NOTIONAL
DEFAULT_STOP_DIST = Decimal('0.20')   # fallback risk distance when no invalidation


def _d(x):
    return core.D(x)


# ============================ portfolio valuation ============================ #
def compute_portfolio_equity(acct, marks):
    """Honest multi-asset valuation.

    marks: {SYMBOL: (price: Decimal|None, fresh: bool)}.

    Returns a dict. `available` is True only when EVERY held position has a fresh
    mark (so new-entry sizing fails CLOSED on any missing valuation). Per-position
    marks are always returned so the worker can still run protective exits on the
    assets that DO have fresh marks. A missing valuation never moves the HWM.
    """
    cash = _d(acct.get('cash')) or Decimal('0')
    stored_hwm = _d(acct.get('highWaterEquity'))
    realized = _d(acct.get('realizedPnl')) or Decimal('0')
    fees = _d(acct.get('feesPaid')) or Decimal('0')
    reserve_pct = _d(acct.get('reservePct')) or Decimal('0')

    positions = []
    pos_val_total = Decimal('0')
    alt_val_total = Decimal('0')
    open_risk = Decimal('0')
    all_marks_fresh = True
    for lot in (acct.get('lots') or []):
        qty = _d(lot.get('qty')) or Decimal('0')
        if qty <= 0:
            continue
        sym = (lot.get('asset') or '').upper()
        avg = _d(lot.get('avgEntry')) or Decimal('0')
        inv = _d(lot.get('invalidationPrice'))
        px, fresh = marks.get(sym, (None, False))
        px = _d(px)
        if px is None or not fresh:
            all_marks_fresh = False
            positions.append({'symbol': sym, 'qty': qty, 'avgEntry': avg, 'markPx': px,
                              'markFresh': False, 'value': None, 'unrealized': None,
                              'stopDist': None, 'riskUsd': None, 'invalidation': inv})
            continue
        val = qty * px
        unreal = qty * (px - avg)
        if inv is not None and inv > 0 and inv < px:
            stop_dist = (px - inv) / px
        else:
            stop_dist = DEFAULT_STOP_DIST
        risk_usd = val * stop_dist
        pos_val_total += val
        if sym != 'BTC':
            alt_val_total += val
        open_risk += risk_usd
        positions.append({'symbol': sym, 'qty': qty, 'avgEntry': avg, 'markPx': px,
                          'markFresh': True, 'value': val, 'unrealized': unreal,
                          'stopDist': stop_dist, 'riskUsd': risk_usd, 'invalidation': inv,
                          'ticketId': lot.get('lotId')})

    equity = cash + pos_val_total if all_marks_fresh else None
    hwm = stored_hwm
    dd = None
    protected = None
    deployable = None
    if equity is not None:
        if hwm is None:
            hwm = equity
        if equity > hwm:
            hwm = equity
        dd = ((equity / hwm) - Decimal('1')) * Decimal('100') if hwm and hwm > 0 else Decimal('0')
        if dd > 0:
            dd = Decimal('0')
        dd = dd.quantize(Decimal('0.01'), ROUND_HALF_UP)
        protected = (equity * reserve_pct / Decimal('100'))
        deployable = cash - protected
        if deployable < 0:
            deployable = Decimal('0')
    return {
        'available': all_marks_fresh, 'cash': cash, 'equity': equity,
        'equityStr': core.dstr(equity) if equity is not None else None,
        'positions': positions, 'positionValueTotal': pos_val_total,
        'altcoinValueTotal': alt_val_total, 'openRiskUsd': open_risk,
        'openPositionsCount': len([p for p in positions if p['qty'] > 0]),  # ticket count, not symbol count
        'drawdownPct': dd, 'highWater': hwm, 'protectedReserve': protected,
        'deployableCash': deployable, 'realizedPnl': realized, 'fees': fees,
    }


# =========================== deterministic ranking =========================== #
def rank_opportunities(candidates):
    """Deterministically rank scored opportunities. Identical inputs ALWAYS yield
    an identical order. Tie-breaks: score desc, confidence desc, symbol asc."""
    def key(c):
        return (-(_d(c.get('score')) or Decimal('0')),
                -(_d(c.get('confidence')) or Decimal('0')),
                (c.get('symbol') or ''))
    return sorted(candidates, key=key)


def _risk_pct_for(score, profile):
    """Per-trade risk %: high-conviction at/above the profile score, else normal;
    never above the single-trade ceiling."""
    score = _d(score) or Decimal('0')
    base = profile['highConvictionRiskPct'] if score >= profile['highConvictionScore'] else profile['normalRiskPct']
    return min(base, profile['maxSingleTradeRiskPct'])


def _stop_dist(mark_px, invalidation):
    mark_px = _d(mark_px)
    inv = _d(invalidation)
    if mark_px and inv and inv > 0 and inv < mark_px:
        return (mark_px - inv) / mark_px
    return DEFAULT_STOP_DIST


# ============================ capital allocation ============================= #
def allocate(*, acct, equity_info, candidates, regime, marks,
             profile=P.AGGRESSIVE_EXPERIENCED_V1, holding_scores=None):
    """Produce deterministic per-asset trade intents from ranked canonical
    opportunities, respecting every profile + regime limit.

    candidates: list of dicts, each an eligible+actionable canonical opportunity:
        {symbol, action('BUY'|'SELL'), score, confidence, rank,
         recommendedDeployNowUsd, invalidationPrice, sellPlan, held(bool)}
    Returns {'intents': [...], 'diagnostics': {...}}. Intent actions:
        BUY (open), ADD (increase held), TRIM (partial reduce), EXIT (full close).
    """
    equity = equity_info.get('equity')
    intents = []
    diag = {'ranked': [], 'skipped': [], 'regimeBand': None, 'blocked': None}

    # SELLs first (risk management outranks new risk) — always allowed.
    held_map = {p['symbol']: p for p in equity_info.get('positions', [])}
    for c in candidates:
        if c.get('action') != 'SELL':
            continue
        sym = (c.get('symbol') or '').upper()
        pos = held_map.get(sym)
        if not pos or pos['qty'] <= 0:
            continue
        sp = c.get('sellPlan') or {}
        delta = _d(sp.get('recommendedDeltaUsd'))
        px, fresh = marks.get(sym, (None, False))
        px = _d(px)
        if px is None or not fresh:
            continue
        if delta is not None and abs(delta) < (pos['qty'] * px):
            frac = min(Decimal('1'), (abs(delta) / (pos['qty'] * px)) if px else Decimal('1'))
            action = 'TRIM'
        else:
            frac = Decimal('1'); action = 'EXIT'
        intents.append({'symbol': sym, 'action': action, 'fraction': frac,
                        'reason': sp.get('reasonCode') or 'CANONICAL_SELL',
                        'canonical': c})

    if equity is None or not equity_info.get('available'):
        diag['blocked'] = 'EQUITY_UNAVAILABLE'
        return {'intents': intents, 'diagnostics': diag}

    band = P.regime_band(regime, profile)
    diag['regimeBand'] = band

    # Drawdown responses.
    dd = equity_info.get('drawdownPct') or Decimal('0')
    if dd <= (-profile['hardDrawdownPct']):
        diag['blocked'] = 'HARD_DRAWDOWN_PAUSE'
        return {'intents': intents, 'diagnostics': diag}
    soft = dd <= (-profile['softDrawdownPct'])
    risk_haircut = Decimal('0.5') if soft else Decimal('1')

    # Running portfolio budgets (all Decimal).
    max_deploy_val = equity * band['maxDeployPct'] / Decimal('100')
    alt_ceiling_val = equity * band['altCeilingPct'] / Decimal('100')
    combined_risk_budget = equity * profile['maxCombinedOpenRiskPct'] / Decimal('100')
    deployable = equity_info.get('deployableCash') or Decimal('0')
    # ensure protected USDC floor from the profile as well as the mandate reserve
    profile_protected = equity * profile['protectedUsdcPct'] / Decimal('100')
    cash = equity_info.get('cash') or Decimal('0')
    deployable = min(deployable, max(Decimal('0'), cash - profile_protected))

    cur_deployed = equity_info.get('positionValueTotal') or Decimal('0')
    cur_alt = equity_info.get('altcoinValueTotal') or Decimal('0')
    cur_open_risk = equity_info.get('openRiskUsd') or Decimal('0')
    open_count = equity_info.get('openPositionsCount') or 0

    ranked = rank_opportunities([c for c in candidates if c.get('action') == 'BUY'])
    unfunded_strong = []   # strong BUYs blocked purely by slot/exposure limits (rotation inputs)

    for c in ranked:
        sym = (c.get('symbol') or '').upper()
        px, fresh = marks.get(sym, (None, False))
        px = _d(px)
        rec = _d(c.get('recommendedDeployNowUsd')) or Decimal('0')
        entry = {'symbol': sym, 'score': str(_d(c.get('score')) or 0)}
        if px is None or not fresh or rec <= 0:
            entry['skip'] = 'NO_MARK_OR_AMOUNT'; diag['skipped'].append(entry); continue

        pos = held_map.get(sym)
        cur_pos_val = (pos['value'] if (pos and pos.get('value') is not None) else Decimal('0'))
        is_new = (not pos) or pos['qty'] <= 0

        # concurrent-position ceiling (only blocks NEW positions)
        if is_new and open_count >= profile['maxConcurrentPositions']:
            entry['skip'] = 'MAX_CONCURRENT_POSITIONS'
            unfunded_strong.append(c); diag['skipped'].append(entry); continue

        tier = c.get('tier') or P.cap_tier(sym, c.get('rank'))
        cap_pct = P.per_asset_cap_pct(sym, c.get('rank'), profile, tier=tier)
        per_asset_cap_val = equity * cap_pct / Decimal('100')
        room_cap = per_asset_cap_val - cur_pos_val
        room_deploy = max_deploy_val - cur_deployed
        room_alt = (alt_ceiling_val - cur_alt) if sym != 'BTC' else max_deploy_val

        stop_dist = _stop_dist(px, c.get('invalidationPrice'))
        risk_pct = _risk_pct_for(c.get('score'), profile) * risk_haircut
        risk_budget = equity * risk_pct / Decimal('100')
        max_by_trade_risk = (risk_budget / stop_dist) if stop_dist > 0 else rec
        remaining_combined_risk = combined_risk_budget - cur_open_risk
        max_by_combined_risk = (remaining_combined_risk / stop_dist) if stop_dist > 0 else Decimal('0')

        prof = P.asset_profile(sym, c.get('rank'), tier=tier)
        liq_scale = prof['liquidityScale']

        # find the BINDING limit (M5.1: surfaced on the intent for the rotation record)
        cap_labels = [('PER_ASSET_CAP', room_cap), ('REGIME_DEPLOY_CEILING', room_deploy),
                      ('ALTCOIN_EXPOSURE_CAP', room_alt), ('PER_TRADE_RISK', max_by_trade_risk),
                      ('COMBINED_OPEN_RISK', max_by_combined_risk), ('FREE_USDC', deployable),
                      ('CANONICAL_AMOUNT', rec)]
        bound_by, notional = 'CANONICAL_AMOUNT', rec
        for label, cap in cap_labels:
            if cap is not None and cap < notional:
                notional = cap; bound_by = label
        notional = notional * liq_scale
        notional = core.q_cash(notional)

        blocked_by_limit = (room_cap <= 0 or room_deploy <= 0 or room_alt <= 0)
        if notional is None or notional < MIN_NOTIONAL:
            entry['skip'] = 'BELOW_MIN_OR_NO_ROOM'
            entry['notional'] = str(notional)
            if blocked_by_limit and is_new:
                unfunded_strong.append(c)
            diag['skipped'].append(entry); continue

        action = 'ADD' if not is_new else 'BUY'
        added_risk = notional * stop_dist
        intents.append({'symbol': sym, 'action': action, 'notional': notional,
                        'markPx': px, 'stopDist': stop_dist, 'riskPct': risk_pct,
                        'tier': tier, 'boundBy': bound_by, 'profile': prof, 'canonical': c,
                        'invalidationPrice': _d(c.get('invalidationPrice'))})
        # decrement running budgets
        cur_deployed += notional
        cur_open_risk += added_risk
        if sym != 'BTC':
            cur_alt += notional
        deployable -= notional
        if is_new:
            open_count += 1
        entry['funded'] = str(notional); entry['tier'] = tier
        diag['ranked'].append(entry)

    # ---- deterministic rotation: free a slot/exposure for a stronger opportunity ----
    rot = plan_rotation(equity_info=equity_info, unfunded_strong=unfunded_strong,
                        candidates=candidates, marks=marks, profile=profile,
                        existing_intents=intents, holding_scores=holding_scores)
    if rot:
        intents.append(rot)
        diag['rotation'] = {'exit': rot['symbol'], 'for': rot.get('rotateFor'),
                            'reducedScore': str(rot.get('reducedScore')),
                            'targetScore': str(rot.get('targetScore'))}
    return {'intents': intents, 'diagnostics': diag}


def plan_rotation(*, equity_info, unfunded_strong, candidates, marks, profile,
                  existing_intents, holding_scores=None):
    """If a strong approved BUY was blocked ONLY by slot/exposure limits, and a
    weaker HELD asset lags it by at least the rotation margin, emit a single EXIT
    of the weakest laggard to free capital/slot for the next tick. Deterministic
    and self-funding: it only sells; the freed cash is used on a subsequent tick,
    so it can never exceed available cash or the open-risk budget."""
    if not unfunded_strong:
        return None
    best = rank_opportunities(unfunded_strong)[0]
    best_score = _d(best.get('score')) or Decimal('0')

    # scores of held assets: prefer the full holding_scores map (covers HOLD decisions),
    # fall back to the actionable candidates.
    score_by_sym = {(c.get('symbol') or '').upper(): (_d(c.get('score')) or Decimal('0'))
                    for c in candidates}
    if holding_scores:
        for k, v in holding_scores.items():
            score_by_sym[(k or '').upper()] = _d(v) or Decimal('0')
    already = {i['symbol'] for i in existing_intents if i.get('action') in ('EXIT', 'TRIM', 'SELL')}
    laggards = []
    for p in equity_info.get('positions', []):
        sym = p['symbol']
        if p['qty'] <= 0 or sym in already or not p.get('markFresh'):
            continue
        if sym == (best.get('symbol') or '').upper():
            continue
        hs = score_by_sym.get(sym, Decimal('0'))
        laggards.append((hs, sym, p))
    if not laggards:
        return None
    laggards.sort(key=lambda t: (t[0], t[1]))   # weakest score, then symbol
    hs, sym, pos = laggards[0]
    if (best_score - hs) < profile['rotationMargin']:
        return None
    return {'symbol': sym, 'action': 'EXIT', 'fraction': Decimal('1'),
            'reason': 'ROTATION', 'rotateFor': (best.get('symbol') or '').upper(),
            'reducedScore': hs, 'targetScore': best_score}
