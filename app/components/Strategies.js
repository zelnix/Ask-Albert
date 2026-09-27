'use client';

import React from 'react';
import {
  Crosshair, Target, ShieldAlert, Clock, Activity, Sparkles, RefreshCw, X, Check,
  Loader2, TrendingUp, TrendingDown, History, Trophy, Bell, ArrowRight, Plus, Play, Scale,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { API_BASE, getPid } from '../lib/api';
import { fmtUsd } from '../lib/format';
import { SymbolContext } from '../lib/context';
import AlbertPlan from './AlbertPlan';
import DiscoveryFeed from './DiscoveryFeed';
import PanelBoundary from './PanelBoundary';
import { SectionHead } from './shared';

const pnlColor = (v) => (v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-slate-300');
const biasBadge = (bias) => bias === 'bullish'
  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
  : bias === 'bearish' ? 'border-red-500/40 bg-red-500/10 text-red-300'
  : 'border-slate-600 bg-slate-800/60 text-slate-300';

const kindIcon = (kind) => kind === 'price' ? Target : kind === 'time' ? Clock : Activity;
const kindLabel = (r) => {
  if (r.kind === 'price') return `If price goes ${r.op} ${fmtUsd(r.level)}`;
  if (r.kind === 'time') return r.by_days ? `After ~${r.by_days} days` : 'At the deadline';
  if (r.kind === 'signal') return r.metric === 'regime'
    ? `If regime shifts to “${r.value}”`
    : `If conviction goes ${r.op} ${r.value}`;
  return 'Rule';
};
const thenLabel = { take_profit: 'Take profit', add: 'Add', exit: 'Exit', reassess: 'Reassess', note: 'Note' };

function RuleRow({ r }) {
  const Icon = kindIcon(r.kind);
  const fired = r.status === 'fired';
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border p-2.5 ${fired ? 'border-amber-500/40 bg-amber-500/5' : 'border-slate-800 bg-slate-900/40'}`}>
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${fired ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-slate-100">
          {kindLabel(r)} <ArrowRight className="mx-0.5 inline h-3 w-3 text-slate-500" /> <span className="text-sky-300">{thenLabel[r.then] || r.then}</span>
        </p>
        <p className="text-[12px] leading-snug text-slate-400">{r.action_note}</p>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${fired ? 'bg-amber-500/20 text-amber-200' : 'bg-slate-800 text-slate-500'}`}>
        {fired ? 'FIRED' : 'WATCHING'}
      </span>
    </div>
  );
}

