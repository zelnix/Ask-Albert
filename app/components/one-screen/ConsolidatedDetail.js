'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, MessageCircle, ShieldCheck, RefreshCw } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import PaperTradingBot from '../PaperTradingBot';
import { BTCChart, MarketChart } from './OneScreenCharts';

// Every area in a grouped Home card has an on-screen data result BEFORE its
// specialist link. Missing or stale sources are stated plainly, never filled in.
export const DASHBOARD_AREAS = {
  brief: { title: 'Albert’s Brief', areas: [['Unified Brief', 'briefing'], ['Evidence & Data Audit', 'dataaudit']] },
  paper: { title: 'Paper Trading', areas: [['Paper Trading', 'paper'], ['Paper Engine', 'paperengine']] },
  portfolio: { title: 'Portfolio & Risk', areas: [['Owner Portfolio', 'paper'], ['Ask Albert Risk', 'risk'], ['Leverage', 'leverage'], ['Event Calendar', 'events'], ['Smart Money', 'smartmoney']] },
  btc: { title: 'BTC Bull & Bear', areas: [['Scenario Outlook', 'scenarios'], ['Scenario Evaluation', 'scenario-evaluation'], ['Forecasts', 'forecasts']] },
  intelligence: { title: 'Market Intelligence', areas: [['Market Overview', 'overview'], ['Forecasts', 'forecasts'], ['Market Intelligence', 'market-intel'], ['Market Drivers', 'drivers'], ['Cross-Market', 'crossmarket'], ['Happening Again (Analogs)', 'analogs']] },
  news: { title: 'News, Macro & Policy', areas: [['News', 'news'], ['Policy & Liquidity', 'macro'], ['Event Calendar', 'events']] },
  evidence: { title: 'Evidence & Engines', areas: [['Performance', 'performance'], ['Paper Engine', 'paperengine'], ['Alert Engine', 'alert-engine'], ['Scenario Evaluation', 'scenario-evaluation'], ['Data Audit', 'dataaudit'], ['App Checkup', 'checkup']] },
  flows: { title: 'On-Chain & Flows', areas: [['ETF Flows', 'etf'], ['Whale Watch', 'whales'], ['Network & Sentiment', 'network'], ['Time Machine', 'timemachine'], ['Institutional Activity', 'institutional']] },
  radar: { title: 'Opportunity Radar', areas: [['Opportunity Research', 'opportunities'], ['Strategy Review', 'strategies'], ['Paper Trade Proposals', 'paper']] },
};

const EMPTY_READS = Object.freeze({});
const EXTRA_READS = {
  brief: EMPTY_READS,
  portfolio: { leverage: '/api/v1/leverage?timeframe=4H' },
  intelligence: { analogs: '/api/v1/analogs?symbol=BTC', crossmarket: '/api/v1/markets?symbol=BTC&window=1y' },
  evidence: { alerts: '/api/v1/alert-engine/recent?limit=5', checkup: '/api/v1/albert/diagnostics/latest' },
  flows: { whales: '/api/v1/whales', network: '/api/v1/network-health', sentiment: '/api/v1/fear-greed', history: '/api/v1/time-machine/analogs?k=3' },
};
const when = (iso) => {
  if (!iso) return 'Publication time unavailable';
  const raw = String(iso);
  if (/^\d{4}-\d\d-\d\d$/.test(raw)) return `Reported date ${raw} (UTC)`;
  const stamp = typeof iso === 'number' || /^\d{10}$/.test(raw) ? Number(iso) * 1000
    : /^\d{4}-\d\d-\d\dT/.test(raw) && !/(Z|[+-]\d\d:?\d\d)$/.test(raw) ? `${raw}Z` : raw;
  const d = new Date(stamp);
  return Number.isNaN(d.getTime()) ? 'Publication time unavailable' : `Published ${d.toLocaleString()}`;
};
const val = (value, suffix = '') => value === null || value === undefined || value === '' ||
  (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') ||
  (typeof value === 'number' && !Number.isFinite(value)) ? null : `${value}${suffix}`;
const evaluationCurrent = (record, health) => {
  if (health === 'stale' || record?.predictiveValidation !== true || !Number(record?.evaluationPoints) || !record?.lastEvaluatedAt) return false;
  const raw = String(record.lastEvaluatedAt);
  const time = new Date(/^\d{4}-\d\d-\d\dT/.test(raw) && !/(Z|[+-]\d\d:?\d\d)$/.test(raw) ? `${raw}Z` : raw).getTime();
  return Number.isFinite(time) && Date.now() >= time && Date.now() - time < 240 * 60 * 60 * 1000;
};
const amount = (value) => value === null || value === undefined || value === '' ||
  !Number.isFinite(Number(value)) ? null : `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const firstText = (...items) => items.find((x) => typeof x === 'string' && x.trim()) || null;
const truncate = (text, length = 210) => text && String(text).length > length ? `${String(text).slice(0, length)}…` : text;
const sourceState = (record, status, asOf, maxHours = 36) => {
  if (status === 'stale') return record ? 'stale' : 'unavailable';
  if (status === 'loading' || status === 'computing') return record ? 'stale' : 'loading';
  if (status === 'error') return record ? 'stale' : 'error';
  if (status === 'unavailable') return record ? 'stale' : 'unavailable';
  if (!record) return 'unavailable';
  if (asOf) {
    const raw = String(asOf);
    const t = new Date(typeof asOf === 'number' || /^\d{10}$/.test(raw) ? Number(asOf) * 1000 : /^\d{4}-\d\d-\d\dT/.test(raw) && !/(Z|[+-]\d\d:?\d\d)$/.test(raw) ? `${raw}Z` : raw).getTime();
    if (Number.isFinite(t) && Date.now() - t > maxHours * 3600000) return 'stale';
  }
  return 'ready';
};
const sourceMetrics = (panel) => panel && !panel.demo && Array.isArray(panel.metrics)
  ? panel.metrics.filter((m) => !m.inactive && m.value != null).slice(0, 4).map((m) => `${m.name}: ${m.value}${m.signal ? ` · ${m.signal}` : ''}`) : [];
const MarketSeries = ({ data }) => Array.isArray(data?.series) && data.series.length > 1 && Array.isArray(data?.assets)
  ? <div className="mt-3 h-52 min-w-0" role="img" aria-label={`Observed ${data.window} cross-market normalized series as of ${data.as_of || 'unavailable'}`}>
    <ResponsiveContainer width="100%" height="100%"><LineChart data={data.series} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
      <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={32} /><YAxis tick={{ fontSize: 10 }} width={38} domain={['auto', 'auto']} />
      <Tooltip /><Legend />{data.assets.slice(0, 4).map((asset, i) => <Line key={asset} name={asset} type="linear" dataKey={asset} stroke={['#fbbf24', '#38bdf8', '#a78bfa', '#34d399'][i]} dot={false} connectNulls={false} isAnimationActive={false} />)}
    </LineChart></ResponsiveContainer></div> : null;

const Area = ({ title, route, facts = [], items = [], note, source, onNav, children, state = 'ready' }) => {
  const blocked = state === 'loading' || state === 'error';
  const usable = blocked ? [] : facts.filter((f) => f?.[1] !== null && f?.[1] !== undefined && f?.[1] !== '');
  const shownItems = blocked ? [] : items.filter(Boolean);
  return <section className="rounded-lg border border-border bg-card p-4 sm:p-5" aria-label={title}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-base font-semibold text-card-foreground">{title}</h2>
      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${['stale', 'error', 'unavailable', 'unverified', 'WAIT', 'Needs changes'].includes(state) ? 'bg-amber-500/15 text-amber-200' : 'bg-primary/10 text-primary'}`}>{state}</span>
    </div>
    {source && <p className="mt-0.5 text-[11px] text-muted-foreground">{source}</p>}
    {state === 'stale' && <p role="status" className="mt-2 text-xs text-amber-200">Last published result only — freshness or the newest read is unavailable. Do not treat these figures as current.</p>}
    {usable.length > 0 && <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {usable.map(([key, value], i) => <div key={`${key}-${i}`} className="rounded-md border border-border bg-muted/30 px-3 py-2">
        <dt className="text-[11px] text-muted-foreground">{key}</dt>
        <dd className="mt-0.5 break-words text-sm font-semibold text-foreground">{truncate(value)}</dd>
      </div>)}
    </dl>}
    {shownItems.length > 0 && <ul className="mt-3 space-y-1.5 text-sm text-foreground">{shownItems.slice(0, 5).map((item, i) => <li key={i} className="rounded-md border border-border bg-muted/20 px-3 py-2">{item && typeof item === 'object' && typeof item.url === 'string' && /^https?:\/\//i.test(item.url)
      ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">{truncate(item.text || item.url)}</a>
      : truncate(item && typeof item === 'object' ? item.text || 'Source unavailable' : item)}</li>)}</ul>}
    {!blocked && children}
    {!usable.length && !shownItems.length && (!children || blocked) && <p role="status" className="mt-3 text-sm text-muted-foreground">{state === 'loading' ? 'Loading this source…' : state === 'error' ? 'This source could not be read. Retry details or open its full screen.' : 'This result is unavailable in the latest published data. No value has been assumed.'}</p>}
    {note && <p className="mt-3 text-xs text-muted-foreground">{note}</p>}
    <button type="button" onClick={() => onNav(route)} className="mt-3 inline-flex items-center gap-1 border-t border-border pt-2 text-xs font-semibold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Open full {title}<ArrowRight className="h-3.5 w-3.5" /></button>
  </section>;
};

