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
  <p className="mt-1 line-clamp-2 text-xs leading-snug text-slate-300">{summary}</p>
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
  const { sop, paper, outlook, eth, streams, driver, etf, whales, network, sentiment, health } = snapshot;
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
  const ask = (id) => setSelected({ title: id, to: `dashboard-${id}` });
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
        {/* 1. Albert's Brief */}
        <DashboardCard cardId="brief" title="Albert’s Brief" icon={Sparkles} status={health?.sop} summary={directionClaim?.text || 'Unavailable'} freshness={last('Regime', claimTime)} onAsk={() => ask('brief')} onOpen={() => open('brief')}>
          <p className="line-clamp-1"><b>Drivers:</b> {leadershipClaim?.text || 'Unavailable'}</p>
          <p className="mt-1 line-clamp-1"><b>Since last visit:</b> {briefChanges[0]?.detail || 'No change'}</p>
          <p className="mt-1 line-clamp-1"><b>Position:</b> {portfolioClaim?.text || (totals ? `${money(totals.value, 2)}` : 'Unavailable')}</p>
        </DashboardCard>
        {/* 2. Paper Trading */}
        <DashboardCard cardId="paper" title="Paper Trading" icon={Wallet} status={health?.paper} summary={totals?.value != null ? `${money(totals.value, 2)} · ${pnlLabel}${pnlVal != null ? ` ${money(Math.abs(pnlVal), 2)} (${signed(totals.pnlPct)})` : ''}` : 'Unavailable'} freshness={last('Ledger', paper?.asOf)} onAsk={() => ask('paper')} onOpen={() => open('paper')}>
          <p className="line-clamp-1"><b>Start:</b> {money(totals?.startingCash, 2)} · <b>Cash:</b> {paper?.cashAvailable ? money(paper.cashTotal, 2) : 'unavailable'} · <b>Holdings:</b> {positions.length ? money(positions.reduce((s, p) => s + (num(p.currentPrice) || 0) * (num(p.netQuantity) || 0), 0), 2) : 'none'}</p>
          {entries.length ? entries.map((e, i) => <p key={e.ledgerEventId || i} className="mt-0.5 truncate">{e.side === 'BUY' ? 'Bought' : 'Sold'} {e.qty} {e.asset} @ {money(e.fillPx, 2)}</p>) : <p className="mt-1 text-slate-400">No completed trades</p>}
          {(paper?.pendingApprovals?.length || 0) > 0 && <p className="mt-1 text-amber-200">{paper.pendingApprovals.length} pending proposal(s)</p>}
        </DashboardCard>
        {/* 3. Portfolio & Risk */}
        <DashboardCard cardId="portfolio" title="Portfolio & Risk" icon={ShieldAlert} status={health?.paper} summary={`${positions.length} holdings · ${leadingPosition ? `largest ${leadingPosition.asset} ${money(leadingPosition.value, 0)}` : ''}`} freshness={last('Ledger', paper?.asOf)} onAsk={() => ask('portfolio')} onOpen={() => open('portfolio')}>
          <p className="line-clamp-2"><b>Allocation:</b> {positions.length ? positions.slice(0, 2).map((p) => `${p.asset} ${num(p.currentPrice) != null && num(p.netQuantity) != null && num(totals?.value) > 0 ? pct(num(p.currentPrice) * num(p.netQuantity) / num(totals.value) * 100) : ''}`).join(' · ') : 'none'}</p>
          <p className="mt-1 line-clamp-1"><b>Risk / cap:</b> {paper?.openRiskAvailable ? `${pct(paper.openRiskPct)} / ${pct(paper.openRiskLimitPct)}` : 'unavailable'}</p>
        </DashboardCard>
        {/* 4. BTC Bull & Bear */}
        <DashboardCard cardId="btc" title="BTC Bull & Bear" icon={GitBranch} status={health?.outlook} summary={band?.lowerPct != null ? `7d: ${signed(band.lowerPct)} to ${signed(band.upperPct)} · ${valText}` : band?.reasonText || 'Unavailable'} freshness={last('Candle', outlook?.baseline?.observedAt)} onAsk={() => ask('btc')} onOpen={() => open('btc')} detail="Scenarios">
          {focusableChart('btc', 'BTC chart', <BTCChart outlook={outlook} levels={availableLevels} />)}
          <p className="mt-1 truncate text-[11px] text-slate-400">{anchor != null ? money(anchor) : ''} · S {support ? money(support.price) : '?'} / R {ceiling ? money(ceiling.price) : '?'}</p>
        </DashboardCard>
        {/* 5. Market Intelligence */}
        <DashboardCard cardId="intelligence" title="Market Intelligence" icon={BarChart3} status={health?.driver} summary={lead ? `${titleCase(lead.actor || lead.label)} · ${driver?.marketPosture || ''}` : 'Unavailable'} freshness={last('Driver', driver?.asOf)} onAsk={() => ask('intelligence')} onOpen={() => open('intelligence')}>
          {focusableChart('market', 'BTC/ETH', <MarketChart btc={outlook} eth={eth} />)}
          <p className="truncate text-[11px] text-slate-300">{returns} · breadth {phase?.inputs?.altsWithReturns > 0 ? `${phase.inputs.altsBeatingBtc}/${phase.inputs.altsWithReturns}` : '?'}</p>
          {next && <p className="truncate text-[11px] text-slate-400">Next: {titleCase(next.actor)} ({next.probabilityBand || '?'})</p>}
        </DashboardCard>
        {/* 6. News, Macro & Policy */}
        <DashboardCard cardId="news" title="News, Macro & Policy" icon={Newspaper} status={newsStatus} summary={story?.title || 'No development'} freshness={last(story?.source || 'News', story?.published)} onAsk={() => ask('news')} onOpen={() => open('news')}>
          {paperNews.slice(0, 2).map((item, i) => <p key={item.id || i} className="mt-0.5 line-clamp-1"><b>{i + 1}.</b> {item.title}</p>)}
          <p className="mt-1 line-clamp-2 text-slate-300">{story?.ai?.why_it_matters || story?.ai?.summary || ''}</p>
          {nextEvent?.title && <p className="mt-1 truncate text-slate-400">Next: {nextEvent.title}</p>}
        </DashboardCard>
        {/* 7. Evidence & Engines */}
        <DashboardCard cardId="evidence" title="Evidence & Engines" icon={Database} status={health?.sop} summary={`Forecast: ${valText} · Data: ${titleCase(sop?.dataQuality?.status || 'unavailable')}`} freshness={last('Eval', val?.evaluation?.lastEvaluatedAt || sop?.generatedAt)} onAsk={() => ask('evidence')} onOpen={() => open('evidence')}>
          <p className="line-clamp-1">Ledger: {d?.prediction_ledger?.overall?.accuracy != null ? `${num(d.prediction_ledger.overall.accuracy).toFixed(0)}% accuracy, ${d.prediction_ledger.overall.n} graded` : 'unavailable'}</p>
          <p className="mt-1 line-clamp-1">Paper: {totals ? `${totals.closedTrades ?? 0} trades, win ${totals.winRatePct != null ? pct(totals.winRatePct) : '?'}` : 'unavailable'}</p>
        </DashboardCard>
        {/* 8. On-Chain & Flows */}
        <DashboardCard cardId="flows" title="On-Chain & Flows" icon={Waves} status={health?.etf} summary={whale ? `${whale.name || 'Whale'}: ${whale.change_7d != null ? `${signed(whale.change_7d, ' BTC')} · ${whale.signal || ''}` : ''}` : 'Unavailable'} freshness={last(whales?.source || 'Whale', whales?.as_of)} onAsk={() => ask('flows')} onOpen={() => open('flows')}>
          <p className="line-clamp-1">ETF: {etf?.net_1d != null ? `${signed(etf.net_1d, 'm USD')} · ${etf.latest_date || ''}` : 'unavailable'}</p>
          <p className="mt-1 line-clamp-1">Network: {network?.hashrate_ehs != null ? `${network.hashrate_ehs} EH/s` : '?'} · sentiment: {sentiment?.value != null ? `${sentiment.value}/100` : '?'}</p>
        </DashboardCard>
        {/* 9. Opportunity Radar */}
        <DashboardCard cardId="radar" title="Opportunity Radar" icon={Radar} status={health?.streams} summary={findings[0]?.title || 'No setups'} freshness={last('Research', research?.asOf || streams?.generatedAt)} onAsk={() => ask('radar')} onOpen={() => open('radar')}>
          {findings.length ? findings.map((f, i) => <p key={f.findingId || i} className="mt-0.5 line-clamp-1">{f.asset || 'Market'} · {titleCase(f.priority)} · {f.title}</p>) : <p className="text-slate-400">No open setups</p>}
          {findings[0] && <p className="mt-1 line-clamp-1 text-slate-300">Confirm: {findings[0].confirmIf || '?'}</p>}
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
