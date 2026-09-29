'use client';

import React, { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../lib/api';

export const announceAnalysis = (job) => {
  if (job) window.dispatchEvent(new CustomEvent('albert:analysis-requested', { detail: job }));
};
export const analysisTime = (value) => {
  if (!value) return 'Not confirmed';
  const raw = String(value);
  if (/^\d{4}-\d\d-\d\d$/.test(raw)) return `${raw} (date only)`;
  const date = new Date(/^\d{4}-\d\d-\d\dT/.test(raw) && !/(Z|[+-]\d\d:\d\d)$/.test(raw) ? `${raw}Z` : raw);
  return Number.isNaN(date.getTime()) ? 'Not confirmed' : date.toLocaleString();
};

const ACTIVE = new Set(['queued', 'running']);
const labels = { queued: 'Queued', running: 'Running', succeeded: 'Completed', partially_succeeded: 'Partly completed', partial: 'Partial data', failed: 'Failed', skipped: 'Not run', busy: 'Already running' };

export default function AnalysisRefreshStatus({ allowStart = false, onUpdate }) {
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
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
        if (!r.ok) throw new Error('Refresh status could not be read. Completion is unconfirmed.');
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
      timer = setTimeout(read, 500);
    };
    window.addEventListener('albert:analysis-requested', requested);
    read();
    return () => { stopped = true; clearTimeout(timer); window.removeEventListener('albert:analysis-requested', requested); };
  }, []);
  const start = async () => {
    setStarting(true); setError('');
    try {
      const r = await fetch(`${API_BASE}/v1/albert/analysis/run`, { method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'full', symbols: ['BTC'] }) });
      if (!r.ok) throw new Error('The refresh could not be started.');
      announceAnalysis(await r.json());
    } catch (e) { setError(e.message); } finally { setStarting(false); }
  };
  if (!job && !error && !allowStart) return null;
  return <section aria-label="Analysis refresh status" className="m-3 rounded-md border border-slate-700 bg-slate-950/50 p-3 text-xs text-slate-200">
    <div className="flex flex-wrap items-center gap-2">
      <p role="status" className="flex-1">{error || job?.message || 'No refresh has been recorded for your account.'}</p>
      {allowStart && <button type="button" disabled={starting || ACTIVE.has(job?.status)} onClick={start} className="rounded border border-sky-500/50 px-3 py-2 text-sky-200 disabled:opacity-50">{starting ? 'Starting…' : 'Refresh data and engines'}</button>}
    </div>
    {job && <details className="mt-2">
      <summary className="cursor-pointer text-sky-300">Refresh details · {labels[job.status] || job.status}</summary>
      <p className="mt-2 break-all">Run {job.jobId}</p>
      <p>Requested {analysisTime(job.requestedAt)} · Started {analysisTime(job.startedAt)} · Finished {analysisTime(job.completedAt)}</p>
      {job.error && <p className="mt-1 text-amber-200">{job.error}</p>}
      <ul className="mt-2 space-y-2">{(job.steps || []).map((step) => <li key={step.engine}>
        <p><strong>{step.label}</strong> · {labels[step.status] || step.status}</p>
        {step.message && <p>{step.message}</p>}
        <p className="text-slate-400">Started {analysisTime(step.startedAt)} · Finished {analysisTime(step.completedAt)} · Data observed {analysisTime(step.dataObservedAt)}</p>
      </li>)}</ul>
    </details>}
  </section>;
}
