'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Bookmark, ArrowRight, ExternalLink, Clock, ShieldCheck, RefreshCw, CheckCircle2 } from 'lucide-react';
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
  const proposalId = msg?.basket_draft?.proposalId;

  // Listen for the strategy-saved event and match by proposalId.
  React.useEffect(() => {
    if (!proposalId) return undefined;
    const handler = (e) => {
      if (e.detail?.proposalId === proposalId && e.detail?.strategyId) {
        setSavedLink(e.detail.strategyId);
      }
    };
    window.addEventListener('albert:strategy-saved', handler);
    return () => window.removeEventListener('albert:strategy-saved', handler);
  }, [proposalId]);

  // Strategy intent is now determined server-side and returned as an explicit field.
  // If strategyIntent is true but no proposal was generated, show a retry button.
  const hasStrategyDiscussion = !hasProposal && Boolean(msg?.strategyIntent);
  const draftFailed = hasStrategyDiscussion && Boolean(msg?.strategyDraftFailed);

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
        // Close the floating chat so Studio is visible.
        try { window.dispatchEvent(new CustomEvent('albert:close-chat')); } catch (x) { /* noop */ }
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
          try { window.dispatchEvent(new CustomEvent('albert:close-chat')); } catch (x) { /* noop */ }
        }} className="h-7 gap-1.5 border-violet-500/40 text-[12px] text-violet-300 hover:bg-violet-500/10">
          <ArrowRight className="h-3.5 w-3.5" />Review &amp; save strategy
        </Button>
      )}

      {/* Strategy intent detected without structured data — offer extraction or retry */}
      {hasStrategyDiscussion && !hasProposal && (
        <Button size="sm" variant="outline" onClick={prepareProposal} disabled={preparing}
          className="h-7 gap-1.5 border-sky-500/40 text-[12px] text-sky-300 hover:bg-sky-500/10">
          {preparing ? <Clock className="h-3.5 w-3.5 animate-spin" /> : draftFailed ? <RefreshCw className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
          {draftFailed ? 'Retry strategy proposal' : 'Prepare strategy for review'}
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

      {/* Analysis job status */}
      {msg.analysisJob && (
        <AnalysisJobBadge job={msg.analysisJob} />
      )}
    </div>
  );
}

function AnalysisJobBadge({ job }) {
  const [status, setStatus] = React.useState(job?.status || 'queued');
  const [results, setResults] = React.useState(null);
  const jobId = job?.jobId;

  React.useEffect(() => {
    if (!jobId || status === 'completed' || status === 'failed') return undefined;
    const poll = setInterval(async () => {
      try {
        const r = await fetch(`${API_BASE}/v1/albert/analysis/status/${encodeURIComponent(jobId)}`);
        if (r.ok) {
          const j = await r.json();
          setStatus(j.status || 'queued');
          if (j.results) setResults(j.results);
          if (j.status === 'completed' || j.status === 'failed') clearInterval(poll);
        }
      } catch { /* noop */ }
    }, 3000);
    return () => clearInterval(poll);
  }, [jobId, status]);

  const icon = status === 'completed' ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> :
               status === 'failed' ? <ShieldCheck className="h-3 w-3 text-red-400" /> :
               <RefreshCw className={`h-3 w-3 text-sky-400 ${status === 'running' ? 'animate-spin' : ''}`} />;
  const label = status === 'completed' ? 'Analysis complete' :
                status === 'failed' ? 'Analysis failed' :
                status === 'running' ? 'Refreshing data...' : 'Analysis queued';
  return (
    <div className="mt-1.5 flex items-center gap-1.5 rounded-full bg-slate-800/60 px-2.5 py-1 text-[11px] text-slate-300">
      {icon} {label} {job?.joined && <span className="text-slate-500">(joined existing)</span>}
    </div>
  );
}