function TargetRow({ t, position }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${t.hit ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-slate-800 bg-slate-900/40'}`}>
      <TrendingUp className={`h-3.5 w-3.5 ${t.hit ? 'text-emerald-400' : 'text-slate-500'}`} />
      <span className="text-[13px] font-semibold text-slate-100">{t.label}</span>
      <span className="text-[13px] font-bold text-slate-200">{fmtUsd(t.price)}</span>
      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">{t.pct_of_position}% off</span>
      <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${t.hit ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-500'}`}>{t.hit ? 'HIT' : 'PENDING'}</span>
    </div>
  );
}

function EventTimeline({ events }) {
  const evs = (events || []).slice().reverse();
  if (!evs.length) return null;
  return (
    <div className="space-y-2">
      {evs.map((e, i) => (
        <div key={i} className="flex gap-2.5">
          <div className="flex flex-col items-center">
            <span className="mt-1 h-2 w-2 rounded-full bg-sky-400" />
            {i < evs.length - 1 && <span className="w-px flex-1 bg-slate-700" />}
          </div>
          <div className="pb-2">
            <p className="text-[12px] leading-snug text-slate-200">{e.message}</p>
            <p className="text-[10px] text-slate-500">
              {(() => { try { return new Date(e.ts + (/[zZ]$/.test(e.ts) ? '' : 'Z')).toLocaleString(); } catch { return e.ts; } })()}
              {e.price ? ` · ${fmtUsd(e.price)}` : ''}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function PerfHeadline({ perf, position }) {
  const p = perf || {};
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
        <p className="text-[10px] uppercase tracking-wide text-slate-500">Total P&amp;L</p>
        <p className={`text-xl font-black leading-tight ${pnlColor(p.total_pnl_pct)}`}>{p.total_pnl_pct > 0 ? '+' : ''}{p.total_pnl_pct}%</p>
        <p className={`text-[11px] font-semibold ${pnlColor(p.total_pnl_usd)}`}>{p.total_pnl_usd > 0 ? '+' : ''}{fmtUsd(p.total_pnl_usd)}</p>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
        <p className="text-[10px] uppercase tracking-wide text-slate-500">Entry → Now</p>
        <p className="text-sm font-bold text-slate-100">{fmtUsd(p.entry_price)}</p>
        <p className="text-[11px] text-slate-400">{fmtUsd(p.current_price)}</p>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
        <p className="text-[10px] uppercase tracking-wide text-slate-500">Position left</p>
        <p className="text-sm font-bold text-slate-100">{p.remaining_pct}%</p>
        <p className="text-[11px] text-slate-400 capitalize">{position}</p>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
        <p className="text-[10px] uppercase tracking-wide text-slate-500">Timeline</p>
        <p className="text-sm font-bold text-slate-100">{p.days_active}d in</p>
        <p className="text-[11px] text-slate-400">{p.days_left != null ? `${p.days_left}d left` : '—'}</p>
      </div>
    </div>
  );
}

export function DraftModal({ draft, symbol, onClose, onRegenerate, regenerating }) {
  const reviewInStudio = () => {
    const plan = [draft.title, `${symbol} 100% ${draft.position || 'long'}`, draft.thesis,
      `Original complete chat draft (including horizon, targets, stops and every rule): ${JSON.stringify(draft)}`].join('\n');
    window.dispatchEvent(new CustomEvent('albert:build-strategy', { detail: { symbol, seed: plan } }));
    onClose?.();
  };
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-3 top-3 rounded-full bg-black/40 p-1.5 text-slate-300 hover:text-white"><X className="h-4 w-4" /></button>
        <div className="mb-1 flex items-center gap-2">
          <img src="/albert.png" alt="Albert" className="h-8 w-8 rounded-full object-cover ring-1 ring-sky-500/40" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-sky-300">Albert&apos;s draft strategy</span>
        </div>
        <h2 className="text-lg font-black text-white">{draft.title}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold capitalize ${biasBadge(draft.bias)}`}>{draft.bias}</span>
          <span className="rounded-full border border-slate-600 bg-slate-800/60 px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-300">{draft.position}</span>
          <span className="rounded-full border border-slate-600 bg-slate-800/60 px-2 py-0.5 text-[11px] font-semibold text-slate-300">{draft.horizon_days}-day horizon</span>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-slate-300">{draft.thesis}</p>

        <p className="mt-4 mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">Profit targets</p>
        <div className="space-y-1.5">{(draft.targets || []).map((t, i) => <TargetRow key={i} t={t} position={draft.position} />)}</div>
        {draft.stop && (
          <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-2.5 py-2">
            <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
            <span className="text-[13px] font-semibold text-slate-100">Stop</span>
            <span className="text-[13px] font-bold text-red-300">{fmtUsd(draft.stop.price)}</span>
          </div>
        )}

        <p className="mt-4 mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">If-this-then-that rules</p>
        <div className="space-y-1.5">{(draft.rules || []).map((r, i) => <RuleRow key={i} r={r} />)}</div>

        <div className="mt-5 flex gap-2">
          <Button onClick={reviewInStudio} className="flex-1 gap-1.5 bg-gradient-to-r from-sky-500 to-violet-500 hover:opacity-90">
            <Play className="h-4 w-4" />Review in Strategy Studio
          </Button>
          <Button onClick={onRegenerate} disabled={regenerating} variant="outline" className="gap-1.5 border-slate-700">
            {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Redraft
          </Button>
        </div>
        <p className="mt-3 text-center text-[10px] leading-relaxed text-slate-500">Legacy draft only. Studio must review what its paper engine can actually execute before Save or Start; no trade is created here.</p>
      </div>
    </div>
  );
}

function HistoryCard({ s, selectable, selected, onToggleSelect }) {
  const [open, setOpen] = React.useState(false);
  const win = (s.final_pnl_usd ?? 0) >= 0;
  return (
    <Card className={`border-0 bg-slate-900/60 p-4 ring-1 transition-colors ${selected ? 'ring-sky-500/60' : 'ring-slate-800'}`}>
      <div className="flex items-center gap-3">
        {selectable && (
          <button onClick={() => onToggleSelect(s.id)}
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${selected ? 'border-sky-400 bg-sky-500/25' : 'border-slate-600'}`}>
            {selected && <Check className="h-3 w-3 text-sky-300" />}
          </button>
        )}
        <button onClick={() => setOpen((v) => !v)} className="flex flex-1 items-center gap-3 text-left">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${win ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
            {win ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-bold text-slate-100">{s.title}</p>
            <p className="text-[11px] text-slate-500 capitalize">{s.position} · {s.perf?.days_active}d · closed {s.close_reason?.replace('_', ' ')}</p>
          </div>
          <div className="text-right">
            <p className={`text-lg font-black leading-tight ${pnlColor(s.final_pnl_pct)}`}>{s.final_pnl_pct > 0 ? '+' : ''}{s.final_pnl_pct}%</p>
            <p className={`text-[11px] font-semibold ${pnlColor(s.final_pnl_usd)}`}>{s.final_pnl_usd > 0 ? '+' : ''}{fmtUsd(s.final_pnl_usd)}</p>
          </div>
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-3 border-t border-slate-800 pt-3">
          <p className="text-[13px] leading-relaxed text-slate-300">{s.thesis}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Plan</p>
              <div className="space-y-1.5">{(s.targets || []).map((t, i) => <TargetRow key={i} t={t} position={s.position} />)}</div>
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">What happened</p>
              <EventTimeline events={s.events} />
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function CompareCol({ s }) {
  const win = (s.final_pnl_usd ?? 0) >= 0;
  const targetsHit = (s.targets || []).filter((t) => t.hit).length;
  const rows = [
    ['Outcome', <span key="o" className={`font-bold ${win ? 'text-emerald-400' : 'text-red-400'}`}>{win ? 'WIN' : 'LOSS'}</span>],
    ['Final P&L', <span key="p" className={`font-black ${pnlColor(s.final_pnl_pct)}`}>{s.final_pnl_pct > 0 ? '+' : ''}{s.final_pnl_pct}% ({s.final_pnl_usd > 0 ? '+' : ''}{fmtUsd(s.final_pnl_usd)})</span>],
    ['Bias / Position', <span key="b" className="capitalize text-slate-200">{s.bias} · {s.position}</span>],
    ['Entry → Close', <span key="e" className="text-slate-200">{fmtUsd(s.entry_price)} → {fmtUsd(s.close_price)}</span>],
    ['Duration', <span key="d" className="text-slate-200">{s.perf?.days_active}d of {s.horizon_days}d</span>],
    ['Targets hit', <span key="t" className="text-slate-200">{targetsHit}/{(s.targets || []).length}</span>],
    ['Stop', <span key="s" className="text-slate-200">{s.stop ? (s.stop.hit ? 'Hit' : 'Held') : '—'}</span>],
    ['Closed by', <span key="c" className="capitalize text-slate-200">{(s.close_reason || '').replace('_', ' ')}</span>],
    ['Rules fired', <span key="r" className="text-slate-200">{(s.rules || []).filter((r) => r.status === 'fired').length}/{(s.rules || []).length}</span>],
  ];
  return (
    <div className="flex-1 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
      <p className="truncate text-[14px] font-bold text-white">{s.title}</p>
      <p className="mb-2 text-[11px] text-slate-500">{(() => { try { return new Date(s.created_at + 'Z').toLocaleDateString(); } catch { return ''; } })()}</p>
      <div className="space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-2 border-b border-slate-800/60 pb-1 text-[12px]">
            <span className="text-slate-500">{k}</span><span className="text-right">{v}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 line-clamp-4 text-[11px] leading-snug text-slate-400">{s.thesis}</p>
    </div>
  );
}

function CompareModal({ a, b, onClose }) {
  const aWins = (a.final_pnl_pct ?? 0) >= (b.final_pnl_pct ?? 0);
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-3 top-3 rounded-full bg-black/40 p-1.5 text-slate-300 hover:text-white"><X className="h-4 w-4" /></button>
        <h2 className="mb-1 flex items-center gap-2 text-base font-black text-white"><Scale className="h-4 w-4 text-sky-400" />Compare strategies</h2>
        <p className="mb-4 text-[12px] text-slate-400">
          <span className={aWins ? 'font-bold text-emerald-300' : 'font-bold text-emerald-300'}>{(aWins ? a : b).title}</span> was the stronger play by P&L.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <CompareCol s={a} />
          <CompareCol s={b} />
        </div>
      </div>
    </div>
  );
}

const GUARDRAILS = [
  ['Macro & liquidity alignment', 'Anchor every trade to global liquidity & rate expectations — BTC is a high-beta liquidity asset.'],
  ['Core vs tactical capital', 'Keep a never-sold DCA core stack separate from the tactical stack you trade signals with.'],
  ['Leverage containment', 'Spot/paper only — cap leverage at 0 (or 1–2x if hedging). Albert never uses leverage.'],
  ['Structural invalidation stop', 'Every setup has an objective invalidation (below the slow ribbon / swing). Cut instantly, no mental stops.'],
  ['Sector rotation & narrative', 'Favour coins in sectors seeing real on-chain volume / inflows, not stagnant large-caps.'],
  ['BTC relative strength', 'Only add alts that are outperforming BTC — enforced by the Alert Engine filter.'],
  ['Liquidity tiering (A vs B)', 'Tier-A anchors (ETH/SOL/BNB) get normal size; thinner Tier-B (rank 11–20) get tighter stops & smaller size.'],
  ['Altcoin-season filter', 'Prefer alt entries when breadth is rotating out of BTC dominance, not during "BTC season".'],
  ['Token-unlock awareness', 'Avoid longs into a large supply unlock in the next 1–2 weeks.'],
  ['Staking yield note', 'For PoS holds (ETH/SOL/L1s), factor native staking yield into multi-week theses.'],
  ['Alert perishability', 'Setups expire after a set number of daily closes — no chasing stale signals.'],
  ['Correlation / concentration cap', 'Limit simultaneous correlated alt-longs so you are not one big leveraged bet.'],
  ['Friction included', 'Fees + slippage are baked into backtest risk-reward so paper edges are realistic.'],
  ['Capital allocation ceiling', 'Keep total crypto to a fixed % of net worth (e.g. 5–15%) — a personal off-app rule.'],
  ['Zero-emotional override', 'No impulsive manual changes for ~30 min after a shock — let the system work.'],
  ['Mandatory journaling', 'Log every close (chart, thesis, emotion) so outcomes become data.'],
  ['Custody & key rotation', 'Long-term stacks in multi-sig cold storage; nothing sitting long-term on exchanges.'],
];

function GuardrailsCard() {
  const [open, setOpen] = React.useState(false);
  return (
    <Card className="border-0 bg-slate-900/60 p-4 ring-1 ring-slate-800">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-left">
        <ShieldAlert className="h-4 w-4 text-amber-400" />
        <h3 className="text-sm font-bold text-white">Discipline guardrails</h3>
        <span className="text-[11px] text-slate-500">the rulebook Albert holds every strategy to</span>
        <span className="ml-auto text-[11px] text-sky-300">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {GUARDRAILS.map(([t, d]) => (
            <div key={t} className="rounded-lg border border-slate-800 bg-slate-900/40 p-2.5">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-100"><Check className="h-3 w-3 text-emerald-400" />{t}</p>
              <p className="text-[11px] leading-snug text-slate-400">{d}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function BasketCompareCol({ b }) {
  const perf = (b && b.perf) || {};
  const up = (perf.total_pnl_pct || 0) >= 0;
  return (
    <div className="flex-1 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <h4 className="truncate text-sm font-bold text-white">{b.title}</h4>
      <div className={`my-1 text-xl font-black ${up ? 'text-emerald-400' : 'text-red-400'}`}>{up ? '+' : ''}{(perf.total_pnl_pct || 0).toFixed(2)}%</div>
      <div className="text-[10px] text-slate-500">{(perf.legs || []).length} legs · {b.horizon_days}d</div>
      <div className="mt-2 space-y-1">
        {(perf.legs || []).map((l) => (
          <div key={l.symbol} className="flex items-center justify-between text-[11px]">
            <span className="text-slate-300">{l.symbol} <span className={l.position === 'long' ? 'text-emerald-500' : 'text-red-500'}>{l.position === 'long' ? 'L' : 'S'}</span> <span className="text-slate-600">{Math.round(l.weight_pct)}%</span></span>
            <span className={(l.pnl_pct || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>{(l.pnl_pct || 0) >= 0 ? '+' : ''}{(l.pnl_pct || 0).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BasketCompare({ baskets }) {
  const [aId, setAId] = React.useState(baskets[0]?.id);
  const [bId, setBId] = React.useState(baskets[1]?.id);
  const a = baskets.find((x) => x.id === aId) || baskets[0];
  const b = baskets.find((x) => x.id === bId) || baskets[1];
  const sel = 'rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs text-slate-200 focus:border-violet-500/50 focus:outline-none';
  return (
    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-300"><Scale className="h-3.5 w-3.5 text-violet-300" />Compare strategies</div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={aId} onChange={(e) => setAId(e.target.value)} className={sel}>{baskets.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select>
        <span className="text-slate-600">vs</span>
        <select value={bId} onChange={(e) => setBId(e.target.value)} className={sel}>{baskets.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select>
      </div>
      <div className="flex gap-3">{a && <BasketCompareCol b={a} />}{b && a?.id !== b?.id && <BasketCompareCol b={b} />}</div>
    </div>
  );
}

// ---- Multi-coin BASKET strategies (Albert-drafted, weighted, long/short) ----
function BasketLegPnl({ pct }) {
  const up = (pct || 0) >= 0;
  return <span className={up ? 'text-emerald-400' : 'text-red-400'}>{up ? '+' : ''}{(pct || 0).toFixed(2)}%</span>;
}

function BasketCard({ b, onClose, closing, onReload }) {
  const perf = b.perf || {};
  const up = (perf.total_pnl_pct || 0) >= 0;
  const [sug, setSug] = React.useState(null);
  const [rebBusy, setRebBusy] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const rebalance = async () => {
    setRebBusy(true); setSug(null);
    try {
      const r = await fetch(`${API_BASE}/v1/albert/strategy/basket/${b.id}/rebalance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const d = await r.json();
      if (d.status === 'ready') setSug(d);
    } catch (e) { /* noop */ } finally { setRebBusy(false); }
  };
  const applyReweight = async () => {
    if (!sug) return;
    setApplying(true);
    try {
      const weights = {};
      (sug.legs || []).forEach((l) => { weights[l.symbol] = l.suggested_weight; });
      await fetch(`${API_BASE}/v1/albert/strategy/basket/${b.id}/reweight`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weights }) });
      setSug(null); onReload && onReload();
    } catch (e) { /* noop */ } finally { setApplying(false); }
  };
  return (
    <Card className="border-0 bg-slate-900/60 p-4 ring-1 ring-slate-800">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate font-bold text-white">{b.title}</h4>
          {b.thesis ? <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{b.thesis}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-lg font-black ${up ? 'text-emerald-400' : 'text-red-400'}`}>{up ? '+' : ''}{(perf.total_pnl_pct || 0).toFixed(2)}%</div>
          <div className="text-[10px] text-slate-500">weighted P&amp;L</div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-xs">
          <thead className="bg-slate-950/50 text-slate-500">
            <tr><th className="px-2 py-1 text-left">Coin</th><th className="px-2 py-1 text-left">Side</th><th className="px-2 py-1 text-right">Wt</th><th className="px-2 py-1 text-right">Entry</th><th className="px-2 py-1 text-right">Now</th><th className="px-2 py-1 text-right">P&amp;L</th></tr>
          </thead>
          <tbody>
            {(perf.legs || []).map((l) => (
              <tr key={l.symbol} className="border-t border-slate-800/70">
                <td className="px-2 py-1 font-semibold text-slate-200">{l.symbol}</td>
                <td className="px-2 py-1">{l.position === 'long' ? <span className="text-emerald-400">Long</span> : <span className="text-red-400">Short</span>}</td>
                <td className="px-2 py-1 text-right text-slate-400">{Math.round(l.weight_pct)}%</td>
                <td className="px-2 py-1 text-right text-slate-400">{fmtUsd(l.entry_price)}</td>
                <td className="px-2 py-1 text-right text-slate-300">{fmtUsd(l.current_price)}</td>
                <td className="px-2 py-1 text-right font-semibold"><BasketLegPnl pct={l.pnl_pct} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(b.rotation && b.rotation.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Rotation</span>
          {b.rotation.map((r) => {
            const has = r.strength !== null && r.strength !== undefined;
            const cls = r.hot
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              : has ? 'border-red-500/40 bg-red-500/10 text-red-300'
                : 'border-slate-700 bg-slate-800/60 text-slate-400';
            return (
              <span key={r.sector} title={`${(r.symbols || []).join(', ')} · ${r.sector} 7d strength vs BTC`}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
                {r.hot ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {r.sector}{has ? ` ${r.strength > 0 ? '+' : ''}${r.strength}%` : ''}
              </span>
            );
          })}
        </div>
      )}
      {sug && (
        <div className="mt-3 rounded-lg border border-violet-500/30 bg-violet-500/[0.06] p-3">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-violet-300"><Scale className="h-3.5 w-3.5" />Albert's rebalance</div>
          <p className="mb-2 text-xs text-slate-300">{sug.rationale}</p>
          <div className="space-y-1">
            {(sug.legs || []).map((l) => {
              const diff = (l.suggested_weight || 0) - (l.current_weight || 0);
              return (
                <div key={l.symbol} className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-200">{l.symbol}</span>
                  <span className="text-slate-400">{Math.round(l.current_weight)}% <ArrowRight className="inline h-3 w-3 text-slate-600" /> <span className="font-semibold text-slate-100">{Math.round(l.suggested_weight)}%</span> <span className={diff >= 0 ? 'text-emerald-400' : 'text-red-400'}>({diff >= 0 ? '+' : ''}{Math.round(diff)})</span></span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button onClick={() => setSug(null)} variant="outline" className="h-7 border-slate-700 bg-transparent text-[11px] text-slate-400 hover:bg-slate-800">Dismiss</Button>
            <Button onClick={applyReweight} disabled={applying} className="h-7 bg-violet-600 text-[11px] text-white hover:bg-violet-500">{applying ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}Apply weights</Button>
          </div>
        </div>
      )}
      {b.status === 'active' && (
        <div className="mt-3 flex justify-end gap-2">
          <Button onClick={rebalance} disabled={rebBusy} variant="outline" className="h-8 border-violet-500/40 bg-transparent text-xs text-violet-300 hover:bg-violet-500/10">
            {rebBusy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Scale className="mr-1 h-3 w-3" />}Rebalance
          </Button>
          <Button onClick={() => onClose(b.id)} disabled={closing} variant="outline" className="h-8 border-slate-700 bg-transparent text-xs text-slate-300 hover:bg-slate-800">
            {closing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <X className="mr-1 h-3 w-3" />}Close strategy
          </Button>
        </div>
      )}
    </Card>
  );
}

function BasketDigestPanel({ refreshKey }) {
  const [dig, setDig] = React.useState(null);
  React.useEffect(() => {
    fetch(`${API_BASE}/v1/albert/basket-digest?pid=${encodeURIComponent(getPid())}&hours=24`, { cache: 'no-store' })
      .then((r) => r.json()).then(setDig).catch(() => {});
  }, [refreshKey]);
  if (!dig || dig.status !== 'ready') return null;
  const n = dig.total_hits || 0;
  return (
    <div className="mt-4 rounded-xl border border-sky-500/25 bg-sky-500/[0.05] p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-sky-300">
        <Bell className="h-3.5 w-3.5" />Strategy digest · last 24h
        {n > 0 && <span className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-300">{n}</span>}
      </div>
      {n === 0 ? (
        <p className="text-[11px] text-slate-400">No strategy legs hit a target or stop in the last 24 hours.</p>
      ) : (
        <div className="space-y-1.5">
          {(dig.baskets || []).map((b) => (
            <div key={b.id} className="text-[11px]">
              <span className="font-semibold text-slate-200">{b.title}</span>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {b.hits.map((h, i) => (
                  <span key={i} className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 ${h.kind === 'target' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-red-500/40 bg-red-500/10 text-red-300'}`}>
                    {h.symbol} {h.side} · {h.kind === 'target' ? (h.label || 'target') : 'stop'} {fmtUsd(h.price)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BasketSection() {
  const [data, setData] = React.useState(null);
  const [goal, setGoal] = React.useState('');
  const [building, setBuilding] = React.useState(false);
  const [draft, setDraft] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [closing, setClosing] = React.useState('');
  const load = React.useCallback(() => {
    fetch(`${API_BASE}/v1/albert/strategy/baskets?pid=${encodeURIComponent(getPid())}`, { cache: 'no-store' })
      .then((r) => r.json()).then(setData).catch(() => {});
  }, []);
  React.useEffect(() => { load(); }, [load]);
  const build = () => {
    setDraft(null);
    window.dispatchEvent(new CustomEvent('albert:build-strategy', {
      detail: { seed: goal || 'Draft a multi-coin paper strategy using canonical BUY/SELL decisions.' },
    }));
  };
  const save = () => {
    if (!draft) return;
    const plan = [draft.title || 'Multi-coin plan', draft.thesis || '',
      ...(draft.legs || []).map((l) => `${l.symbol} ${l.weight_pct}% ${l.position || 'long'}.`),
      `Original complete basket draft: ${JSON.stringify(draft)}`].join('\n');
    window.dispatchEvent(new CustomEvent('albert:build-strategy', { detail: { seed: plan } }));
    setDraft(null);
  };
  const closeBasket = async (id) => {
    setClosing(id);
    try {
      await fetch(`${API_BASE}/v1/albert/strategy/basket/${id}/close`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      load();
    } catch (e) { /* noop */ } finally { setClosing(''); }
  };
  const active = (data && data.active) || [];
  const history = (data && data.history) || [];
  return (
    <Card className="border-0 bg-gradient-to-br from-violet-500/[0.07] to-slate-900 p-5 ring-1 ring-violet-500/25">
      <div className="mb-3 flex items-center gap-2">
        <Scale className="h-5 w-5 text-violet-300" />
        <h3 className="text-base font-bold text-white">Multi-Coin Strategies</h3>
        <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-300">NEW</span>
      </div>
      <p className="mb-3 text-xs text-slate-400">Tell Albert a theme and he&apos;ll build a weighted multi-coin strategy (long &amp; short legs) you can save and track as one — a portfolio-style play alongside your single-coin strategies below.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. long the majors, small short on a laggard (optional)"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-violet-500/50 focus:outline-none" />
        <Button onClick={build} disabled={building} className="bg-violet-600 text-white hover:bg-violet-500">
          {building ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}{building ? 'Albert is building…' : 'Build a strategy'}
        </Button>
      </div>
      {draft && (
        <div className="mt-4 rounded-xl border border-violet-500/30 bg-slate-950/50 p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0"><h4 className="truncate font-bold text-white">{draft.title}</h4><p className="text-[11px] text-slate-500">Draft · {draft.horizon_days}-day horizon · {(draft.legs || []).length} legs</p></div>
            <button onClick={() => setDraft(null)} className="text-slate-500 hover:text-slate-300"><X className="h-4 w-4" /></button>
          </div>
          {draft.thesis ? <p className="mb-3 text-xs text-slate-400">{draft.thesis}</p> : null}
          <div className="space-y-1.5">
            {(draft.legs || []).map((l) => (
              <div key={l.symbol} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-200">{l.symbol}</span>
                  {l.position === 'long' ? <span className="flex items-center gap-0.5 text-emerald-400"><TrendingUp className="h-3 w-3" />Long</span> : <span className="flex items-center gap-0.5 text-red-400"><TrendingDown className="h-3 w-3" />Short</span>}
                  <span className="text-slate-500">{Math.round(l.weight_pct)}%</span>
                </div>
                <div className="text-slate-500">entry {fmtUsd(l.entry_price)}{l.stop ? ` · stop ${fmtUsd(l.stop.price)}` : ''}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button onClick={build} disabled={building || saving} variant="outline" className="h-8 border-slate-700 bg-transparent text-xs text-slate-300 hover:bg-slate-800"><RefreshCw className="mr-1 h-3 w-3" />Regenerate</Button>
            <Button onClick={save} disabled={saving} className="h-8 bg-emerald-600 text-xs text-white hover:bg-emerald-500">{saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}Save &amp; track</Button>
          </div>
        </div>
      )}
      <BasketDigestPanel refreshKey={active.length} />
      {active.length >= 2 && <BasketCompare baskets={active} />}
      {active.length > 0 && <div className="mt-4 space-y-3">{active.map((b) => (
        <div key={b.id} id={`strategy-${b.id}`} className={focusId === b.id ? 'rounded-2xl ring-2 ring-sky-400/70 ring-offset-2 ring-offset-slate-950 transition' : 'transition'}>
          <BasketCard b={b} onClose={closeBasket} closing={closing === b.id} onReload={load} />
        </div>
      ))}</div>}
      {history.length > 0 && (
        <details className="mt-4"><summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300">Past strategies ({history.length})</summary>
          <div className="mt-2 space-y-3">{history.map((b) => <BasketCard key={b.id} b={b} onClose={closeBasket} closing={false} />)}</div>
        </details>
      )}
    </Card>
  );
}


export default function StrategiesSection() {
  const symbol = React.useContext(SymbolContext);
  const [data, setData] = React.useState(null);   // {active, history, stats}
  const [loading, setLoading] = React.useState(true);
  const [goal, setGoal] = React.useState('');
  const [building, setBuilding] = React.useState(false);
  const [draft, setDraft] = React.useState(null);
  const [closing, setClosing] = React.useState(false);
  const [compareMode, setCompareMode] = React.useState(false);
  const [selected, setSelected] = React.useState([]);
  const [compareOpen, setCompareOpen] = React.useState(false);

  const toggleSelect = (id) => setSelected((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : (cur.length >= 2 ? [cur[1], id] : [...cur, id]));

  const load = React.useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/v1/albert/strategies?symbol=${encodeURIComponent(symbol)}&pid=${encodeURIComponent(getPid())}`, { cache: 'no-store' });
      const j = await r.json();
      setData(j);
    } catch (e) { /* noop */ } finally { setLoading(false); }
  }, [symbol]);

  React.useEffect(() => { setLoading(true); load(); }, [load]);
  React.useEffect(() => {
    const id = setInterval(load, 30000); // keep P&L / nudges fresh
    return () => clearInterval(id);
  }, [load]);

  // Deep-link: jump straight to a specific strategy (set from the Morning Brief).
  const [focusId, setFocusId] = React.useState(null);
  React.useEffect(() => {
    const apply = (fid) => { if (fid) setFocusId(fid); };
    try { apply(window.__albertFocusStrategy); window.__albertFocusStrategy = null; } catch (e) { /* noop */ }
    const onFocus = (e) => apply(e && e.detail);
    window.addEventListener('albert:focus-strategy', onFocus);
    return () => window.removeEventListener('albert:focus-strategy', onFocus);
  }, []);
  React.useEffect(() => {
    if (!focusId || !data) return undefined;
    const t = setTimeout(() => {
      const el = document.getElementById(`strategy-${focusId}`);
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 250);
    const clear = setTimeout(() => setFocusId(null), 4000); // remove highlight after a moment
    return () => { clearTimeout(t); clearTimeout(clear); };
  }, [focusId, data]);

  const build = () => {
    window.dispatchEvent(new CustomEvent('albert:build-strategy', {
      detail: { symbol, seed: goal || `Follow Albert's canonical BUY/SELL for ${symbol} at 100% allocation.` },
    }));
  };

  const closeActive = async () => {
    const active = data?.active;
    if (!active) return;
    setClosing(true);
    try {
      await fetch(`${API_BASE}/v1/albert/strategy/${active.id}/close`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'manual' }),
      });
      await load();
    } catch (e) { /* noop */ } finally { setClosing(false); }
  };

  const active = data?.active;
  const history = data?.history || [];
  const stats = data?.stats || {};
  const coinName = active?.coin_name || symbol;

  return (
    <div className="space-y-4">
      <SectionHead icon={Crosshair} title="Trading Strategies"
        blurb="Earlier tracked strategies remain readable here. New paper plans are reviewed and saved in Strategy Studio; this older tracker no longer creates plans or paper entries." />

      <PanelBoundary label="Guardrails"><GuardrailsCard /></PanelBoundary>

      <PanelBoundary label="Command Centre"><AlbertPlan /></PanelBoundary>

      <PanelBoundary label="Discovery"><DiscoveryFeed /></PanelBoundary>

      <PanelBoundary label="Baskets"><BasketSection /></PanelBoundary>

      <PanelBoundary label="Single-Coin Strategies">
      <div className="flex items-center gap-2 pt-1">
        <Crosshair className="h-4 w-4 text-sky-300" />
        <h3 className="text-base font-bold text-white">Single-Coin Strategies</h3>
      </div>

      {loading && !data ? (
        <Card className="border-0 bg-slate-900 p-8 text-center ring-1 ring-slate-800"><Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-500" /></Card>
      ) : active ? (
        <Card className="border-0 bg-gradient-to-br from-sky-500/[0.07] via-violet-500/[0.05] to-slate-900 p-5 ring-1 ring-sky-500/25">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <img src="/albert.png" alt="Albert" className="h-10 w-10 rounded-full object-cover ring-2 ring-sky-500/40" />
            <div className="min-w-0">
              <h3 className="truncate text-lg font-black text-white">{active.title}</h3>
              <p className="text-[11px] text-slate-400">Active {coinName} strategy · Albert is tracking it</p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold capitalize ${biasBadge(active.bias)}`}>{active.bias}</span>
              <span className="rounded-full border border-slate-600 bg-slate-800/60 px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-300">{active.position}</span>
              <Button onClick={closeActive} disabled={closing} variant="outline" size="sm" className="h-7 gap-1 border-red-500/40 text-red-300 hover:bg-red-500/10">
                {closing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}Close
              </Button>
            </div>
          </div>

          <PerfHeadline perf={active.perf} position={active.position} />

          <p className="mt-4 text-[13px] leading-relaxed text-slate-300">{active.thesis}</p>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">Exit plan</p>
              <div className="space-y-1.5">
                {(active.targets || []).map((t, i) => <TargetRow key={i} t={t} position={active.position} />)}
                {active.stop && (
                  <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${active.stop.hit ? 'border-red-500/50 bg-red-500/10' : 'border-red-500/30 bg-red-500/5'}`}>
                    <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
                    <span className="text-[13px] font-semibold text-slate-100">Stop</span>
                    <span className="text-[13px] font-bold text-red-300">{fmtUsd(active.stop.price)}</span>
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${active.stop.hit ? 'bg-red-500/20 text-red-300' : 'bg-slate-800 text-slate-500'}`}>{active.stop.hit ? 'HIT' : 'ARMED'}</span>
                  </div>
                )}
              </div>
              <p className="mb-1.5 mt-4 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500"><Bell className="h-3 w-3" />Nudge rules</p>
              <div className="space-y-1.5">{(active.rules || []).map((r, i) => <RuleRow key={i} r={r} />)}</div>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">Albert&apos;s log</p>
              <EventTimeline events={active.events} />
            </div>
          </div>
        </Card>
      ) : (
        <Card className="border-0 bg-gradient-to-br from-sky-500/[0.07] to-slate-900 p-6 ring-1 ring-sky-500/25">
          <div className="flex items-center gap-3">
            <img src="/albert.png" alt="Albert" className="h-11 w-11 rounded-full object-cover ring-2 ring-sky-500/40" />
            <div>
              <h3 className="text-lg font-black text-white">Let Albert build you a {coinName} strategy</h3>
              <p className="text-[13px] text-slate-400">He&apos;ll draft a full plan from the live dashboard — then track it and nudge you.</p>
            </div>
          </div>
          {data?.just_closed && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-[12px] text-slate-300">
              <Check className="h-4 w-4 text-emerald-400" />Your last strategy just closed at <span className={`font-bold ${pnlColor(data.just_closed.final_pnl_pct)}`}>{data.just_closed.final_pnl_pct > 0 ? '+' : ''}{data.just_closed.final_pnl_pct}%</span> — see it in history below.
            </div>
          )}
          <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2}
            placeholder={`Optional: describe your goal — e.g. "medium-risk swing long over a month", "fade the pump", "accumulate on dips"…`}
            className="mt-4 w-full resize-none rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500/50 focus:outline-none" />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={build} disabled={building} className="gap-1.5 bg-gradient-to-r from-sky-500 to-violet-500 hover:opacity-90">
              {building ? <><Loader2 className="h-4 w-4 animate-spin" />Albert is drafting…</> : <><Sparkles className="h-4 w-4" />Build me a strategy</>}
            </Button>
            {['Swing long over a month', 'Fade the pump (short)', 'Accumulate on dips'].map((g) => (
              <button key={g} onClick={() => setGoal(g)} className="rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-300 hover:border-sky-500/40 hover:text-sky-300">{g}</button>
            ))}
          </div>
        </Card>
      )}

      {/* History */}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <History className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-bold text-white">Past {coinName} strategies</h3>
          {history.length >= 2 && (
            <button onClick={() => { setCompareMode((v) => !v); setSelected([]); }}
              className={`ml-1 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${compareMode ? 'border-sky-500/60 bg-sky-500/15 text-sky-200' : 'border-slate-700 text-slate-300 hover:text-white'}`}>
              <Scale className="h-3 w-3" />{compareMode ? 'Cancel compare' : 'Compare'}
            </button>
          )}
          {stats.total > 0 && (
            <div className="ml-auto flex items-center gap-2 text-[11px]">
              <span className="flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-slate-300"><Trophy className="h-3 w-3 text-amber-400" />{stats.win_rate}% win rate</span>
              <span className="rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-slate-300">{stats.wins}W · {stats.losses}L</span>
              {stats.avg_pnl_pct != null && <span className={`rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5 font-semibold ${pnlColor(stats.avg_pnl_pct)}`}>avg {stats.avg_pnl_pct > 0 ? '+' : ''}{stats.avg_pnl_pct}%</span>}
            </div>
          )}
        </div>
        {compareMode && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-[12px] text-sky-200">
            <span>Pick two to compare — {selected.length}/2 selected.</span>
            <Button size="sm" disabled={selected.length !== 2} onClick={() => setCompareOpen(true)}
              className="ml-auto h-7 gap-1 bg-sky-500 text-white hover:bg-sky-400 disabled:opacity-40">
              <Scale className="h-3.5 w-3.5" />Compare
            </Button>
          </div>
        )}
        {history.length ? (
          <div className="space-y-2">{history.map((s) => (
            <HistoryCard key={s.id} s={s} selectable={compareMode} selected={selected.includes(s.id)} onToggleSelect={toggleSelect} />
          ))}</div>
        ) : (
          <Card className="border-0 bg-slate-900/40 p-6 text-center ring-1 ring-slate-800">
            <p className="text-sm text-slate-500">No past strategies for {coinName} yet. Build one above and Albert will start keeping score.</p>
          </Card>
        )}
      </div>

      {compareOpen && selected.length === 2 && (
        <CompareModal
          a={history.find((h) => h.id === selected[0])}
          b={history.find((h) => h.id === selected[1])}
          onClose={() => setCompareOpen(false)} />
      )}

      {draft && (
        <DraftModal draft={draft} symbol={symbol} regenerating={building}
          onClose={() => setDraft(null)}
          onRegenerate={build}
          onActivated={(s) => { setDraft(null); setGoal(''); load(); }} />
      )}
      </PanelBoundary>
    </div>
  );
}