export default function ConsolidatedDetail({ kind, snapshot, dashboard, dashboardStatus = 'loading', news, newsStatus, onNav, onBack, symbol = 'BTC' }) {
  const [extra, setExtra] = useState({});
  const [loading, setLoading] = useState(false);
  const [readError, setReadError] = useState(null);
  const [readRevision, setReadRevision] = useState(0);
  const [pollAttempts, setPollAttempts] = useState(0);
  const entry = DASHBOARD_AREAS[kind];
  const readKey = kind === 'brief' ? `${kind}:${symbol}` : kind;
  const requests = useMemo(() => EXTRA_READS[kind] || EMPTY_READS, [kind]);
  useEffect(() => {
    if (loading || !Object.values(extra).some((v) => v?._readState === 'loading') || pollAttempts >= 8) return;
    const timer = setTimeout(() => { setPollAttempts((n) => n + 1); setReadRevision((n) => n + 1); }, 5000);
    return () => clearTimeout(timer);
  }, [extra, pollAttempts, loading]);
  useEffect(() => {
    const controller = new AbortController();
    if (!Object.keys(requests).length) { setExtra({}); setReadError(null); setLoading(false); return () => controller.abort(); }
    setLoading(true); setReadError(null);
    Promise.all(Object.entries(requests).map(async ([key, path]) => {
      try {
        const url = kind === 'brief' && symbol !== 'BTC' ? `${path}?symbol=${encodeURIComponent(symbol)}` : path;
        const r = await fetch(url, { credentials: 'include', cache: 'no-store', signal: controller.signal });
        if (!r.ok) throw new Error(`${key} returned ${r.status}`);
        const json = await r.json();
        if (json?.status && !['ready', 'partial'].includes(json.status)) return [key, { _readState: ['computing', 'preparing'].includes(json.status) ? 'loading' : ['insufficient_data', 'unavailable', 'missing', 'unsupported'].includes(json.status) ? 'unavailable' : 'error' }];
        return [key, json];
      } catch (e) { if (controller.signal.aborted) return [key, null]; return [key, { _readState: 'error' }]; }
    })).then((rows) => {
      if (controller.signal.aborted) return;
      const results = Object.fromEntries(rows);
      setExtra((previous) => {
        const merged = { ...previous, ...results };
        for (const [key, value] of rows) if (value?._readState && previous[key] && !previous[key]._readState) merged[key] = { ...previous[key], _readState: value._readState };
        return merged;
      });
      setReadError(rows.some(([, v]) => v?._readState === 'error') ? 'Some detailed sources could not be read. Previously published values, if available, are marked stale.' : null);
      setLoading(false);
    });
    return () => controller.abort();
  }, [readKey, requests, kind, symbol, readRevision]);

  if (!entry) return null;
  const d = dashboard || {};
  const s = snapshot || {};
  const paper = s.paper || {};
  const totals = paper.totals || {};
  const outlook = s.outlook || {};
  const sop = s.sop || {};
  const sourceTime = when(d.created_at || d.generated_at);
  const paperTime = paper.asOf ? `Owner-scoped paper ledger · read ${when(paper.asOf).replace('Published ', '')} (not a market mark time)` : 'Owner-scoped paper ledger · read time unavailable';
  const publishedState = sourceState(dashboard, dashboardStatus, d.created_at);
  const sopState = sourceState(s.sop, s.health?.sop, sop?.market?.asOf || sop?.generatedAt) === 'ready' && !sop?.market?.asOf ? 'unavailable' : sourceState(s.sop, s.health?.sop, sop?.market?.asOf || sop?.generatedAt);
  const paperState = sourceState(s.paper, s.health?.paper, paper.asOf, 2);
  const outlookState = sourceState(s.outlook, s.health?.outlook, outlook?.baseline?.observedAt, 50) === 'ready' && !outlook?.baseline?.observedAt ? 'unavailable' : sourceState(s.outlook, s.health?.outlook, outlook?.baseline?.observedAt, 50);
  const extraState = (key, stamp, hours = 36) => {
    const result = extra[key];
    if (result?._readState) {
      const old = Object.keys(result).some((x) => x !== '_readState');
      return old ? 'stale' : result._readState === 'loading' && pollAttempts >= 8 ? 'unavailable' : result._readState;
    }
    return result?.status === 'partial' ? 'stale' : sourceState(result, loading && !result ? 'loading' : result?.status || 'unavailable', stamp, hours);
  };
  const rows = [];
  const area = (title, route, opts) => rows.push(<Area key={`${title}-${route}`} title={title} route={route} onNav={onNav} state={publishedState} {...opts} />);
  const knownPaper = paperState === 'ready' && paper.accountResolution?.status === 'RESOLVED' && Number(paper.accountResolution.count) > 0;
  const completePaper = paper.accountResolution?.status === 'RESOLVED' && paper.accountResolution?.rollupComplete === true;
  const displayPaper = knownPaper && completePaper && paperState === 'ready' && paper.totals?.valueAvailable
    && paper.ledgerIntegrity?.status === 'MATCH' && !(paper.strategies || []).some((x) => x.marketData === 'STALE');

  if (kind === 'brief') {
    const claims = sop?.briefing?.claims || [];
    area('Unified Brief', 'briefing', { state: sopState, source: when(sop?.market?.asOf || sop?.generatedAt), facts: [
      ['Market regime', val(d.regime?.label || d.regime?.regime || sop.market?.regime)],
      ['Published assessment', firstText(claims.find((x) => x.claimId === 'briefing.direction')?.text, sop?.briefing?.headline)],
      ['Recorded market changes', val(sop?.changesSinceLastVisit?.length)],
      ['Market snapshot', val(sop.market?.decisionSnapshotId)],
    ], items: claims.slice(0, 4).map((x) => `${x.claimId || 'Claim'}: ${x.text || 'Unavailable'} · ${x.asOf || 'observation time unavailable'}`),
    note: 'These are the stored owner-scoped state-of-play claims and evidence IDs. Viewing this page does not generate a new AI brief.' });
    area('Evidence & Data Audit', 'dataaudit', { state: publishedState === 'ready' && sopState !== 'ready' ? sopState : publishedState, source: `Market run ${sourceTime} · owner state ${when(sop.generatedAt)}`, facts: [
      ['Data-health status', val(d.data_health?.level || sop?.dataQuality?.status)],
      ['Decision evidence', val(sop.market?.decisionSnapshotId || outlook?.decisionSnapshotId)],
      ['Scored inputs', val(d.quant?.score, '/100')],
    ], items: (sop?.dataQuality?.issues || d.data_health?.issues || []).slice(0, 3).map((x) => `${x.code || x.source || 'Issue'} · ${x.detail || x.message || 'Details unavailable'}`), note: 'The audit links market and paper observations to their original publication times.' });
  }
  if (kind === 'paper') {
    area('Owner paper-wallet state', 'paper', { state: paperState === 'ready' && paper.ledgerIntegrity?.status === 'MISMATCH' ? 'Needs changes' : paperState, source: paperTime, facts: [
      ['Wallet records', paper.accountResolution?.status === 'RESOLVED' ? val(paper.accountResolution.count) : null],
      ['Active strategies', paper.accountResolution?.status === 'RESOLVED' ? val(totals.liveStrategies) : null],
      ['Virtual starting cash', displayPaper ? amount(totals.startingCash) : null],
      ['Aggregate marked equity', displayPaper ? amount(totals.value) : null],
      ['Marked cash', displayPaper && paper.cashAvailable ? amount(paper.cashTotal) : null],
      ['Open positions', completePaper ? val(totals.openPositions) : null],
    ], note: !knownPaper ? paper.accountResolution?.status === 'RESOLVED' && Number(paper.accountResolution.count) === 0 ? 'No owner paper wallets exist. This is not a zero market-value observation.' : 'Owner wallet status unavailable — no balance is inferred.' : !displayPaper ? 'One or more wallet marks are missing/stale or roll-up is incomplete; combined valuation is withheld.' : 'These balances are simulation-only and never exchange holdings.' });
    area('Paper Engine & Ledger', 'paperengine', { state: paperState === 'ready' && paper.ledgerIntegrity?.status === 'MISMATCH' ? 'Needs changes' : paperState, source: paperTime, facts: [
      ['Owner wallet records', paper.accountResolution?.status === 'RESOLVED' ? val(paper.accountResolution.count) : null],
      ['Ledger reconciliation', val(paper.ledgerIntegrity?.status)],
      ['Latest integrity check', val(paper.ledgerIntegrity?.checkedAt)],
      ['Completed fills (recent)', completePaper ? val(paper.recentFills?.length) : null],
      ['Closed trades', completePaper ? val(totals.closedTrades) : null],
      ['Pending proposals (not fills)', completePaper ? val(paper.pendingApprovals?.length) : null],
    ], items: completePaper ? (paper.recentFills || []).filter((x) => x.eventType === 'FILL').slice(0, 3).map((fill) => `${fill.side} ${fill.qty || ''} ${fill.asset || ''} @ ${amount(fill.fillPx) || 'price unavailable'} · ${fill.strategyName || fill.paperAccountId || 'paper wallet'} · ${when(fill.effectiveAt || fill.recordedAt)}`) : [], note: paper.ledgerIntegrity?.status === 'MISMATCH' ? 'Needs changes: the ledger does not reconcile. Do not rely on the totals above; inspect wallet evidence.' : 'Completed fills are not pending proposals. Open Paper Engine for per-wallet ledger and simulated execution.' });
  }
  if (kind === 'portfolio') {
    const marked = displayPaper ? (paper.positions || []).filter((p) => p.currentPrice != null && p.netQuantity != null)
      .map((p) => ({ ...p, value: Number(p.currentPrice) * Number(p.netQuantity) })).filter((p) => Number.isFinite(p.value) && p.value > 0).sort((a, b) => b.value - a.value) : [];
    const risk = d.risk || {};
    const lev = extra.leverage;
    const levObserved = (lev?.funding?.series || []).length > 0 && (lev?.positioning?.series || []).length > 0;
    const smart = d.smart_money || d.smartmoney;
    area('Owner Portfolio', 'paper', { state: paperState === 'ready' && paper.ledgerIntegrity?.status === 'MISMATCH' ? 'Needs changes' : paperState, source: paperTime, facts: [
      ['Owner wallet records', paper.accountResolution?.status === 'RESOLVED' ? val(paper.accountResolution.count) : null],
      ['Virtual starting cash', displayPaper ? amount(totals.startingCash) : null],
      ['Marked equity', displayPaper ? amount(totals.value) : null],
      ['Cash', displayPaper && paper.cashAvailable ? amount(paper.cashTotal) : null],
      ['Protected / deployable', displayPaper && paper.protectedCashAvailable ? `${amount(paper.protectedCashTotal)} / ${amount(paper.deployableCashTotal)}` : null],
      ['Open risk / paper cap', displayPaper && paper.openRiskAvailable ? `${val(paper.openRiskPct, '%')} / ${val(paper.openRiskLimitPct, '%')}` : null],
      ['Largest holding', marked.length ? `${marked[0].asset} · ${amount(marked[0].value)}` : null],
    ], children: marked.length ? <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><caption className="mb-1 text-left text-muted-foreground">Owner holdings · virtual amounts, priced marks only</caption><thead><tr><th className="py-1">Asset</th><th>Wallet / strategy</th><th>Units</th><th>Marked value</th><th>Allocation</th></tr></thead><tbody>{marked.slice(0, 6).map((p, i) => <tr className="border-t border-border" key={`${p.paperAccountId || p.strategyId}-${p.asset}-${i}`}><td className="py-1">{p.asset}</td><td>{p.strategyName || p.paperAccountId || 'owner wallet'}</td><td>{p.netQuantity}</td><td>{amount(p.value)}</td><td>{Number(totals.value) > 0 ? val((p.value / Number(totals.value) * 100).toFixed(1), '%') : 'unavailable'}</td></tr>)}</tbody></table></div> : null,
    note: paperState !== 'ready' ? 'Owner ledger read is unavailable/stale; allocation is withheld.' : paper.ledgerIntegrity?.status === 'MISMATCH' ? 'Needs changes: owner ledger reconciliation mismatch. Combined valuation and allocation are withheld.' : !displayPaper ? 'Wallet roll-up, reconciliation or price marks incomplete. Valuation and allocation are withheld.' : 'Cash and virtual holdings are owner-scoped, never the selected coin ticker.' });
    area('Ask Albert Risk', 'risk', { state: publishedState, source: sourceTime, facts: [['Risk level', val(risk.level)], ['Risk score', val(risk.score, '/100')], ['Macro-event risk', val(risk.macro_event_risk)], ['Data uncertainty', val(risk.data_uncertainty)], ['Expected BTC move (24h)', val(risk.expected_move?.['24H']?.pct, '%')], ['Mandate max drawdown', val(sop?.user?.maxDrawdownPct, '%')]], items: (risk.drivers || []).filter((x) => !x.demo).slice(0, 4).map((x) => `${x.name}: ${x.state}${x.value ? ` · ${x.value}` : ''}`), note: 'Illustrative/deactivated implied-volatility, liquidation and L2 metrics are excluded.' });
    area('Leverage', 'leverage', { state: extraState('leverage', lev?.as_of, 3) === 'ready' && !levObserved ? 'unavailable' : extraState('leverage', lev?.as_of, 3), source: when(lev?.as_of), facts: [['Pressure', levObserved ? val(lev?.summary?.pressure) : null], ['Bias', levObserved ? val(lev?.summary?.bias) : null], ['Open interest', amount(lev?.open_interest?.value_usd)], ['OI change', val(lev?.open_interest?.change_tf_pct, '%')], ['Funding rate (percent)', lev?.funding?.series?.length ? val(lev.funding.rate, '%') : null], ['Long account share', lev?.positioning?.series?.length ? val(lev.positioning.long_pct, '%') : null]], items: lev?.sources?.slice(0, 2), note: 'Only reported positioning/OI/funding with observations are shown. Backend may substitute zero funding and 50/50 positioning if its upstream fails; those fallback values are withheld here. Liquidations and estimated leverage have no connected feed.' });
    area('Event Calendar', 'events', { state: publishedState, source: sourceTime, facts: [['Next high-impact event', val(d.event_calendar?.next_high_impact?.title)], ['Event date (approx. for CPI)', val(d.event_calendar?.next_high_impact?.date)], ['Calendar window', val(d.event_calendar?.window_days, ' days')]], items: (d.event_calendar?.events || []).slice(0, 3).map((x) => `${x.title} · ${x.date} · ${x.importance}`), note: 'Calendar dates are scheduled/approximate; release time is not provided.' });
    area('Smart Money', 'smartmoney', { state: smart?.demo ? 'unavailable' : sourceState(smart, dashboardStatus, d.created_at), source: smart?.source ? `${smart.source} · run ${sourceTime}` : sourceTime, facts: smart?.demo ? [] : [['Published headline', val(smart?.headline)]], items: sourceMetrics(smart), note: smart?.demo ? 'Needs changes: this backend panel contains illustrative data, not observed smart-money activity. No placeholder metric is displayed.' : 'Reported metrics only; not an instruction to trade.' });
  }
  if (kind === 'btc') {
    const evaluation = outlook.validation || s.validation || {};
    const evaluated = evaluation.evaluation || evaluation;
    const band = outlook.band || {};
    const shortForecast = (d.forecasts || []).find((x) => x.horizon === '24H');
    const weeklyForecast = (d.forecasts || []).find((x) => x.horizon === '7D');
    area('Scenario Outlook', 'scenarios', { state: outlookState, source: when(outlook.baseline?.observedAt), facts: [['Asset', val(outlook.baseline?.asset || 'BTC')], ['Observed anchor', amount(outlook.baseline?.close)], ['Historical horizon', band.available ? val(band.horizonDays, ' days') : null], ['Historical lower', band.available ? val(band.lowerPct, '%') : null], ['Historical upper', band.available ? val(band.upperPct, '%') : null], ['Reason if unavailable', band.available ? null : val(band.reasonCode)]],
      children: (outlook.history || []).length > 1 ? <div className="mt-3"><BTCChart outlook={outlook} levels={d.chart?.sr_levels || []} height={220} expanded /></div> : null,
      note: 'Dashed conditional paths summarize past analog outcomes only. They are not a forward price forecast.' });
    area('Scenario Evaluation', 'scenario-evaluation', { state: outlookState, source: when(evaluated.lastEvaluatedAt), facts: [['Validation status', val(evaluation.status)], ['Completed evaluation points', val(evaluated.evaluationPoints)], ['Predictive validation', evaluationCurrent(evaluated, s.health?.outlook) ? 'Validated by completed observations' : 'WAIT · not currently validated'], ['Last evaluation', val(evaluated.lastEvaluatedAt)]], note: 'A published historical range is not proof of predictive skill.' });
    area('Forecasts', 'forecasts', { state: publishedState, source: sourceTime, facts: [['24-hour median model price', amount(shortForecast?.quantiles?.p50)], ['24-hour model win probability', val(shortForecast?.ev?.win_prob, '%')], ['7-day median model price', amount(weeklyForecast?.quantiles?.p50)], ['7-day p10 / p90', weeklyForecast?.quantiles?.p10 != null && weeklyForecast?.quantiles?.p90 != null ? `${amount(weeklyForecast.quantiles.p10)} / ${amount(weeklyForecast.quantiles.p90)}` : null]], note: 'Model distribution is separate from measured historical evaluation.' });
  }
  if (kind === 'intelligence') {
    const nearForecast = (d.forecasts || []).find((x) => x.horizon === '24H');
    const longForecast = (d.forecasts || []).find((x) => x.horizon === '7D');
    const driver = s.driver || {};
    const streams = s.streams || {};
    const cross = extra.crossmarket;
    const analog = extra.analogs;
    const phase = streams.phaseAssessment || {};
    area('Market Overview', 'overview', { state: publishedState, source: sourceTime, facts: [['Observed BTC close (market run)', amount(d.last_close)], ['Published regime', val(d.regime?.label || d.regime?.regime)], ['BTC dominance', val(d.dominance?.dominance, '%')], ['Quant score', val(d.quant?.score, '/100')], ['Phase', val(phase?.label || phase?.phase)], ['Breadth · alts beating BTC', phase?.inputs?.altsWithReturns > 0 ? `${phase.inputs.altsBeatingBtc}/${phase.inputs.altsWithReturns}` : null]], note: 'Observed market run only; a close is not a current executable quote.' });
    area('Forecasts', 'forecasts', { state: publishedState, source: sourceTime, facts: [['24-hour median model price', amount(nearForecast?.quantiles?.p50)], ['7-day median model price', amount(longForecast?.quantiles?.p50)], ['24-hour p10/p90', nearForecast?.quantiles?.p10 != null && nearForecast?.quantiles?.p90 != null ? `${amount(nearForecast.quantiles.p10)} / ${amount(nearForecast.quantiles.p90)}` : null], ['24-hour model win probability', val(nearForecast?.ev?.win_prob, '%')]], note: 'Forecast values are modeled distributions, not the measured Scenario Evaluation record.' });
    area('Market Intelligence', 'market-intel', { state: sourceState(s.streams, s.health?.streams, streams.generatedAt), source: when(streams.generatedAt), facts: [['Market phase', val(phase.label || phase.phase)], ['Phase status', val(phase.status)], ['BTC-to-alt breadth', phase?.inputs?.altsWithReturns > 0 ? `${phase.inputs.altsBeatingBtc}/${phase.inputs.altsWithReturns} alts beating BTC` : null], ['Next rotation condition', val(phase.invalidation || phase.confirmIf)]], items: (streams.participants?.participants || []).filter((x) => x?.finding && x.status !== 'MISSING').slice(0, 3).map((x) => `${x.participant}: ${x.finding}`), note: 'Phase and breadth are computed from the published market streams; no leadership is inferred when inputs are absent.' });
    area('Market Drivers', 'drivers', { state: sourceState(s.driver, s.health?.driver, driver.asOf) === 'ready' && driver.dataQuality && driver.dataQuality !== 'VERIFIED' ? driver.dataQuality === 'STALE' ? 'stale' : 'unavailable' : sourceState(s.driver, s.health?.driver, driver.asOf), source: when(driver.asOf), facts: [['Driver posture', val(driver.marketPosture)], ['Leading driver', val(driver.currentLeader?.label || driver.currentLeader?.actor)], ['First mover', val(driver.firstMover?.label || driver.firstMover?.actor)], ['Driver direction', val(driver.currentLeader?.direction)], ['Driver confidence', driver.confidence != null ? val((Number(driver.confidence) * 100).toFixed(0), '%') : null], ['Decision chain ID', val(driver.driverChainId)]], items: [...(driver.confirmingDrivers || []).slice(0, 2).map((x) => `Confirming ${x.actor}: ${x.detail || x.direction}`), ...(driver.resistingDrivers || []).slice(0, 2).map((x) => `Resisting ${x.actor}: ${x.detail || x.direction}`)], note: `Next rotation: ${driver.nextMoverCandidates?.[0]?.actor || 'not established'} · failure: ${driver.failureCondition || 'unavailable'}` });
    area('Cross-Market', 'crossmarket', { state: extraState('crossmarket', cross?.as_of, 96), source: `Aligned cross-market closes · ${when(cross?.as_of)} · ${cross?.window || 'window unavailable'}`, facts: [['Tracked series', val(cross?.assets?.length)], ['BTC rank (selected window)', val(cross?.coin_rank)], ['Leading return', cross?.best?.asset ? `${cross.best.asset} · ${val(cross.best.ret_1y, '%') || 'return unavailable'}` : null], ['BTC ↔ S&P 500 (30d)', val(cross?.correlations?.find((x) => x.asset === 'S&P 500')?.corr_30d)]],
      items: (cross?.correlations || []).slice(0, 3).map((x) => `${x.asset}: 30d corr ${x.corr_30d ?? 'unavailable'} · 90d ${x.corr_90d ?? 'unavailable'}`),
      children: cross?.series?.length > 1 ? <MarketSeries data={cross} /> : null,
      note: 'Series are rebased to 100; backend aligns non-trading dates by carrying forward last observations. This is comparison evidence, not a trade signal.' });
    area('Happening Again (Analogs)', 'analogs', { state: extraState('analogs', analog?.as_of, 96), source: when(analog?.as_of), facts: [['Similar historical episodes', val(analog?.episodes?.length)], ['Closest episode', val(analog?.episodes?.[0]?.label)], ['Closest match score', val(analog?.episodes?.[0]?.match, '%')], ['Historical window', analog?.episodes?.[0]?.start ? `${analog.episodes[0].start} – ${analog.episodes[0].end}` : null], ['Observed subsequent 90d move', val(analog?.episodes?.[0]?.fwd_90, '%')]], items: (analog?.episodes || []).slice(0, 3).map((x) => `${x.label}: ${x.match}% similarity · ${x.start} – ${x.end} · past 90d ${x.fwd_90 ?? 'unavailable'}%`), note: 'Match scores and subsequent returns describe historical episodes, not a future forecast.' });
  }
  if (kind === 'news') {
    const headlines = [...(Array.isArray(news?.cards) ? news.cards : Array.isArray(news) ? news : [])].sort((a, b) => (b.impact || 0) - (a.impact || 0));
    const latestNews = headlines[0];
    const headlineTime = latestNews?.published || latestNews?.published_at || latestNews?.publishedAt;
    area('News', 'news', { state: sourceState(news, newsStatus, headlineTime, 72) === 'ready' && latestNews?.verification && latestNews.verification !== 'Confirmed' ? 'unverified' : sourceState(news, newsStatus, headlineTime, 72), source: `${latestNews?.source || 'News feed'} · ${when(headlineTime)}`, facts: [['Ranked headlines', newsStatus === 'ready' ? val(headlines.length) : null], ['Leading development', firstText(latestNews?.title, latestNews?.headline)], ['Published source', val(latestNews?.source)], ['Verification', val(latestNews?.verification)], ['BTC/portfolio mechanism (where sourced)', firstText(latestNews?.ai?.why_it_matters)]], items: headlines.slice(0, 3).map((x) => ({ text: `${x.title || x.headline || 'Untitled development'} · ${x.source || 'source unavailable'} · ${when(x.published || x.published_at || x.publishedAt)}`, url: x.link || x.url })), note: newsStatus === 'error' ? 'News read failed; cached headlines, if any, are stale. Do not interpret missing reports as no news.' : 'Read original reporting; market impact and transmission are not assumed from a headline.' });
    area('Policy & Liquidity', 'macro', { state: publishedState, source: sourceTime, facts: [['Policy score', val(d.policy?.score, '/100')], ['Global liquidity impulse', val(d.policy?.liquidity_impulse, '/100')], ['Dollar index (DXY)', val(d.policy?.dxy)], ['10Y yield', val(d.policy?.y10, '%')]], items: (d.policy?.calendar || []).slice(0, 3).map((x) => `${x.title || x.event || 'Policy event'} · ${x.date || 'date unavailable'}`), note: 'Macro conditions are one input to risk assessment, not an independently executable rule.' });
    area('Event Calendar', 'events', { state: publishedState, source: `Calendar generated ${d.event_calendar?.generated || 'date unavailable'} · market run ${sourceTime}`, facts: [['Next high-impact event', val(d.event_calendar?.next_high_impact?.title)], ['Date (CPI approximate)', val(d.event_calendar?.next_high_impact?.date)], ['Upcoming events', val(d.event_calendar?.events?.length)]], items: (d.event_calendar?.events || []).slice(0, 4).map((x) => `${x.title} · ${x.date} · ${x.importance}`), note: 'Event date is supplied, but exact release time may be unknown; CPI date is approximate in this calendar.' });
  }
  if (kind === 'evidence') {
    const evaluation = outlook.validation || s.validation || {};
    const evaluated = evaluation.evaluation || evaluation;
    const alerts = extra.alerts?.alerts || [];
    const checkup = extra.checkup?.checkup;
    area('Performance', 'performance', { state: paperState, source: `${paperTime} · scenario evaluated ${when(evaluated.lastEvaluatedAt)}`, facts: [['Paper closed trades', completePaper && paper.ledgerIntegrity?.status === 'MATCH' ? val(totals.closedTrades) : null], ['Paper win rate', displayPaper && Number(totals.closedTrades) > 0 ? val(totals.winRatePct, '%') : null], ['Paper realized P&L', completePaper && paper.ledgerIntegrity?.status === 'MATCH' ? amount(totals.realizedPnl) : null], ['Scenario evaluation points (separate)', outlookState === 'ready' ? val(evaluated.evaluationPoints) : null]], note: 'Paper-trade win rate and market-prediction evaluation come from distinct datasets; zero trades is not a measured win rate.' });
    area('Data Audit', 'dataaudit', { state: publishedState, source: sourceTime, facts: [['Run data status', val(d.data_health?.level || d.data_health?.status)], ['Latest run', val(d.created_at)], ['Audit issues', val(d.data_health?.issues?.length)]], items: (d.data_health?.issues || []).slice(0, 3).map((x) => `${x.source || x.type || 'Issue'} · ${x.detail || x.message || x.reason || 'Details unavailable'}`), note: 'Audit findings are recorded with the published market run, not inferred from current uptime.' });
    area('Alert Engine', 'alert-engine', { state: extraState('alerts', alerts[0]?.ts, 168), source: when(alerts[0]?.ts), facts: [['Returned signal alerts', Array.isArray(extra.alerts?.alerts) ? val(alerts.length) : null], ['Latest alert', val(alerts[0]?.title || alerts[0]?.message)]], items: alerts.slice(0, 4).map((x) => `${x.title || x.message || 'Alert'} · ${when(x.ts)} · ${x.severity || 'severity unavailable'}`), note: !alerts.length && extra.alerts?.status === 'ready' ? 'No alert records were returned by this endpoint. It does not verify market safety.' : null });
    area('App Checkup', 'checkup', { state: extraState('checkup', checkup?.completed_at, 720), source: when(checkup?.completed_at), facts: [['Recorded checkup', extra.checkup?.hasRecordedCheckup === false ? 'None recorded — run one from App Checkup' : val(checkup?.summary?.title)], ['Outcome', val(checkup?.summary?.outcome)], ['Checks not testable', val(checkup?.summary?.not_testable_count)], ['Checkup run ID', val(checkup?.run_id)]], note: 'Last owner-scoped saved checkup only. Viewing this screen never starts diagnostics.' });
    area('Paper Engine', 'paperengine', { state: paperState, source: paperTime, facts: [['Owner wallet records', paper.accountResolution?.status === 'RESOLVED' ? val(paper.accountResolution.count) : null], ['Ledger reconciliation', val(paper.ledgerIntegrity?.status)], ['Latest check', val(paper.ledgerIntegrity?.checkedAt)], ['Completed fills', completePaper ? val(paper.recentFills?.length) : null]], items: completePaper ? (paper.recentFills || []).slice(0, 2).map((x) => `${x.side} ${x.asset || 'asset unavailable'} · ${x.strategyName || x.paperAccountId || 'owner wallet'} · ${when(x.recordedAt || x.effectiveAt)}`) : [], note: 'Owner wallet cash and lots are checked against the ledger; fills remain simulation-only.' });
    area('Scenario Evaluation', 'scenario-evaluation', { state: outlookState, source: when(evaluated.lastEvaluatedAt), facts: [['Completed checks', val(evaluated.evaluationPoints)], ['Measured skill', val(evaluated.skillVsNoChange)], ['Validation', evaluationCurrent(evaluated, s.health?.outlook) ? 'Validated by completed checks' : 'WAIT · not currently validated']], note: 'No forward forecast is relabeled as a measured outcome.' });
  }
  if (kind === 'flows') {
    const etf = s.etf || {};
    const whales = extra.whales || {};
    const network = extra.network || {};
    const sentiment = extra.sentiment || {};
    const hist = extra.history || {};
    const inst = d.institutional;
    const netState = network.as_of ? extraState('network', network.as_of, 48) : extra.network?._readState || (loading && !extra.network ? 'loading' : 'unavailable');
    const sentState = extraState('sentiment', sentiment?.ts, 24);
    area('ETF Flows', 'etf', { state: !etf.latest_date && s.health?.etf === 'ready' ? 'unavailable' : sourceState(s.etf, s.health?.etf, etf.latest_date, 96), source: `${etf.source || 'ETF daily issuer data'} · session ${etf.latest_date || 'date unavailable'}`, facts: [['Last reported net flow', val(etf.net_1d, 'm USD')], ['Reported seven-session net', val(etf.net_7d, 'm USD')], ['Top issuer', val(etf.top_issuer || etf.leaderboard?.[0]?.ticker)], ['Top issuer (30-session flow)', val(etf.leaderboard?.[0]?.window_total, 'm USD')], ['Report date', val(etf.latest_date)]], items: (etf.leaderboard || []).slice(0, 3).map((x) => `${x.ticker}: ${x.window_total}m USD over 30 reported sessions`), note: 'Reported session data lag live trading. A missing session is not a zero inflow.' });
    area('Whale Watch', 'whales', { state: !whales.as_of && extraState('whales', whales.as_of) === 'ready' ? 'unavailable' : extraState('whales', whales.as_of), source: `${whales.source || 'Labeled BTC wallet feed'} · ${when(whales.as_of)}`, facts: [['Tracked labeled wallets', val(whales.whales?.length)], ['Largest tracked balance', val(whales.whales?.[0]?.balance, ' BTC')], ['Largest observed change (7d)', val(whales.whales?.[0]?.change_7d, ' BTC')]], items: (whales.whales || []).slice(0, 3).map((x) => `${x.name || 'Tracked wallet'} · ${x.balance ?? 'balance unavailable'} BTC · 7d ${x.change_7d ?? 'unavailable'} BTC · ${x.signal || 'direction unavailable'}`), note: 'Only labeled observed wallets; not proof of exchange deposits or intent.' });
    area('Network & Sentiment', 'network', { state: netState === 'error' && sentState === 'error' ? 'error' : netState === 'stale' || sentState === 'stale' ? 'stale' : netState === 'ready' && sentState === 'ready' ? 'ready' : 'unavailable', source: `Network ${when(network.as_of)} · sentiment ${when(sentiment.ts)}`, facts: [['Hashrate', val(network.hashrate_ehs, ' EH/s')], ['Mempool congestion (if count supplied)', network.mempool?.count != null ? val(network.mempool.congestion) : null], ['Fear & Greed', val(sentiment.value, '/100')], ['Sentiment label', val(sentiment.label)]], note: 'Each feed has a separate time and may be missing independently. A network read is not a sentiment timestamp.' });
    area('Time Machine', 'timemachine', { state: extraState('history', hist.as_of, 96), source: when(hist.as_of), facts: [['Historical matched days', val(hist.analogs?.length)], ['Most similar date', val(hist.analogs?.[0]?.date)], ['Similarity', hist.analogs?.[0]?.similarity != null ? val((Number(hist.analogs[0].similarity) * 100).toFixed(1), '%') : null], ['Historical BTC price', amount(hist.analogs?.[0]?.price_then)], ['Past next 30d', val(hist.analogs?.[0]?.ret_30d_pct, '%')]], items: (hist.analogs || []).slice(0, 3).map((x) => `${x.date}: ${(Number(x.similarity) * 100).toFixed(1)}% similarity · observed next 7d ${x.ret_7d_pct}% / 30d ${x.ret_30d_pct}%`), note: 'These were past observed outcomes, not proposed future returns.' });
    area('Institutional Activity', 'institutional', { state: inst?.demo ? 'unavailable' : sourceState(inst, dashboardStatus, d.created_at), source: inst?.source ? `${inst.source} · run ${sourceTime}` : sourceTime, facts: inst?.demo ? [] : [['Headline', val(inst?.headline)]], items: sourceMetrics(inst), note: inst?.demo ? 'Needs changes: the published institutional panel is illustrative; no real institutional metric is available here. Reported ETF flow is shown separately above.' : 'Only observed institutional metrics are shown, not exchange orders.' });
  }
  if (kind === 'radar') {
    const findingsSource = s.streams?.researchFindings?.findings || s.findings?.findings;
    const findings = Array.isArray(findingsSource) ? findingsSource.filter((x) => x.status === 'OPEN') : [];
    const qualified = findings.filter((x) => x.confirmIf && x.invalidateIf && !['AVOID_FOR_NOW', 'INSUFFICIENT_EVIDENCE'].includes(x.priority));
    area('Opportunity Research', 'opportunities', { state: sourceState(s.streams, s.health?.streams, s.streams?.researchFindings?.asOf || s.streams?.generatedAt), source: when(s.streams?.researchFindings?.asOf || s.streams?.generatedAt), facts: [['Open research records', Array.isArray(findingsSource) ? val(findings.length) : null], ['Trigger + invalidation recorded', Array.isArray(findingsSource) ? val(qualified.length) : null], ['Top hypothesis', val(qualified[0]?.title)]], items: qualified.slice(0, 3).map((x) => `${x.asset || x.symbol || 'Market (asset not specified)'} · ${x.title} · ${x.priorityLabel || x.priority} · confirm: ${x.confirmIf} · cancel: ${x.invalidateIf} · ${x.resolveBy ? `review by ${when(x.resolveBy)}` : 'review time unavailable'}`), note: 'WAIT · Research is not an approved paper order. Coin capability (identity/price/decision/wallet), wallet risk and mandate fit must be validated in Studio.' });
    area('Strategy Review', 'strategies', { state: paperState, source: paperTime, facts: [['Saved strategies', paperState === 'ready' ? val(paper.strategies?.length) : null], ['Running strategies', paperState === 'ready' ? val(totals.liveStrategies) : null], ['Linked wallets', paperState === 'ready' ? val(totals.linkedWallets) : null]], items: paperState === 'ready' ? (paper.strategies || []).slice(0, 3).map((x) => `${x.name || x.strategyId} · ${x.paperStatusLabel || x.paperStatus || 'state unavailable'} · ${x.assets?.join(', ') || 'assets unavailable'}`) : [], note: 'An unsupported asset or rule must be revised (Needs changes), not substituted.' });
    area('Paper Trade Proposals', 'paper', { state: paperState, source: paperTime, facts: [['Pending owner approvals', paperState === 'ready' && paper.accountResolution?.status === 'RESOLVED' ? val(paper.pendingApprovals?.length) : null], ['Owner wallet records', paper.accountResolution?.status === 'RESOLVED' ? val(paper.accountResolution.count) : null]], items: paperState === 'ready' && completePaper ? (paper.pendingApprovals || []).slice(0, 3).map((x) => `${x.side || 'Side unavailable'} ${x.asset || 'asset unavailable'} · ${x.strategyName || x.paperAccountId || 'owner wallet'} · ${when(x.recordedAt || x.createdAt)}`) : [], note: 'Pending proposals are not fills. Manual proposals require approval; Autopilot follows only an approved strategy.' });
  }

  const ask = () => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('albert:ask', {
      detail: { entity: kind === 'btc' ? 'BTC' : null,
        context: { dashboardArea: kind, source: 'published dashboard and owner-scoped records',
          publishedAt: d.created_at || null, paperLedgerReadAt: paper.asOf || null,
          paperAccountResolution: paper.accountResolution || null,
          decisionSnapshotId: sop?.market?.decisionSnapshotId || outlook?.decisionSnapshotId || null,
          evaluationStatus: outlook?.validation?.status || null },
        prefill: `Explain the current ${entry.title} using the evidence and its publication times. Distinguish missing data from actual results.` }
    }));
  };
  return <div className="container space-y-4 pb-16 pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><ArrowLeft className="h-3.5 w-3.5" />Back to dashboard</button>
        <h1 className="mt-1 text-2xl font-bold text-foreground">{entry.title}</h1>
        <p className="text-xs text-muted-foreground">Real results from every area in this dashboard card, followed by its full screen. No estimated account totals.</p>
      </div>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={ask} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"><MessageCircle className="h-4 w-4" />Ask Albert about this</button>
        {Object.keys(requests).length > 0 && <button type="button" onClick={() => { setPollAttempts(0); setReadRevision((v) => v + 1); }} disabled={loading} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-xs text-foreground disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" />Retry details</button>}</div>
    </div>
    {readError && <p role="status" className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">{readError}</p>}
    {Object.values(s.health || {}).some((value) => value === 'stale') && <p role="status" className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">Some source records are stale. Values below are the last published observations, not current live signals.</p>}
    <div className="grid gap-3 lg:grid-cols-2">{rows}</div>
    {kind === 'paper' && <div className="rounded-lg border border-border bg-card p-4"><PaperTradingBot onNav={onNav} /></div>}
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" />Paper values are simulated; market data, account records and published assessments retain separate freshness states.</p>
  </div>;
}
