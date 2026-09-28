'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, MessageCircle, ShieldCheck, RefreshCw } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import PaperTradingBot from '../PaperTradingBot';
import { BTCChart, MarketChart } from './OneScreenCharts';

export const DASHBOARD_AREAS = {
  brief: { title: "Albert\u2019s Brief", areas: [['Unified Brief', 'briefing'], ['Evidence & Data Audit', 'dataaudit']] },
  paper: { title: 'Paper Trading', areas: [['Paper Trading', 'paper'], ['Paper Engine', 'paperengine']] },
  portfolio: { title: 'Portfolio & Risk', areas: [['Owner Portfolio', 'paper'], ['Ask Albert Risk', 'risk'], ['Leverage', 'leverage'], ['Event Calendar', 'events'], ['Smart Money', 'smartmoney']] },
  btc: { title: 'BTC Bull & Bear', areas: [['Scenario Outlook', 'scenarios'], ['Scenario Evaluation', 'scenario-evaluation'], ['Forecasts', 'forecasts']] },
  intelligence: { title: 'Market Intelligence', areas: [['Market Overview', 'overview'], ['Forecasts', 'forecasts'], ['Market Intelligence', 'market-intel'], ['Market Drivers', 'drivers'], ['Cross-Market', 'crossmarket'], ['Happening Again (Analogs)', 'analogs']] },
  news: { title: 'News, Macro & Policy', areas: [['News', 'news'], ['Policy & Liquidity', 'macro'], ['Event Calendar', 'events']] },
  evidence: { title: 'Evidence & Engines', areas: [['Prediction Ledger', 'performance'], ['Paper Engine', 'paperengine'], ['Alert Engine', 'alert-engine'], ['Scenario Evaluation', 'scenario-evaluation'], ['Data Audit', 'dataaudit'], ['App Checkup', 'checkup']] },
  flows: { title: 'On-Chain & Flows', areas: [['ETF Flows', 'etf'], ['Whale Watch', 'whales'], ['Network & Sentiment', 'network'], ['Time Machine', 'timemachine'], ['Institutional Activity', 'institutional']] },
  radar: { title: 'Opportunity Radar', areas: [['Opportunity Research', 'opportunities'], ['Strategy Review', 'strategies'], ['Paper Trade Proposals', 'paper']] },
};

