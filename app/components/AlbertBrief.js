'use client';
import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Clock, ExternalLink, ChevronDown, ChevronUp,
  Shield, TrendingUp, TrendingDown, Eye, AlertTriangle, CheckCircle2,
  XCircle, Loader2, RefreshCw, ArrowUpRight, CalendarDays, History,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { API_BASE } from '../lib/api';

/** Map section topic IDs to specialist screen routes */
const SECTION_NAV_MAP = {
  price_structure: { route: 'briefing', label: 'Price & Structure' },
  etf_institutional: { route: 'flows', label: 'ETF & Flows' },
  etf_flows: { route: 'flows', label: 'ETF & Flows' },
  onchain_activity: { route: 'flows', label: 'On-Chain & Flows' },
  onchain: { route: 'flows', label: 'On-Chain & Flows' },
  macro_equities: { route: 'macro', label: 'Macro & Policy' },
  macro: { route: 'macro', label: 'Macro & Policy' },
  support_resistance: { route: 'briefing', label: 'Price & Structure' },
  volume_participation: { route: 'market-intel', label: 'Market Intelligence' },
  volume: { route: 'market-intel', label: 'Market Intelligence' },
  derivatives_leverage: { route: 'market-intel', label: 'Market Intelligence' },
  derivatives: { route: 'market-intel', label: 'Market Intelligence' },
  altcoin_breadth: { route: 'market-intel', label: 'Market Intelligence' },
  altcoins: { route: 'market-intel', label: 'Market Intelligence' },
  market_news: { route: 'news', label: 'News Feed' },
  news: { route: 'news', label: 'News Feed' },
};

