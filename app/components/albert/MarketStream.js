'use client';

import React, { useState } from 'react';
import {
  Activity, Users, BarChart3, Layers, ChevronDown, TrendingUp, TrendingDown,
  Minus, Crown, AlertTriangle, Loader2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
  EvidenceButton, KnowledgeBadge, StatusBadge, Limitations, ratioPct, money,
} from './common';

const REGIME = {
  BULL: { label: 'Bullish', cls: 'text-emerald-300', icon: TrendingUp },
  BEAR: { label: 'Bearish', cls: 'text-red-300', icon: TrendingDown },
  RANGE: { label: 'Range-bound', cls: 'text-amber-300', icon: Minus },
  UNKNOWN: { label: 'Uncertain', cls: 'text-slate-400', icon: Minus },
};

const LEADERSHIP = {
  ALTCOIN_LED: { label: 'Altcoin-led', cls: 'text-fuchsia-300 ring-fuchsia-500/40' },
  BTC_LED: { label: 'Bitcoin-led', cls: 'text-amber-300 ring-amber-500/40' },
  MIXED: { label: 'Mixed', cls: 'text-slate-300 ring-slate-600/50' },
  UNKNOWN: { label: 'Not readable', cls: 'text-slate-400 ring-slate-700' },
};

/* ------------------- market leadership (read-only) ------------------- */
function Leadership({ ph, direction, onEvidence }) {
  const [open, setOpen] = useState(false);
  const l = LEADERSHIP[ph?.phase] || LEADERSHIP.UNKNOWN;
  const r = REGIME[direction?.regime] || REGIME.UNKNOWN;
  const RIcon = r.icon;
  return (
    <Card className="border-0 bg-slate-900 p-4 ring-1 ring-slate-800">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <Activity className="h-3.5 w-3.5" />Direction &amp; trend
          </p>
          <p className={`mt-1 flex items-center gap-1.5 text-lg font-bold ${r.cls}`}>
            <RIcon className="h-4 w-4" />{r.label}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge status={direction?.status} />
            <KnowledgeBadge kind="SYSTEM_ASSESSMENT" />
            <EvidenceButton snapshotId={direction?.snapshotId} onEvidence={onEvidence} />
          </div>
        </div>
        <div className="min-w-0 sm:border-l sm:border-slate-800 sm:pl-3">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <Crown className="h-3.5 w-3.5" />Market leadership assessment
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`rounded-full bg-slate-950/70 px-2.5 py-0.5 text-[13px] font-bold ring-1 ${l.cls}`}>
              {l.label}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">observed · read-only</span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge status={ph?.status} />
            <KnowledgeBadge kind="SYSTEM_ASSESSMENT" />
            <EvidenceButton snapshotId={ph?.snapshotId} onEvidence={onEvidence} />
          </div>
        </div>
      </div>
      {ph?.finding ? (
        <p className="mt-2.5 max-w-[95ch] text-[13px] leading-relaxed text-slate-300">{ph.finding}</p>
      ) : null}
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        Leadership is an observation, not a control: there is no season lens to set here, and
        nothing about it changes a strategy or execution eligibility.
      </p>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-slate-200">
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        How this is measured
      </button>
      {open ? (
        <div className="mt-2 space-y-1.5 rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
          {ph?.inputs ? (
            <p className="text-[12px] text-slate-300">
              Breadth {ratioPct(ph.inputs.breadth)} ({ph.inputs.altsBeatingBtc} of{' '}
              {ph.inputs.altsWithReturns} eligible altcoins beat Bitcoin over {ph.window}) ·
              median altcoin {ph.inputs.medianAltReturnPct}% vs Bitcoin {ph.inputs.btcReturnPct}%
              · spread {ph.inputs.spreadPct} points.
            </p>
          ) : null}
          {ph?.invalidation ? <p className="text-[11.5px] text-slate-400">{ph.invalidation}</p> : null}
          <p className="font-mono text-[10.5px] text-slate-500">{ph?.ruleVersion}</p>
          <Limitations items={ph?.limitations} />
          <Limitations items={direction?.limitations} />
        </div>
      ) : null}
    </Card>
  );
}

/* ------------------------- who is moving it ------------------------- */
function Participants({ parts, onEvidence }) {
  const rows = parts?.participants || [];
  return (
    <Card className="border-0 bg-slate-900 p-4 ring-1 ring-slate-800">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white">
          <Users className="h-4 w-4 text-sky-400" />Who is moving the market
        </h3>
        <StatusBadge status={parts?.status}
          note={parts?.cohortsReported !== undefined ? `${parts.cohortsReported}/${parts.cohortsTotal} cohorts` : null} />
      </div>
      <div className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-[13px] text-slate-400">No participant cohort reported a usable reading.</p>
        ) : rows.map((p) => (
          <div key={p.participant} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] font-bold text-white">{p.participant}</span>
              <KnowledgeBadge kind={p.kind} />
              <StatusBadge status={p.status} />
              {p.intent === 'UNKNOWN' ? (
                <span className="rounded-full bg-slate-950/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 ring-1 ring-slate-700">intent unknown</span>
              ) : null}
              <EvidenceButton className="ml-auto" snapshotId={p.snapshotId} onEvidence={onEvidence} />
            </div>
            <p className="mt-1 max-w-[90ch] text-[12.5px] leading-relaxed text-slate-300">
              {p.finding || p.reasonCode || 'No reading available.'}
            </p>
            {p.sourcePeriod ? <p className="mt-0.5 text-[10.5px] text-slate-500">{p.sourcePeriod}</p> : null}
            {p.limitation ? <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{p.limitation}</p> : null}
          </div>
        ))}
      </div>
      <Limitations className="mt-2" items={parts?.limitations} />
    </Card>
  );
}

