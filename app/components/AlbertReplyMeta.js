'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Bookmark, ArrowRight, ExternalLink, Clock, ShieldCheck } from 'lucide-react';
import { API_BASE, getPid } from '../lib/api';

/**
 * AlbertReplyMeta — Action buttons beneath an Albert reply.
 * Only shows "Review & save strategy" when the reply has a structured proposal (basket_draft).
 * Text-only replies get "Prepare strategy for review" which asks the backend to extract a proposal.
 */
export default function AlbertReplyMeta({ msg, onNav, sessionId }) {
  const [preparing, setPreparing] = React.useState(false);
  const [prepError, setPrepError] = React.useState(null);
  const [savedLink, setSavedLink] = React.useState(msg?._savedStrategyId || null);

  // When the reply has a structured proposal, offer direct review.
  const hasProposal = msg?.basket_draft && Array.isArray(msg.basket_draft.legs) && msg.basket_draft.legs.length > 0;

  // Detect strategy-like discussion (mentions portfolio, allocation, position) but NO structured data.
  const text = (msg?.text || '').toLowerCase();
  const hasStrategyDiscussion = !hasProposal && (
    /\b(portfolio|allocation|position|strategy|basket|rebalance)\b/.test(text) &&
    /\b(buy|sell|long|short|hold|weight|allocat)\b/.test(text)
  );

  const prepareProposal = async () => {
    setPreparing(true);
    setPrepError(null);
    try {
      const r = await fetch(`${API_BASE}/v1/chat/prepare-proposal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ session_id: sessionId, pid: getPid() }),
      });
      const j = await r.json();
      if (j.basket_draft && j.basket_draft.legs?.length > 0) {
        // Dispatch the structured proposal to Studio.
        window.dispatchEvent(new CustomEvent('albert:build-strategy', {
          detail: {
            proposal: j.basket_draft,
            proposalId: j.basket_draft.proposalId || null,
            revision: j.basket_draft.revision || 1,
            assets: j.basket_draft.legs.map((l) => l.symbol),
          },
        }));
      } else {
        setPrepError(j.error || 'Could not extract a structured strategy from this conversation. Try asking Albert to be more specific about assets, allocations and rules.');
      }
    } catch (e) {
      setPrepError('Network error — please try again.');
    } finally {
      setPreparing(false);
    }
  };

  if (savedLink) {
    return (
      <div className="mt-2 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-400" />
        <button onClick={() => { if (typeof window !== 'undefined') { window.sessionStorage.setItem('dashboard:strategyId', savedLink); } onNav?.('strategies'); }}
          className="text-xs font-semibold text-emerald-300 underline hover:text-emerald-200">
          Saved — open strategy
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {/* Structured proposal — direct review */}
      {hasProposal && (
        <Button size="sm" variant="outline" onClick={() => {
          window.dispatchEvent(new CustomEvent('albert:build-strategy', {
            detail: {
              proposal: msg.basket_draft,
              proposalId: msg.basket_draft.proposalId || null,
              revision: msg.basket_draft.revision || 1,
              assets: msg.basket_draft.legs.map((l) => l.symbol),
            },
          }));
        }} className="h-7 gap-1.5 border-violet-500/40 text-[12px] text-violet-300 hover:bg-violet-500/10">
          <ArrowRight className="h-3.5 w-3.5" />Review &amp; save strategy
        </Button>
      )}

      {/* Strategy-like discussion without structured data */}
      {hasStrategyDiscussion && !hasProposal && (
        <Button size="sm" variant="outline" onClick={prepareProposal} disabled={preparing}
          className="h-7 gap-1.5 border-sky-500/40 text-[12px] text-sky-300 hover:bg-sky-500/10">
          {preparing ? <Clock className="h-3.5 w-3.5 animate-spin" /> : <Bookmark className="h-3.5 w-3.5" />}
          Prepare strategy for review
        </Button>
      )}

      {prepError && <p className="text-[11px] text-amber-300">{prepError}</p>}

      {/* Source links */}
      {(msg?.sources || []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {msg.sources.slice(0, 3).map((s, i) => (
            <a key={i} href={s.url || '#'} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400 hover:text-slate-200">
              <ExternalLink className="h-2.5 w-2.5" />{s.title || s.url || 'Source'}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
