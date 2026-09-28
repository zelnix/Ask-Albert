'use client';

import React from 'react';
import { API_BASE, getPid } from '../lib/api';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Wallet, Target, Plus, Trash2, Loader2, Check, ChevronDown, Info, History, MessageCircle, ArrowRight, X, Layers, AlertTriangle, Activity } from 'lucide-react';

const fmtTs = (t) => { try { return t ? new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; } catch { return t || '—'; } };
const sellActionLabel = (a) => a === 'EXIT_100' ? 'Exit 100%' : (a && a.startsWith('TRIM_')) ? ('Trim ' + a.split('_')[1] + '%') : (a || '');
const fracLabel = (f) => (f == null) ? '' : (f >= 1 ? 'Exit 100%' : ('Trim ' + Math.round(f * 100) + '%'));

const fmt = (n) => (n == null || isNaN(n)) ? '—' : '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
// Exact (2dp) formatter — SELL amounts must be shown to the cent, never recomputed on the client.
const fmtX = (n) => (n == null || isNaN(n)) ? '—' : '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (n) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 8 });

const REASON_LABEL = {
  EMERGENCY_EXIT: 'Emergency exit', PORTFOLIO_DRAWDOWN_RISK: 'Portfolio drawdown risk', THESIS_INVALIDATION: 'Thesis invalidated', RISK_REDUCTION: 'Risk reduction',
  REBALANCE: 'Rebalance', PROFIT_TAKE: 'Profit-take', OPPORTUNITY_ENTRY: 'Opportunity entry',
  THESIS_INTACT: 'Thesis intact', BELOW_ENTRY_LINE: 'Below entry line', GATED_BY_MANDATE: 'Gated by mandate',
  GATED_BY_DRAWDOWN: 'Gated by drawdown protection',
  STALE_DATA: 'Stale data', NO_HEADROOM: 'No room to add',
};
const INELIG_LABEL = {
  EXCLUDED_BY_MANDATE: 'Excluded by mandate', NOT_IN_APPROVED_UNIVERSE: 'Not in approved universe',
  MANDATE_INCOMPLETE: 'Mandate incomplete', STALE_DATA: 'Stale market data',
};

function ActionPill({ a, big }) {
  const map = { BUY: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', HOLD: 'bg-sky-500/15 text-sky-300 border-sky-500/40', SELL: 'bg-rose-500/15 text-rose-300 border-rose-500/40', WAIT: 'bg-slate-700/40 text-slate-300 border-slate-600' };
  const size = big ? 'px-2.5 py-1 text-[12px] font-extrabold tracking-wide' : 'px-2 py-0.5 text-[10px] font-bold';
  return <span className={`rounded-full border ${size} ${map[a] || map.WAIT}`}>{a}</span>;
}

// SELL trim vs full-exit must be unmistakable — plain language first.
function SellActionPill({ p }) {
  if (!p) return null;
  const exit = p.action === 'EXIT_100';
  const label = exit ? 'Exit 100%' : 'Trim ' + p.action.replace('TRIM_', '') + '%';
  return <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${exit ? 'bg-rose-600/25 text-rose-200 border-rose-500/60' : 'bg-amber-500/15 text-amber-300 border-amber-500/40'}`}>{label}</span>;
}

function EligibilityChip({ d }) {
  if (d.eligible) return null;
  return (
    <span title={INELIG_LABEL[d.ineligibilityReason] || d.ineligibilityReason} className="inline-flex items-center gap-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300">
      <AlertTriangle className="h-2.5 w-2.5" />INELIGIBLE
    </span>
  );
}

// Recommendation cell: exact backend numbers only — never recomputed here.
function CallCell({ d }) {
  if (d.action === 'BUY') return <span className="text-emerald-400">{fmt(d.recommendedDeployNowUsd)} now <span className="text-slate-600">/ {fmt(d.totalPlannedDeploymentUsd)} planned</span></span>;
  if (d.action === 'SELL' && d.sellPlan) return <span className="text-rose-300">{fmtX(d.sellPlan.sellUsd)} <span className="text-slate-500">({qty(d.sellPlan.sellQty)} {d.symbol})</span></span>;
  if (d.action === 'HOLD') return <span className="text-sky-300">Hold — no change</span>;
  return <span className="text-slate-500">Wait</span>;
}

function FlipConditions({ items }) {
  if (!items || !items.length) return <p className="text-[11px] text-slate-500">No flip conditions.</p>;
  return (
    <ul className="space-y-1">
      {items.map((f, i) => {
        const sell = String(f.toCall).startsWith('SELL');
        return (
          <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-300">
            <span className={`mt-0.5 shrink-0 rounded border px-1 py-0.5 text-[9px] font-bold ${sell ? 'border-rose-500/40 text-rose-300' : f.toCall === 'BUY' ? 'border-emerald-500/40 text-emerald-300' : 'border-slate-600 text-slate-400'}`}>→ {String(f.toCall).replace('SELL:', 'SELL/')}</span>
            <span>{f.detail}</span>
          </li>
        );
      })}
    </ul>
  );
}

function precedenceRank(reasonCode, order) { return (order || {})[reasonCode]; }

// Read-only explanation modal. The deterministic call visually dominates; Albert's
// prose is clearly secondary and CANNOT change any number.
function ExplainModal({ decision, onClose }) {
  const [loading, setLoading] = React.useState(true);
  const [text, setText] = React.useState('');
  const [err, setErr] = React.useState('');
  React.useEffect(() => {
    let alive = true;
    setLoading(true); setText(''); setErr('');
    fetch(`${API_BASE}/v1/albert/explain-call`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pid: getPid(), decisionId: decision.decisionId, asset: decision.symbol, decision, question: 'Why this call, why this amount, and what would change it?' }) })
      .then((r) => r.json()).then((j) => { if (!alive) return; setText(j.explanation || ''); if (!j.explanation) setErr(j.error || 'No explanation returned.'); })
      .catch(() => { if (alive) setErr('Could not reach Albert.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [decision]);
  const d = decision;
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-slate-700 bg-slate-950 p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-white">{d.symbol}</span>
            <ActionPill a={d.action} />
            {d.action === 'SELL' && <SellActionPill p={d.sellPlan} />}
            <EligibilityChip d={d} />
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200"><X className="h-4 w-4" /></button>
        </div>
        {/* DETERMINISTIC FACTS — the source of truth, always dominant */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-[12px]">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <div><span className="text-slate-500">Reason</span><div className="font-semibold text-slate-200">{REASON_LABEL[d.reasonCode] || d.reasonCode}</div></div>
            <div><span className="text-slate-500">Precedence</span><div className="font-semibold text-slate-200">{d.precedenceRuleApplied}</div></div>
            <div><span className="text-slate-500">Opportunity score</span><div className="font-semibold text-slate-200">{d.opportunityScore}</div></div>
            <div><span className="text-slate-500">Confidence</span><div className="font-semibold text-slate-200">{d.confidence}%</div></div>
            {d.action === 'BUY' && <div className="col-span-2"><span className="text-slate-500">Deploy now / planned</span><div className="font-semibold text-emerald-400">{fmt(d.recommendedDeployNowUsd)} / {fmt(d.totalPlannedDeploymentUsd)}</div></div>}
            {d.action === 'SELL' && d.sellPlan && <div className="col-span-2"><span className="text-slate-500">Sell</span><div className="font-semibold text-rose-300">{d.sellPlan.action.replace('_', ' ')} · {fmtX(d.sellPlan.sellUsd)} · {qty(d.sellPlan.sellQty)} {d.symbol}</div></div>}
            {d.positionBefore && <div className="col-span-2 text-[11px] text-slate-400">Position: {fmtX(d.positionBefore.valueUsd)} ({d.positionBefore.pct}%) <ArrowRight className="inline h-3 w-3" /> {fmtX((d.positionAfter || {}).valueUsd)} ({(d.positionAfter || {}).pct}%)</div>}
            {d.invalidation ? <div className="col-span-2 text-[11px] text-rose-400">Invalidation ≈ {fmtX(d.invalidation)}</div> : null}
          </div>
          {!d.eligible && <p className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">Ineligible — {INELIG_LABEL[d.ineligibilityReason] || d.ineligibilityReason}. This can never be a BUY until that clears.</p>}
        </div>
        {/* ALBERT'S PROSE — explicitly secondary + read-only */}
        <div className="mt-3">
          <p className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-violet-300"><MessageCircle className="h-3 w-3" />Albert&apos;s explanation (read-only)</p>
          {loading ? <div className="flex items-center gap-2 text-[12px] text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />Albert is reading the snapshot…</div>
            : err ? <p className="text-[12px] text-slate-500">{err}</p>
            : <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-slate-300">{text}</p>}
          <p className="mt-2 text-[10px] text-slate-600">Albert explains the numbers above — he cannot change the call, amount, score, or invalidation.</p>
        </div>
      </div>
    </div>
  );
}

function HistoryDrawer({ asset, onClose }) {
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/v1/albert/decision-history?pid=${encodeURIComponent(getPid())}&asset=${encodeURIComponent(asset)}&limit=50`, { cache: 'no-store' })
      .then((r) => r.json()).then((j) => { if (alive) setRows(j.events || []); }).catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [asset]);
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-slate-700 bg-slate-950 p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-2 text-base font-bold text-white"><History className="h-4 w-4 text-sky-300" />{asset} — decision history</p>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200"><X className="h-4 w-4" /></button>
        </div>
        {rows == null ? <div className="flex items-center gap-2 text-[12px] text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading…</div>
          : rows.length === 0 ? <p className="text-[12px] text-slate-500">No call changes recorded yet. The advice for {asset} has been stable.</p>
          : (
            <ol className="relative space-y-3 border-l border-slate-800 pl-4">
              {rows.map((ev, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-sky-500" />
                  <p className="text-[12px] font-semibold text-slate-200">{ev.headline || ev.changeType}</p>
                  <p className="text-[10px] text-slate-500">{new Date(ev.changedAt).toLocaleString()}</p>
                  <ul className="mt-0.5 space-y-0.5">{(ev.changeReason || []).map((r, j) => <li key={j} className="text-[11px] text-slate-400">• {r}</li>)}</ul>
                  <p className="mt-0.5 text-[9px] text-slate-600" title={`prev ${ev.previousSnapshotId} → new ${ev.newSnapshotId}`}>snapshot {String(ev.previousSnapshotId || '').slice(0, 8)} → {String(ev.newSnapshotId || '').slice(0, 8)}</p>
                </li>
              ))}
            </ol>
          )}
        <p className="mt-3 text-[10px] text-slate-600">Each entry links the previous and new immutable decision snapshots — a full audit trail of why the advice changed.</p>
      </div>
    </div>
  );
}

