'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Sparkles, Activity, AlertTriangle, Gauge, MessageCircle, Loader2, Database,
  Wallet, Clock, LineChart, Crown, TrendingUp, TrendingDown, RefreshCw,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { API_BASE } from '../lib/api';
import {
  money, signedPct, timeAgo, EvidenceButton, KnowledgeBadge, StreamHeader, StatusBadge,
} from './albert/common';
import EvidenceDrawer from './albert/EvidenceDrawer';
import ScenarioChart from './albert/ScenarioChart';
import ScenarioAnalysis from './albert/ScenarioAnalysis';
import MarketStream from './albert/MarketStream';
import ResearchFindings from './albert/ResearchFindings';
import StrategiesStream from './albert/StrategiesStream';

const REGIME = {
  BULL: { label: 'Bullish', cls: 'text-emerald-400', dot: 'bg-emerald-400' },
  BEAR: { label: 'Bearish', cls: 'text-red-400', dot: 'bg-red-400' },
  RANGE: { label: 'Range-bound', cls: 'text-amber-400', dot: 'bg-amber-400' },
  UNKNOWN: { label: 'Uncertain', cls: 'text-slate-400', dot: 'bg-slate-500' },
};

function StatusStrip({ sop, streams }) {
  const r = REGIME[sop.market?.regime] || REGIME.UNKNOWN;
  const totals = sop.paperAggregate?.totals || {};
  const pnl = totals.pnlUsd !== undefined && totals.pnlUsd !== null ? Number(totals.pnlUsd) : null;
  const lead = (streams?.phaseAssessment?.phase) || sop.marketStreams?.phaseAssessment?.phase;
  const dq = sop.dataQuality?.status || 'HEALTHY';
  const dqCls = dq === 'HEALTHY' ? 'text-emerald-400' : dq === 'DEGRADED' ? 'text-amber-400' : 'text-red-400';
  const Item = ({ icon: Icon, label, children }) => (
    <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-950/50 px-3.5 py-2.5">
      <Icon className="h-4 w-4 shrink-0 text-slate-500" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
        <div className="truncate text-sm font-bold text-white">{children}</div>
      </div>
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
      <Item icon={Activity} label="Market stance">
        <span className={r.cls}><span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${r.dot} align-middle`} />{r.label}</span>
      </Item>
      <Item icon={Crown} label="Leadership">
        <span className="text-slate-200">{lead ? String(lead).replace(/_/g, ' ') : '—'}</span>
      </Item>
      <Item icon={Wallet} label="Paper wallets">{totals.valueAvailable ? money(totals.value) : '—'}</Item>
      <Item icon={pnl !== null && pnl >= 0 ? TrendingUp : TrendingDown} label="Net result">
        <span className={pnl === null ? 'text-slate-300' : pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
          {pnl === null ? '—' : money(pnl)}
        </span>
      </Item>
      <Item icon={Database} label="Data status">
        <span className={dqCls}>{dq === 'HEALTHY' ? 'Healthy' : dq === 'DEGRADED' ? 'Degraded' : 'Limited'}</span>
      </Item>
    </div>
  );
}

/* --------------------------- executive briefing --------------------------- */
// Albert's briefing is the join between the two streams. Every line is a server-composed
// CLAIM with its knowledge kind and a link to the snapshot it was made from — the
// language model neither writes nor restates any figure here.
function Briefing({ sop, onNav, onEvidence, onAsk }) {
  const claims = sop.briefing?.claims || [];
  return (
    <Card className="border-0 bg-gradient-to-br from-sky-500/[0.07] via-violet-500/[0.06] to-slate-900 p-5 ring-1 ring-sky-500/25">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <img src="/albert.png" alt="Albert" className="h-11 w-11 rounded-full object-cover ring-2 ring-sky-500/40" />
        <div className="min-w-0">
          <h2 className="text-base font-bold text-white">Albert’s briefing</h2>
          <p className="text-[11px] text-slate-400">
            Your HuCentAI trading companion · {timeAgo(sop.generatedAt) || 'live'}
          </p>
        </div>
        <Badge variant="outline" className="ml-auto border-slate-700 text-[10px] text-slate-300">Paper only</Badge>
      </div>

      {claims.length ? (
        <ul className="space-y-2.5">
          {claims.map((c) => (
            <li key={c.claimId} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <KnowledgeBadge kind={c.kind} className="translate-y-[1px]" />
              <span className="min-w-0 max-w-[85ch] text-[14.5px] leading-relaxed text-slate-200">{c.text}</span>
              <EvidenceButton snapshotId={(c.evidenceRefs || []).filter((r) => String(r).startsWith('snap_')).slice(-1)[0]}
                onEvidence={onEvidence} label="Evidence" />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-slate-300">
          Albert has no briefing claims to make from the current state — rather than fill the
          gap with prose, he is saying so.
        </p>
      )}

      {(sop.changesSinceLastVisit || []).length > 0 ? (
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <Clock className="h-3.5 w-3.5" />What changed since you were last here
          </p>
          <ul className="space-y-1 text-[13px] text-slate-300">
            {sop.changesSinceLastVisit.slice(0, 5).map((c, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
                <span>{c.detail || c.kind} <span className="text-slate-500">· {timeAgo(c.at)}</span></span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => onAsk(null, 'Walk me through my state of play right now — the market, my wallets and anything waiting on me.')}
          className="gap-1.5 bg-gradient-to-r from-sky-500 to-violet-600 text-white hover:from-sky-400 hover:to-violet-500">
          <MessageCircle className="h-4 w-4" />Ask Albert
        </Button>
        <button type="button" onClick={() => onNav && onNav('paper')}
          className="text-[12px] font-semibold text-sky-400 hover:text-sky-300">Open Paper Trading</button>
        {sop.briefing?.note ? (
          <p className="ml-auto max-w-[52ch] text-[10.5px] leading-relaxed text-slate-600">{sop.briefing.note}</p>
        ) : null}
      </div>
    </Card>
  );
}

/* ---------------------------------- main ---------------------------------- */
export default function AlbertHome({ onNav }) {
  const [sop, setSop] = useState(null);
  const [status, setStatus] = useState('loading');
  const [err, setErr] = useState('');

  const [streams, setStreams] = useState(null);
  const [streamsLoading, setStreamsLoading] = useState(true);

  const [asset, setAsset] = useState('BTC');
  const [horizon, setHorizon] = useState('P7D');
  const [outlook, setOutlook] = useState(null);
  const [outlookLoading, setOutlookLoading] = useState(true);
  const [outlookErr, setOutlookErr] = useState('');
  const reqRef = useRef(0);

  const [evidenceId, setEvidenceId] = useState(null);
  const [expanded, setExpanded] = useState(false);

  /* ---- state of play (fast: renders the page immediately) ---- */
  const loadSop = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/v1/albert/state-of-play`, { credentials: 'include', cache: 'no-store' });
      if (r.status === 401 || r.status === 403) { setStatus('signedout'); return; }
      if (!r.ok) { setErr('Could not load your state of play.'); setStatus('error'); return; }
      setSop(await r.json());
      setStatus('ready');
    } catch (e) {
      setErr('Network error loading your state of play.'); setStatus('error');
    }
  }, []);

  /* ---- stream 1 (progressive: never blocks the page) ---- */
  const loadStreams = useCallback(async (refresh) => {
    setStreamsLoading(true);
    try {
      const r = await fetch(`${API_BASE}/v1/albert/market-streams${refresh ? '?refresh=1' : ''}`,
        { credentials: 'include', cache: 'no-store' });
      if (r.ok) setStreams(await r.json());
    } catch (e) { /* the panel states its own unavailability */ }
    setStreamsLoading(false);
  }, []);

  /* ---- the scenario, selected ATOMICALLY ---- */
  const cancelOutlookRef = useRef(null);
  const loadOutlook = useCallback((a, h) => {
    // A new selection (or a manual refresh) cancels both the in-flight request and
    // its retry timer. A stale response can never be displayed under another asset.
    cancelOutlookRef.current?.();
    const mine = ++reqRef.current;
    const expected = `${a}|USD|${h}|ASSESSED|`;
    let cancelled = false;
    let timer = null;
    let controller = null;
    setOutlook((prev) => prev?.selectionKey?.startsWith(expected) ? prev : null);
    setOutlookErr(''); setOutlookLoading(true);

    const attempt = async (retryCount) => {
      controller = new AbortController();
      try {
        const r = await fetch(`${API_BASE}/v1/albert/scenario-outlooks/preview`, {
          method: 'POST', credentials: 'include', signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assetId: a, horizon: h, quoteCurrency: 'USD', phaseMode: 'ASSESSED' }),
        });
        if (cancelled || mine !== reqRef.current) return;
        if (r.status === 401 || r.status === 403) { setOutlookErr('Please sign in to see the scenario.'); return; }
        if (!r.ok) { setOutlookErr('The scenario provider could not be reached.'); return; }
        const j = await r.json();
        if (cancelled || mine !== reqRef.current) return;
        const got = String(j.selectionKey || '').split('|').slice(0, 5).join('|');
        if (got !== expected) {
          setOutlookErr('That response did not match the current selection, so it was discarded.');
          return;
        }
        setOutlook(j); // Retain the current response between attempts: no empty-chart flicker.
        if (j.band?.reasonCode === 'EVALUATION_NOT_COMPUTED_YET') {
          if (retryCount < 20) {
            timer = setTimeout(() => attempt(retryCount + 1), 2000);
          } else {
            setOutlookErr('Today’s evaluation is taking longer than expected. Please retry.');
          }
        }
      } catch (e) {
        if (!cancelled && mine === reqRef.current && e?.name !== 'AbortError') {
          setOutlookErr('Network error loading the scenario.');
        }
      } finally {
        if (!cancelled && mine === reqRef.current) setOutlookLoading(false);
      }
    };
    const cancel = () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
      if (cancelOutlookRef.current === cancel) cancelOutlookRef.current = null;
    };
    cancelOutlookRef.current = cancel;
    attempt(0);
    return cancel;
  }, []);

  useEffect(() => { loadSop(); loadStreams(false); }, [loadSop, loadStreams]);

  // On a cold start the universe is still rebuilding, so state-of-play legitimately has
  // no leadership or turnover claim. Once Stream 1 reports a reading, re-read it ONCE so
  // the briefing catches up rather than sitting on an honest but empty answer.
  const caughtUp = useRef(false);
  useEffect(() => {
    if (caughtUp.current) return;
    const live = streams?.phaseAssessment?.phase;
    const have = sop?.marketStreams?.phaseAssessment?.phase;
    if (live && live !== 'UNKNOWN' && (!have || have === 'UNKNOWN')) {
      caughtUp.current = true;
      loadSop();
    }
  }, [streams, sop, loadSop]);
  useEffect(() => loadOutlook(asset, horizon), [asset, horizon, loadOutlook]);

  // Evidence deep links (/?section=home&evidence=snap_…) open the panel in place.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const e = q.get('evidence');
      if (e) setEvidenceId(e);
    } catch (e) { /* noop */ }
  }, []);

  const onEvidence = useCallback((id) => { if (id) setEvidenceId(id); }, []);

  const onAsk = useCallback((context, question) => {
    try {
      window.__albertPendingAsk = {
        question: question || 'Explain this using only the evidence attached.',
        context: context || undefined,
      };
    } catch (e) { /* noop */ }
    if (onNav) onNav('ask');
  }, [onNav]);

  const askAboutBand = useCallback((snapshotId) => {
    const b = outlook?.band;
    onAsk({ snapshotId, stateId: sop?.stateId },
      b?.available
        ? `Explain the ${outlook.assetId} historical scenario range of ${signedPct(b.lowerPct)} to ${signedPct(b.upperPct)} over ${b.horizonDays} days. What does it actually mean for me, what would invalidate it, and why is the middle of the band not a forecast?`
        : `Why is there no scenario range for ${asset} over this horizon right now?`);
  }, [outlook, sop, asset, onAsk]);

  const askAboutFinding = useCallback((f) => {
    onAsk({ findingId: f.findingId, snapshotId: f.snapshotId, stateId: sop?.stateId },
      `Explain this research finding: "${f.title}". What would confirm or invalidate it, and what should I do about it — if anything?`);
  }, [sop, onAsk]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />Albert is reading your state of play…
      </div>
    );
  }
  if (status === 'error') {
    return (
      <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-300">
          <AlertTriangle className="h-4 w-4" />{err}
        </p>
        <Button size="sm" onClick={loadSop} className="mt-3 bg-sky-500 hover:bg-sky-400">Retry</Button>
      </Card>
    );
  }
  if (status === 'signedout' || !sop) {
    return (
      <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
        <p className="text-sm text-slate-300">Please sign in to see Albert’s home.</p>
      </Card>
    );
  }

  const research = streams?.researchFindings || sop.marketStreams?.researchFindings;
  const assets = (sop.capabilities?.forecast?.assets || ['BTC']);
  // One source for leadership: the market assessment. The chart never re-derives it and
  // never offers it as a control.
  const lead = streams?.phaseAssessment?.phase || sop.marketStreams?.phaseAssessment?.phase;
  const leadership = (lead && lead !== 'UNKNOWN') ? lead : null;

  return (
    <div className="w-full min-w-0 space-y-4 overflow-x-hidden">
      <div className="flex flex-wrap items-center gap-2.5">
        <Sparkles className="h-5 w-5 text-amber-400" />
        <h1 className="text-lg font-bold text-white">Albert</h1>
        <span className="text-[12px] text-slate-500">Your HuCentAI trading companion</span>
        <button type="button" onClick={() => { loadSop(); loadStreams(true); loadOutlook(asset, horizon); }}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1 text-[11.5px] font-semibold text-slate-300 hover:border-slate-500 hover:text-white">
          <RefreshCw className={`h-3.5 w-3.5 ${streamsLoading ? 'animate-spin' : ''}`} />Refresh
        </button>
      </div>

      <StatusStrip sop={sop} streams={streams} />

      <Briefing sop={sop} onNav={onNav} onEvidence={onEvidence} onAsk={onAsk} />

      {/* TWO STREAMS, joined above by the briefing. */}
      <div className="grid w-full min-w-0 grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-3 xl:col-span-2">
          <StreamHeader icon={LineChart} title="Market & opportunities"
            subtitle="What the market is doing, who is moving it, and what is worth researching"
            right={<StatusBadge status={streams?.direction?.status} />} />

          {/* The what-if chart is the dominant visual here, directly below the briefing. */}
          <ScenarioChart outlook={outlook} loading={outlookLoading} error={outlookErr}
            asset={asset} assets={assets} horizon={horizon} onRetry={() => loadOutlook(asset, horizon)}
            onAsset={setAsset} onHorizon={setHorizon}
            onEvidence={onEvidence} onExpand={() => setExpanded(true)}
            onAsk={askAboutBand} chartHeight={310} histCount={45} leadership={leadership} />

          <ResearchFindings research={research} onEvidence={onEvidence} onAsk={askAboutFinding} />

          <MarketStream streams={streams} loading={streamsLoading} onEvidence={onEvidence} />
        </div>

        <div className="min-w-0 space-y-3">
          <StreamHeader icon={Gauge} title="Your strategies" accent="violet"
            subtitle="Every strategy’s own ring-fenced paper wallet, aggregated"
            right={<Badge variant="outline" className="border-slate-700 text-[10px] text-slate-300">Paper only</Badge>} />
          <StrategiesStream sop={sop} onNav={onNav} onEvidence={onEvidence} />
        </div>
      </div>

      <p className="pt-1 text-center text-[11px] text-slate-600">
        Paper trading only — no real orders are placed. Albert explains the deterministic
        engine’s decisions; he never invents or alters trades.
      </p>

      {expanded ? (
        <ScenarioAnalysis outlook={outlook} asset={asset} assets={assets} horizon={horizon}
          onAsset={setAsset} onHorizon={setHorizon} onEvidence={onEvidence}
          onAsk={askAboutBand} onClose={() => setExpanded(false)} leadership={leadership} />
      ) : null}

      {evidenceId ? (
        <EvidenceDrawer snapshotId={evidenceId} onClose={() => setEvidenceId(null)}
          onAsk={(sid) => { setEvidenceId(null); onAsk({ snapshotId: sid, stateId: sop.stateId },
            'Explain this evidence record in plain English, and tell me what it does and does not prove.'); }} />
      ) : null}
    </div>
  );
}
