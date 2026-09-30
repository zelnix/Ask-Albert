'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Crosshair, Plus, Loader2, Sparkles, ShieldCheck, ChevronDown, Play, Square, Archive,
  FlaskConical, CheckCircle2, AlertTriangle, ArrowRight, X, Bot, Info,
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
  sizing: 'STRATEGY_DEFINED',
};

const get = (path, signal) => fetch(`${API_BASE}${path}`, { credentials: 'include', cache: 'no-store', signal });


/**
 * Convert a structured chat proposal into a Studio-compatible draft object.
 * Maps proposal.legs → assets, proposal.rules → rules, preserving capital/horizon/thesis.
 */
function proposalToDraft(proposal) {
  const legs = proposal.legs || [];
  const assets = legs.map((l) => ({
    symbol: String(l.symbol || '').toUpperCase(),
    direction: String(l.position || l.direction || 'long').toUpperCase(),
    weightPct: Number(l.weight_pct || l.weight || 0),
    // Preserve targets[] (array) and stop from legs.
    targets: Array.isArray(l.targets) ? l.targets : (l.target ? [l.target] : []),
    stop: l.stop || null,
    stopPct: l.stop_pct != null ? Number(l.stop_pct) : (l.stop?.stop_pct != null ? Number(l.stop.stop_pct) : undefined),
    notes: l.notes || '',
  }));

  // Deterministically translate leg targets/stops into typed executable rules.
  // For TAKE_PROFIT_PCT and STOP_LOSS_PCT rules, value must be a percentage
  // (e.g. "8" for 8%) — not an absolute price. These rule kinds do NOT accept
  // an operator or indicator field.
  const rules = [];
  legs.forEach((l) => {
    const sym = String(l.symbol || '').toUpperCase();
    const entry = Number(l.entry_price) || 0;
    const isShort = /short/i.test(l.position || l.direction || 'long');

    // Translate targets[] into TAKE_PROFIT_PCT rules.
    // PARTIAL_TAKE_PROFIT_PCT is retired — all targets become full TAKE_PROFIT_PCT.
    (Array.isArray(l.targets) ? l.targets : []).forEach((t, ti) => {
      if (!t) return;
      // Prefer explicit exit_pct; otherwise compute from absolute price vs entry.
      let pctVal = t.exit_pct != null ? Number(t.exit_pct) : null;
      if (pctVal == null && t.price != null && entry > 0) {
        const diff = isShort ? (entry - Number(t.price)) : (Number(t.price) - entry);
        pctVal = Math.round(diff / entry * 10000) / 100; // two-decimal %
      }
      if (pctVal == null || pctVal <= 0) return;
      rules.push({ kind: 'TAKE_PROFIT_PCT', side: 'SELL', symbol: sym, value: String(pctVal),
        _fromTarget: true, _label: t.label || `TP${ti + 1}` });
    });
    // Translate stop into STOP_LOSS_PCT rule — value is a percentage.
    let stopPctVal = l.stop_pct != null ? Number(l.stop_pct) : (l.stop?.stop_pct != null ? Number(l.stop.stop_pct) : null);
    if (stopPctVal == null && l.stop?.price != null && entry > 0) {
      const diff = isShort ? (Number(l.stop.price) - entry) : (entry - Number(l.stop.price));
      stopPctVal = Math.round(diff / entry * 10000) / 100;
    }
    if (stopPctVal != null && stopPctVal > 0) {
      rules.push({ kind: 'STOP_LOSS_PCT', side: 'SELL', symbol: sym,
        value: String(stopPctVal), _fromStop: true });
    }
  });

  // Preserve text-based rules from the proposal, mapping to Studio format.
  if (proposal.entryConditions) rules.push({ type: 'ENTRY', description: proposal.entryConditions });
  if (proposal.profitTaking) rules.push({ type: 'PROFIT_TAKING', description: proposal.profitTaking });
  if (proposal.stopLoss) rules.push({ type: 'STOP_LOSS', description: proposal.stopLoss });
  if (proposal.managementRules) rules.push({ type: 'MANAGEMENT', description: proposal.managementRules });
  if (Array.isArray(proposal.rules)) {
    proposal.rules.forEach((r) => {
      if (typeof r === 'string') rules.push({ type: 'OTHER', description: r });
      else if (r && (r.kind || r.description)) rules.push(r);
    });
  }

  // Unresolved or unsupported instructions — visible start blockers.
  const unresolved = [];
  const uSrc = proposal.unresolvedInstructions || proposal.unsupportedInstructions;
  if (uSrc) {
    (Array.isArray(uSrc) ? uSrc : [uSrc])
      .forEach((u) => unresolved.push(typeof u === 'string' ? u : u?.description || JSON.stringify(u)));
  }
  return {
    name: proposal.title || proposal.name || 'Chat Strategy',
    requestedPlan: proposal.thesis || '',
    assets,
    rules: rules.length ? rules : undefined,
    unresolvedInstructions: unresolved.length ? unresolved : undefined,
    startingCash: proposal.startingCapital ? String(proposal.startingCapital) : (proposal.capital ? String(proposal.capital) : undefined),
    currency: proposal.currency || 'USD',
    reservePct: proposal.reservePct != null ? Number(proposal.reservePct) : (proposal.protectedReserve != null ? Number(proposal.protectedReserve) : undefined),
    horizonDays: proposal.horizon_days || proposal.horizonDays || undefined,
    objective: proposal.objective || proposal.thesis || '',
    walletName: proposal.walletName || undefined,
    ...STUDIO_EXEC_RULES,
    // Preserve entry sizing from proposal; do NOT default — missing sizing = "Needs changes"
    entrySizing: proposal.entrySizing || undefined,
    portfolioGoals: proposal.portfolioGoals || undefined,
  };
}

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
  LIVE: { label: 'Auto Run active', color: 'text-emerald-300', dot: 'bg-emerald-400' },
  WAIT: { label: 'WAIT · awaiting conditions', color: 'text-amber-300', dot: 'bg-amber-400' },
  UNAVAILABLE: { label: 'Paper worker unavailable', color: 'text-amber-300', dot: 'bg-amber-400' },
  HALTED_GOAL_CLOSED: { label: 'Goal reached — all closed', color: 'text-emerald-300', dot: 'bg-emerald-400' },
  HALTED_GOAL_ENTRIES: { label: 'Goal reached — managing exits', color: 'text-teal-300', dot: 'bg-teal-400' },
  GOAL_CLOSE_PENDING: { label: 'Goal reached — closing remaining positions', color: 'text-amber-300', dot: 'bg-amber-400' },
  RESTRICTED_IN_WALLET: { label: 'Restricted in this wallet · exits preserved', color: 'text-amber-300', dot: 'bg-amber-400' },
  NEEDS_CHANGES: { label: 'Needs changes · exits only', color: 'text-amber-300', dot: 'bg-amber-400' },
  HALTED_RISK: { label: 'Halted — drawdown limit', color: 'text-rose-300', dot: 'bg-rose-400' },
  ARCHIVED: { label: 'Archived', color: 'text-slate-500', dot: 'bg-slate-600' },
};
const ps = (s) => PAPER_STATUS[s] || PAPER_STATUS.SAVED;


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
    ...STUDIO_EXEC_RULES, ...initialDraft, rules: initialDraft.rules || [],
    walletName: initialDraft.walletName || `${initialDraft.name || 'Strategy'} wallet`,
    startingCash: initialDraft.startingCash || '',
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
          summary: j.summary,
          saveErrors: j.saveErrors || [], startErrors: j.startErrors || [],
          errors: j.validationErrors || [],
          capabilities: j.assetCapabilities || [], for: JSON.stringify(draft) } : null);
      } catch (e) { if (active) { setReview(null); setErr('Validation unavailable; nothing can be saved.'); } }
    }, 300);
    return () => { active = false; clearTimeout(t); };
  }, [draft]);

  const updateDraft = (next) => { setReview(null); setErr(''); setDraft(next); };
  // Save is allowed when there are no save_errors. start_errors allow saving as "Needs changes — not trading."
  const hasSaveErrors = !!review && (review.saveErrors || []).length > 0;
  const hasStartErrors = !!review && (review.startErrors || []).length > 0;
  const readyToSave = !!review && review.for === JSON.stringify(draft) && !hasSaveErrors;

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
      setDraft({ ...STUDIO_EXEC_RULES, ...j.draft });
      setReview({ contract: j.contract, hash: j.contractHash, summary: j.summary,
        saveErrors: j.saveErrors || [], startErrors: j.startErrors || [],
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

  // Stable save key: one reviewed proposal has one stable save-operation identifier.
  // A material edit invalidates it.
  const [saveKey, setSaveKey] = useState(() => idem());
  useEffect(() => { if (review && review.hash) setSaveKey('k_' + review.hash + '_' + (revisionId || 'new')); }, [review?.hash, revisionId]);
  const [inflight, setInflight] = useState(false);

  const save = async () => {
    if (!readyToSave || inflight) { setErr(hasSaveErrors ? 'Cannot save: fix the errors above first.' : 'Needs changes — wait for a valid review before saving.'); return; }
    setInflight(true);
    setBusy(true); setErr('');
    try {
      const r = await post('/v1/albert/studio/save', { draft, name: draft.name, strategyId: revisionId,
        confirm: true, idempotencyKey: saveKey, expectedHash: review.hash });
      const j = await r.json();
      if (r.ok) onSaved(j.strategyId);
      else setErr(j.detail || 'Save failed.');
    } catch (e) { setErr('Save failed — your edits are preserved. Try again.'); }
    finally { setBusy(false); setInflight(false); }
  };

  return (
    <Card className="border-0 bg-slate-900 p-5 ring-1 ring-slate-800">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-400" />
        <h3 className="text-sm font-bold text-white">{revisionId ? 'Review a new version' : initialDraft?.fromProposal ? 'Review chat strategy proposal' : 'Build a strategy with Albert'}</h3>
        <button onClick={onCancel} className="ml-auto rounded p-1 text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
      </div>
      {revisionId && <p className="mb-3 text-[12px] text-amber-200">Saving a reviewed version stops new entries under the old version. It keeps this strategy’s existing wallet, cash, holdings, and history. Start Auto Run for the new version when ready.</p>}
      {!draft && (
        <div>
          <p className="mb-2 text-[13px] text-slate-400">Describe the exact simulated plan: coins, weights, wallet name and starting cash, optional price or 24-hour percentage conditions, RSI/SMA/EMA/MACD indicators, and stop-loss or take-profit percentages, portfolio profit targets and equity floors. Albert checks each rule before Save. Macro and tokenomics inform assessment, never automatic trade triggers.</p>
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
            <label className="text-[12px] text-slate-400">Horizon (days)
              <input type="number" min="1" max="3650" value={draft.horizonDays ?? ''} onChange={(e) => setField('horizonDays', e.target.value ? Number(e.target.value) : undefined)} placeholder="Optional" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-white outline-none focus:border-sky-500" /></label>
            <label className="text-[12px] text-slate-400">Objective
              <input value={draft.objective || ''} onChange={(e) => setField('objective', e.target.value)} placeholder="Optional thesis or goal" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-white outline-none focus:border-sky-500" /></label>
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
            <p className="mt-1">BUY: all of that coin’s triggers and canonical BUY must pass. SELL: any reviewed exit trigger closes that coin’s holding. Missing indicator or price data means WAIT, not a substitute. Auto Run uses only your reviewed strategy rules.</p>
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
                  onChange={(e) => setRule(i, { kind: e.target.value, side: ['STOP_LOSS_PCT', 'TAKE_PROFIT_PCT'].includes(e.target.value) ? 'SELL' : rule.side,
                    operator: ['STOP_LOSS_PCT', 'TAKE_PROFIT_PCT'].includes(e.target.value) ? '' : (rule.operator || 'BELOW'), indicator: e.target.value === 'INDICATOR' ? 'RSI_14' : '' })}
                  className="rounded-md bg-slate-800 p-1 text-white">
                  <option value="PRICE">Price (USD)</option><option value="CHANGE_PCT_24H">Rolling 24h change (%)</option>
                  <option value="INDICATOR">Indicator (closed daily)</option><option value="STOP_LOSS_PCT">Stop-loss from entry (%)</option>
                  <option value="TAKE_PROFIT_PCT">Take-profit from entry (%)</option>
                </select>
                {rule.kind === 'INDICATOR' && <select aria-label={`Rule ${i + 1} indicator`} value={rule.indicator || 'RSI_14'} onChange={(e) => setRule(i, { indicator: e.target.value })} className="rounded-md bg-slate-800 p-1 text-white">
                  <option value="RSI_14">RSI 14</option><option value="SMA_20">SMA 20</option><option value="EMA_20">EMA 20</option><option value="MACD_HIST">MACD histogram</option>
                </select>}
                {['PRICE', 'CHANGE_PCT_24H', 'INDICATOR'].includes(rule.kind) && <select aria-label={`Rule ${i + 1} comparison`} value={rule.operator || 'BELOW'} onChange={(e) => setRule(i, { operator: e.target.value })} className="rounded-md bg-slate-800 p-1 text-white"><option value="BELOW">Below</option><option value="ABOVE">Above</option></select>}
                {rule.kind !== 'STOP_LOSS_PCT' && rule.kind !== 'TAKE_PROFIT_PCT' && <input type="number" aria-label={`Rule ${i + 1} threshold`} value={rule.value ?? ''} onChange={(e) => setRule(i, { value: e.target.value })} placeholder="threshold" className="w-24 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-white" />}
                {(rule.kind === 'STOP_LOSS_PCT' || rule.kind === 'TAKE_PROFIT_PCT') && <input type="number" aria-label={`Rule ${i + 1} threshold`} value={rule.value ?? ''} onChange={(e) => setRule(i, { value: e.target.value })} placeholder="%" className="w-24 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-white" />}
                <button type="button" onClick={() => updateDraft({ ...draft, rules: draft.rules.filter((_, ix) => ix !== i) })} aria-label={`Remove rule ${i + 1}`} className="rounded p-1 text-rose-300"><X className="h-4 w-4" /></button>
              </div>)}
              <button type="button" onClick={addRule} className="inline-flex items-center gap-1 font-semibold text-sky-300"><Plus className="h-3.5 w-3.5" />Add executable rule</button>
            </div>
            {Object.entries(STUDIO_EXEC_RULES).some(([k, v]) => draft[k] !== v) &&
              <p role="alert" className="mt-1 text-amber-300">Needs changes — the canonical base gates were altered. Use the typed triggers above; nothing will be silently substituted.</p>}
          </div>
          {/* ── Entry Sizing ── */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-[12px] text-slate-300">
            <p className="font-semibold text-white">Entry sizing · how much per BUY</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <select value={(draft.entrySizing?.method) || ''}
                onChange={(e) => updateDraft({ ...draft, entrySizing: e.target.value ? { method: e.target.value, ...(e.target.value === 'FIXED_USD' ? { amount: draft.entrySizing?.amount || '' } : { pct: draft.entrySizing?.pct || '' }) } : undefined })}
                className="rounded-md bg-slate-800 p-1.5 text-white">
                <option value="">— select sizing —</option>
                <option value="FIXED_USD">Fixed USD per trade</option>
                <option value="PCT_AVAILABLE_CASH">% of available cash</option>
              </select>
              {draft.entrySizing?.method === 'FIXED_USD' && (
                <label className="flex items-center gap-1 text-slate-400">$
                  <input type="number" min="1" step="1" value={draft.entrySizing?.amount ?? ''} onChange={(e) => updateDraft({ ...draft, entrySizing: { ...draft.entrySizing, amount: e.target.value ? Number(e.target.value) : '' } })}
                    placeholder="500" className="w-28 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-white" />
                </label>
              )}
              {draft.entrySizing?.method === 'PCT_AVAILABLE_CASH' && (
                <label className="flex items-center gap-1 text-slate-400">
                  <input type="number" min="1" max="100" value={draft.entrySizing?.pct ?? ''} onChange={(e) => updateDraft({ ...draft, entrySizing: { ...draft.entrySizing, pct: e.target.value ? Number(e.target.value) : '' } })}
                    className="w-20 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-white" /> % of cash
                </label>
              )}
            </div>
          </div>
          {/* ── Portfolio Goals (optional) ── */}
          <details className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-[12px] text-slate-300">
            <summary className="cursor-pointer font-semibold text-white">Portfolio goals (optional) · profit target, equity floor, max trades</summary>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-slate-400">Profit target (%)
                <input type="number" min="0" step="0.1" value={draft.portfolioGoals?.profitTargetPct ?? ''} onChange={(e) => updateDraft({ ...draft, portfolioGoals: { ...(draft.portfolioGoals || {}), profitTargetPct: e.target.value ? Number(e.target.value) : undefined } })}
                  placeholder="e.g. 20" className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-white" /></label>
              <label className="text-slate-400">Equity floor (USD)
                <input type="number" min="0" step="1" value={draft.portfolioGoals?.equityFloorUsd ?? ''} onChange={(e) => updateDraft({ ...draft, portfolioGoals: { ...(draft.portfolioGoals || {}), equityFloorUsd: e.target.value ? Number(e.target.value) : undefined } })}
                  placeholder="e.g. 90000" className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-white" /></label>
              <label className="text-slate-400">Max drawdown (%)
                <input type="number" min="0" max="100" step="0.1" value={draft.portfolioGoals?.maxDrawdownPct ?? ''} onChange={(e) => updateDraft({ ...draft, portfolioGoals: { ...(draft.portfolioGoals || {}), maxDrawdownPct: e.target.value ? Number(e.target.value) : undefined } })}
                  placeholder="e.g. 15" className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-white" /></label>
              <label className="text-slate-400">Max trades (completed)
                <input type="number" min="1" step="1" value={draft.portfolioGoals?.maxTrades ?? ''} onChange={(e) => updateDraft({ ...draft, portfolioGoals: { ...(draft.portfolioGoals || {}), maxTrades: e.target.value ? Number(e.target.value) : undefined } })}
                  placeholder="e.g. 50" className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-white" /></label>
              <label className="text-slate-400">End action
                <select value={draft.portfolioGoals?.endAction || 'CLOSE_ALL_AND_STOP'} onChange={(e) => updateDraft({ ...draft, portfolioGoals: { ...(draft.portfolioGoals || {}), endAction: e.target.value } })}
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-white">
                  <option value="CLOSE_ALL_AND_STOP">Close all positions and stop</option>
                  <option value="STOP_ENTRIES_MANAGE_OPEN">Stop new entries, manage open</option>
                </select></label>
            </div>
          </details>
          {draft.requestedPlan && <details className="text-[12px] text-slate-400"><summary className="cursor-pointer">Original request being reviewed</summary><p className="mt-1 whitespace-pre-wrap">{draft.requestedPlan}</p></details>}
          <button type="button" onClick={() => { setGoal(draft.requestedPlan || goal); setDraft(null); setReview(null); setErr(''); }} className="text-[12px] font-semibold text-sky-400 hover:text-sky-300">Edit request &amp; redraft</button>
          {review && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400"><ShieldCheck className="h-3.5 w-3.5" />{hasSaveErrors ? 'Cannot save' : hasStartErrors ? 'Reviewed · needs changes before trading' : 'Reviewed'} · hash {review.hash}</p>
              <p className="text-[13px] text-slate-200">{review.summary}</p>
              {(review.capabilities || []).length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{review.capabilities.map((cap) => <CoinCapability key={cap.symbol} item={cap} />)}</div>}
              {(review.saveErrors || []).length > 0 && (
                <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2">
                  <p className="mb-1 text-[11px] font-bold text-red-300">Cannot save — fix these first:</p>
                  <ul className="space-y-0.5 text-[12px] text-red-400">
                    {review.saveErrors.map((e, i) => <li key={i} className="flex items-start gap-1.5"><XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{e}</li>)}
                  </ul>
                </div>
              )}
              {(review.startErrors || []).length > 0 && (
                <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
                  <p className="mb-1 text-[11px] font-bold text-amber-300">Needs changes before trading (save is allowed):</p>
                  <ul className="space-y-0.5 text-[12px] text-amber-200">
                    {review.startErrors.map((e, i) => <li key={i} className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{e}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
          {!review && <p role="status" className="text-[12px] text-amber-300">Checking this draft — Save is disabled until validation completes.</p>}
          {err && <p role="alert" className="text-[12px] font-medium text-red-400">{err}</p>}
          <div className="flex items-center gap-2">
            <ConfirmBtn label={hasStartErrors ? 'Save (needs changes — not trading)' : 'Save strategy'} icon={CheckCircle2} tone={hasStartErrors ? 'amber' : 'emerald'} busy={busy} disabled={!readyToSave}
              onConfirm={save} />
            <span className="text-[11px] text-slate-500">{hasStartErrors ? 'Saves the plan with unresolved start blockers. Trading is disabled until they are resolved.' : 'Saves the exact plan you reviewed. Saving never starts trading \u2014 you choose that next.'}</span>
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
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />Methodology &amp; integrity
      </button>
      {open && (
        <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 text-[11px] sm:grid-cols-3">
          {[['Benchmark', bt.benchmark],
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
   Auto Run, ON the strategy (M-G)
   -------------------------------------------------------------------
   Build -> save -> start Auto Run. No separate setup, no Observe
   mode, no account picker: the strategy owns its own paper wallet and
   its own Status, Activity and Performance.
   =================================================================== */
function PaperPanel({ sid, name, onChange }) {
  const [p, setP] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState(null);
  const [arming, setArming] = useState(false);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const j = await readStudio(`/v1/albert/studio/strategies/${sid}/paper`,
        (data) => data.strategyId === sid && typeof data.paperStatus === 'string'
          && typeof data.canStart === 'boolean');
      setP(j);
    } catch (error) {
      setP(null);
      setLoadError(readError('Auto Run status', error));
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

  const closePos = async (symbol) => {
    setBusy(true);
    try {
      const acctId = p.paperAccountId;
      await post(`/v1/albert/paper/accounts/${acctId}/close-position`, { symbol, confirm: true, idempotencyKey: idem() });
    } catch (e) { /* noop */ }
    await load(); setBusy(false);
  };

  const updateSL = async (symbol, value) => {
    setBusy(true);
    try {
      const acctId = p.paperAccountId;
      await fetch(`${API_BASE}/v1/albert/paper/accounts/${acctId}/positions/${symbol}/stop-loss`, {
        method: 'PATCH', headers: {'Content-Type': 'application/json'},
        credentials: 'include',
        body: JSON.stringify({ stopLoss: value || null, reason: 'manual' }),
      });
    } catch (e) { /* noop */ }
    await load(); setBusy(false);
  };

  const updateTP = async (symbol, value) => {
    setBusy(true);
    try {
      const acctId = p.paperAccountId;
      await fetch(`${API_BASE}/v1/albert/paper/accounts/${acctId}/positions/${symbol}/take-profit`, {
        method: 'PATCH', headers: {'Content-Type': 'application/json'},
        credentials: 'include',
        body: JSON.stringify({ takeProfit: value || null, reason: 'manual' }),
      });
    } catch (e) { /* noop */ }
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
  const positions = p.positions || [];
  const activity = p.activity || [];
  const stale = p.marketData === 'STALE';

  return (
    <div className="mt-4 space-y-3 border-t border-slate-800 pt-3">
      {/* ---- Status + start/stop ---- */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-slate-400">
          <FlaskConical className="h-3.5 w-3.5" />Auto Run
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
                <Square className="h-3.5 w-3.5" />Stop Auto Run
              </Button>
            )
          ) : (
            arming ? (
              <>
                <Button size="sm" disabled={busy || !p.canStart} onClick={() => cmd('start-paper', { executionMode: 'AUTO_RUN' })} className="h-7 gap-1 bg-emerald-600 px-2.5 text-[12px] hover:bg-emerald-500">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Confirm start · Autopilot
                </Button>
                <button onClick={() => setArming(false)} className="rounded p-1 text-slate-400 hover:text-white"><X className="h-3.5 w-3.5" /></button>
              </>
            ) : (
              <Button size="sm" disabled={p.paperStatus === 'ARCHIVED' || !p.canStart} onClick={() => setArming(true)} className="h-7 gap-1 bg-emerald-600 px-2.5 text-[12px] hover:bg-emerald-500">
                <Play className="h-3.5 w-3.5" />{p.paperStatus === 'STOPPED' ? 'Resume Auto Run' : 'Start Auto Run'}
              </Button>
            )
          )}
        </div>
      </div>

      {(p.saveErrors || []).length > 0 && (
        <div role="status" className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-[12px] text-red-200">
          <strong>Structural issues — strategy invalid</strong>: {(p.saveErrors || []).join(' ')}
        </div>
      )}
      {(p.startErrors || []).length > 0 && !(p.saveErrors || []).length && (
        <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[12px] text-amber-200">
          <strong>Needs changes — not trading</strong>: {(p.startErrors || []).join(' ')} Existing positions and valid exits are preserved.
        </div>
      )}
      {(p.entryBlockers || []).length > 0 && !(p.saveErrors || []).length && !(p.startErrors || []).length && (
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

      {/* ---- Wallet Summary (cash, P&L, worker, goals) ---- */}
      {p.paperAccountId && p.isLive && (
        <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-[12px]">
          <div className="flex items-center justify-between">
            <p className="font-bold text-slate-300">Wallet</p>
            {p.autopilot?.workerState && (
              <span className={`text-[10px] font-medium ${p.autopilot.workerState === 'running' ? 'text-emerald-400' : p.autopilot.workerState === 'delayed' ? 'text-amber-400' : 'text-slate-500'}`}>
                Worker: {p.autopilot.workerState}{p.autopilot.lastCycleSec != null ? ` · ${p.autopilot.lastCycleSec}s` : ''}
                {p.autopilot.workerLastCompletedAt && <span className="ml-1 text-slate-500">({new Date(p.autopilot.workerLastCompletedAt + 'Z').toLocaleTimeString()})</span>}
              </span>
            )}
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            <div><p className="text-[10px] text-slate-500">Cash</p><p className="font-semibold text-slate-100">{p.cash ? usd(parseFloat(p.cash)) : '—'}</p></div>
            <div><p className="text-[10px] text-slate-500">Realized P&L</p><p className={`font-semibold ${parseFloat(p.realizedPnl || 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{p.realizedPnl ? signed(parseFloat(p.realizedPnl)) : '—'}</p></div>
            <div><p className="text-[10px] text-slate-500">Execution</p><p className="font-semibold text-slate-300">{p.executionModel === 'direct_price' ? 'Direct price · 0 fees' : 'Legacy'}</p></div>
          </div>
          {/* Goal progress */}
          {p.portfolioGoals && (
            <div className="mt-2 border-t border-slate-800 pt-2">
              <p className="text-[10px] font-bold text-slate-500 uppercase">Portfolio Goals</p>
              <div className="mt-1 grid grid-cols-2 gap-1.5 text-[11px]">
                {p.portfolioGoals.profitTargetPct && <span className="text-slate-400">Target: +{p.portfolioGoals.profitTargetPct}%</span>}
                {p.portfolioGoals.equityFloorUsd && <span className="text-slate-400">Floor: ${p.portfolioGoals.equityFloorUsd}</span>}
                {p.portfolioGoals.maxTrades && <span className="text-slate-400">Max trades: {p.goalStatus?.tradeCount || 0}/{p.portfolioGoals.maxTrades}</span>}
                {p.portfolioGoals.deadline && <span className="text-slate-400">Deadline: {p.portfolioGoals.deadline}</span>}
              </div>
              {p.goalStatus?.halted && (
                <p className="mt-1 text-[11px] font-semibold text-emerald-300">✓ {p.goalStatus.haltReason}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---- Open Positions (combined per coin) ---- */}
      {(p.positions || []).length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Open Positions ({p.positions.length})</p>
          <div className="space-y-1">
            {p.positions.map((pos) => (
              <div key={pos.symbol} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-[12px]">
                <span className="font-semibold text-sky-300">{pos.symbol}</span>
                <span className="text-slate-300">{parseFloat(pos.netQuantity).toFixed(6)}</span>
                <span className="text-slate-500">avg {usd(parseFloat(pos.averageEntryPrice))}</span>
                <span className="text-slate-500">cost {usd(parseFloat(pos.costBasis))}</span>
                {pos.stopLoss && <span className="text-rose-400/70">SL {usd(parseFloat(pos.stopLoss))}</span>}
                {pos.takeProfit && <span className="text-emerald-400/70">TP {usd(parseFloat(pos.takeProfit))}</span>}
                {pos.currentPrice && <span className="text-slate-400">now {usd(parseFloat(pos.currentPrice))}</span>}
                {pos.unrealizedPnl && <span className={parseFloat(pos.unrealizedPnl) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{signed(parseFloat(pos.unrealizedPnl))}</span>}
                <span className="ml-auto flex items-center gap-1">
                  <button disabled={busy} onClick={() => {
                    const v = prompt(`Stop-loss price for ${pos.symbol} (blank to clear):`, pos.stopLoss || '');
                    if (v !== null) updateSL(pos.symbol, v || null);
                  }} className="rounded-md border border-slate-700 px-2 py-0.5 text-[11px] font-semibold text-rose-300 hover:text-rose-200" title="Set stop-loss">SL</button>
                  <button disabled={busy} onClick={() => {
                    const v = prompt(`Take-profit price for ${pos.symbol} (blank to clear):`, pos.takeProfit || '');
                    if (v !== null) updateTP(pos.symbol, v || null);
                  }} className="rounded-md border border-slate-700 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 hover:text-emerald-200" title="Set take-profit">TP</button>
                  <button disabled={busy} onClick={() => closePos(pos.symbol)} className="rounded-md border border-slate-700 px-2 py-0.5 text-[11px] font-semibold text-slate-300 hover:text-white">Close</button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- Performance ---- */}
      {p.paperAccountId && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Performance</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[['Starting cash', usd(p.startingCash)],
              ['Current cash', p.cash ? usd(parseFloat(p.cash)) : '—'],
              ['Position value', p.totalPortfolioValue ? usd(parseFloat(p.totalPortfolioValue) - parseFloat(p.cash || 0)) : '—'],
              ['Total portfolio', p.totalPortfolioValue ? usd(parseFloat(p.totalPortfolioValue)) : '—'],
              ['Realized P&L', p.realizedPnl ? signed(parseFloat(p.realizedPnl)) : '—'],
              ['Unrealized P&L', p.unrealizedPnl ? signed(parseFloat(p.unrealizedPnl)) : '—'],
              ['Total P&L', p.totalPnl ? signed(parseFloat(p.totalPnl)) : '—'],
              ['Total return', p.totalReturnPct ? `${p.totalReturnPct}%` : '—'],
              ['Open positions', String(positions.length)],
              ['Closed trades', String(perf.closedTrades ?? 0)],
              ['Win rate', perf.winRatePct != null ? `${perf.winRatePct}%` : '—'],
              ['Worst dip', perf.drawdownPct != null ? `${perf.drawdownPct}%` : '—']].map(([k, v]) => (
              <div key={k} className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/60 p-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">{k}</p>
                <p className="truncate text-[12.5px] font-semibold text-slate-100" title={String(v)}>{v}</p>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[10.5px] text-slate-500">This strategy trades its own ring-fenced {usd(perf.startingCash)} of virtual cash, so its results are never mixed with your other strategies.</p>
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
  const [reviseInput, setReviseInput] = useState('');
  const [revising, setRevising] = useState(false);
  const [reviseOpen, setReviseOpen] = useState(false);

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
  const doReviseWithAlbert = async () => {
    if (!reviseInput.trim()) return;
    setRevising(true); setErr('');
    try {
      const r = await post('/v1/albert/studio/revise-draft', {
        strategyId: sid, revisionRequest: reviseInput.trim() });
      const j = await r.json();
      if (r.ok && j.revisedDraft) {
        // Open the Builder with the revised draft for review — never auto-save.
        setReviseOpen(false); setReviseInput('');
        onRevise?.({ ...s, contract: j.revisedDraft, _revision: true, _revisionNote: j.note });
      } else {
        setErr(j.detail || 'Revision failed.');
      }
    } catch (e) { setErr('Revision failed.'); }
    finally { setRevising(false); }
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
        {s.paperStatus !== 'ARCHIVED' && <>
          <Button size="sm" variant="outline" onClick={() => onRevise?.(s)} className="ml-auto h-7 border-slate-700 text-[12px] text-slate-200">Revise plan</Button>
          <Button size="sm" variant="outline" onClick={() => setReviseOpen(!reviseOpen)} className="h-7 border-indigo-700 text-[12px] text-indigo-300">Revise with Albert</Button>
        </>}
      </div>
      {/* Revise with Albert chat panel */}
      {reviseOpen && (
        <div className="mb-3 rounded-lg border border-indigo-700/50 bg-indigo-950/30 p-3">
          <p className="mb-2 text-[12px] text-indigo-200">Tell Albert what to change. Albert will return a complete revised strategy for your review. Nothing is saved until you explicitly save.</p>
          <div className="flex gap-2">
            <input value={reviseInput} onChange={(e) => setReviseInput(e.target.value)}
              placeholder="e.g. Add SOL, change entry sizing to $500 per trade, add a 5% stop-loss on all positions"
              className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-[13px] text-white placeholder-slate-500"
              onKeyDown={(e) => e.key === 'Enter' && !revising && doReviseWithAlbert()} />
            <Button size="sm" onClick={doReviseWithAlbert} disabled={revising || !reviseInput.trim()}
              className="h-8 gap-1 bg-indigo-600 text-[12px] hover:bg-indigo-500">
              {revising ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Send'}
            </Button>
          </div>
        </div>
      )}
      <p className="text-[13px] text-slate-300">{s.summary}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(s.assetCapabilities || []).map((cap) => <CoinCapability key={cap.symbol} item={cap} />)}
      </div>
      <p className="mt-2 text-[12px] text-slate-400">Wallet: <span className="font-semibold text-slate-200">{s.walletName || 'Not started'}</span> · Starting virtual balance: {usd(s.startingCash || s.contract?.startingCash)}. Revisions keep the same wallet, holdings and history.</p>
      {s.readiness === 'needs_changes' && (s.startErrors || []).length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
          <p className="mb-1 text-[11px] font-bold text-amber-300">Needs changes — not trading</p>
          <ul className="space-y-0.5 text-[12px] text-amber-200">
            {s.startErrors.map((e, i) => <li key={i} className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{e}</li>)}
          </ul>
        </div>
      )}

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

      {/* Auto Run lives HERE, on the strategy — one journey, no separate setup. */}
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

export default function StrategyStudio({ chatGoal = '', chatDraftKey = null, chatProposal = null, onChatDismiss }) {
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
  // Chat proposal handoff: if we receive a structured proposal, convert it to a draft
  // and go directly to the Builder review form — skip "Draft with Albert."
  useEffect(() => {
    if (chatDraftKey && chatProposal && Array.isArray(chatProposal.legs) && chatProposal.legs.length > 0) {
      const draft = proposalToDraft(chatProposal);
      // chatGoal = user's original message; chatProposal.thesis = Albert's generated description.
      // requestedPlan is the user's original request; objective is Albert's interpretation.
      const userGoal = chatGoal || '';
      if (userGoal) draft.requestedPlan = userGoal;
      setRevision({ id: null, version: null, goal: userGoal || chatProposal.thesis || '', draft, fromProposal: true });
      setSel(null);
      setBuilding(true);
    } else if (chatDraftKey) {
      setRevision(null);
      setSel(null);
      setBuilding(true);
    }
  }, [chatDraftKey, chatProposal, chatGoal]);
  const revise = (s) => {
    // Filter empty/null values from saved contracts so STUDIO_EXEC_RULES defaults
    // aren't overridden by legacy empty strings (preserves hash for the saved version).
    const saved = Object.fromEntries(
      Object.entries(s.contract || {}).filter(([_, v]) => v != null && v !== '')
    );
    setRevision({ id: s.strategyId, version: s.version, goal: s.contract?.requestedPlan || '',
      draft: { ...STUDIO_EXEC_RULES, ...saved, name: s.name, rules: s.contract?.rules || [],
        walletName: s.walletName || s.contract?.walletName || `${s.name} wallet`,
        startingCash: s.startingCash || s.contract?.startingCash || '' } });
    setSel(null); setBuilding(true); onChatDismiss?.();
  };
  const liveCount = list.filter((s) => s.isLive).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <Crosshair className="h-5 w-5 text-violet-400" />
        <h1 className="text-lg font-bold text-white">Strategies</h1>
        <span className="text-[12px] text-slate-500">Build with Albert &rarr; save &rarr; start Auto Run</span>
        {liveCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{liveCount} Auto Run
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
                  {''  /* mode retired */}
                </p>
              </button>
            );
          })}
        </div>
        <div className="lg:col-span-2">
          {building ? <Builder key={revision ? `${revision.id}:v${revision.version}` : chatDraftKey || 'new'}
              initialGoal={revision ? revision.goal : chatGoal} initialDraft={revision?.draft || null} revisionId={revision?.id || null}
              onCancel={() => { setBuilding(false); if (revision) setSel(revision.id); setRevision(null); onChatDismiss?.(); }}
              onSaved={(sid) => {
                setBuilding(false); setRevision(null); onChatDismiss?.(); load(); setSel(sid);
                try { window.dispatchEvent(new CustomEvent('albert:strategy-saved', { detail: { strategyId: sid } })); } catch (x) { /* noop */ }
              }} />
            : sel ? <Detail key={sel} sid={sel} onChange={load} onRevise={revise} />
            : <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800"><p className="text-[13px] text-slate-400">Select a strategy, or build a new one with Albert.</p></Card>}
        </div>
      </div>
      <p className="flex items-start justify-center gap-1.5 pt-1 text-center text-[11px] text-slate-600">
        <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500/70" />
        Auto Run only — virtual money, no exchange keys, and it can never place a real order. Saving stores the exact reviewed plan as an immutable, hashed version; starting binds that exact version to the strategy&rsquo;s own paper wallet.
      </p>
    </div>
  );
}
