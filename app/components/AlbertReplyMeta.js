'use client';

import React from 'react';
import { useState, useCallback } from 'react';
import { CheckCircle2, ArrowRight, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';
import { API_BASE } from '../lib/api';

/**
 * AlbertReplyMeta — renders strategy action buttons under Albert's chat reply.
 *
 * Instruction 2:
 *   - Structured draft → show "Review & save strategy"
 *   - Strategy prose without structured draft → show "Prepare strategy for review"
 *   - Clicking either opens Strategy Studio with the complete draft.
 *   - The user must not manually re-enter parameters.
 *
 * Instruction 9:
 *   - On timeout / failure, show "Retry preparation"
 *   - Preserve conversation state, never lose previously supplied values.
 */
export default function AlbertReplyMeta({ draft, strategyIntent, strategyDraftFailed, sessionId, onNav, onRetry }) {
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');

  const hasDraft = draft && draft.legs && draft.legs.length > 0;

  // Instruction 2: open Strategy Studio with the draft pre-loaded
  const openStudioWithDraft = useCallback((d) => {
    if (d) {
      // Store draft for Strategy Studio to pick up
      try { sessionStorage.setItem('albert_strategy_draft', JSON.stringify(d)); } catch {}
      try { sessionStorage.setItem('albert_strategy_session', sessionId || ''); } catch {}
      window.dispatchEvent(new CustomEvent('albert:strategy-draft', { detail: d }));
    }
    if (onNav) onNav('strategystudio');
  }, [sessionId, onNav]);

  // Instruction 2: "Prepare strategy for review" — calls prepare-proposal
  const prepareForReview = useCallback(async () => {
    setPreparing(true);
    setError('');
    try {
      const r = await fetch(`${API_BASE}/v1/chat/prepare-proposal`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (!r.ok) throw new Error('Preparation failed — please try again.');
      const j = await r.json();
      if (j.error) {
        setError(j.error);
      } else if (j.basket_draft && j.basket_draft.legs) {
        openStudioWithDraft(j.basket_draft);
      } else {
        setError('Could not extract a strategy — please provide more details.');
      }
    } catch (e) {
      setError(e.message || 'Preparation timed out. Your conversation is preserved — tap Retry.');
    } finally {
      setPreparing(false);
    }
  }, [sessionId, openStudioWithDraft]);

  // Nothing to render if no strategy intent
  if (!strategyIntent && !hasDraft && !strategyDraftFailed) return null;

  return (
    <div className="mt-3 space-y-2">
      {/* Unsupported coins warning (Instruction 7) */}
      {hasDraft && draft.needsChanges && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Strategy needs changes</p>
            <p className="text-[11px] text-amber-400/80">{draft.changeReason}</p>
            {draft.legs?.filter(l => !l.paperSupported).map((l, i) => (
              <p key={i} className="text-[11px] text-amber-400/60">• {l.symbol}: {l.restriction}</p>
            ))}
          </div>
        </div>
      )}

      {/* Draft summary */}
      {hasDraft && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2">
          <p className="text-[12px] font-semibold text-sky-300">{draft.title || 'Strategy draft ready'}</p>
          {draft.thesis && <p className="mt-0.5 text-[11px] text-slate-400 line-clamp-2">{draft.thesis}</p>}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {(draft.legs || []).map((l, i) => (
              <span key={i} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${l.paperSupported === false ? 'bg-red-500/15 text-red-300' : 'bg-sky-500/15 text-sky-300'}`}>
                {l.symbol}{l.paperSupported === false ? ' ⚠' : ''}
              </span>
            ))}
            {draft.horizon_days && <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[10px] text-slate-300">{draft.horizon_days}d horizon</span>}
            {draft.maxPositions && <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[10px] text-slate-300">max {draft.maxPositions} positions</span>}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {hasDraft ? (
          /* Structured draft → Review & save strategy */
          <button
            onClick={() => openStudioWithDraft(draft)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-violet-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg shadow-sky-500/20 hover:from-sky-400 hover:to-violet-500"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />Review & save strategy
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : strategyDraftFailed ? (
          /* Timeout / failure → Retry preparation */
          <button
            onClick={onRetry || prepareForReview}
            disabled={preparing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3.5 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
          >
            {preparing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Retry preparation
          </button>
        ) : (
          /* Strategy prose without draft → Prepare for review */
          <button
            onClick={prepareForReview}
            disabled={preparing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/50 bg-sky-500/10 px-3.5 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-500/20 disabled:opacity-50"
          >
            {preparing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
            Prepare strategy for review
          </button>
        )}
      </div>

      {error && <p className="text-[11px] text-red-400">{error}</p>}

      {/* Instruction 8: Correct wallet wording */}
      <p className="text-[10px] text-slate-600">
        Flow: Chat → Review → Save → Start Simulation. During Start you'll choose or create a named paper wallet.
      </p>
    </div>
  );
}
