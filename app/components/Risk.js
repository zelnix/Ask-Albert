'use client';

import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { fmtUsd } from '../lib/format';
import { sec } from '../lib/sections';
import { SectionHead, AiReview, InfoTip } from './shared';
import MetricProvenance, { observed } from './MetricProvenance';

const riskStateColor = (s) => ({ Low: 'text-emerald-400', Normal: 'text-lime-400', Deep: 'text-emerald-400',
  Elevated: 'text-amber-400', High: 'text-orange-400', Thin: 'text-orange-400', Extreme: 'text-red-400' }[s] || 'text-slate-300');

function RiskSection({ d }) {
  const r = d?.risk || {};
  const provenance = r.provenance || {};
  const valid = (key, value) => observed(value, provenance[key]?.source, provenance[key]?.as_of);
  const lvlColor = riskStateColor(r.level);
  return (
    <div className="space-y-5">
      <SectionHead icon={ShieldAlert} title="Ask Albert Risk" blurb={sec('risk').blurb} coin={d.symbol || 'BTC'} />
      <AiReview section="risk" text="Albert is reviewing current risk…" voice />
      <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-slate-400">Overall Risk Level<InfoTip below text={`How turbulent ${(d.symbol || 'BTC')} is right now on a 0–100 scale. It measures the size of the swings, not the direction — high risk can happen in both up and down markets.`} /></p>
            <p className={`text-4xl font-black ${lvlColor}`}>{valid('level', r.score) ? r.level : 'Coming soon'}</p>
            <p className="text-xs text-slate-500">{valid('level', r.score) ? `score ${r.score}/100 · direction-independent` : 'No complete, dated risk score is available'}</p>
            {valid('level', r.score) && <MetricProvenance source={provenance.level.source} asOf={provenance.level.as_of} />}
          </div>
          <div className="flex-1">
            {valid('level', r.score) && <div className="flex gap-1">
              {(r.state_scale || []).map((s) => (
                <div key={s} className={`flex-1 rounded py-1 text-center text-[10px] font-semibold ${s === r.level ? `${riskStateColor(s)} bg-slate-800 ring-1 ring-slate-600` : 'text-slate-600'}`}>{s}</div>
              ))}
            </div>}
            <p className="mt-3 text-xs italic text-slate-500">{r.note || 'Unavailable factors are not treated as neutral risk evidence.'}</p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="border-0 bg-slate-900 p-5 ring-1 ring-slate-800">
          <p className="mb-3 flex items-center gap-1 text-sm font-semibold text-white">Expected Move<InfoTip below text="A statistical range of where price could sit over each window, based on recent volatility. It's a likely band, not a target — price can still break out of it." /></p>
          {['24H', '7D', '30D'].map((h) => {
            const e = r.expected_move?.[h];
            const usable = valid('expected_move', e?.pct);
            return <div key={h} className="mb-2 border-b border-slate-800 py-1 text-sm">
              <div className="flex items-center justify-between gap-2"><span className="text-slate-400">{h}</span><span className="font-mono text-slate-200">{usable ? `±${e.pct}% · ${fmtUsd(e.low)}–${fmtUsd(e.high)}` : 'Coming soon'}</span></div>
              {usable && <MetricProvenance source={provenance.expected_move.source} asOf={provenance.expected_move.as_of} />}
            </div>;
          })}
          <p className="mt-2 text-[11px] text-slate-500">Realised volatility: {valid('realised_vol_annual', r.realised_vol_annual) ? `${r.realised_vol_annual}% annualised (${r.vol_percentile ?? 'unknown'}th percentile)` : 'Coming soon'}</p>
          {valid('realised_vol_annual', r.realised_vol_annual) && <MetricProvenance source={provenance.realised_vol_annual.source} asOf={provenance.realised_vol_annual.as_of} />}
        </Card>
        <Card className="border-0 bg-slate-900 p-5 ring-1 ring-slate-800">
          <p className="mb-3 flex items-center gap-1 text-sm font-semibold text-white">Key Zones<InfoTip below text="The nearest notable price levels above and below where reactions are more likely (support/resistance) and the % distance to each from spot." /></p>
          {valid('zones', r.upside_zone?.price) && <div className="mb-2 rounded-lg border border-red-500/20 bg-red-500/5 p-2.5 text-sm"><p className="text-[11px] text-slate-400">{r.upside_zone.label}</p><p className="font-mono font-bold text-red-300">{fmtUsd(r.upside_zone.price)} <span className="text-[11px] font-normal text-slate-500">+{r.upside_zone.distance_pct}%</span></p><MetricProvenance source={provenance.zones.source} asOf={provenance.zones.as_of} /></div>}
          {valid('zones', r.downside_zone?.price) && <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-sm"><p className="text-[11px] text-slate-400">{r.downside_zone.label}</p><p className="font-mono font-bold text-emerald-300">{fmtUsd(r.downside_zone.price)} <span className="text-[11px] font-normal text-slate-500">-{r.downside_zone.distance_pct}%</span></p><MetricProvenance source={provenance.zones.source} asOf={provenance.zones.as_of} /></div>}
          {!valid('zones', r.upside_zone?.price) && !valid('zones', r.downside_zone?.price) && <p className="text-sm text-slate-500">Coming soon · priced support/resistance unavailable</p>}
        </Card>
        <Card className="border-0 bg-slate-900 p-5 ring-1 ring-slate-800">
          <p className="mb-3 flex items-center gap-1 text-sm font-semibold text-white">Environment<InfoTip below text="Background conditions that can amplify risk: how much big scheduled macro events loom, and how uncertain/stale the underlying data feeds are." /></p>
          <div className="space-y-2 text-sm">
            {['macro_event_risk', 'data_uncertainty'].map((key) => <div key={key} className="rounded-md border border-slate-800 p-2">
              <div className="flex justify-between"><span className="text-slate-400">{key === 'macro_event_risk' ? 'Macro-event risk' : 'Data uncertainty'}</span><span className={riskStateColor(r[key])}>{valid(key, r[key]) ? r[key] : 'Coming soon'}</span></div>
              {valid(key, r[key]) && <MetricProvenance source={provenance[key].source} asOf={provenance[key].as_of} />}
            </div>)}
          </div>
          {valid('macro_event_risk', r.macro_event_risk) && <p className="mt-2 text-[11px] text-slate-500">{r.macro_note}</p>}
        </Card>
      </div>

      <Card className="border-0 bg-slate-900 p-5 ring-1 ring-slate-800">
        <div className="mb-3 flex flex-wrap items-center gap-2"><h3 className="flex items-center gap-1 text-sm font-semibold text-white">Risk Drivers<InfoTip below text="Each measured factor shows its source and observation time. Missing factors are Coming soon and are not scored as neutral evidence." /></h3><span className="text-[11px] text-slate-500">Real observations only</span></div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(r.drivers || []).map((dr, i) => {
            const ready = observed(dr.value, dr.source, dr.as_of) && dr.state !== 'Coming soon';
            return <div key={`${dr.name}-${i}`} className="rounded-lg border border-slate-800 bg-slate-950/40 p-2.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-slate-300">{dr.name}</span><span className={`font-semibold ${ready ? riskStateColor(dr.state) : 'text-amber-300'}`}>{ready ? dr.state : 'Coming soon'}</span></div>
              {ready && <><p className="mt-1 text-xs text-slate-200">{dr.value}</p><MetricProvenance source={dr.source} asOf={dr.as_of} /></>}
            </div>;
          })}
        </div>
        <p className="mt-3 text-[11px] text-slate-500">Unavailable metrics are omitted from risk scoring and Albert’s decisions; they are never treated as neutral observations.</p>
      </Card>
    </div>
  );
}


export default RiskSection;