function RegimeBanner({ reg, buyThresh, pool }) {
  const color = reg.regime === 'BULL' ? 'text-emerald-400' : reg.regime === 'BEAR' ? 'text-rose-400' : 'text-amber-400';
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold"><span className="text-slate-400">Market Regime: </span><span className={color}>{reg.regime}</span> <span className="text-[11px] font-normal text-slate-500">— {reg.confidence}% confidence</span></p>
        <p className="text-[11px] text-slate-500">BUY line ≥ {buyThresh} · deploy pool {fmt(pool)}</p>
      </div>
      <p className="mt-0.5 text-[11px] text-slate-400">{(reg.reasons || []).join('; ')}.</p>
    </div>
  );
}

function ProtectionBanner({ pr, decisions }) {
  // Phase G: portfolio-level drawdown circuit breaker. When active this visually
  // outranks regime/opportunity info. Values are read straight from the engine
  // snapshot — never recomputed on the client.
  if (!pr || !pr.protectionMode) return null;
  const dd = pr.drawdownPct != null ? Number(pr.drawdownPct).toFixed(1) : '—';
  const max = pr.maxDrawdownPct != null ? Number(pr.maxDrawdownPct).toFixed(1) : '—';
  const rec = pr.recoveryThresholdPct != null ? Number(pr.recoveryThresholdPct).toFixed(1) : '—';
  const cuts = Object.entries(pr.reductions || {});
  const decFor = (sym) => (decisions || []).find((x) => x.symbol === sym);
  return (
    <div className="mb-2 overflow-hidden rounded-xl border-2 border-rose-500/60 bg-gradient-to-b from-rose-500/[0.14] to-rose-950/30">
      <div className="flex items-start gap-2.5 p-3">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-500/20 ring-1 ring-rose-500/50">
          <AlertTriangle className="h-4 w-4 text-rose-300" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-extrabold uppercase tracking-wide text-rose-200">Portfolio Protection Active</p>
            <span className="rounded-full border border-rose-500/50 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-200">CIRCUIT BREAKER</span>
          </div>
          <p className="mt-1 text-[13px] font-semibold text-white">
            Current drawdown <span className="text-rose-300">{dd}%</span> · Mandate limit <span className="text-rose-300">{max}%</span>
          </p>
          <p className="mt-0.5 text-[12px] text-rose-100/90">Albert has <b>suspended all new BUYs</b> and is reducing portfolio risk. Protection lifts when drawdown recovers to <b>&le;&nbsp;{rec}%</b>.</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-rose-100/80">
            <span>High-water mark: <b className="text-white">{fmt(pr.highWaterMarkUsd)}</b></span>
            <span>Current value: <b className="text-white">{fmt(pr.currentPortfolioValueUsd)}</b></span>
            {pr.riskReductionRequiredUsd != null && <span>Risk reduction target: <b className="text-white">{fmt(pr.riskReductionRequiredUsd)}</b></span>}
          </div>
          {cuts.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {cuts.map(([sym, c]) => {
                const dec = decFor(sym);
                const applied = dec && dec.action === 'SELL' && dec.sellPlan ? { label: sellActionLabel(dec.sellPlan.action), reason: dec.reasonCode } : null;
                const proposal = fracLabel(c.fraction);
                if (applied && applied.reason && applied.reason !== 'PORTFOLIO_DRAWDOWN_RISK') {
                  return (
                    <span key={sym} className="inline-flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-950/30 px-2 py-0.5 text-[10px] text-amber-100" title={`basis: ${c.reductionBasis}`}>
                      <span className="font-bold">{sym}</span>
                      <span className="text-slate-400 line-through">{proposal}</span>
                      <ArrowRight className="h-3 w-3 text-amber-300" />
                      <span className="font-semibold text-amber-200">{applied.label}</span>
                      <span className="text-amber-300/80">({REASON_LABEL[applied.reason] || applied.reason} overrides)</span>
                    </span>
                  );
                }
                return (
                  <span key={sym} className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-950/40 px-2 py-0.5 text-[10px] text-rose-100" title={`basis: ${c.reductionBasis}`}>
                    <span className="font-bold">{sym}</span>
                    <span className="text-rose-300">{applied ? applied.label : proposal}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RecoveryLedgerStrip({ led, timeline }) {
  // Phase H: compact drawdown recovery journey (bundled with lifecycle/audit). Shows
  // while a protection episode exists (active OR recently lifted). Values from engine.
  const [showPast, setShowPast] = React.useState(false);
  const past = timeline || [];
  if (!led && past.length === 0) return null;
  const lifted = led && led.lifted;
  return (
    <div className="mb-2 rounded-xl border border-slate-800 bg-slate-950/50 p-2.5">
      {led && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-400"><Activity className="h-3 w-3" />Drawdown recovery journey</p>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${lifted ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>{lifted ? 'PROTECTION LIFTED' : `${led.ppUntilLift} pp until lift`}</span>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-4">
            <div><span className="text-slate-500">High-water</span><div className="font-semibold text-white">{fmt(led.highWaterMarkUsd)}</div></div>
            <div><span className="text-slate-500">Breach</span><div className="font-semibold text-rose-300">{fmt(led.breachValueUsd)}{led.breachDrawdownPct != null ? ` (-${led.breachDrawdownPct}%)` : ''}</div></div>
            <div><span className="text-slate-500">Current</span><div className="font-semibold text-white">{fmt(led.currentValueUsd)}{led.currentDrawdownPct != null ? ` (-${led.currentDrawdownPct}%)` : ''}</div></div>
            <div><span className="text-slate-500">Recovery line</span><div className="font-semibold text-emerald-300">{fmt(led.recoveryLineUsd)}{led.recoveryThresholdPct != null ? ` (-${led.recoveryThresholdPct}%)` : ''}</div></div>
          </div>
        </>
      )}
      {past.length > 0 && (
        <div className={led ? 'mt-2 border-t border-slate-800 pt-2' : ''}>
          <button onClick={() => setShowPast(!showPast)} className="flex w-full items-center justify-between gap-2 text-left">
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-400"><History className="h-3 w-3" />Past recoveries ({past.length})</span>
            <ChevronDown className={`h-3.5 w-3.5 text-slate-500 transition ${showPast ? 'rotate-180' : ''}`} />
          </button>
          {showPast && (
            <ul className="mt-1.5 space-y-1">
              {past.map((ep, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border border-slate-800 bg-slate-900/40 px-2 py-1 text-[11px]">
                  <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">RECOVERED</span>
                  <span className="text-slate-400">Breach <b className="text-rose-300">{fmt(ep.breachValueUsd)}</b>{ep.breachDrawdownPct != null ? <span className="text-rose-300"> (-{ep.breachDrawdownPct}%)</span> : ''}</span>
                  <ArrowRight className="h-3 w-3 text-slate-600" />
                  <span className="text-slate-400">lifted at <b className="text-emerald-300">-{ep.liftedDrawdownPct}%</b></span>
                  <span className="ml-auto text-[10px] text-slate-600">{fmtTs(ep.activatedAt)} → {fmtTs(ep.liftedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const STAGE_COLOR = {
  WAIT: 'bg-slate-700/40 text-slate-300 border-slate-600',
  BUY: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  ADD: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  HOLD: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  TRIM: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  SELL: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
};

function JourneyNode({ ev, isLast }) {
  const [open, setOpen] = React.useState(false);
  const orders = ev.orders || [];
  return (
    <div className="relative pl-6">
      {!isLast && <div className="absolute left-[9px] top-7 h-[calc(100%-1rem)] w-px bg-slate-700" />}
      <div className={`absolute left-1 top-2 h-3.5 w-3.5 rounded-full border-2 ${ev.portfolioRiskIntervention ? 'border-rose-500 bg-rose-900' : 'border-slate-600 bg-slate-900'}`} />
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-2 py-1.5 text-left">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STAGE_COLOR[ev.stage] || STAGE_COLOR.WAIT}`}>{ev.stage}</span>
          <span className="text-[12px] font-semibold text-white">{ev.label}</span>
          {ev.portfolioRiskIntervention && <span className="rounded-full border border-rose-500/40 px-1.5 py-0.5 text-[9px] text-rose-300">drawdown</span>}
          {ev.hasExecution ? <span className="rounded-full border border-emerald-500/40 px-1.5 py-0.5 text-[9px] text-emerald-300">filled</span> : null}
        </div>
        <span className="shrink-0 text-[10px] text-slate-500">{fmtTs(ev.timestamp)}</span>
      </button>
      {open && (
        <div className="mb-2 space-y-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2.5 text-[11px]">
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-slate-400">
            <span>Regime <b className="text-slate-200">{ev.regime || '—'}</b></span>
            <span>Score <b className="text-slate-200">{ev.score ?? '—'}</b></span>
            <span>Conf <b className="text-slate-200">{ev.confidence != null ? ev.confidence + '%' : '—'}</b></span>
            {ev.previousCall && <span>{ev.previousCall} <ArrowRight className="inline h-3 w-3" /> <b className="text-slate-200">{ev.call}</b></span>}
          </div>
          {ev.reasonCode && <p className="text-slate-300">Reason: <span className="text-slate-200">{REASON_LABEL[ev.reasonCode] || ev.reasonCode}</span></p>}
          {(ev.changeReason && ev.changeReason.length > 0) && <p className="text-slate-500">Changed because: {ev.changeReason.join('; ')}.</p>}
          {ev.portfolioRiskNote && <p className="text-rose-300">⚠ {ev.portfolioRiskNote}</p>}
          <div className="rounded border border-slate-800 bg-slate-900/40 p-2">
            <p className="mb-0.5 text-[9px] uppercase tracking-wide text-violet-300">Decision (recommended)</p>
            <p className="text-slate-300">Δ {ev.recommendedDeltaUsd != null ? fmtX(ev.recommendedDeltaUsd) : '—'}
              {ev.positionBefore && ev.positionAfter && <span className="text-slate-500"> · position {fmtX(ev.positionBefore.valueUsd)} ({ev.positionBefore.pct}%) <ArrowRight className="inline h-3 w-3" /> {fmtX(ev.positionAfter.valueUsd)} ({ev.positionAfter.pct}%)</span>}</p>
          </div>
          <div className="rounded border border-slate-800 bg-slate-900/40 p-2">
            <p className="mb-0.5 text-[9px] uppercase tracking-wide text-sky-300">Execution (paper order)</p>
            {orders.length === 0 ? <p className="text-slate-500">No paper order created for this decision.</p> : orders.map((o) => (
              <div key={o.orderIntentId} className="text-slate-300">
                <span className={`font-semibold ${OSTATE_COLOR[o.state] || 'text-slate-300'}`}>{o.state}</span> · {o.side} {fmtX(o.amountUsd)}
                {o.fills && o.fills.length > 0 ? <span className="text-emerald-300"> · {o.fills.length} fill{o.fills.length > 1 ? 's' : ''} ({o.fills.map((f) => qty(f.quantity) + '@' + fmtX(f.price)).join(', ')})</span> : <span className="text-slate-500"> · no fill</span>}
              </div>
            ))}
          </div>
          <div className="rounded border border-slate-800 bg-slate-900/40 p-2">
            <p className="mb-0.5 text-[9px] uppercase tracking-wide text-emerald-300">Portfolio effect (paper exposure)</p>
            <p className="text-slate-300">Paper position at this point: <b className="text-white">{qty(ev.paperPositionSizeAtDecision)}</b> units</p>
          </div>
          {(ev.flipConditions && ev.flipConditions.length > 0) && (
            <div><p className="mb-0.5 flex items-center gap-1 text-[9px] uppercase text-slate-500"><Info className="h-3 w-3" />What would change this</p><FlipConditions items={ev.flipConditions} /></div>
          )}
          <p className="text-[9px] text-slate-600">snapshot {String(ev.snapshotId || '').slice(0, 8)} · engine {ev.engineVersion} · hash {String(ev.decisionInputsHash || '').slice(0, 10)}</p>
        </div>
      )}
    </div>
  );
}

function JourneyModal({ asset, onClose }) {
  const [lc, setLc] = React.useState(null);
  const [err, setErr] = React.useState('');
  React.useEffect(() => {
    const pid = getPid();
    fetch(`${API_BASE}/v1/albert/lifecycle/${encodeURIComponent(asset)}?pid=${encodeURIComponent(pid)}`, { cache: 'no-store' })
      .then((r) => r.json()).then(setLc).catch(() => setErr('Could not load journey'));
  }, [asset]);
  const events = lc?.events || [];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="flex items-center gap-2 text-sm font-bold text-white"><Activity className="h-4 w-4 text-sky-300" />{asset} — Decision Journey</h4>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        {!lc && !err && <div className="flex items-center gap-2 py-6 text-[12px] text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading journey…</div>}
        {err && <p className="py-6 text-center text-[12px] text-rose-400">{err}</p>}
        {lc && lc.status === 'empty' && <p className="py-6 text-center text-[12px] text-slate-500">No decision history yet for {asset}. The journey builds as Albert&apos;s calls change over time.</p>}
        {lc && lc.status === 'ready' && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-800 bg-slate-950/50 p-2.5 text-[11px]">
              <span className="text-slate-500">Current paper exposure</span>
              <b className={lc.currentPaperPositionSize > 0 ? 'text-emerald-300' : 'text-slate-400'}>{qty(lc.currentPaperPositionSize)} units</b>
              <span className="text-slate-600">· {lc.eventCount} decision{lc.eventCount === 1 ? '' : 's'} · engine {lc.currentEngineVersion}</span>
            </div>
            <div className="space-y-0">
              {events.map((ev, i) => <JourneyNode key={ev.eventId || i} ev={ev} isLast={i === events.length - 1} />)}
            </div>
            <p className="mt-3 text-[10px] text-slate-600">Read-only replay of frozen snapshots — each node shows its original engine version. History is never recomputed. Decision / Execution / Portfolio effect are shown separately.</p>
          </>
        )}
      </div>
    </div>
  );
}


function Stat({ label, value, sub, accent }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 text-lg font-bold ${accent || 'text-white'}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500">{sub}</p>}
    </div>
  );
}

const OSTATE_COLOR = {
  DRAFT: 'text-slate-400', PENDING_CONFIRMATION: 'text-amber-300', CONFIRMED: 'text-sky-300',
  WORKING: 'text-sky-300', PARTIALLY_FILLED: 'text-violet-300', FILLED: 'text-emerald-300',
  CANCELLED: 'text-slate-400', REJECTED: 'text-rose-300', EXPIRED: 'text-slate-500',
};
const OUTCOME_MSG = {
  STALE_DECISION: 'Albert’s numbers moved \u2014 this frozen order is now stale. Return to the fresh call and create a new order.',
  EXPIRED: 'This order intent expired (5-minute limit). Return to the fresh call to create a new one.',
  SLIPPAGE_EXCEEDED: 'Execution price breached your slippage limit \u2014 the paper order was rejected, not filled at a worse price.',
  NO_MARKET_PRICE: 'No market price available right now \u2014 rejected.',
};
const CANCELLABLE = ['PENDING_CONFIRMATION', 'CONFIRMED', 'WORKING', 'PARTIALLY_FILLED'];

// Paper Order lifecycle modal. The confirmation screen shows the EXACT frozen
// intent from create() — never a re-fetched/recomputed recommendation. PAPER only.
function PaperOrderModal({ decision, onClose, onChanged }) {
  const idemRef = React.useRef('ord_' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now() + '_' + Math.random().toString(36).slice(2)));
  const [intent, setIntent] = React.useState(null);
  const [audit, setAudit] = React.useState([]);
  const [outcome, setOutcome] = React.useState(null); // {reason} | {error} | null
  const [busy, setBusy] = React.useState(true);
  const [showAudit, setShowAudit] = React.useState(false);
  const [explain, setExplain] = React.useState(null); // {loading,text}
  const [left, setLeft] = React.useState(null); // seconds to expiry
  const [showSim, setShowSim] = React.useState(false); // simulation controls (partial fill)

  const post = (path, body) => fetch(`${API_BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then((r) => r.json());
  const apply = (resp) => {
    if (resp && resp.intent) setIntent(resp.intent);
    if (resp && (resp.reason || resp.error)) setOutcome({ reason: resp.reason, error: resp.error }); else setOutcome(null);
    if (resp && (resp.status === 'filled' || resp.status === 'partially_filled')) onChanged && onChanged();
    return resp;
  };
  const refreshAudit = (oid) => fetch(`${API_BASE}/v1/albert/order/${oid}`, { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (j.audit) setAudit(j.audit); }).catch(() => {});

  React.useEffect(() => { // CREATE (frozen intent) — separate from confirm
    let alive = true; setBusy(true);
    post('/v1/albert/order/create', { pid: getPid(), asset: decision.symbol, idempotencyKey: idemRef.current })
      .then((r) => { if (!alive) return; if (r.status === 'error') setOutcome({ error: r.error }); else { apply(r); refreshAudit(r.intent.orderIntentId); } })
      .catch(() => alive && setOutcome({ error: 'NETWORK' })).finally(() => alive && setBusy(false));
    return () => { alive = false; };
  }, [decision]);

  React.useEffect(() => { // expiry countdown
    if (!intent) return; const t = setInterval(() => {
      const s = Math.max(0, Math.round((new Date(intent.expiresAt).getTime() - Date.now()) / 1000)); setLeft(s);
    }, 1000); return () => clearInterval(t);
  }, [intent]);

  const act = async (fn) => { setBusy(true); try { const r = await fn(); apply(r); if (r && r.intent) refreshAudit(r.intent.orderIntentId); } finally { setBusy(false); } };
  const doConfirm = () => act(() => post(`/v1/albert/order/${intent.orderIntentId}/confirm`));
  const doExecute = (q) => act(() => post(`/v1/albert/order/${intent.orderIntentId}/execute`, q != null ? { simulateFillQty: q } : {}));
  const doCancel = () => act(() => post(`/v1/albert/order/${intent.orderIntentId}/cancel`));
  const askAlbert = () => { setExplain({ loading: true, text: '' }); post('/v1/albert/explain-order-intent', { pid: getPid(), orderIntentId: intent.orderIntentId, question: 'Explain this paper order, any fill or rejection, and what would change it.' }).then((j) => setExplain({ loading: false, text: j.explanation || j.error || 'No explanation.' })).catch(() => setExplain({ loading: false, text: 'Could not reach Albert.' })); };
  const returnToFresh = () => { onChanged && onChanged(); onClose(); };

  const st = intent && intent.state;
  const isBuy = intent && intent.side === 'BUY';
  const terminalBad = st === 'REJECTED' || st === 'EXPIRED';

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-amber-500/30 bg-slate-950 p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">Paper / Simulation</span>
            <span className="text-base font-bold text-white">{decision.symbol}</span>
            {intent && <span className={`text-[11px] font-bold ${OSTATE_COLOR[st] || 'text-slate-400'}`}>{st}</span>}
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200"><X className="h-4 w-4" /></button>
        </div>

        {busy && !intent && <div className="flex items-center gap-2 py-6 text-[12px] text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Freezing order intent…</div>}
        {outcome && outcome.error === 'NO_ACTIONABLE_ORDER' && <p className="py-4 text-[12px] text-slate-400">This call is not actionable as an order (only eligible BUY/SELL calls can be ordered).</p>}
        {outcome && outcome.error && outcome.error !== 'NO_ACTIONABLE_ORDER' && !intent && <p className="py-4 text-[12px] text-rose-300">Could not create order: {outcome.error}</p>}

        {intent && (
          <>
            {/* FROZEN INTENT — exactly what will be confirmed, never recomputed */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-[12px]">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wide text-slate-500">Frozen order intent</span>
                {st === 'PENDING_CONFIRMATION' && left != null && <span className={`text-[10px] font-semibold ${left < 30 ? 'text-rose-300' : 'text-slate-400'}`}>expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>}
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <div><span className="text-slate-500">Side</span><div className={`font-bold ${isBuy ? 'text-emerald-300' : 'text-rose-300'}`}>{intent.side}</div></div>
                <div><span className="text-slate-500">Reason</span><div className="font-semibold text-slate-200">{REASON_LABEL[intent.reasonCode] || intent.reasonCode}</div></div>
                <div><span className="text-slate-500">Amount</span><div className="font-semibold text-slate-200">{fmtX(intent.amountUsd)}</div></div>
                <div><span className="text-slate-500">Quantity</span><div className="font-semibold text-slate-200">{qty(intent.quantity)} {intent.asset}</div></div>
                <div><span className="text-slate-500">Decision price</span><div className="font-semibold text-slate-200">{fmtX(intent.referencePrice)}</div></div>
                <div><span className="text-slate-500">Slippage tol.</span><div className="font-semibold text-slate-200">{intent.slippageToleranceBps} bps</div></div>
                <div><span className="text-slate-500">{isBuy ? 'Max buy price' : 'Min sell price'}</span><div className="font-semibold text-slate-200">{fmtX(isBuy ? intent.maxBuyPrice : intent.minSellPrice)}</div></div>
                <div><span className="text-slate-500">Filled / remaining</span><div className="font-semibold text-slate-200">{qty(intent.filledQuantity)} / {qty(intent.remainingQuantity)}</div></div>
              </div>
              <p className="mt-1.5 text-[9px] text-slate-600">decision {String(intent.decisionId || '').slice(0, 8)} · order {String(intent.orderIntentId || '').slice(0, 8)} · engine {intent.engineVersion}</p>
            </div>

            {/* FIRST-CLASS OUTCOMES */}
            {outcome && outcome.reason && (
              <div className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-[12px] text-rose-200">
                <p className="font-bold">{outcome.reason.replace(/_/g, ' ')}</p>
                <p className="mt-0.5 text-rose-300/90">{OUTCOME_MSG[outcome.reason] || 'The order was not executed.'}</p>
                {(outcome.reason === 'STALE_DECISION' || outcome.reason === 'EXPIRED') && <button onClick={returnToFresh} className="mt-2 rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold text-sky-200 hover:bg-sky-500/20">Return to fresh Albert call</button>}
              </div>
            )}
            {st === 'CANCELLED' && <p className="mt-2 rounded-lg border border-slate-700 bg-slate-800/40 p-2 text-[12px] text-slate-300">Order cancelled. No paper fill recorded.</p>}
            {(st === 'FILLED' || st === 'PARTIALLY_FILLED') && intent.fills && intent.fills.length > 0 && (
              <div className="mt-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] p-2.5 text-[12px]">
                <p className="mb-1 text-[10px] uppercase text-emerald-300">{st === 'FILLED' ? 'Filled (paper)' : 'Partially filled (paper)'}</p>
                {intent.fills.map((f, i) => <div key={i} className="flex justify-between text-slate-300"><span>{qty(f.quantity)} @ {fmtX(f.price)}</span><span>{fmtX(f.usd)}</span></div>)}
                <p className="mt-1 text-[10px] text-slate-500">Albert has reassessed against your updated paper portfolio.</p>
              </div>
            )}

            {/* ACTIONS driven by the state machine */}
            <div className="mt-3 flex flex-wrap gap-2">
              {st === 'PENDING_CONFIRMATION' && <button disabled={busy} onClick={doConfirm} className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1.5 text-[12px] font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Confirm paper order</button>}
              {st === 'CONFIRMED' && <button disabled={busy} onClick={() => doExecute()} className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1.5 text-[12px] font-bold text-slate-900 hover:bg-emerald-400 disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Execute (paper fill)</button>}
              {st === 'PARTIALLY_FILLED' && <button disabled={busy} onClick={() => doExecute()} className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1.5 text-[12px] font-bold text-slate-900 hover:bg-emerald-400 disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Fill remaining</button>}
              {CANCELLABLE.includes(st) && <button disabled={busy} onClick={doCancel} className="rounded-full border border-slate-600 px-3 py-1.5 text-[12px] text-slate-300 hover:bg-slate-800 disabled:opacity-50">Cancel</button>}
              {intent && <button onClick={askAlbert} className="inline-flex items-center gap-1 rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-[12px] font-semibold text-violet-200 hover:bg-violet-500/20"><MessageCircle className="h-3 w-3" />Ask Albert</button>}
              {terminalBad && !(outcome && (outcome.reason === 'STALE_DECISION' || outcome.reason === 'EXPIRED')) && <button onClick={returnToFresh} className="rounded-full border border-sky-500/40 px-3 py-1.5 text-[12px] text-sky-200 hover:bg-sky-500/10">Return to fresh call</button>}
            </div>

            {/* SIMULATION CONTROLS — partial fill is a testing tool, not the default action */}
            {st === 'CONFIRMED' && (
              <div className="mt-2">
                <button onClick={() => setShowSim(!showSim)} className="flex items-center gap-1 text-[10px] uppercase text-slate-500 hover:text-slate-300"><ChevronDown className={`h-3 w-3 transition-transform ${showSim ? 'rotate-180' : ''}`} />Simulation controls</button>
                {showSim && (
                  <div className="mt-1.5 rounded-lg border border-slate-800 bg-slate-950/40 p-2.5">
                    <p className="mb-1.5 text-[11px] text-slate-400">For testing the state machine. Normal paper use: just <span className="font-semibold text-emerald-300">Execute</span> for a full fill.</p>
                    <button disabled={busy} onClick={() => doExecute(Math.max(0.00000001, +(intent.remainingQuantity * 0.4).toFixed(8)))} className="rounded-full border border-violet-500/40 px-3 py-1.5 text-[12px] text-violet-200 hover:bg-violet-500/10 disabled:opacity-50">Simulate partial fill (40%)</button>
                  </div>
                )}
              </div>
            )}

            {/* AUDIT TRAIL */}
            <button onClick={() => setShowAudit(!showAudit)} className="mt-3 flex items-center gap-1 text-[10px] uppercase text-slate-500 hover:text-slate-300"><ChevronDown className={`h-3 w-3 transition-transform ${showAudit ? 'rotate-180' : ''}`} />Immutable audit trail ({audit.length})</button>
            {showAudit && (
              <ol className="mt-1 space-y-1 border-l border-slate-800 pl-3">
                {audit.map((a, i) => (
                  <li key={i} className="text-[11px]">
                    <span className="text-slate-300">{a.stateBefore || '—'} {'→'} <span className="font-semibold">{a.stateAfter}</span></span>
                    <span className="text-slate-600"> · {a.action}</span>
                    {a.facts && a.facts.rejectionReason && <span className="text-rose-400"> · {a.facts.rejectionReason}</span>}
                    {a.facts && a.facts.fillUsd != null && <span className="text-emerald-400"> · fill {fmtX(a.facts.fillUsd)} @ {fmtX(a.facts.executionSpot)} ({a.facts.actualSlippageBps} bps)</span>}
                    <div className="text-[9px] text-slate-600">{new Date(a.ts).toLocaleTimeString()}</div>
                  </li>
                ))}
              </ol>
            )}

            {/* ASK ALBERT (read-only) */}
            {explain && (
              <div className="mt-3 rounded-lg border border-violet-500/20 bg-violet-500/[0.05] p-2.5">
                <p className="mb-1 flex items-center gap-1 text-[10px] uppercase text-violet-300"><MessageCircle className="h-3 w-3" />Albert&apos;s explanation (read-only)</p>
                {explain.loading ? <div className="flex items-center gap-2 text-[12px] text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />Reading the order…</div> : <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-slate-300">{explain.text}</p>}
              </div>
            )}
          </>
        )}
        <p className="mt-3 text-[10px] text-slate-600">PAPER / SIMULATION only — no real trade is transmitted. Albert explains orders; he cannot create, confirm, or change them.</p>
      </div>
    </div>
  );
}

export default function AlbertPlan() {
  const [summary, setSummary] = React.useState(null);
  const [mandate, setMandate] = React.useState(null);
  const [complete, setComplete] = React.useState(false);
  const [decisions, setDecisions] = React.useState(null);
  const [expanded, setExpanded] = React.useState(null);
  const [explainFor, setExplainFor] = React.useState(null);
  const [historyFor, setHistoryFor] = React.useState(null);
  const [orderFor, setOrderFor] = React.useState(null);
  const [journeyFor, setJourneyFor] = React.useState(null);
  const [tradedAssets, setTradedAssets] = React.useState([]);
  const [openMandate, setOpenMandate] = React.useState(false);
  const [openPortfolio, setOpenPortfolio] = React.useState(false);
  const [savingM, setSavingM] = React.useState(false);
  const [savingP, setSavingP] = React.useState(false);
  const [usdc, setUsdc] = React.useState('');
  const [positions, setPositions] = React.useState([]);

  const load = React.useCallback(async () => {
    const pid = getPid();
    try {
      const [mr, sr, pr] = await Promise.all([
        fetch(`${API_BASE}/v1/albert/mandate?pid=${encodeURIComponent(pid)}`, { cache: 'no-store' }).then((r) => r.json()),
        fetch(`${API_BASE}/v1/albert/portfolio-summary?pid=${encodeURIComponent(pid)}`, { cache: 'no-store' }).then((r) => r.json()),
        fetch(`${API_BASE}/v1/portfolio?pid=${encodeURIComponent(pid)}`, { cache: 'no-store' }).then((r) => r.json()),
      ]);
      setMandate(mr.mandate); setComplete(mr.complete); setSummary(sr);
      setUsdc(pr.usdc != null ? String(pr.usdc) : '');
      setPositions((pr.positions || []).map((p) => ({ asset: p.asset || '', size: p.size ?? '', avg_entry: p.avg_entry ?? '' })));
      fetch(`${API_BASE}/v1/albert/decisions?pid=${encodeURIComponent(pid)}`, { cache: 'no-store' }).then((r) => r.json()).then(setDecisions).catch(() => {});
      fetch(`${API_BASE}/v1/albert/lifecycle-assets?pid=${encodeURIComponent(pid)}`, { cache: 'no-store' }).then((r) => r.json()).then((j) => setTradedAssets(j.assets || [])).catch(() => {});
    } catch (e) { /* noop */ }
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const saveMandate = async () => {
    setSavingM(true);
    try {
      await fetch(`${API_BASE}/v1/albert/mandate`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid: getPid(), mandate }) });
      await load(); setOpenMandate(false);
    } finally { setSavingM(false); }
  };
  const savePortfolio = async () => {
    setSavingP(true);
    try {
      await fetch(`${API_BASE}/v1/portfolio`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid: getPid(), usdc: usdc === '' ? null : Number(usdc),
          positions: positions.filter((p) => p.asset).map((p) => ({ asset: p.asset, size: Number(p.size) || 0, avg_entry: Number(p.avg_entry) || 0 })) }) });
      await load(); setOpenPortfolio(false);
    } finally { setSavingP(false); }
  };

  const setM = (k, v) => setMandate((m) => ({ ...(m || {}), [k]: v }));
  const s = summary || {};
  // Single journey-availability contract shared by the row button AND the Past-journeys chips.
  const hasJourney = (sym) => (tradedAssets || []).includes(sym);

  return (
    <div className="rounded-2xl border border-sky-500/20 bg-gradient-to-b from-sky-500/[0.06] to-slate-900/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-sky-300" />
          <h3 className="text-base font-bold text-white">Portfolio Command Centre</h3>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setOpenPortfolio((v) => !v)} className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-slate-800">Edit holdings</button>
          <button onClick={() => setOpenMandate((v) => !v)} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${complete ? 'border border-slate-700 text-slate-300 hover:bg-slate-800' : 'bg-amber-500 text-slate-900'}`}>{complete ? 'Edit mandate' : 'Set mandate'}</button>
        </div>
      </div>

      {!complete && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[12px] text-amber-200">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Set your <b>Trading Mandate</b> (risk tolerance + protected USDC reserve) to unlock Albert&apos;s personalised BUY / HOLD / SELL / WAIT recommendations.</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Total value" value={fmt(s.total_value)} />
        <Stat label="USDC" value={fmt(s.usdc)} />
        <Stat label="Protected reserve" value={fmt(s.protected_reserve)} sub={`${s.reserve_pct ?? 0}% of USDC`} accent="text-slate-300" />
        <Stat label="Deployable USDC" value={fmt(s.deployable_usdc)} accent="text-emerald-400" />
      </div>

      {complete && decisions && decisions.regime && (
        <div className="mt-3">
          <ProtectionBanner pr={decisions.portfolioRisk} decisions={decisions.decisions} />
          <RecoveryLedgerStrip led={decisions.portfolioRisk?.recoveryLedger} timeline={decisions.portfolioRisk?.recoveryTimeline} />
          <RegimeBanner reg={decisions.regime} buyThresh={decisions.buyThreshold} pool={decisions.regimeDeployCeiling} />
          <div className="mt-2 rounded-xl border border-violet-500/25 bg-violet-500/[0.06] p-3">
            <p className="text-[10px] uppercase tracking-wide text-violet-300">Albert&apos;s call</p>
            <p className="mt-0.5 text-sm font-semibold text-white">{decisions.albertCall}</p>
          </div>
          <div className="mt-2 overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-[12px]">
              <thead><tr className="bg-slate-900/60 text-[10px] uppercase text-slate-500">
                <th className="py-1.5 pl-3 pr-2">Asset</th><th className="pr-2">Call</th><th className="pr-2">Score</th>
                <th className="pr-2">Conf</th><th className="pr-2">Recommendation</th><th className="pr-3"></th></tr></thead>
              <tbody>
                {decisions.decisions.map((d) => (
                  <React.Fragment key={d.symbol}>
                    <tr className="cursor-pointer border-t border-slate-800/60 hover:bg-slate-900/40" onClick={() => setExpanded(expanded === d.symbol ? null : d.symbol)}>
                      <td className="py-1.5 pl-3 pr-2 font-semibold text-slate-200">{d.symbol}</td>
                      <td className="pr-2"><div className="flex flex-col gap-0.5"><div className="flex flex-wrap items-center gap-1"><ActionPill a={d.action} big />{d.action === 'SELL' && <SellActionPill p={d.sellPlan} />}<EligibilityChip d={d} /></div>{d.action === 'SELL' && <span className="text-[9px] text-slate-500">{REASON_LABEL[d.reasonCode] || d.reasonCode}</span>}</div></td>
                      <td className="pr-2 text-[11px] text-slate-400">{d.opportunityScore}</td>
                      <td className="pr-2 text-[11px] text-slate-500">{d.confidence}%</td>
                      <td className="pr-2"><CallCell d={d} /></td>
                      <td className="pr-3 text-right"><button onClick={(e) => { e.stopPropagation(); setExpanded(expanded === d.symbol ? null : d.symbol); }} className="text-slate-500 hover:text-slate-200"><ChevronDown className={`h-4 w-4 transition-transform ${expanded === d.symbol ? 'rotate-180' : ''}`} /></button></td>
                    </tr>
                    {expanded === d.symbol && (
                      <tr className="border-t border-slate-800/40 bg-slate-950/40"><td colSpan={6} className="px-3 py-2">
                        {d.action === 'SELL' && d.sellPlan && (
                          <div className="mb-2 rounded-lg border border-rose-500/25 bg-rose-500/[0.06] p-2.5">
                            <p className="mb-1 flex items-center gap-1 text-[10px] uppercase text-rose-300"><Layers className="h-3 w-3" />Sell plan — {REASON_LABEL[d.reasonCode] || d.reasonCode} <span className="text-slate-500">(precedence #{precedenceRank(d.reasonCode, decisions.precedenceOrder)})</span></p>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-4">
                              <div><span className="text-slate-500">Action</span><div className="font-bold text-rose-200">{d.sellPlan.action === 'EXIT_100' ? 'EXIT 100%' : d.sellPlan.action.replace('TRIM_', 'TRIM ') + '%'}</div></div>
                              <div><span className="text-slate-500">Sell USD</span><div className="font-semibold text-slate-200">{fmtX(d.sellPlan.sellUsd)}</div></div>
                              <div><span className="text-slate-500">Sell qty</span><div className="font-semibold text-slate-200">{qty(d.sellPlan.sellQty)}</div></div>
                              <div><span className="text-slate-500">Δ</span><div className="font-semibold text-rose-300">{fmtX(d.recommendedDeltaUsd)}</div></div>
                            </div>
                            <p className="mt-1 text-[11px] text-slate-400">Position {fmtX(d.positionBefore?.valueUsd)} ({d.positionBefore?.pct}%) <ArrowRight className="inline h-3 w-3" /> {fmtX(d.positionAfter?.valueUsd)} ({d.positionAfter?.pct}%)</p>
                            {d.sellPlan.allSignals && d.sellPlan.allSignals.length > 1 && <p className="mt-1 text-[10px] text-slate-500">Also fired (lower precedence): {d.sellPlan.allSignals.filter((s) => s !== d.reasonCode).join(', ')}.</p>}
                          </div>
                        )}
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div>
                            <p className="mb-1 text-[10px] uppercase text-slate-500">Why</p>
                            <ul className="space-y-0.5 text-[11px] text-slate-300">{(d.reasons || []).map((r, i) => <li key={i}>• {r}</li>)}</ul>
                            {!d.eligible && <p className="mt-1 text-[11px] text-amber-400">⚠ Ineligible — {INELIG_LABEL[d.ineligibilityReason] || d.ineligibilityReason} (scored {d.opportunityScore}, but never a BUY until this clears).</p>}
                            {(d.warnings || []).map((w, i) => <p key={i} className="mt-1 text-[11px] text-amber-400">⚠ {w}</p>)}
                            {d.invalidationPrice ? <p className="mt-1 text-[11px] text-rose-400">Invalidation ≈ {fmtX(d.invalidationPrice)}</p> : null}
                            {(d.riskFlags && d.riskFlags.length > 0) && <div className="mt-1 flex flex-wrap gap-1">{d.riskFlags.map((f) => <span key={f} className="rounded border border-rose-500/30 px-1 py-0.5 text-[9px] text-rose-300">{f.replace(/_/g, ' ')}</span>)}</div>}
                          </div>
                          <div>
                            <p className="mb-1 text-[10px] uppercase text-slate-500">Score breakdown <span className="text-slate-600">(separate from confidence {d.confidence}%)</span></p>
                            <div className="flex flex-wrap gap-1">{Object.entries(d.scoreComponents || {}).map(([k, v]) => <span key={k} className="rounded-full border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">{k} {v}</span>)}</div>
                            {(d.tranches && d.tranches.length > 0) && (<div className="mt-2"><p className="mb-1 text-[10px] uppercase text-slate-500">Tranche plan</p>{d.tranches.map((t) => <div key={t.number} className="flex justify-between text-[11px] text-slate-300"><span>T{t.number} · {t.pct}% · {t.trigger.replace(/_/g, ' ').toLowerCase()}</span><span className="text-slate-400">{fmtX(t.amountUsd)}</span></div>)}</div>)}
                          </div>
                        </div>
                        <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/40 p-2.5">
                          <p className="mb-1 flex items-center gap-1 text-[10px] uppercase text-slate-500"><Info className="h-3 w-3" />What would change this?</p>
                          <FlipConditions items={d.flipConditions} />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {d.eligible && (d.action === 'BUY' || d.action === 'SELL') && (
                            <button onClick={() => setOrderFor(d)} className="inline-flex items-center gap-1 rounded-full bg-amber-500/90 px-2.5 py-1 text-[11px] font-bold text-slate-900 hover:bg-amber-400"><Layers className="h-3 w-3" />Create paper order</button>
                          )}
                          <button onClick={() => setExplainFor(d)} className="inline-flex items-center gap-1 rounded-full border border-violet-500/40 bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-200 hover:bg-violet-500/20"><MessageCircle className="h-3 w-3" />Ask Albert about this call</button>
                          <button onClick={() => setHistoryFor(d.symbol)} className="inline-flex items-center gap-1 rounded-full border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-slate-800"><History className="h-3 w-3" />History</button>
                          {hasJourney(d.symbol) && <button onClick={() => setJourneyFor(d.symbol)} className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-200 hover:bg-sky-500/20"><Activity className="h-3 w-3" />View journey</button>}
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-[10px] text-slate-600">Deterministic engine {decisions.engineVersion} · advisory / paper only · Albert explains these calls, he doesn&apos;t change them.</p>
          {(() => {
            const shown = new Set((decisions.decisions || []).map((d) => d.symbol));
            const extra = (tradedAssets || []).filter((a) => a && !shown.has(a));
            if (extra.length === 0) return null;
            return (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wide text-slate-500">Past journeys:</span>
                {extra.map((a) => (
                  <button key={a} onClick={() => setJourneyFor(a)} className="inline-flex items-center gap-1 rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-800"><Activity className="h-3 w-3" />{a}</button>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {(s.holdings && s.holdings.length > 0) && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead><tr className="text-[10px] uppercase text-slate-500"><th className="py-1 pr-3">Asset</th><th className="pr-3">Value</th><th className="pr-3">% of port</th><th className="pr-3">Unrealised</th></tr></thead>
            <tbody>
              {s.holdings.map((h) => (
                <tr key={h.asset} className="border-t border-slate-800/60">
                  <td className="py-1.5 pr-3 font-semibold text-slate-200">{h.asset}</td>
                  <td className="pr-3 text-slate-300">{fmt(h.value)}</td>
                  <td className="pr-3 text-slate-400">{h.portfolio_pct}%</td>
                  <td className={`pr-3 font-medium ${h.unrealized_pct == null ? 'text-slate-500' : h.unrealized_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{h.unrealized_pct == null ? '—' : `${h.unrealized_pct >= 0 ? '+' : ''}${h.unrealized_pct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openPortfolio && (
        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-300"><Wallet className="h-3.5 w-3.5" />Your holdings &amp; USDC (manual)</div>
          <label className="mb-2 block text-[11px] text-slate-400">USDC balance
            <input type="number" value={usdc} onChange={(e) => setUsdc(e.target.value)} placeholder="e.g. 50000" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200" /></label>
          <div className="space-y-1.5">
            {positions.map((p, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input value={p.asset} onChange={(e) => setPositions((a) => a.map((x, j) => j === i ? { ...x, asset: e.target.value.toUpperCase() } : x))} placeholder="COIN" className="w-20 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[12px] text-slate-200" />
                <input type="number" value={p.size} onChange={(e) => setPositions((a) => a.map((x, j) => j === i ? { ...x, size: e.target.value } : x))} placeholder="qty" className="w-24 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[12px] text-slate-200" />
                <input type="number" value={p.avg_entry} onChange={(e) => setPositions((a) => a.map((x, j) => j === i ? { ...x, avg_entry: e.target.value } : x))} placeholder="avg entry $" className="w-28 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[12px] text-slate-200" />
                <button onClick={() => setPositions((a) => a.filter((_, j) => j !== i))} className="text-slate-500 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <button onClick={() => setPositions((a) => [...a, { asset: '', size: '', avg_entry: '' }])} className="mt-2 flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300"><Plus className="h-3 w-3" />Add holding</button>
          <div className="mt-3 flex justify-end"><Button onClick={savePortfolio} disabled={savingP} className="h-8 bg-sky-600 text-white hover:bg-sky-500">{savingP ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}Save holdings</Button></div>
        </div>
      )}

      {openMandate && mandate && (
        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-300"><Target className="h-3.5 w-3.5" />Trading Mandate</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="text-[11px] text-slate-400">Goal
              <input value={mandate.goal || ''} onChange={(e) => setM('goal', e.target.value)} placeholder="e.g. Long-term capital growth" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200" /></label>
            <label className="text-[11px] text-slate-400">Risk tolerance
              <select value={mandate.risk_tolerance || ''} onChange={(e) => setM('risk_tolerance', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200">
                <option value="">Select…</option><option value="conservative">Conservative</option><option value="moderate">Moderate</option><option value="aggressive">Aggressive</option></select></label>
            <label className="text-[11px] text-slate-400">Time horizon
              <input value={mandate.time_horizon || ''} onChange={(e) => setM('time_horizon', e.target.value)} placeholder="e.g. 6–12 months" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200" /></label>
            <label className="text-[11px] text-slate-400">Max portfolio drawdown %
              <input type="number" value={mandate.max_drawdown_pct ?? ''} onChange={(e) => setM('max_drawdown_pct', e.target.value === '' ? null : Number(e.target.value))} placeholder="e.g. 20" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200" /></label>
            <label className="text-[11px] text-slate-400">Protected USDC reserve %
              <input type="number" value={mandate.reserve_pct ?? ''} onChange={(e) => setM('reserve_pct', e.target.value === '' ? null : Number(e.target.value))} placeholder="e.g. 25" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200" /></label>
            <label className="text-[11px] text-slate-400">Max trade risk %
              <input type="number" value={mandate.max_trade_risk_pct ?? ''} onChange={(e) => setM('max_trade_risk_pct', e.target.value === '' ? null : Number(e.target.value))} placeholder="e.g. 2" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200" /></label>
            <label className="text-[11px] text-slate-400 sm:col-span-2">Approved coins (comma-separated, blank = top 100)
              <input value={(mandate.approved_coins || []).join(', ')} onChange={(e) => setM('approved_coins', e.target.value.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean))} placeholder="e.g. BTC, ETH, SOL" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200" /></label>
          </div>
          <label className="mt-2 flex items-center gap-2 text-[12px] text-slate-300"><input type="checkbox" checked={!!mandate.leverage_enabled} onChange={(e) => setM('leverage_enabled', e.target.checked)} className="h-4 w-4 rounded border-slate-600 bg-slate-900" />Enable leverage (off by default)</label>
          <div className="mt-3 flex justify-end"><Button onClick={saveMandate} disabled={savingM} className="h-8 bg-amber-500 text-slate-900 hover:bg-amber-400">{savingM ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}Save mandate</Button></div>
        </div>
      )}

      {explainFor && <ExplainModal decision={explainFor} onClose={() => setExplainFor(null)} />}
      {historyFor && <HistoryDrawer asset={historyFor} onClose={() => setHistoryFor(null)} />}
      {orderFor && <PaperOrderModal decision={orderFor} onClose={() => setOrderFor(null)} onChanged={load} />}
      {journeyFor && <JourneyModal asset={journeyFor} onClose={() => setJourneyFor(null)} />}
    </div>
  );
}
