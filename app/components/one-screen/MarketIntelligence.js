'use client';

import React, { useEffect, useState } from 'react';
import { API_BASE } from '../../lib/api';

const money = (v) => v == null ? '?' : typeof v === 'number' ? (v >= 1000 ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${v.toFixed(2)}`) : String(v);
const pct = (v) => v == null ? 'Unavailable' : `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}%`;
const LEADER_COLORS = {
  'Bitcoin-led': { bg: 'bg-amber-500/15', text: 'text-amber-300' },
  'Altcoin-led': { bg: 'bg-cyan-500/15', text: 'text-cyan-300' },
  'Mixed': { bg: 'bg-slate-500/15', text: 'text-slate-300' },
};

/* ── Performance Comparison Chart (normalized % line chart) ── */
const PerfChart = ({ series, table }) => {
  if (!series || series.length < 2) return <p className="text-xs text-slate-500">Chart data unavailable.</p>;

  const W = 760, H = 200, padL = 45, padR = 10, padT = 10, padB = 22;
  const chartW = W - padL - padR, chartH = H - padT - padB;
  const n = series.length;

  // Get all asset keys (skip 'date')
  const allKeys = Object.keys(series[0] || {}).filter(k => k !== 'date');
  const cryptoKeys = allKeys.filter(k => (table || []).find(t => t.asset === k && t.is_crypto));
  const tradKeys = allKeys.filter(k => !cryptoKeys.includes(k));
  const orderedKeys = [...cryptoKeys, ...tradKeys];

  // Compute min/max across all series
  let minV = 100, maxV = 100;
  series.forEach(row => {
    orderedKeys.forEach(k => {
      const v = row[k];
      if (v != null) { minV = Math.min(minV, v); maxV = Math.max(maxV, v); }
    });
  });
  const pad = (maxV - minV) * 0.05 || 2;
  minV -= pad; maxV += pad;
  const rangeV = maxV - minV || 1;
  const yV = (v) => padT + chartH - ((v - minV) / rangeV) * chartH;
  const xI = (i) => padL + (i / (n - 1 || 1)) * chartW;

  const COLORS = {
    'Bitcoin': '#f59e0b',
    'S&P 500': '#3b82f6',
    'Nasdaq 100': '#8b5cf6',
    'Dow Jones': '#6366f1',
    'Gold': '#eab308',
    'US Dollar (DXY)': '#94a3b8',
    'Nikkei 225': '#ec4899',
    'Euro Stoxx 50': '#14b8a6',
    'FTSE 100': '#f97316',
    'DAX': '#06b6d4',
  };
  const getColor = (k) => COLORS[k] || '#64748b';

  // Date labels (every ~20 points)
  const dateLabels = series.filter((_, i) => i % 20 === 0 || i === n - 1);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minHeight: 180 }} preserveAspectRatio="xMidYMid meet">
        {/* Baseline at 100 */}
        <line x1={padL} y1={yV(100)} x2={W - padR} y2={yV(100)} stroke="#475569" strokeWidth="0.5" strokeDasharray="4 4" />
        <text x={padL - 4} y={yV(100) + 3} textAnchor="end" fill="#64748b" fontSize="8">0%</text>

        {/* Grid lines */}
        {[-20, -10, 10, 20, 30, 40].filter(v => (100 + v) >= minV && (100 + v) <= maxV).map(v => (
          <g key={v}>
            <line x1={padL} y1={yV(100 + v)} x2={W - padR} y2={yV(100 + v)} stroke="#334155" strokeWidth="0.3" strokeDasharray="2 3" />
            <text x={padL - 4} y={yV(100 + v) + 3} textAnchor="end" fill="#475569" fontSize="7">{v > 0 ? '+' : ''}{v}%</text>
          </g>
        ))}

        {/* Lines for each asset */}
        {orderedKeys.map((key) => {
          const pts = series.map((row, i) => row[key] != null ? `${i === 0 || series[i-1]?.[key] == null ? 'M' : 'L'}${xI(i)},${yV(row[key])}` : '').filter(Boolean).join(' ');
          const isCrypto = cryptoKeys.includes(key);
          return pts ? <path key={key} d={pts} fill="none" stroke={getColor(key)}
            strokeWidth={key === 'Bitcoin' ? 2 : 1.2} opacity={isCrypto ? 1 : 0.5}
            strokeDasharray={isCrypto ? 'none' : '4 3'} /> : null;
        })}

        {/* End labels */}
        {orderedKeys.map((key, ki) => {
          const lastVal = series[n - 1]?.[key];
          if (lastVal == null) return null;
          const yOff = ki * 10;
          return <text key={key} x={W - padR + 2} y={yV(lastVal) + 3}
            fill={getColor(key)} fontSize="7" fontWeight={key === 'Bitcoin' ? 'bold' : 'normal'}>
            {key === 'Bitcoin' ? 'BTC' : key.length > 8 ? key.slice(0, 7) + '…' : key} {(lastVal - 100) >= 0 ? '+' : ''}{(lastVal - 100).toFixed(1)}%
          </text>;
        })}

        {/* Date labels */}
        {dateLabels.map(row => {
          const i = series.indexOf(row);
          return <text key={row.date} x={xI(i)} y={H - 2} textAnchor="middle" fill="#475569" fontSize="7">{(row.date || '').slice(5)}</text>;
        })}
      </svg>
    </div>
  );
};

/* ── Capital Flow Bar ── */
const FlowBar = ({ label, value, unit, direction, source }) => {
  if (value == null) return <div className="text-[11px] text-slate-500">{label}: Unavailable</div>;
  const positive = value > 0;
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-28 text-slate-400 shrink-0">{label}</span>
      <div className="flex-1 h-3 bg-slate-800 rounded overflow-hidden relative">
        <div className={`h-full rounded ${positive ? 'bg-emerald-500/40' : 'bg-red-500/40'}`}
          style={{ width: `${Math.min(100, Math.abs(value) / 20)}%`, marginLeft: positive ? '50%' : undefined, marginRight: !positive ? '50%' : undefined }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-[10px] font-semibold ${positive ? 'text-emerald-300' : 'text-red-300'}`}>
            {positive ? '+' : ''}{typeof value === 'number' ? value.toFixed(1) : value}{unit ? ` ${unit}` : ''}
          </span>
        </div>
      </div>
      {source && <span className="text-[9px] text-slate-600 shrink-0">{source}</span>}
    </div>
  );
};