/* ----------------------- spot turnover shares ----------------------- */
function VolumeShares({ vol, onEvidence }) {
  const windows = ['24h', '7d', '30d'];
  return (
    <Card className="border-0 bg-slate-900 p-4 ring-1 ring-slate-800">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white">
          <BarChart3 className="h-4 w-4 text-emerald-400" />Bitcoin vs everything else · spot turnover
        </h3>
        <StatusBadge status={vol?.status} />
        <EvidenceButton className="ml-auto" snapshotId={vol?.snapshotId} onEvidence={onEvidence} />
      </div>
      <div className="space-y-2.5">
        {windows.map((w) => {
          const d = (vol?.windows || {})[w];
          if (!d) return null;
          const btc = Number(d.btcShare);
          const partial = d.status === 'PARTIAL';
          const usable = !Number.isNaN(btc) && d.btcShare !== null && d.btcShare !== undefined;
          return (
            <div key={w}>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{d.window}</span>
                <StatusBadge status={d.status}
                  note={partial ? `${d.daysCovered}/${d.daysRequired} days` : null} />
                {usable ? (
                  <span className="ml-auto text-[11.5px] font-semibold text-slate-300">
                    BTC {ratioPct(d.btcShare)} · other {ratioPct(d.altShare)}
                  </span>
                ) : (
                  <span className="ml-auto text-[11.5px] text-slate-500">unavailable — {d.reasonCode}</span>
                )}
              </div>
              {usable ? (
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div className={`h-full ${partial ? 'bg-amber-500/60' : 'bg-amber-400'}`}
                    style={{ width: `${btc * 100}%` }} />
                  <div className={`h-full ${partial ? 'bg-fuchsia-500/50' : 'bg-fuchsia-400'}`}
                    style={{ width: `${(1 - btc) * 100}%` }} />
                </div>
              ) : null}
              {partial ? (
                <p className="mt-1 flex items-start gap-1 text-[11px] leading-relaxed text-amber-200/80">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  Partial: only {d.daysCovered} of {d.daysRequired} daily samples are stored, so
                  this is the mean of the days available — never a summed window total.
                </p>
              ) : null}
              {d.totalTurnoverUsd ? (
                <p className="mt-0.5 text-[10.5px] text-slate-600">Measured turnover {money(d.totalTurnoverUsd, { decimals: 0 })}</p>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        {vol?.measure} over {vol?.buckets}. Stablecoin-only pairs are excluded from both
        buckets; derivatives volume and market-cap dominance are different measures and are
        kept separate.
      </p>
    </Card>
  );
}

/* --------------------------- sector leadership --------------------------- */
function Sectors({ sec, onEvidence }) {
  const rows = sec?.sectors || [];
  return (
    <Card className="border-0 bg-slate-900 p-4 ring-1 ring-slate-800">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white">
          <Layers className="h-4 w-4 text-violet-400" />Sector leadership
        </h3>
        <StatusBadge status={sec?.status} note={sec?.reasonCode || null} />
        <EvidenceButton className="ml-auto" snapshotId={sec?.snapshotId} onEvidence={onEvidence} />
      </div>
      <div className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-[13px] text-slate-400">No sector produced a usable reading.</p>
        ) : rows.map((s) => (
          <div key={s.sector}
            className={`rounded-lg border p-2.5 ${s.concentrated ? 'border-red-500/35 bg-red-500/[0.05]' : 'border-slate-800 bg-slate-950/50'}`}>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] font-bold text-white">{s.sector}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${s.concentrated ? 'text-red-300 ring-red-500/40' : 'text-slate-300 ring-slate-700'}`}>
                {String(s.label || '').replace(/_/g, ' ') || '—'}
              </span>
              <span className="text-[11px] text-slate-500">strength {s.strength ?? '—'}</span>
              <EvidenceButton className="ml-auto" snapshotId={s.snapshotId} onEvidence={onEvidence} />
            </div>
            <p className="mt-1 text-[11.5px] text-slate-400">
              {s.membersWithData}/{s.memberCount} members with data · participation{' '}
              {ratioPct(s.participation)} · turnover concentration {ratioPct(s.turnoverConcentration)}
              {s.largestMember ? ` in ${s.largestMember}` : ''}
            </p>
            {s.concentrated ? (
              <p className="mt-1 flex items-start gap-1 text-[11.5px] font-medium leading-relaxed text-red-200/90">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {s.limitation || 'Turnover is concentrated in one token, so this is not evidence of broad sector leadership.'}
              </p>
            ) : s.limitation ? (
              <p className="mt-1 text-[11px] text-slate-500">{s.limitation}</p>
            ) : null}
          </div>
        ))}
      </div>
      <Limitations className="mt-2" items={sec?.limitations} />
    </Card>
  );
}

export default function MarketStream({ streams, loading, onEvidence }) {
  if (!streams) {
    return (
      <Card className="border-0 bg-slate-900 p-5 ring-1 ring-slate-800">
        <p className="flex items-center gap-2 text-[13px] text-slate-400">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4 text-amber-400" />}
          {loading
            ? 'Measuring the market — universe, leadership, turnover, cohorts and sectors…'
            : 'The market stream is not available right now. Albert will not guess in its place.'}
        </p>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      <Leadership ph={streams.phaseAssessment} direction={streams.direction} onEvidence={onEvidence} />
      <VolumeShares vol={streams.spotVolumeShares} onEvidence={onEvidence} />
      <Participants parts={streams.participants} onEvidence={onEvidence} />
      <Sectors sec={streams.sectors} onEvidence={onEvidence} />
    </div>
  );
}
