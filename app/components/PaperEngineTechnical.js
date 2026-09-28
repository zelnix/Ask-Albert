'use client';
// M-F — Technical Centre → Paper Engine.
// Every engine-internal read-out that used to be duplicated across the four
// Albert-first surfaces (Albert, Ask Albert, Strategies, Paper Trading) now lives
// HERE, in one place: worker diagnostics, allocation-vs-limit calculations,
// ranking provenance, rotation internals, execution assumptions, reconciliation
// and the full fill → strategy → canonical decision → observation evidence chain.
// Nothing was deleted — it was moved. Read-only: this screen never mutates.
import React from 'react';
import { API_BASE } from '../lib/api';
import {
  Loader2, Wrench, ShieldCheck, AlertTriangle, Info, ArrowRight, Link2, FlaskConical,
  Database, Activity, ChevronDown,
} from 'lucide-react';

const usd = (v) => (v == null ? '\u2014' : '$' + Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }));
const fmtTs = (t) => { try { return t ? new Date(t).toLocaleString() : '—'; } catch (e) { return '—'; } };

function Panel({ title, icon: Icon, children, right }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          {Icon && <Icon className="h-3.5 w-3.5" />}{title}
        </p>
        {right}
      </div>
      {children}
    </div>
  );
}

function KV({ rows }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] sm:grid-cols-3">
      {rows.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <span className="block text-[10px] uppercase tracking-wide text-slate-500">{k}</span>
          <span className="block truncate font-mono font-semibold text-slate-200">{v == null || v === '' ? '—' : String(v)}</span>
        </div>
      ))}
    </div>
  );
}

// value vs limit, with a labelled bar (never colour alone)
function LimitBar({ label, valuePct, limitPct }) {
  const v = valuePct == null ? null : Number(valuePct);
  const lim = limitPct == null ? null : Number(limitPct);
  const ratio = (v != null && lim) ? Math.min(1, v / lim) : 0;
  const near = (v != null && lim) ? (v / lim >= 0.9) : false;
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono font-semibold text-slate-200">{v == null ? '—' : v + '%'}<span className="text-slate-500"> / {lim == null ? '—' : lim + '%'}</span>{near ? <span className="ml-1 font-bold text-amber-300">near limit</span> : null}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full ${near ? 'bg-amber-400' : 'bg-sky-400'}`} style={{ width: (ratio * 100).toFixed(0) + '%' }} />
      </div>
    </div>
  );
}