function timeAgo(iso) {
  if (!iso) return '';
  try {
    const norm = /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z';
    const s = Math.max(0, Math.floor((Date.now() - new Date(norm).getTime()) / 1000));
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch { return ''; }
}

function fmtDate(iso) {
  if (!iso) return '';
  try {
    const norm = /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z';
    return new Date(norm).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return iso; }
}

function convictionColor(c) {
  const cl = (c || '').toLowerCase();
  if (cl === 'high') return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
  if (cl === 'low') return 'text-red-400 border-red-500/30 bg-red-500/10';
  return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
}

function callColor(call) {
  const cl = (call || '').toLowerCase();
  if (cl.includes('bull')) return 'text-emerald-400';
  if (cl.includes('bear')) return 'text-red-400';
  return 'text-amber-400';
}

function Section({ sec, sources, defaultOpen = false, onNav }) {
  const [open, setOpen] = useState(defaultOpen);
  const secSources = (sec.source_ids || []).map(id => (sources || []).find(s => s.id === id)).filter(Boolean);
  const navTarget = SECTION_NAV_MAP[sec.id] || SECTION_NAV_MAP[sec.id?.split('_')[0]];

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50">
      <button onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-800/30">
        <div className="flex-1">
          <h3 className="text-[15px] font-bold text-white">{sec.title}</h3>
          <p className="mt-0.5 text-[13px] leading-relaxed text-slate-400">{sec.dashboard_summary}</p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-500" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />}
      </button>
      {open && (
        <div className="border-t border-slate-800 px-5 pb-5 pt-4 space-y-4">
          <p className="text-[14px] leading-relaxed text-slate-200 whitespace-pre-line">{sec.full_commentary}</p>

          {(sec.key_evidence || []).length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Key evidence</p>
              <ul className="space-y-1">
                {sec.key_evidence.map((e, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-slate-300">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />{e}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {sec.why_it_matters && (
            <div className="rounded-lg border border-violet-500/20 bg-violet-500/[0.05] p-3">
              <p className="text-[11px] font-semibold uppercase text-violet-400">Why it matters</p>
              <p className="mt-1 text-[13px] text-slate-200">{sec.why_it_matters}</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {sec.confirmation_condition && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" />Confirms if</p>
                <p className="mt-1 text-[13px] text-slate-300">{sec.confirmation_condition}</p>
              </div>
            )}
            {sec.invalidation_condition && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-red-400"><XCircle className="h-3.5 w-3.5" />Invalidated if</p>
                <p className="mt-1 text-[13px] text-slate-300">{sec.invalidation_condition}</p>
              </div>
            )}
          </div>

          {/* Section deep dive + sources row */}
          <div className="flex items-center justify-between">
            {navTarget && onNav && (
              <button onClick={() => onNav(navTarget.route)}
                className="inline-flex items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/[0.06] px-3 py-1.5 text-[12px] font-semibold text-sky-300 transition-colors hover:bg-sky-500/10 hover:text-sky-200">
                View {navTarget.label}<ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            )}
            {secSources.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {secSources.map((s) => (
                  <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-950/50 px-2 py-1 text-[11px] text-slate-400 transition-colors hover:border-sky-500/40 hover:text-sky-300">
                    {s.publisher || s.title || 'Source'}<ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AlbertBriefScreen({ onBack, onNav }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);

  const fetchBrief = async (refresh = false, date = null) => {
    try {
      // If a specific date is requested, pass it to the API for historical lookup
      const url = date
        ? `${API_BASE}/v1/albert/brief?symbol=BTC&mode=plain&date=${encodeURIComponent(date)}`
        : `${API_BASE}/v1/albert/brief${refresh ? '?refresh=1' : ''}`;
      const r = await fetch(url, { cache: 'no-store' });
      const j = await r.json();
      setData(j);
      setSelectedDate(date);
      if (j.refreshing || j.status === 'computing') {
        setRefreshing(true);
        let attempts = 0;
        const poll = setInterval(async () => {
          attempts++;
          try {
            const pr = await fetch(`${API_BASE}/v1/albert/brief`, { cache: 'no-store' });
            const pj = await pr.json();
            if (pj.status === 'ready' && (pj.brief || pj.text) && !pj.refreshing) {
              clearInterval(poll); setData(pj); setRefreshing(false);
            } else if (attempts > 30) { clearInterval(poll); setRefreshing(false); }
          } catch { clearInterval(poll); setRefreshing(false); }
        }, 3000);
      } else {
        setRefreshing(false);
      }
    } catch { /* noop */ }
    setLoading(false);
  };

  const fetchHistory = async () => {
    try {
      const r = await fetch(`${API_BASE}/v1/albert/brief/history?days=7`, { cache: 'no-store' });
      const j = await r.json();
      setHistory(j.history || []);
    } catch { /* noop */ }
  };

  useEffect(() => { fetchBrief(); fetchHistory(); }, []);

  const brief = data?.brief;
  const isV2 = data?.version === 'v2' && brief;

  // Shared history timeline component
  const HistoryTimeline = () => history.length > 1 ? (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50">
      <button onClick={() => setHistoryOpen(!historyOpen)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-slate-800/30">
        <History className="h-4 w-4 text-violet-400" />
        <span className="text-[13px] font-semibold text-slate-200">Brief History</span>
        <span className="text-[11px] text-slate-500">{history.length} days</span>
        <div className="ml-auto">{historyOpen ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}</div>
      </button>
      {historyOpen && (
        <div className="border-t border-slate-800 px-4 pb-3 pt-2 space-y-1.5">
          {history.map((h) => {
            const isActive = selectedDate === h.date || (!selectedDate && h === history[0]);
            const convC = (h.conviction || '').toLowerCase() === 'high' ? 'text-emerald-400' : (h.conviction || '').toLowerCase() === 'low' ? 'text-red-400' : 'text-amber-400';
            const callC = (h.market_call || '').toLowerCase().includes('bull') ? 'text-emerald-400' : (h.market_call || '').toLowerCase().includes('bear') ? 'text-red-400' : 'text-amber-400';
            return (
              <button key={h.date} onClick={() => { fetchBrief(false, h.date); setHistoryOpen(false); }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${isActive ? 'border border-violet-500/40 bg-violet-500/[0.08]' : 'border border-transparent hover:bg-slate-800/50'}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                    <span className="text-[12px] font-semibold text-slate-300">{new Date(h.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                    {h.market_call && <span className={`text-[11px] font-bold ${callC}`}>{h.market_call}</span>}
                    {h.conviction && <span className={`text-[10px] font-bold ${convC}`}>{h.conviction}</span>}
                    {h.version === 'v2' && <span className="rounded bg-violet-500/15 px-1 py-0.5 text-[9px] font-bold text-violet-300">v2</span>}
                  </div>
                  <p className="mt-0.5 truncate text-[12px] text-slate-500">{h.headline || h.executive_summary || 'Brief available'}</p>
                </div>
                {isActive && <span className="shrink-0 text-[10px] font-bold text-violet-400">Viewing</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  ) : null;

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
      </div>
    );
  }

  // Fallback for v1 briefs (legacy text format)
  if (!isV2) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" />Back to dashboard
        </button>
        <HistoryTimeline />
        <Card className="border-0 bg-gradient-to-br from-violet-500/[0.06] to-slate-900 p-6 ring-1 ring-violet-500/25">
          <h2 className="text-xl font-bold text-white">Albert's Brief</h2>
          {data?.text ? (
            <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-slate-200">{data.text}</p>
          ) : (
            <p className="mt-4 text-slate-400">No brief available yet. Refresh to generate one.</p>
          )}
          <Button onClick={() => fetchBrief(true)} disabled={refreshing} variant="outline" className="mt-4">
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />{refreshing ? 'Generating…' : 'Refresh'}
          </Button>
        </Card>
        {data?.generated_at && (
          <p className="text-center text-[11px] text-slate-600">Published {fmtDate(data.generated_at)}</p>
        )}
      </div>
    );
  }

  const sources = brief.sources || data?.brief?.sources || [];

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 pb-16">
      {/* Back button */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-slate-400 transition-colors hover:text-white">
        <ArrowLeft className="h-4 w-4" />Back to dashboard
      </button>

      {/* History timeline */}
      <HistoryTimeline />

      {/* Header */}
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-violet-500/[0.08] via-slate-900 to-slate-950 p-6 ring-1 ring-violet-500/20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex-1">
            <h1 className="text-2xl font-black leading-tight text-white sm:text-3xl">{brief.headline}</h1>
            <p className={`mt-2 text-lg font-bold ${callColor(brief.market_call)}`}>{brief.market_call}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${convictionColor(brief.conviction)}`}>
              Conviction: {brief.conviction}
            </span>
            {refreshing && (
              <span className="flex items-center gap-1 text-[11px] text-amber-300 animate-pulse">
                <Loader2 className="h-3 w-3 animate-spin" />Albert is updating…
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Generated {timeAgo(data.generated_at)}</span>
          {brief.data_cutoff && <span>Data cutoff: {fmtDate(brief.data_cutoff)}</span>}
          <Button onClick={() => fetchBrief(true)} disabled={refreshing} size="sm" variant="outline"
            className="ml-auto h-7 gap-1 border-slate-700 text-[11px] text-slate-300 hover:border-violet-500/50">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />{refreshing ? 'Updating…' : 'Refresh'}
          </Button>
        </div>

        {/* Thesis */}
        <p className="mt-4 text-[15px] leading-relaxed text-slate-200">{brief.overall_thesis}</p>

        {/* Executive summary */}
        <div className="mt-4 rounded-xl border border-sky-500/20 bg-sky-500/[0.04] p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-sky-400">Executive summary</p>
          <p className="text-[14px] leading-relaxed text-slate-200 whitespace-pre-line">{brief.executive_summary}</p>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Evidence-led analysis</p>
        {(brief.sections || []).map((sec, i) => (
          <Section key={sec.id || i} sec={sec} sources={sources} defaultOpen={i === 0} onNav={onNav} />
        ))}
      </div>

      {/* Confirmation / Invalidation */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-emerald-400"><TrendingUp className="h-4 w-4" />Bullish confirmation</p>
          <p className="mt-2 text-[14px] leading-relaxed text-slate-200">{brief.bullish_confirmation}</p>
        </div>
        <div className="rounded-xl border border-red-500/25 bg-red-500/[0.04] p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-red-400"><TrendingDown className="h-4 w-4" />Bearish invalidation</p>
          <p className="mt-2 text-[14px] leading-relaxed text-slate-200">{brief.bearish_invalidation}</p>
        </div>
      </div>

      {/* Conclusion */}
      <Card className="border-0 bg-slate-900 p-5 ring-1 ring-slate-800">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Conclusion</p>
        <p className="text-[15px] leading-relaxed text-slate-200">{brief.conclusion}</p>
      </Card>

      {/* Watch next */}
      {(brief.watch_next || []).length > 0 && (
        <Card className="border-0 bg-slate-900 p-5 ring-1 ring-slate-800">
          <p className="mb-3 flex items-center gap-2 text-sm font-bold text-violet-300"><Eye className="h-4 w-4" />What Albert is watching next</p>
          <ul className="space-y-2">
            {brief.watch_next.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-[14px] text-slate-200">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />{w}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Sources */}
      {sources.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Sources & observation times</p>
          <div className="space-y-2">
            {sources.map((s) => (
              <div key={s.id} className="flex items-center gap-3 text-[13px]">
                <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-500">{s.id}</span>
                <a href={s.url} target="_blank" rel="noopener noreferrer"
                  className="flex-1 truncate font-medium text-sky-400 hover:text-sky-300">
                  {s.title || s.publisher || 'Source'}<ExternalLink className="ml-1 inline h-3 w-3" />
                </a>
                <span className="shrink-0 text-[11px] text-slate-600">{s.publisher}</span>
                {s.retrieved_at && <span className="shrink-0 text-[11px] text-slate-600">{timeAgo(s.retrieved_at)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
