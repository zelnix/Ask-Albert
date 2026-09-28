'use client';

import React, { useEffect, useState } from 'react';
import {
  Sparkles, Wallet, ShieldAlert, GitBranch, BarChart3, Newspaper, Database,
  Waves, Radar, ArrowUpRight, Maximize2, RefreshCw, ShieldCheck,
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
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v} (date only; time unavailable)`;
  const d = parseTime(v);
  return d ? d.toLocaleString(undefined, dateOnly ? { year: 'numeric', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : 'time unavailable';
};
const isOld = (v, hours = 26) => { const d = parseTime(v); return d ? Date.now() - d.getTime() > hours * 3600000 : true; };
const titleCase = (v) => String(v || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const getSnap = (claim) => (claim?.evidenceRefs || []).find((r) => String(r).startsWith('snap_')) || null;

const CARD_LINKS = Object.fromEntries(
  ['brief', 'paper', 'portfolio', 'btc', 'intelligence', 'news', 'evidence', 'flows', 'radar']
    .map((id) => [id, [['See all source results first', `dashboard-${id}`]]]));
const linkTo = (id) => `/?section=${encodeURIComponent(id)}`;
const NavigateLink = ({ id, children, onNav, className = '' }) => <a href={linkTo(id)} onClick={(e) => { e.preventDefault(); onNav(id); }}
  className={`inline-flex items-center gap-1 font-semibold text-sky-300 hover:text-sky-200 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${className}`}>{children}</a>;

/* ── Ticker ── */
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
    ? `${accuracy.toFixed(0)}% \u00b7 ${graded} graded` : 'Forecast results unavailable';
  return [
    { title: 'BTC spot', value: ticker?.price && ticker.symbol === 'BTC' ? `${money(ticker.price)} \u00b7 ${change24 != null ? signed(change24) : 'change unavailable'}` : 'Quote unavailable', to: 'market-intel',
      what: ticker?.price && ticker.symbol === 'BTC' ? `BTC/USD spot ${money(ticker.price)}; 24-hour change ${change24 != null ? signed(change24) : 'unavailable'} as of ${when(ticker.ts)}.` : 'A current BTC/USD quote is not available.',
      why: 'The spot quote anchors current market context.', how: `Reported by ${ticker?.source || 'the quote feed'}.`,
      next: 'Updates on the next successful request.', source: 'BTC/USD spot ticker', asOf: ticker?.ts, version: 'ticker quote', state: ticker?.price ? 'ready' : 'unavailable' },
    { title: 'BTC dominance', value: num(d?.dominance?.dominance) != null ? `${num(d.dominance.dominance).toFixed(1)}%${num(d.dominance.change_7d) != null ? ` \u00b7 ${signed(d.dominance.change_7d, ' pts')}` : ''}` : 'Unavailable', to: 'crossmarket',
      what: num(d?.dominance?.dominance) != null ? `BTC dominance ${num(d.dominance.dominance).toFixed(2)}%; 7d change ${signed(d.dominance.change_7d, ' pts')}.` : 'Not reported.',
      why: 'Shifts in BTC dominance indicate relative leadership.', how: 'CoinGecko market cap ratio.',
      next: 'Next market-cap observation.', source: 'CoinGecko', asOf: d?.created_at, version: 'dominance', state: d?.dominance?.dominance != null ? 'ready' : 'unavailable' },
    { title: 'Altcoin breadth', value: breadth?.altsWithReturns > 0 ? `${breadth.altsBeatingBtc}/${breadth.altsWithReturns} beat BTC` : 'Unavailable', to: 'market-intel',
      what: breadth?.altsWithReturns > 0 ? `${breadth.altsBeatingBtc} of ${breadth.altsWithReturns} altcoins beat BTC.` : 'Unavailable.',
      why: 'Broad participation is more durable than narrow leadership.', how: 'Phase assessment eligible-coin comparison.',
      next: 'Next universe update.', source: 'phase assessment', asOf: phase?.assessedAt, version: phase?.ruleVersion, state: breadth?.altsWithReturns > 0 ? 'ready' : 'unavailable' },
    { title: 'ETF net flow', value: net == null ? 'Session unavailable' : `${signed(net, 'm')} \u00b7 ${etf?.latest_date ? etf.latest_date.slice(5) : 'date missing'}`, to: 'institutional',
      what: net == null ? 'Latest ETF session unavailable.' : `Net flow ${signed(net, 'm USD')} for ${etf?.latest_date || 'unknown date'}.`,
      why: 'ETF creations may require sourcing BTC.', how: `Issuer session totals. Source: ${etf?.source || 'Farside/TFTC'}.`,
      next: 'Next issuer session.', source: etf?.source || 'US BTC ETF report', asOf: etf?.latest_date, version: 'daily flow', state: net != null ? 'ready' : 'unavailable' },
    { title: 'Market stance', value: sop?.market?.regime ? titleCase(sop.market.regime) : 'Unavailable', to: 'briefing',
      what: claim?.text || (sop?.market?.regime ? `Regime: ${titleCase(sop.market.regime)}.` : 'No stance.'),
      why: 'Starting context for market interpretation.', how: 'Canonical regime from trend and participation.',
      next: claim?.invalidation || 'Next engine publication.', source: 'canonical regime', asOf: sop?.market?.asOf || sop?.generatedAt, version: sop?.briefing?.ruleVersion, snapshotId: getSnap(claim), state: sop?.market?.regime ? 'ready' : 'unavailable' },
    { title: '7d historical range', value: band?.lowerPct != null && band?.upperPct != null && band?.horizonDays === 7 ? `${signed(band.lowerPct)} to ${signed(band.upperPct)}` : 'Range unavailable', to: 'scenarios',
      what: band?.lowerPct != null ? `20th\u201380th pct: ${signed(band.lowerPct)} to ${signed(band.upperPct)}, 7d.` : `No range: ${band?.reasonText || 'unavailable'}.`,
      why: 'Historical context, not a forecast.', how: band?.lowerPct != null ? `${band.matchedDays ?? ''} matched days.` : 'Pending calibration.',
      next: 'Next closed daily candle.', source: 'scenario-outlooks/preview', asOf: outlook?.baseline?.observedAt, version: outlook?.modelVersion, snapshotId: band?.snapshotId, state: band?.lowerPct != null ? 'ready' : 'unavailable' },
    { title: 'Forecast performance', value: forecastPerf, to: 'scenario-evaluation',
      what: accuracy != null ? `Prediction Ledger: ${accuracy.toFixed(0)}% accuracy, ${graded} graded forecasts.` : 'Forecast results unavailable.',
      why: 'Measured accuracy shows whether ranges historically resolved within bounds.',
      how: 'Prediction Ledger: correct / graded.',
      next: 'Next graded resolution.', source: 'prediction_ledger', asOf: d?.prediction_ledger?.overall?.lastGradedAt || d?.created_at, version: 'prediction ledger', state: accuracy != null ? 'ready' : 'unavailable' },
  ];
};

const Explanation = ({ item, onNav, onEvidence }) => <div className="space-y-3 text-sm leading-relaxed text-slate-300">
  {[['What is observed', item.what], ['Why it matters', item.why], ['How it works / uncertainty', item.how], ['When to revisit', item.next]].map(([label, text]) => <p key={label}><strong className="block text-xs uppercase tracking-wide text-sky-300">{label}</strong>{text || 'Not available for this snapshot.'}</p>)}
  <p className="border-t border-slate-700 pt-3 text-xs text-slate-400">Source: {item.source || 'source unavailable'} \u00b7 As of {when(item.asOf)} \u00b7 Version: {item.version || 'not provided'} \u00b7 Status: {item.state || 'unavailable'}</p>
  {item.snapshotId && <button type="button" onClick={() => onEvidence(item.snapshotId)} className="flex items-center gap-1.5 text-sm font-semibold text-sky-300 underline"><ShieldCheck className="h-4 w-4" />Open immutable evidence</button>}
  {(item.links || (item.to ? [[item.destination || 'Open detailed screen', item.to]] : [])).length > 0 && <div className="border-t border-slate-700 pt-3">
    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Explore the complete detail</p>
    <div className="flex flex-wrap gap-x-4 gap-y-2">{(item.links || [[item.destination || 'Open detailed screen', item.to]]).map(([label, id]) => <NavigateLink key={`${label}-${id}`} id={id} onNav={onNav} className="text-sm">{label}<ArrowUpRight className="h-3.5 w-3.5" /></NavigateLink>)}</div>
  </div>}
</div>;

const HomeTicker = ({ d, ticker, snapshot, onNav, dashboardStatus }) => {
  const [item, setItem] = useState(null);
  const [evidenceId, setEvidenceId] = useState(null);
  const items = TickerContent({ d, ticker, snapshot, dashboardStatus });
  const close = () => setItem(null);
  return <>
    <div aria-label="Market snapshot ticker" className="order-last flex w-full shrink-0 items-center justify-between gap-0 overflow-x-auto [scrollbar-width:thin] xl:order-none xl:min-w-0 xl:w-auto xl:flex-1 xl:shrink">
      {items.map((entry, index) => <button type="button" key={entry.title} onClick={() => setItem(index)} aria-label={`${entry.title}: ${entry.value}. Open explanation`}
        className="flex min-h-9 shrink-0 flex-col justify-center whitespace-nowrap rounded-md border border-transparent px-1 text-left hover:border-sky-500/40 hover:bg-slate-800/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{entry.title}</span>
        <span className="text-xs font-bold text-white">{entry.value}</span>
      </button>)}
    </div>
    {item != null && <ModalShell title={items[item].title} onClose={close} className="max-w-xl">
      <Explanation item={{ ...items[item], to: ({ 'BTC spot': 'dashboard-intelligence', 'BTC dominance': 'dashboard-intelligence', 'Altcoin breadth': 'dashboard-intelligence', 'ETF net flow': 'dashboard-flows', 'Market stance': 'dashboard-brief', '7d historical range': 'dashboard-btc', 'Forecast performance': 'dashboard-evidence' })[items[item].title] || items[item].to }} onNav={(id) => { close(); onNav(id); }} onEvidence={(sid) => { close(); setEvidenceId(sid); }} />
    </ModalShell>}
    {evidenceId && <EvidenceDrawer snapshotId={evidenceId} onClose={() => setEvidenceId(null)} />}
  </>;
};

/* ── Card chrome ── */
const CARD_ID_BY_TITLE = { "Albert\u2019s Brief": 'brief', 'Paper Trading': 'paper', 'Portfolio & Risk': 'portfolio', 'BTC Bull & Bear': 'btc', 'Market Intelligence': 'intelligence', 'News, Macro & Policy': 'news', 'Evidence & Engines': 'evidence', 'On-Chain & Flows': 'flows', 'Opportunity Radar': 'radar' };
const DashboardCard = ({ cardId, title, icon: Icon, status, summary, freshness, children, onOpen, onAsk, detail }) => <article
  onClick={(e) => { if (!e.target.closest('button, a')) onOpen(); }}
  className="flex min-w-0 cursor-pointer flex-col rounded-lg border border-slate-700/80 bg-slate-900/80 p-3 shadow-sm shadow-black/20 xl:min-h-[195px]">
  <div className="flex min-h-5 items-center gap-1.5">
    <Icon className="h-4 w-4 shrink-0 text-sky-300" />
    <h2 className="min-w-0 truncate text-[13px] font-bold text-white" title={title}><button id={`home-card-${cardId || CARD_ID_BY_TITLE[title] || 'overview'}`} type="button" onClick={onOpen} aria-label={`Open ${title} detailed screen`} className="max-w-full truncate text-left hover:text-sky-200 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">{title}</button></h2>
    {status && <span className={`ml-auto shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-bold ${['stale', 'error', 'unavailable', 'unverified', 'needs changes', 'wait'].includes(String(status).toLowerCase()) ? 'bg-amber-500/15 text-amber-200' : 'bg-sky-500/10 text-sky-200'}`}>{titleCase(status)}</span>}
  </div>
  <p className="mt-1 line-clamp-2 text-xs leading-snug text-slate-300">{summary}</p>
  <div className="mt-1 min-h-0 flex-1 text-xs leading-snug text-slate-200">{children}</div>
  <div className="mt-1 flex shrink-0 items-center gap-2 border-t border-slate-800 pt-1.5 text-xs">
    <span className="min-w-0 flex-1 truncate text-[11px] text-slate-400" title={freshness}>{freshness || 'Source time unavailable'}</span>
    <button type="button" onClick={onAsk} aria-label={`Ask Albert about ${title}`} className="shrink-0 rounded-sm p-0.5 text-sky-300 hover:text-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"><Sparkles className="h-3.5 w-3.5" /></button>
    <button type="button" onClick={onOpen} aria-label={`Open ${title} detailed screen`} className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-sky-300 hover:text-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">{detail || 'Open details'}<ArrowUpRight className="h-3.5 w-3.5" /></button>
  </div>
</article>;

/* ── Home ── */
const OneScreenHome = ({ d, dashboardStatus = 'loading', ticker, news, newsStatus, snapshot, onNav }) => {
  const [chart, setChart] = useState(null);
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    const id = typeof window !== 'undefined' ? window.__dashboardReturnCard : null;
    if (!id) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`home-card-${id}`)?.focus();
      window.__dashboardReturnCard = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const [evidenceId, setEvidenceId] = useState(null);
  const { sop, paper, outlook, eth, streams, driver, etf, whales, network, sentiment, health } = snapshot;
  // Derive card states from health without suppressing displayed data.
  const claims = sop?.briefing?.claims || [];
  const directionClaim = claims.find((c) => c.claimId === 'briefing.direction');
  const leadershipClaim = claims.find((c) => c.claimId === 'briefing.leadership');
  const portfolioClaim = claims.find((c) => c.claimId === 'briefing.portfolio');
  const secondReason = claims.find((c) => c.claimId === 'briefing.turnover');
  const totals = paper?.totals;
  const paperLoading = health?.paper === 'loading' || health?.paper === 'idle';
  const positions = paper?.positions || [];
  const entries = (paper?.recentFills || []).filter((e) => e.eventType === 'FILL' && (e.side === 'BUY' || e.side === 'SELL')).slice(0, 2);
  // Display each returned field independently — no rollupComplete gate.
  const pnlVal = num(totals?.pnlUsd);
  const pnlLabel = pnlVal == null ? (paperLoading ? 'Loading' : totals ? 'Basis unavailable' : 'Unavailable')
    : Math.abs(pnlVal) < 0.005 ? 'Neutral' : pnlVal > 0 ? 'Profit' : 'Loss';
  const leadingPosition = positions.map((p) => ({
    asset: p.asset, value: num(p.currentPrice) != null && num(p.netQuantity) != null ? num(p.currentPrice) * num(p.netQuantity) : null
  })).filter((p) => p.value != null).sort((a, b) => b.value - a.value)[0] || null;
  const phase = streams?.phaseAssessment || sop?.marketStreams?.phaseAssessment;
  const research = streams?.researchFindings || sop?.marketStreams?.researchFindings;
  // Display source findings with their classification — no additional exclusions.
  const findings = (research?.findings || []).filter((f) => f.status === 'OPEN').slice(0, 2);
  const lead = driver?.currentLeader;
  const next = driver?.nextMoverCandidates?.[0];
  const paperNews = [...(news?.cards || [])].filter((c) => c?.title).sort((a, b) => (b.impact || 0) - (a.impact || 0));
  const story = paperNews[0];
  const band = outlook?.band;
  const val = outlook?.validation || band?.validation;
  // Display engine evaluation result directly — no browser 240-hour decision.
  const valText = val?.predictiveValidation && val?.evaluation?.evaluationPoints > 0
    ? `Validated \u00b7 ${val.evaluation.evaluationPoints} checks` : !val || val.status === 'PENDING' ? 'Evaluation unavailable' : 'Not validated';
  const participants = (streams?.participants?.participants || []).filter((p) => p?.finding && p?.status !== 'MISSING').slice(0, 2);
  const marketRows = matchedMarketSeries(outlook, eth);
  const lastSharedMarket = marketRows.filter((p) => p.BTC != null && p.ETH != null).at(-1);
  const returns = lastSharedMarket ? `BTC ${signed(lastSharedMarket.BTC - 100)} \u00b7 ETH ${signed(lastSharedMarket.ETH - 100)}` : 'Matched comparison unavailable';
  const dashboardTime = d?.created_at;
  const briefChanges = (sop?.changesSinceLastVisit || []).slice(0, 1);
  const nextEvent = d?.event_calendar?.next_high_impact;
  const nextEventTime = nextEvent?.date || nextEvent?.at || nextEvent?.time;
  const currentLeader = lead?.label || lead?.actor;
  const whale = (whales?.whales || []).find((w) => w.change_7d != null) || whales?.whales?.[0];
  // Display available results from each source independently — no all-feeds-ready requirement.
  const newsState = newsStatus === 'ready' ? (story?.published ? isOld(story.published, 72) ? 'stale' : story?.verification && story.verification !== 'Confirmed' ? 'unverified' : 'ready' : 'unavailable')
    : story ? 'stale' : newsStatus === 'error' ? 'error' : 'loading';
  const last = (source, asOf, dateOnly = false) => `${source} \u00b7 ${when(asOf, dateOnly)}`;
  // No 72-hour rule — use levels as returned.
  const availableLevels = Array.isArray(d?.chart?.sr_levels) ? d.chart.sr_levels : [];
  const anchor = num(outlook?.history?.at(-1)?.close);
  const support = anchor != null ? availableLevels.filter((l) => l.type === 'support' && num(l.price) != null && num(l.price) < anchor).sort((a, b) => Number(b.price) - Number(a.price))[0] : null;
  const ceiling = anchor != null ? availableLevels.filter((l) => l.type === 'resistance' && num(l.price) != null && num(l.price) > anchor).sort((a, b) => Number(a.price) - Number(b.price))[0] : null;
  const claimTime = sop?.market?.asOf || sop?.generatedAt;
  const info = {
    brief: { title: "Albert\u2019s Brief", to: 'briefing', what: directionClaim?.text || 'Market assessment unavailable.', why: leadershipClaim?.text || 'Leadership not confirmed.', how: directionClaim?.invalidation || 'Based on measured trend and participation.', next: 'Next canonical engine publication.', source: 'state-of-play briefing', asOf: claimTime, version: sop?.briefing?.ruleVersion, snapshotId: getSnap(directionClaim), state: health?.sop, links: CARD_LINKS.brief },
    paper: { title: 'Paper Trading', to: 'paper', what: totals ? `Value ${money(totals.value, 2)}; ${pnlLabel}${pnlVal != null ? ` ${money(Math.abs(pnlVal), 2)} (${signed(totals.pnlPct)})` : ''}.` : paperLoading ? 'Loading wallet...' : 'Paper wallet data unavailable.', why: 'Only completed fills affect the ledger.', how: 'Owner-scoped virtual wallets.', next: 'Recalculate after next fill or mark.', source: 'paper/overview', asOf: paper?.asOf, version: 'paper read', state: health?.paper, links: CARD_LINKS.paper },
    portfolio: { title: 'Portfolio & Risk', to: 'paper', what: `${positions.length} holdings. ${paper?.cashAvailable ? `Cash ${money(paper.cashTotal, 2)}.` : ''} ${leadingPosition ? `Largest: ${leadingPosition.asset} ${money(leadingPosition.value, 0)}.` : ''}`, why: 'Holdings expose the account to mark-to-market moves.', how: 'Summed from owner-scoped wallet projections.', next: 'After fill, mark or mandate change.', source: 'paper/overview + mandate', asOf: paper?.asOf, version: 'paper equity/risk', state: health?.paper, links: CARD_LINKS.portfolio },
    btc: { title: 'BTC Bull & Bear', to: 'scenarios', what: band?.lowerPct != null ? `Historical 7d: ${signed(band.lowerPct)} to ${signed(band.upperPct)}. ${valText}.` : `Range unavailable: ${band?.reasonText || 'pending evaluation'}.`, why: 'Historical comparison, not a guarantee.', how: 'Closed daily candles and matched-history analogs.', next: 'After next closed daily candle.', source: 'scenario-outlooks/preview', asOf: outlook?.baseline?.observedAt, version: outlook?.modelVersion, snapshotId: band?.snapshotId, state: health?.outlook, links: CARD_LINKS.btc },
    intelligence: { title: 'Market Intelligence', to: 'drivers', what: lead ? `Leading: ${titleCase(lead.actor || lead.label)} (${lead.evidenceStatus || 'unqualified'}). ${next ? `Watch ${titleCase(next.actor)} \u2014 ${next.probabilityBand || 'unrated'}.` : ''}` : 'Leading driver not established.', why: lead?.detail || 'A driver may explain observed movement.', how: `Driver engine ${driver?.engineVersion || 'unavailable'}. ${lead?.explanation || ''}`, next: next?.condition ? `If ${next.condition}.` : 'Next driver review.', source: 'market-driver', asOf: driver?.asOf, version: driver?.engineVersion, state: health?.driver, links: CARD_LINKS.intelligence },
    news: { title: 'News, Macro & Policy', to: 'news', what: story ? `${story.title} (${story.verification || 'unverified'}).` : 'No sourced development.', why: story?.ai?.why_it_matters || 'Effect not established.', how: story?.ai?.summary || 'Source analysis unavailable.', next: nextEvent?.title ? `${nextEvent.title} \u00b7 ${nextEventTime ? when(nextEventTime) : 'time unconfirmed'}` : 'See calendar.', source: story?.source || 'news feed', asOf: story?.published, version: 'news', state: newsState, links: CARD_LINKS.news },
    evidence: { title: 'Evidence & Engines', to: 'scenario-evaluation', what: `Scenario: ${valText}. Paper: ${health?.paper || 'unavailable'}. Data: ${titleCase(sop?.dataQuality?.status || 'unavailable')}.`, why: 'Source health determines whether numbers are safe to use.', how: 'Paper traces to ledger fills; evaluation checks predictions chronologically.', next: 'After next mark, evaluation or health update.', source: 'state-of-play + evaluation + paper', asOf: val?.evaluation?.lastEvaluatedAt || sop?.generatedAt, version: outlook?.modelVersion || sop?.briefing?.ruleVersion, snapshotId: band?.snapshotId, state: health?.sop, links: CARD_LINKS.evidence },
    flows: { title: 'On-Chain & Flows', to: 'institutional', what: `${etf?.net_1d != null ? `ETF ${etf.latest_date || ''}: ${signed(etf.net_1d, 'm USD')}.` : 'ETF unavailable.'} ${participants[0]?.finding || 'Whale/network not confirmed.'}`, why: 'ETF creations may require sourcing BTC; whale changes alter liquid supply.', how: 'Issuer session totals plus market-participant observations.', next: 'Next provider reporting.', source: 'US ETF + market participants', asOf: etf?.latest_date || streams?.generatedAt, version: streams?.version, state: health?.etf, links: CARD_LINKS.flows },
    radar: { title: 'Opportunity Radar', to: 'opportunities', what: findings[0] ? `${findings[0].title} \u2014 ${titleCase(findings[0].priority)}.` : 'No qualified setup.', why: findings[0]?.hypothesis || 'No current setup.', how: findings[0] ? `Confirm: ${findings[0].confirmIf || 'not specified'}. Invalidate: ${findings[0].invalidateIf || 'not specified'}.` : 'Only measured research enters the radar.', next: findings[0]?.resolveBy ? `By ${when(findings[0].resolveBy)}.` : 'Next market-stream observation.', source: 'market-streams research', asOf: findings[0]?.openedAt || streams?.generatedAt, version: research?.ruleVersion, state: health?.streams, links: CARD_LINKS.radar },
  };
  const ask = (id) => setSelected({ ...info[id], title: info[id].title, to: `dashboard-${id}` });
  const open = (id) => { if (typeof window !== 'undefined') window.__dashboardReturnCard = id; onNav(`dashboard-${id}`); };
  const focusableChart = (type, title, preview) => <button type="button" onClick={() => setChart(type)} aria-label={`Expand ${title} chart to full viewport`}
    className="group relative mt-1 block w-full rounded-md border border-slate-700/70 bg-slate-950/60 p-1.5 text-left hover:border-sky-500/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
    {preview}<span className="absolute right-1 top-1 rounded bg-slate-900/90 p-1 text-sky-200 group-hover:bg-sky-500/30"><Maximize2 className="h-3 w-3" /></span>
  </button>;
  return <>
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <h1 className="text-base font-bold text-white">Your market at a glance</h1>
      <span className="text-xs text-slate-400">Nine evidence-led views \u00b7 paper only</span>
      <button type="button" onClick={snapshot.refresh} aria-label="Refresh dashboard reads" className="ml-auto rounded-md border border-slate-700 p-1.5 text-slate-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"><RefreshCw className="h-4 w-4" /></button>
    </div>
    <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start xl:grid-cols-[minmax(0,1fr)_320px] xl:items-stretch 2xl:grid-cols-[minmax(0,1fr)_350px]">
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 xl:grid-rows-3">
        {/* 1. Albert's Brief */}
        <DashboardCard cardId="brief" title="Albert\u2019s Brief" icon={Sparkles} status={health?.sop} summary={directionClaim?.text || (sop ? 'Market assessment unavailable.' : 'Loading\u2026')} freshness={last('Regime source', claimTime)} onAsk={() => ask('brief')} onOpen={() => open('brief')}>
          <p className="line-clamp-1"><b>Drivers:</b> {leadershipClaim?.text || 'Leadership unavailable'} \u00b7 {secondReason?.text || 'Turnover unavailable'}</p>
          <p className="mt-1 line-clamp-1"><b>Since last visit:</b> {briefChanges[0]?.detail || (sop ? 'No recorded change' : 'Loading')}</p>
          <p className="mt-1 line-clamp-1"><b>My paper position:</b> {portfolioClaim?.text || (totals ? `${money(totals.value, 2)} combined` : 'Unavailable')}</p>
          <p className="mt-1 line-clamp-1 text-slate-400">Next: {directionClaim?.invalidation || 'next engine run'}</p>
        </DashboardCard>
        {/* 2. Paper Trading — lead with value, P&L, cash, holdings, two latest fills */}
        <DashboardCard cardId="paper" title="Paper Trading" icon={Wallet} status={health?.paper} summary={totals?.value != null ? `${money(totals.value, 2)} \u00b7 ${pnlLabel}${pnlVal != null ? ` ${money(Math.abs(pnlVal), 2)} (${signed(totals.pnlPct)})` : ''}` : paperLoading ? 'Loading wallet\u2026' : 'Paper wallet data unavailable'} freshness={last('Owner ledger', paper?.asOf)} onAsk={() => ask('paper')} onOpen={() => open('paper')}>
          <p className="line-clamp-1"><b>Start:</b> {money(totals?.startingCash, 2)} \u00b7 <b>Cash:</b> {paper?.cashAvailable ? money(paper.cashTotal, 2) : (totals?.value != null ? money(num(totals.value) - positions.reduce((s, p) => s + (num(p.currentPrice) || 0) * (num(p.netQuantity) || 0), 0), 2) : 'unavailable')} \u00b7 <b>Holdings value:</b> {positions.length ? money(positions.reduce((s, p) => s + (num(p.currentPrice) || 0) * (num(p.netQuantity) || 0), 0), 2) : 'none'}</p>
          {entries.length ? <div className="mt-1 space-y-0.5">{entries.map((e, i) => <p key={e.ledgerEventId || i} className="truncate">{e.side === 'BUY' ? 'Bought' : 'Sold'} {e.qty} {e.asset} @ {money(e.fillPx, 2)} \u00b7 {when(e.effectiveAt || e.recordedAt)}</p>)}</div> : <p className="mt-1 text-slate-400">{paperLoading ? 'Checking\u2026' : 'No completed paper trades yet.'}</p>}
          <p className="mt-1 text-amber-200">Pending Buy/Sell proposals: {paper?.pendingApprovals?.length ?? 0}</p>
        </DashboardCard>
        {/* 3. Portfolio & Risk — render each returned field independently */}
        <DashboardCard cardId="portfolio" title="Portfolio & Risk" icon={ShieldAlert} status={health?.paper} summary={`${positions.length} holdings \u00b7 cash ${paper?.cashAvailable ? pct(paper.cashPct) : 'unavailable'} \u00b7 largest ${leadingPosition ? `${leadingPosition.asset} ${money(leadingPosition.value, 0)}` : 'unavailable'}`} freshness={last('Owner ledger', paper?.asOf)} onAsk={() => ask('portfolio')} onOpen={() => open('portfolio')}>
          <p className="line-clamp-2"><b>Allocation:</b> {positions.length ? positions.slice(0, 2).map((p) => `${p.asset} ${num(p.currentPrice) != null && num(p.netQuantity) != null && num(totals?.value) > 0 ? pct(num(p.currentPrice) * num(p.netQuantity) / num(totals.value) * 100) : 'unpriced'}`).join(' \u00b7 ') : 'No holdings'} \u00b7 cash {paper?.cashAvailable ? money(paper.cashTotal, 0) : 'unavailable'}</p>
          <p className="mt-1 line-clamp-1"><b>Protected / deployable:</b> {paper?.protectedCashAvailable ? `${money(paper.protectedCashTotal, 0)} / ${money(paper.deployableCashTotal, 0)}` : 'unavailable'}</p>
          <p className="mt-1 line-clamp-1"><b>Open risk / cap:</b> {paper?.openRiskAvailable ? `${pct(paper.openRiskPct)} / ${pct(paper.openRiskLimitPct)}` : 'unavailable'} \u00b7 drawdown limit {pct(sop?.user?.maxDrawdownPct)}</p>
        </DashboardCard>
        {/* 4. BTC Bull & Bear */}
        <DashboardCard cardId="btc" title="BTC Bull & Bear" icon={GitBranch} status={health?.outlook} summary={band?.lowerPct != null && band?.horizonDays === 7 ? `Historical 7d: ${signed(band.lowerPct)} to ${signed(band.upperPct)} \u00b7 ${valText}` : `Range unavailable \u00b7 ${band?.reasonText || 'pending evaluation'}`} freshness={last('Closed BTC candle', outlook?.baseline?.observedAt)} onAsk={() => ask('btc')} onOpen={() => open('btc')} detail="Full scenarios">
          {focusableChart('btc', 'BTC historical bull and bear', <BTCChart outlook={outlook} levels={availableLevels} />)}
          <p className="mt-1 truncate text-[11px] text-slate-400">Now: {anchor != null ? money(anchor) : 'unavailable'} \u00b7 Support {support ? money(support.price) : 'unavailable'} / ceiling {ceiling ? money(ceiling.price) : 'unavailable'} \u00b7 study {when(dashboardTime, true)}</p>
        </DashboardCard>
        {/* 5. Market Intelligence — driver explanation + cross-market graph */}
        <DashboardCard cardId="intelligence" title="Market Intelligence" icon={BarChart3} status={health?.driver} summary={currentLeader ? `Leading: ${titleCase(currentLeader)} \u00b7 ${driver?.marketPosture || 'posture unavailable'} \u00b7 confidence ${driver?.confidence != null ? pct(num(driver.confidence) * 100) : 'unavailable'}` : health?.driver === 'loading' ? 'Loading driver\u2026' : 'Leading driver not established'} freshness={last('Driver assessment', driver?.asOf)} onAsk={() => ask('intelligence')} onOpen={() => open('intelligence')}>
          {focusableChart('market', 'normalized BTC and ETH', <MarketChart btc={outlook} eth={eth} />)}
          <p className="truncate text-[11px] text-slate-300">{returns} \u00b7 breadth {phase?.inputs?.altsWithReturns > 0 ? `${phase.inputs.altsBeatingBtc}/${phase.inputs.altsWithReturns}` : 'unavailable'} \u00b7 dominance {d?.dominance?.dominance != null ? pct(d.dominance.dominance) : 'unavailable'}</p>
          <p className="truncate text-[11px] text-slate-400">Next: {next?.actor ? `${titleCase(next.actor)} (${next.probabilityBand || 'unrated'}) if ${next.condition || 'not established'}` : 'Not established'}</p>
        </DashboardCard>
        {/* 6. News, Macro & Policy — actual news analysis */}
        <DashboardCard cardId="news" title="News, Macro & Policy" icon={Newspaper} status={newsState} summary={newsState === 'loading' ? 'Loading\u2026' : story?.title || 'No sourced development.'} freshness={last(story?.source || 'News feed', story?.published)} onAsk={() => ask('news')} onOpen={() => open('news')}>
          {paperNews.slice(0, 2).map((item, i) => <p key={item.id || i} className="mt-0.5 line-clamp-1"><b>{i + 1}.</b> {item.title} \u00b7 {item.source || 'source unavailable'} \u00b7 {when(item.published)}</p>)}
          <p className="mt-1 line-clamp-2 text-slate-300">{story?.ai?.why_it_matters || story?.ai?.summary || 'Analysis unavailable.'}</p>
          <p className="mt-1 truncate text-slate-400">Next: {nextEvent?.title ? `${nextEvent.title} \u00b7 ${nextEventTime ? when(nextEventTime) : 'time unconfirmed'}` : 'see calendar'}</p>
        </DashboardCard>
        {/* 7. Evidence & Engines — forecast accuracy from prediction ledger + paper perf */}
        <DashboardCard cardId="evidence" title="Evidence & Engines" icon={Database} status={health?.sop} summary={`Forecast: ${valText} \u00b7 Paper: ${health?.paper || 'unavailable'} \u00b7 Data: ${titleCase(sop?.dataQuality?.status || 'unavailable')}`} freshness={last('Evaluation', val?.evaluation?.lastEvaluatedAt || sop?.generatedAt)} onAsk={() => ask('evidence')} onOpen={() => open('evidence')}>
          <p className="line-clamp-1">Prediction Ledger: {d?.prediction_ledger?.overall?.accuracy != null ? `${num(d.prediction_ledger.overall.accuracy).toFixed(0)}% accuracy, ${d.prediction_ledger.overall.n} graded` : 'unavailable'}</p>
          <p className="mt-1 line-clamp-1">Paper engine: {totals ? `${totals.closedTrades ?? 0} trades, win rate ${totals.winRatePct != null ? pct(totals.winRatePct) : 'unavailable'}` : 'unavailable'}</p>
          <p className="mt-1 line-clamp-2 text-amber-200">{sop?.dataQuality?.issues?.[0]?.detail || 'Review the latest data audit.'}</p>
        </DashboardCard>
        {/* 8. On-Chain & Flows — display each source independently */}
        <DashboardCard cardId="flows" title="On-Chain & Flows" icon={Waves} status={health?.etf || health?.whales} summary={whale ? `Whale ${whale.name || 'tracked wallet'}: ${whale.change_7d != null ? `${signed(whale.change_7d, ' BTC / 7d')} \u00b7 ${whale.signal || 'direction unknown'}` : 'change unavailable'}` : `Whales: ${health?.whales === 'loading' ? 'loading' : 'unavailable'}`} freshness={last(whales?.source || 'Whale feed', whales?.as_of)} onAsk={() => ask('flows')} onOpen={() => open('flows')}>
          <p className="line-clamp-1">ETF: {etf?.net_1d != null ? `${signed(etf.net_1d, 'm USD')} \u00b7 session ${etf.latest_date || 'date unavailable'}` : 'session unavailable'}</p>
          <p className="mt-1 line-clamp-2">Network: {network?.hashrate_ehs != null ? `${network.hashrate_ehs} EH/s` : 'unavailable'} \u00b7 sentiment: {sentiment?.value != null ? `${sentiment.value}/100 ${sentiment.label || ''}` : 'unavailable'}</p>
          <p className="mt-1 line-clamp-1 text-slate-400">Cross-check: {whale?.signal && etf?.net_1d != null ? `${whale.signal} whale vs ${Number(etf.net_1d) >= 0 ? 'positive' : 'negative'} ETF` : 'Whale/ETF comparison unavailable'}</p>
        </DashboardCard>
        {/* 9. Opportunity Radar — show findings with actual priority/status */}
        <DashboardCard cardId="radar" title="Opportunity Radar" icon={Radar} status={findings.length ? findings[0].priority || 'WAIT' : health?.streams} summary={findings[0]?.title || (research ? 'No qualified setups.' : 'Research loading\u2026')} freshness={last('Research', research?.asOf || streams?.generatedAt)} onAsk={() => ask('radar')} onOpen={() => open('radar')}>
          {findings.length ? findings.map((f, i) => <p key={f.findingId || i} className="mt-0.5 line-clamp-1">{f.asset || f.symbol || 'Market'} \u00b7 {f.priorityLabel || titleCase(f.priority)} \u00b7 {f.title}</p>) : <p className="text-slate-400">{research ? 'No open setups.' : 'Awaiting research.'}</p>}
          {findings[0] && <p className="mt-1 line-clamp-1 text-slate-300">Confirm: {findings[0].confirmIf || 'not specified'} \u00b7 Invalidate: {findings[0].invalidateIf || 'not specified'}</p>}
          <p className="mt-1 line-clamp-1 text-slate-400">Next: {findings[0]?.resolveBy ? `by ${when(findings[0].resolveBy)}` : 'next observation'}{paper?.pendingApprovals?.length ? ` \u00b7 ${paper.pendingApprovals.length} proposal(s)` : ''}</p>
        </DashboardCard>
      </div>
      <DashboardAskPanel selected={selected} onNav={onNav} onEvidence={setEvidenceId} stateId={sop?.stateId} />
    </div>
    {chart && <ExpandedChart type={chart} outlook={outlook} eth={eth} levels={availableLevels} runAsOf={d?.as_of || when(d?.created_at)} onClose={() => setChart(null)} onNav={(id) => onNav(id === 'scenarios' ? 'dashboard-btc' : id === 'crossmarket' ? 'dashboard-intelligence' : id)} onEvidence={(sid) => { setChart(null); setEvidenceId(sid); }} />}
    {evidenceId && <EvidenceDrawer snapshotId={evidenceId} onClose={() => setEvidenceId(null)} onAsk={(sid) => { setEvidenceId(null); setSelected({ title: 'Evidence record', snapshotId: sid }); }} />}
  </>;
};

export { HomeTicker, TickerContent, Explanation, NavigateLink, money, signed, pct, when };
export default OneScreenHome;
