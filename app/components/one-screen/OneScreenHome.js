'use client';

import React, { useState } from 'react';
import {
  Sparkles, Wallet, ShieldAlert, GitBranch, BarChart3, Newspaper, Database,
  Waves, Radar, ArrowUpRight, Maximize2, RefreshCw, ShieldCheck,
} from 'lucide-react';
import ModalShell from './ModalShell';
import DashboardAskPanel from './DashboardAskPanel';
import FillEvidence from './FillEvidence';
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
  const date = new Date(/^\d{4}-\d{2}-\d{2}T/.test(raw) && !/(Z|[+-]\d\d:?\d\d)$/.test(raw) ? `${raw}Z` : /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw);
  return Number.isNaN(date.getTime()) ? null : date;
};
const when = (v, dateOnly = false) => {
  const d = parseTime(v);
  return d ? d.toLocaleString(undefined, dateOnly ? { year: 'numeric', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : 'time unavailable';
};
const isOld = (v, hours = 26) => { const d = parseTime(v); return d ? Date.now() - d.getTime() > hours * 3600000 : true; };
const titleCase = (v) => String(v || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const getSnap = (claim) => (claim?.evidenceRefs || []).find((r) => String(r).startsWith('snap_')) || null;

const CARD_LINKS = {
  brief: [['Unified Brief', 'briefing'], ['Evidence & data audit', 'dataaudit']],
  paper: [['Paper Trading', 'paper'], ['Trade log & strategy attribution', 'paper'], ['Paper Engine evidence', 'paperengine']],
  portfolio: [['Portfolio', 'paper'], ['Risk', 'risk'], ['Leverage', 'leverage'], ['Events', 'events'], ['Smart Money', 'smartmoney']],
  btc: [['BTC Scenarios', 'scenarios'], ['Forecasts', 'forecasts'], ['Scenario Evaluation', 'scenario-evaluation']],
  intelligence: [['Overview', 'overview'], ['Forecasts', 'forecasts'], ['Market Intelligence', 'market-intel'], ['Market Drivers', 'drivers'], ['Cross-Market', 'crossmarket'], ['Happening Again', 'analogs']],
  news: [['News', 'news'], ['Macro & Policy', 'macro'], ['Events calendar', 'events']],
  evidence: [['Performance', 'performance'], ['Paper Engine', 'paperengine'], ['Alert Engine', 'alert-engine'], ['Scenario Evaluation', 'scenario-evaluation'], ['Data Audit', 'dataaudit'], ['App Checkup', 'checkup']],
  flows: [['Whale Watch', 'whales'], ['Institutional & Derivatives', 'institutional'], ['Network & Sentiment', 'network'], ['Bitcoin Time Machine', 'timemachine']],
  radar: [['Opportunity research', 'opportunities'], ['Strategies', 'strategies'], ['Paper Trading', 'paper']],
};
const linkTo = (id) => `/?section=${encodeURIComponent(id)}`;
const NavigateLink = ({ id, children, onNav, className = '' }) => <a href={linkTo(id)} onClick={(e) => { e.preventDefault(); onNav(id); }}
  className={`inline-flex items-center gap-1 font-semibold text-sky-300 hover:text-sky-200 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${className}`}>{children}</a>;

const TickerContent = ({ d, ticker, snapshot }) => {
  const { sop, paper, outlook, streams, driver, etf, health } = snapshot;
  const phase = sop?.marketStreams?.phaseAssessment || streams?.phaseAssessment;
  const breadth = phase?.inputs;
  const uni = streams?.universe || sop?.marketStreams;
  const band = outlook?.band;
  const validation = outlook?.validation || band?.validation;
  const evaluation = validation?.evaluation;
  const measured = validation?.predictiveValidation && evaluation?.evaluationPoints > 0;
  const performance = measured ? `Validated · ${num(evaluation.skillVsNoChange)?.toFixed(2)} skill`
    : validation?.status === 'PENDING' || !validation ? 'Evaluation unavailable' : 'Not validated';
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
      next: 'Reassess after the next published market-cap observation; its release time is not confirmed.', source: 'CoinGecko / dashboard run', asOf: d?.created_at, version: 'market-cap dominance', state: d?.dominance?.dominance == null ? 'unavailable' : isOld(d?.created_at, 26) ? 'stale' : 'ready' },
    { title: 'Altcoin breadth', value: breadth?.altsWithReturns > 0 ? `${breadth.altsBeatingBtc}/${breadth.altsWithReturns} beat BTC` : 'Unavailable', to: 'market-intel',
      what: breadth?.altsWithReturns > 0 ? `${breadth.altsBeatingBtc} of ${breadth.altsWithReturns} eligible altcoins beat BTC over ${phase?.window || 'the measured window'}; ${uni?.eligibleAltCount ?? 'unknown'} eligible in the universe.` : 'The current eligible-altcoin comparison cannot be measured.',
      why: 'Broad participation is more informative than one coin rallying alone; narrow leadership is easier to reverse.',
      how: `Eligible coins with returns over the same BTC comparison window form the denominator. ${uni?.excluded?.length ? `${uni.excluded.length} exclusions reported in the universe; open the market detail for reasons.` : 'Exclusion details are unavailable for this snapshot.'} It does not measure all tokens.`,
      next: 'Reassess on the next completed universe/price update; exact time not confirmed.', source: 'market-streams phase assessment', asOf: phase?.assessedAt || uni?.sourceTimestamp, version: phase?.ruleVersion, snapshotId: streams?.phaseAssessment?.snapshotId, state: breadth?.altsWithReturns > 0 ? health?.sop === 'stale' || phase?.status === 'STALE' ? 'stale' : 'ready' : health?.sop === 'loading' ? 'loading' : 'unavailable' },
    { title: 'ETF net flow', value: net == null ? 'Session unavailable' : `${signed(net, 'm')} · ${etf?.latest_date ? when(etf.latest_date, true).replace(/,? 20\d\d$/, '') : 'date missing'}`, to: 'institutional',
      what: net == null ? 'The latest reported US spot BTC ETF session is unavailable.' : `US spot BTC ETF net flow was ${signed(net, 'm USD')} for the reported session ${etf?.latest_date || 'date not provided'}. This is not a live intraday flow.`,
      why: 'Net creations can require ETF issuers to source BTC; net redemptions can relieve demand, but secondary-market hedging complicates the link to spot price.',
      how: `Sum of reporting issuers’ daily net creations/redemptions in USD millions. Source: ${etf?.source || 'Farside/TFTC reporting feed'}. It is a reported session, not continuously updated.`,
      next: 'Reassess when the next issuer session is published; release time is not confirmed.', source: etf?.source || 'US BTC ETF report', asOf: etf?.latest_date, version: 'daily issuer flow', state: net == null ? health?.etf === 'loading' ? 'loading' : 'unavailable' : health?.etf === 'stale' || isOld(etf?.latest_date, 96) ? 'stale' : 'ready' },
    { title: 'Market stance', value: sop?.market?.regime ? titleCase(sop.market.regime) : 'Unavailable', to: 'briefing',
      what: claim?.text || (sop?.market?.regime ? `The canonical regime reads ${titleCase(sop.market.regime)}.` : 'There is no current engine stance.'),
      why: 'This is the starting context for Albert’s market and paper-risk interpretation, not a probability that BTC will rise.',
      how: 'The canonical regime balances trend and participation inputs; the full Brief names the supporting and opposing claims. It is qualified whenever feeds are stale.',
      next: claim?.invalidation || 'Reassess at the next canonical engine publication; exact time not confirmed.', source: 'canonical regime', asOf: sop?.market?.asOf || sop?.generatedAt, version: sop?.briefing?.ruleVersion, snapshotId: getSnap(claim), state: health?.sop === 'stale' ? 'stale' : sop?.market?.freshness?.toLowerCase() || health?.sop },
    { title: '7d historical range', value: band?.available && band.horizonDays === 7 ? `${signed(band.lowerPct)} to ${signed(band.upperPct)}` : 'Range unavailable', to: 'scenarios',
      what: band?.available && band.horizonDays === 7 ? `In comparable past conditions, the middle 60% of Bitcoin's next seven-day moves fell between ${signed(band.lowerPct)} and ${signed(band.upperPct)}. Future prices can fall outside that range. It is historical context, not a forecast.` : `No range is published: ${band?.reasonText || 'evaluation or matched sample unavailable'}.`,
      why: 'The band illustrates how similar historical conditions resolved, not the chance of a trade succeeding.',
      how: band?.available ? `20th–80th percentile of ${band.matchedDays ?? 'the'} matched days, seven-day horizon; ${band.independentEpisodes ?? 'unknown'} independent episodes. Anchored to the closed candle on ${when(band.anchorDate, true)}.` : 'The provider withholds a numeric band until its own sample and walk-forward calibration gate are met.',
      next: 'Reassess after the next closed daily candle and completed walk-forward evaluation; exact time not confirmed.', source: 'scenario-outlooks/preview', asOf: outlook?.baseline?.observedAt, version: outlook?.modelVersion, snapshotId: band?.snapshotId, state: band?.available && band.horizonDays === 7 ? health?.outlook === 'stale' || isOld(outlook?.baseline?.observedAt, 50) ? 'stale' : 'ready' : health?.outlook === 'loading' ? 'loading' : 'unavailable' },
    { title: 'Forecast performance', value: performance, to: 'scenario-evaluation',
      what: measured ? `Walk-forward evaluation over ${evaluation.evaluationPoints} chronological checks: skill ${num(evaluation.skillVsNoChange)?.toFixed(2)} vs assuming no change; last evaluated ${when(evaluation.lastEvaluatedAt, true)}.` : `${performance}. ${validation?.headline || band?.reasonText || 'The measured evaluation is not available.'}`,
      why: 'A historical scenario range can be descriptive even if the middle path has no predictive edge. Measured skill must be validated separately before calling it predictive.',
      how: `The provider checks past predictions chronologically against a no-change baseline and tests interval coverage. ${validation?.materialSkillThreshold == null ? 'Predictive threshold is not available.' : `Material skill threshold ${validation.materialSkillThreshold}.`} No range or ticker direction is substituted for measured performance.`,
      next: 'Reassess when the provider completes the next walk-forward evaluation; exact time not confirmed.', source: 'scenario-outlooks evaluation', asOf: evaluation?.lastEvaluatedAt, version: outlook?.modelVersion, snapshotId: band?.snapshotId, state: measured ? health?.outlook === 'stale' || isOld(evaluation?.lastEvaluatedAt, 240) ? 'stale' : 'ready' : health?.outlook === 'loading' ? 'loading' : 'unavailable' },
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

const HomeTicker = ({ d, ticker, snapshot, onNav }) => {
  const [item, setItem] = useState(null);
  const [evidenceId, setEvidenceId] = useState(null);
  const items = TickerContent({ d, ticker, snapshot });
  const close = () => setItem(null);
  return <>
    <div aria-label="Market snapshot ticker" className="order-last flex w-full shrink-0 items-center justify-between gap-0 overflow-x-auto [scrollbar-width:thin] xl:order-none xl:min-w-0 xl:w-auto xl:flex-1 xl:shrink">
      {items.map((entry, index) => <button type="button" key={entry.title} onClick={() => setItem(index)} aria-label={`${entry.title}: ${entry.value}. Open explanation`}
        className="flex min-h-9 shrink-0 flex-col justify-center whitespace-nowrap rounded-md border border-transparent px-1 text-left hover:border-sky-500/40 hover:bg-slate-800/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{entry.title}{entry.state === 'stale' ? ' · stale' : ''}</span>
        <span className={`text-xs font-bold ${entry.state === 'stale' || entry.state === 'unavailable' ? 'text-amber-200' : 'text-white'}`}>{entry.value}</span>
      </button>)}
    </div>
    {item != null && <ModalShell title={items[item].title} onClose={close} className="max-w-xl">
      <Explanation item={items[item]} onNav={(id) => { close(); onNav(id); }} onEvidence={(sid) => { close(); setEvidenceId(sid); }} />
    </ModalShell>}
    {evidenceId && <EvidenceDrawer snapshotId={evidenceId} onClose={() => setEvidenceId(null)} />}
  </>;
};

const DashboardCard = ({ title, icon: Icon, status, summary, freshness, children, onOpen, onAsk, detail, chart }) => <article className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-700/80 bg-slate-900/80 p-3 shadow-sm shadow-black/20 xl:h-[187px]">
  <div className="flex min-h-5 items-center gap-1.5">
    <Icon className="h-4 w-4 shrink-0 text-sky-300" />
    <h2 className="min-w-0 truncate text-[13px] font-bold text-white" title={title}><button type="button" onClick={onOpen} aria-label={`Open ${title} summary and destinations`} className="max-w-full truncate text-left hover:text-sky-200 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">{title}</button></h2>
    {status && <span className={`ml-auto shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-bold ${['stale', 'error', 'unavailable', 'unverified'].includes(status) ? 'bg-amber-500/15 text-amber-200' : 'bg-sky-500/10 text-sky-200'}`}>{titleCase(status)}</span>}
  </div>
  <p className="mt-1 line-clamp-2 text-xs leading-snug text-slate-300">{summary}</p>
  <div className="mt-1 min-h-0 flex-1 overflow-hidden text-xs leading-snug text-slate-200">{children}</div>
  <div className="mt-1 flex shrink-0 items-center gap-2 border-t border-slate-800 pt-1.5 text-xs">
    <span className="min-w-0 flex-1 truncate text-[11px] text-slate-400" title={freshness}>{freshness || 'Source time unavailable'}</span>
    <button type="button" onClick={onAsk} aria-label={`Ask Albert about ${title}`} className="shrink-0 rounded-sm p-0.5 text-sky-300 hover:text-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"><Sparkles className="h-3.5 w-3.5" /></button>
    <button type="button" onClick={onOpen} aria-label={`Open ${title} summary and destinations`} className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-sky-300 hover:text-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">{detail || 'Details'}<ArrowUpRight className="h-3.5 w-3.5" /></button>
  </div>
</article>;

const OneScreenHome = ({ d, ticker, news, newsStatus, snapshot, onNav }) => {
  const [detail, setDetail] = useState(null);
  const [chart, setChart] = useState(null);
  const [selected, setSelected] = useState(null);
  const [evidenceId, setEvidenceId] = useState(null);
  const [fillEvidence, setFillEvidence] = useState(null);
  const { sop, paper, outlook, eth, streams, driver, etf, health } = snapshot;
  const claims = sop?.briefing?.claims || [];
  const directionClaim = claims.find((c) => c.claimId === 'briefing.direction');
  const portfolioClaim = claims.find((c) => c.claimId === 'briefing.portfolio');
  const leadershipClaim = claims.find((c) => c.claimId === 'briefing.leadership');
  const totals = paper?.totals;
  const entries = (paper?.recentFills || []).filter((e) => e.eventType === 'FILL' && (e.side === 'BUY' || e.side === 'SELL')).slice(0, 2);
  const hasStalePrices = (paper?.strategies || []).some((s) => s.marketData === 'STALE');
  const pnl = totals?.valueAvailable && !hasStalePrices && num(totals?.startingCash) > 0 ? num(totals.pnlUsd) : null;
  const pnlState = !totals?.wallets ? 'No paper account' : !totals?.valueAvailable ? 'Valuation unavailable' : hasStalePrices ? 'Stale prices' : pnl == null ? 'Basis unavailable' : Math.abs(pnl) < 0.005 ? 'Neutral' : pnl > 0 ? 'Profit' : 'Loss';
  const positions = paper?.positions || [];
  const phase = streams?.phaseAssessment || sop?.marketStreams?.phaseAssessment;
  const research = streams?.researchFindings || sop?.marketStreams?.researchFindings;
  const findings = (research?.findings || []).filter((f) => f.status !== 'NO_HYPOTHESIS' && f.confirmIf && f.invalidateIf).slice(0, 2);
  const lead = driver?.currentLeader;
  const next = driver?.nextMoverCandidates?.[0];
  const story = news?.cards?.filter((c) => c?.title)?.sort((a, b) => (b.impact || 0) - (a.impact || 0))?.[0];
  const newsMechanism = !story ? 'The price/liquidity transmission cannot be assessed without a sourced development.'
    : /stablecoin|regulat/i.test(`${story.title} ${story.ai?.summary}`)
      ? 'Clearer issuer rules might improve institutional on-ramps and BTC liquidity, while compliance costs or slower adoption could work against that. The near-term price effect is unproven.'
      : /inflation|rate decision|interest rate|cpi/i.test(`${story.title} ${story.ai?.summary}`)
        ? 'Rates staying higher can draw capital toward cash and bonds and away from crypto risk; a softer release could have the opposite effect. Neither path is assured.'
        : 'The BTC transmission is conditional; a sourced development alone does not establish the direction or timing of a price move.';
  const band = outlook?.band;
  const val = outlook?.validation || band?.validation;
  const valText = val?.predictiveValidation ? `Validated · ${val?.evaluation?.evaluationPoints || band?.evaluationPoints} checks` : val?.status === 'PENDING' || !val ? 'Evaluation unavailable' : 'Not validated';
  const participants = (streams?.participants?.participants || []).filter((p) => p?.finding && p?.status !== 'MISSING').slice(0, 2);
  const marketRows = matchedMarketSeries(outlook, eth);
  const lastSharedMarket = marketRows.filter((p) => p.BTC != null && p.ETH != null).at(-1);
  const returns = lastSharedMarket ? `BTC ${signed(lastSharedMarket.BTC - 100)} · ETH ${signed(lastSharedMarket.ETH - 100)}` : 'Matched comparison preparing';
  const last = (source, asOf, dateOnly = false) => `${source} · ${when(asOf, dateOnly)}`;
  // A chart run older than the canonical closed-candle snapshot cannot supply
  // current support/ceiling levels; keep the date visible but withhold its lines.
  const availableLevels = isOld(d?.created_at, 72) ? [] : d?.chart?.sr_levels;
  const info = {
    brief: { title: 'Albert’s Brief', to: 'briefing', what: directionClaim?.text || 'A current market judgment is unavailable.', why: leadershipClaim?.text || 'Market leadership is not confirmed in this snapshot.', how: directionClaim?.invalidation || 'The canonical regime is based on measured trend and participation; a stale feed blocks action calls.', next: 'At the next canonical engine and market-stream publication; exact time not confirmed.', source: 'state-of-play briefing', asOf: sop?.market?.asOf || sop?.generatedAt, version: sop?.briefing?.ruleVersion, snapshotId: getSnap(directionClaim), state: sop?.market?.freshness?.toLowerCase() || health.sop, links: CARD_LINKS.brief },
    paper: { title: 'Paper Trading', to: 'paper', what: !totals?.wallets ? 'No paper wallet exists yet.' : !totals.valueAvailable ? 'Combined valuation is unavailable; one or more held assets cannot be marked safely.' : hasStalePrices ? `Last marked paper value ${money(totals.value, 2)} may be stale; profit/loss is withheld until a fresh mark.` : pnl == null ? `Combined value ${money(totals.value, 2)}; profit/loss basis unavailable.` : `Combined value ${money(totals.value, 2)}. ${pnlState} ${money(Math.abs(pnl), 2)} (${signed(totals.pnlPct)}) against ${money(totals.startingCash, 2)} starting cash.`, why: 'Only completed fills affect the ledger and paper account; pending proposals do not count as trades.', how: 'The paper engine sums each strategy wallet’s cash and marked holdings, then subtracts its starting cash. Fees are included in the ledger; no sell profit is inferred from a buy.', next: 'Recalculate after a new mark or completed paper fill; next market time not confirmed.', source: 'paper/overview, account ledgers', asOf: paper?.asOf, version: 'paper engine projection', snapshotId: getSnap(portfolioClaim), state: hasStalePrices ? 'stale' : health.paper, links: CARD_LINKS.paper },
    portfolio: { title: 'Portfolio & Risk', to: 'paper', what: !totals?.wallets ? 'No paper portfolio exists yet.' : `${positions.length} open holdings across ${totals.wallets} paper wallets. ${paper?.cashAvailable ? `Cash ${money(paper.cashTotal, 2)} (${pct(paper.cashPct)} of combined value).` : 'Combined cash allocation unavailable.'} ${paper?.openRiskAvailable ? `Combined open risk ${pct(paper.openRiskPct)} against the paper profile cap ${pct(paper.openRiskLimitPct)}.` : 'Combined open risk unavailable.'}`, why: 'Holdings expose the account to mark-to-market moves; the paper profile open-risk cap and owner mandate drawdown limit are separate safeguards.', how: 'Cash and open risk are summed from each owner-scoped paper wallet’s canonical equity and allocation projection. The owner mandate drawdown limit is not substituted for the paper profile open-risk cap.', next: 'Recalculate after a fill, mark or mandate change; the next provider update time is not confirmed.', source: 'paper/overview + owner mandate', asOf: paper?.asOf, version: 'paper equity/risk projection', snapshotId: getSnap(portfolioClaim), state: health.paper, links: CARD_LINKS.portfolio },
    btc: { title: 'BTC Bull & Bear', to: 'scenarios', what: band?.available ? `Historical 7-day 20th–80th percentile: ${signed(band.lowerPct)} to ${signed(band.upperPct)}. Not a forecast${val?.predictiveValidation ? ' despite passing measured validation' : ''}.` : `No range published: ${band?.reasonText || 'evaluation or sample unavailable'}.`, why: 'Observed history ends at Now. Bull/bear paths are conditional historical comparisons, not guarantees or price limits.', how: `Closed daily candles and measured historical analogs. ${availableLevels?.length ? `Support and ceiling are clustered daily swing reactions from the ${when(d?.created_at)} dashboard study, not promises.` : `The last daily support/ceiling study (${when(d?.created_at)}) is stale or unavailable; its lines are withheld from this newer chart.`}`, next: 'Recheck after the next closed daily candle and evaluation; exact time not confirmed.', source: 'scenario-outlooks/preview + chart intelligence', asOf: outlook?.baseline?.observedAt, version: outlook?.modelVersion, snapshotId: band?.snapshotId, state: health.outlook, links: CARD_LINKS.btc },
    intelligence: { title: 'Market Intelligence', to: 'drivers', what: lead ? `Current leading driver: ${titleCase(lead.actor || lead.label)} (${lead.evidenceStatus || 'qualification unavailable'}). ${next ? `Watch ${titleCase(next.actor)} next — ${next.probabilityBand || 'unrated'} band.` : 'Next driver not established.'}` : 'A current leading driver is not established.', why: 'A leader may explain observed market movement; a possible next driver is conditional, not a trading signal.', how: `Market-driver engine ${driver?.engineVersion || 'version unavailable'} weighs observed and inferred evidence separately. The chart matches actual BTC/ETH daily dates, normalized to 100; gaps are not filled.`, next: next?.condition ? `Review if ${next.condition}; exact event time not confirmed.` : 'Next driver review time not confirmed; check market source.', source: 'market-driver + matched closed candles', asOf: driver?.asOf || outlook?.baseline?.observedAt, version: driver?.engineVersion, snapshotId: null, state: health.driver, links: CARD_LINKS.intelligence },
    news: { title: 'News, Macro & Policy', to: 'news', what: story ? `${story.title} (${story.verification || 'verification unknown'}).` : 'No sourced current development is available.', why: story?.ai?.why_it_matters || 'The effect on this portfolio is not established by the available source.', how: story?.ai?.summary ? `${story.ai.summary} ${newsMechanism}` : newsMechanism, next: 'Reassess after independent source confirmation or the next scheduled event; exact time not confirmed — check the Events calendar.', source: story?.source || 'news feed', asOf: story?.published, version: 'news verification', state: newsStatus === 'ready' && story ? isOld(story.published, 72) ? 'stale' : story.verification === 'Verified' ? 'ready' : 'unverified' : newsStatus === 'loading' ? 'loading' : 'unavailable', links: CARD_LINKS.news },
    evidence: { title: 'Evidence & Engines', to: 'scenario-evaluation', what: `Data ${titleCase(sop?.dataQuality?.status || 'unavailable')}; paper ${paper?.status || 'unavailable'}; scenario ${valText}.`, why: 'Traceable fills and source health determine whether an attractive number is safe to use. A descriptive range is not measured predictive performance.', how: 'Paper results trace to ledger fills and strategy attribution; evaluation checks the matched-history provider chronologically against no change. Neither chat nor UI changes the engine.', next: 'Recheck after the next mark, evaluation or health update; exact time not confirmed.', source: 'state-of-play + scenario evaluation + paper ledger', asOf: val?.evaluation?.lastEvaluatedAt || sop?.generatedAt, version: outlook?.modelVersion || sop?.briefing?.ruleVersion, snapshotId: band?.snapshotId, state: val?.evaluation?.lastEvaluatedAt && isOld(val.evaluation.lastEvaluatedAt, 240) ? 'stale' : health.sop, links: CARD_LINKS.evidence },
    flows: { title: 'On-Chain & Flows', to: 'institutional', what: `${etf?.net_1d != null ? `Latest reported ETF session ${etf.latest_date || 'date unavailable'}: ${signed(etf.net_1d, 'm USD')}.` : 'Latest ETF session unavailable.'} ${participants[0]?.finding || 'Whale/network readings not confirmed.'}`, why: 'ETF creations may require sourcing BTC; whale and network changes can alter liquid supply, but one feed alone does not prove a price move.', how: 'Issuer session totals plus separately classified market-participant observations; stale/missing cohorts cannot be treated as a live signal.', next: 'Next provider or issuer reporting update; time not confirmed.', source: 'US ETF reported sessions + market participants', asOf: etf?.latest_date || streams?.generatedAt, version: streams?.version, snapshotId: streams?.participants?.snapshotId, state: health.etf === 'ready' ? health.streams : health.etf, links: CARD_LINKS.flows },
    radar: { title: 'Opportunity Radar', to: 'opportunities', what: findings[0] ? `${findings[0].title} — research ${titleCase(findings[0].priority)}; no trade proposed unless an actual proposal is pending.` : 'No qualified setup. No trade proposed.', why: findings[0]?.hypothesis || 'No setup currently has both a measurable confirmation and invalidation.', how: findings[0] ? `Confirm: ${findings[0].confirmIf}. Invalidate: ${findings[0].invalidateIf}. Risk/mandate fit must be checked in the strategy workflow, not assumed here.` : 'Only a measured research finding with a falsifiable trigger can enter this radar; research alone never executes a trade.', next: findings[0]?.resolveBy ? `Review on the next provider observation, no later than resolution deadline ${when(findings[0].resolveBy)}; exact next review time not confirmed.` : 'Review on the next market-stream refresh; exact time not confirmed.', source: 'market-streams research findings', asOf: findings[0]?.openedAt || streams?.generatedAt, version: research?.ruleVersion, snapshotId: findings[0]?.snapshotId, state: health.streams === 'error' && !research ? 'error' : research?.status?.toLowerCase() || 'unavailable', links: CARD_LINKS.radar },
  };
  const ask = (id) => setSelected({ ...info[id], title: info[id].title });
  const open = (id) => setDetail(id);
  const navDetail = (id) => { setDetail(null); onNav(id); };
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
        <DashboardCard title="Albert’s Brief" icon={Sparkles} status={info.brief.state} summary={directionClaim?.text || 'Market assessment unavailable; no judgment is inferred.'} freshness={last(sop?.market?.asOf ? 'Regime source' : 'Snapshot built (source time missing)', sop?.market?.asOf || sop?.generatedAt)} onAsk={() => ask('brief')} onOpen={() => open('brief')}>
          <p className="line-clamp-2">{leadershipClaim?.text || 'Market leadership evidence is not currently confirmed.'}</p><p className="mt-1 line-clamp-2 text-slate-400">Changes when: {directionClaim?.invalidation || 'next engine run · time not confirmed'}</p>
        </DashboardCard>
        <DashboardCard title="Paper Trading" icon={Wallet} status={pnlState === 'Stale prices' ? 'stale' : health.paper} summary={!totals?.wallets ? 'No paper account yet.' : `${pnlState} · ${totals.valueAvailable ? money(totals.value, 2) : 'value unavailable'}${pnl != null ? ` · ${money(Math.abs(pnl), 2)} (${signed(totals.pnlPct)})` : ''} vs ${money(totals.startingCash, 2)} starting cash`} freshness={last('Marked', paper?.asOf)} onAsk={() => ask('paper')} onOpen={() => open('paper')}>
          {entries.length ? <div className="space-y-0.5">{entries.map((e, i) => <p key={e.ledgerEventId || i} className="truncate" title={e.note}>{e.side === 'BUY' ? 'Bought' : 'Sold'} {e.asset} · {e.qty} @ {money(e.fillPx, 2)} · {when(e.effectiveAt || e.recordedAt)} <span className="text-slate-400">{e.strategyName || 'strategy unavailable'}</span></p>)}</div> : <p className="text-slate-400">No completed paper trades yet.</p>}
          {paper?.pendingApprovals?.length ? <p className="mt-1 truncate text-amber-200">{paper.pendingApprovals.length} pending proposal(s), not fills.</p> : null}
        </DashboardCard>
        <DashboardCard title="Portfolio & Risk" icon={ShieldAlert} status={health.paper} summary={!totals?.wallets ? 'Create a paper strategy wallet to see holdings and risk.' : `${positions.length} holdings · ${paper?.cashAvailable ? `${pct(paper.cashPct)} cash` : 'combined cash unavailable'} · ${paper?.openRiskAvailable ? `${pct(paper.openRiskPct)} open risk / ${pct(paper.openRiskLimitPct)} paper cap` : 'combined open risk unavailable'}`} freshness={last('Paper mark', paper?.asOf)} onAsk={() => ask('portfolio')} onOpen={() => open('portfolio')}>
          {positions.length ? <p className="line-clamp-2">{positions.slice(0, 4).map((p) => `${p.asset} ${p.netQuantity}`).join(' · ')}{positions.length > 4 ? ` · +${positions.length - 4} more` : ''}</p> : <p className="text-slate-400">No open paper holdings.</p>}
          <p className="mt-1 text-slate-400">Mandate max drawdown: {pct(sop?.user?.maxDrawdownPct)} · reserve {pct(sop?.user?.protectedReservePct)}</p>
        </DashboardCard>
        <DashboardCard title="BTC Bull & Bear" icon={GitBranch} status={health.outlook} summary={band?.available ? `Historical 7d: ${signed(band.lowerPct)} to ${signed(band.upperPct)} · not a forecast` : `Range withheld · ${band?.reasonCode || 'waiting for evaluation'}`} freshness={last('Closed candle', outlook?.baseline?.observedAt)} onAsk={() => ask('btc')} onOpen={() => open('btc')} detail="Evidence">
          {focusableChart('btc', 'BTC historical bull and bear', <BTCChart outlook={outlook} levels={availableLevels} />)}
        </DashboardCard>
        <DashboardCard title="Market Intelligence" icon={BarChart3} status={health.driver} summary={lead ? `Leading: ${titleCase(lead.actor || lead.label)} · watch ${titleCase(next?.actor || 'next driver unconfirmed')}` : 'Leading market driver unavailable'} freshness={last('Driver', driver?.asOf)} onAsk={() => ask('intelligence')} onOpen={() => open('intelligence')}>
          {focusableChart('market', 'normalized BTC and ETH', <MarketChart btc={outlook} eth={eth} />)}
          <p className="truncate text-[11px] text-slate-400">{returns} · shared daily closes</p>
        </DashboardCard>
        <DashboardCard title="News, Macro & Policy" icon={Newspaper} status={info.news.state} summary={story?.title || 'No sourced current development to summarize.'} freshness={last(story?.source || 'News', story?.published)} onAsk={() => ask('news')} onOpen={() => open('news')}>
          <p className="line-clamp-2">{story?.ai?.why_it_matters || 'Impact on BTC and this portfolio is not yet established.'}</p><p className="mt-1 text-slate-400">Reassess at the verified release · time not confirmed</p>
        </DashboardCard>
        <DashboardCard title="Evidence & Engines" icon={Database} status={info.evidence.state} summary={`Paper ledger ${entries.length ? 'has completed fills' : 'has no completed fills'} · data ${titleCase(sop?.dataQuality?.status || 'unavailable')}`} freshness={last('Evaluation', val?.evaluation?.lastEvaluatedAt, true)} onAsk={() => ask('evidence')} onOpen={() => open('evidence')}>
          <p className="font-semibold text-amber-200">Scenario: {valText}</p><p className="mt-1 line-clamp-2 text-slate-400">{sop?.dataQuality?.issues?.[0]?.detail || val?.headline || 'No current issue reported; check individual source timestamps.'}</p>
        </DashboardCard>
        <DashboardCard title="On-Chain & Flows" icon={Waves} status={info.flows.state} summary={etf?.net_1d != null ? `ETF ${signed(etf.net_1d, 'm USD')} · reported ${etf.latest_date || 'date unavailable'}` : 'Latest reported ETF session unavailable'} freshness={last('Reported ETF session', etf?.latest_date, true)} onAsk={() => ask('flows')} onOpen={() => open('flows')}>
          {participants.length ? participants.map((p, i) => <p key={i} className="line-clamp-1">{titleCase(p.participant)}: {p.finding}</p>) : <p className="text-slate-400">Whale, network and sentiment observations preparing or unavailable.</p>}
          <p className="mt-1 text-slate-400">Next report time not confirmed.</p>
        </DashboardCard>
        <DashboardCard title="Opportunity Radar" icon={Radar} status={info.radar.state} summary={findings[0]?.title || 'No qualified setup. No trade proposed.'} freshness={last('Research', findings[0]?.openedAt || streams?.generatedAt)} onAsk={() => ask('radar')} onOpen={() => open('radar')}>
          {findings[0] ? <><p className="line-clamp-1">Confirm: {findings[0].confirmIf}</p><p className="line-clamp-1 text-slate-400">Cancel: {findings[0].invalidateIf}</p><p className="text-amber-200">No trade proposed{paper?.pendingApprovals?.length ? ` · ${paper.pendingApprovals.length} separate existing proposal(s)` : ''}</p></> : <p className="text-slate-400">A setup needs observed evidence, a measurable trigger, invalidation and risk review before it is actionable.</p>}
        </DashboardCard>
      </div>
      <DashboardAskPanel selected={selected} onNav={onNav} onEvidence={setEvidenceId} stateId={sop?.stateId} />
    </div>
    <p className="mt-2 text-xs text-slate-400">Paper trading only. Market readings, historical scenarios, research setups and completed fills are different things. All timestamps refer to their own sources.</p>
    {detail && <ModalShell title={info[detail].title} onClose={() => setDetail(null)} className="max-w-2xl">
      <Explanation item={info[detail]} onNav={navDetail} onEvidence={(sid) => { setDetail(null); setEvidenceId(sid); }} />
      {detail === 'paper' && <div className="mt-4 border-t border-slate-700 pt-3"><h3 className="text-sm font-bold text-white">Latest completed fills</h3>{entries.length ? entries.map((e, i) => <p key={e.ledgerEventId || i} className="mt-2 text-sm text-slate-300">{e.side === 'BUY' ? 'Bought' : 'Sold'} {e.qty} {e.asset} at {money(e.fillPx, 2)} · fee {money(e.fee, 2)} · completed {when(e.effectiveAt || e.recordedAt)} · {e.strategyName || 'strategy unavailable'}{e.side === 'SELL' && num(e.realized) != null ? ` · realized ${money(e.realized, 2)}` : ''} · <button type="button" onClick={() => { setDetail(null); setFillEvidence(e); }} className="font-semibold text-sky-300 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">Fill evidence</button></p>) : <p className="mt-2 text-sm text-slate-400">No completed paper trades yet.</p>}</div>}
      {detail === 'news' && story?.link && <a href={story.link} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm text-sky-300 underline">Open original reporting ↗</a>}
      {detail === 'radar' && findings.length > 0 && <p className="mt-3 text-sm text-amber-200">No trade proposed from this research. Any paper approval must use the existing strategy workflow.</p>}
    </ModalShell>}
    {chart && <ExpandedChart type={chart} outlook={outlook} eth={eth} levels={availableLevels} runAsOf={isOld(d?.created_at, 72) ? `${d?.as_of || when(d?.created_at)} (stale; level lines withheld)` : d?.as_of} onClose={() => setChart(null)} onNav={onNav} onEvidence={(sid) => { setChart(null); setEvidenceId(sid); }} />}
    {fillEvidence && <FillEvidence fill={fillEvidence} onClose={() => setFillEvidence(null)} onNav={onNav} />}
    {evidenceId && <EvidenceDrawer snapshotId={evidenceId} onClose={() => setEvidenceId(null)} onAsk={(sid) => { setEvidenceId(null); setSelected({ title: 'Evidence record', snapshotId: sid }); }} />}
  </>;
};

export { HomeTicker, TickerContent, Explanation, NavigateLink, money, signed, pct, when };
export default OneScreenHome;
