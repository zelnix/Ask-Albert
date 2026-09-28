'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Briefcase, ArrowRight } from 'lucide-react';

/**
 * BasketChatCard — Renders an inline strategy proposal from chat.
 * Passes the structured proposal to Strategy Studio for review & save.
 * Does NOT convert to prose or re-generate via Gemini.
 */
export default function BasketChatCard({ draft, onBuild }) {
  if (!draft || !Array.isArray(draft.legs) || draft.legs.length === 0) return null;
  const assets = draft.legs.map((l) => l.symbol).filter(Boolean);

  const handleReview = () => {
    // Dispatch structured proposal — Studio receives it directly.
    window.dispatchEvent(new CustomEvent('albert:build-strategy', {
      detail: {
        proposal: draft,
        proposalId: draft.proposalId || null,
        revision: draft.revision || 1,
        assets,
      },
    }));
    onBuild?.();
  };

  return (
    <div className="mt-3 rounded-lg border border-violet-500/30 bg-violet-500/[0.04] p-3">
      <div className="flex items-center gap-2">
        <Briefcase className="h-4 w-4 text-violet-400" />
        <span className="text-sm font-semibold text-white">{draft.title || 'Strategy Proposal'}</span>
      </div>
      {draft.thesis && <p className="mt-1 text-xs text-slate-300">{draft.thesis}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {draft.legs.map((leg) => (
          <span key={leg.symbol} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${leg.position === 'short' ? 'bg-red-500/15 text-red-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
            {leg.symbol} {leg.position} {Math.round(leg.weight_pct || 0)}%
          </span>
        ))}
      </div>
      {draft.horizon_days && <p className="mt-1.5 text-[11px] text-slate-400">Horizon: {draft.horizon_days} days</p>}
      {draft.startingCapital && <p className="text-[11px] text-slate-400">Capital: {draft.startingCapital} {draft.currency || ''}</p>}
      <Button size="sm" onClick={handleReview} className="mt-3 gap-1.5 bg-violet-600 hover:bg-violet-500">
        <ArrowRight className="h-3.5 w-3.5" />Review &amp; save strategy
      </Button>
    </div>
  );
}
