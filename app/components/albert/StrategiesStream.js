'use client';

import React from 'react';
import {
  Wallet, ArrowRight, ChevronRight, AlertTriangle, CheckCircle2, PauseCircle,
  PlayCircle, Crosshair, Gauge, Lock,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { money, signedPct, timeAgo, EvidenceButton, Limitations } from './common';

const MODE = {
  AUTOPILOT: { label: 'Autopilot', cls: 'text-violet-300 ring-violet-500/30' },
  PAPER_AUTOPILOT: { label: 'Autopilot', cls: 'text-violet-300 ring-violet-500/30' },
  OBSERVE: { label: 'Observe', cls: 'text-slate-300 ring-slate-500/30' },
};

function StrategyRow({ s, onNav }) {
  const live = !!s.isLive;
  const mode = MODE[s.approvalMode] || null;
  const pnl = s.pnlUsd !== undefined && s.pnlUsd !== null ? Number(s.pnlUsd) : null;
  return (
    <button type="button" onClick={() => onNav && onNav('strategies')}
      className={`w-full rounded-xl border p-3 text-left transition-colors ${live ? 'border-slate-700 bg-slate-950/60 hover:border-violet-500/50' : 'border-slate-800 bg-slate-950/40 hover:border-slate-600'}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="truncate text-[13px] font-bold text-white">{s.name}</span>
        <Badge variant="outline" className="shrink-0 border-slate-700 text-[10px] text-slate-300">
          v{s.version}
        </Badge>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${live ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
          {s.paperStatusLabel || (live ? 'Paper trading' : 'Saved')}
        </span>
        {mode ? (
          <span className={`shrink-0 rounded-full bg-slate-950/70 px-2 py-0.5 text-[10px] font-semibold ring-1 ${mode.cls}`}>{mode.label}</span>
        ) : null}
      </div>
      <p className="mt-1 truncate text-[11.5px] text-slate-500">
        {(s.assets || []).join(' · ') || 'Multi-asset'}
      </p>
      {live ? (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div><p className="text-[10px] uppercase tracking-wider text-slate-500">Wallet</p>
            <p className="text-[12.5px] font-bold text-white">{s.valueAvailable ? money(s.value) : 'valuation unavailable'}</p></div>
          <div><p className="text-[10px] uppercase tracking-wider text-slate-500">Net result</p>
            <p className={`text-[12.5px] font-bold ${pnl === null ? 'text-slate-400' : pnl >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
              {pnl === null ? '—' : `${money(pnl)} (${signedPct(s.pnlPct)})`}
            </p></div>
          <div><p className="text-[10px] uppercase tracking-wider text-slate-500">Open</p>
            <p className="text-[12.5px] font-bold text-white">{s.openPositions ?? 0}</p></div>
          <div><p className="text-[10px] uppercase tracking-wider text-slate-500">Awaiting you</p>
            <p className={`text-[12.5px] font-bold ${s.pendingApprovals ? 'text-amber-300' : 'text-white'}`}>{s.pendingApprovals ?? 0}</p></div>
        </div>
      ) : (
        <p className="mt-1.5 text-[12px] text-slate-400">
          Saved and not trading. It gets its own ring-fenced wallet the moment you start it.
        </p>
      )}
      {live ? (
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          {s.pauseReason ? (
            <span className="flex items-center gap-1 text-amber-300"><PauseCircle className="h-3.5 w-3.5" />{s.pauseReason}</span>
          ) : (
            <span className="flex items-center gap-1 text-emerald-400"><PlayCircle className="h-3.5 w-3.5" />Running</span>
          )}
          {s.marketData && s.marketData !== 'CURRENT' ? (
            <span className="text-amber-300">marks {String(s.marketData).toLowerCase()}</span>
          ) : null}
          {s.lastActivity ? <span className="truncate">{s.lastActivity} · {timeAgo(s.lastActivityAt)}</span> : null}
        </p>
      ) : null}
    </button>
  );
}

function Needs({ items, onNav, onEvidence }) {
  if (!items || !items.length) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-white">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />Nothing needs your decision
        </p>
        <p className="mt-0.5 text-[12px] text-slate-400">
          Albert will raise something the instant it is genuinely actionable.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((it) => {
        const action = it.severity === 'ACTION';
        return (
          <div key={it.id}
            className={`rounded-xl border p-3 ${action ? 'border-amber-500/40 bg-amber-500/[0.06]' : 'border-red-500/35 bg-red-500/[0.05]'}`}>
            <p className="flex items-start gap-2 text-[13px] font-semibold text-white">
              <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${action ? 'text-amber-400' : 'text-red-400'}`} />
              {it.title}
            </p>
            {it.expiresAt ? (
              <p className="mt-0.5 pl-6 text-[11px] text-slate-400">
                Expires {timeAgo(it.expiresAt) || 'soon'} · re-checked freshly on approval
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
              <Button size="sm" onClick={() => onNav && onNav('paper')}
                className="h-7 gap-1 bg-slate-100 px-2.5 text-[12px] font-semibold text-slate-900 hover:bg-white">
                {it.kind === 'PROPOSAL_APPROVAL' ? 'Review paper trade' : 'Open'}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
              <EvidenceButton snapshotId={it.snapshotId} onEvidence={onEvidence} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Stream 2. There is no "selected paper account" any more: M-G gave every strategy its
 * own ring-fenced wallet, so this is the AGGREGATE across those wallets plus a row per
 * strategy. Money is quoted from the paper engine and never recomputed here.
 */
export default function StrategiesStream({ sop, onNav, onEvidence }) {
  const agg = sop?.paperAggregate;
  const totals = agg?.totals || null;
  const strategies = agg?.strategies || [];
  const attention = (sop?.attention || []).filter((a) => a.severity === 'ACTION' || a.severity === 'WARNING');
  const setup = (sop?.attention || []).filter((a) => a.severity === 'SETUP');
  const portfolioClaim = (sop?.briefing?.claims || []).find((c) => c.claimId === 'briefing.portfolio');
  const pnl = totals && totals.pnlUsd !== null && totals.pnlUsd !== undefined ? Number(totals.pnlUsd) : null;

  return (
    <div className="space-y-3">
      <Card className="border-0 bg-gradient-to-br from-violet-500/[0.07] to-slate-900 p-4 ring-1 ring-violet-500/20">
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-white">
            <Wallet className="h-4 w-4 text-violet-300" />Combined paper wallets
          </h3>
          <EvidenceButton className="ml-auto"
            snapshotId={(portfolioClaim?.evidenceRefs || []).slice(-1)[0]}
            onEvidence={onEvidence} label="Accounting snapshot" />
        </div>
        {totals ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Value</p>
                <p className="text-[15px] font-bold text-white">{totals.valueAvailable ? money(totals.value) : '—'}</p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Net result</p>
                <p className={`text-[15px] font-bold ${pnl === null ? 'text-slate-400' : pnl >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                  {pnl === null ? '—' : money(pnl)}
                </p>
                <p className="text-[10.5px] text-slate-500">{signedPct(totals.pnlPct, 2)} on {money(totals.startingCash)}</p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Wallets trading</p>
                <p className="text-[15px] font-bold text-white">{totals.liveStrategies}<span className="text-[11px] text-slate-500"> / {totals.liveStrategies + totals.savedStrategies}</span></p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-slate-400">
              <span className="flex items-center gap-1"><Gauge className="h-3.5 w-3.5 text-slate-500" />{totals.openPositions} open</span>
              <span>{totals.closedTrades} closed</span>
              <span>fees {money(totals.fees)}</span>
              <span>realised {money(totals.realizedPnl)}</span>
              {totals.winRatePct === null ? <span className="text-slate-500">win rate not yet meaningful</span> : <span>win rate {totals.winRatePct}%</span>}
            </div>
            {agg?.note ? <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{agg.note}</p> : null}
          </>
        ) : (
          <p className="text-[13px] text-slate-400">
            No strategy wallet exists yet. Build a strategy with Albert, save it, then start
            paper trading on it — it gets its own ring-fenced virtual wallet.
          </p>
        )}
      </Card>

      <Card className="border-0 bg-slate-900 p-4 ring-1 ring-slate-800">
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-white">
            <Crosshair className="h-4 w-4 text-violet-400" />Per-strategy results
          </h3>
          <button type="button" onClick={() => onNav && onNav('strategies')}
            className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-sky-400 hover:text-sky-300">
            Open Strategies<ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        {strategies.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-4 text-center">
            <p className="text-[13px] text-slate-400">
              You haven’t built a strategy yet. Describe your objective and Albert will draft one with you.
            </p>
            <Button size="sm" onClick={() => onNav && onNav('strategies')}
              className="mt-3 gap-1.5 bg-violet-600 hover:bg-violet-500">
              Build a strategy<ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {strategies.map((s) => <StrategyRow key={s.strategyId} s={s} onNav={onNav} />)}
          </div>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          Attribution is by the strategy’s own wallet, ledger and lots — never by splitting a
          shared P&amp;L across current weights. Forward paper results and backtests are kept
          in separate blocks and never merged.
        </p>
      </Card>

      <Card className="border-0 bg-slate-900 p-4 ring-1 ring-slate-800">
        <h3 className="mb-2.5 flex items-center gap-2 text-sm font-bold text-white">
          <AlertTriangle className="h-4 w-4 text-amber-400" />Needs your decision
        </h3>
        <Needs items={attention} onNav={onNav} onEvidence={onEvidence} />
        {setup.length ? (
          <div className="mt-2 space-y-1.5">
            {setup.map((s) => (
              <button type="button" key={s.id} onClick={() => onNav && onNav('settings')}
                className="flex w-full items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-2.5 text-left hover:border-slate-600">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                <span className="text-[12.5px] text-slate-300">{s.title}</span>
              </button>
            ))}
          </div>
        ) : null}
        <Limitations className="mt-2" items={[
          'Paper trading only — no real order is ever placed, and Albert cannot approve a trade on your behalf.',
        ]} />
      </Card>
    </div>
  );
}
