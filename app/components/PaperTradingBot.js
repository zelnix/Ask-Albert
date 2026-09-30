'use client';
// Paper Trading — the AGGREGATE view (M-G).
//
// This screen is review-only. There is NO setup here and no separate "Observe"
// mode: a strategy is started from the strategy itself (Strategies → pick one →
// Start Auto Run), and it trades its own ring-fenced virtual wallet. Here we
// simply add it all up so you can see how the whole programme is doing.
//
// No real money, no exchange keys — ever.
import React from 'react';
import { API_BASE } from '../lib/api';
import {
  Loader2, FlaskConical, Crosshair, ShieldCheck, TrendingUp, Info, ArrowRight,
  AlertTriangle, Wallet,
} from 'lucide-react';

const usd = (v) => (v == null ? '\u2014' : '$' + Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }));
const signed = (v) => (v == null ? '\u2014' : (Number(v) >= 0 ? '+' : '') + usd(v).replace('$-', '-$'));
const pnlColor = (v) => (v == null ? 'text-slate-200' : Number(v) >= 0 ? 'text-emerald-300' : 'text-rose-300');

const STATUS = {
  SAVED: { label: 'Saved · not trading', color: 'text-slate-300', dot: 'bg-slate-500' },
  STOPPED: { label: 'Stopped', color: 'text-amber-300', dot: 'bg-amber-400' },
  LIVE: { label: 'Auto Run active', color: 'text-emerald-300', dot: 'bg-emerald-400' },
  WAIT: { label: 'WAIT · awaiting conditions or data', color: 'text-amber-300', dot: 'bg-amber-400' },
  RESTRICTED_IN_WALLET: { label: 'Restricted in this wallet', color: 'text-amber-300', dot: 'bg-amber-400' },
  NEEDS_CHANGES: { label: 'Needs changes', color: 'text-amber-300', dot: 'bg-amber-400' },
  UNAVAILABLE: { label: 'Worker unavailable', color: 'text-amber-300', dot: 'bg-amber-400' },
  HALTED_RISK: { label: 'Halted — drawdown limit', color: 'text-rose-300', dot: 'bg-rose-400' },
  HALTED_GOAL_CLOSED: { label: 'Goal reached — all closed', color: 'text-emerald-300', dot: 'bg-emerald-400' },
  HALTED_GOAL_ENTRIES: { label: 'Goal reached — managing exits', color: 'text-teal-300', dot: 'bg-teal-400' },
  GOAL_CLOSE_PENDING: { label: 'Goal reached — closing remaining positions', color: 'text-amber-300', dot: 'bg-amber-400' },
  ARCHIVED: { label: 'Archived', color: 'text-slate-500', dot: 'bg-slate-600' },
};
const st = (s) => STATUS[s] || STATUS.SAVED;

function PaperBadge() {
  return <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300"><FlaskConical className="h-3 w-3" />Paper only</span>;
}

