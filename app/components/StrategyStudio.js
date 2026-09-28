'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Crosshair, Plus, Loader2, Sparkles, ShieldCheck, ChevronDown, Play, Square, Archive,
  FlaskConical, CheckCircle2, AlertTriangle, ArrowRight, X, HandCoins, Bot, XCircle, Info,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { API_BASE } from '../lib/api';

const idem = () => 'k_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
const post = (path, body) => fetch(`${API_BASE}${path}`, {
  method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body || {}),
});
const STUDIO_EXEC_RULES = {
  entryRules: 'CANONICAL_BUY_ONLY', exitRules: 'CANONICAL_SELL_OR_INVALIDATION',
  profitTaking: 'CANONICAL_SELL_ONLY', invalidation: 'CANONICAL_INVALIDATION_ONLY',
  sizing: 'MAX_REVIEWED_ASSET_WEIGHT',
};

const get = (path, signal) => fetch(`${API_BASE}${path}`, { credentials: 'include', cache: 'no-store', signal });

const readStudio = async (path, valid) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await get(path, controller.signal);
    if (!response.ok) {
      const error = new Error('Studio request failed');
      error.status = response.status;
      throw error;
    }
    const data = await response.json();
    if (data?.status !== 'ready' || !valid(data)) throw new Error('Invalid Studio response');
    return data;
  } finally { clearTimeout(timeout); }
};
const readError = (section, error) => error?.status === 401
  ? 'Your session expired. Please sign in again.'
  : `${section} could not load${error?.status ? ` (HTTP ${error.status})` : ''}. Please retry.`;

const usd = (v) => (v == null ? '\u2014' : '$' + Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }));
const signed = (v) => (v == null ? '\u2014' : (Number(v) >= 0 ? '+' : '') + usd(v).replace('$-', '-$'));

// One unified status per strategy: saved -> paper trading -> stopped.
const PAPER_STATUS = {
  SAVED: { label: 'Saved · not trading', color: 'text-slate-300', dot: 'bg-slate-500' },
  STOPPED: { label: 'Stopped', color: 'text-amber-300', dot: 'bg-amber-400' },
  LIVE: { label: 'Paper trading', color: 'text-emerald-300', dot: 'bg-emerald-400' },
  WAIT: { label: 'WAIT · awaiting conditions', color: 'text-amber-300', dot: 'bg-amber-400' },
  UNAVAILABLE: { label: 'Paper worker unavailable', color: 'text-amber-300', dot: 'bg-amber-400' },
  RESTRICTED_IN_WALLET: { label: 'Restricted in this wallet · exits preserved', color: 'text-amber-300', dot: 'bg-amber-400' },
  NEEDS_CHANGES: { label: 'Needs changes · exits only', color: 'text-amber-300', dot: 'bg-amber-400' },
  HALTED_RISK: { label: 'Halted — drawdown limit', color: 'text-rose-300', dot: 'bg-rose-400' },
  ARCHIVED: { label: 'Archived', color: 'text-slate-500', dot: 'bg-slate-600' },
};
const ps = (s) => PAPER_STATUS[s] || PAPER_STATUS.SAVED;

// Trade approval — the ONLY two ways a live strategy can behave. "Observe" is gone.
const APPROVALS = [
  { id: 'REVIEW', label: 'Review and approve', desc: 'Every proposed simulated BUY or SELL, including reviewed protective exits, waits for your approval. Manual close remains your choice.', Icon: HandCoins },
  { id: 'AUTOPILOT', label: 'Autopilot', desc: 'Albert records virtual fills after the reviewed rules and risk gates pass; no exchange orders.', Icon: Bot },
];

function PaperBadge() {
  return <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300"><FlaskConical className="h-3 w-3" />Paper only</span>;
}

function CoinCapability({ item }) {
  const [open, setOpen] = useState(false);
  if (!item) return null;
  const missing = item.missingCapabilities || [];
  const label = item.supportState === 'UNSUPPORTED' ? 'Unsupported' :
    item.supportState === 'RESTRICTED_IN_WALLET' ? 'Restricted in this wallet' :
    item.supportState === 'WAITING_FOR_DATA' ? 'Waiting for data' : 'Supported · not verified';
  const warning = item.supportState !== 'SUPPORTED';
  return (
    <span className="inline-block text-[11px]">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className={`rounded-md border px-2 py-0.5 font-semibold underline underline-offset-2 ${warning ? 'border-amber-500/30 text-amber-300' : 'border-emerald-500/30 text-emerald-300'}`}>
        {item.symbol}: {label}
      </button>
      {open && <span role="region" aria-label={`${item.symbol} paper support explanation`}
        className="mt-2 block rounded-lg border border-slate-700 bg-slate-950 p-3 text-left text-slate-200">
        <strong className="block text-[12px]">{item.symbol} · {label}</strong>
        {missing.length ? <span className="mt-1 block">Missing for simulated trading:</span> : null}
        {missing.map((entry) => <span key={entry.capability} className="mt-1 block">• {entry.reason}</span>)}
        {item.restrictionReason && <span className="mt-1 block">{item.restrictionReason}</span>}
        {item.dataReason && <span className="mt-1 block">{item.dataReason}</span>}
        <span className="mt-1 block text-slate-400">Implementation and current data are separate from full workflow verification. Existing holdings and valid exits remain available with usable data. Simulation only.</span>
        <button type="button" onClick={() => setOpen(false)} className="mt-2 font-semibold text-sky-300 underline underline-offset-2">← Back to strategy</button>
      </span>}
    </span>
  );
}

function ConfirmBtn({ label, icon: Icon, onConfirm, tone = 'sky', busy, disabled = false }) {
  const [armed, setArmed] = useState(false);
  const colors = { sky: 'bg-sky-500 hover:bg-sky-400', emerald: 'bg-emerald-600 hover:bg-emerald-500',
    amber: 'bg-amber-600 hover:bg-amber-500', red: 'bg-red-600 hover:bg-red-500', slate: 'bg-slate-700 hover:bg-slate-600' };
  if (armed) {
    return (
      <span className="inline-flex items-center gap-1">
        <Button size="sm" disabled={busy || disabled} onClick={() => { setArmed(false); onConfirm(); }} className={`h-7 gap-1 px-2.5 text-[12px] ${colors[tone]}`}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Confirm {label}
        </Button>
        <button onClick={() => setArmed(false)} className="rounded p-1 text-slate-400 hover:text-white"><X className="h-3.5 w-3.5" /></button>
      </span>
    );
  }
  return (
    <Button size="sm" variant="outline" disabled={disabled || busy} onClick={() => setArmed(true)} className="h-7 gap-1 border-slate-700 px-2.5 text-[12px] text-slate-200 hover:bg-slate-800">
      {Icon && <Icon className="h-3.5 w-3.5" />}{label}
    </Button>
  );
}

