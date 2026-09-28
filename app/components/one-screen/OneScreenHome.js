'use client';

import React, { useEffect, useState } from 'react';
import {
  Sparkles, Wallet, ShieldAlert, GitBranch, BarChart3, Newspaper,
  Waves, ArrowUpRight, Maximize2, RefreshCw, ShieldCheck,
} from 'lucide-react';
import ModalShell from './ModalShell';
import DashboardAskPanel from './DashboardAskPanel';
import { BTCChart, MarketChart, ExpandedChart, matchedMarketSeries } from './OneScreenCharts';
import EvidenceDrawer from '../albert/EvidenceDrawer';

const money = (v, decimals = 0) => v == null || v === '' || !Number.isFinite(Number(v)) ? 'unavailable'
  : `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
const signed = (v, unit = '%') => v == null || !Number.isFinite(Number(v)) ? 'unavailable'
  : `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(1)}${unit}`;
const pct = (v) => v == null || !Number.isFinite(Number(v)) ? 'unavailable' : `${Number(v).toFixed(1)}%`;
const num = (v) => v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
const parseTime = (v) => {
  if (!v) return null;
  const raw = String(v);
  const date = typeof v === 'number' || /^\d{10}$/.test(raw) ? new Date(Number(v) * 1000)
    : new Date(/^\d{4}-\d{2}-\d{2}T/.test(raw) && !/(Z|[+-]\d\d:?\d\d)$/.test(raw) ? `${raw}Z` : /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw);
  return Number.isNaN(date.getTime()) ? null : date;
};
const when = (v, dateOnly = false) => {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v} (date only)`;
  const d = parseTime(v);
  return d ? d.toLocaleString(undefined, dateOnly ? { year: 'numeric', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : 'time unavailable';
};
const titleCase = (v) => String(v || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const getSnap = (claim) => (claim?.evidenceRefs || []).find((r) => String(r).startsWith('snap_')) || null;

const CARD_LINKS = Object.fromEntries(
  ['brief', 'paper', 'portfolio', 'btc', 'intelligence', 'news', 'evidence', 'flows', 'radar']
    .map((id) => [id, [['See all source results first', `dashboard-${id}`]]]));
const linkTo = (id) => `/?section=${encodeURIComponent(id)}`;
const NavigateLink = ({ id, children, onNav, className = '' }) => <a href={linkTo(id)} onClick={(e) => { e.preventDefault(); onNav(id); }}
  className={`inline-flex items-center gap-1 font-semibold text-sky-300 hover:text-sky-200 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${className}`}>{children}</a>;

/* ── Ticker: show engine values, no dashboard freshness thresholds ── */
const TickerContent = ({ d, ticker, snapshot }) => {
  const { sop, etf, outlook, streams } = snapshot;
  const phase = sop?.marketStreams?.phaseAssessment || streams?.phaseAssessment;
  const breadth = phase?.inputs;
  const band = outlook?.band;
  const net = etf?.net_1d;
  const claim = (sop?.briefing?.claims || []).find((c) => c.claimId === 'briefing.direction');
  const change24 = ticker?.change24h ?? ticker?.changePct24h;
  const ledger = d?.prediction_ledger?.overall || {};
  const accuracy = num(ledger.accuracy);
  const graded = num(ledger.n);
  const forecastPerf = accuracy != null && graded != null && graded > 0
    ? `${accuracy.toFixed(0)}% · ${graded} graded` : 'Unavailable';
  return [
    { title: 'BTC spot', value: ticker?.price ? `${money(ticker.price)} · ${change24 != null ? signed(change24) : ''}` : 'Unavailable', to: 'market-intel',
      what: ticker?.price ? `BTC/USD spot ${money(ticker.price)}; 24h change ${change24 != null ? signed(change24) : 'unavailable'}.` : 'Quote unavailable.',
      source: ticker?.source || 'ticker', asOf: ticker?.ts },
    { title: 'BTC dominance', value: num(d?.dominance?.dominance) != null ? `${num(d.dominance.dominance).toFixed(1)}%${num(d.dominance.change_7d) != null ? ` · ${signed(d.dominance.change_7d, ' pts')}` : ''}` : 'Unavailable', to: 'crossmarket',
      what: num(d?.dominance?.dominance) != null ? `BTC dominance ${num(d.dominance.dominance).toFixed(2)}%.` : 'Not reported.',
      source: 'CoinGecko', asOf: d?.created_at },
    { title: 'Altcoin breadth', value: breadth?.altsWithReturns > 0 ? `${breadth.altsBeatingBtc}/${breadth.altsWithReturns} beat BTC` : 'Unavailable', to: 'market-intel',
      what: breadth?.altsWithReturns > 0 ? `${breadth.altsBeatingBtc} of ${breadth.altsWithReturns} altcoins beat BTC.` : 'Unavailable.',
      source: 'phase assessment', asOf: phase?.assessedAt },
    { title: 'ETF net flow', value: net == null ? 'Unavailable' : `${signed(net, 'm')} · ${etf?.latest_date ? etf.latest_date.slice(5) : ''}`, to: 'institutional',
      what: net == null ? 'Unavailable.' : `Net flow ${signed(net, 'm USD')} for ${etf?.latest_date || ''}.`,
      source: etf?.source || 'ETF report', asOf: etf?.latest_date },
    { title: 'Market stance', value: sop?.market?.regime ? titleCase(sop.market.regime) : 'Unavailable', to: 'briefing',
      what: claim?.text || (sop?.market?.regime ? `Regime: ${titleCase(sop.market.regime)}.` : 'Unavailable.'),
      source: 'canonical regime', asOf: sop?.market?.asOf || sop?.generatedAt },
    { title: '7d historical range', value: band?.lowerPct != null && band?.upperPct != null ? `${signed(band.lowerPct)} to ${signed(band.upperPct)}` : 'Unavailable', to: 'scenarios',
      what: band?.lowerPct != null ? `20th\u201380th pct: ${signed(band.lowerPct)} to ${signed(band.upperPct)}.` : band?.reasonText || 'Unavailable.',
      source: 'scenario-outlooks/preview', asOf: outlook?.baseline?.observedAt },
    { title: 'Forecast performance', value: forecastPerf, to: 'scenario-evaluation',
      what: accuracy != null ? `${accuracy.toFixed(0)}% accuracy, ${graded} graded.` : 'Unavailable.',
      source: 'prediction_ledger', asOf: d?.prediction_ledger?.overall?.lastGradedAt },
  ];
};

// Map specialist screen IDs to their correct consolidated dashboard routes.
const TICKER_DEST_MAP = {
  'market-intel': 'dashboard-intelligence',
  'crossmarket': 'dashboard-intelligence',
  'institutional': 'dashboard-flows',
  'briefing': 'dashboard-brief',
  'scenarios': 'dashboard-btc',
  'scenario-evaluation': 'scenario-evaluation',
};

const Explanation = ({ item, onNav, onEvidence }) => <div className="space-y-3 text-sm leading-relaxed text-slate-300">
  <p>{item.what || 'Not available.'}</p>
  <p className="border-t border-slate-700 pt-3 text-xs text-slate-400">Source: {item.source || 'unavailable'} · As of {when(item.asOf)}</p>
  {item.snapshotId && <button type="button" onClick={() => onEvidence(item.snapshotId)} className="flex items-center gap-1.5 text-sm font-semibold text-sky-300 underline"><ShieldCheck className="h-4 w-4" />Open evidence</button>}
  {item.to && <NavigateLink id={TICKER_DEST_MAP[item.to] || (item.to.startsWith('dashboard-') ? item.to : `dashboard-${item.to}`)} onNav={onNav} className="text-sm">Open detailed screen<ArrowUpRight className="h-3.5 w-3.5" /></NavigateLink>}
</div>;

const HomeTicker = ({ d, ticker, snapshot, onNav }) => {
  const [item, setItem] = useState(null);
  const [evidenceId, setEvidenceId] = useState(null);
  const items = TickerContent({ d, ticker, snapshot });
  const close = () => setItem(null);
  return <>
    <div aria-label="Market snapshot ticker" className="order-last flex w-full shrink-0 items-center justify-between gap-0 overflow-x-auto [scrollbar-width:thin] xl:order-none xl:min-w-0 xl:w-auto xl:flex-1 xl:shrink">
      {items.map((entry, index) => <button type="button" key={entry.title} onClick={() => setItem(index)} aria-label={`${entry.title}: ${entry.value}`}
        className="flex min-h-9 shrink-0 flex-col justify-center whitespace-nowrap rounded-md border border-transparent px-1 text-left hover:border-sky-500/40 hover:bg-slate-800/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{entry.title}</span>
        <span className="text-xs font-bold text-white">{entry.value}</span>
      </button>)}
    </div>
    {item != null && <ModalShell title={items[item].title} onClose={close} className="max-w-xl">
      <Explanation item={items[item]} onNav={(id) => { close(); onNav(id); }} onEvidence={(sid) => { close(); setEvidenceId(sid); }} />
    </ModalShell>}
    {evidenceId && <EvidenceDrawer snapshotId={evidenceId} onClose={() => setEvidenceId(null)} />}
  </>;
};

/* ── Card chrome ── */
const DashboardCard = ({ cardId, title, icon: Icon, status, summary, freshness, children, onOpen, onAsk, detail }) => <article
  onClick={(e) => { if (!e.target.closest('button, a')) onOpen(); }}
  className="flex min-w-0 cursor-pointer flex-col rounded-lg border border-slate-700/80 bg-slate-900/80 p-3 shadow-sm shadow-black/20 xl:min-h-[195px]">
  <div className="flex min-h-5 items-center gap-1.5">
    <Icon className="h-4 w-4 shrink-0 text-sky-300" />
    <h2 className="min-w-0 truncate text-[13px] font-bold text-white" title={title}><button id={`home-card-${cardId}`} type="button" onClick={onOpen} className="max-w-full truncate text-left hover:text-sky-200 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">{title}</button></h2>
    {status && <span className={`ml-auto shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-bold ${['stale', 'error', 'unavailable'].includes(String(status).toLowerCase()) ? 'bg-amber-500/15 text-amber-200' : 'bg-sky-500/10 text-sky-200'}`}>{titleCase(status)}</span>}
  </div>
  <p className="mt-1 line-clamp-3 text-xs leading-snug text-slate-300">{summary}</p>
  <div className="mt-1 min-h-0 flex-1 text-xs leading-snug text-slate-200">{children}</div>
  <div className="mt-1 flex shrink-0 items-center gap-2 border-t border-slate-800 pt-1.5 text-xs">
    <span className="min-w-0 flex-1 truncate text-[11px] text-slate-400" title={freshness}>{freshness || ''}</span>
    <button type="button" onClick={onAsk} className="shrink-0 rounded-sm p-0.5 text-sky-300 hover:text-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"><Sparkles className="h-3.5 w-3.5" /></button>
    <button type="button" onClick={onOpen} className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-sky-300 hover:text-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">{detail || 'Open details'}<ArrowUpRight className="h-3.5 w-3.5" /></button>
  </div>
</article>;

/* ── Home ── */
const OneScreenHome = ({ d, dashboardStatus = 'loading', ticker, news, newsStatus, snapshot, onNav }) => {
  const [chart, setChart] = useState(null);
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    const id = typeof window !== 'undefined' ? window.__dashboardReturnCard : null;
    if (!id) return;
    const frame = window.requestAnimationFrame(() => { document.getElementById(`home-card-${id}`)?.focus(); window.__dashboardReturnCard = null; });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const [evidenceId, setEvidenceId] = useState(null);
  const { sop, paper, outlook, eth, streams, driver, etf, whales, network, sentiment, brief, health } = snapshot;
  const claims = sop?.briefing?.claims || [];
  const directionClaim = claims.find((c) => c.claimId === 'briefing.direction');
  const leadershipClaim = claims.find((c) => c.claimId === 'briefing.leadership');
  const portfolioClaim = claims.find((c) => c.claimId === 'briefing.portfolio');
  const secondReason = claims.find((c) => c.claimId === 'briefing.turnover');
  const totals = paper?.totals;
  const positions = paper?.positions || [];
  const entries = (paper?.recentFills || []).filter((e) => e.eventType === 'FILL' && (e.side === 'BUY' || e.side === 'SELL')).slice(0, 2);
  const pnlVal = num(totals?.pnlUsd);
  const pnlLabel = pnlVal == null ? 'Unavailable' : Math.abs(pnlVal) < 0.005 ? 'Neutral' : pnlVal > 0 ? 'Profit' : 'Loss';
  const leadingPosition = positions.map((p) => ({ asset: p.asset, value: num(p.currentPrice) != null && num(p.netQuantity) != null ? num(p.currentPrice) * num(p.netQuantity) : null })).filter((p) => p.value != null).sort((a, b) => b.value - a.value)[0] || null;
  const research = streams?.researchFindings || sop?.marketStreams?.researchFindings;
  const findings = (research?.findings || []).filter((f) => f.status === 'OPEN').slice(0, 2);
  const lead = driver?.currentLeader;
  const next = driver?.nextMoverCandidates?.[0];
  const paperNews = [...(news?.cards || [])].filter((c) => c?.title).sort((a, b) => (b.impact || 0) - (a.impact || 0));
  const story = paperNews[0];
  const band = outlook?.band;
  const val = outlook?.validation || band?.validation;
  const valText = val?.predictiveValidation && val?.evaluation?.evaluationPoints > 0 ? `Validated · ${val.evaluation.evaluationPoints} checks` : !val ? 'Unavailable' : 'Not validated';
  const marketRows = matchedMarketSeries(outlook, eth);
  const lastSharedMarket = marketRows.filter((p) => p.BTC != null && p.ETH != null).at(-1);
  const returns = lastSharedMarket ? `BTC ${signed(lastSharedMarket.BTC - 100)} · ETH ${signed(lastSharedMarket.ETH - 100)}` : 'Unavailable';
  const phase = streams?.phaseAssessment || sop?.marketStreams?.phaseAssessment;
  const nextEvent = d?.event_calendar?.next_high_impact;
  const availableLevels = Array.isArray(d?.chart?.sr_levels) ? d.chart.sr_levels : [];
  const anchor = num(outlook?.history?.at(-1)?.close);
  const support = anchor != null ? availableLevels.filter((l) => l.type === 'support' && num(l.price) != null && num(l.price) < anchor).sort((a, b) => Number(b.price) - Number(a.price))[0] : null;
  const ceiling = anchor != null ? availableLevels.filter((l) => l.type === 'resistance' && num(l.price) != null && num(l.price) > anchor).sort((a, b) => Number(a.price) - Number(b.price))[0] : null;
  const whale = (whales?.whales || []).find((w) => w.change_7d != null) || whales?.whales?.[0];
  const briefChanges = (sop?.changesSinceLastVisit || []).slice(0, 1);
  const claimTime = sop?.market?.asOf || sop?.generatedAt;
  const last = (source, asOf) => `${source} · ${when(asOf)}`;

  /* ── Brief API data ── */
  const briefTake = brief?.take || brief?.brief?.take;

  /* ── Commentary builders ── */
  const briefCommentary = briefTake || directionClaim?.text || 'Market assessment is loading.';

  const paperCommentary = (() => {
    if (!totals?.value) return 'Paper trading wallet is loading or unavailable.';
    const start = num(totals.startingCash);
    const current = num(totals.value);
    const pnl = num(totals.pnlUsd);
    const pnlP = num(totals.pnlPct);
    if (start == null || current == null) return 'Portfolio summary unavailable.';
    const status = pnl == null ? 'flat' : Math.abs(pnl) < 0.01 ? 'flat' : pnl > 0 ? 'in profit' : 'at a loss';
    const amt = pnl != null ? `, ${money(Math.abs(pnl), 2)} (${signed(pnlP)})` : '';
    const realized = num(totals.realizedPnl);
    const unrealized = pnl != null && realized != null ? pnl - realized : null;
    let detail = '';
    if (realized != null && unrealized != null && (Math.abs(realized) >= 0.01 || Math.abs(unrealized) >= 0.01)) {
      detail = ` Realised results account for ${money(Math.abs(realized), 2)}; open holdings for ${money(Math.abs(unrealized), 2)}.`;
    }
    return `The portfolio is ${status}${amt} relative to ${money(start, 2)} starting capital.${detail}`;
  })();

  const portfolioCommentary = (() => {
    if (!positions.length) return 'No open holdings. All capital is held in cash.';
    const totalVal = num(totals?.value);
    const cashVal = paper?.cashAvailable ? num(paper.cashTotal) : null;
    const leader = leadingPosition;
    const riskPct = num(paper?.openRiskPct);
    const riskLimit = num(paper?.openRiskLimitPct);
    let line1 = leader && totalVal > 0 ? `Exposure is concentrated in ${leader.asset} at ${pct(leader.value / totalVal * 100)} of portfolio` : `${positions.length} position${positions.length > 1 ? 's' : ''} open`;
    if (cashVal != null && totalVal > 0) line1 += `, with ${pct(cashVal / totalVal * 100)} held in cash`;
    line1 += '.';
    let line2 = '';
    if (riskPct != null && riskLimit != null) {
      line2 = ` Open risk uses ${pct(riskPct)} of the ${pct(riskLimit)} limit${riskPct > riskLimit * 0.8 ? ' — approaching capacity' : ''}.`;
    }
    return line1 + line2;
  })();

  const btcCommentary = (() => {
    const stmt = band?.statement;
    if (stmt) return stmt;
    if (band?.lowerPct == null) return band?.reasonText || 'Scenario analysis is loading or unavailable.';
    let text = `Historical 7-day scenarios show outcomes from ${signed(band.lowerPct)} to ${signed(band.upperPct)}`;
    if (anchor != null) text += ` from ${money(anchor)}`;
    text += '.';
    if (support || ceiling) {
      text += ` Key levels: support ${support ? money(support.price) : 'not identified'}, resistance ${ceiling ? money(ceiling.price) : 'not identified'}.`;
    }
    return text;
  })();

  const intelCommentary = (() => {
    const detail = lead?.detail || lead?.explanation;
    if (detail) {
      let text = String(detail).length > 120 ? String(detail).slice(0, 117) + '…' : detail;
      if (next?.condition) {
        text += ` Next: ${titleCase(next.actor)} if ${next.condition} (${next.probabilityBand || 'unrated'}).`;
      }
      return text;
    }
    if (lead) {
      let text = `${titleCase(lead.actor || lead.label)} leads with a ${driver?.marketPosture || 'neutral'} posture.`;
      if (next?.condition) {
        text += ` ${titleCase(next.actor)} could take over if ${next.condition} (${next.probabilityBand || 'unrated'}).`;
      }
      return text;
    }
    return 'Market driver analysis is loading or unavailable.';
  })();

  const newsCommentary = (() => {
    if (!story) return 'No significant developments reported.';
    const summary = story.ai?.summary;
    const why = story.ai?.why_it_matters;
    if (summary && why) return `${summary} ${why}`;
    if (summary) return summary;
    if (why) return `${story.title}. ${why}`;
    return story.title || 'News loading.';
  })();

  const flowsCommentary = (() => {
    const parts = [];
    if (etf?.net_1d != null) {
      const dir = etf.net_1d > 0 ? 'positive' : etf.net_1d < 0 ? 'negative' : 'flat';
      parts.push(`ETF flows were ${dir} at ${signed(etf.net_1d, 'm USD')} for ${etf.latest_date || 'the latest session'}`);
    }
    const whaleList = whales?.whales || [];
    if (whaleList.length > 0) {
      const accumulating = whaleList.filter((w) => w.signal && /accumulat/i.test(w.signal)).length;
      const distributing = whaleList.filter((w) => w.signal && /distribut/i.test(w.signal)).length;
      if (accumulating > distributing) parts.push(`tracked whale wallets lean toward accumulation`);
      else if (distributing > accumulating) parts.push(`tracked whale wallets lean toward distribution`);
      else parts.push(`${whaleList.length} whale wallets tracked with mixed signals`);
    }
    if (sentiment?.value != null) {
      const label = sentiment.label || (sentiment.value <= 25 ? 'fear' : sentiment.value >= 75 ? 'greed' : 'neutral');
      parts.push(`sentiment reads ${sentiment.value}/100 (${label})`);
    }
    if (!parts.length) return 'On-chain and flow data is loading or unavailable.';
    // Capitalise first letter
    const joined = parts.join('; ');
    return joined.charAt(0).toUpperCase() + joined.slice(1) + '.';
  })();

  /* Evidence & Engines commentary */
  const evidenceCommentary = (() => {
    const parts = [];
    const evalChecks = outlook?.validation?.evaluation?.evaluationPoints;
    const isValidated = outlook?.validation?.predictiveValidation;
    if (isValidated && evalChecks) parts.push(`scenario engine passed ${evalChecks} predictive checks`);
    else if (evalChecks) parts.push(`scenario engine completed ${evalChecks} checks, not yet validated`);
    const accuracy = num(d?.prediction_ledger?.overall?.accuracy);
    const graded = num(d?.prediction_ledger?.overall?.n);
    if (accuracy != null && graded > 0) parts.push(`prediction ledger records ${accuracy.toFixed(0)}% accuracy across ${graded} forecasts`);
    const closed = totals?.closedTrades;
    const winRate = totals?.winRatePct;
    if (closed != null && closed > 0) parts.push(`paper trading closed ${closed} trade${closed > 1 ? 's' : ''} at ${winRate != null ? pct(winRate) : 'unknown'} win rate`);
    if (!parts.length) return 'Engine and evidence status loading.';
    const joined = parts.join('; ');
    return joined.charAt(0).toUpperCase() + joined.slice(1) + '.';
  })();

  /* ── Ask helper: pass readable context ── */
  const ask = (id, cardTitle, commentary, sourceName, asOf) => setSelected({
    title: cardTitle || id,
    to: `dashboard-${id}`,
    commentary: commentary || '',
    source: sourceName,
    asOf,
  });
  const open = (id) => { if (typeof window !== 'undefined') window.__dashboardReturnCard = id; onNav(`dashboard-${id}`); };
  const focusableChart = (type, title, preview) => <button type="button" onClick={() => setChart(type)} className="group relative mt-1 block w-full rounded-md border border-slate-700/70 bg-slate-950/60 p-1.5 text-left hover:border-sky-500/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
    {preview}<span className="absolute right-1 top-1 rounded bg-slate-900/90 p-1 text-sky-200 group-hover:bg-sky-500/30"><Maximize2 className="h-3 w-3" /></span>
  </button>;
  return <>
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <h1 className="text-base font-bold text-white">Your market at a glance</h1>
      <button type="button" onClick={snapshot.refresh} aria-label="Refresh" className="ml-auto rounded-md border border-slate-700 p-1.5 text-slate-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"><RefreshCw className="h-4 w-4" /></button>
    </div>
    <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start xl:grid-cols-[minmax(0,1fr)_320px] xl:items-stretch 2xl:grid-cols-[minmax(0,1fr)_350px]">
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 xl:grid-rows-3">
        {/* 1. Albert's Brief — spans three rows on the left */}
        <article onClick={(e) => { if (!e.target.closest('button, a')) open('brief'); }}
          className="flex min-w-0 cursor-pointer flex-col rounded-lg border border-slate-700/80 bg-slate-900/80 p-3 shadow-sm shadow-black/20 xl:row-span-3">
          <div className="flex min-h-5 items-center gap-1.5">
            <Sparkles className="h-4 w-4 shrink-0 text-sky-300" />
            <h2 className="min-w-0 truncate text-[13px] font-bold text-white"><button id="home-card-brief" type="button" onClick={() => open('brief')} className="max-w-full truncate text-left hover:text-sky-200 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">Albert's Brief</button></h2>
            {health?.sop && <span className={`ml-auto shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-bold ${['stale', 'error', 'unavailable'].includes(String(health.sop).toLowerCase()) ? 'bg-amber-500/15 text-amber-200' : 'bg-sky-500/10 text-sky-200'}`}>{titleCase(health.sop)}</span>}
          </div>
          {/* Lead with Albert's market interpretation */}
          <p className="mt-1 text-xs leading-snug text-slate-300">{briefCommentary}</p>
          <div className="mt-2 flex-1 space-y-2 text-xs leading-snug text-slate-200">
            {/* Key change and drivers */}
            <div>
              {briefChanges[0]?.detail && <p className="line-clamp-2"><b>Since last visit:</b> {briefChanges[0].detail}</p>}
              {leadershipClaim?.text && <p className="mt-0.5 line-clamp-2"><b>Drivers:</b> {leadershipClaim.text}</p>}
              {secondReason?.text && <p className="mt-0.5 line-clamp-1 text-slate-400">{secondReason.text}</p>}
            </div>
            {/* Portfolio implication */}
            <div className="border-t border-slate-800 pt-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Portfolio</p>
              <p className="mt-0.5 line-clamp-2">{portfolioClaim?.text || (pnlVal != null ? `${pnlLabel}: ${money(Math.abs(pnlVal), 2)} (${signed(totals?.pnlPct)}) on ${money(totals?.value, 2)} portfolio` : 'Unavailable')}</p>
            </div>
            {/* Evidence & Engines */}
            <div className="border-t border-slate-800 pt-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Evidence & Engines</p>
              <p className="mt-0.5 line-clamp-2 text-slate-300">{evidenceCommentary}</p>
              <NavigateLink id="dashboard-evidence" onNav={onNav} className="mt-0.5 text-[11px]">Full evidence & engines<ArrowUpRight className="h-3 w-3" /></NavigateLink>
            </div>
            {/* Opportunity Radar */}
            <div className="border-t border-slate-800 pt-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Opportunity Radar</p>
              {findings.length ? findings.map((f, i) => <div key={f.findingId || i} className="mt-0.5">
                <p className="line-clamp-2">{f.hypothesis || f.title || 'Untitled'}</p>
                {(f.confirmIf || f.invalidateIf || f.resolveBy) && <p className="line-clamp-1 text-[11px] text-slate-400">{f.confirmIf ? `Confirm: ${f.confirmIf}` : f.invalidateIf ? `Invalidate: ${f.invalidateIf}` : `Resolve by: ${f.resolveBy}`}</p>}
              </div>) : <p className="text-slate-400">No open setups</p>}
              <NavigateLink id="dashboard-radar" onNav={onNav} className="mt-0.5 text-[11px]">Full opportunity radar<ArrowUpRight className="h-3 w-3" /></NavigateLink>
            </div>
          </div>
          <div className="mt-1 flex shrink-0 items-center gap-2 border-t border-slate-800 pt-1.5 text-xs">
            <span className="min-w-0 flex-1 truncate text-[11px] text-slate-400">{last('Regime', claimTime)}</span>
            <button type="button" onClick={() => ask('brief', "Albert's Brief", briefCommentary, 'State of Play', claimTime)} className="shrink-0 rounded-sm p-0.5 text-sky-300 hover:text-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"><Sparkles className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => open('brief')} className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-sky-300 hover:text-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">Open details<ArrowUpRight className="h-3.5 w-3.5" /></button>
          </div>
        </article>
        {/* 2. Paper Trading */}
        <DashboardCard cardId="paper" title="Paper Trading" icon={Wallet} status={health?.paper} summary={paperCommentary} freshness={last('Ledger', paper?.asOf)} onAsk={() => ask('paper', 'Paper Trading', paperCommentary, 'Paper ledger', paper?.asOf)} onOpen={() => open('paper')}>
          <p className="line-clamp-1"><b>Value:</b> {money(totals?.value, 2)} · <b>P&L:</b> {pnlVal != null ? `${money(Math.abs(pnlVal), 2)} (${signed(totals?.pnlPct)})` : 'unavailable'}</p>
          {entries.length ? entries.map((e, i) => <p key={e.ledgerEventId || i} className="mt-0.5 truncate">{e.side === 'BUY' ? 'Bought' : 'Sold'} {e.qty} {e.asset} @ {money(e.fillPx, 2)}</p>) : <p className="mt-1 text-slate-400">No completed trades</p>}
          {(paper?.pendingApprovals?.length || 0) > 0 && <p className="mt-1 text-amber-200">{paper.pendingApprovals.length} pending proposal(s)</p>}
        </DashboardCard>
        {/* 3. Portfolio & Risk */}
        <DashboardCard cardId="portfolio" title="Portfolio & Risk" icon={ShieldAlert} status={health?.paper} summary={portfolioCommentary} freshness={last('Ledger', paper?.asOf)} onAsk={() => ask('portfolio', 'Portfolio & Risk', portfolioCommentary, 'Paper ledger', paper?.asOf)} onOpen={() => open('portfolio')}>
          {positions.length > 0 && <p className="line-clamp-1">{positions.slice(0, 3).map((p) => `${p.asset} ${num(p.currentPrice) != null && num(p.netQuantity) != null && num(totals?.value) > 0 ? pct(num(p.currentPrice) * num(p.netQuantity) / num(totals.value) * 100) : ''}`).join(' · ')}</p>}
          {paper?.openRiskAvailable && <p className="mt-0.5 line-clamp-1 text-slate-400">Risk: {pct(paper.openRiskPct)} / {pct(paper.openRiskLimitPct)} limit</p>}
        </DashboardCard>
        {/* 4. BTC Bull & Bear */}
        <DashboardCard cardId="btc" title="BTC Bull & Bear" icon={GitBranch} status={health?.outlook} summary={btcCommentary} freshness={last('Candle', outlook?.baseline?.observedAt)} onAsk={() => ask('btc', 'BTC Bull & Bear', btcCommentary, 'Scenario outlooks', outlook?.baseline?.observedAt)} onOpen={() => open('btc')} detail="Scenarios">
          {focusableChart('btc', 'BTC chart', <BTCChart outlook={outlook} levels={availableLevels} />)}
          <p className="mt-1 truncate text-[11px] text-slate-400">{anchor != null ? money(anchor) : ''} · Support {support ? money(support.price) : '?'} / Resistance {ceiling ? money(ceiling.price) : '?'} · {valText}</p>
        </DashboardCard>
        {/* 5. Market Intelligence */}
        <DashboardCard cardId="intelligence" title="Market Intelligence" icon={BarChart3} status={health?.driver} summary={intelCommentary} freshness={last('Driver', driver?.asOf)} onAsk={() => ask('intelligence', 'Market Intelligence', intelCommentary, 'Market driver', driver?.asOf)} onOpen={() => open('intelligence')}>
          {focusableChart('market', 'BTC/ETH', <MarketChart btc={outlook} eth={eth} />)}
          <p className="truncate text-[11px] text-slate-300">{returns} · breadth {phase?.inputs?.altsWithReturns > 0 ? `${phase.inputs.altsBeatingBtc}/${phase.inputs.altsWithReturns}` : '?'}</p>
        </DashboardCard>
        {/* 6. News, Macro & Policy */}
        <DashboardCard cardId="news" title="News, Macro & Policy" icon={Newspaper} status={newsStatus} summary={newsCommentary} freshness={last(story?.source || 'News', story?.published)} onAsk={() => ask('news', 'News, Macro & Policy', newsCommentary, story?.source || 'News', story?.published)} onOpen={() => open('news')}>
          {paperNews.slice(1, 3).map((item, i) => <p key={item.id || i} className="mt-0.5 line-clamp-1"><b>{i + 1}.</b> {item.title}</p>)}
          {nextEvent?.title && <p className="mt-1 truncate text-slate-400">Next event: {nextEvent.title}{nextEvent.date ? ` · ${nextEvent.date}` : ''}</p>}
        </DashboardCard>
        {/* 7. On-Chain & Flows */}
        <DashboardCard cardId="flows" title="On-Chain & Flows" icon={Waves} status={health?.etf} summary={flowsCommentary} freshness={last(etf?.source || 'ETF / Whale', etf?.latest_date || whales?.as_of)} onAsk={() => ask('flows', 'On-Chain & Flows', flowsCommentary, 'ETF + Whale feeds', etf?.latest_date)} onOpen={() => open('flows')}>
          <p className="line-clamp-1">ETF: {etf?.net_1d != null ? `${signed(etf.net_1d, 'm USD')} · ${etf.latest_date || ''}` : 'unavailable'}</p>
          {network?.hashrate_ehs != null && <p className="mt-0.5 line-clamp-1 text-slate-400">Hashrate: {network.hashrate_ehs} EH/s{sentiment?.value != null ? ` · sentiment ${sentiment.value}/100` : ''}</p>}
        </DashboardCard>
      </div>
      <DashboardAskPanel selected={selected} onNav={onNav} onEvidence={setEvidenceId} stateId={sop?.stateId} />
    </div>
    {chart && <ExpandedChart type={chart} outlook={outlook} eth={eth} levels={availableLevels} runAsOf={when(d?.created_at)} onClose={() => setChart(null)} onNav={(id) => onNav(id === 'scenarios' ? 'dashboard-btc' : id === 'crossmarket' ? 'dashboard-intelligence' : id)} onEvidence={(sid) => { setChart(null); setEvidenceId(sid); }} />}
    {evidenceId && <EvidenceDrawer snapshotId={evidenceId} onClose={() => setEvidenceId(null)} />}
  </>;
};

export { HomeTicker, TickerContent, Explanation, NavigateLink, money, signed, pct, when };
export default OneScreenHome;
