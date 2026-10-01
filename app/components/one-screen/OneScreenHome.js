'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Sparkles, Wallet, ShieldAlert, GitBranch, BarChart3, Newspaper,
  Waves, ArrowUpRight, Maximize2, RefreshCw, ShieldCheck, Bot,
  PanelLeftClose, PanelLeftOpen, ChevronUp, X, GripHorizontal,
} from 'lucide-react';
import ModalShell from './ModalShell';
import DashboardAskPanel from './DashboardAskPanel';
import { sectionDeepLink } from './ConsolidatedDetail';
import { API_BASE } from '../../lib/api';
import { BTCChart, MarketChart, ExpandedChart, matchedMarketSeries } from './OneScreenCharts';
import EvidenceDrawer from '../albert/EvidenceDrawer';
import DraggableGrid from './DraggableGrid';
import BTCScenarioTracker from './BTCScenarioTracker';
import FeedHealthRow, { NewsStaleBadge } from './FeedHealthRow';

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

  // Extract institutional metrics from the dashboard overlay
  const instMetrics = d?.institutional?.metrics || [];
  const findInst = (label) => (Array.isArray(instMetrics) ? instMetrics : []).find((i) => String(i?.name || '').toLowerCase().includes(label.toLowerCase()));
  const fundingInst = findInst('Funding rate');
  // Fallback: use the leverage snapshot's funding if institutional panel is stale
  const levSnap = d?.leverage_snapshot;
  const fundingItem = (fundingInst?.value && fundingInst?.status === 'ready') ? fundingInst
    : levSnap?.funding_rate != null && levSnap?.funding_source
      ? { value: `${levSnap.funding_rate > 0 ? '+' : ''}${levSnap.funding_rate.toFixed(4)}%`, signal: levSnap.funding_bias || 'Neutral', source: levSnap.funding_source, as_of: levSnap.funding_as_of }
      : fundingInst;
  const takerItem = findInst('Taker');

  // Volume vs normal from spot volume shares
  const vol24 = streams?.spotVolumeShares?.windows?.['24h'];
  const rawBtcShare = num(vol24?.btcShare);
  const btcVolPct = rawBtcShare != null ? rawBtcShare * 100 : null;
  const volChange = num(vol24?.totalChangeVsAvg);

  // Halving cycle
  const cycle = d?.cycle;
  const halvingPct = num(cycle?.cycle_progress_pct);

  // Bear scenario from scenario band
  const basePrice = num(ticker?.price);
  const lowerPct = num(band?.lowerPct);
  const bearPrice = basePrice && lowerPct != null ? basePrice * (1 + lowerPct / 100) : null;

  // Downside zone from risk engine (support/resistance), fallback to chart sr_levels
  const dsZone = d?.risk?.downside_zone || (() => {
    const refPrice = num(ticker?.price) || num(d?.last_close);
    if (!refPrice) return null;
    const sr = d?.chart?.sr_levels || [];
    const supports = sr.filter((l) => l.type === 'support' && l.price < refPrice)
      .sort((a, b) => b.price - a.price);
    if (supports.length > 0) {
      const nearest = supports[0];
      return { price: nearest.price, distance_pct: +((refPrice - nearest.price) / refPrice * 100).toFixed(1), label: 'Primary support' };
    }
    return null;
  })();

  return [
    // 1. BTC price + 24h change
    { title: 'BTC spot', value: ticker?.price ? `${money(ticker.price)} · ${change24 != null ? signed(change24) : ''}` : 'Unavailable', to: 'market-intel',
      definition: 'The current BTC/USD spot price and its percentage change over the past 24 hours. This is the real-time market price of one Bitcoin in US dollars.',
      what: ticker?.price ? `BTC/USD spot ${money(ticker.price)}; 24h change ${change24 != null ? signed(change24) : 'unavailable'}.` : 'Quote unavailable.',
      commentary: ticker?.price
        ? `BTC is trading at ${money(ticker.price)}${change24 != null ? `. Over the past 24 hours the price has moved ${signed(change24)}${Math.abs(change24) > 5 ? ' — a significant daily move that may signal increased volatility' : Math.abs(change24) < 1 ? ' — essentially flat, suggesting consolidation' : ''}` : ''}. This is the reference price used by all other engine calculations.`
        : 'The live BTC price feed is not responding. This typically means the ticker provider (CoinGecko or Kraken) is temporarily unreachable. All price-dependent metrics will also show as unavailable until the feed recovers.',
      source: ticker?.source || 'ticker', asOf: ticker?.ts },
    // 2. 7d downside probability (from scenario band)
    { title: '7d downside', value: band?.lowerPct != null ? `${signed(band.lowerPct)} to ${signed(band.upperPct)}` : 'Unavailable', to: 'scenarios',
      definition: 'The 20th-to-80th percentile range of where BTC price could be in 7 days, based on the scenario evaluation model. The lower bound represents the bearish tail; the upper bound represents the bullish tail.',
      what: band?.lowerPct != null ? `20th–80th pct 7d range: ${signed(band.lowerPct)} to ${signed(band.upperPct)}.` : band?.reasonText || 'Unavailable.',
      commentary: band?.lowerPct != null
        ? `Based on the scenario evaluation model, there is roughly a 20% chance BTC moves below ${signed(band.lowerPct)} and a 20% chance it moves above ${signed(band.upperPct)} over the next 7 days. ${Math.abs(band.lowerPct) > Math.abs(band.upperPct) ? 'The downside tail is wider than the upside, suggesting the risk distribution is skewed bearish.' : Math.abs(band.upperPct) > Math.abs(band.lowerPct) ? 'The upside tail is wider, suggesting the distribution is skewed bullish.' : 'The band is roughly symmetric — no strong directional skew.'}`
        : 'The scenario evaluation engine has not run yet, or the most recent run did not produce a valid probability band. Use "Ask Albert to refresh" or wait for the next scheduled evaluation cycle. The scenario engine requires at least 30 days of closed daily candles.',
      source: 'scenario-outlooks/preview', asOf: outlook?.baseline?.observedAt },
    // 3. Volume vs normal
    { title: 'Volume', value: volChange != null ? `${volChange > 0 ? '+' : ''}${volChange.toFixed(0)}% vs avg` : btcVolPct != null ? `BTC ${btcVolPct.toFixed(1)}% share` : 'Unavailable', to: 'market-intel',
      definition: 'How current 24-hour trading volume compares to the 30-day average. Higher-than-normal volume often signals conviction behind a price move; lower volume suggests weak participation.',
      what: volChange != null ? `24h trading volume is ${volChange > 0 ? '+' : ''}${volChange.toFixed(0)}% vs 30d average.` : btcVolPct != null ? `BTC accounts for ${btcVolPct.toFixed(1)}% of eligible spot turnover.` : 'Volume data unavailable.',
      commentary: volChange != null
        ? `Trading volume over the last 24 hours is ${volChange > 0 ? '+' : ''}${volChange.toFixed(0)}% relative to the 30-day average. ${volChange > 50 ? 'This is unusually high volume — often accompanies breakouts, capitulation events or major news. Price moves on high volume tend to be more sustained.' : volChange > 20 ? 'Above-average volume suggests genuine participation behind the current price action.' : volChange < -30 ? 'Volume is well below normal — price moves in thin conditions are less reliable and more prone to reversal.' : 'Volume is in a normal range — no unusual activity to flag.'}`
        : btcVolPct != null ? `Bitcoin currently accounts for ${btcVolPct.toFixed(1)}% of eligible spot turnover across tracked exchanges. ${btcVolPct > 55 ? 'BTC dominates trading volume — capital is concentrated in Bitcoin rather than spread across altcoins.' : btcVolPct < 40 ? 'BTC share is below 40% — altcoin trading volume is relatively high, suggesting broad market participation.' : 'BTC share is in a normal range relative to altcoins.'} The volume-vs-average comparison is not yet available; it requires multiple daily snapshots.`
        : 'Volume data is not available. The market-streams engine has not produced a spot volume comparison for the last 24 hours. This feed is refreshed every 15 minutes; if it remains unavailable, the upstream exchange data source may be down.',
      source: 'spot volume shares', asOf: vol24?.asOf },
    // 4. Taker buy/sell ratio
    { title: 'Taker ratio', value: takerItem?.value || 'Unavailable', to: 'institutional',
      definition: 'The ratio of aggressive buy orders to aggressive sell orders on derivatives exchanges. "Takers" are traders who hit the ask (buy) or bid (sell) with market orders. A ratio above 1.0 means buyers are more aggressive; below 1.0 means sellers dominate.',
      what: takerItem ? `Taker buy/sell ratio: ${takerItem.value}. Signal: ${takerItem.signal || 'N/A'}.` : 'Unavailable.',
      commentary: takerItem
        ? `The taker buy/sell ratio measures aggressive market orders. ${takerItem.value} — ${/bullish/i.test(takerItem.signal) ? 'buyers are dominating, which typically signals near-term upward pressure' : /bearish/i.test(takerItem.signal) ? 'sellers are dominating, suggesting near-term downward pressure' : 'the ratio is balanced — neither side is clearly dominant'}. This is sourced from OKX derivatives data and reflects institutional-grade order flow.`
        : 'Taker buy/sell ratio is not available. This metric is sourced from OKX derivatives data, which is fetched during the engine snapshot refresh. If the OKX API is unreachable or the engine snapshot has not run recently, this reading will be missing. Ask Albert to refresh or check the Engine & Evidence screen.',
      source: takerItem?.source || 'OKX derivatives', asOf: takerItem?.as_of || takerItem?.asOf },
    // 5. Bear scenario price
    { title: 'Bear scenario', value: bearPrice != null ? `${money(bearPrice)}` : band?.lowerPct != null ? signed(band.lowerPct) : 'Unavailable', to: 'scenarios',
      definition: 'The absolute BTC price in the 20th-percentile downside scenario over 7 days. This is the dollar level where only 20% of modelled outcomes were worse — a useful risk-planning threshold for position sizing and stop placement.',
      what: bearPrice != null ? `7d bear scenario price: ${money(bearPrice)} (${signed(lowerPct)} from current).` : 'Unavailable.',
      commentary: bearPrice != null
        ? `In the 20th-percentile bear scenario, BTC would be trading around ${money(bearPrice)} in 7 days — that is ${signed(lowerPct)} from the current price of ${money(basePrice)}. This is the price level where only 20% of historical scenarios resulted in a worse outcome. It serves as a risk planning threshold, not a prediction.`
        : 'The bear scenario price could not be computed. This requires both a live BTC price and a completed scenario evaluation. Either the ticker feed or the scenario engine is not returning data. Check the 7d downside and BTC spot items above for specifics.',
      source: 'scenario-outlooks/preview', asOf: outlook?.baseline?.observedAt },
    // 6. Invalidation level (nearest support)
    { title: 'Support', value: dsZone?.price ? money(dsZone.price) + ` (${signed(-dsZone.distance_pct)})` : 'Unavailable', to: 'market-intel',
      definition: 'The nearest technical support level from the daily-close chart analysis. Support is a price zone where historical buying interest has been strong enough to arrest declines. A break below support can trigger accelerated selling.',
      what: dsZone?.price ? `Nearest support: ${money(dsZone.price)}, ${dsZone.distance_pct}% below current price.` : 'Unavailable.',
      commentary: dsZone?.price
        ? `The nearest technical support level is at ${money(dsZone.price)}, which is ${dsZone.distance_pct}% below the current price. ${dsZone.distance_pct < 3 ? 'Price is very close to this support — a break below could trigger stop-loss cascades and accelerate the move.' : dsZone.distance_pct < 8 ? 'There is a reasonable buffer above support, but it is still within a normal daily range.' : 'Support is relatively far away, suggesting the current price has room to consolidate.'} This level is derived from the daily-close chart analysis in the core snapshot.`
        : 'Support level data is not available. The core daily snapshot has not run recently, or the chart analysis did not identify a nearby support zone. This data is refreshed during the daily compute cycle.',
      source: 'chart analysis', asOf: d?.created_at },
    // 7. ETF net flow
    { title: 'ETF flow', value: net == null ? 'Unavailable' : `${signed(net, 'm')} · ${etf?.latest_date ? etf.latest_date.slice(5) : ''}`, to: 'institutional',
      definition: 'The net inflow or outflow of capital into US-listed Bitcoin spot ETFs on the most recent reporting day. Positive means money is flowing in (buying pressure); negative means redemptions (selling pressure). Data is typically delayed by one business day.',
      what: net == null ? 'Unavailable.' : `Net flow ${signed(net, 'm USD')} for ${etf?.latest_date || ''}.`,
      commentary: net != null
        ? `Bitcoin spot ETFs saw a net ${net > 0 ? 'inflow' : 'outflow'} of ${signed(net, 'm USD')} on ${etf?.latest_date || 'the most recent reporting day'}. ${Math.abs(net) > 500 ? 'This is a very large flow — significant institutional conviction in one direction.' : Math.abs(net) > 200 ? 'A meaningful flow that reflects active institutional positioning.' : Math.abs(net) < 50 ? 'A relatively quiet day for ETF flows — no strong signal.' : 'A moderate flow.'} ETF data is typically delayed by one trading day.`
        : 'ETF flow data is not available. The ETF report source has not published data recently, or the feed is unreachable. ETF flow data is updated daily after US market close and is typically delayed by one business day.',
      source: etf?.source || 'ETF report', asOf: etf?.latest_date },
    // 8. Funding rate
    { title: 'Funding', value: fundingItem?.value || 'Unavailable', to: 'institutional',
      definition: 'The periodic payment between long and short holders of Bitcoin perpetual futures contracts. When positive, longs pay shorts (bullish crowding); when negative, shorts pay longs (bearish crowding). Extreme rates often precede mean-reversion moves.',
      what: fundingItem ? `Perpetual funding rate: ${fundingItem.value}. Signal: ${fundingItem.signal || 'N/A'}.` : 'Unavailable.',
      commentary: fundingItem
        ? `The perpetual futures funding rate is ${fundingItem.value}. ${/bullish/i.test(fundingItem.signal) ? 'A positive funding rate means longs are paying shorts — the market is net long and willing to pay for it.' : /bearish/i.test(fundingItem.signal) ? 'A negative funding rate means shorts are paying longs — bearish positioning dominates.' : 'The rate is near neutral — no strong leverage bias.'} Extreme funding rates (above 0.05% or below -0.03%) often precede mean-reversion moves.`
        : 'Funding rate data is not available. This is sourced from OKX perpetual futures during the engine snapshot refresh. If OKX is unreachable or the snapshot has not refreshed recently, this reading will be missing.',
      source: fundingItem?.source || 'OKX derivatives', asOf: fundingItem?.as_of || fundingItem?.asOf },
    // 9. Halving progress
    { title: 'Halving', value: halvingPct != null ? `${halvingPct.toFixed(0)}% · ${cycle.phase}` : 'Unavailable', to: 'market-intel',
      definition: 'How far through the current Bitcoin halving cycle we are. Bitcoin halves its block reward roughly every 4 years, reducing new supply. Historically, the 12–18 months after a halving have seen the strongest price appreciation.',
      what: halvingPct != null ? `Halving cycle ${halvingPct.toFixed(1)}% complete. Phase: ${cycle.phase}. ${cycle.days_since_halving}d since halving.` : 'Unavailable.',
      commentary: halvingPct != null
        ? `The current halving cycle is ${halvingPct.toFixed(1)}% complete (${cycle.days_since_halving} days since the last halving). The cycle phase is "${cycle.phase}". ${halvingPct < 25 ? 'Early in the cycle — historically, the first year after a halving has seen gradual price appreciation as reduced supply takes effect.' : halvingPct < 50 ? 'Mid-cycle — this is historically when the most explosive price appreciation occurs.' : halvingPct < 75 ? 'Entering the mature phase of the cycle — historically where cycle tops have formed.' : 'Late cycle — historically a period of distribution and eventual correction before the next halving.'}`
        : 'Halving cycle data is not available. The core daily snapshot has not run, or the block height data from mempool.space was not retrieved. This is computed from the Bitcoin block reward schedule.',
      source: 'mempool.space', asOf: d?.created_at },
    // 10. BTC dominance
    { title: 'BTC dom.', value: num(d?.dominance?.dominance) != null ? `${num(d.dominance.dominance).toFixed(1)}%${num(d.dominance.change_7d) != null ? ` · ${signed(d.dominance.change_7d, ' pts')}` : ''}` : 'Unavailable', to: 'crossmarket',
      definition: 'Bitcoin market cap as a percentage of total crypto market cap. Rising dominance typically means capital is rotating out of altcoins into BTC (risk-off); falling dominance suggests an "altcoin season" where smaller coins outperform.',
      what: num(d?.dominance?.dominance) != null ? `BTC dominance ${num(d.dominance.dominance).toFixed(2)}%.` : 'Not reported.',
      commentary: num(d?.dominance?.dominance) != null
        ? `Bitcoin's market cap dominance is ${num(d.dominance.dominance).toFixed(1)}%${num(d.dominance.change_7d) != null ? `, having moved ${signed(d.dominance.change_7d, ' percentage points')} over the past 7 days` : ''}. ${num(d.dominance.dominance) > 55 ? 'Dominance above 55% typically indicates a risk-off environment where capital is rotating from altcoins into BTC.' : num(d.dominance.dominance) < 45 ? 'Low dominance suggests an active altcoin season — capital is spreading across the broader market.' : 'Dominance is in the mid-range — no extreme rotation signal.'}`
        : 'BTC dominance data is not available. This is sourced from CoinGecko during the daily core snapshot. If the CoinGecko API is unreachable or the snapshot has not run, this reading will be missing.',
      source: 'CoinGecko', asOf: d?.created_at },
    // 11. Altcoin breadth
    { title: 'Alt breadth', value: breadth?.altsWithReturns > 0 ? `${breadth.altsBeatingBtc}/${breadth.altsWithReturns} beat BTC` : 'Unavailable', to: 'market-intel',
      definition: 'How many tracked altcoins are outperforming BTC over the assessment period. High breadth (most alts beating BTC) signals broad risk appetite; low breadth (few alts keeping up) signals a narrow, BTC-dominated market.',
      what: breadth?.altsWithReturns > 0 ? `${breadth.altsBeatingBtc} of ${breadth.altsWithReturns} altcoins beat BTC.` : 'Unavailable.',
      commentary: breadth?.altsWithReturns > 0
        ? `${breadth.altsBeatingBtc} out of ${breadth.altsWithReturns} tracked altcoins are outperforming BTC. ${breadth.altsBeatingBtc / breadth.altsWithReturns > 0.6 ? 'A majority of alts are beating BTC — this is a broad-based rally, suggesting genuine risk appetite across the market.' : breadth.altsBeatingBtc / breadth.altsWithReturns < 0.3 ? 'Very few alts are keeping up with BTC — this is a narrow, BTC-led move. Capital is concentrated, not distributed.' : 'Breadth is moderate — a mixed market with no clear leadership rotation.'}`
        : 'Altcoin breadth data is not available. The phase assessment engine (part of market-streams) has not produced a breadth reading. This is refreshed every 15 minutes and requires data from multiple altcoin pairs.',
      source: 'phase assessment', asOf: phase?.assessedAt },
    // 12. Market stance
    { title: 'Stance', value: sop?.market?.regime ? titleCase(sop.market.regime) : 'Unavailable', to: 'briefing',
      definition: 'The engine regime classification (Bull, Bear, or Range) based on the combined weight of price action, trend indicators, volume and market structure. This classification directly affects how the strategy engine sizes entries and manages risk.',
      what: claim?.text || (sop?.market?.regime ? `Regime: ${titleCase(sop.market.regime)}.` : 'Unavailable.'),
      commentary: sop?.market?.regime
        ? `Albert's current market regime classification is "${titleCase(sop.market.regime)}". ${claim?.text ? `The briefing summary: ${claim.text}` : ''} ${sop.market.regime === 'BULL' ? 'In a bull regime, the engine favours long entries and tighter take-profits.' : sop.market.regime === 'BEAR' ? 'In a bear regime, the engine is cautious on new entries and widens stop-losses.' : sop.market.regime === 'RANGE' ? 'In a range regime, the engine looks for mean-reversion setups within the identified band.' : 'The regime classification informs how the strategy engine sizes and times entries.'}`
        : 'Market stance is not available. The state-of-play engine has not produced a regime classification. This requires a completed core daily snapshot with sufficient market data. Ask Albert to refresh or wait for the next scheduled cycle.',
      source: 'canonical regime', asOf: sop?.market?.asOf || sop?.generatedAt },
    // 13. Forecast performance
    { title: 'Forecasts', value: forecastPerf, to: 'scenario-evaluation',
      definition: 'The prediction ledger tracks how accurate the engine forecasts have been. Each forecast is graded when its maturity date arrives by comparing the predicted direction against actual price. This is the primary measure of model reliability.',
      what: accuracy != null ? `${accuracy.toFixed(0)}% accuracy, ${graded} graded.` : 'Unavailable.',
      commentary: accuracy != null
        ? `The prediction ledger has graded ${graded} forecast(s) with an overall accuracy of ${accuracy.toFixed(0)}%. ${accuracy >= 70 ? 'This is strong performance — the model is demonstrating consistent predictive ability.' : accuracy >= 55 ? 'Performance is above chance but not exceptional — the model has some edge, but sizing and risk management matter more than raw accuracy.' : accuracy < 45 ? 'Accuracy is below 50%, which means the model has been less reliable than a coin flip over the graded period. This warrants caution.' : 'Performance is near the 50% baseline — the edge is marginal over this sample.'}`
        : 'Forecast performance data is not available. The prediction ledger has not graded any forecasts yet. Forecasts are graded when their maturity date arrives and closed candle data is available. If the ledger engine has not run, ask Albert to refresh.',
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

const Explanation = ({ item, onNav, onEvidence }) => <div className="space-y-4 text-sm leading-relaxed text-slate-200">
  {/* What is this metric? */}
  {item.definition && (
    <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 px-3.5 py-2.5">
      <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">What is {item.title}?</p>
      <p className="text-[13px] leading-relaxed text-slate-300">{item.definition}</p>
    </div>
  )}
  {/* Albert's commentary — the main value of the popup */}
  {item.commentary && (
    <div className="rounded-lg border border-violet-800/40 bg-violet-950/30 px-3.5 py-3">
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-violet-400"><Bot className="h-3.5 w-3.5" />Albert's take</p>
      <p className="text-[13px] leading-relaxed text-slate-200">{item.commentary}</p>
    </div>
  )}
  {/* Raw reading */}
  <div>
    <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Current reading</p>
    <p className="text-[13px] text-slate-300">{item.what || 'Not available.'}</p>
  </div>
  {/* Source provenance */}
  <div className="border-t border-slate-700/60 pt-3">
    <p className="text-[11px] text-slate-500">Source: <span className="text-slate-400">{item.source || 'unavailable'}</span> · As of <span className="text-slate-400">{when(item.asOf)}</span></p>
  </div>
  {item.snapshotId && <button type="button" onClick={() => onEvidence(item.snapshotId)} className="flex items-center gap-1.5 text-sm font-semibold text-sky-300 underline"><ShieldCheck className="h-4 w-4" />Open evidence</button>}
  {item.to && <NavigateLink id={TICKER_DEST_MAP[item.to] || (item.to.startsWith('dashboard-') ? item.to : `dashboard-${item.to}`)} onNav={onNav} className="text-sm">Open detailed screen<ArrowUpRight className="h-3.5 w-3.5" /></NavigateLink>}
</div>;

const HomeTicker = ({ d, ticker, snapshot, dashboardStatus, onNav }) => {
  const [item, setItem] = useState(null);
  const [evidenceId, setEvidenceId] = useState(null);
  const isUpdating = dashboardStatus === 'loading' || dashboardStatus === 'computing';
  // Show "Updating…" instead of "Unavailable" when either:
  // 1. Dashboard is explicitly loading/computing, OR
  // 2. We haven't received any dashboard data yet (initial load — d is empty/null)
  const noDataYet = !d || (!d.decision && !d.risk && !d.dominance && !d.cycle);
  const items = TickerContent({ d, ticker, snapshot }).map(entry =>
    (isUpdating || noDataYet) && entry.value === 'Unavailable'
      ? { ...entry, value: 'Updating\u2026' }
      : entry
  );
  const close = () => setItem(null);
  return <>
    <div aria-label="Market snapshot ticker" className="order-last flex w-full shrink-0 items-center justify-between gap-0 overflow-x-auto [scrollbar-width:thin] xl:order-none xl:min-w-0 xl:w-auto xl:flex-1 xl:shrink">
      {items.map((entry, index) => <button type="button" key={entry.title} onClick={() => setItem(index)} aria-label={`${entry.title}: ${entry.value}`}
        className="flex min-h-9 shrink-0 flex-col justify-center whitespace-nowrap rounded-md border border-transparent px-1 text-left hover:border-sky-500/40 hover:bg-slate-800/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{entry.title}</span>
        <span className={`text-xs font-bold ${entry.value === 'Updating\u2026' ? 'animate-pulse text-slate-400' : 'text-white'}`}>{entry.value}</span>
      </button>)}
    </div>
    {item != null && <ModalShell title={items[item].title} onClose={close} className="max-w-xl">
      <Explanation item={items[item]} onNav={(id) => { close(); onNav(id); }} onEvidence={(sid) => { close(); setEvidenceId(sid); }} />
    </ModalShell>}
    {evidenceId && <EvidenceDrawer snapshotId={evidenceId} onClose={() => setEvidenceId(null)} />}
  </>;
};

/* ── Card chrome ── */
import { useCardSize } from './DraggableGrid';
const DashboardCard = ({ cardId, title, icon: Icon, status, summary, freshness, children, onOpen, onAsk, detail }) => {
  const size = useCardSize(cardId);
  const compact = size === 'compact';
  return <article
    onClick={(e) => { if (!e.target.closest('button, a')) onOpen(); }}
    className={`flex h-full min-w-0 cursor-pointer flex-col rounded-lg border border-slate-700/80 bg-slate-900/80 p-3 shadow-sm shadow-black/20 ${compact ? '' : 'xl:min-h-[195px]'}`}>
    <div className="flex min-h-5 items-center gap-1.5">
      <Icon className="h-4 w-4 shrink-0 text-sky-300" />
      <h2 className="min-w-0 truncate text-[13px] font-bold text-white" title={title}><button id={`home-card-${cardId}`} type="button" onClick={onOpen} className="max-w-full truncate text-left hover:text-sky-200 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">{title}</button></h2>
      {status && <span className={`ml-auto shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-bold ${['stale', 'error', 'unavailable'].includes(String(status).toLowerCase()) ? 'bg-amber-500/15 text-amber-200' : 'bg-sky-500/10 text-sky-200'}`}>{titleCase(status)}</span>}
    </div>
    {!compact && <p className="mt-1 text-xs leading-snug text-slate-300">{summary}</p>}
    {!compact && <div className="mt-1 min-h-0 flex-1 text-xs leading-snug text-slate-200">{children}</div>}
    <div className={`${compact ? 'mt-1' : 'mt-1'} flex shrink-0 items-center gap-2 border-t border-slate-800 pt-1.5 text-xs`}>
      <span className="min-w-0 flex-1 truncate text-[11px] text-slate-400" title={freshness}>{freshness || ''}</span>
      {!compact && <button type="button" onClick={onAsk} className="shrink-0 rounded-sm p-0.5 text-sky-300 hover:text-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"><Sparkles className="h-3.5 w-3.5" /></button>}
      <button type="button" onClick={onOpen} className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-sky-300 hover:text-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">{compact ? 'Open' : (detail || 'Open details')}<ArrowUpRight className="h-3.5 w-3.5" /></button>
    </div>
  </article>;
};

/* ── Home ── */
const BRIEF_COLLAPSED_KEY = 'albert-brief-collapsed';

const OneScreenHome = ({ d, dashboardStatus = 'loading', ticker, news, newsStatus, snapshot, onNav }) => {
  const [chart, setChart] = useState(null);
  const [selected, setSelected] = useState(null);
  /* ── Brief collapse (desktop) ── */
  const [briefCollapsed, setBriefCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try { return localStorage.getItem(BRIEF_COLLAPSED_KEY) === '1'; } catch { return false; }
  });
  const toggleBriefCollapsed = useCallback(() => {
    setBriefCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(BRIEF_COLLAPSED_KEY, next ? '1' : '0'); } catch {}
      return next;
    });
  }, []);
  /* ── Mobile brief drawer ── */
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const drawerRef = useRef(null);
  const touchStartY = useRef(null);
  const handleDrawerTouchStart = useCallback((e) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);
  const handleDrawerTouchEnd = useCallback((e) => {
    if (touchStartY.current == null) return;
    const diff = e.changedTouches[0].clientY - touchStartY.current;
    if (diff > 60) setMobileDrawerOpen(false); // swipe down to close
    touchStartY.current = null;
  }, []);
  useEffect(() => {
    const id = typeof window !== 'undefined' ? window.__dashboardReturnCard : null;
    if (!id) return;
    const frame = window.requestAnimationFrame(() => { document.getElementById(`home-card-${id}`)?.focus(); window.__dashboardReturnCard = null; });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const [evidenceId, setEvidenceId] = useState(null);
  const { sop, paper, outlook, eth, streams, driver, etf, whales, network, sentiment, brief, health } = snapshot;
  /* ── Fetch active scenario lifecycle data ── */
  const [activeScenario, setActiveScenario] = useState(null);
  useEffect(() => {
    fetch(`${API_BASE}/v1/btc-scenario`, { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.scenarios?.length) setActiveScenario(d); })
      .catch(() => {});
  }, [dashboardStatus]); // re-fetch when dashboard refreshes
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
  const isUpdating = dashboardStatus === 'computing' || dashboardStatus === 'loading';

  /* ── Commentary builders ── */
  const briefCommentary = isUpdating ? 'Albert is updating the market assessment…' : (briefTake || directionClaim?.text || 'Market assessment is loading.');

  const paperCommentary = (() => {
    if (!totals?.value) return 'Paper trading wallet is loading or unavailable.';
    const start = num(totals.startingCash);
    const current = num(totals.value);
    const pnl = num(totals.pnlUsd);
    const pnlP = num(totals.pnlPct);
    if (start == null || current == null) return 'Portfolio summary unavailable.';
    const status = pnl == null ? 'flat' : Math.abs(pnl) < 0.01 ? 'flat' : pnl > 0 ? 'in profit' : 'at a loss';
    const amt = pnl != null ? `, ${pnl >= 0 ? '+' : ''}${money(pnl, 2)} (${signed(pnlP)})` : '';
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

  /* ── Brief card content (shared between desktop aside & mobile drawer) ── */
  const briefCardContent = (
    <article onClick={(e) => { if (!e.target.closest('button, a')) open('brief'); }}
      className="flex min-w-0 cursor-pointer flex-col rounded-lg border border-violet-500/30 bg-gradient-to-b from-slate-900 via-slate-900/95 to-slate-950 p-3 shadow-sm shadow-black/20">
      <div className="flex min-h-5 items-center gap-1.5">
        <Sparkles className="h-4 w-4 shrink-0 text-violet-400" />
        <h2 className="min-w-0 truncate text-[13px] font-bold text-white"><button id="home-card-brief" type="button" onClick={() => open('brief')} className="max-w-full truncate text-left hover:text-violet-200 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">Albert's Brief</button></h2>
        {health?.sop && <span className={`ml-auto shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-bold ${['stale', 'error', 'unavailable'].includes(String(health.sop).toLowerCase()) ? 'bg-amber-500/15 text-amber-200' : 'bg-violet-500/15 text-violet-200'}`}>{titleCase(health.sop)}</span>}
      </div>
      {/* V2 structured brief card */}
      {brief?.version === 'v2' && brief?.brief ? (() => {
        const b = brief.brief;
        const dashSecs = (b.dashboard_section_ids || []).map(id => (b.sections || []).find(s => s.id === id)).filter(Boolean).slice(0, 5);
        const convC = (b.conviction || '').toLowerCase() === 'high' ? 'text-emerald-400' : (b.conviction || '').toLowerCase() === 'low' ? 'text-red-400' : 'text-amber-400';
        const callC = (b.market_call || '').toLowerCase().includes('bull') ? 'text-emerald-400' : (b.market_call || '').toLowerCase().includes('bear') ? 'text-red-400' : 'text-amber-400';
        return (
          <div className="mt-2 flex-1 space-y-2 text-xs leading-snug">
            <p className="text-[14px] font-bold leading-tight text-white">{b.headline}</p>
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-bold ${callC}`}>{b.market_call}</span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${convC}`}>{b.conviction}</span>
            </div>
            <p className="text-[12px] leading-relaxed text-slate-300">{b.executive_summary}</p>
            {dashSecs.map((sec) => {
              const dl = sectionDeepLink(sec);
              return (
              <div key={sec.id} className="border-t border-slate-800 pt-1.5">
                <div className="flex items-center gap-1.5">
                  <p className="flex-1 text-[11px] font-semibold text-white">{sec.title}</p>
                  {dl && <button type="button" onClick={(e) => { e.stopPropagation(); onNav(dl.route); }}
                    className="shrink-0 text-[10px] font-semibold text-violet-300/70 hover:text-violet-200">{dl.label} ↗</button>}
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{sec.dashboard_summary}</p>
              </div>
            );})}
          </div>
        );
      })() : (
        /* V1 legacy card content */
        <>
          <p className="mt-1.5 text-xs leading-snug text-slate-300">{briefCommentary}</p>
          <div className="mt-2 flex-1 space-y-2.5 text-xs leading-snug text-slate-200">
            <div>
              {briefChanges[0]?.detail && <p><b>Since last visit:</b> {briefChanges[0].detail}</p>}
              {leadershipClaim?.text && <p className="mt-0.5"><b>Drivers:</b> {leadershipClaim.text}</p>}
              {secondReason?.text && <p className="mt-0.5 text-slate-400">{secondReason.text}</p>}
            </div>
            <div className="border-t border-slate-800 pt-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Portfolio</p>
              <p className="mt-0.5">{portfolioClaim?.text || (pnlVal != null ? `${pnlLabel}: ${pnlVal >= 0 ? '+' : ''}${money(pnlVal, 2)} (${signed(totals?.pnlPct)}) on ${money(totals?.value, 2)} portfolio` : 'Unavailable')}</p>
            </div>
            <div className="border-t border-slate-800 pt-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Evidence & Engines</p>
              <p className="mt-0.5 text-slate-300">{evidenceCommentary}</p>
              <NavigateLink id="dashboard-evidence" onNav={onNav} className="mt-0.5 text-[11px]">Full evidence & engines<ArrowUpRight className="h-3 w-3" /></NavigateLink>
            </div>
            <div className="border-t border-slate-800 pt-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Opportunity Radar</p>
              {findings.length ? findings.map((f, i) => <div key={f.findingId || i} className="mt-0.5">
                <p>{f.hypothesis || f.title || 'Untitled'}</p>
                {(f.confirmIf || f.invalidateIf || f.resolveBy) && <p className="text-[11px] text-slate-400">{f.confirmIf ? `Confirm: ${f.confirmIf}` : f.invalidateIf ? `Invalidate: ${f.invalidateIf}` : `Resolve by: ${f.resolveBy}`}</p>}
              </div>) : <p className="text-slate-400">No open setups</p>}
              <NavigateLink id="dashboard-radar" onNav={onNav} className="mt-0.5 text-[11px]">Full opportunity radar<ArrowUpRight className="h-3 w-3" /></NavigateLink>
            </div>
          </div>
        </>
      )}
      <div className="mt-2 flex shrink-0 items-center gap-2 border-t border-slate-800 pt-2 text-xs">
        <span className="min-w-0 flex-1 truncate text-[11px] text-slate-400">{last('Regime', claimTime)}</span>
        <button type="button" onClick={() => ask('brief', "Albert's Brief", briefCommentary, 'State of Play', claimTime)} className="shrink-0 rounded-sm p-0.5 text-violet-300 hover:text-violet-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"><Sparkles className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={() => onNav('albert-brief')} className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-violet-300 hover:text-violet-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">Full Brief<ArrowUpRight className="h-3.5 w-3.5" /></button>
      </div>
    </article>
  );

  /* ── Brief peek text for collapsed tab & mobile bar ── */
  const briefPeek = (() => {
    if (brief?.version === 'v2' && brief?.brief) {
      const b = brief.brief;
      const callC = (b.market_call || '').toLowerCase().includes('bull') ? 'text-emerald-400' : (b.market_call || '').toLowerCase().includes('bear') ? 'text-red-400' : 'text-amber-400';
      return { label: b.market_call || 'Brief', className: callC, summary: b.headline || '' };
    }
    const dirText = directionClaim?.text || '';
    const isBull = /bullish/i.test(dirText);
    const isBear = /bearish/i.test(dirText);
    return { label: isBull ? 'Bullish' : isBear ? 'Bearish' : 'Neutral', className: isBull ? 'text-emerald-400' : isBear ? 'text-red-400' : 'text-amber-400', summary: dirText.slice(0, 80) };
  })();

  return <>
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <h1 className="text-base font-bold text-white">Your market at a glance</h1>
      <button type="button" onClick={snapshot.refresh} aria-label="Refresh" className="ml-auto rounded-md border border-slate-700 p-1.5 text-slate-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"><RefreshCw className="h-4 w-4" /></button>
    </div>
    <div className={`grid min-w-0 gap-3 lg:items-start ${briefCollapsed
      ? 'lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_350px]'
      : 'lg:grid-cols-[300px_minmax(0,1fr)_280px] xl:grid-cols-[320px_minmax(0,1fr)_320px] 2xl:grid-cols-[340px_minmax(0,1fr)_350px]'}`}>
      {/* ── Albert's Brief — desktop left column ── */}
      {!briefCollapsed ? (
        <aside className="hidden min-w-0 lg:sticky lg:top-14 lg:block lg:max-h-[calc(100vh-4.5rem)] lg:overflow-y-auto lg:rounded-lg [scrollbar-width:thin]">
          <div className="mb-1.5 flex justify-end">
            <button type="button" onClick={toggleBriefCollapsed} title="Collapse brief"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200">
              <PanelLeftClose className="h-3.5 w-3.5" />Hide
            </button>
          </div>
          {briefCardContent}
        </aside>
      ) : (
        /* Collapsed: slim expand tab on desktop */
        <div className="fixed left-1 top-1/2 z-30 hidden -translate-y-1/2 lg:block">
          <button type="button" onClick={toggleBriefCollapsed} title="Show Albert's Brief"
            className="group flex flex-col items-center gap-1.5 rounded-xl border border-violet-500/30 bg-slate-900/95 px-1.5 py-3 shadow-lg shadow-black/30 backdrop-blur-sm transition-all hover:border-violet-400/50 hover:shadow-violet-500/10">
            <PanelLeftOpen className="h-4 w-4 text-violet-400 transition-colors group-hover:text-violet-300" />
            <span className="flex flex-col items-center gap-0.5">
              <Sparkles className="h-3 w-3 text-violet-400" />
              <span className="text-[9px] font-bold text-violet-300 [writing-mode:vertical-lr]">Brief</span>
            </span>
            <span className={`text-[9px] font-bold [writing-mode:vertical-lr] ${briefPeek.className}`}>{briefPeek.label}</span>
          </button>
        </div>
      )}
      {/* ── Draggable cards grid (center) ── */}
      <DraggableGrid className={`grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 ${briefCollapsed ? 'xl:grid-cols-3' : ''}`} excludeIds={['brief']}>
        {/* 2. Paper Trading */}
        <DashboardCard cardId="paper" title="Paper Trading" icon={Wallet} status={health?.paper} summary={paperCommentary} freshness={last('Ledger', paper?.asOf)} onAsk={() => ask('paper', 'Paper Trading', paperCommentary, 'Paper ledger', paper?.asOf)} onOpen={() => open('paper')}>
          <p className="line-clamp-1"><b>Value:</b> {money(totals?.value, 2)} · <b>Total P&L:</b> {pnlVal != null ? `${pnlVal >= 0 ? '+' : ''}${money(pnlVal, 2)} (${signed(totals?.pnlPct)})` : 'unavailable'}</p>
          {entries.length ? entries.map((e, i) => <p key={e.ledgerEventId || i} className="mt-0.5 truncate">{e.side === 'BUY' ? 'Bought' : 'Sold'} {e.qty} {e.asset} @ {money(e.fillPx, 2)}</p>) : <p className="mt-1 text-slate-400">No completed trades</p>}
        </DashboardCard>
        {/* 3. Portfolio & Risk */}
        <DashboardCard cardId="portfolio" title="Portfolio & Risk" icon={ShieldAlert} status={health?.paper} summary={portfolioCommentary} freshness={last('Ledger', paper?.asOf)} onAsk={() => ask('portfolio', 'Portfolio & Risk', portfolioCommentary, 'Paper ledger', paper?.asOf)} onOpen={() => open('portfolio')}>
          {positions.length > 0 && <p className="line-clamp-1">{positions.slice(0, 3).map((p) => `${p.asset} ${num(p.currentPrice) != null && num(p.netQuantity) != null && num(totals?.value) > 0 ? pct(num(p.currentPrice) * num(p.netQuantity) / num(totals.value) * 100) : ''}`).join(' · ')}</p>}
          {paper?.openRiskAvailable && <p className="mt-0.5 line-clamp-1 text-slate-400">Risk: {pct(paper.openRiskPct)} / {pct(paper.openRiskLimitPct)} limit</p>}
        </DashboardCard>
        {/* 4. BTC Scenario Tracker */}
        <DashboardCard cardId="btc" title="BTC Scenario Tracker" icon={GitBranch} status={health?.outlook} summary={btcCommentary} freshness={last('Candle', outlook?.baseline?.observedAt)} onAsk={() => ask('btc', 'BTC Scenario Tracker', btcCommentary, 'Scenario outlooks', outlook?.baseline?.observedAt)} onOpen={() => open('btc')} detail="Scenarios">
          <BTCScenarioTracker compact={true} />
        </DashboardCard>
        {/* 5. Market Intelligence */}
        <DashboardCard cardId="intelligence" title="Market Intelligence" icon={BarChart3} status={health?.driver} summary={intelCommentary} freshness={last('Driver', driver?.asOf)} onAsk={() => ask('intelligence', 'Market Intelligence', intelCommentary, 'Market driver', driver?.asOf)} onOpen={() => open('intelligence')}>
          {focusableChart('market', 'BTC/ETH', <MarketChart btc={outlook} eth={eth} />)}
          <p className="truncate text-[11px] text-slate-300">{returns} · breadth {phase?.inputs?.altsWithReturns > 0 ? `${phase.inputs.altsBeatingBtc}/${phase.inputs.altsWithReturns}` : '?'}</p>
        </DashboardCard>
        {/* 6. News, Macro & Policy */}
        <DashboardCard cardId="news" title="News, Macro & Policy" icon={Newspaper} status={newsStatus} summary={newsCommentary} freshness={last(story?.source || 'News', story?.published)} onAsk={() => ask('news', 'News, Macro & Policy', newsCommentary, story?.source || 'News', story?.published)} onOpen={() => open('news')}>
          <div className="flex items-center gap-1">
            {paperNews.length > 0 && <span className="text-[10px] text-slate-500">{paperNews.length} stories</span>}
            <NewsStaleBadge stale={news?.stale} ageMinutes={news?.age_minutes} />
          </div>
          {paperNews.slice(1, 3).map((item, i) => <p key={item.id || i} className="mt-0.5 line-clamp-1"><b>{i + 1}.</b> {item.title}</p>)}
          {nextEvent?.title && <p className="mt-1 truncate text-slate-400">Next event: {nextEvent.title}{nextEvent.date ? ` · ${nextEvent.date}` : ''}</p>}
          <FeedHealthRow />
        </DashboardCard>
        {/* 7. On-Chain & Flows */}
        <DashboardCard cardId="flows" title="On-Chain & Flows" icon={Waves} status={health?.etf} summary={flowsCommentary} freshness={last(etf?.source || 'ETF / Whale', etf?.latest_date || whales?.as_of)} onAsk={() => ask('flows', 'On-Chain & Flows', flowsCommentary, 'ETF + Whale feeds', etf?.latest_date)} onOpen={() => open('flows')}>
          <p className="line-clamp-1">ETF: {etf?.net_1d != null ? `${signed(etf.net_1d, 'm USD')} · ${etf.latest_date || ''}` : 'unavailable'}</p>
          {network?.hashrate_ehs != null && <p className="mt-0.5 line-clamp-1 text-slate-400">Hashrate: {network.hashrate_ehs} EH/s{sentiment?.value != null ? ` · sentiment ${sentiment.value}/100` : ''}</p>}
        </DashboardCard>
      </DraggableGrid>
      <DashboardAskPanel selected={selected} onNav={onNav} onEvidence={setEvidenceId} stateId={sop?.stateId} />
    </div>

    {/* ── Mobile Brief Drawer ── */}
    {/* Peek bar: fixed bottom bar on mobile only */}
    {!mobileDrawerOpen && (
      <button type="button" onClick={() => setMobileDrawerOpen(true)}
        className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 border-t border-violet-500/30 bg-slate-900/95 px-4 py-2.5 backdrop-blur-md lg:hidden"
        aria-label="Open Albert's Brief">
        <Sparkles className="h-4 w-4 shrink-0 text-violet-400" />
        <span className="text-[12px] font-bold text-white">Albert's Brief</span>
        <span className={`text-[11px] font-bold ${briefPeek.className}`}>· {briefPeek.label}</span>
        {briefPeek.summary && <span className="min-w-0 flex-1 truncate text-[11px] text-slate-400">{briefPeek.summary}</span>}
        <ChevronUp className="h-4 w-4 shrink-0 text-violet-400" />
      </button>
    )}
    {/* Drawer overlay: slides up from bottom on mobile */}
    {mobileDrawerOpen && (
      <div className="fixed inset-0 z-50 flex flex-col lg:hidden">
        {/* Backdrop */}
        <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={() => setMobileDrawerOpen(false)} />
        {/* Drawer sheet */}
        <div ref={drawerRef} onTouchStart={handleDrawerTouchStart} onTouchEnd={handleDrawerTouchEnd}
          className="max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-violet-500/30 bg-slate-950 shadow-2xl shadow-black/50 [scrollbar-width:thin]"
          style={{ animation: 'slideUp 0.25s ease-out' }}>
          {/* Grab handle */}
          <div className="sticky top-0 z-10 flex items-center justify-center bg-slate-950/95 px-4 pb-1 pt-3 backdrop-blur-sm">
            <div className="h-1 w-8 rounded-full bg-slate-600" />
          </div>
          {/* Header bar */}
          <div className="flex items-center gap-2 px-4 pb-2">
            <Sparkles className="h-4 w-4 text-violet-400" />
            <span className="text-[13px] font-bold text-white">Albert's Brief</span>
            <span className={`text-[11px] font-bold ${briefPeek.className}`}>{briefPeek.label}</span>
            <button type="button" onClick={() => setMobileDrawerOpen(false)} className="ml-auto rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          {/* Brief content */}
          <div className="px-2 pb-6">
            {briefCardContent}
          </div>
        </div>
      </div>
    )}
    <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

    {chart && <ExpandedChart type={chart} outlook={outlook} eth={eth} levels={availableLevels} runAsOf={when(d?.created_at)} onClose={() => setChart(null)} onNav={(id) => onNav(id === 'scenarios' ? 'dashboard-btc' : id === 'crossmarket' ? 'dashboard-intelligence' : id)} onEvidence={(sid) => { setChart(null); setEvidenceId(sid); }} />}
    {evidenceId && <EvidenceDrawer snapshotId={evidenceId} onClose={() => setEvidenceId(null)} />}
  </>;
};

export { HomeTicker, TickerContent, Explanation, NavigateLink, money, signed, pct, when };
export default OneScreenHome;