function EvidenceChain({ positionId }) {
  const [open, setOpen] = React.useState(false);
  const [ev, setEv] = React.useState(null);
  const [err, setErr] = React.useState('');
  const load = async () => {
    setOpen((o) => !o);
    if (ev || !positionId) return;
    try {
      const r = await fetch(`${API_BASE}/v1/albert/paper/trades/${positionId}/evidence`, { cache: 'no-store' });
      if (!r.ok) { setErr('Evidence unavailable for this position.'); return; }
      setEv(await r.json());
    } catch (e) { setErr('Evidence could not be loaded.'); }
  };
  const sds = ev?.strategyDecisionSnapshot || null;
  return (
    <div className="mt-1.5">
      <button onClick={load} className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-400 hover:text-sky-300">
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />Evidence chain
      </button>
      {open && (
        <div className="mt-1.5 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 text-[11px]">
          {err && <p className="text-amber-300">{err}</p>}
          {!ev && !err && <p className="flex items-center gap-1.5 text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading…</p>}
          {ev && (
            <div className="space-y-2">
              <KV rows={[
                ['Canonical decision', ev.decisionSnapshotId],
                ['Strategy', sds ? `${sds.strategyId} v${sds.strategyVersion}` : 'none (canonical only)'],
                ['Strategy contract hash', sds?.strategyContractHash],
                ['Canonical inputs hash', sds?.canonicalDecisionHash],
                ['Market observation', sds?.marketObservationId],
                ['Proposed action', sds ? `${sds.proposedAction} ${sds.asset}` : null],
                ['Outcome', sds?.outcome],
                ['Execution profile', ev.executionProfile?.executionProfileId],
              ]} />
              {sds?.ruleResults && (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(sds.ruleResults).map(([k, v]) => (
                    <span key={k} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${v ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
                      {k.replace(/([A-Z])/g, ' $1').toLowerCase()}: {String(v)}
                    </span>
                  ))}
                </div>
              )}
              {(sds?.gateTrace || []).length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">Gate trace</p>
                  <ul className="mt-0.5 space-y-0.5 font-mono text-[10.5px] text-slate-300">
                    {sds.gateTrace.map((g, i) => <li key={i}>{typeof g === 'string' ? g : JSON.stringify(g)}</li>)}
                  </ul>
                </div>
              )}
              {(ev.ledger || []).length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">Ledger entries for this position</p>
                  <ul className="mt-0.5 space-y-0.5 text-[10.5px] text-slate-300">
                    {ev.ledger.map((l, i) => <li key={i}><span className="font-semibold">{(l.eventType || '').replace(/_/g, ' ')}</span> · {l.note} {l.amount != null ? `· ${usd(l.amount)}` : ''}</li>)}
                  </ul>
                </div>
              )}
              <p className="text-[10px] text-slate-500">{ev.note}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PaperEngineTechnical({ onNav }) {
  const [accounts, setAccounts] = React.useState(null);
  const [acctId, setAcctId] = React.useState(null);
  const [dash, setDash] = React.useState(null);

  React.useEffect(() => {
    (async () => {
      try {
        const j = await (await fetch(`${API_BASE}/v1/albert/paper/accounts`, { cache: 'no-store' })).json();
        setAccounts(j.accounts || []);
        if (j.accounts && j.accounts.length) {
          const requested = typeof window !== 'undefined' ? window.sessionStorage.getItem('dashboard:paperAccountId') : null;
          if (requested) window.sessionStorage.removeItem('dashboard:paperAccountId');
          setAcctId((cur) => cur && j.accounts.some((a) => a.paperAccountId === cur) ? cur :
            j.accounts.some((a) => a.paperAccountId === requested) ? requested : j.accounts[0].paperAccountId);
        }
      } catch (e) { setAccounts([]); }
    })();
  }, []);

  React.useEffect(() => {
    if (!acctId) return;
    (async () => {
      try {
        const j = await (await fetch(`${API_BASE}/v1/albert/paper/accounts/${acctId}/dashboard`, { cache: 'no-store' })).json();
        setDash(j && j.status === 'ready' ? j : null);
      } catch (e) { setDash(null); }
    })();
  }, [acctId]);

  if (accounts === null) {
    return <div className="flex items-center gap-2 text-[13px] text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Loading paper engine detail…</div>;
  }
  if (!accounts.length) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-6 text-[13px] text-slate-400">
        No paper account yet — create one in Paper Trading and the engine internals will appear here.
      </div>
    );
  }

  const acct = dash?.account || {};
  const eq = dash?.equity || {};
  const integ = dash?.integrity || {};
  const ap = dash?.autopilot || {};
  const alloc = dash?.allocation || null;
  const rankSnap = dash?.rankingSnapshot || null;
  const rotations = dash?.rotations || [];
  const positions = dash?.positions || [];
  const activity = dash?.recentActivity || [];
  const strat = dash?.strategy || null;
  const asm = dash?.assumptions || {};

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <Wrench className="h-5 w-5 text-slate-300" />
        <h1 className="text-lg font-bold text-white">Paper Engine</h1>
        <span className="text-[12px] text-slate-500">Engine internals, calculations and the full evidence chain · read-only · paper only</span>
        {accounts.length > 1 && (
          <select value={acctId || ''} onChange={(e) => { setAcctId(e.target.value); setDash(null); }}
            className="ml-auto rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-[12px] text-slate-200">
            {accounts.map((a) => <option key={a.paperAccountId} value={a.paperAccountId}>{a.name}</option>)}
          </select>
        )}
      </div>

      {!dash && <div className="flex items-center gap-2 text-[13px] text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Loading account detail…</div>}

      {dash && (
        <>
          <Panel title="Engine state & safety" icon={ShieldCheck}>
            <KV rows={[
              ['Account', acct.name], ['Mode', acct.mode], ['Runtime state', acct.runtimeState],
              ['Execution enabled', String(integ.executionEnabled)], ['Autopilot enabled', String(integ.autopilotEnabled)],
              ['Multi-asset enabled', String(ap.multiAssetEnabled)], ['Trading profile', ap.tradingProfile],
              ['Reconciliation', integ.reconciliation], ['Market data', integ.marketData],
              ['Equity available', String(integ.equityAvailable)], ['Primary pause reason', integ.primaryPauseReason || 'none'],
              ['Ledger size warning', String(integ.ledgerSizeWarning)], ['Last reconciled', fmtTs(integ.lastReconciledAt)],
              ['As of', fmtTs(dash.asOf)],
            ]} />
            {integ.reconciliation !== 'MATCH' && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-red-400"><AlertTriangle className="h-3.5 w-3.5" />Ledger replay does not match the stored balances — the engine fails closed and stops new entries.</p>
            )}
          </Panel>

          <Panel title="Background worker diagnostics" icon={Activity}
            right={<span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ap.workerState === 'running' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>worker: {ap.workerState || 'unknown'}</span>}>
            <KV rows={[
              ['Last background check', fmtTs(ap.lastCheckAt)],
              ['Last decision processed', ap.lastDecisionProcessed],
              ['Last simulated trade', fmtTs(ap.lastTradeAt)],
              ['Next evaluation', fmtTs(ap.nextEvalAt)],
              ['Worker last run', fmtTs(ap.workerLastRunAt)],
              ['Observation cursor', acct.marketObservationCursor],
            ]} />
            <p className="mt-2 text-[10.5px] text-slate-500">The worker runs server-side on its own cadence and executes at most once per (account × asset × canonical decision × market observation). Opening any dashboard never trades.</p>
          </Panel>

          <Panel title="Strategy binding" icon={Link2}>
            {strat ? (
              <KV rows={[
                ['Strategy', strat.name], ['Id', strat.strategyId], ['Version', 'v' + strat.version],
                ['Contract hash', strat.contractHash], ['Status', strat.status],
                ['Universe', (strat.assets || []).join(' · ')],
              ]} />
            ) : (
              <p className="text-[12px] text-slate-500">No active strategy bound to this account — the engine runs on canonical decisions only, and never invents a universe.</p>
            )}
            <p className="mt-2 text-[10.5px] text-slate-500">A bound strategy can only CONSTRAIN and prioritise. A paper entry needs BOTH the strategy universe and the canonical decision to authorise it.</p>
          </Panel>

          {alloc && (
            <Panel title="Allocation calculations (value vs limit)" icon={Database}
              right={<span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300">{alloc.profile} · regime {alloc.regime} · ceiling {alloc.regimeDeployCeilingPct}%</span>}>
              {!alloc.available && <p className="mb-2 flex items-center gap-1.5 text-[11px] text-amber-300"><AlertTriangle className="h-3.5 w-3.5" />Live valuation unavailable (a held asset lacks a fresh mark) — limits shown, current values paused.</p>}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <LimitBar label="Deployed" valuePct={alloc.deployed?.pct} limitPct={alloc.deployed?.limitPct} />
                <LimitBar label="BTC exposure" valuePct={alloc.btc?.pct} limitPct={alloc.btc?.limitPct} />
                <LimitBar label="Altcoin exposure" valuePct={alloc.altcoins?.pct} limitPct={alloc.altcoins?.limitPct} />
                <LimitBar label="Combined open risk" valuePct={alloc.openRisk?.pct} limitPct={alloc.openRisk?.limitPct} />
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2">
                  <div className="flex items-baseline justify-between text-[11px]"><span className="text-slate-400">Open positions</span><span className="font-mono font-semibold text-slate-200">{alloc.positions?.count} / {alloc.positions?.limit}</span></div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-sky-400" style={{ width: ((Math.min(1, (alloc.positions?.count || 0) / (alloc.positions?.limit || 8))) * 100).toFixed(0) + '%' }} /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2"><p className="text-[11px] text-slate-400">Protected USDC</p><p className="font-mono text-[12px] font-semibold text-emerald-300">{usd(alloc.protectedUsdc)}</p></div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2"><p className="text-[11px] text-slate-400">Free USDC</p><p className="font-mono text-[12px] font-semibold text-slate-200">{usd(alloc.freeUsdc)}</p></div>
                </div>
              </div>
              {rankSnap && (
                <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[10.5px] text-slate-500">
                  <Info className="h-3.5 w-3.5" />
                  {rankSnap.available
                    ? <>Ranks: {rankSnap.source || 'discovery'} · snapshot {String(rankSnap.snapshotId || '').slice(0, 8)}… · {rankSnap.fresh ? 'fresh' : 'stale'} {rankSnap.observedAt ? '· ' + fmtTs(rankSnap.observedAt) : ''}</>
                    : <span className="text-amber-300">Live market-cap ranking unavailable — new altcoin sizing falls back to the conservative speculative cap (never a silent static rank).</span>}
                </p>
              )}
            </Panel>
          )}

          <Panel title="Account value detail" icon={FlaskConical}>
            <KV rows={[
              ['Equity', usd(eq.value)], ['Cash', usd(eq.cash)], ['Protected reserve', usd(eq.protectedReserve)],
              ['Deployable cash', usd(eq.deployableCash)], ['Realized P&L', usd(eq.realizedPnl)],
              ['Unrealized P&L', eq.unrealizedPnl != null ? usd(eq.unrealizedPnl) : 'unavailable'],
              ['Fees', usd(eq.fees)], ['High water', usd(eq.highWater)],
              ['Drawdown %', eq.drawdownPct != null ? eq.drawdownPct + '%' : null],
              ['Mark status', eq.markStatus],
            ]} />
          </Panel>

          <Panel title="Execution assumptions" icon={Info}>
            <KV rows={[
              ['Profile', asm.executionProfileId], ['Fee (bps)', asm.feeBps],
              ['Spread (bps)', asm.spreadBps], ['Slippage (bps)', asm.slippageBps],
            ]} />
            <p className="mt-2 text-[10.5px] text-slate-500">Conservative simulated execution. Paper results are never conflated with backtests or a real portfolio, and this engine can never place a live order.</p>
          </Panel>

          {rotations.length > 0 && (
            <Panel title="Rotation internals" icon={ArrowRight}>
              <div className="space-y-2">
                {rotations.map((r) => (
                  <div key={r._id || (r.reducedAsset + r.at)} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-[12px]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-white">{r.reducedAsset}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
                      <span className="font-bold text-white">{r.targetAsset}</span>
                      <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${r.status === 'COMPLETED' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{r.status === 'COMPLETED' ? 'completed' : 'reduced — awaiting buy'}</span>
                    </div>
                    <p className="mt-1 leading-relaxed text-slate-300">{r.headline}</p>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-slate-500">
                      <span>scores {r.reducedScore} → {r.targetScore}</span>
                      <span>regime {r.regime}</span>
                      {r.allocationMovedUsd != null && <span>moved {usd(r.allocationMovedUsd)}</span>}
                      {r.newPositionBoundBy && <span>bound by {String(r.newPositionBoundBy).replace(/_/g, ' ').toLowerCase()}</span>}
                      <span>ranks {String(r.rankingSnapshotId || '—').slice(0, 8)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel title="Positions → evidence chain" icon={ShieldCheck}>
            {positions.length ? (
              <div className="space-y-2">
                {positions.map((p) => (
                  <div key={p.paperPositionId} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-[12px]">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-bold text-white">{p.asset}</span>
                      {p.tier && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-slate-300">{p.tier}{p.marketCapRank ? ` · #${p.marketCapRank}` : ''}{p.rankAvailable === false ? ' · rank n/a' : ''}</span>}
                      <span className="font-mono text-slate-400">{p.netQuantity} @ {usd(p.averageEntryPrice)}</span>
                      <span className="text-slate-500">cost {usd(p.costBasis)}</span>
                      {p.invalidationPrice && <span className="text-slate-500">invalidation {usd(p.invalidationPrice)}</span>}
                      <span className="font-mono text-slate-500">entry decision {String(p.entryDecisionSnapshotId || '—').slice(0, 14)}</span>
                    </div>
                    <EvidenceChain positionId={p.paperPositionId} />
                  </div>
                ))}
              </div>
            ) : <p className="text-[12px] text-slate-500">No open paper positions right now.</p>}
          </Panel>

          <Panel title="Raw activity ledger (latest 20)" icon={Database}>
            <div className="space-y-1">
              {activity.map((a, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="w-44 shrink-0 font-semibold text-slate-300">{(a.eventType || '').replace(/_/g, ' ')}</span>
                  <span className="text-slate-600">{fmtTs(a.recordedAt || a.effectiveAt)}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-500">{a.note}</span>
                  {a.amount != null && <span className="font-mono text-slate-400">{usd(a.amount)}</span>}
                  {a.idemKey && <span className="font-mono text-[10px] text-slate-600">{String(a.idemKey).slice(0, 22)}</span>}
                </div>
              ))}
              {!activity.length && <p className="text-[12px] text-slate-500">No activity yet.</p>}
            </div>
          </Panel>

          <p className="flex items-center justify-center gap-1.5 pt-1 text-center text-[11px] text-slate-600">
            <ShieldCheck className="h-3.5 w-3.5" />Read-only technical view. Paper trading only — no real orders, no exchange keys.
            {onNav && <button onClick={() => onNav('paper')} className="ml-1 font-semibold text-sky-400 hover:text-sky-300">Back to Paper Trading</button>}
          </p>
        </>
      )}
    </div>
  );
}
