'use client';

import React, { useMemo } from 'react';
import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Legend } from 'recharts';
import ModalShell from './ModalShell';

const dateKey = (v) => String(v || '').slice(0, 10);
const valid = (n) => n != null && Number.isFinite(Number(n)) && Number(n) > 0;
const usd = (v) => `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const tooltipStyle = { background: '#0f172a', border: '1px solid #475569', borderRadius: 8, color: '#f8fafc', fontSize: 12 };

const BTCChart = ({ outlook, levels, height = 92, expanded = false }) => {
  const { rows, boundary, support, ceiling, hasBull, hasBear } = useMemo(() => {
    const history = (outlook?.history || []).filter((p) => valid(p.close)).slice(-(expanded ? 60 : 18));
    if (history.length < 2) return { rows: [] };
    const base = history.map((p) => ({ date: dateKey(p.time), observed: Number(p.close) }));
    const boundaryDate = dateKey(history[history.length - 1].time);
    // Draw each returned series by its own dates — no requirement that both exist.
    const bull = (outlook?.scenarios || []).find((s) => s.side === 'BULLISH')?.points || [];
    const bear = (outlook?.scenarios || []).find((s) => s.side === 'BEARISH')?.points || [];
    const anchor = Number(history[history.length - 1].close);
    if (bull.length || bear.length) {
      if (bull.length) base[base.length - 1].bull = anchor;
      if (bear.length) base[base.length - 1].bear = anchor;
      const maxLen = Math.max(bull.length, bear.length);
      for (let i = 0; i < maxLen; i += 1) {
        const row = { date: dateKey((bull[i] || bear[i])?.time) };
        if (i < bull.length && valid(bull[i].price)) row.bull = Number(bull[i].price);
        if (i < bear.length && valid(bear[i].price)) row.bear = Number(bear[i].price);
        base.push(row);
      }
    }
    const below = (levels || []).filter((l) => l.type === 'support' && valid(l.price) && Number(l.price) < anchor).sort((a, b) => Number(b.price) - Number(a.price));
    const above = (levels || []).filter((l) => l.type === 'resistance' && valid(l.price) && Number(l.price) > anchor).sort((a, b) => Number(a.price) - Number(b.price));
    return { rows: base, boundary: boundaryDate, support: below[0]?.price, ceiling: above[0]?.price, hasBull: bull.length > 0, hasBear: bear.length > 0 };
  }, [outlook, levels, expanded]);
  if (!rows?.length) return <p className="flex h-full min-h-20 items-center text-xs text-slate-400">Observed BTC history is unavailable; no path is drawn.</p>;
  return <div className="w-full" style={{ height }} role="img" aria-label={`BTC observed daily closes to ${boundary}. ${hasBull || hasBear ? 'Conditional historical paths follow Now; not a forecast.' : 'Historical scenario paths unavailable.'}`}>
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={rows} margin={expanded ? { top: 14, right: 24, left: 8, bottom: 8 } : { top: 5, right: 4, left: 0, bottom: 0 }}>
        {expanded && <CartesianGrid stroke="#334155" strokeDasharray="3 3" vertical={false} />}
        <XAxis dataKey="date" tick={expanded ? { fill: '#cbd5e1', fontSize: 12 } : false} tickLine={false} axisLine={false} minTickGap={45} />
        <YAxis domain={['auto', 'auto']} tick={expanded ? { fill: '#cbd5e1', fontSize: 12 } : false} tickFormatter={usd} width={expanded ? 80 : 0} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [usd(v), name === 'observed' ? 'Observed close' : `${name} historical path`]} />
        {expanded && <Legend verticalAlign="top" height={30} formatter={(name) => name === 'observed' ? 'Observed close' : name === 'bull' ? 'Historical bull path' : 'Historical bear path'} />}
        <ReferenceLine x={boundary} stroke="#cbd5e1" strokeDasharray="4 3" label={expanded ? { value: 'Now', position: 'insideTopRight', fill: '#f8fafc', fontSize: 12 } : undefined} />
        {valid(support) && <ReferenceLine y={Number(support)} stroke="#34d399" strokeDasharray="3 5" label={expanded ? { value: `Support area ${usd(support)}`, fill: '#86efac', position: 'insideBottomLeft', fontSize: 11 } : undefined} />}
        {valid(ceiling) && <ReferenceLine y={Number(ceiling)} stroke="#fda4af" strokeDasharray="3 5" label={expanded ? { value: `Ceiling area ${usd(ceiling)}`, fill: '#fda4af', position: 'insideTopLeft', fontSize: 11 } : undefined} />}
        <Line type="linear" dataKey="observed" stroke="#f8fafc" strokeWidth={expanded ? 2.5 : 1.8} dot={false} connectNulls={false} isAnimationActive={false} />
        {hasBull && <Line type="linear" dataKey="bull" stroke="#38bdf8" strokeWidth={expanded ? 2.5 : 1.8} strokeDasharray="5 3" dot={false} connectNulls={false} isAnimationActive={false} />}
        {hasBear && <Line type="linear" dataKey="bear" stroke="#f472b6" strokeWidth={expanded ? 2.5 : 1.8} strokeDasharray="5 3" dot={false} connectNulls={false} isAnimationActive={false} />}
      </ComposedChart>
    </ResponsiveContainer>
  </div>;
};

// Only the dates shared by both real candle series are plotted; missing ETH dates
// are never interpolated or connected across a gap.
const matchedMarketSeries = (btc, eth) => {
  const btcDays = new Map((btc?.history || []).filter((p) => valid(p.close)).map((p) => [dateKey(p.time), Number(p.close)]));
  const ethDays = new Map((eth?.history || []).filter((p) => valid(p.close)).map((p) => [dateKey(p.time), Number(p.close)]));
  const dates = Array.from(new Set([...btcDays.keys(), ...ethDays.keys()])).sort().slice(-30);
  const shared = dates.filter((d) => btcDays.has(d) && ethDays.has(d));
  if (shared.length < 2) return [];
  const start = shared[0];
  const b0 = btcDays.get(start); const e0 = ethDays.get(start);
  return dates.filter((d) => d >= start).map((date) => ({ date,
    BTC: btcDays.has(date) ? Number((btcDays.get(date) / b0 * 100).toFixed(2)) : null,
    ETH: ethDays.has(date) ? Number((ethDays.get(date) / e0 * 100).toFixed(2)) : null,
  }));
};

const MarketChart = ({ btc, eth, height = 92, expanded = false }) => {
  const rows = useMemo(() => matchedMarketSeries(btc, eth), [btc, eth]);
  if (!rows.length) return <p className="flex h-full min-h-20 items-center text-xs text-slate-400">Matched BTC and ETH daily history is unavailable; comparison withheld.</p>;
  const lastShared = rows.filter((p) => p.BTC != null && p.ETH != null).at(-1);
  return <div className="w-full" style={{ height }} role="img" aria-label={`Normalized BTC and ETH observed daily closes from ${rows[0].date} to ${lastShared?.date || 'unavailable'}, both starting at 100. Missing dates remain gaps.`}>
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={rows} margin={expanded ? { top: 14, right: 24, left: 8, bottom: 8 } : { top: 5, right: 4, left: 0, bottom: 0 }}>
        {expanded && <CartesianGrid stroke="#334155" strokeDasharray="3 3" vertical={false} />}
        <XAxis dataKey="date" tick={expanded ? { fill: '#cbd5e1', fontSize: 12 } : false} tickLine={false} axisLine={false} minTickGap={45} />
        <YAxis domain={['auto', 'auto']} tick={expanded ? { fill: '#cbd5e1', fontSize: 12 } : false} tickFormatter={(v) => `${v}`} width={expanded ? 52 : 0} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [`${v} index`, name]} />
        {expanded && <Legend verticalAlign="top" height={30} />}
        <ReferenceLine y={100} stroke="#64748b" strokeDasharray="3 3" />
        <Line type="linear" dataKey="BTC" stroke="#fbbf24" strokeWidth={expanded ? 2.5 : 1.8} dot={false} connectNulls={false} isAnimationActive={false} />
        <Line type="linear" dataKey="ETH" stroke="#818cf8" strokeWidth={expanded ? 2.5 : 1.8} dot={false} connectNulls={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  </div>;
};

const ExpandedChart = ({ type, outlook, eth, levels, runAsOf, onClose, onNav, onEvidence }) => {
  const band = outlook?.band;
  const marketRows = matchedMarketSeries(outlook, eth);
  const lastShared = marketRows.filter((p) => p.BTC != null && p.ETH != null).at(-1);
  const btc = type === 'btc';
  const destination = btc ? 'scenarios' : 'crossmarket';
  return <ModalShell title={btc ? 'BTC · observed history & historical scenarios' : 'Cross-market · observed BTC vs ETH'} onClose={onClose} placement="full">
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-slate-300">{btc
        ? 'White is observed BTC daily closes through Now. Dashed blue and pink paths describe bull and bear outcomes from comparable past conditions. Outcomes can fall outside any displayed range.'
        : 'BTC and ETH are rebased to 100 on their first shared closed-candle date. Each point uses an actual observation; when one feed misses a date, its line has a gap rather than an estimated point.'}</p>
      <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-2 sm:p-4">
        {btc ? <BTCChart outlook={outlook} levels={levels} height={Math.max(320, (typeof window !== 'undefined' ? window.innerHeight : 700) - 220)} expanded />
          : <MarketChart btc={outlook} eth={eth} height={Math.max(320, (typeof window !== 'undefined' ? window.innerHeight : 700) - 220)} expanded />}
      </div>
      <div className="grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
        <p><strong className="text-white">What:</strong> {btc ? (band?.lowerPct != null ? `20th–80th percentile of ${band.matchedDays ?? 'the'} matched historical days, ${band.horizonDays} days ahead; ${band.lowerPct}% to ${band.upperPct}%.` : `No evaluated scenario: ${band?.reasonText || 'evaluation unavailable'}`) : (lastShared ? `BTC ${lastShared.BTC - 100 >= 0 ? '+' : ''}${(lastShared.BTC - 100).toFixed(1)}%, ETH ${lastShared.ETH - 100 >= 0 ? '+' : ''}${(lastShared.ETH - 100).toFixed(1)}% across shared days.` : 'A comparable series is not available.')}</p>
        <p><strong className="text-white">Why:</strong> {btc ? 'These are historical possibilities, not price targets or a guarantee of support.' : 'Relative changes help assess whether ETH is leading or lagging BTC; they do not establish causation.'}</p>
        <p><strong className="text-white">How:</strong> {btc ? `Closed daily candles and a matched-history scenario. ${valid((levels || []).find((l) => l.type === 'support')?.price) ? 'Support and ceiling come from clustered daily swing reactions, not hard limits.' : 'Price levels are shown only when the chart engine reports them.'}` : 'Both closes divided by their first matched close and multiplied by 100; no forward points or interpolated dates.'}</p>
        <p><strong className="text-white">When:</strong> {btc ? `Observed candle ${dateKey(outlook?.baseline?.observedAt) || 'unavailable'}; level study ${runAsOf || 'unavailable'}. Recheck after the next closed daily candle; exact time not confirmed.` : `Last matched close ${lastShared?.date || 'unavailable'}. Recheck after the next closed daily candle; exact time not confirmed.`}</p>
      </div>
      {btc && <p className="text-xs text-slate-400">Level method: clustered swing closes (daily chart). Level study as of {runAsOf || 'unavailable'}; past reaction areas, not guaranteed bounds. Source: {outlook?.meta?.sourceId || 'scenario-outlooks/preview'} · {outlook?.modelVersion || 'version unavailable'}.</p>}
      {btc && band?.snapshotId && <button type="button" onClick={() => onEvidence(band.snapshotId)} className="text-sm text-sky-300 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">Open immutable scenario evidence</button>}
      <a href={`/?section=${destination}`} onClick={(e) => { e.preventDefault(); onClose(); onNav(destination); }} className="block w-fit text-sm font-semibold text-sky-300 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">Open {btc ? 'BTC Scenarios' : 'Cross-Market'} detail →</a>
    </div>
  </ModalShell>;
};

export { BTCChart, MarketChart, ExpandedChart, matchedMarketSeries };