const EMPTY_READS = Object.freeze({});
const EXTRA_READS = {
  brief: { brief: '/api/v1/albert/brief' },
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
  const dt = new Date(stamp);
  return Number.isNaN(dt.getTime()) ? 'Publication time unavailable' : `Published ${dt.toLocaleString()}`;
};
const val = (value, suffix = '') => value === null || value === undefined || value === '' ||
  (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') ||
  (typeof value === 'number' && !Number.isFinite(value)) ? null : `${value}${suffix}`;
const amount = (value) => value === null || value === undefined || value === '' ||
  !Number.isFinite(Number(value)) ? null : `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const firstText = (...items) => items.find((x) => typeof x === 'string' && x.trim()) || null;
/* Expandable text replaces truncation */
const ExpandableText = ({ text, maxLen = 400 }) => {
  const [open, setOpen] = React.useState(false);
  if (!text || String(text).length <= maxLen) return text || null;
  return <>{open ? text : `${String(text).slice(0, maxLen)}\u2026`} <button type="button" onClick={() => setOpen(!open)} className="text-primary underline text-xs">{open ? 'less' : 'more'}</button></>;
};
const sourceMetrics = (panel) => Array.isArray(panel?.metrics)
  ? panel.metrics.map((m) => m?.value != null && m?.source && m?.as_of
    ? `${m.name}: ${m.value}${m.signal ? ` \u00b7 ${m.signal}` : ''} \u00b7 ${m.source} \u00b7 as of ${when(m.as_of)}${m.inactive ? ' (Inactive)' : ''}${m.demo ? ' (Demo)' : ''}`
    : `${m?.name || 'Metric'}: Coming soon`) : ['Coming soon \u00b7 no sourced observations'];
const panelState = (panel) => !panel?.metrics?.some((m) => m?.value != null) ? 'unavailable' : 'ready';
const MarketSeries = ({ data }) => Array.isArray(data?.series) && data.series.length > 1 && Array.isArray(data?.assets)
  ? <div className="mt-3 h-52 min-w-0" role="img" aria-label={`Observed ${data.window} cross-market normalized series`}>
    <ResponsiveContainer width="100%" height="100%"><LineChart data={data.series} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
      <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={32} /><YAxis tick={{ fontSize: 10 }} width={38} domain={['auto', 'auto']} />
      <Tooltip /><Legend />{data.assets.slice(0, 4).map((asset, i) => <Line key={asset} name={asset} type="linear" dataKey={asset} stroke={['#fbbf24', '#38bdf8', '#a78bfa', '#34d399'][i]} dot={false} connectNulls={false} isAnimationActive={false} />)}
    </LineChart></ResponsiveContainer></div> : null;

/* ── Area ── Render available facts, rows and charts during refresh/loading/error states.
   Show an initial loading state only when that section has NO data at all. */
const Area = ({ title, route, facts = [], items = [], note, source, onNav, children, state = 'ready' }) => {
  const usable = facts.filter((f) => f?.[1] !== null && f?.[1] !== undefined && f?.[1] !== '');
  const shownItems = items.filter(Boolean);
  const hasContent = usable.length > 0 || shownItems.length > 0 || children;
  return <section className="rounded-lg border border-border bg-card p-4 sm:p-5" aria-label={title}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-base font-semibold text-card-foreground">{title}</h2>
      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${['stale', 'error', 'unavailable', 'unverified', 'WAIT', 'Needs changes'].includes(state) ? 'bg-amber-500/15 text-amber-200' : 'bg-primary/10 text-primary'}`}>{state}</span>
    </div>
    {source && <p className="mt-0.5 text-[11px] text-muted-foreground">{source}</p>}
    {state === 'stale' && <p role="status" className="mt-2 text-xs text-amber-200">Last published result only \u2014 freshness unavailable. Do not treat these figures as current.</p>}
    {usable.length > 0 && <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {usable.map(([key, value], i) => <div key={`${key}-${i}`} className="rounded-md border border-border bg-muted/30 px-3 py-2">
        <dt className="text-[11px] text-muted-foreground">{key}</dt>
        <dd className="mt-0.5 break-words text-sm font-semibold text-foreground"><ExpandableText text={typeof value === 'string' ? value : String(value)} /></dd>
      </div>)}
    </dl>}
    {shownItems.length > 0 && <ul className="mt-3 space-y-1.5 text-sm text-foreground">{shownItems.slice(0, 20).map((item, i) => <li key={i} className="rounded-md border border-border bg-muted/20 px-3 py-2">{item && typeof item === 'object' && typeof item.url === 'string' && /^https?:\/\//i.test(item.url)
      ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2"><ExpandableText text={item.text || item.url} /></a>
      : <ExpandableText text={item && typeof item === 'object' ? item.text || 'Source unavailable' : item} />}</li>)}</ul>}
    {children}
    {!hasContent && <p role="status" className="mt-3 text-sm text-muted-foreground">{state === 'loading' ? 'Loading this source\u2026' : state === 'error' ? 'This source could not be read. Retry or open its full screen.' : 'Unavailable in latest published data. No value assumed.'}</p>}
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
        // Store returned data; track request status separately.
        const hasPayload = Object.keys(json).some((k) => k !== 'status' && k !== 'error' && json[k] != null);
        if (hasPayload) return [key, json];
        if (json?.status && !['ready', 'partial'].includes(json.status)) return [key, { _readState: ['computing', 'preparing'].includes(json.status) ? 'loading' : 'unavailable' }];
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
      setReadError(rows.some(([, v]) => v?._readState === 'error') ? 'Some sources could not be read. Previously published values, if available, are marked stale.' : null);
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
  const paperTime = paper.asOf ? `Owner-scoped paper ledger \u00b7 read ${when(paper.asOf).replace('Published ', '')}` : 'Owner ledger \u00b7 read time unavailable';
  // Simplified state helpers; status badges only, never used to suppress values.
  const healthOf = (key) => s.health?.[key] || 'unavailable';
  const extraState = (key, stamp, hours = 36) => {
    const result = extra[key];
    if (result?._readState) {
      const old = Object.keys(result).some((x) => x !== '_readState');
      return old ? 'stale' : result._readState === 'loading' && pollAttempts >= 8 ? 'unavailable' : result._readState;
    }
    return result ? 'ready' : loading ? 'loading' : 'unavailable';
  };

  const rows = [];
  const area = (title, route, opts) => rows.push(<Area key={`${title}-${route}`} title={title} route={route} onNav={onNav} state={opts.state || healthOf('sop')} {...opts} />);

  if (kind === 'brief') {
    const claims = sop?.briefing?.claims || [];
    const briefData = extra.brief || {};
    const briefObs = briefData.observations || briefData.brief?.observations || [];
    const briefTake = briefData.take || briefData.brief?.take;
    area('Unified Brief', 'briefing', { state: healthOf('sop'), source: when(sop?.market?.asOf || sop?.generatedAt || briefData.generated_at), facts: [
      ['Market regime', val(d.regime?.label || d.regime?.regime || sop.market?.regime)],
      ['Published assessment', firstText(claims.find((x) => x.claimId === 'briefing.direction')?.text, sop?.briefing?.headline)],
      ["Albert\u2019s take", val(briefTake)],
      ['Recorded market changes', val(sop?.changesSinceLastVisit?.length)],
    ], items: [
      ...briefObs.slice(0, 4).map((o) => typeof o === 'string' ? o : o?.text || o?.observation || ''),
      ...claims.slice(0, 4).map((x) => `${x.claimId || 'Claim'}: ${x.text || 'Unavailable'}`),
    ].filter(Boolean),
    note: 'Unified brief combining real-time observations, state-of-play claims and Albert\u2019s take.' });
    area('Evidence & Data Audit', 'dataaudit', { state: healthOf('sop'), source: `Market run ${sourceTime}`, facts: [
      ['Data-health status', val(d.data_health?.level || sop?.dataQuality?.status)],
      ['Decision evidence', val(sop.market?.decisionSnapshotId || outlook?.decisionSnapshotId)],
      ['Quant score', val(d.quant_score ?? d.quant?.score, '/100')],
    ], items: (sop?.dataQuality?.issues || d.data_health?.issues || []).slice(0, 3).map((x) => `${x.code || x.source || 'Issue'} \u00b7 ${x.detail || x.message || 'Details unavailable'}`) });
  }
  if (kind === 'paper') {
    area('Paper Trading', 'paper', { state: healthOf('paper'), source: paperTime, facts: [
      ['Wallet records', paper.accountResolution?.status === 'RESOLVED' ? val(paper.accountResolution.count) : null],
      ['Active strategies', val(totals.liveStrategies)],
      ['Starting cash', amount(totals.startingCash)],
      ['Current cash', paper.cashAvailable ? amount(paper.cashTotal) : null],
      ['Equity value', amount(totals.value)],
      ['Realized P&L', amount(totals.realizedPnl)],
      ['Unrealized P&L', amount(totals.pnlUsd)],
      ['Fees', amount(totals.fees)],
      ['Open positions', val(totals.openPositions)],
    ], children: (paper.positions || []).length > 0 ? <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><caption className="mb-1 text-left text-muted-foreground">Holdings</caption><thead><tr><th className="py-1">Asset</th><th>Qty</th><th>Avg entry</th><th>Current</th><th>Value</th><th>Unrealized</th></tr></thead><tbody>{(paper.positions || []).slice(0, 10).map((p, i) => <tr className="border-t border-border" key={i}><td className="py-1">{p.asset}</td><td>{p.netQuantity}</td><td>{amount(p.averageEntryPrice)}</td><td>{amount(p.currentPrice)}</td><td>{amount(Number(p.currentPrice || 0) * Number(p.netQuantity || 0))}</td><td>{amount(p.unrealizedPnl)}</td></tr>)}</tbody></table></div> : null,
    note: 'Paper simulation only. Bought/Sold for completed trades, Buy/Sell for proposals.' });
    area('Completed Fills', 'paperengine', { state: healthOf('paper'), source: paperTime, facts: [
      ['Ledger reconciliation', val(paper.ledgerIntegrity?.status)],
      ['Completed fills', val(paper.recentFills?.length)],
      ['Closed trades', val(totals.closedTrades)],
    ], items: (paper.recentFills || []).filter((x) => x.eventType === 'FILL').slice(0, 5).map((fill) => `${fill.side === 'BUY' ? 'Bought' : 'Sold'} ${fill.qty || ''} ${fill.asset || ''} @ ${amount(fill.fillPx) || 'price unavailable'} \u00b7 fee ${amount(fill.fee) || 'unavailable'} \u00b7 ${when(fill.effectiveAt || fill.recordedAt)}`) });
    if ((paper.pendingApprovals || []).length > 0) {
      area('Pending Proposals', 'paper', { state: healthOf('paper'), source: paperTime, facts: [
        ['Pending proposals', val(paper.pendingApprovals?.length)],
      ], items: (paper.pendingApprovals || []).slice(0, 5).map((x) => `${x.side || 'Side'} ${x.asset || 'asset'} \u00b7 ${x.strategyName || x.paperAccountId || 'wallet'} \u00b7 ${when(x.recordedAt || x.createdAt)}`) });
    }
  }
  if (kind === 'portfolio') {
    const positions = paper.positions || [];
    const marked = positions.filter((p) => p.currentPrice != null && p.netQuantity != null)
      .map((p) => ({ ...p, value: Number(p.currentPrice) * Number(p.netQuantity) })).filter((p) => Number.isFinite(p.value)).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    const risk = d.risk || {};
    const lev = extra.leverage;
    const smart = d.smart_money || d.smartmoney;
    area('Owner Portfolio', 'paper', { state: healthOf('paper'), source: paperTime, facts: [
      ['Wallet records', paper.accountResolution?.status === 'RESOLVED' ? val(paper.accountResolution.count) : null],
      ['Starting cash', amount(totals.startingCash)],
      ['Equity value', amount(totals.value)],
      ['Cash', paper.cashAvailable ? amount(paper.cashTotal) : null],
      ['Protected / deployable', paper.protectedCashAvailable ? `${amount(paper.protectedCashTotal)} / ${amount(paper.deployableCashTotal)}` : null],
      ['Open risk / cap', paper.openRiskAvailable ? `${val(paper.openRiskPct, '%')} / ${val(paper.openRiskLimitPct, '%')}` : null],
      ['Largest holding', marked.length ? `${marked[0].asset} \u00b7 ${amount(marked[0].value)}` : null],
    ], children: marked.length ? <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="py-1">Asset</th><th>Units</th><th>Value</th><th>Allocation</th></tr></thead><tbody>{marked.slice(0, 8).map((p, i) => <tr className="border-t border-border" key={i}><td className="py-1">{p.asset}</td><td>{p.netQuantity}</td><td>{amount(p.value)}</td><td>{Number(totals.value) > 0 ? val((p.value / Number(totals.value) * 100).toFixed(1), '%') : 'unavailable'}</td></tr>)}</tbody></table></div> : null });
    area('Ask Albert Risk', 'risk', { state: risk?.score != null ? 'ready' : 'unavailable', source: `Market run ${sourceTime}`, facts: [
      ['Risk level / score', risk.score != null ? `${risk.level} \u00b7 ${risk.score}/100` : 'Coming soon'],
      ['24h ATR-derived range', risk.expected_move?.['24H']?.pct != null ? `\u00b1${risk.expected_move['24H'].pct}%` : 'Coming soon'],
      ['Mandate max drawdown', val(sop?.user?.maxDrawdownPct, '%')],
    ], items: (risk.drivers || []).map((x) => x.value != null ? `${x.name}: ${x.state} \u00b7 ${x.value} \u00b7 ${x.source || 'source unavailable'}` : `${x?.name || 'Risk factor'}: Coming soon`) });
    area('Leverage', 'leverage', { state: lev?.open_interest?.value_usd != null || lev?.funding?.rate != null ? 'ready' : extraState('leverage'), source: lev?.as_of ? `Observation ${when(lev.as_of)}` : 'Feed times below', facts: [
      ['Open interest', lev?.open_interest?.value_usd != null ? `${amount(lev.open_interest.value_usd)} \u00b7 ${lev.open_interest.source}` : 'Coming soon'],
      ['OI change', lev?.open_interest?.change_tf_pct != null ? `${lev.open_interest.change_tf_pct}%` : 'Coming soon'],
      ['Funding', lev?.funding?.rate != null ? `${lev.funding.rate}% \u00b7 ${lev.funding.source}` : 'Coming soon'],
      ['Long account share', lev?.positioning?.long_pct != null ? `${lev.positioning.long_pct}% \u00b7 ${lev.positioning.source}` : 'Coming soon'],
    ] });
    area('Event Calendar', 'events', { state: healthOf('sop'), source: sourceTime, facts: [['Next high-impact event', val(d.event_calendar?.next_high_impact?.title)], ['Event date', val(d.event_calendar?.next_high_impact?.date)]], items: (d.event_calendar?.events || []).slice(0, 3).map((x) => `${x.title} \u00b7 ${x.date} \u00b7 ${x.importance}`) });
    area('Smart Money', 'smartmoney', { state: panelState(smart), source: smart?.source ? `Feeds: ${smart.source}` : 'Source unavailable', facts: [['Panel status', panelState(smart) === 'ready' ? 'Partial observations' : 'Coming soon']], items: sourceMetrics(smart) });
  }
  if (kind === 'btc') {
    const evaluation = outlook.validation || s.validation || {};
    const evaluated = evaluation.evaluation || evaluation;
    const band = outlook.band || {};
    const forecasts = d.forecasts || [];
    const bitmark = d.bitmark || {};
    const shortForecast = forecasts.find((x) => x.horizon === '24H');
    const weeklyForecast = forecasts.find((x) => x.horizon === '7D');
    area('Scenario Outlook', 'scenarios', { state: healthOf('outlook'), source: when(outlook.baseline?.observedAt), facts: [
      ['Asset', val(outlook.baseline?.asset || 'BTC')],
      ['Observed anchor', amount(outlook.baseline?.price ?? outlook.baseline?.close)],
      ['Historical horizon', band.horizonDays ? val(band.horizonDays, ' days') : null],
      ['Historical lower', val(band.lowerPct, '%')],
      ['Historical upper', val(band.upperPct, '%')],
      ['Matched days', val(band.matchedDays)],
      ['Reason if unavailable', band.lowerPct != null ? null : val(band.reasonCode || band.reasonText)],
    ], children: (outlook.history || []).length > 1 ? <div className="mt-3"><BTCChart outlook={outlook} levels={d.chart?.sr_levels || []} height={220} expanded /></div> : null,
    note: 'Dashed paths are past analog outcomes, not forward forecasts.' });
    area('Scenario Evaluation', 'scenario-evaluation', { state: healthOf('outlook'), source: when(evaluated.lastEvaluatedAt), facts: [
      ['Validation status', val(evaluation.status)],
      ['Completed checks', val(evaluated.evaluationPoints)],
      ['Predictive validation', evaluation.predictiveValidation ? 'Validated' : 'Not validated'],
      ['Skill vs no change', val(evaluated.skillVsNoChange)],
      ['Last evaluation', val(evaluated.lastEvaluatedAt)],
    ] });
    area('Forecasts', 'forecasts', { state: shortForecast || weeklyForecast ? 'ready' : healthOf('sop'), source: sourceTime, facts: [
      ['24h higher probability', val(shortForecast?.higher, '%')],
      ['24h lower probability', val(shortForecast?.lower, '%')],
      ['24h bull / base / bear', shortForecast ? `${amount(shortForecast.bull)} / ${amount(shortForecast.base)} / ${amount(shortForecast.bear)}` : null],
      ['24h expected range', shortForecast?.quantiles?.p10 != null ? `${amount(shortForecast.quantiles.p10)} \u2013 ${amount(shortForecast.quantiles.p90)}` : null],
      ['24h confidence', val(shortForecast?.confidence, '%')],
      ['7d median', amount(weeklyForecast?.quantiles?.p50)],
      ['7d range', weeklyForecast?.quantiles?.p10 != null ? `${amount(weeklyForecast.quantiles.p10)} \u2013 ${amount(weeklyForecast.quantiles.p90)}` : null],
      ['Expiry', val(shortForecast?.expiry || weeklyForecast?.expiry)],
    ], items: [
      ...(bitmark.horizons || []).slice(0, 3).map((h) => `CryptoMarkAI ${h.horizon}: ${h.direction || 'direction unavailable'} \u00b7 issued ${when(h.issued_at)}`),
      ...(bitmark.drivers || []).slice(0, 2).map((dr) => `Driver: ${dr}`),
      ...(bitmark.risks || []).slice(0, 2).map((r) => `Risk: ${r}`),
    ].filter(Boolean),
    note: bitmark.next_update ? `CryptoMarkAI next update: ${when(bitmark.next_update)}` : null });
  }
  if (kind === 'intelligence') {
    const nearForecast = (d.forecasts || []).find((x) => x.horizon === '24H');
    const longForecast = (d.forecasts || []).find((x) => x.horizon === '7D');
    const driver = s.driver || {};
    const streams = s.streams || {};
    const cross = extra.crossmarket;
    const analog = extra.analogs;
    const phase = streams.phaseAssessment || {};
    const mi = d.market_intel || {};
    area('Market Overview', 'overview', { state: healthOf('sop'), source: sourceTime, facts: [
      ['Observed BTC close', amount(d.last_close)],
      ['Published regime', val(d.regime?.label || d.regime?.regime)],
      ['BTC dominance', val(d.dominance?.dominance, '%')],
      ['Quant score / label', mi.quant_score != null ? `${mi.quant_score} \u00b7 ${mi.quant_label || ''}` : val(d.quant_score ?? d.quant?.score, '/100')],
      ['Phase', val(phase?.label || phase?.phase)],
      ['Breadth', phase?.inputs?.altsWithReturns > 0 ? `${phase.inputs.altsBeatingBtc}/${phase.inputs.altsWithReturns}` : null],
      ['Cycle phase', val(mi.cycle_phase)],
      ['Technical structure', val(mi.technical_structure)],
    ] });
    area('Forecasts', 'forecasts', { state: nearForecast || longForecast ? 'ready' : healthOf('sop'), source: sourceTime, facts: [
      ['24h median', amount(nearForecast?.quantiles?.p50)],
      ['24h higher/lower', nearForecast ? `${val(nearForecast.higher, '%')} / ${val(nearForecast.lower, '%')}` : null],
      ['7d median', amount(longForecast?.quantiles?.p50)],
      ['7d range', longForecast?.quantiles?.p10 != null ? `${amount(longForecast.quantiles.p10)} \u2013 ${amount(longForecast.quantiles.p90)}` : null],
    ] });
    area('Market Intelligence', 'market-intel', { state: healthOf('streams'), source: when(streams.generatedAt), facts: [
      ['Market phase', val(phase.label || phase.phase)],
      ['Higher 24h / 7d', mi.higher_24h != null ? `${mi.higher_24h}% / ${mi.higher_7d}%` : null],
      ['Confidence', val(mi.confidence, '%')],
      ['Regime', val(mi.regime)],
      ['Dominance', val(mi.dominance, '%')],
      ['Smart money', val(mi.smart_money)],
      ['Exchange supply', val(mi.exchange_supply)],
      ['Derivatives risk', val(mi.derivatives_risk)],
      ['Crowd / hype risk', mi.crowd ? `${mi.crowd} / ${mi.hype_risk || 'unavailable'}` : null],
      ['Pressure map', val(mi.pressure_map)],
    ], items: [
      ...(mi.top_positive || []).slice(0, 2).map((x) => `Positive: ${x}`),
      ...(mi.top_risk || []).slice(0, 2).map((x) => `Risk: ${x}`),
    ].filter(Boolean) });
    area('Market Drivers', 'drivers', { state: healthOf('driver'), source: when(driver.asOf), facts: [
      ['Posture', val(driver.marketPosture)],
      ['Leading driver', val(driver.currentLeader?.label || driver.currentLeader?.actor)],
      ['Driver explanation', val(driver.currentLeader?.detail)],
      ['Direction', val(driver.currentLeader?.direction)],
      ['Confidence', driver.confidence != null ? val((Number(driver.confidence) * 100).toFixed(0), '%') : null],
      ['Continuation condition', val(driver.continuationCondition)],
      ['Failure condition', val(driver.failureCondition)],
    ], items: [
      ...(driver.nextMoverCandidates || []).slice(0, 2).map((x) => `Next: ${x.actor} \u00b7 ${x.probabilityBand || 'unrated'} \u00b7 if ${x.condition || 'not specified'}`),
      ...(driver.confirmingDrivers || []).slice(0, 2).map((x) => `Confirming ${x.actor}: ${x.detail || x.direction}`),
      ...(driver.resistingDrivers || []).slice(0, 2).map((x) => `Resisting ${x.actor}: ${x.detail || x.direction}`),
    ] });
    area('Cross-Market', 'crossmarket', { state: extraState('crossmarket'), source: `Cross-market \u00b7 ${when(cross?.as_of)}`, facts: [
      ['Tracked assets', val(cross?.assets?.length)],
      ['BTC rank', val(cross?.coin_rank)],
      ['Best performer', cross?.best?.asset ? `${cross.best.asset} \u00b7 ${val(cross.best.ret_1y, '%')}` : null],
      ['Worst performer', cross?.worst?.asset ? `${cross.worst.asset} \u00b7 ${val(cross.worst.ret_1y, '%')}` : null],
    ], items: (cross?.correlations || []).slice(0, 4).map((x) => `${x.asset}: 30d corr ${x.corr_30d ?? 'unavailable'} \u00b7 90d ${x.corr_90d ?? 'unavailable'}`),
    children: cross?.series?.length > 1 ? <MarketSeries data={cross} /> : null });
    area('Happening Again (Analogs)', 'analogs', { state: extraState('analogs'), source: when(analog?.as_of), facts: [
      ['Historical episodes', val(analog?.episodes?.length)],
      ['Closest match', val(analog?.episodes?.[0]?.label)],
      ['Similarity', analog?.episodes?.[0]?.similarity != null ? val((Number(analog.episodes[0].similarity) * 100).toFixed(1), '%') : null],
    ], items: (analog?.episodes || []).slice(0, 3).map((x) => `${x.label}: ${(Number(x.similarity) * 100).toFixed(1)}% \u00b7 ${x.start}\u2013${x.end} \u00b7 fwd 7d ${x.ret_7d_pct}% / 30d ${x.ret_30d_pct}%`) });
  }
  if (kind === 'news') {
    const headlines = [...(Array.isArray(news?.cards) ? news.cards : Array.isArray(news) ? news : [])].sort((a, b) => (b.impact || 0) - (a.impact || 0));
    const latest = headlines[0];
    const headlineTime = latest?.published || latest?.published_at;
    area('News', 'news', { state: latest ? 'ready' : newsStatus || 'unavailable', source: `${latest?.source || 'News feed'} \u00b7 ${when(headlineTime)}`, facts: [
      ['Headlines', val(headlines.length)],
      ['Leading', firstText(latest?.title)],
      ['Why it matters', firstText(latest?.ai?.why_it_matters)],
      ['Summary', firstText(latest?.ai?.summary)],
      ['Verification', val(latest?.verification)],
    ], items: headlines.slice(0, 4).map((x) => ({ text: `${x.title || 'Untitled'} \u00b7 ${x.source || ''} \u00b7 ${when(x.published)}`, url: x.link || x.url })) });
    area('Policy & Liquidity', 'macro', { state: d.policy ? 'ready' : healthOf('sop'), source: sourceTime, facts: [
      ['Policy score', val(d.policy?.score, '/100')],
      ['Liquidity state', val(d.policy?.liquidity_state)],
      ['Tailwind', val(d.policy?.tailwind)],
      ['Risk', val(d.policy?.risk)],
      ['DXY', val(d.policy?.dxy)],
      ['10Y yield', val(d.policy?.y10, '%')],
      ['VIX', val(d.policy?.vix)],
    ], items: (d.policy?.calendar || []).slice(0, 3).map((x) => `${x.title || x.event} \u00b7 ${x.date}`) });
    area('Event Calendar', 'events', { state: healthOf('sop'), source: sourceTime, facts: [['Next event', val(d.event_calendar?.next_high_impact?.title)], ['Date', val(d.event_calendar?.next_high_impact?.date)]], items: (d.event_calendar?.events || []).slice(0, 4).map((x) => `${x.title} \u00b7 ${x.date} \u00b7 ${x.importance}`) });
  }
  if (kind === 'evidence') {
    const evaluation = outlook.validation || s.validation || {};
    const evaluated = evaluation.evaluation || evaluation;
    const alerts = extra.alerts?.alerts || [];
    const checkup = extra.checkup?.checkup;
    const ledger = d.prediction_ledger || {};
    const liveRecord = d.live_record || {};
    const scoreboard = d.scoreboard || {};
    const perf = d.performance || {};
    area('Prediction Ledger', 'performance', { state: ledger.overall ? 'ready' : healthOf('sop'), source: sourceTime, facts: [
      ['Overall accuracy', ledger.overall?.accuracy != null ? val(ledger.overall.accuracy, '%') : null],
      ['Graded forecasts', val(ledger.overall?.n)],
      ['Last graded', val(ledger.overall?.lastGradedAt)],
    ], items: (ledger.horizons || []).slice(0, 4).map((h) => `${h.horizon}: ${h.accuracy}% accuracy \u00b7 ${h.n} graded`).concat(
      (ledger.recent || []).slice(0, 3).map((r) => `${r.horizon} ${r.direction}: ${r.correct ? 'Correct' : 'Incorrect'} \u00b7 ${when(r.graded_at)}`)
    ) });
    area('Paper Engine', 'paperengine', { state: healthOf('paper'), source: paperTime, facts: [
      ['Closed trades', val(totals.closedTrades)],
      ['Win rate', val(totals.winRatePct, '%')],
      ['Realized P&L', amount(totals.realizedPnl)],
      ['Ledger status', val(paper.ledgerIntegrity?.status)],
    ], items: (paper.recentFills || []).slice(0, 3).map((x) => `${x.side === 'BUY' ? 'Bought' : 'Sold'} ${x.asset} \u00b7 ${when(x.recordedAt || x.effectiveAt)}`) });
    area('Alert Engine', 'alert-engine', { state: alerts.length ? 'ready' : extraState('alerts'), source: when(alerts[0]?.ts), facts: [
      ['Alerts returned', val(alerts.length)],
      ['Latest', val(alerts[0]?.title || alerts[0]?.message)],
    ], items: alerts.slice(0, 4).map((x) => `${x.title || x.message || 'Alert'} \u00b7 ${when(x.ts)} \u00b7 ${x.severity || 'severity unavailable'}`) });
    area('Scenario Evaluation', 'scenario-evaluation', { state: healthOf('outlook'), source: when(evaluated.lastEvaluatedAt), facts: [
      ['Completed checks', val(evaluated.evaluationPoints)],
      ['Skill', val(evaluated.skillVsNoChange)],
      ['Validation', evaluation.predictiveValidation ? 'Validated' : 'Not validated'],
    ] });
    area('Data Audit', 'dataaudit', { state: healthOf('sop'), source: sourceTime, facts: [
      ['Status', val(d.data_health?.level || d.data_health?.status)],
      ['Latest run', val(d.created_at)],
      ['Issues', val(d.data_health?.issues?.length)],
    ], items: (d.data_health?.issues || []).slice(0, 3).map((x) => `${x.source || x.type || 'Issue'} \u00b7 ${x.detail || x.message || 'unavailable'}`) });
    area('App Checkup', 'checkup', { state: checkup ? 'ready' : extraState('checkup'), source: when(checkup?.completed_at), facts: [
      ['Summary', val(checkup?.summary?.title)],
      ['Outcome', val(checkup?.summary?.outcome)],
    ] });
    if (liveRecord.tracked != null) {
      area('Live Record', 'performance', { state: 'ready', source: sourceTime, facts: [
        ['Tracked', val(liveRecord.tracked)],
        ['Resolved', val(liveRecord.resolved)],
        ['Win rate', val(liveRecord.win_rate, '%')],
      ] });
    }
    if (scoreboard.label) {
      area('Scoreboard', 'performance', { state: 'ready', source: sourceTime, facts: [
        ['Label', val(scoreboard.label)],
        ['Score', val(scoreboard.score)],
      ] });
    }
  }
  if (kind === 'flows') {
    const etf = s.etf || {};
    const whales = extra.whales || {};
    const network = extra.network || {};
    const sentiment = extra.sentiment || {};
    const hist = extra.history || {};
    const inst = d.institutional;
    area('ETF Flows', 'etf', { state: etf.net_1d != null ? 'ready' : healthOf('etf'), source: `${etf.source || 'ETF issuer data'} \u00b7 session ${etf.latest_date || 'unavailable'}`, facts: [
      ['Last net flow', val(etf.net_1d, 'm USD')],
      ['7-session net', val(etf.net_7d, 'm USD')],
      ['Top issuer', val(etf.top_issuer || etf.leaderboard?.[0]?.ticker)],
      ['Report date', val(etf.latest_date)],
    ], items: (etf.leaderboard || []).slice(0, 3).map((x) => `${x.ticker}: ${x.window_total}m USD over 30 sessions`) });
    area('Whale Watch', 'whales', { state: whales.whales?.length ? 'ready' : extraState('whales'), source: `${whales.source || 'Whale feed'} \u00b7 ${when(whales.as_of)}`, facts: [
      ['Tracked wallets', val(whales.whales?.length)],
    ], items: (whales.whales || []).slice(0, 5).map((x) => `${x.name || 'Wallet'} \u00b7 ${x.balance ?? '?'} BTC \u00b7 7d ${x.change_7d ?? '?'} BTC \u00b7 ${x.signal || 'unknown'}`) });
    area('Network & Sentiment', 'network', { state: network.hashrate_ehs != null || sentiment.value != null ? 'ready' : 'unavailable', source: `Network ${when(network.as_of)} \u00b7 sentiment ${when(sentiment.ts)}`, facts: [
      ['Hashrate', val(network.hashrate_ehs, ' EH/s')],
      ['Mempool congestion', val(network.mempool?.congestion)],
      ['Fear & Greed', val(sentiment.value, '/100')],
      ['Sentiment label', val(sentiment.label)],
    ] });
    area('Time Machine', 'timemachine', { state: hist.analogs?.length ? 'ready' : extraState('history'), source: when(hist.as_of), facts: [
      ['Historical episodes', val(hist.analogs?.length)],
      ['Closest', val(hist.analogs?.[0]?.label)],
    ], items: (hist.analogs || []).slice(0, 3).map((x) => `${x.label}: ${(Number(x.similarity) * 100).toFixed(1)}% \u00b7 ${x.start}\u2013${x.end} \u00b7 fwd 7d ${x.ret_7d_pct}% / 30d ${x.ret_30d_pct}%`) });
    area('Institutional Activity', 'institutional', { state: panelState(inst), source: inst?.source ? `Feeds: ${inst.source}` : 'Source unavailable', facts: [
      ['Status', panelState(inst) === 'ready' ? 'Partial observations' : 'Coming soon'],
    ], items: sourceMetrics(inst) });
  }
  if (kind === 'radar') {
    const findingsSource = s.streams?.researchFindings?.findings || s.findings?.findings;
    // Display all open findings with their classification — no additional exclusions.
    const findings = Array.isArray(findingsSource) ? findingsSource.filter((x) => x.status === 'OPEN') : [];
    area('Opportunity Research', 'opportunities', { state: findings.length ? 'ready' : healthOf('streams'), source: when(s.streams?.researchFindings?.asOf || s.streams?.generatedAt), facts: [
      ['Open findings', val(findings.length)],
      ['Top', val(findings[0]?.title)],
    ], items: findings.slice(0, 5).map((x) => `${x.asset || x.symbol || 'Market'} \u00b7 ${x.title} \u00b7 ${x.priorityLabel || x.priority} \u00b7 confirm: ${x.confirmIf || 'not specified'} \u00b7 invalidate: ${x.invalidateIf || 'not specified'}`) });
    area('Strategy Review', 'strategies', { state: healthOf('paper'), source: paperTime, facts: [
      ['Saved strategies', val(paper.strategies?.length)],
      ['Running', val(totals.liveStrategies)],
    ], items: (paper.strategies || []).slice(0, 3).map((x) => `${x.name || x.strategyId} \u00b7 ${x.paperStatusLabel || x.paperStatus || 'unavailable'} \u00b7 ${x.assets?.join(', ') || 'assets unavailable'}`) });
    area('Paper Trade Proposals', 'paper', { state: healthOf('paper'), source: paperTime, facts: [
      ['Pending approvals', val(paper.pendingApprovals?.length)],
    ], items: (paper.pendingApprovals || []).slice(0, 5).map((x) => `${x.side || 'Side'} ${x.asset || 'asset'} \u00b7 ${x.strategyName || x.paperAccountId || 'wallet'} \u00b7 ${when(x.recordedAt || x.createdAt)}`) });
  }

  const ask = () => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('albert:ask', {
      detail: { entity: kind === 'btc' ? 'BTC' : null,
        context: { dashboardArea: kind, source: 'published dashboard and owner-scoped records',
          publishedAt: d.created_at || null, paperLedgerReadAt: paper.asOf || null },
        prefill: `Explain the current ${entry.title} using evidence and publication times.` }
    }));
  };
  return <div className="container space-y-4 pb-16 pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><ArrowLeft className="h-3.5 w-3.5" />Back to dashboard</button>
        <h1 className="mt-1 text-2xl font-bold text-foreground">{entry.title}</h1>
        <p className="text-xs text-muted-foreground">Real results from every area in this card, followed by its full screen.</p>
      </div>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={ask} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"><MessageCircle className="h-4 w-4" />Ask Albert about this</button>
        {Object.keys(requests).length > 0 && <button type="button" onClick={() => { setPollAttempts(0); setReadRevision((v) => v + 1); }} disabled={loading} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-xs text-foreground disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" />Retry details</button>}</div>
    </div>
    {readError && <p role="status" className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">{readError}</p>}
    <div className="grid gap-3 lg:grid-cols-2">{rows}</div>
    {kind === 'paper' && <div className="rounded-lg border border-border bg-card p-4"><PaperTradingBot onNav={onNav} /></div>}
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" />Paper values are simulated; market data and assessments retain separate freshness states.</p>
  </div>;
}
