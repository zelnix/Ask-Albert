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
// All server timestamps without a timezone are UTC. Format them in the reader's local zone.
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

const TickerContent = ({ d, ticker, snapshot, dashboardStatus = 'loading' }) => {
  const { sop, paper, outlook, streams, driver, etf, health } = snapshot;
  const publishedState = !d ? dashboardStatus === 'error' ? 'error' : 'loading'
    : dashboardStatus !== 'ready' || isOld(d.created_at, 26) ? 'stale' : 'ready';
  const phase = sop?.marketStreams?.phaseAssessment || streams?.phaseAssessment;
  const breadth = phase?.inputs;
  const uni = streams?.universe || sop?.marketStreams;
  const band = outlook?.band;
  const validation = outlook?.validation || band?.validation;
  const evaluation = validation?.evaluation;
  const evaluationStale = Boolean(evaluation?.lastEvaluatedAt) && (isOld(evaluation.lastEvaluatedAt, 240) || health?.outlook === 'stale');
  const measured = health?.outlook === 'ready' && validation?.predictiveValidation === true && evaluation?.evaluationPoints > 0 && !evaluationStale && Boolean(evaluation?.lastEvaluatedAt);
  const performance = measured ? `Validated · ${num(evaluation.skillVsNoChange)?.toFixed(2)} skill`
    : health?.outlook !== 'ready' || evaluationStale || validation?.status === 'PENDING' || !validation ? 'Evaluation unavailable' : 'Not validated';
  const net = etf?.net_1d;
  const claim = (sop?.briefing?.claims || []).find((c) => c.claimId === 'briefing.direction');
  return [
    { title: 'BTC spot', value: ticker?.price && ticker.symbol === 'BTC' ? `${money(ticker.price)} · ${signed(ticker.change24h)}` : 'Quote unavailable', to: 'market-intel',
      what: ticker?.price && ticker.symbol === 'BTC' ? `BTC/USD spot ${money(ticker.price)}; 24-hour change ${signed(ticker.change24h)} as of ${when(ticker.ts)}.` : 'A current BTC/USD quote is not available.',
      why: 'The spot quote anchors current market context; it is not the last closed candle used by the scenario provider.',
      how: `Reported by ${ticker?.source || 'the quote feed when available'}. The percentage is the exchange’s 24-hour price change, not a forecast.`,
      next: 'The quote feed updates on the next successful request (normally every 10 seconds); timing is not guaranteed.', source: ticker?.symbol === 'BTC' ? ticker?.source || 'BTC/USD spot ticker' : 'BTC/USD spot ticker', asOf: ticker?.symbol === 'BTC' ? ticker?.ts : null, version: 'ticker quote', state: ticker?.price && ticker?.symbol === 'BTC' ? isOld(ticker.ts, 0.1) ? 'stale' : 'ready' : 'unavailable' },
    { title: 'BTC dominance', value: num(d?.dominance?.dominance) != null ? `${num(d.dominance.dominance).toFixed(1)}%${num(d.dominance.change_7d) != null ? ` · ${signed(d.dominance.change_7d, ' pts')}` : ''}` : 'Unavailable', to: 'crossmarket',
      what: num(d?.dominance?.dominance) != null ? `BTC makes up ${num(d.dominance.dominance).toFixed(2)}% of total crypto market cap in the ${when(d?.created_at)} dashboard publication; seven-day point change ${signed(d.dominance.change_7d, ' pts')}.` : 'BTC market-cap dominance was not reported in this dashboard publication.',
      why: 'A shift in BTC market-cap share can indicate relative leadership, but does not by itself measure cash flowing into or out of Bitcoin.',
      how: 'BTC market cap divided by the total covered crypto market cap from CoinGecko; the denominator is the covered crypto market, not spot turnover. Point change compares recorded daily dominance snapshots.',
      next: 'Reassess after the next published market-cap observation; its release time is not confirmed.', source: 'CoinGecko / dashboard run', asOf: d?.created_at, version: 'market-cap dominance', state: d?.dominance?.dominance == null ? publishedState === 'ready' ? 'unavailable' : publishedState : publishedState },
    { title: 'Altcoin breadth', value: breadth?.altsWithReturns > 0 ? `${breadth.altsBeatingBtc}/${breadth.altsWithReturns} beat BTC` : 'Unavailable', to: 'market-intel',
      what: breadth?.altsWithReturns > 0 ? `${breadth.altsBeatingBtc} of ${breadth.altsWithReturns} eligible altcoins beat BTC over ${phase?.window || 'the measured window'}; ${uni?.eligibleAltCount ?? 'unknown'} eligible in the universe.` : 'The current eligible-altcoin comparison cannot be measured.',
      why: 'Broad participation is more informative than one coin rallying alone; narrow leadership is easier to reverse.',
      how: `Eligible coins with returns over the same BTC comparison window form the denominator. ${uni?.excluded?.length ? `${uni.excluded.length} exclusions reported in the universe; open the market detail for reasons.` : 'Exclusion details are unavailable for this snapshot.'} It does not measure all tokens.`,
      next: 'Reassess on the next completed universe/price update; exact time not confirmed.', source: 'market-streams phase assessment', asOf: phase?.assessedAt || uni?.sourceTimestamp, version: phase?.ruleVersion, snapshotId: streams?.phaseAssessment?.snapshotId, state: breadth?.altsWithReturns > 0 ? health?.sop !== 'ready' || phase?.status === 'STALE' ? 'stale' : 'ready' : health?.sop === 'loading' ? 'loading' : 'unavailable' },
    { title: 'ETF net flow', value: net == null ? 'Session unavailable' : `${signed(net, 'm')} · ${etf?.latest_date ? etf.latest_date.slice(5) : 'date missing'}`, to: 'institutional',
      what: net == null ? 'The latest reported US spot BTC ETF session is unavailable.' : `US spot BTC ETF net flow was ${signed(net, 'm USD')} for the reported session ${etf?.latest_date || 'date not provided'}. This is not a live intraday flow.`,
      why: 'Net creations can require ETF issuers to source BTC; net redemptions can relieve demand, but secondary-market hedging complicates the link to spot price.',
      how: `Sum of reporting issuers’ daily net creations/redemptions in USD millions. Source: ${etf?.source || 'Farside/TFTC reporting feed'}. It is a reported session, not continuously updated.`,
      next: 'Reassess when the next issuer session is published; release time is not confirmed.', source: etf?.source || 'US BTC ETF report', asOf: etf?.latest_date, version: 'daily issuer flow', state: net == null ? health?.etf === 'loading' ? 'loading' : 'unavailable' : health?.etf !== 'ready' || isOld(etf?.latest_date, 96) ? 'stale' : 'ready' },
    { title: 'Market stance', value: sop?.market?.regime ? titleCase(sop.market.regime) : 'Unavailable', to: 'briefing',
      what: claim?.text || (sop?.market?.regime ? `The canonical regime reads ${titleCase(sop.market.regime)}.` : 'There is no current engine stance.'),
      why: 'This is the starting context for Albert’s market and paper-risk interpretation, not a probability that BTC will rise.',
      how: 'The canonical regime balances trend and participation inputs; the full Brief names the supporting and opposing claims. It is qualified whenever feeds are stale.',
      next: claim?.invalidation || 'Reassess at the next canonical engine publication; exact time not confirmed.', source: 'canonical regime', asOf: sop?.market?.asOf || sop?.generatedAt, version: sop?.briefing?.ruleVersion, snapshotId: getSnap(claim), state: health?.sop !== 'ready' ? health?.sop === 'loading' ? 'loading' : sop ? 'stale' : 'unavailable' : !sop?.market?.asOf ? 'unavailable' : sop?.market?.freshness?.toLowerCase() || health?.sop },
    { title: '7d historical range', value: band?.available && band.horizonDays === 7 ? `${signed(band.lowerPct)} to ${signed(band.upperPct)}` : 'Range unavailable', to: 'scenarios',
      what: band?.available && band.horizonDays === 7 ? `In comparable past conditions, the middle 60% of Bitcoin's next seven-day moves fell between ${signed(band.lowerPct)} and ${signed(band.upperPct)}. Future prices can fall outside that range. It is historical context, not a forecast.` : `No range is published: ${band?.reasonText || 'evaluation or matched sample unavailable'}.`,
      why: 'The band illustrates how similar historical conditions resolved, not the chance of a trade succeeding.',
      how: band?.available ? `20th–80th percentile of ${band.matchedDays ?? 'the'} matched days, seven-day horizon; ${band.independentEpisodes ?? 'unknown'} independent episodes. Anchored to the closed candle on ${when(band.anchorDate, true)}.` : 'The provider withholds a numeric band until its own sample and walk-forward calibration gate are met.',
      next: 'Reassess after the next closed daily candle and completed walk-forward evaluation; exact time not confirmed.', source: 'scenario-outlooks/preview', asOf: outlook?.baseline?.observedAt, version: outlook?.modelVersion, snapshotId: band?.snapshotId, state: band?.available && band.horizonDays === 7 ? health?.outlook !== 'ready' || isOld(outlook?.baseline?.observedAt, 50) ? 'stale' : 'ready' : health?.outlook === 'loading' ? 'loading' : 'unavailable' },
    { title: 'Forecast performance', value: performance, to: 'scenario-evaluation',
      what: measured ? `Walk-forward evaluation over ${evaluation.evaluationPoints} chronological checks: skill ${num(evaluation.skillVsNoChange)?.toFixed(2)} vs assuming no change; last evaluated ${when(evaluation.lastEvaluatedAt, true)}.` : evaluationStale ? 'The last measured evaluation is too old to present as current validation. Await a new completed evaluation.' : `${performance}. ${validation?.headline || band?.reasonText || 'The measured evaluation is not available.'}`,
      why: 'A historical scenario range can be descriptive even if the middle path has no predictive edge. Measured skill must be validated separately before calling it predictive.',
      how: `The provider checks past predictions chronologically against a no-change baseline and tests interval coverage. ${validation?.materialSkillThreshold == null ? 'Predictive threshold is not available.' : `Material skill threshold ${validation.materialSkillThreshold}.`} No range or ticker direction is substituted for measured performance.`,
      next: 'Reassess when the provider completes the next walk-forward evaluation; exact time not confirmed.', source: 'scenario-outlooks evaluation', asOf: evaluation?.lastEvaluatedAt, version: outlook?.modelVersion, snapshotId: band?.snapshotId, state: measured ? 'ready' : health?.outlook !== 'ready' && validation ? 'stale' : health?.outlook === 'loading' ? 'loading' : 'unavailable' },
  ];
};