function timeAgo(iso) {
  if (!iso) return '';
  const t = Date.now() - new Date(String(iso).replace('Z', '') + 'Z').getTime();
  if (Number.isNaN(t)) return '';
  const m = Math.floor(t / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function PaperTradingBot({ onNav }) {
  const [d, setD] = React.useState(null);
  const [state, setState] = React.useState('loading'); // loading | ready | signedout | error
  const [selectedWalletId, setSelectedWalletId] = React.useState(() => typeof window !== 'undefined' ? window.sessionStorage.getItem('dashboard:selectedWalletId') || '' : '');
  const [walletDetail, setWalletDetail] = React.useState(null);
  const [walletState, setWalletState] = React.useState('idle');

  const load = React.useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/v1/albert/paper/overview`, {
        credentials: 'include', cache: 'no-store',
      });
      if (r.status === 401 || r.status === 403) { setState('signedout'); return; }
      const j = await r.json();
      if (r.ok && j.status === 'ready') { setD(j); setState('ready'); }
      else setState('error');
    } catch (e) { setState('error'); }
  }, []);

  React.useEffect(() => { load(); }, [load]);
  // Wallet existence comes from the authoritative account list, not a strategy count.
  const accountIds = (d?.accounts || []).map((a) => a.paperAccountId).filter(Boolean).join('|');
  React.useEffect(() => {
    const accounts = d?.accounts || [];
    if (!accounts.some((a) => a.paperAccountId === selectedWalletId)) {
      setSelectedWalletId(accounts[0]?.paperAccountId || '');
      setWalletDetail(null);
    }
  }, [accountIds, selectedWalletId]);
  React.useEffect(() => {
    if (selectedWalletId && typeof window !== 'undefined') window.sessionStorage.setItem('dashboard:selectedWalletId', selectedWalletId);
  }, [selectedWalletId]);
  const loadWallet = React.useCallback(async (accountId, signal) => {
    if (!accountId) return;
    setWalletState('loading');
    try {
      const response = await fetch(`${API_BASE}/v1/albert/paper/accounts/${encodeURIComponent(accountId)}/dashboard`,
        { credentials: 'include', cache: 'no-store', signal });
      if (!response.ok) throw new Error('Wallet read unavailable');
      const record = await response.json();
      if (record?.status !== 'ready') throw new Error('Wallet read unavailable');
      if (signal?.aborted) return;
      setWalletDetail(record); setWalletState('ready');
    } catch (error) {
      if (signal?.aborted) return;
      setWalletDetail(null); setWalletState('error');
    }
  }, []);
  React.useEffect(() => {
    if (!selectedWalletId) { setWalletState('idle'); return; }
    const controller = new AbortController();
    loadWallet(selectedWalletId, controller.signal);
    const timer = setInterval(() => loadWallet(selectedWalletId, controller.signal), 30000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [selectedWalletId, loadWallet]);
  // Aggregate figures refresh quietly; this screen never writes anything.
  React.useEffect(() => {
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const goStrategies = (strategyId) => {
    if (typeof strategyId === 'string' && strategyId && typeof window !== 'undefined') window.sessionStorage.setItem('dashboard:strategyId', strategyId);
    onNav?.('strategies');
  };

  const Header = ({ children }) => (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="flex flex-wrap items-center gap-2 text-xl font-bold text-white">
          <FlaskConical className="h-5 w-5 text-amber-300" />Paper Trading <PaperBadge />
        </h2>
        <p className="mt-0.5 text-[12px] text-slate-400">
          How every strategy is doing with virtual money — added up. Start or stop trading on the strategy itself.
        </p>
      </div>
      {children}
    </div>
  );

  if (state === 'loading') {
    return <div className="flex items-center gap-2 text-[13px] text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Loading your paper performance…</div>;
  }
  if (state === 'signedout') {
    return <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-6 text-[13px] text-slate-400">Sign in to see how your strategies are doing on paper.</div>;
  }
  if (state === 'error' || !d) {
    return (
      <div className="space-y-3">
        <Header />
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 text-[13px] text-slate-400">
          Albert couldn&rsquo;t load your paper performance just now.
          <button onClick={load} className="ml-2 font-semibold text-sky-400 hover:text-sky-300">Try again</button>
        </div>
      </div>
    );
  }

  const t = d.totals || {};
  const accounts = d.accounts || [];
  const resolution = d.accountResolution || {};
  const accountsResolved = resolution.status === 'RESOLVED';
  const rollupComplete = true; // All owner accounts iterated directly.
  const rows = d.strategies || [];
  const traded = rows.filter((r) => r.paperAccountId);
  const live = rows.filter((r) => r.isLive);
  const activity = d.activity || [];
  const positions = d.positions || [];

  // An empty strategy list is NOT proof that no owner wallet exists.
  if (accountsResolved && accounts.length === 0 && !traded.length) {
    return (
      <div className="space-y-4">
        <Header />
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-center">
          <Wallet className="mx-auto h-7 w-7 text-slate-500" />
          <p className="mt-2 text-[14px] font-semibold text-white">No strategy is paper trading yet</p>
          <p className="mx-auto mt-1 max-w-[52ch] text-[12.5px] leading-relaxed text-slate-400">
            {rows.length
              ? `You have ${rows.length} saved ${rows.length === 1 ? 'strategy' : 'strategies'}. Open one and tap “Start Auto Run” — it gets its own virtual wallet, and its results appear here.`
              : 'Build a strategy with Albert, save it, then tap “Start Auto Run” on it. Each strategy gets its own virtual wallet, and its results appear here.'}
          </p>
          <button onClick={goStrategies} className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-violet-500">
            <Crosshair className="h-4 w-4" />{rows.length ? 'Go to your strategies' : 'Build a strategy'}
          </button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />Paper only — this never connects to an exchange or places a real order.
          </p>
        </div>
      </div>
    );
  }

  // ---- Plain-English roll-up, composed straight from the payload ----
  const summary = !accountsResolved ? 'The owner wallet list is unavailable; no zero balance or empty history is inferred.'
    : [
        live.length
          ? `${live.length} of your ${rows.length} ${rows.length === 1 ? 'strategy is' : 'strategies are'} paper trading right now${t.liveAutoRunStrategies ? ` (${t.liveAutoRunStrategies} on Auto Run)` : ''}.`
          : `None of your strategies are trading right now — ${traded.length} ${traded.length === 1 ? 'has' : 'have'} a wallet with history you can pick back up.`,
        t.value != null
          ? `Together they hold ${usd(t.value)} of the ${usd(t.startingCash)} they started with, so you are ${Number(t.pnlUsd) >= 0 ? 'up' : 'down'} ${signed(t.pnlUsd).replace('+', '')}${t.pnlPct != null ? ` (${t.pnlPct}%)` : ''}.`
          : 'Live valuation is unavailable for at least one wallet right now.',
        t.closedTrades
          ? `${t.closedTrades} ${t.closedTrades === 1 ? 'trade has' : 'trades have'} closed${t.winRatePct != null ? ` with a ${t.winRatePct}% win rate` : ''}, and ${positions.length} ${positions.length === 1 ? 'position is' : 'positions are'} open.`
          : `${positions.length} ${positions.length === 1 ? 'position is' : 'positions are'} open and nothing has closed yet.`,
      ].join(' ');

  return (
    <div className="space-y-4">
      <Header>
        <button onClick={() => onNav && onNav('paperengine')}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-400 hover:text-sky-300">
          Technical detail<ArrowRight className="h-3.5 w-3.5" />
        </button>
      </Header>

      {/* ---- Combined performance ---- */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          <TrendingUp className="h-3.5 w-3.5" />Combined performance
        </p>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Total value</p>
            <p className="text-2xl font-bold text-white">{t.value != null ? usd(t.value) : 'unavailable'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Profit / loss</p>
            <p className={`text-2xl font-bold ${t.value != null ? pnlColor(t.pnlUsd) : 'text-slate-400'}`}>
              {t.value != null ? <>{signed(t.pnlUsd)}{t.pnlPct != null ? <span className="ml-1.5 text-sm font-semibold">{t.pnlPct}%</span> : null}</> : 'unavailable'}
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
          {[['Started with', usd(t.startingCash)],
            ['Strategies trading', `${t.liveStrategies ?? 0} of ${rows.length}`],
            ['Open positions', String(positions.length)],
            ['Closed trades', String(t.closedTrades ?? 0)],
            ['Win rate', t.winRatePct != null ? `${t.winRatePct}%` : '\u2014'],
            ['Booked profit', signed(t.realizedPnl)],
            ['Auto Run strategies', String(t.liveAutoRunStrategies ?? 0)]].map(([k, v]) => (
            <div key={k} className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/60 p-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">{k}</p>
              <p className="truncate font-semibold text-slate-200" title={String(v)}>{v}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 max-w-[85ch] text-[13px] leading-relaxed text-slate-200">{summary}</p>
      </div>

      {/* A wallet record is authoritative even when no latest strategy points to it. */}
      {accountsResolved && accounts.length > 0 && <section className="rounded-lg border border-slate-700 bg-slate-900/70 p-4" aria-label="Selected paper wallet">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h3 className="text-sm font-bold text-white">Selected virtual wallet</h3><p className="mt-0.5 text-[11px] text-slate-400">Owner-scoped account ledger · combined balances are withheld when any wallet is unlinked.</p></div>
          <label className="text-[11px] text-slate-400">Wallet
            <select value={selectedWalletId} onChange={(e) => { setWalletDetail(null); setSelectedWalletId(e.target.value); }}
              className="ml-2 max-w-[220px] rounded-md border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-white">
              {accounts.map((a) => <option key={a.paperAccountId} value={a.paperAccountId}>{a.name || a.paperAccountId} · {a.paperAccountId}</option>)}
            </select>
          </label>
        </div>
        {walletState === 'loading' && <p role="status" className="mt-3 text-sm text-slate-400">Loading this wallet’s holdings and ledger…</p>}
        {walletState === 'error' && <div role="alert" className="mt-3 flex items-center gap-3 text-sm text-amber-200">Wallet data unavailable; no zero balance inferred. <button type="button" onClick={() => loadWallet(selectedWalletId)} className="font-semibold underline">Retry wallet read</button></div>}
        {walletState === 'ready' && walletDetail && <div className="mt-3 space-y-3 text-xs text-slate-300">
          <p className="text-[11px] text-slate-400">Wallet ledger read {timeAgo(walletDetail.asOf)} · ID {walletDetail.account?.paperAccountId} · {walletDetail.account?.runtimeState || 'state unavailable'}</p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {[
              ['Starting virtual cash', usd(walletDetail.account?.startingCash)],
              ['Current cash', usd(walletDetail.account?.cash)],
              ['Marked equity', walletDetail.equity?.value != null ? usd(walletDetail.equity?.value) : 'Unavailable'],
              ['Open positions', String((walletDetail.positions || []).length)],
              ['Realized P/L', signed(walletDetail.performance?.realizedPnl)],
              ['Ledger reconciliation', walletDetail.integrity?.ok === true ? 'MATCH' : walletDetail.integrity?.ok === false ? 'MISMATCH' : 'Unavailable']
            ].map(([label, value]) => <div key={label} className="rounded-md border border-slate-700 bg-slate-950/50 p-2"><p className="text-[10px] uppercase text-slate-500">{label}</p><p className="mt-0.5 break-words font-semibold text-slate-100">{value}</p></div>)}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-slate-700 p-3"><p className="font-semibold text-white">Open holdings</p>
              {(walletDetail.positions || []).length ? (walletDetail.positions || []).map((p) => <p key={p.paperPositionId || p.asset} className="mt-1.5">{p.asset} · {p.netQuantity} units · entry {usd(p.averageEntryPrice)} · {p.currentPrice ? `mark ${usd(p.currentPrice)}` : 'mark unavailable'} · unrealized {p.unrealizedPnl != null ? signed(p.unrealizedPnl) : 'unavailable'}</p>) : <p className="mt-1.5 text-slate-400">No open holdings in this wallet.</p>}
            </div>
            <div className="rounded-md border border-slate-700 p-3"><p className="font-semibold text-white">Completed trade log</p>
              {(walletDetail.recentActivity || []).filter((e) => e.eventType === 'FILL').length ? (walletDetail.recentActivity || []).filter((e) => e.eventType === 'FILL').slice(0, 10).map((e, i) => <p key={e.ledgerEventId || i} className="mt-1.5">{e.side} {e.asset} · {e.qty} @ {usd(e.fillPx)} · {timeAgo(e.recordedAt || e.effectiveAt)}</p>) : <p className="mt-1.5 text-slate-400">No completed fills in this wallet’s recent ledger. </p>}
              {(walletDetail.recentActivity || []).length >= 20 && <p className="mt-2 text-amber-200">Latest 20 ledger entries shown. Open Paper Engine for the full audit.</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {walletDetail.account?.strategyId && <button type="button" onClick={() => goStrategies(walletDetail.account.strategyId)} className="inline-flex items-center gap-1.5 font-semibold text-sky-300 hover:underline">Open this wallet’s strategy <ArrowRight className="h-3.5 w-3.5" /></button>}
            <button type="button" onClick={() => { if (typeof window !== 'undefined') window.sessionStorage.setItem('dashboard:paperAccountId', selectedWalletId); onNav?.('paperengine'); }} className="inline-flex items-center gap-1.5 font-semibold text-sky-300 hover:underline">Open this wallet’s Paper Engine evidence <ArrowRight className="h-3.5 w-3.5" /></button>
          </div>
        </div>}
      </section>}

      {/* ---- Per-strategy breakdown ---- */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">By strategy</p>
        <div className="space-y-1.5">
          {rows.map((r) => {
            const m = st(r.paperStatus);
            return (
              <button key={r.strategyId} onClick={() => goStrategies(r.strategyId)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-left transition-colors hover:border-sky-500/40">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${m.dot}`} />
                  <span className="truncate text-[13px] font-bold text-white">{r.name}</span>
                  <span className={`text-[11px] font-semibold ${m.color}`}>{m.label}</span>
                  <span className="ml-auto text-[11px] text-slate-500">{(r.assets || []).join(' · ')}</span>
                </div>
                {r.paperAccountId ? (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11.5px] sm:grid-cols-4">
                    <span><span className="block text-[10px] uppercase tracking-wide text-slate-500">Value</span>
                      <span className="font-semibold text-slate-200">{r.valueAvailable === false ? 'unavailable' : usd(r.value)}</span></span>
                    <span><span className="block text-[10px] uppercase tracking-wide text-slate-500">P&amp;L</span>
                      <span className={`font-semibold ${pnlColor(r.pnlUsd)}`}>{signed(r.pnlUsd)}{r.pnlPct != null ? ` · ${r.pnlPct}%` : ''}</span></span>
                    <span><span className="block text-[10px] uppercase tracking-wide text-slate-500">Open</span>
                      <span className="font-semibold text-slate-200">{r.openPositions ?? 0}</span></span>
                    <span className="min-w-0"><span className="block text-[10px] uppercase tracking-wide text-slate-500">Last action</span>
                      <span className="block truncate font-semibold text-slate-300" title={r.lastActivity || ''}>{r.lastActivity ? timeAgo(r.lastActivityAt) || '—' : 'nothing yet'}</span></span>
                  </div>
                ) : (
                  <p className="mt-1.5 text-[11.5px] text-slate-500">Not trading yet — open it to start paper trading.</p>
                )}
                {r.pauseReason && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-amber-300"><AlertTriangle className="h-3.5 w-3.5" />{String(r.pauseReason).replace(/_/g, ' ').toLowerCase()}</p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ---- Combined activity ---- */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Recent activity · all strategies</p>
        {activity.length ? (
          <div className="space-y-1">
            {activity.map((a, i) => (
              <div key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px]">
                <span className="w-32 shrink-0 truncate font-semibold text-slate-300" title={a.strategyName}>{a.strategyName}</span>
                <span className="w-32 shrink-0 text-slate-400">{(a.eventType || '').replace(/_/g, ' ').toLowerCase()}</span>
                <span className="min-w-0 flex-1 truncate text-slate-500" title={a.note}>{a.note}</span>
                {a.amount != null && <span className="font-mono text-slate-400">{usd(a.amount)}</span>}
                <span className="w-16 shrink-0 text-right text-slate-600">{timeAgo(a.recordedAt || a.effectiveAt)}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-[12px] text-slate-500">No activity yet.</p>}
      </div>

      <p className="flex items-start gap-1 text-[10.5px] leading-relaxed text-slate-600">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        Paper trading only — virtual money, no exchange keys, and it can never place a live order. Each strategy trades
        its own ring-fenced wallet, so results are never co-mingled. Execution costs, allocation limits, worker
        diagnostics and the full evidence chain live in More → Technical Centre → Paper Engine.
      </p>
    </div>
  );
}
