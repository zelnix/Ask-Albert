'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { API_BASE } from '../lib/api';
import { X, RefreshCw, CheckCircle2, XCircle, Clock, Loader2, AlertTriangle, MinusCircle } from 'lucide-react';

export const announceAnalysis = (job) => {
  if (job) window.dispatchEvent(new CustomEvent('albert:analysis-requested', { detail: job }));
};
export const analysisTime = (value) => {
  if (!value) return null;
  const raw = String(value);
  if (/^\d{4}-\d\d-\d\d$/.test(raw)) return `${raw} (date only)`;
  const date = new Date(/^\d{4}-\d\d-\d\dT/.test(raw) && !/(Z|[+-]\d\d:\d\d)$/.test(raw) ? `${raw}Z` : raw);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
};

const ACTIVE = new Set(['queued', 'running']);
const STATUS_CONFIG = {
  queued: { label: 'Queued', Icon: Clock, color: 'text-slate-400', bg: 'bg-slate-800' },
  running: { label: 'Running', Icon: Loader2, color: 'text-sky-400', bg: 'bg-sky-950/50', spin: true },
  succeeded: { label: 'Completed', Icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-950/30' },
  partially_succeeded: { label: 'Partly completed', Icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-950/30' },
  partial: { label: 'Partial data', Icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-950/30' },
  failed: { label: 'Failed', Icon: XCircle, color: 'text-red-400', bg: 'bg-red-950/30' },
  skipped: { label: 'Not run', Icon: MinusCircle, color: 'text-slate-500', bg: 'bg-slate-900' },
  busy: { label: 'Already running', Icon: Loader2, color: 'text-sky-400', bg: 'bg-sky-950/50', spin: true },
};

// Complete expected engine inventory (Instruction 8)
const ENGINE_INVENTORY = [
  { engine: 'prices_BTC', label: 'BTC prices & candles' },
  { engine: 'onchain_BTC', label: 'BTC on-chain metrics' },
  { engine: 'derivatives_BTC', label: 'BTC derivatives & leverage' },
  { engine: 'etf_flows', label: 'ETF flows' },
  { engine: 'whale_balances', label: 'Whale-wallet balances' },
  { engine: 'whale_transactions', label: 'Whale-transaction feed' },
  { engine: 'news', label: 'News & market-impact' },
  { engine: 'chart_crossmarket', label: 'Cross-market & chart observations' },
  { engine: 'quant_forecasts', label: 'Quantitative forecasts (fixed-model)' },
  { engine: 'market_regime', label: 'Market regime' },
  { engine: 'market_drivers', label: 'Market-driver analysis' },
  { engine: 'opportunity_scoring', label: 'Opportunity scoring' },
  { engine: 'decision_risk', label: 'Decision & risk outputs' },
  { engine: 'sector_alerts', label: 'Sector & alert evidence' },
  { engine: 'prediction_ledger', label: 'Prediction Ledger grading' },
  { engine: 'current_scenario', label: 'Current scenario outlook' },
  { engine: 'alert_engine', label: 'Alert Engine watchlist scan' },
  { engine: 'strategy', label: 'Strategy assessment' },
  { engine: 'paper_health', label: 'Paper worker health' },
  { engine: 'data_audit', label: 'Data Audit' },
];

function StepRow({ step }) {
  const cfg = STATUS_CONFIG[step.status] || STATUS_CONFIG.queued;
  const { Icon } = cfg;
  return (
    <div className={`flex items-start gap-2.5 rounded-md px-3 py-2 ${cfg.bg}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${cfg.color} ${cfg.spin ? 'animate-spin' : ''}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs font-medium text-slate-200">{step.label}</p>
          <span className={`shrink-0 text-[10px] font-semibold ${cfg.color}`}>{cfg.label}</span>
        </div>
        {step.message && <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{step.message}</p>}
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-[10px] text-slate-500">
          {step.startedAt && <span>Exec: {analysisTime(step.startedAt) || '—'}</span>}
          {step.dataObservedAt && <span>Observed: {analysisTime(step.dataObservedAt) || '—'}</span>}
          {step.publishedAt && <span>Published: {analysisTime(step.publishedAt) || '—'}</span>}
        </div>
      </div>
    </div>
  );
}

export default function AnalysisRefreshStatus({ allowStart = false, onUpdate }) {
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const updateRef = useRef(onUpdate);
  const completed = useRef(null);
  const jobRef = useRef(null);
  updateRef.current = onUpdate;

  useEffect(() => {
    let stopped = false;
    let timer;
    let generation = 0;
    const accept = (next) => {
      if (stopped) return;
      jobRef.current = next;
      setJob(next);
      if (next && !ACTIVE.has(next.status) && completed.current !== next.jobId) {
        completed.current = next.jobId;
        window.dispatchEvent(new CustomEvent('albert:analysis-updated'));
      }
    };
    const read = async () => {
      const currentGeneration = generation;
      try {
        const r = await fetch(`${API_BASE}/v1/albert/analysis/latest`, { credentials: 'include', cache: 'no-store' });
        if (!r.ok) throw new Error('The latest status check failed. The results below are the last recorded results.');
        const data = await r.json();
        if (stopped || generation !== currentGeneration) return;
        setError(''); accept(data.job); updateRef.current?.(data);
      } catch (e) { if (!stopped && generation === currentGeneration) setError(e.message); }
      finally {
        if (!stopped && generation === currentGeneration) timer = setTimeout(read, ACTIVE.has(jobRef.current?.status) ? 2000 : 30000);
      }
    };
    const requested = (event) => {
      generation += 1; clearTimeout(timer); accept(event.detail); setError('');
      setShowPopup(true);
      timer = setTimeout(read, 500);
    };
    window.addEventListener('albert:analysis-requested', requested);
    read();
    return () => { stopped = true; clearTimeout(timer); window.removeEventListener('albert:analysis-requested', requested); };
  }, []);

  const start = useCallback(async () => {
    setStarting(true); setError(''); setShowPopup(true);
    try {
      const r = await fetch(`${API_BASE}/v1/albert/analysis/run`, { method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'full', symbols: ['BTC'] }) });
      if (!r.ok) throw new Error('The refresh could not be started.');
      announceAnalysis(await r.json());
    } catch (e) { setError(e.message); } finally { setStarting(false); }
  }, []);

  // Listen for external refresh trigger
  useEffect(() => {
    const handler = () => start();
    window.addEventListener('albert:trigger-refresh', handler);
    return () => window.removeEventListener('albert:trigger-refresh', handler);
  }, [start]);

  // Build the full step list: merge actual steps with the inventory
  const mergedSteps = ENGINE_INVENTORY.map((inv) => {
    const actual = (job?.steps || []).find((s) => s.engine === inv.engine);
    return actual || { ...inv, status: 'skipped', message: null };
  });

  const isActive = ACTIVE.has(job?.status);
  const overallCfg = STATUS_CONFIG[job?.status] || STATUS_CONFIG.queued;

  if (!job && !error && !allowStart) return null;

  return (
    <>
      {/* Inline status bar */}
      <section aria-label="Analysis refresh status" className="m-3 rounded-md border border-slate-700 bg-slate-950/50 p-3 text-xs text-slate-200">
        <div className="flex flex-wrap items-center gap-2">
          <p role="status" className="flex-1">
            {error ? <span className="text-amber-300">{error}</span> : job?.message || 'No refresh has been recorded for your account.'}
          </p>
          <div className="flex gap-2">
            {job && <button type="button" onClick={() => setShowPopup(true)} className="rounded border border-slate-600 px-3 py-1.5 text-slate-300 hover:border-sky-500/50 hover:text-sky-200">Details</button>}
            {allowStart && <button type="button" disabled={starting || isActive} onClick={start} className="rounded border border-sky-500/50 px-3 py-1.5 text-sky-200 disabled:opacity-50">{starting ? 'Starting…' : 'Refresh all engines'}</button>}
          </div>
        </div>
      </section>

      {/* Popup overlay */}
      {showPopup && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => !isActive && setShowPopup(false)}>
          <div className="relative mx-4 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div className="flex items-center gap-2">
                {isActive ? <Loader2 className="h-5 w-5 animate-spin text-sky-400" /> : <overallCfg.Icon className={`h-5 w-5 ${overallCfg.color}`} />}
                <h2 className="text-sm font-semibold text-white">Engine Refresh</h2>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${overallCfg.bg} ${overallCfg.color}`}>{overallCfg.label}</span>
              </div>
              <button type="button" onClick={() => setShowPopup(false)} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Job info */}
            {job && (
              <div className="border-b border-slate-800 px-4 py-2 text-[11px] text-slate-400">
                <span>Run {job.jobId}</span>
                {job.requestedAt && <span className="ml-3">Requested: {analysisTime(job.requestedAt)}</span>}
                {job.completedAt && !isActive && <span className="ml-3">Finished: {analysisTime(job.completedAt)}</span>}
              </div>
            )}

            {error && (
              <div className="border-b border-slate-800 bg-amber-950/20 px-4 py-2 text-[11px] text-amber-300">
                {error}
              </div>
            )}

            {/* Steps list */}
            <div className="flex-1 overflow-y-auto px-3 py-2">
              <div className="space-y-1">
                {mergedSteps.map((step) => <StepRow key={step.engine} step={step} />)}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3">
              <p className="text-[10px] text-slate-500">{mergedSteps.filter(s => s.status === 'succeeded').length}/{mergedSteps.length} engines completed</p>
              <div className="flex gap-2">
                {!isActive && (
                  <button type="button" disabled={starting} onClick={start} className="flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50">
                    <RefreshCw className={`h-3.5 w-3.5 ${starting ? 'animate-spin' : ''}`} />{starting ? 'Starting…' : 'Run again'}
                  </button>
                )}
                <button type="button" onClick={() => setShowPopup(false)} className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