const Explanation = ({ item, onNav, onEvidence }) => <div className="space-y-3 text-sm leading-relaxed text-slate-300">
  {[['What is observed', item.what], ['Why it matters', item.why], ['How it works / uncertainty', item.how], ['When to revisit', item.next]].map(([label, text]) => <p key={label}><strong className="block text-xs uppercase tracking-wide text-sky-300">{label}</strong>{text || 'Not available for this snapshot.'}</p>)}
  <p className="border-t border-slate-700 pt-3 text-xs text-slate-400">Source: {item.source || 'source unavailable'} · As of {when(item.asOf)} · Version: {item.version || 'not provided'} · Status: {item.state || 'unavailable'}</p>
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
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{entry.title}{entry.state && entry.state !== 'ready' ? ` · ${entry.state}` : ''}</span>
        <span className={`text-xs font-bold ${entry.state && entry.state !== 'ready' ? 'text-amber-200' : 'text-white'}`}>{entry.value}</span>
      </button>)}
    </div>
    {item != null && <ModalShell title={items[item].title} onClose={close} className="max-w-xl">
      <Explanation item={{ ...items[item], to: ({ 'BTC spot': 'dashboard-intelligence', 'BTC dominance': 'dashboard-intelligence', 'Altcoin breadth': 'dashboard-intelligence', 'ETF net flow': 'dashboard-flows', 'Market stance': 'dashboard-brief', '7d historical range': 'dashboard-btc', 'Forecast performance': 'dashboard-evidence' })[items[item].title] || items[item].to }} onNav={(id) => { close(); onNav(id); }} onEvidence={(sid) => { close(); setEvidenceId(sid); }} />
    </ModalShell>}
    {evidenceId && <EvidenceDrawer snapshotId={evidenceId} onClose={() => setEvidenceId(null)} />}
  </>;
};

