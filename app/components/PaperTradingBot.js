'use client';
// Paper Trading — the AGGREGATE view (M-G).
//
// This screen is review-only. There is NO setup here and no separate "Observe"
// mode: a strategy is started from the strategy itself (Strategies → pick one →
// Start paper trading), and it trades its own ring-fenced virtual wallet. Here we
// simply add it all up so you can see how the whole programme is doing.
//
// No real money, no exchange keys — ever.
import React from 'react';
import { API_BASE } from '../lib/api';
import {
  Loader2, FlaskConical, Crosshair, ShieldCheck, TrendingUp, Info, ArrowRight,
  HandCoins, Bot, AlertTriangle, Wallet,
} from 'lucide-react';

const usd = (v) => (v == null ? '\u2014' : '$' + Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }));
const signed = (v) => (v == null ? '\u2014' : (Number(v) >= 0 ? '+' : '') + usd(v).replace('$-', '-$'));
const pnlColor = (v) => (v == null ? 'text-slate-200' : Number(v) >= 0 ? 'text-emerald-300' : 'text-rose-300');

const STATUS = {
  SAVED: { label: 'Saved · not trading', color: 'text-slate-300', dot: 'bg-slate-500' },
  STOPPED: { label: 'Stopped', color: 'text-amber-300', dot: 'bg-amber-400' },
  LIVE: { label: 'Paper trading', color: 'text-emerald-300', dot: 'bg-emerald-400' },
  WAIT: { label: 'WAIT · awaiting conditions or data', color: 'text-amber-300', dot: 'bg-amber-400' },
  RESTRICTED_IN_WALLET: { label: 'Restricted in this wallet', color: 'text-amber-300', dot: 'bg-amber-400' },
  NEEDS_CHANGES: { label: 'Needs changes', color: 'text-amber-300', dot: 'bg-amber-400' },
  UNAVAILABLE: { label: 'Worker unavailable', color: 'text-amber-300', dot: 'bg-amber-400' },
  HALTED_RISK: { label: 'Halted — drawdown limit', color: 'text-rose-300', dot: 'bg-rose-400' },
  ARCHIVED: { label: 'Archived', color: 'text-slate-500', dot: 'bg-slate-600' },
};
const st = (s) => STATUS[s] || STATUS.SAVED;
const approvalLabel = (m) => (m === 'AUTOPILOT' ? 'Autopilot' : m === 'REVIEW' ? 'Review and approve' : '—');

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
  // Aggregate figures refresh quietly; this screen never writes anything.
  React.useEffect(() => {
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const goStrategies = () => onNav && onNav('strategies');

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
  const rows = d.strategies || [];
  const traded = rows.filter((r) => r.paperAccountId);
  const live = rows.filter((r) => r.isLive);
  const activity = d.activity || [];
  const positions = d.positions || [];
  const needsApproval = d.pendingApprovals || [];

  // ---- Nothing is trading yet: point at the one journey, don't offer a setup ----
  if (!traded.length) {
    return (
      <div className="space-y-4">
        <Header />
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-center">
          <Wallet className="mx-auto h-7 w-7 text-slate-500" />
          <p className="mt-2 text-[14px] font-semibold text-white">No strategy is paper trading yet</p>
          <p className="mx-auto mt-1 max-w-[52ch] text-[12.5px] leading-relaxed text-slate-400">
            {rows.length
              ? `You have ${rows.length} saved ${rows.length === 1 ? 'strategy' : 'strategies'}. Open one and tap “Start paper trading” — it gets its own virtual wallet, and its results appear here.`
              : 'Build a strategy with Albert, save it, then tap “Start paper trading” on it. Each strategy gets its own virtual wallet, and its results appear here.'}
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
  const summary = [
    live.length
      ? `${live.length} of your ${rows.length} ${rows.length === 1 ? 'strategy is' : 'strategies are'} paper trading right now${t.autopilotStrategies ? ` (${t.autopilotStrategies} on autopilot)` : ''}.`
      : `None of your strategies are trading right now — ${traded.length} ${traded.length === 1 ? 'has' : 'have'} a wallet with history you can pick back up.`,
    t.valueAvailable && t.value != null
      ? `Together they hold ${usd(t.value)} of the ${usd(t.startingCash)} they started with, so you are ${Number(t.pnlUsd) >= 0 ? 'up' : 'down'} ${signed(t.pnlUsd).replace('+', '')}${t.pnlPct != null ? ` (${t.pnlPct}%)` : ''}.`
      : 'Live valuation is unavailable for at least one wallet right now, so the combined total is being withheld rather than guessed.',
    t.closedTrades
      ? `${t.closedTrades} ${t.closedTrades === 1 ? 'trade has' : 'trades have'} closed${t.winRatePct != null ? ` with a ${t.winRatePct}% win rate` : ''}, and ${positions.length} ${positions.length === 1 ? 'position is' : 'positions are'} open.`
      : `${positions.length} ${positions.length === 1 ? 'position is' : 'positions are'} open and nothing has closed yet.`,
    needsApproval.length
      ? `${needsApproval.length} ${needsApproval.length === 1 ? 'trade needs' : 'trades need'} your approval — you approve those on the strategy itself.`
      : 'Nothing is waiting on you.',
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
            <p className="text-2xl font-bold text-white">{t.valueAvailable ? usd(t.value) : 'unavailable'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Profit / loss</p>
            <p className={`text-2xl font-bold ${pnlColor(t.pnlUsd)}`}>
              {signed(t.pnlUsd)}{t.pnlPct != null ? <span className="ml-1.5 text-sm font-semibold">{t.pnlPct}%</span> : null}
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
          {[['Started with', usd(t.startingCash)],
            ['Strategies trading', `${t.liveStrategies ?? 0} of ${rows.length}`],
            ['Open positions', String(positions.length)],
            ['Closed trades', String(t.closedTrades ?? 0)],
            ['Win rate', t.winRatePct != null ? `${t.winRatePct}%` : '—'],
            ['Booked profit', signed(t.realizedPnl)],
            ['Costs paid', usd(t.fees)],
            ['Awaiting you', String(needsApproval.length)]].map(([k, v]) => (
            <div key={k} className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/60 p-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">{k}</p>
              <p className="truncate font-semibold text-slate-200" title={String(v)}>{v}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 max-w-[85ch] text-[13px] leading-relaxed text-slate-200">{summary}</p>
      </div>

      {/* ---- Anything waiting on you (approved on the strategy, not here) ---- */}
      {needsApproval.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-sky-500/30 bg-sky-500/[0.06] p-4">
          <HandCoins className="h-5 w-5 shrink-0 text-sky-300" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-white">
              {needsApproval.length} paper {needsApproval.length === 1 ? 'trade needs' : 'trades need'} your approval
            </p>
            <p className="truncate text-[11.5px] text-slate-400">
              {needsApproval.slice(0, 3).map((p) => `${p.side} ${p.asset} on “${p.strategyName}”`).join(' · ')}
              {needsApproval.length > 3 ? ` +${needsApproval.length - 3} more` : ''}
            </p>
          </div>
          <button onClick={goStrategies} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-sky-500/20 px-3 py-1.5 text-[12px] font-semibold text-sky-200 hover:bg-sky-500/30">
            Review on the strategy<ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ---- Per-strategy breakdown ---- */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">By strategy</p>
        <div className="space-y-1.5">
          {rows.map((r) => {
            const m = st(r.paperStatus);
            return (
              <button key={r.strategyId} onClick={goStrategies}
                className="w-full rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-left transition-colors hover:border-sky-500/40">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${m.dot}`} />
                  <span className="truncate text-[13px] font-bold text-white">{r.name}</span>
                  <span className={`text-[11px] font-semibold ${m.color}`}>{m.label}</span>
                  {r.approvalMode && (
                    <span className="inline-flex items-center gap-1 rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
                      {r.approvalMode === 'AUTOPILOT' ? <Bot className="h-3 w-3" /> : <HandCoins className="h-3 w-3" />}
                      {approvalLabel(r.approvalMode)}
                    </span>
                  )}
                  <span className="ml-auto text-[11px] text-slate-500">{(r.assets || []).join(' · ')}</span>
                </div>
                {r.paperAccountId ? (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11.5px] sm:grid-cols-4">
                    <span><span className="block text-[10px] uppercase tracking-wide text-slate-500">Value</span>
                      <span className="font-semibold text-slate-200">{r.valueAvailable === false ? 'unavailable' : usd(r.value)}</span></span>
                    <span><span className="block text-[10px] uppercase tracking-wide text-slate-500">P&amp;L</span>
                      <span className={`font-semibold ${pnlColor(r.pnlUsd)}`}>{signed(r.pnlUsd)}{r.pnlPct != null ? ` · ${r.pnlPct}%` : ''}</span></span>
                    <span><span className="block text-[10px] uppercase tracking-wide text-slate-500">Open</span>
                      <span className="font-semibold text-slate-200">{r.openPositions ?? 0}{r.pendingApprovals ? ` · ${r.pendingApprovals} to approve` : ''}</span></span>
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