/* ── Sector Strength Bar ── */
const SectorBar = ({ sector, strength, label, concentrated, isStrongest }) => (
  <div className="flex items-center gap-2 text-[11px]">
    <span className={`w-28 shrink-0 ${isStrongest ? 'text-white font-semibold' : 'text-slate-400'}`}>{sector}</span>
    <div className="flex-1 h-3 bg-slate-800 rounded overflow-hidden">
      <div className={`h-full rounded ${strength > 6 ? 'bg-emerald-500/50' : strength > 3 ? 'bg-amber-500/40' : 'bg-red-500/30'}`}
        style={{ width: `${Math.min(100, (strength / 10) * 100)}%` }} />
    </div>
    <span className="w-8 text-right text-slate-400">{strength?.toFixed(1)}</span>
    <span className={`text-[10px] w-20 ${label === 'LEADING' ? 'text-emerald-300' : label === 'EMERGING' ? 'text-cyan-300' : 'text-slate-500'}`}>
      {label}{concentrated ? ' *' : ''}
    </span>
  </div>
);

/* ── Main Market Intelligence Component ── */
const MarketIntelligence = ({ compact = false }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/v1/market-intelligence`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.status === 'ready') setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-6 text-slate-400 text-xs">Loading market intelligence...</div>;
  if (!data) return <div className="text-slate-500 text-xs py-4">Market intelligence unavailable.</div>;

  const { performance, leadership, sector_analysis, breadth, capital_flows, commentary } = data;
  const lc = LEADER_COLORS[leadership?.leader] || LEADER_COLORS['Mixed'];

  if (compact) {
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className={`rounded px-1.5 py-0.5 font-semibold ${lc.bg} ${lc.text}`}>{leadership?.leader}</span>
          {performance?.crypto_vs_equities && (
            <span className={`rounded px-1.5 py-0.5 ${performance.crypto_vs_equities.outperforming ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
              {performance.crypto_vs_equities.outperforming ? 'Outperforming' : 'Underperforming'} equities
            </span>
          )}
          {breadth?.pct_rising != null && (
            <span className={`rounded px-1.5 py-0.5 ${breadth.broad ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
              {breadth.broad ? 'Broad' : 'Concentrated'}
            </span>
          )}
        </div>
        <PerfChart series={performance?.series} table={performance?.table} />
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-slate-400">
          {sector_analysis?.strongest && <span>Strongest: {sector_analysis.strongest.sector}</span>}
          {capital_flows?.external?.etf_btc && <span>BTC ETF 7d: {pct(capital_flows.external.etf_btc.net_7d ? capital_flows.external.etf_btc.net_7d / 100 : null).replace('%', 'M')}</span>}
        </div>
      </div>
    );
  }

  // Full view
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold text-white">Market Intelligence</h3>
        <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${lc.bg} ${lc.text}`}>{leadership?.leader}</span>
        {performance?.crypto_vs_equities && (
          <span className={`rounded px-1.5 py-0.5 text-[11px] ${performance.crypto_vs_equities.outperforming ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
            {performance.crypto_vs_equities.label}
          </span>
        )}
      </div>

      {/* Albert Commentary */}
      {commentary && (
        <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3 text-xs text-indigo-100 leading-relaxed">
          <span className="font-bold text-indigo-300">Albert: </span>{commentary}
        </div>
      )}

      {/* 1. Performance Comparison Chart */}
      <div className="rounded-lg border border-slate-700/60 bg-slate-900/60 p-3">
        <p className="mb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Relative Performance (normalized)</p>
        <PerfChart series={performance?.series} table={performance?.table} />
        {/* Performance table */}
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead><tr className="text-slate-500 border-b border-slate-800">
              <th className="text-left py-1 pr-3">Asset</th>
              <th className="text-right px-2">1W</th>
              <th className="text-right px-2">1M</th>
              <th className="text-right px-2">3M</th>
            </tr></thead>
            <tbody>
              {(performance?.table || []).map(row => (
                <tr key={row.asset} className={`border-b border-slate-800/50 ${row.is_crypto ? 'text-white' : 'text-slate-400'}`}>
                  <td className="py-0.5 pr-3 font-medium">{row.asset}{row.is_crypto ? ' ★' : ''}</td>
                  <td className={`text-right px-2 ${(row.ret_1w || 0) >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{pct(row.ret_1w)}</td>
                  <td className={`text-right px-2 ${(row.ret_1m || 0) >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{pct(row.ret_1m)}</td>
                  <td className={`text-right px-2 ${(row.ret_3m || 0) >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{pct(row.ret_3m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Leadership */}
      <div className="rounded-lg border border-slate-700/60 bg-slate-900/60 p-3">
        <p className="mb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Market Leadership</p>
        <p className="text-xs text-slate-200 leading-relaxed">{leadership?.detail}</p>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
          {leadership?.btc_dominance != null && <span className="text-slate-400">BTC Dominance: <span className="text-white font-semibold">{leadership.btc_dominance}%</span>
            {leadership.btc_dominance_change_7d != null && <span className={leadership.btc_dominance_change_7d >= 0 ? ' text-amber-300' : ' text-cyan-300'}> ({leadership.btc_dominance_change_7d > 0 ? '+' : ''}{leadership.btc_dominance_change_7d.toFixed(1)}pp 7d)</span>}
          </span>}
          {leadership?.btc_performance_1m != null && <span className="text-slate-400">BTC 1M: <span className={`font-semibold ${leadership.btc_performance_1m >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{pct(leadership.btc_performance_1m)}</span></span>}
          {leadership?.avg_alt_sector_strength > 0 && <span className="text-slate-400">Avg Alt Strength: <span className="text-white font-semibold">{leadership.avg_alt_sector_strength}</span></span>}
        </div>
      </div>

      {/* 3. Sector Performance */}
      {sector_analysis?.sectors?.length > 0 && (
        <div className="rounded-lg border border-slate-700/60 bg-slate-900/60 p-3">
          <p className="mb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Crypto Sector Performance</p>
          <div className="space-y-1.5">
            {sector_analysis.sectors.map(s => (
              <SectorBar key={s.sector} {...s} isStrongest={s.sector === sector_analysis.strongest?.sector} />
            ))}
          </div>
          {sector_analysis.main_driver && (
            <p className="mt-2 text-[11px] text-slate-300">
              <span className="font-semibold text-white">Main driver:</span> {sector_analysis.main_driver.sector}
              {sector_analysis.main_driver.concentrated
                ? <span className="text-amber-300"> (concentrated — {sector_analysis.main_driver.note})</span>
                : <span className="text-emerald-300"> (broad participation)</span>}
            </p>
          )}
          {sector_analysis.rotating && <p className="mt-0.5 text-[10px] text-amber-300">Sector leadership appears to be rotating.</p>}
        </div>
      )}

      {/* 4. Breadth & Concentration */}
      <div className="rounded-lg border border-slate-700/60 bg-slate-900/60 p-3">
        <p className="mb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Market Breadth & Concentration</p>
        {breadth?.pct_rising != null ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-4 bg-slate-800 rounded overflow-hidden flex">
                <div className="h-full bg-emerald-500/50 flex items-center justify-center text-[10px] font-bold text-emerald-200"
                  style={{ width: `${breadth.pct_rising}%` }}>
                  {breadth.alts_rising} rising
                </div>
                <div className="h-full bg-red-500/30 flex items-center justify-center text-[10px] font-bold text-red-200"
                  style={{ width: `${100 - breadth.pct_rising}%` }}>
                  {breadth.alts_falling} falling
                </div>
              </div>
              <span className={`text-xs font-bold ${breadth.broad ? 'text-emerald-300' : 'text-amber-300'}`}>
                {breadth.pct_rising}%
              </span>
            </div>
            <p className="text-[11px] text-slate-300">{breadth.detail}</p>
            <div className="flex flex-wrap gap-3 text-[10px] text-slate-500">
              {breadth.btc_contribution && <span>{breadth.btc_contribution}</span>}
              {breadth.eth_contribution && <span>{breadth.eth_contribution}</span>}
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-slate-500">{breadth?.detail || 'Breadth data unavailable.'}</p>
        )}
      </div>

      {/* 5. Capital Flows */}
      <div className="rounded-lg border border-slate-700/60 bg-slate-900/60 p-3">
        <p className="mb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Capital Flow Intelligence</p>

        {/* 5a. External */}
        <div className="mb-3">
          <p className="text-[10px] font-semibold text-slate-500 mb-1">External Capital Flows</p>
          <div className="space-y-1">
            {capital_flows?.external?.etf_btc ? (
              <>
                <FlowBar label="BTC ETF (1d)" value={capital_flows.external.etf_btc.net_1d} unit="M" source={capital_flows.external.etf_btc.source} />
                <FlowBar label="BTC ETF (7d)" value={capital_flows.external.etf_btc.net_7d} unit="M" source="" />
                <FlowBar label="BTC ETF (30d)" value={capital_flows.external.etf_btc.net_30d} unit="M" source="" />
              </>
            ) : <p className="text-[11px] text-slate-500">BTC ETF flow data: Unavailable</p>}
            {capital_flows?.external?.etf_eth ? (
              <>
                <FlowBar label="ETH ETF (7d)" value={capital_flows.external.etf_eth.net_7d} unit="M" source={capital_flows.external.etf_eth.source} />
              </>
            ) : <p className="text-[11px] text-slate-500">ETH ETF flow data: Unavailable</p>}
            {capital_flows?.external?.stablecoin?.status === 'unavailable' && (
              <p className="text-[11px] text-slate-500">Stablecoin supply: Unavailable</p>
            )}
          </div>
        </div>

        {/* 5b. Exchange positioning */}
        <div className="mb-3">
          <p className="text-[10px] font-semibold text-slate-500 mb-1">Exchange Positioning</p>
          {capital_flows?.exchange_positioning?.btc ? (
            <div className="space-y-1">
              <FlowBar label="BTC 30d net" value={capital_flows.exchange_positioning.btc.net_30d} unit="BTC" source={capital_flows.exchange_positioning.btc.source} />
              <p className="text-[11px] text-slate-400">{capital_flows.exchange_positioning.summary}</p>
            </div>
          ) : <p className="text-[11px] text-slate-500">Exchange flow data: Unavailable</p>}
        </div>

        {/* 5c. Internal rotation */}
        <div>
          <p className="text-[10px] font-semibold text-slate-500 mb-1">Internal Rotation</p>
          {capital_flows?.internal_rotation?.description ? (
            <p className="text-[11px] text-slate-300">{capital_flows.internal_rotation.description}</p>
          ) : <p className="text-[11px] text-slate-500">Rotation evidence: Unavailable</p>}
        </div>
      </div>

      {/* Deep links */}
      <div className="flex flex-wrap gap-2 text-[10px]">
        <span className="text-slate-500">Detailed evidence:</span>
        {data.deep_links && Object.entries(data.deep_links).map(([key, route]) => (
          <a key={key} href={`/?section=${route}`} className="text-sky-400 hover:text-sky-300 underline underline-offset-2">
            {key.replace(/_/g, ' ')}
          </a>
        ))}
      </div>
    </div>
  );
};

export default MarketIntelligence;