const CARD_ID_BY_TITLE = { 'Albert’s Brief': 'brief', 'Paper Trading': 'paper', 'Portfolio & Risk': 'portfolio', 'BTC Bull & Bear': 'btc', 'Market Intelligence': 'intelligence', 'News, Macro & Policy': 'news', 'Evidence & Engines': 'evidence', 'On-Chain & Flows': 'flows', 'Opportunity Radar': 'radar' };
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
  const publishedState = !d ? dashboardStatus === 'error' ? 'error' : 'loading'
    : dashboardStatus !== 'ready' || isOld(d.created_at, 26) ? 'stale' : 'ready';
  const sourceState = (key, timestamp, maxAge) => health?.[key] === 'ready'
    ? !timestamp ? 'unavailable' : isOld(timestamp, maxAge) ? 'stale' : 'ready' : health?.[key] || 'unavailable';
  const claimTime = sop?.market?.asOf || sop?.generatedAt;
  const claims = sop?.briefing?.claims || [];
  const directionClaim = claims.find((c) => c.claimId === 'briefing.direction');
  const briefState = sourceState('sop', sop?.market?.asOf, 26) === 'ready' && !directionClaim ? 'unavailable' : sop?.market?.asOf ? sourceState('sop', sop.market.asOf, 26) : sop && health?.sop === 'ready' ? 'unavailable' : health?.sop || 'unavailable';
  const paperState = health?.paper === 'ready' && paper?.accountResolution?.status !== 'RESOLVED' ? 'unavailable' : health?.paper || 'loading';
  const portfolioClaim = claims.find((c) => c.claimId === 'briefing.portfolio');
  const leadershipClaim = claims.find((c) => c.claimId === 'briefing.leadership');
  const totals = paper?.totals;
  const paperLoading = health?.paper === 'loading' || health?.paper === 'idle';
  const paperError = health?.paper === 'error' || health?.paper === 'unavailable';
  const accountResolved = !paperLoading && !paperError && paper?.accountResolution?.status === 'RESOLVED';
  const accountCount = accountResolved ? Number(paper.accountResolution.count) : null;
  const noAccount = paperState === 'ready' && accountCount === 0;
  const rollupComplete = accountResolved && paper?.accountResolution?.rollupComplete === true;
  const entries = (paper?.recentFills || []).filter((e) => e.eventType === 'FILL' && (e.side === 'BUY' || e.side === 'SELL')).slice(0, 2);
  const hasStalePrices = (paper?.strategies || []).some((s) => s.marketData === 'STALE');
  const paperIntegrityMismatch = paper?.ledgerIntegrity?.status === 'MISMATCH';
  const valuationReady = paperState === 'ready' && rollupComplete && totals?.valueAvailable && !hasStalePrices && paper?.ledgerIntegrity?.status === 'MATCH';
  const pnl = valuationReady && num(totals?.startingCash) > 0 ? num(totals.pnlUsd) : null;
  const openValue = valuationReady && paper?.cashAvailable && num(totals.value) != null && num(paper.cashTotal) != null ? num(totals.value) - num(paper.cashTotal) : null;
  const pnlState = paperLoading ? 'Loading wallet' : paperError ? 'Wallet data unavailable' : paperState === 'stale' ? 'Stale wallet read' : !accountResolved ? 'Wallet status unavailable'
    : noAccount ? 'No paper wallet' : !rollupComplete ? 'Wallet roll-up unavailable'
      : paperIntegrityMismatch ? 'Reconciliation mismatch' : paper?.ledgerIntegrity?.status !== 'MATCH' ? 'Reconciliation unavailable' : !totals?.valueAvailable ? 'Valuation unavailable' : hasStalePrices ? 'Stale prices'
        : pnl == null ? 'Basis unavailable' : Math.abs(pnl) < 0.005 ? 'Neutral' : pnl > 0 ? 'Profit' : 'Loss';
  const positions = paper?.positions || [];
  const leadingPosition = rollupComplete ? positions.map((p) => ({
    asset: p.asset, value: num(p.currentPrice) != null && num(p.netQuantity) != null ? num(p.currentPrice) * num(p.netQuantity) : null
  })).filter((p) => p.value != null).sort((a, b) => b.value - a.value)[0] : null;
  const phase = streams?.phaseAssessment || sop?.marketStreams?.phaseAssessment;
  const research = streams?.researchFindings || sop?.marketStreams?.researchFindings;
  const findings = (research?.findings || []).filter((f) => f.status === 'OPEN' && !['AVOID_FOR_NOW', 'INSUFFICIENT_EVIDENCE'].includes(f.priority) && f.confirmIf && f.invalidateIf).slice(0, 2);
  const lead = driver?.currentLeader;
  const next = driver?.nextMoverCandidates?.[0];
  const paperNews = [...(news?.cards || [])].filter((c) => c?.title).sort((a, b) => (b.impact || 0) - (a.impact || 0));
  const story = paperNews[0];
  const newsMechanism = !story ? 'The price/liquidity transmission cannot be assessed without a sourced development.'
    : /stablecoin|regulat/i.test(`${story.title} ${story.ai?.summary}`)
      ? 'Clearer issuer rules might improve institutional on-ramps and BTC liquidity, while compliance costs or slower adoption could work against that. The near-term price effect is unproven.'
      : /inflation|rate decision|interest rate|cpi/i.test(`${story.title} ${story.ai?.summary}`)
        ? 'Rates staying higher can draw capital toward cash and bonds and away from crypto risk; a softer release could have the opposite effect. Neither path is assured.'
        : 'The BTC transmission is conditional; a sourced development alone does not establish the direction or timing of a price move.';
  const band = outlook?.band;
  const val = outlook?.validation || band?.validation;
  const valText = val?.predictiveValidation && val?.evaluation?.evaluationPoints > 0 && !isOld(val?.evaluation?.lastEvaluatedAt, 240) && health.outlook === 'ready'
    ? `Validated · ${val.evaluation.evaluationPoints} checks` : !val || val.status === 'PENDING' || isOld(val?.evaluation?.lastEvaluatedAt, 240) ? 'Evaluation unavailable' : 'Not validated';
  const participants = (streams?.participants?.participants || []).filter((p) => p?.finding && p?.status !== 'MISSING').slice(0, 2);
  const marketRows = matchedMarketSeries(outlook, eth);
  const lastSharedMarket = marketRows.filter((p) => p.BTC != null && p.ETH != null).at(-1);
  const returns = lastSharedMarket ? `BTC ${signed(lastSharedMarket.BTC - 100)} · ETH ${signed(lastSharedMarket.ETH - 100)}` : 'Matched comparison unavailable';
  const dashboardTime = d?.created_at;
  const briefChanges = (sop?.changesSinceLastVisit || []).slice(0, 1);
  const secondReason = claims.find((c) => c.claimId === 'briefing.turnover');
  const nextEvent = d?.event_calendar?.next_high_impact;
  const nextEventTime = nextEvent?.date || nextEvent?.at || nextEvent?.time;
  const currentLeader = lead?.label || lead?.actor;
  const marketStates = [sourceState('driver', driver?.asOf, 26), sourceState('outlook', outlook?.baseline?.observedAt, 50), sourceState('eth', eth?.baseline?.observedAt, 50), sourceState('streams', streams?.generatedAt, 26), publishedState];
  const marketState = marketStates.includes('error') ? 'error' : driver?.dataQuality === 'STALE' || marketStates.includes('stale') ? 'stale'
    : driver?.dataQuality && driver.dataQuality !== 'VERIFIED' ? 'unavailable'
      : marketStates.every((v) => v === 'loading') ? 'loading' : marketStates.every((v) => v === 'ready') ? 'ready' : 'unavailable';
  const whale = (whales?.whales || []).find((w) => w.change_7d != null) || whales?.whales?.[0];
  const whaleState = sourceState('whales', whales?.as_of, 36);
  const flowStates = [whaleState, sourceState('etf', etf?.latest_date, 96), network?.as_of ? sourceState('network', network.as_of, 36) : health?.network === 'ready' ? 'unavailable' : health?.network, sourceState('sentiment', sentiment?.ts, 48)];
  const flowState = flowStates.includes('error') ? 'error' : flowStates.includes('stale') ? 'stale'
    : flowStates.every((x) => x === 'loading') ? 'loading'
      : flowStates.every((x) => x === 'ready') ? 'ready' : 'unavailable';
  const newsState = newsStatus === 'ready' ? (story?.published ? isOld(story.published, 72) ? 'stale' : story?.verification && story.verification !== 'Confirmed' ? 'unverified' : 'ready' : 'unavailable')
    : story ? 'stale' : newsStatus === 'error' ? 'error' : 'loading';
  const last = (source, asOf, dateOnly = false) => `${source} · ${when(asOf, dateOnly)}`;
  // A chart run older than the canonical closed-candle snapshot cannot supply
  // current support/ceiling levels; keep the date visible but withhold its lines.
  const availableLevels = isOld(d?.created_at, 72) ? [] : Array.isArray(d?.chart?.sr_levels) ? d.chart.sr_levels : [];
  const anchor = num(outlook?.history?.at(-1)?.close);
  const support = anchor != null ? availableLevels.filter((l) => l.type === 'support' && num(l.price) != null && num(l.price) < anchor).sort((a, b) => Number(b.price) - Number(a.price))[0] : null;
  const ceiling = anchor != null ? availableLevels.filter((l) => l.type === 'resistance' && num(l.price) != null && num(l.price) > anchor).sort((a, b) => Number(a.price) - Number(b.price))[0] : null;
  const info = {
    brief: { title: 'Albert’s Brief', to: 'briefing', what: directionClaim?.text || 'A current market judgment is unavailable.', why: leadershipClaim?.text || 'Market leadership is not confirmed in this snapshot.', how: directionClaim?.invalidation || 'The canonical regime is based on measured trend and participation; a stale feed blocks action calls.', next: 'At the next canonical engine and market-stream publication; exact time not confirmed.', source: 'state-of-play briefing', asOf: sop?.market?.asOf || sop?.generatedAt, version: sop?.briefing?.ruleVersion, snapshotId: getSnap(directionClaim), state: sop?.market?.freshness?.toLowerCase() || health.sop, links: CARD_LINKS.brief },
    paper: { title: 'Paper Trading', to: 'paper', what: noAccount ? 'No paper wallet exists yet.' : !accountResolved ? `${pnlState}. The owner’s account list has not resolved; no zero balance is inferred.` : paperState !== 'ready' ? 'Only a stale paper ledger read is available; current balance and P&L are withheld.' : !rollupComplete ? `${accountCount} wallet record(s) exist, but the latest strategy roll-up does not cover every wallet. Combined figures are withheld.` : paperIntegrityMismatch ? 'Ledger reconciliation mismatch; current wallet value and P&L are withheld.' : paper?.ledgerIntegrity?.status !== 'MATCH' ? 'Ledger reconciliation unavailable; current wallet value and P&L are withheld.' : !totals.valueAvailable ? 'Combined valuation is unavailable; one or more held assets cannot be marked safely.' : hasStalePrices ? `Last marked paper value ${money(totals.value, 2)} may be stale; profit/loss is withheld until a fresh mark.` : pnl == null ? `Combined value ${money(totals.value, 2)}; profit/loss basis unavailable.` : `Combined value ${money(totals.value, 2)}. ${pnlState} ${money(Math.abs(pnl), 2)} (${signed(totals.pnlPct)}) against ${money(totals.startingCash, 2)} starting cash.`, why: 'Only completed fills affect the ledger and paper account; pending proposals do not count as trades.', how: 'The paper engine sums owner-scoped virtual wallets only when every wallet is included. Missing marks or unlinked wallets withhold the combined result.', next: 'Recalculate after a new mark or completed paper fill; next market time not confirmed.', source: 'paper/overview, owner account ledgers', asOf: paper?.asOf, version: 'owner-scoped paper read', snapshotId: getSnap(portfolioClaim), state: hasStalePrices ? 'stale' : health.paper, links: CARD_LINKS.paper },
    portfolio: { title: 'Portfolio & Risk', to: 'paper', what: noAccount ? 'No paper wallet exists yet.' : !accountResolved ? `${pnlState}; holdings are not known.` : paperState !== 'ready' ? 'Last owner wallet read is stale; current holdings and risk cannot be confirmed.' : !rollupComplete ? `${accountCount} owner wallet(s) exist; combined holdings and risk are withheld because the roll-up is incomplete.` : !valuationReady ? `${pnlState}; combined allocation and risk are withheld.` : `${positions.length} open holdings across ${accountCount} paper wallets. ${paper?.cashAvailable ? `Cash ${money(paper.cashTotal, 2)} (${pct(paper.cashPct)} of combined value).` : 'Combined cash allocation unavailable.'} ${paper?.protectedCashAvailable ? `Protected ${money(paper.protectedCashTotal, 2)} and deployable ${money(paper.deployableCashTotal, 2)}.` : 'Protected and deployable cash unavailable.'} ${leadingPosition ? `Largest marked holding: ${leadingPosition.asset} ${money(leadingPosition.value, 2)}.` : 'Largest marked holding unavailable.'} ${paper?.openRiskAvailable ? `Combined open risk ${pct(paper.openRiskPct)} against the paper profile cap ${pct(paper.openRiskLimitPct)}.` : 'Combined open risk unavailable.'}`, why: 'Holdings expose the account to mark-to-market moves; the paper profile open-risk cap and owner mandate drawdown limit are separate safeguards.', how: 'Cash and open risk are summed from owner-scoped wallet projections only when all wallets are accounted for.', next: 'Recalculate after a fill, mark or mandate change; next provider update time not confirmed.', source: 'paper/overview + owner mandate', asOf: paper?.asOf, version: 'paper equity/risk projection', snapshotId: getSnap(portfolioClaim), state: health.paper, links: CARD_LINKS.portfolio },
    btc: { title: 'BTC Bull & Bear', to: 'scenarios', what: band?.available ? `Historical 7-day 20th–80th percentile: ${signed(band.lowerPct)} to ${signed(band.upperPct)}. Not a forecast${val?.predictiveValidation ? ' despite passing measured validation' : ''}.` : `No range published: ${band?.reasonText || 'evaluation or sample unavailable'}.`, why: 'Observed history ends at Now. Bull/bear paths are conditional historical comparisons, not guarantees or price limits.', how: `Closed daily candles and measured historical analogs. ${availableLevels?.length ? `Support and ceiling are clustered daily swing reactions from the ${when(d?.created_at)} dashboard study, not promises.` : `The last daily support/ceiling study (${when(d?.created_at)}) is stale or unavailable; its lines are withheld from this newer chart.`}`, next: 'Recheck after the next closed daily candle and evaluation; exact time not confirmed.', source: 'scenario-outlooks/preview + chart intelligence', asOf: outlook?.baseline?.observedAt, version: outlook?.modelVersion, snapshotId: band?.snapshotId, state: health.outlook, links: CARD_LINKS.btc },
    intelligence: { title: 'Market Intelligence', to: 'drivers', what: lead ? `Current leading driver: ${titleCase(lead.actor || lead.label)} (${lead.evidenceStatus || 'qualification unavailable'}). ${next ? `Watch ${titleCase(next.actor)} next — ${next.probabilityBand || 'unrated'} band.` : 'Next driver not established.'}` : 'A current leading driver is not established.', why: 'A leader may explain observed market movement; a possible next driver is conditional, not a trading signal.', how: `Market-driver engine ${driver?.engineVersion || 'version unavailable'} weighs observed and inferred evidence separately. The chart matches actual BTC/ETH daily dates, normalized to 100; gaps are not filled.`, next: next?.condition ? `Review if ${next.condition}; exact event time not confirmed.` : 'Next driver review time not confirmed; check market source.', source: 'market-driver + matched closed candles', asOf: driver?.asOf || outlook?.baseline?.observedAt, version: driver?.engineVersion, snapshotId: null, state: health.driver, links: CARD_LINKS.intelligence },
    news: { title: 'News, Macro & Policy', to: 'news', what: story ? `${story.title} (${story.verification || 'verification unknown'}).` : 'No sourced current development is available.', why: story?.ai?.why_it_matters || 'The effect on this portfolio is not established by the available source.', how: story?.ai?.summary ? `${story.ai.summary} ${newsMechanism}` : newsMechanism, next: 'Reassess after independent source confirmation or the next scheduled event; exact time not confirmed — check the Events calendar.', source: story?.source || 'news feed', asOf: story?.published, version: 'news verification', state: newsState, links: CARD_LINKS.news },
    evidence: { title: 'Evidence & Engines', to: 'scenario-evaluation', what: `Data ${titleCase(sop?.dataQuality?.status || 'unavailable')}; paper ${paper?.status || 'unavailable'}; scenario ${valText}.`, why: 'Traceable fills and source health determine whether an attractive number is safe to use. A descriptive range is not measured predictive performance.', how: 'Paper results trace to ledger fills and strategy attribution; evaluation checks the matched-history provider chronologically against no change. Neither chat nor UI changes the engine.', next: 'Recheck after the next mark, evaluation or health update; exact time not confirmed.', source: 'state-of-play + scenario evaluation + paper ledger', asOf: val?.evaluation?.lastEvaluatedAt || sop?.generatedAt, version: outlook?.modelVersion || sop?.briefing?.ruleVersion, snapshotId: band?.snapshotId, state: val?.evaluation?.lastEvaluatedAt && isOld(val.evaluation.lastEvaluatedAt, 240) ? 'stale' : health.sop, links: CARD_LINKS.evidence },
    flows: { title: 'On-Chain & Flows', to: 'institutional', what: `${etf?.net_1d != null ? `Latest reported ETF session ${etf.latest_date || 'date unavailable'}: ${signed(etf.net_1d, 'm USD')}.` : 'Latest ETF session unavailable.'} ${participants[0]?.finding || 'Whale/network readings not confirmed.'}`, why: 'ETF creations may require sourcing BTC; whale and network changes can alter liquid supply, but one feed alone does not prove a price move.', how: 'Issuer session totals plus separately classified market-participant observations; stale/missing cohorts cannot be treated as a live signal.', next: 'Next provider or issuer reporting update; time not confirmed.', source: 'US ETF reported sessions + market participants', asOf: etf?.latest_date || streams?.generatedAt, version: streams?.version, snapshotId: streams?.participants?.snapshotId, state: health.etf === 'ready' ? health.streams : health.etf, links: CARD_LINKS.flows },
    radar: { title: 'Opportunity Radar', to: 'opportunities', what: findings[0] ? `${findings[0].title} — research ${titleCase(findings[0].priority)}; no trade proposed unless an actual proposal is pending.` : 'No qualified setup. No trade proposed.', why: findings[0]?.hypothesis || 'No setup currently has both a measurable confirmation and invalidation.', how: findings[0] ? `Confirm: ${findings[0].confirmIf}. Invalidate: ${findings[0].invalidateIf}. Risk/mandate fit must be checked in the strategy workflow, not assumed here.` : 'Only a measured research finding with a falsifiable trigger can enter this radar; research alone never executes a trade.', next: findings[0]?.resolveBy ? `Review on the next provider observation, no later than resolution deadline ${when(findings[0].resolveBy)}; exact next review time not confirmed.` : 'Review on the next market-stream refresh; exact time not confirmed.', source: 'market-streams research findings', asOf: findings[0]?.openedAt || streams?.generatedAt, version: research?.ruleVersion, snapshotId: findings[0]?.snapshotId, state: health.streams === 'stale' || (health.streams === 'error' && research) ? 'stale' : health.streams === 'error' ? 'error' : findings.length ? 'WAIT' : health.streams === 'loading' ? 'loading' : 'unavailable', links: CARD_LINKS.radar },
  };
  const ask = (id) => setSelected({ ...info[id], title: info[id].title, to: `dashboard-${id}` });
  const open = (id) => {
    if (typeof window !== 'undefined') window.__dashboardReturnCard = id;
    onNav(`dashboard-${id}`);
  };
  const focusableChart = (type, title, preview) => <button type="button" onClick={() => setChart(type)} aria-label={`Expand ${title} chart to full viewport`}
    className="group relative mt-1 block w-full rounded-md border border-slate-700/70 bg-slate-950/60 p-1.5 text-left hover:border-sky-500/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
    {preview}<span className="absolute right-1 top-1 rounded bg-slate-900/90 p-1 text-sky-200 group-hover:bg-sky-500/30"><Maximize2 className="h-3 w-3" /></span>
  </button>;
  return <>
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <h1 className="text-base font-bold text-white">Your market at a glance</h1>
      <span className="text-xs text-slate-400">Nine evidence-led views · paper only</span>
      <span className="ml-auto hidden text-xs text-slate-400 sm:inline">Snapshot {sop?.stateId || 'loading'}</span>
      <button type="button" onClick={snapshot.refresh} aria-label="Refresh dashboard reads" className="rounded-md border border-slate-700 p-1.5 text-slate-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"><RefreshCw className="h-4 w-4" /></button>
    </div>
    <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start xl:grid-cols-[minmax(0,1fr)_320px] xl:items-stretch 2xl:grid-cols-[minmax(0,1fr)_350px]">
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 xl:grid-rows-3">
        <DashboardCard cardId="brief" title="Albert’s Brief" icon={Sparkles} status={briefState} summary={briefState === 'loading' && !sop ? 'Loading the current market assessment…' : directionClaim?.text || 'Market assessment unavailable; no judgment is inferred.'} freshness={last(sop?.market?.asOf ? 'Regime source' : 'Brief built (regime time missing)', claimTime)} onAsk={() => ask('brief')} onOpen={() => open('brief')}>
          <p className="line-clamp-1"><b>Drivers:</b> {leadershipClaim?.text || 'Leadership unavailable'} · {secondReason?.text || 'Turnover unavailable'}</p>
          <p className="mt-1 line-clamp-1"><b>Since last visit:</b> {briefChanges[0]?.detail || (sop ? 'No recorded change' : 'Loading')}</p>
          <p className="mt-1 line-clamp-1"><b>My paper position:</b> {accountResolved && valuationReady ? `${accountCount} wallet(s) · ${money(totals.value, 2)} combined` : pnlState}</p>
          <p className="mt-1 line-clamp-1 text-slate-400">Next: {directionClaim?.invalidation || 'next published engine run · time not confirmed'}</p>
        </DashboardCard>
        <DashboardCard cardId="paper" title="Paper Trading" icon={Wallet} status={paperIntegrityMismatch ? 'error' : paperState === 'ready' && hasStalePrices ? 'stale' : paperState} summary={noAccount ? 'No paper wallet exists yet (owner accounts checked).' : !accountResolved || paperState !== 'ready' ? pnlState : !rollupComplete ? `${accountCount} wallet(s) · combined totals withheld` : `Paper wallet value: ${valuationReady ? money(totals.value, 2) : 'unavailable'} · ${pnlState}${pnl != null ? ` ${money(Math.abs(pnl), 2)} (${signed(totals.pnlPct)})` : ''}`} freshness={`${last('Owner ledger read', paper?.asOf)} · price-mark time not supplied`} onAsk={() => ask('paper')} onOpen={() => open('paper')}>
          <p className="line-clamp-1"><b>Basis:</b> {valuationReady && num(totals?.startingCash) > 0 ? money(totals.startingCash, 2) : 'unavailable'} virtual starting cash · <b>Cash:</b> {valuationReady && paper?.cashAvailable ? money(paper.cashTotal, 2) : 'unavailable'} · <b>Open value:</b> {openValue != null ? money(openValue, 2) : 'unavailable'}</p>
          {paperState === 'ready' && accountResolved && entries.length ? <div className="mt-1 space-y-0.5">{entries.map((e, i) => <p key={e.ledgerEventId || i} className="truncate" title={e.note}>{e.side === 'BUY' ? 'Bought' : 'Sold'} {e.qty} {e.asset} @ {money(e.fillPx, 2)} · {when(e.effectiveAt || e.recordedAt)}</p>)}</div> : <p className="mt-1 text-slate-400">{paperLoading ? 'Checking owner wallet records…' : paperError ? 'Retry the wallet read in Paper Trading.' : noAccount ? 'Start a saved strategy to create a virtual wallet.' : accountResolved && paperState === 'ready' ? 'No completed paper trades yet.' : 'Completed fills unavailable.'}</p>}
          <p className="mt-1 text-amber-200">Pending Buy/Sell proposals: {paperState === 'ready' && accountResolved && rollupComplete ? paper?.pendingApprovals?.length ?? 0 : 'unavailable'} · not completed trades</p>
        </DashboardCard>
        <DashboardCard cardId="portfolio" title="Portfolio & Risk" icon={ShieldAlert} status={paperIntegrityMismatch ? 'error' : paperState === 'ready' && hasStalePrices ? 'stale' : paperState} summary={noAccount ? 'No paper wallet; mandate remains separate from virtual holdings.' : !accountResolved || paperState !== 'ready' ? `${pnlState}; allocation not resolved` : !rollupComplete ? `${accountCount} owner wallet(s) · allocation withheld` : !valuationReady ? `${pnlState} · allocation withheld` : `${positions.length} holdings · cash ${valuationReady && paper?.cashAvailable ? pct(paper.cashPct) : 'unavailable'} · largest ${leadingPosition && valuationReady ? `${leadingPosition.asset} ${money(leadingPosition.value, 0)}` : 'unavailable'}`} freshness={last('Owner ledger read (mark time separate)', paper?.asOf)} onAsk={() => ask('portfolio')} onOpen={() => open('portfolio')}>
          <p className="line-clamp-2"><b>Allocation:</b> {valuationReady && positions.length ? positions.slice(0, 2).map((p) => `${p.asset} ${num(p.currentPrice) != null && num(p.netQuantity) != null && num(totals.value) > 0 ? pct(num(p.currentPrice) * num(p.netQuantity) / num(totals.value) * 100) : 'unpriced'}`).join(' · ') : noAccount ? 'No paper holdings' : 'Unavailable'} · cash {valuationReady && paper?.cashAvailable ? money(paper.cashTotal, 0) : 'unavailable'}</p>
          <p className="mt-1 line-clamp-1"><b>Protected / deployable:</b> {valuationReady && paper?.protectedCashAvailable ? `${money(paper.protectedCashTotal, 0)} / ${money(paper.deployableCashTotal, 0)}` : 'unavailable'}</p>
          <p className="mt-1 line-clamp-1"><b>Open risk / paper cap:</b> {valuationReady && paper?.openRiskAvailable ? `${pct(paper.openRiskPct)} / ${pct(paper.openRiskLimitPct)}` : 'unavailable'} · mandate drawdown limit {pct(sop?.user?.maxDrawdownPct)}</p>
          <p className="mt-1 line-clamp-1 text-slate-400">Next risk check: new priced mark or fill · time not confirmed</p>
        </DashboardCard>
        <DashboardCard cardId="btc" title="BTC Bull & Bear" icon={GitBranch} status={sourceState('outlook', outlook?.baseline?.observedAt, 50)} summary={band?.available && band?.horizonDays === 7 ? `Historical 7d: ${signed(band.lowerPct)} to ${signed(band.upperPct)} · ${valText} · not a forecast` : `Historical range unavailable · ${band?.reasonText || (health?.outlook === 'loading' ? 'loading evaluation' : 'insufficient evaluated history')}`} freshness={last('Closed BTC candle', outlook?.baseline?.observedAt)} onAsk={() => ask('btc')} onOpen={() => open('btc')} detail="Full scenarios">
          {focusableChart('btc', 'BTC historical bull and bear', <BTCChart outlook={outlook} levels={availableLevels} />)}
          <p className="mt-1 truncate text-[11px] text-slate-400">Now: {anchor != null ? money(anchor) : 'unavailable'} · Support {support ? money(support.price) : 'unavailable'} / ceiling {ceiling ? money(ceiling.price) : 'unavailable'} · daily study {when(dashboardTime, true)}</p>
        </DashboardCard>
        <DashboardCard cardId="intelligence" title="Market Intelligence" icon={BarChart3} status={marketState} summary={currentLeader ? `Leading: ${titleCase(currentLeader)} · ${driver?.marketPosture || 'posture unavailable'} · confidence ${driver?.confidence != null ? pct(num(driver.confidence) * 100) : 'unavailable'}` : health?.driver === 'loading' ? 'Loading current market driver…' : 'Leading market driver not established'} freshness={last('Driver assessment', driver?.asOf)} onAsk={() => ask('intelligence')} onOpen={() => open('intelligence')}>
          {focusableChart('market', 'normalized BTC and ETH', <MarketChart btc={outlook} eth={eth} />)}
          <p className="truncate text-[11px] text-slate-300">{returns} · shared daily closes · breadth {phase?.inputs?.altsWithReturns > 0 ? `${phase.inputs.altsBeatingBtc}/${phase.inputs.altsWithReturns}` : 'unavailable'} · BTC dominance {d?.dominance?.dominance != null ? pct(d.dominance.dominance) : 'unavailable'}</p>
          <p className="truncate text-[11px] text-slate-400">Next: {next?.actor ? `${titleCase(next.actor)} (${next.probabilityBand || 'likelihood unavailable'}) if ${next.condition || 'condition not established'}` : 'Not established'} · time not confirmed</p>
        </DashboardCard>
        <DashboardCard cardId="news" title="News, Macro & Policy" icon={Newspaper} status={newsState} summary={newsState === 'loading' ? 'Loading ranked reporting…' : story?.title || 'No sourced current development is available.'} freshness={last(story?.source || 'Ranked news feed', story?.published)} onAsk={() => ask('news')} onOpen={() => open('news')}>
          {paperNews.slice(0, 2).map((item, i) => <p key={item.id || i} className="mt-0.5 line-clamp-1" title={item.title}><b>{i + 1}.</b> {item.title} · {item.source || 'source unavailable'} · {when(item.published)}</p>)}
          <p className="mt-1 line-clamp-2 text-slate-300">{story?.ai?.why_it_matters || (story ? newsMechanism : 'BTC/portfolio transmission not established without sourced reporting.')}</p>
          <p className="mt-1 truncate text-slate-400">Next: {nextEvent?.title ? `${nextEvent.title} · ${nextEventTime ? when(nextEventTime) : 'release time not confirmed'}` : 'event/review time not confirmed · see calendar'}</p>
        </DashboardCard>
        <DashboardCard cardId="evidence" title="Evidence & Engines" icon={Database} status={paper?.ledgerIntegrity?.status === 'MISMATCH' ? 'error' : [paperState, briefState, health?.outlook].includes('error') ? 'error' : [paperState, briefState, health?.outlook].includes('stale') ? 'stale' : paperState} summary={`Paper ledger: ${accountResolved ? paper?.ledgerIntegrity?.status || 'UNAVAILABLE' : pnlState} · scenario: ${valText}`} freshness={last('Ledger reconciliation', paper?.ledgerIntegrity?.checkedAt)} onAsk={() => ask('evidence')} onOpen={() => open('evidence')}>
          <p className="line-clamp-1">Services: state {briefState} · wallet {paperState} · scenario {health?.outlook || 'unavailable'}</p>
          <p className="mt-1 line-clamp-2 text-amber-200">Check: {paper?.ledgerIntegrity?.status === 'MISMATCH' ? 'Reconciliation mismatch — inspect Paper Engine before trusting totals.' : !accountResolved ? 'Wallet read unavailable — retry owner account data.' : !val?.predictiveValidation || !val?.evaluation?.evaluationPoints || isOld(val?.evaluation?.lastEvaluatedAt, 240) ? 'Predictive validation missing or expired — inspect Scenario Evaluation.' : sop?.dataQuality?.issues?.[0]?.detail || 'Review the latest data audit.'}</p>
          <p className="mt-1 text-slate-400">Next: check after next ledger read / evaluation · time not confirmed</p>
        </DashboardCard>
        <DashboardCard cardId="flows" title="On-Chain & Flows" icon={Waves} status={flowState} summary={whale ? `Whale ${whale.name || 'tracked wallet'}: ${whale.change_7d != null ? `${signed(whale.change_7d, ' BTC / 7d')} · ${whale.signal || 'direction unknown'}` : 'change unavailable'}` : `Whales: ${health?.whales === 'loading' ? 'loading' : 'unavailable'}`} freshness={last(whales?.source || 'Whale feed', whales?.as_of)} onAsk={() => ask('flows')} onOpen={() => open('flows')}>
          <p className="line-clamp-1">ETF: {etf?.net_1d != null ? `${signed(etf.net_1d, 'm USD')} · session ${etf.latest_date || 'date unavailable'}` : 'reported session unavailable'} · issuer lag applies</p>
          <p className="mt-1 line-clamp-2">Network: {network?.hashrate_ehs != null ? `${network.hashrate_ehs} EH/s (${network?.as_of ? when(network.as_of) : 'source time unavailable'})` : 'unavailable'} · sentiment: {sentiment?.value != null ? `${sentiment.value}/100 ${sentiment.label || ''} (${when(sentiment.ts)})` : 'unavailable'}</p>
          <p className="mt-1 line-clamp-1 text-slate-400">Cross-check: {whale?.signal && etf?.net_1d != null ? `${whale.signal} whale label vs ${Number(etf.net_1d) >= 0 ? 'positive' : 'negative'} last ETF session (different windows)` : 'Whale/ETF comparison unavailable'} · next provider time not confirmed</p>
        </DashboardCard>
        <DashboardCard cardId="radar" title="Opportunity Radar" icon={Radar} status={health?.streams === 'stale' || (health?.streams === 'error' && research) ? 'stale' : health?.streams === 'loading' && !research ? 'loading' : health?.streams === 'error' && !research ? 'error' : findings.length ? 'WAIT' : research ? 'unavailable' : 'loading'} summary={findings[0]?.title || (research ? 'No qualified setups; no trade proposed.' : 'Research findings loading or unavailable.')} freshness={last('Research evaluation', research?.asOf || streams?.generatedAt)} onAsk={() => ask('radar')} onOpen={() => open('radar')}>
          {findings.length ? findings.map((f, i) => <p key={f.findingId || i} className="mt-0.5 line-clamp-1" title={`${f.confirmIf} / ${f.invalidateIf}`}>{f.asset || f.symbol || 'Market (asset not specified)'} · {f.priorityLabel || titleCase(f.priority)} · trigger {f.confirmIf} · cancel {f.invalidateIf}</p>) : <p className="text-slate-400">{research ? 'No research with both measurable confirmation and invalidation.' : 'Awaiting sourced research.'}</p>}
          <p className="mt-1 line-clamp-1 text-amber-200">WAIT · portfolio/mandate fit and coin execution support must be checked in Studio. No trade proposed by this research.</p>
          <p className="mt-1 line-clamp-1 text-slate-400">Next: {findings[0]?.resolveBy ? `review by ${when(findings[0].resolveBy)}` : 'next market-stream observation · time not confirmed'}{paperState === 'ready' && paper?.pendingApprovals?.length ? ` · ${paper.pendingApprovals.length} separate owner proposal(s)` : ''}</p>
        </DashboardCard>
      </div>
      <DashboardAskPanel selected={selected} onNav={onNav} onEvidence={setEvidenceId} stateId={sop?.stateId} />
    </div>
    <p className="mt-2 text-xs text-slate-400">Paper trading only. Market readings, historical scenarios, research setups and completed fills are different things. All timestamps refer to their own sources.</p>
    {chart && <ExpandedChart type={chart} outlook={outlook} eth={eth} levels={availableLevels} runAsOf={isOld(d?.created_at, 72) ? `${d?.as_of || when(d?.created_at)} (stale; level lines withheld)` : d?.as_of} onClose={() => setChart(null)} onNav={(id) => onNav(id === 'scenarios' ? 'dashboard-btc' : id === 'crossmarket' ? 'dashboard-intelligence' : id)} onEvidence={(sid) => { setChart(null); setEvidenceId(sid); }} />}
    {evidenceId && <EvidenceDrawer snapshotId={evidenceId} onClose={() => setEvidenceId(null)} onAsk={(sid) => { setEvidenceId(null); setSelected({ title: 'Evidence record', snapshotId: sid }); }} />}
  </>;
};

export { HomeTicker, TickerContent, Explanation, NavigateLink, money, signed, pct, when };
export default OneScreenHome;
