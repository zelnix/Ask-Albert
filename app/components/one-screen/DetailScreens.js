'use client';

import React, { useState } from 'react';
import { ShieldCheck, ArrowLeft, RefreshCw, Microscope } from 'lucide-react';
import { BTCChart } from './OneScreenCharts';
import { NavigateLink, money, signed, pct, when } from './OneScreenHome';
import EvidenceDrawer from '../albert/EvidenceDrawer';
import ResearchFindings from '../albert/ResearchFindings';

const ScenarioEvaluation = ({ snapshot, onNav, levels }) => {
  const [evidenceId, setEvidenceId] = useState(null);
  const outlook = snapshot?.outlook;
  const band = outlook?.band;
  const validation = outlook?.validation || band?.validation;
  const ev = validation?.evaluation || {};
  const predictive = validation?.predictiveValidation === true;
  const state = !validation ? 'Evaluation unavailable' : predictive ? 'Validated predictive performance' : 'Not validated as predictive';
  return <div className="mx-auto max-w-5xl space-y-4">
    <div className="flex items-center gap-2"><Microscope className="h-5 w-5 text-sky-300" /><h1 className="text-xl font-bold text-white">Scenario Evaluation</h1><button type="button" onClick={snapshot.refresh} aria-label="Refresh evaluation read" className="ml-auto rounded-md border border-slate-700 p-2 text-slate-300 hover:text-white"><RefreshCw className="h-4 w-4" /></button></div>
    <p className="text-sm text-slate-300">This is the measured walk-forward report card for the 7-day BTC historical scenario. A plausible-looking historical range is never proof of predictive performance.</p>
    <section className="rounded-lg border border-slate-700 bg-slate-900 p-4"><h2 className={`text-lg font-bold ${predictive ? 'text-emerald-300' : 'text-amber-200'}`}>{snapshot?.health?.outlook === 'loading' && !outlook ? 'Loading evaluation…' : state}</h2><p className="mt-2 text-sm leading-relaxed text-slate-300">{validation?.headline || band?.reasonText || 'The provider has not supplied a measured report for this snapshot.'}</p><p className="mt-2 text-xs text-slate-400">Model: {outlook?.modelVersion || 'unavailable'} · Last checked {when(ev.lastEvaluatedAt)} · Source: scenario-outlooks/preview · {outlook?.canonicalHistorySnapshotId || 'history snapshot not supplied'}</p></section>
    <div className="grid gap-3 sm:grid-cols-3">{[
      ['Chronological checks', ev.evaluationPoints ?? band?.evaluationPoints, 'Walk-forward evaluations, no look-ahead'],
      ['Skill vs no change', ev.skillVsNoChange != null ? Number(ev.skillVsNoChange).toFixed(3) : null, `Material threshold ${validation?.materialSkillThreshold ?? 'not reported'}`],
      ['Band coverage', ev.intervalCoverageRate != null ? pct(Number(ev.intervalCoverageRate) * 100) : null, `Target ${ev.intervalCoverageTarget != null ? pct(Number(ev.intervalCoverageTarget) * 100) : 'unavailable'}`],
    ].map(([label, value, note]) => <div key={label} className="rounded-lg border border-slate-700 bg-slate-900 p-4"><h3 className="text-xs uppercase tracking-wide text-slate-400">{label}</h3><p className="mt-1 text-lg font-bold text-white">{value ?? 'Unavailable'}</p><p className="text-xs text-slate-400">{note}</p></div>)}</div>
    <section className="rounded-lg border border-slate-700 bg-slate-900 p-4"><h2 className="text-sm font-bold text-white">Observed history and scenario paths</h2><p className="mt-1 text-sm text-slate-300">{band?.available ? `The historical 20th–80th percentile over ${band.horizonDays} days is ${signed(band.lowerPct)} to ${signed(band.upperPct)} (anchor ${money(band.anchorPrice)}). Outcomes can fall outside this range.` : 'No calibrated historical band is published; the chart shows observed history only.'}</p><div className="mt-3 rounded-md bg-slate-950 p-3"><BTCChart outlook={outlook} levels={levels} height={300} expanded /></div><p className="mt-2 text-xs text-slate-400">Observed through {when(outlook?.baseline?.observedAt)} · model {outlook?.modelVersion || 'unavailable'} · paper-only, read-only</p></section>
    <div className="flex flex-wrap gap-4 text-sm"><NavigateLink id="scenarios" onNav={onNav}>Full scenarios & research →</NavigateLink><NavigateLink id="forecasts" onNav={onNav}>Forecasts →</NavigateLink><NavigateLink id="home" onNav={onNav}><ArrowLeft className="h-4 w-4" />Back to dashboard</NavigateLink>{band?.snapshotId && <button type="button" onClick={() => setEvidenceId(band.snapshotId)} className="inline-flex items-center gap-1 text-sky-300 underline"><ShieldCheck className="h-4 w-4" />Immutable evidence</button>}</div>
    {evidenceId && <EvidenceDrawer snapshotId={evidenceId} onClose={() => setEvidenceId(null)} />}
  </div>;
};

const OpportunityResearch = ({ snapshot, onNav }) => {
  const [evidenceId, setEvidenceId] = useState(null);
  const research = snapshot?.streams?.researchFindings || snapshot?.sop?.marketStreams?.researchFindings;
  return <div className="mx-auto max-w-5xl space-y-4"><h1 className="text-xl font-bold text-white">Opportunity research</h1><p className="text-sm text-slate-300">Falsifiable setups under observation — not recommendations, approvals or completed paper trades. The strategy workflow validates risk and mandate fit separately.</p><ResearchFindings research={research} onEvidence={setEvidenceId} onAsk={(f) => { window.__albertPendingAsk = { question: `Explain research finding ${f.title}, its confirmation and invalidation, using its attached evidence.`, context: { findingId: f.findingId, snapshotId: f.snapshotId } }; onNav('ask'); }} /><NavigateLink id="home" onNav={onNav}>← Back to dashboard</NavigateLink>{evidenceId && <EvidenceDrawer snapshotId={evidenceId} onClose={() => setEvidenceId(null)} />}</div>;
};

export { ScenarioEvaluation, OpportunityResearch };
