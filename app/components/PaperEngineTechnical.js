'use client';
// M-F — Technical Centre → Paper Engine.
// Engine-internal read-outs: worker diagnostics, account value, strategy binding,
// the full evidence chain, and the raw activity ledger.
// Read-only: this screen never mutates.
import React from 'react';
import { API_BASE } from '../lib/api';
import {
  Loader2, Wrench, ShieldCheck, AlertTriangle, Link2, FlaskConical,
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

function EvidenceChain({ symbol, acctId }) {
  const [open, setOpen] = React.useState(false);
  const [ev, setEv] = React.useState(null);
  const [err, setErr] = React.useState('');
  const load = async () => {
    setOpen((o) => !o);
    if (ev || !symbol) return;
    try {
      const qs = acctId ? `?acct_id=${encodeURIComponent(acctId)}` : '';
      const r = await fetch(`${API_BASE}/v1/albert/paper/trades/${symbol}/evidence${qs}`, { cache: 'no-store' });
      if (!r.ok) { setErr('Evidence unavailable for this position.'); return; }
      setEv(await r.json());
    } catch (e) { setErr('Evidence could not be loaded.'); }
  };
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
                ['Execution model', ev.executionModel],
                ['Position symbol', ev.position?.symbol],
                ['Avg entry', ev.position?.avgEntry],
                ['Qty', ev.position?.qty],
                ['Cost basis', ev.position?.costBasis],
              ]} />
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
  const positions = dash?.positions || [];
  const activity = dash?.recentActivity || [];
  const strat = dash?.strategy || null;

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
              ['Account', acct.name], ['Runtime state', acct.runtimeState],
              ['Execution enabled', String(integ.executionEnabled)],
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

          <Panel title="Account value detail" icon={FlaskConical}>
            <KV rows={[
              ['Equity', usd(eq.value)], ['Cash', usd(eq.cash)], ['Protected reserve', usd(eq.protectedReserve)],
              ['Deployable cash', usd(eq.deployableCash)], ['Realized P&L', usd(eq.realizedPnl)],
              ['Unrealized P&L', eq.unrealizedPnl != null ? usd(eq.unrealizedPnl) : 'unavailable'],
              ['High water', usd(eq.highWater)],
              ['Drawdown %', eq.drawdownPct != null ? eq.drawdownPct + '%' : null],
              ['Mark status', eq.markStatus],
            ]} />
          </Panel>

          <Panel title="Positions → evidence chain" icon={ShieldCheck}>
            {positions.length ? (
              <div className="space-y-2">
                {positions.map((p) => (
                  <div key={p.symbol} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-[12px]">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-bold text-white">{p.symbol}</span>
                      <span className="font-mono text-slate-400">{p.netQuantity} @ {usd(p.averageEntryPrice)}</span>
                      <span className="text-slate-500">cost {usd(p.costBasis)}</span>
                      {p.stopLoss && <span className="text-rose-400/70">SL {usd(p.stopLoss)}</span>}
                      {p.takeProfit && <span className="text-emerald-400/70">TP {usd(p.takeProfit)}</span>}
                      {p.currentPrice && <span className="text-slate-400">now {usd(p.currentPrice)}</span>}
                      {p.unrealizedPnl != null && <span className={Number(p.unrealizedPnl) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{usd(p.unrealizedPnl)}</span>}
                    </div>
                    <EvidenceChain symbol={p.symbol} acctId={acctId} />
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