function Builder({ onSaved, onCancel, initialGoal = '', initialDraft = null, revisionId = null }) {
  const [unsupportedAssets, setUnsupportedAssets] = useState([]);
  const [goal, setGoal] = useState(initialGoal);
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState(initialDraft ? {
    ...initialDraft, rules: initialDraft.rules || [],
    walletName: initialDraft.walletName || `${initialDraft.name || 'Strategy'} wallet`,
    startingCash: initialDraft.startingCash || '100000.00',
  } : null);
  const [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!draft) return undefined;
    let active = true;
    const t = setTimeout(async () => {
      try {
        const r = await post('/v1/albert/studio/validate', { draft });
        const j = await r.json();
        if (active) setReview(r.ok ? { contract: j.contract, hash: j.contractHash,
          summary: j.summary, errors: j.validationErrors || [], capabilities: j.assetCapabilities || [], for: JSON.stringify(draft) } : null);
      } catch (e) { if (active) { setReview(null); setErr('Validation unavailable; nothing can be saved.'); } }
    }, 300);
    return () => { active = false; clearTimeout(t); };
  }, [draft]);

  const updateDraft = (next) => { setReview(null); setErr(''); setDraft(next); };
  const readyToSave = !!review && review.for === JSON.stringify(draft) && !(review.errors || []).length;

  const runDraft = async () => {
    if (!goal.trim()) return;
    if (goal.length > 4000) { setErr('Needs changes — shorten this request before drafting. No instruction was discarded.'); return; }
    setDrafting(true); setErr(''); setUnsupportedAssets([]);
    try {
      const r = await post('/v1/albert/studio/draft', { goal });
      const j = await r.json();
      if (!r.ok) {
        setUnsupportedAssets(j.detail?.assetCapabilities || []);
        setErr(typeof j.detail === 'object' ? j.detail.message : (j.detail || 'Albert could not draft a strategy. Nothing was substituted.'));
        return;
      }
      setDraft(j.draft);
      setReview({ contract: j.contract, hash: j.contractHash, summary: j.summary,
        errors: j.validationErrors || [], capabilities: j.assetCapabilities || [], for: JSON.stringify(j.draft) });
    } catch (e) { setErr('Could not draft — try again. No strategy was saved.'); }
    finally { setDrafting(false); }
  };
  const setAsset = (i, key, val) => {
    const next = { ...draft, assets: draft.assets.map((a, ix) => ix === i ? { ...a, [key]: key === 'weightPct' ? Number(val) : val.toUpperCase() } : a) };
    updateDraft(next);
  };
  const addAsset = () => updateDraft({ ...draft, assets: [...(draft.assets || []), { symbol: '', weightPct: 0 }] });
  const removeAsset = (i) => updateDraft({ ...draft, assets: draft.assets.filter((_, ix) => ix !== i) });
  const setField = (k, v) => updateDraft({ ...draft, [k]: v });
  const setRule = (i, changes) => updateDraft({ ...draft, rules: (draft.rules || []).map((r, ix) => ix === i ? { ...r, ...changes } : r) });
  const addRule = () => updateDraft({ ...draft, rules: [...(draft.rules || []), {
    symbol: draft.assets?.[0]?.symbol || '', side: 'BUY', kind: 'PRICE', operator: 'BELOW', value: '', indicator: '' }] });

  const save = async () => {
    if (!readyToSave) { setErr('Needs changes — wait for a valid review before saving.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await post('/v1/albert/studio/save', { draft, name: draft.name, strategyId: revisionId,
        confirm: true, idempotencyKey: idem(), expectedHash: review.hash });
      const j = await r.json();
      if (r.ok) onSaved(j.strategyId);
      else setErr(j.detail || 'Save failed.');
    } catch (e) { setErr('Save failed.'); }
    finally { setBusy(false); }
  };

  return (
    <Card className="border-0 bg-slate-900 p-5 ring-1 ring-slate-800">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-400" />
        <h3 className="text-sm font-bold text-white">{revisionId ? 'Review a new version' : 'Build a strategy with Albert'}</h3>
        <button onClick={onCancel} className="ml-auto rounded p-1 text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
      </div>
      {revisionId && <p className="mb-3 text-[12px] text-amber-200">Saving a reviewed version stops new entries under the old version. It keeps this strategy’s existing wallet, cash, holdings, exits and history; select a mode and Start the new version when ready.</p>}
      {!draft && (
        <div>
          <p className="mb-2 text-[13px] text-slate-400">Describe the exact simulated plan: coins, weights, wallet name and starting cash, optional price or 24-hour percentage conditions, RSI/SMA/EMA/MACD indicators, and stop-loss, trailing-stop or take-profit percentages. Albert checks each rule before Save. Macro and tokenomics inform assessment, never automatic trade triggers.</p>
          <textarea rows={4} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. BTC 60%, ETH 40%; Buy BTC if price below $80000 and RSI(14) below 30; Take-profit 12% for BTC; Start with $5000; Consider macro and supply in my review."
            className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-violet-500" />
          <Button onClick={runDraft} disabled={drafting || !goal.trim()} className="mt-3 gap-1.5 bg-violet-600 hover:bg-violet-500">
            {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Draft with Albert
          </Button>
          {err && <p role="alert" className="mt-2 text-[12px] font-medium text-amber-300">{err}</p>}
          {(unsupportedAssets || []).length > 0 && <div className="mt-2 flex flex-wrap gap-2">{unsupportedAssets.map((asset) => <CoinCapability key={asset.symbol} item={asset} />)}</div>}
        </div>
      )}
      {draft && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-[12px] text-slate-400">Name
              <input value={draft.name || ''} onChange={(e) => setField('name', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-white outline-none focus:border-sky-500" /></label>
            <label className="text-[12px] text-slate-400">Paper wallet name
              <input value={draft.walletName || ''} disabled={!!revisionId} onChange={(e) => setField('walletName', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-white outline-none focus:border-sky-500 disabled:opacity-60" /></label>
            <label className="text-[12px] text-slate-400">Virtual starting amount (USD)
              <input type="number" min="10" step="0.01" max="1000000000" value={draft.startingCash ?? ''} disabled={!!revisionId} onChange={(e) => setField('startingCash', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-white outline-none focus:border-sky-500 disabled:opacity-60" /></label>
            <label className="text-[12px] text-slate-400">Protected cash reserve (%)
              <input type="number" min="0" max="100" value={draft.reservePct ?? 0} onChange={(e) => setField('reservePct', Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-white outline-none focus:border-sky-500" /></label>
          </div>
          <div>
            <p className="mb-1 text-[12px] font-semibold text-slate-400">Assets &amp; weights</p>
            <div className="space-y-1.5">
              {(draft.assets || []).map((a, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={a.symbol} onChange={(e) => setAsset(i, 'symbol', e.target.value)} placeholder="SYM" className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm font-semibold text-white outline-none focus:border-sky-500" />
                  <input type="number" value={a.weightPct} onChange={(e) => setAsset(i, 'weightPct', e.target.value)} className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-white outline-none focus:border-sky-500" />
                  <span className="text-[12px] text-slate-500">%</span>
                  <button onClick={() => removeAsset(i)} className="rounded p-1 text-slate-500 hover:text-red-400"><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
            <button onClick={addAsset} className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-sky-400 hover:text-sky-300"><Plus className="h-3.5 w-3.5" />Add asset</button>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-[12px] text-slate-300">
            <p className="font-semibold text-white">Executable strategy rules · checked every paper cycle</p>
            <p className="mt-1">BUY: all of that coin’s triggers and canonical BUY must pass. SELL: any reviewed exit trigger may reduce that coin’s holding. Missing indicator or price data means WAIT, not a substitute. Review always asks before a proposed trade; Autopilot uses only your approved strategy.</p>
            <label className="mt-2 block text-slate-400">Maximum open positions
              <input type="number" min="1" max="8" value={draft.riskLimits?.maxPositions ?? draft.assets?.length ?? 1}
                onChange={(e) => updateDraft({ ...draft, riskLimits: { ...(draft.riskLimits || {}), maxPositions: Number(e.target.value) } })}
                className="ml-2 w-20 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-white" /></label>
            <div className="mt-3 space-y-2">
              {(draft.rules || []).map((rule, i) => <div key={i} className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-800 p-2">
                <select aria-label={`Rule ${i + 1} coin`} value={rule.symbol || ''} onChange={(e) => setRule(i, { symbol: e.target.value })} className="rounded-md bg-slate-800 p-1 text-white">
                  {(draft.assets || []).map((a) => <option key={a.symbol} value={a.symbol}>{a.symbol}</option>)}
                </select>
                <select aria-label={`Rule ${i + 1} side`} value={rule.side || 'BUY'} onChange={(e) => setRule(i, { side: e.target.value })} className="rounded-md bg-slate-800 p-1 text-white">
                  <option value="BUY">BUY</option><option value="SELL">SELL</option>
                </select>
                <select aria-label={`Rule ${i + 1} kind`} value={rule.kind || 'PRICE'}
                  onChange={(e) => setRule(i, { kind: e.target.value, side: ['STOP_LOSS_PCT', 'TAKE_PROFIT_PCT', 'TRAILING_STOP_PCT'].includes(e.target.value) ? 'SELL' : rule.side,
                    operator: ['STOP_LOSS_PCT', 'TAKE_PROFIT_PCT', 'TRAILING_STOP_PCT'].includes(e.target.value) ? '' : (rule.operator || 'BELOW'), indicator: e.target.value === 'INDICATOR' ? 'RSI_14' : '' })}
                  className="rounded-md bg-slate-800 p-1 text-white">
                  <option value="PRICE">Price (USD)</option><option value="CHANGE_PCT_24H">Rolling 24h change (%)</option>
                  <option value="INDICATOR">Indicator (closed daily)</option><option value="STOP_LOSS_PCT">Stop-loss from entry (%)</option>
                  <option value="TRAILING_STOP_PCT">Trailing stop from observed peak (%)</option><option value="TAKE_PROFIT_PCT">Take-profit from entry (%)</option>
                </select>
                {rule.kind === 'INDICATOR' && <select aria-label={`Rule ${i + 1} indicator`} value={rule.indicator || 'RSI_14'} onChange={(e) => setRule(i, { indicator: e.target.value })} className="rounded-md bg-slate-800 p-1 text-white">
                  <option value="RSI_14">RSI 14</option><option value="SMA_20">SMA 20</option><option value="EMA_20">EMA 20</option><option value="MACD_HIST">MACD histogram</option>
                </select>}
                {['PRICE', 'CHANGE_PCT_24H', 'INDICATOR'].includes(rule.kind) && <select aria-label={`Rule ${i + 1} comparison`} value={rule.operator || 'BELOW'} onChange={(e) => setRule(i, { operator: e.target.value })} className="rounded-md bg-slate-800 p-1 text-white"><option value="BELOW">Below</option><option value="ABOVE">Above</option></select>}
                <input type="number" aria-label={`Rule ${i + 1} threshold`} value={rule.value ?? ''} onChange={(e) => setRule(i, { value: e.target.value })} placeholder="threshold" className="w-24 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-white" />
                <button type="button" onClick={() => updateDraft({ ...draft, rules: draft.rules.filter((_, ix) => ix !== i) })} aria-label={`Remove rule ${i + 1}`} className="rounded p-1 text-rose-300"><X className="h-4 w-4" /></button>
              </div>)}
              <button type="button" onClick={addRule} className="inline-flex items-center gap-1 font-semibold text-sky-300"><Plus className="h-3.5 w-3.5" />Add executable rule</button>
            </div>
            {Object.entries(STUDIO_EXEC_RULES).some(([k, v]) => draft[k] !== v) &&
              <p role="alert" className="mt-1 text-amber-300">Needs changes — the canonical base gates were altered. Use the typed triggers above; nothing will be silently substituted.</p>}
          </div>
          {draft.requestedPlan && <details className="text-[12px] text-slate-400"><summary className="cursor-pointer">Original request being reviewed</summary><p className="mt-1 whitespace-pre-wrap">{draft.requestedPlan}</p></details>}
          <button type="button" onClick={() => { setGoal(draft.requestedPlan || goal); setDraft(null); setReview(null); setErr(''); }} className="text-[12px] font-semibold text-sky-400 hover:text-sky-300">Edit request &amp; redraft</button>
          {review && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400"><ShieldCheck className="h-3.5 w-3.5" />{(review.errors || []).length ? 'Needs changes' : 'Reviewed'} · hash {review.hash}</p>
              <p className="text-[13px] text-slate-200">{review.summary}</p>
              {(review.capabilities || []).length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{review.capabilities.map((cap) => <CoinCapability key={cap.symbol} item={cap} />)}</div>}
              {(review.errors || []).length > 0 && (
                <ul className="mt-2 space-y-0.5 text-[12px] text-red-400">
                  {review.errors.map((e, i) => <li key={i} className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{e}</li>)}
                </ul>
              )}
            </div>
          )}
          {!review && <p role="status" className="text-[12px] text-amber-300">Checking this draft — Save is disabled until validation completes.</p>}
          {err && <p role="alert" className="text-[12px] font-medium text-red-400">{err}</p>}
          <div className="flex items-center gap-2">
            <ConfirmBtn label="Save strategy" icon={CheckCircle2} tone="emerald" busy={busy} disabled={!readyToSave}
              onConfirm={save} />
            <span className="text-[11px] text-slate-500">Saves the exact plan you reviewed. Saving never starts trading &mdash; you choose that next.</span>
          </div>
        </div>
      )}
    </Card>
  );
}

function Methodology({ bt, contractHash }) {
  // M-F: methodology, hashes and cost assumptions are COLLAPSED (not removed) so the
  // result stays readable while every integrity value remains one click away.
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-300">
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />Methodology, costs &amp; integrity
      </button>
      {open && (
        <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 text-[11px] sm:grid-cols-3">
          {[['Benchmark', bt.benchmark], ['Fees paid', `$${bt.feesPaidUsd}`], ['Slippage', `${bt.slippageBps} bps`],
            ['Data coverage', `${bt.dataCoveragePct}%`], ['Sample', `${bt.sampleSizeDays} days`],
            ['Backtest version', bt.backtestVersion], ['Contract hash', contractHash], ['Data hash', bt.dataHash]].map(([k, v]) => (
            <div key={k} className="min-w-0">
              <span className="block text-[10px] uppercase tracking-wide text-slate-500">{k}</span>
              <span className="block truncate font-mono font-semibold text-slate-200" title={String(v)}>{v == null ? '—' : String(v)}</span>
            </div>
          ))}
          <p className="col-span-full text-[10px] leading-relaxed text-slate-500">
            Historical indicator illustration keyed to this contract and data snapshot. It does not replay the reviewed paper BUY/SELL rules or virtual fills; only the paper wallet above shows actual simulated strategy performance.
          </p>
        </div>
      )}
    </div>
  );
}

/* ===================================================================
   Paper trading, ON the strategy (M-G)
   -------------------------------------------------------------------
   Build -> save -> start paper trading. No separate setup, no Observe
   mode, no account picker: the strategy owns its own paper wallet and
   its own Status, Trade approval, Activity and Performance.
   =================================================================== */
function PaperPanel({ sid, name, onChange }) {
  const [p, setP] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState(null);
  const [choice, setChoice] = useState('REVIEW');   // default: Review and approve
  const [arming, setArming] = useState(false);
  const [pending, setPending] = useState({});
  const keysRef = React.useRef({});

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const j = await readStudio(`/v1/albert/studio/strategies/${sid}/paper`,
        (data) => data.strategyId === sid && typeof data.paperStatus === 'string'
          && typeof data.canStart === 'boolean');
      setP(j);
      if (j.approvalMode) setChoice(j.approvalMode);
    } catch (error) {
      setP(null);
      setLoadError(readError('Paper trading status', error));
    }
  }, [sid]);
  useEffect(() => { setP(null); setLoadError(''); setArming(false); setMsg(null); load(); }, [load]);
  // Live strategies refresh on their own so the card stays honest without a reload.
  useEffect(() => {
    if (!p?.isLive) return undefined;
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [p?.isLive, load]);

  const cmd = async (path, body) => {
    setBusy(true); setErr(''); setMsg(null);
    try {
      const r = await post(`/v1/albert/studio/strategies/${sid}/${path}`,
        { confirm: true, idempotencyKey: idem(), ...(body || {}) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErr(j.detail || 'That did not go through — please try again.');
      else await load();
      if (r.ok) onChange && onChange();
    } catch (e) { setErr('Network problem — please try again.'); }
    finally { setBusy(false); setArming(false); }
  };

  const keyFor = (id) => {
    if (!keysRef.current[id]) {
      keysRef.current[id] = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID() : 'idem_' + Date.now() + Math.random().toString(36).slice(2);
    }
    return keysRef.current[id];
  };

  // Approval sends ONLY the contract fields — never quantity/price/targets. One
  // idempotency key per action, reused on retry, so a double-tap can't double-fill.
  const approve = async (pr) => {
    if (pending[pr.proposalId]) return;
    setPending((s) => ({ ...s, [pr.proposalId]: true })); setMsg(null);
    let keep = true;
    try {
      const r = await post(`/v1/albert/paper/proposals/${pr.proposalId}/approve`, {
        expectedProposalVersion: pr.version ?? 0,
        decisionSnapshotId: pr.decisionSnapshotId, idempotencyKey: keyFor(pr.proposalId),
      });
      if (r.status === 503) setMsg({ t: 'info', m: 'Paper execution is temporarily switched off. No real money is affected.' });
      else if (r.status === 401) setMsg({ t: 'err', m: 'Your session expired — please sign in again.' });
      else if (r.status === 404) { setMsg({ t: 'err', m: 'That proposal is no longer available.' }); keep = false; }
      else if (r.status === 409) { setMsg({ t: 'warn', m: 'That proposal expired or changed — Albert will surface a fresh one.' }); keep = false; }
      else if (r.ok) {
        const j = await r.json().catch(() => ({}));
        if (j.proposalStatus === 'REJECTED_ON_REVALIDATION') { setMsg({ t: 'warn', m: 'The decision changed on a fresh check — no paper trade was placed.' }); keep = false; }
        else { setMsg({ t: 'ok', m: 'Paper trade approved and simulated. No real money was involved.' }); keep = false; }
      } else setMsg({ t: 'err', m: 'Something went wrong — please retry.' });
    } catch (e) { setMsg({ t: 'err', m: 'Network error — you can safely retry; it won’t double-fill.' }); }
    if (!keep) delete keysRef.current[pr.proposalId];
    await load();
    setPending((s) => { const n = { ...s }; delete n[pr.proposalId]; return n; });
  };

  const skip = async (pr) => {
    if (pending[pr.proposalId]) return;
    setPending((s) => ({ ...s, [pr.proposalId]: true }));
    try { await post(`/v1/albert/paper/proposals/${pr.proposalId}/cancel`, {}); } catch (e) { /* noop */ }
    delete keysRef.current[pr.proposalId];
    await load();
    setPending((s) => { const n = { ...s }; delete n[pr.proposalId]; return n; });
  };

  const closePos = async (posId) => {
    setBusy(true);
    try { await post(`/v1/albert/paper/positions/${posId}/close`, { confirm: true, idempotencyKey: idem() }); } catch (e) { /* noop */ }
    await load(); setBusy(false);
  };

  if (!p) {
    return (
      <div className="mt-4 border-t border-slate-800 pt-3">
        {loadError ? (
          <div className="space-y-2">
            <p role="alert" className="text-[12px] text-amber-300">{loadError}</p>
            <Button size="sm" variant="outline" onClick={load} className="border-slate-700 text-slate-200">Retry paper status</Button>
          </div>
        ) : <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
      </div>
    );
  }

  const meta = !p.canStart && (p.entryBlockers || []).length > 0 && !['LIVE', 'WAIT', 'UNAVAILABLE', 'NEEDS_CHANGES', 'RESTRICTED_IN_WALLET', 'ARCHIVED', 'HALTED_RISK'].includes(p.paperStatus)
    ? { label: 'Needs changes', color: 'text-amber-300', dot: 'bg-amber-400' } : ps(p.paperStatus);
  const perf = p.performance || {};
  const live = ['LIVE', 'WAIT'].includes(p.paperStatus);
  const runningButUnavailable = ['UNAVAILABLE', 'NEEDS_CHANGES', 'RESTRICTED_IN_WALLET'].includes(p.paperStatus);
  const approvals = p.pendingApprovals || [];
  const positions = p.positions || [];
  const activity = p.activity || [];
  const proposalHistory = p.proposalHistory || [];
  const stale = p.marketData === 'STALE';

  return (
    <div className="mt-4 space-y-3 border-t border-slate-800 pt-3">
      {/* ---- Status + start/stop ---- */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-slate-400">
          <FlaskConical className="h-3.5 w-3.5" />Paper trading
        </span>
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-slate-950/70 px-2 py-0.5 text-[11px] font-semibold ${meta.color}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}
        </span>
        <PaperBadge />
        <div className="ml-auto flex items-center gap-2">
          {(live || runningButUnavailable) ? (
            arming ? (
              <>
                <Button size="sm" disabled={busy} onClick={() => cmd('stop-paper')} className="h-7 gap-1 bg-red-600 px-2.5 text-[12px] hover:bg-red-500">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Confirm stop
                </Button>
                <button onClick={() => setArming(false)} className="rounded p-1 text-slate-400 hover:text-white"><X className="h-3.5 w-3.5" /></button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setArming(true)} className="h-7 gap-1 border-slate-700 px-2.5 text-[12px] text-slate-200 hover:bg-slate-800">
                <Square className="h-3.5 w-3.5" />Stop paper trading
              </Button>
            )
          ) : (
            arming ? (
              <>
                <Button size="sm" disabled={busy || !p.canStart || !!p.modeBlockers?.[choice]} onClick={() => cmd('start-paper', { approvalMode: choice })} className="h-7 gap-1 bg-emerald-600 px-2.5 text-[12px] hover:bg-emerald-500">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Confirm start · {choice === 'AUTOPILOT' ? 'Autopilot' : 'Review and approve'}
                </Button>
                <button onClick={() => setArming(false)} className="rounded p-1 text-slate-400 hover:text-white"><X className="h-3.5 w-3.5" /></button>
              </>
            ) : (
              <Button size="sm" disabled={p.paperStatus === 'ARCHIVED' || !p.canStart || !!p.modeBlockers?.[choice]} onClick={() => setArming(true)} className="h-7 gap-1 bg-emerald-600 px-2.5 text-[12px] hover:bg-emerald-500">
                <Play className="h-3.5 w-3.5" />{p.paperStatus === 'STOPPED' ? 'Resume paper trading' : 'Start paper trading'}
              </Button>
            )
          )}
        </div>
      </div>

      {/* ---- Trade approval ---- */}
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Trade approval</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {APPROVALS.map((a) => {
            const on = (live || runningButUnavailable) ? p.approvalMode === a.id : choice === a.id;
            return (
              <button key={a.id} disabled={busy || !!p.modeBlockers?.[a.id] || (p.paperStatus === 'NEEDS_CHANGES' && (p.entryBlockers || []).length > 0)}
                onClick={() => ((live || runningButUnavailable) ? cmd('approval-mode', { approvalMode: a.id }) : setChoice(a.id))}
                className={`rounded-xl border p-2.5 text-left transition-colors ${on ? 'border-sky-500/50 bg-sky-500/10' : 'border-slate-800 bg-slate-950/50 hover:border-slate-600'} disabled:opacity-60`}>
                <span className="flex items-center gap-1.5">
                  <a.Icon className={`h-3.5 w-3.5 ${on ? 'text-sky-300' : 'text-slate-400'}`} />
                  <span className={`text-[12px] font-bold ${on ? 'text-sky-200' : 'text-slate-200'}`}>{a.label}</span>
                  {on && <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-sky-300" />}
                </span>
                <span className="mt-0.5 block text-[10.5px] leading-snug text-slate-500">{a.desc}</span>
              </button>
            );
          })}
        </div>
        {!p.approvalMode && <p className="mt-1 text-[10.5px] text-slate-500">Pick how hands-on you want to be, then start. You can change this at any time.</p>}
        {p.modeBlockers?.[choice] && <p role="status" className="mt-1 text-[11px] text-amber-300">{p.modeBlockers[choice]}</p>}
      </div>

      {(p.entryBlockers || []).length > 0 && (
        <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[12px] text-amber-200">
          <strong>{p.paperStatus === 'UNAVAILABLE' ? 'Paper worker unavailable' : live ? 'New entries blocked' : 'Needs changes'}</strong>: {(p.entryBlockers || []).join(' ')} Existing positions and valid exits are preserved.
        </div>
      )}
      {err && <p role="alert" className="text-[12px] font-medium text-red-400">{err}</p>}
      {msg && (
        <p className={`rounded-lg border p-2 text-[12px] font-medium ${
          msg.t === 'ok' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
            : msg.t === 'warn' ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
              : msg.t === 'info' ? 'border-sky-500/40 bg-sky-500/10 text-sky-200'
                : 'border-rose-500/40 bg-rose-500/10 text-rose-200'}`}>{msg.m}</p>
      )}
      {p.paperStatus === 'HALTED_RISK' && (
        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-rose-300"><AlertTriangle className="h-3.5 w-3.5" />This strategy hit its drawdown limit and needs a reviewed reset before it can trade again.</p>
      )}
      {p.assessment && <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-[12px] text-slate-300">
        <p className="font-semibold text-white">Albert’s latest assessment · {p.assessment.state}</p>
        <p className="text-[11px] text-slate-500">As of {p.assessment.at || 'unavailable'} · reviewed version {p.assessment.strategyVersion}</p>
        {(p.assessment.conditions || []).map((condition) => <div key={condition.symbol} className="mt-1.5">
          <span className="font-semibold text-slate-100">{condition.symbol}: {condition.state}</span>
          {condition.reason && <span className="ml-1 text-amber-200">{condition.reason}</span>}
          {(condition.rules || []).filter((r) => r.state === 'WAIT').map((r) => <p key={r.ruleId} className="ml-2 text-amber-300">{r.reason}</p>)}
        </div>)}
        <div className="mt-2 border-t border-slate-800 pt-2">
          <p className="font-semibold text-slate-200">Existing macro &amp; tokenomics context · advisory only</p>
          {(p.assessment.context?.impact || []).map((impact, i) => <p key={i} className="mt-1 text-slate-400">{impact}</p>)}
          {p.assessment.context?.proposedRevision && <p className="mt-1.5 rounded-md border border-sky-700/40 bg-sky-950/20 p-2 text-sky-200">
            Suggested revision (not applied): {p.assessment.context.proposedRevision.reason} Open “Change strategy” to make and approve any change on this same wallet.
          </p>}
        </div>
      </div>}
      {live && stale && (
        <p role="status" className="flex items-center gap-1.5 text-[11px] text-amber-300"><AlertTriangle className="h-3.5 w-3.5" />Waiting for a price. Your holdings stay as they are; Albert will try again on the next normal paper-trading cycle.</p>
      )}

      {/* ---- Performance (this strategy's own money) ---- */}
      {p.paperAccountId && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Performance</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[['Value', perf.valueAvailable === false ? 'unavailable' : usd(perf.value)],
              ['Profit / loss', signed(perf.pnlUsd) + (perf.pnlPct != null ? ` · ${perf.pnlPct}%` : '')],
              ['Free to invest', usd(perf.deployableCash)],
              ['Open positions', String(positions.length)],
              ['Closed trades', String(perf.closedTrades ?? 0)],
              ['Win rate', perf.winRatePct != null ? `${perf.winRatePct}%` : '—'],
              ['Worst dip', perf.drawdownPct != null ? `${perf.drawdownPct}%` : '—'],
              ['Started with', usd(perf.startingCash)]].map(([k, v]) => (
              <div key={k} className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/60 p-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">{k}</p>
                <p className="truncate text-[12.5px] font-semibold text-slate-100" title={String(v)}>{v}</p>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[10.5px] text-slate-500">This strategy trades its own ring-fenced {usd(perf.startingCash)} of virtual cash, so its results are never mixed with your other strategies.</p>
        </div>
      )}

      {/* ---- Waiting for your approval ---- */}
      {approvals.map((pr) => (
        <div key={pr.proposalId} className="rounded-xl border border-sky-500/30 bg-sky-500/[0.06] p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-sky-300"><HandCoins className="h-3.5 w-3.5" />Needs your approval</p>
          <p className="mt-0.5 text-[14px] font-bold text-white">{pr.side} {pr.asset} · {usd(pr.notionalValue)}</p>
          <p className="text-[11.5px] text-slate-400">Ref {usd(pr.referencePrice)} · est. fees {usd(pr.estimatedFees)}{pr.invalidationPrice ? ` · invalidation ${usd(pr.invalidationPrice)}` : ''}</p>
          {pr.reason && <p className="mt-1 text-[12px] leading-relaxed text-slate-300">{pr.reason}</p>}
          {(pr.typedRuleResults || []).map((rule) => <p key={rule.ruleId} className="text-[11px] text-sky-200">{rule.kind}: {rule.state}{rule.observed != null ? ` · observed ${rule.observed} vs ${rule.threshold}` : ''}</p>)}
          <div className="mt-2 flex gap-2">
            <Button size="sm" disabled={!!pending[pr.proposalId]} onClick={() => approve(pr)} className="h-7 gap-1 bg-emerald-600 px-2.5 text-[12px] hover:bg-emerald-500">
              {pending[pr.proposalId] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Approve
            </Button>
            <Button size="sm" variant="outline" disabled={!!pending[pr.proposalId]} onClick={() => skip(pr)} className="h-7 gap-1 border-slate-700 px-2.5 text-[12px] text-slate-300">
              <XCircle className="h-3.5 w-3.5" />Skip
            </Button>
          </div>
        </div>
      ))}

      {/* ---- Positions ---- */}
      {positions.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Open positions</p>
          <div className="space-y-1.5">
            {positions.map((q) => (
              <div key={q.paperPositionId} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1.5 text-[11.5px]">
                <span className="font-bold text-white">{q.asset}</span>
                <span className="text-slate-400">{Number(q.netQuantity).toLocaleString(undefined, { maximumFractionDigits: 8 })} @ {usd(q.averageEntryPrice)}</span>
                <span className="text-slate-500">now {usd(q.currentPrice)}</span>
                <span className={Number(q.unrealizedPnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{signed(q.unrealizedPnl)}</span>
                <button disabled={busy} onClick={() => closePos(q.paperPositionId)} className="ml-auto rounded-md border border-slate-700 px-2 py-0.5 text-[11px] font-semibold text-slate-300 hover:text-white">Close</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- Activity ---- */}
      {p.paperAccountId && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Activity</p>
          {activity.length ? (
            <div className="space-y-1">
              {activity.slice(0, 8).map((a, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px]">
                  <span className="w-36 shrink-0 font-semibold text-slate-300">{(a.eventType || '').replace(/_/g, ' ').toLowerCase()}</span>
                  <span className="flex-1 text-slate-500">{a.note}</span>
                  {a.amount != null && <span className="font-mono text-slate-400">{usd(a.amount)}</span>}
                </div>
              ))}
            </div>
          ) : <p className="text-[12px] text-slate-500">Nothing has happened on this strategy yet.</p>}
        </div>
      )}
      {proposalHistory.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Earlier Review proposals · history only</p>
          <div className="space-y-1">
            {proposalHistory.map((pr) => (
              <p key={pr.proposalId} className="text-[11px] text-slate-400">
                v{pr.strategyVersion} · {pr.side} {pr.asset} · {String(pr.status || '').replace(/_/g, ' ').toLowerCase()}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ sid, onChange, onRevise }) {
  const [s, setS] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [bt, setBt] = useState(null);
  const [btBusy, setBtBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const j = await readStudio(`/v1/albert/studio/strategies/${sid}`,
        (data) => data.strategyId === sid && !!data.contract);
      setS(j); setBt(j.backtest || null);
    } catch (error) {
      setS(null); setBt(null);
      setLoadError(readError('Strategy details', error));
    }
  }, [sid]);
  useEffect(() => { setS(null); setBt(null); setLoadError(''); load(); }, [load]);

  const runBt = async () => {
    setBtBusy(true); setErr('');
    try {
      const r = await post(`/v1/albert/studio/strategies/${sid}/backtest`, {});
      const j = await r.json();
      if (r.ok) setBt(j.backtest || { error: 'INCOMPLETE_DATA', message: 'Backtest data unavailable.' });
      else setErr(j.detail || 'Backtest failed.');
    } catch (e) { setErr('Backtest failed; no result was saved.'); }
    finally { setBtBusy(false); }
  };
  const doCmd = async (cmd, extra) => {
    setBusy(true); setErr('');
    try {
      const r = await post(`/v1/albert/studio/strategies/${sid}/${cmd}`, { confirm: true, idempotencyKey: idem(),
        expectedVersion: s.version, ...(extra || {}) });
      const j = await r.json();
      if (r.ok) { await load(); onChange && onChange(); }
      else setErr(j.detail || `${cmd} failed.`);
    } catch (e) { setErr(`${cmd} failed.`); }
    finally { setBusy(false); }
  };

  if (!s) return (
    <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
      {loadError ? (
        <div className="space-y-2">
          <p role="alert" className="text-[12px] text-amber-300">{loadError}</p>
          <Button size="sm" variant="outline" onClick={load} className="border-slate-700 text-slate-200">Retry strategy details</Button>
        </div>
      ) : <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
    </Card>
  );
  const meta = !s.canStart && (s.entryBlockers || []).length > 0 && !['LIVE', 'WAIT', 'UNAVAILABLE', 'NEEDS_CHANGES', 'RESTRICTED_IN_WALLET', 'ARCHIVED', 'HALTED_RISK'].includes(s.paperStatus)
    ? { label: 'Needs changes', color: 'text-amber-300' } : ps(s.paperStatus);
  return (
    <Card className="border-0 bg-slate-900 p-5 ring-1 ring-slate-800">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-base font-bold text-white">{s.name}</h3>
        <Badge variant="outline" className={`border-slate-700 text-[11px] ${meta.color}`}>{meta.label}</Badge>
        <span className="text-[11px] text-slate-500">v{s.version}</span>
        {s.paperStatus !== 'ARCHIVED' && <Button size="sm" variant="outline" onClick={() => onRevise?.(s)} className="ml-auto h-7 border-slate-700 text-[12px] text-slate-200">Revise plan</Button>}
      </div>
      <p className="text-[13px] text-slate-300">{s.summary}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(s.assetCapabilities || []).map((cap) => <CoinCapability key={cap.symbol} item={cap} />)}
      </div>
      <p className="mt-2 text-[12px] text-slate-400">Wallet: <span className="font-semibold text-slate-200">{s.walletName || 'Not started'}</span> · Starting virtual balance: {usd(s.startingCash || s.contract?.startingCash)}. Revisions keep the same wallet, holdings and history.</p>

      <div className="mt-3 overflow-hidden rounded-lg border border-slate-800">
        <table className="w-full text-[13px]">
          <thead className="bg-slate-950/60 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-1.5 text-left">Asset</th><th className="px-3 py-1.5 text-right">Weight</th></tr></thead>
          <tbody>
            {(s.contract?.assets || []).map((a) => (
              <tr key={a.symbol} className="border-t border-slate-800/70"><td className="px-3 py-1.5 font-semibold text-slate-200">{a.symbol}</td><td className="px-3 py-1.5 text-right font-mono text-slate-300">{a.weightPct}%</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Backtest */}
      <div className="mt-4">
        <div className="flex items-center gap-2">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-slate-400"><FlaskConical className="h-3.5 w-3.5" />Historical context · not a paper-rule replay</p>
          <Button size="sm" onClick={runBt} disabled={btBusy} className="ml-auto h-7 gap-1 bg-slate-700 px-2.5 text-[12px] hover:bg-slate-600">{btBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}Run backtest</Button>
        </div>
        {bt && !bt.error && (
          <div className="mt-2 space-y-2">
            {/* Decision-useful results stay in plain sight. */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[['Illustrative model return', `${bt.totalReturnPct}%`],
                ['Bitcoin over the same period', `${bt.benchmarkReturnPct}%`],
                ['Worst drawdown', `${bt.maxDrawdownPct}%`],
                ['Tested period', `${bt.sampleSizeDays} days · ${bt.dataCoveragePct}% covered`]].map(([l, v]) => (
                <div key={l} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">{l}</p>
                  <p className="text-sm font-bold text-white">{v}</p>
                </div>
              ))}
            </div>
            <p className="max-w-[80ch] text-[12.5px] leading-relaxed text-slate-300">
              Over the last {bt.sampleSizeDays} days, this separate historical illustration returned {bt.totalReturnPct}% versus {bt.benchmarkReturnPct}% for simply holding Bitcoin, with a worst peak-to-trough fall of {bt.maxDrawdownPct}%. It is not a replay of the reviewed plan’s canonical decisions. Trading costs are included in this illustration; actual virtual results are shown in the paper wallet above.
            </p>
            <Methodology bt={bt} contractHash={s.contractHash} />
          </div>
        )}
        {bt && bt.error && <p role="alert" className="mt-2 text-[12px] text-amber-400">{bt.message || 'Historical data is incomplete.'}{(bt.missingAssets || []).length ? ` Missing: ${bt.missingAssets.map((a) => `${a.symbol} (${a.reason})`).join(', ')}.` : ''} No weights were changed and no return was calculated.</p>}
      </div>

      {/* Paper trading lives HERE, on the strategy — one journey, no separate setup. */}
      <PaperPanel sid={sid} name={s.name} onChange={() => { load(); onChange && onChange(); }} />

      {/* Archive is only offered when the strategy is not trading. */}
      {!['LIVE', 'WAIT', 'UNAVAILABLE', 'NEEDS_CHANGES', 'RESTRICTED_IN_WALLET', 'ARCHIVED'].includes(s.paperStatus) && (
        <div className="mt-3 flex items-center gap-2 border-t border-slate-800 pt-3">
          <ConfirmBtn label="Archive strategy" icon={Archive} tone="slate" busy={busy} onConfirm={() => doCmd('archive')} />
          <span className="text-[11px] text-slate-500">Archiving hides it from your list; nothing is deleted.</span>
        </div>
      )}
      {err && <p className="mt-2 text-[12px] font-medium text-red-400">{err}</p>}
    </Card>
  );
}

export default function StrategyStudio({ chatGoal = '', chatDraftKey = null, onChatDismiss }) {
  const [list, setList] = useState([]);
  const [listError, setListError] = useState('');
  const [sel, setSel] = useState(() => typeof window !== 'undefined' ? window.sessionStorage.getItem('dashboard:selectedStrategyId') || null : null);
  const [revision, setRevision] = useState(null);
  const [building, setBuilding] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setListError('');
    try {
      const j = await readStudio('/v1/albert/studio/strategies', (data) => Array.isArray(data.strategies));
      setList(j.strategies);
    } catch (error) {
      setList([]); setSel(null);
      setListError(readError('Strategy list', error));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sel) window.sessionStorage.setItem('dashboard:selectedStrategyId', sel);
    else window.sessionStorage.removeItem('dashboard:selectedStrategyId');
  }, [sel]);
  useEffect(() => {
    const requested = typeof window !== 'undefined' ? window.sessionStorage.getItem('dashboard:strategyId') : null;
    if (requested) { window.sessionStorage.removeItem('dashboard:strategyId'); setSel(requested); setBuilding(false); }
  }, []);
  useEffect(() => { if (chatDraftKey) { setRevision(null); setSel(null); setBuilding(true); } }, [chatDraftKey]);
  const revise = (s) => {
    setRevision({ id: s.strategyId, version: s.version, goal: s.contract?.requestedPlan || '',
      draft: { ...(s.contract || {}), name: s.name, rules: s.contract?.rules || [],
        walletName: s.walletName || `${s.name} wallet`,
        startingCash: s.startingCash || '100000.00' } });
    setSel(null); setBuilding(true); onChatDismiss?.();
  };
  const liveCount = list.filter((s) => s.isLive).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <Crosshair className="h-5 w-5 text-violet-400" />
        <h1 className="text-lg font-bold text-white">Strategies</h1>
        <span className="text-[12px] text-slate-500">Build with Albert &rarr; save &rarr; start paper trading</span>
        {liveCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{liveCount} paper trading
          </span>
        )}
        <Button size="sm" onClick={() => { onChatDismiss?.(); setRevision(null); setBuilding(true); setSel(null); }} className="ml-auto gap-1.5 bg-violet-600 hover:bg-violet-500"><Plus className="h-4 w-4" />New with Albert</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-2 lg:col-span-1">
          {loading && <p className="text-[13px] text-slate-500">Loading…</p>}
          {!loading && listError && (
            <Card className="border-0 bg-slate-900 p-5 ring-1 ring-amber-500/30">
              <p role="alert" className="text-[13px] text-amber-200">{listError}</p>
              <Button size="sm" variant="outline" onClick={load} className="mt-3 border-slate-700 text-slate-200">Retry strategies</Button>
            </Card>
          )}
          {!loading && !listError && list.length === 0 && !building && (
            <Card className="border-0 border-dashed bg-slate-900 p-5 text-center ring-1 ring-slate-800">
              <p className="text-[13px] text-slate-400">No strategies yet. Build your first with Albert.</p>
              <Button size="sm" onClick={() => setBuilding(true)} className="mt-3 gap-1.5 bg-violet-600 hover:bg-violet-500"><Plus className="h-4 w-4" />New with Albert</Button>
            </Card>
          )}
          {list.map((s) => {
            const m = !s.canStart && (s.entryBlockers || []).length > 0 && !['LIVE', 'WAIT', 'UNAVAILABLE', 'NEEDS_CHANGES', 'RESTRICTED_IN_WALLET', 'ARCHIVED', 'HALTED_RISK'].includes(s.paperStatus)
              ? { label: 'Needs changes', color: 'text-amber-300', dot: 'bg-amber-400' } : ps(s.paperStatus);
            return (
              <button key={s.strategyId} onClick={() => { setSel(s.strategyId); setRevision(null); setBuilding(false); onChatDismiss?.(); }}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${sel === s.strategyId ? 'border-violet-500/50 bg-violet-500/[0.06]' : 'border-slate-800 bg-slate-900 hover:border-slate-700'}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-white">{s.name}</p>
                  <span className={`inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold ${m.color}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{m.label}
                  </span>
                </div>
                <p className="mt-1 truncate text-[12px] text-slate-500">
                  {(s.contract?.assets || []).map((a) => a.symbol).join(' · ')} · v{s.version}
                  {s.approvalMode ? ` · ${s.approvalMode === 'AUTOPILOT' ? 'Autopilot' : 'Review and approve'}` : ''}
                </p>
              </button>
            );
          })}
        </div>
        <div className="lg:col-span-2">
          {building ? <Builder key={revision ? `${revision.id}:v${revision.version}` : chatDraftKey || 'new'}
              initialGoal={revision ? revision.goal : chatGoal} initialDraft={revision?.draft || null} revisionId={revision?.id || null}
              onCancel={() => { setBuilding(false); if (revision) setSel(revision.id); setRevision(null); onChatDismiss?.(); }}
              onSaved={(sid) => { setBuilding(false); setRevision(null); onChatDismiss?.(); load(); setSel(sid); }} />
            : sel ? <Detail key={sel} sid={sel} onChange={load} onRevise={revise} />
            : <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800"><p className="text-[13px] text-slate-400">Select a strategy, or build a new one with Albert.</p></Card>}
        </div>
      </div>
      <p className="flex items-start justify-center gap-1.5 pt-1 text-center text-[11px] text-slate-600">
        <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500/70" />
        Paper trading only — virtual money, no exchange keys, and it can never place a real order. Saving stores the exact reviewed plan as an immutable, hashed version; starting binds that exact version to the strategy&rsquo;s own paper wallet.
      </p>
    </div>
  );
}
