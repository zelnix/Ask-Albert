'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { API_BASE } from '../../lib/api';

/* ── Helpers ── */
const money = (v) => v == null ? '?' : `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const pct = (v) => v == null ? '' : `${Number(v).toFixed(1)}%`;

/* ── Alignment badge colors ── */
const ALIGN_COLORS = {
  following_bull: { bg: 'bg-emerald-500/15', text: 'text-emerald-300', label: 'Following Bull' },
  following_bear: { bg: 'bg-red-500/15', text: 'text-red-300', label: 'Following Bear' },
  between_scenarios: { bg: 'bg-amber-500/15', text: 'text-amber-300', label: 'Between Scenarios' },
  both_invalidated: { bg: 'bg-slate-500/15', text: 'text-slate-300', label: 'Both Invalidated' },
  forecast_window_completed: { bg: 'bg-blue-500/15', text: 'text-blue-300', label: 'Window Completed' },
  no_scenario: { bg: 'bg-slate-500/15', text: 'text-slate-400', label: 'No Scenario' },
  neutral: { bg: 'bg-slate-500/15', text: 'text-slate-400', label: 'Neutral' },
};

/* ── SVG price chart with all overlays ── */
const ScenarioChart = ({ data, showEMA, showRSI }) => {
  const { candles, volume_series, ema_20_series, ema_50_series, rsi_series,
    support_zones, resistance_zones, frozen_paths, scenario, vwap_from_high, vwap_from_low } = data;

  const W = 900, priceH = 280, volH = 80, rsiH = showRSI ? 60 : 0;
  const totalH = priceH + volH + rsiH + 30;
  const padL = 65, padR = 15, padT = 10;
  const chartW = W - padL - padR;

  // Price range from candles
  const prices = candles.flatMap(c => [c.high, c.low]);
  // Include S/R zone boundaries
  support_zones.slice(0, 2).forEach(z => { prices.push(z.low); prices.push(z.high); });
  resistance_zones.slice(0, 2).forEach(z => { prices.push(z.low); prices.push(z.high); });
  // Include frozen paths and trigger/invalidation levels
  if (frozen_paths) {
    (frozen_paths.bull_path || []).forEach(p => prices.push(p.price));
    (frozen_paths.bear_path || []).forEach(p => prices.push(p.price));
    if (frozen_paths.bull_trigger) prices.push(frozen_paths.bull_trigger);
    if (frozen_paths.bear_trigger) prices.push(frozen_paths.bear_trigger);
    if (frozen_paths.bull_invalidation) prices.push(frozen_paths.bull_invalidation);
    if (frozen_paths.bear_invalidation) prices.push(frozen_paths.bear_invalidation);
  }
  const minP = Math.min(...prices) * 0.998;
  const maxP = Math.max(...prices) * 1.002;
  const rangeP = maxP - minP || 1;
  const yP = (p) => padT + priceH - ((p - minP) / rangeP) * priceH;
  const n = candles.length;
  const barW = Math.max(2, chartW / n - 1);
  const xI = (i) => padL + (i / (n - 1 || 1)) * chartW;

  // Volume range
  const vols = volume_series.map(v => v.volume);
  const maxV = Math.max(...vols) || 1;
  const yV = (v) => priceH + 20 + volH - (v / maxV) * (volH - 5);

  // RSI
  const yR = (v) => priceH + volH + 25 + rsiH - ((v || 50) / 100) * (rsiH - 5);

  // Frozen path overlay (map day 0-7 to date indices)
  // When anchor_date is today or beyond last candle, start from the last candle
  let frozenBullPts = '', frozenBearPts = '';
  if (frozen_paths && (scenario?.anchor_date || scenario?.created_at)) {
    const anchorDate = scenario.anchor_date || (scenario.created_at || '').slice(0, 10);
    let anchorIdx = candles.findIndex(c => c.date >= anchorDate);
    if (anchorIdx < 0) anchorIdx = n - 1; // anchor is today/future — start from last candle

    // Extend x-range to accommodate projected path beyond existing candles
    const projDays = frozen_paths.bull_path?.length || 8;
    const totalPts = anchorIdx + projDays;
    const xProj = (i) => padL + (i / (Math.max(totalPts - 1, n - 1))) * chartW;

    frozenBullPts = (frozen_paths.bull_path || []).map((p, di) => {
      return `${di === 0 ? 'M' : 'L'}${xProj(anchorIdx + di)},${yP(p.price)}`;
    }).join(' ');
    frozenBearPts = (frozen_paths.bear_path || []).map((p, di) => {
      return `${di === 0 ? 'M' : 'L'}${xProj(anchorIdx + di)},${yP(p.price)}`;
    }).join(' ');
  }

  // EMA paths
  const ema20Pts = showEMA ? ema_20_series.map((e, i) => e.value ? `${i === 0 ? 'M' : 'L'}${xI(i)},${yP(e.value)}` : '').filter(Boolean).join(' ') : '';
  const ema50Pts = showEMA ? ema_50_series.map((e, i) => e.value ? `${i === 0 ? 'M' : 'L'}${xI(i)},${yP(e.value)}` : '').filter(Boolean).join(' ') : '';

  // Price line
  const priceLine = candles.map((c, i) => `${i === 0 ? 'M' : 'L'}${xI(i)},${yP(c.close)}`).join(' ');

  // VWAP line
  let vwapHighPts = '', vwapLowPts = '';
  if (vwap_from_high?.series?.length > 1) {
    const offset = n - vwap_from_high.series.length;
    vwapHighPts = vwap_from_high.series.map((v, i) => `${i === 0 ? 'M' : 'L'}${xI(offset + i)},${yP(v)}`).join(' ');
  }
  if (vwap_from_low?.series?.length > 1) {
    const offset = n - vwap_from_low.series.length;
    vwapLowPts = vwap_from_low.series.map((v, i) => `${i === 0 ? 'M' : 'L'}${xI(offset + i)},${yP(v)}`).join(' ');
  }

  // Date labels (show every ~15 bars)
  const dateLabels = candles.filter((_, i) => i % 15 === 0 || i === n - 1);

  return (
    <svg viewBox={`0 0 ${W} ${totalH}`} className="w-full" style={{ minHeight: 320 }} preserveAspectRatio="xMidYMid meet">
      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map(f => {
        const p = minP + f * rangeP;
        return <g key={f}>
          <line x1={padL} y1={yP(p)} x2={W - padR} y2={yP(p)} stroke="#334155" strokeWidth="0.5" strokeDasharray="3 3" />
          <text x={padL - 4} y={yP(p) + 3} textAnchor="end" fill="#94a3b8" fontSize="9">{money(p)}</text>
        </g>;
      })}

      {/* S/R Zone bands */}
      {support_zones.slice(0, 2).map((z, i) => (
        <g key={`sup-${i}`}>
          <rect x={padL} y={yP(z.high)} width={chartW} height={Math.max(1, yP(z.low) - yP(z.high))}
            fill="#22c55e" opacity={0.08 + z.score * 0.12} rx="1" />
          <line x1={padL} y1={yP(z.center)} x2={W - padR} y2={yP(z.center)}
            stroke="#22c55e" strokeWidth="0.7" strokeDasharray="4 4" opacity="0.5" />
          <text x={padL + 3} y={yP(z.center) + 10} fill="#4ade80" fontSize="8" opacity="0.8">
            S: {money(z.center)} ({z.strength_label})
          </text>
        </g>
      ))}
      {resistance_zones.slice(0, 2).map((z, i) => (
        <g key={`res-${i}`}>
          <rect x={padL} y={yP(z.high)} width={chartW} height={Math.max(1, yP(z.low) - yP(z.high))}
            fill="#ef4444" opacity={0.08 + z.score * 0.12} rx="1" />
          <line x1={padL} y1={yP(z.center)} x2={W - padR} y2={yP(z.center)}
            stroke="#ef4444" strokeWidth="0.7" strokeDasharray="4 4" opacity="0.5" />
          <text x={padL + 3} y={yP(z.center) - 4} fill="#f87171" fontSize="8" opacity="0.8">
            R: {money(z.center)} ({z.strength_label})
          </text>
        </g>
      ))}

      {/* Bull/Bear invalidation levels */}
      {frozen_paths?.bull_invalidation && (
        <g>
          <line x1={padL} y1={yP(frozen_paths.bull_invalidation)} x2={W - padR} y2={yP(frozen_paths.bull_invalidation)}
            stroke="#f87171" strokeWidth="1" strokeDasharray="6 3" opacity="0.6" />
          <text x={W - padR - 2} y={yP(frozen_paths.bull_invalidation) + 10} textAnchor="end" fill="#f87171" fontSize="8">
            Bull Inv. {money(frozen_paths.bull_invalidation)}
          </text>
        </g>
      )}
      {frozen_paths?.bear_invalidation && (
        <g>
          <line x1={padL} y1={yP(frozen_paths.bear_invalidation)} x2={W - padR} y2={yP(frozen_paths.bear_invalidation)}
            stroke="#34d399" strokeWidth="1" strokeDasharray="6 3" opacity="0.6" />
          <text x={W - padR - 2} y={yP(frozen_paths.bear_invalidation) - 4} textAnchor="end" fill="#34d399" fontSize="8">
            Bear Inv. {money(frozen_paths.bear_invalidation)}
          </text>
        </g>
      )}

      {/* VWAP lines */}
      {vwapHighPts && <path d={vwapHighPts} fill="none" stroke="#c084fc" strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />}
      {vwapLowPts && <path d={vwapLowPts} fill="none" stroke="#c084fc" strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />}

      {/* EMA overlays */}
      {showEMA && ema20Pts && <path d={ema20Pts} fill="none" stroke="#38bdf8" strokeWidth="1" opacity="0.6" />}
      {showEMA && ema50Pts && <path d={ema50Pts} fill="none" stroke="#fb923c" strokeWidth="1" opacity="0.6" />}

      {/* Frozen bull path */}
      {frozenBullPts && <path d={frozenBullPts} fill="none" stroke="#34d399" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.7" />}
      {/* Frozen bear path */}
      {frozenBearPts && <path d={frozenBearPts} fill="none" stroke="#f87171" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.7" />}

      {/* Actual price line */}
      <path d={priceLine} fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Current price dot */}
      <circle cx={xI(n - 1)} cy={yP(candles[n - 1]?.close)} r="3" fill="#a78bfa" />
      <text x={W - padR + 2} y={yP(candles[n - 1]?.close) + 3} fill="#a78bfa" fontSize="9" fontWeight="bold">
        {money(candles[n - 1]?.close)}
      </text>

      {/* Scenario publication marker */}
      {(scenario?.anchor_date || scenario?.created_at) && (() => {
        const anchorDate = scenario.anchor_date || (scenario.created_at || '').slice(0, 10);
        let idx = candles.findIndex(c => c.date >= anchorDate);
        if (idx < 0) idx = n - 1;
        return <g>
          <line x1={xI(idx)} y1={padT} x2={xI(idx)} y2={padT + priceH} stroke="#fbbf24" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
          <text x={xI(idx)} y={padT + 8} textAnchor="middle" fill="#fbbf24" fontSize="7" fontWeight="bold">PUB</text>
        </g>;
      })()}

      {/* ── Volume panel ── */}
      <line x1={padL} y1={priceH + 18} x2={W - padR} y2={priceH + 18} stroke="#475569" strokeWidth="0.5" />
      <text x={padL - 4} y={priceH + 28} textAnchor="end" fill="#64748b" fontSize="8">Vol</text>
      {volume_series.map((v, i) => {
        const x = xI(i);
        const h = (v.volume / maxV) * (volH - 5);
        return <rect key={i} x={x - barW / 2} y={priceH + 20 + volH - h - 0} width={barW}
          height={Math.max(1, h)} fill={v.up ? '#22c55e' : '#ef4444'} opacity="0.55" rx="0.5" />;
      })}
      {/* 20-day volume avg line */}
      {volume_series.filter(v => v.avg_20).length > 1 && (
        <path d={volume_series.map((v, i) => v.avg_20 ? `${i === 0 || !volume_series[i - 1]?.avg_20 ? 'M' : 'L'}${xI(i)},${yV(v.avg_20)}` : '').filter(Boolean).join(' ')}
          fill="none" stroke="#fbbf24" strokeWidth="1" strokeDasharray="3 2" opacity="0.6" />
      )}

      {/* ── RSI panel ── */}
      {showRSI && <>
        <line x1={padL} y1={priceH + volH + 23} x2={W - padR} y2={priceH + volH + 23} stroke="#475569" strokeWidth="0.5" />
        <text x={padL - 4} y={priceH + volH + 33} textAnchor="end" fill="#64748b" fontSize="8">RSI</text>
        {/* Overbought/oversold bands */}
        <rect x={padL} y={yR(70)} width={chartW} height={yR(30) - yR(70)} fill="#8b5cf6" opacity="0.05" />
        <line x1={padL} y1={yR(70)} x2={W - padR} y2={yR(70)} stroke="#8b5cf6" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.3" />
        <line x1={padL} y1={yR(30)} x2={W - padR} y2={yR(30)} stroke="#8b5cf6" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.3" />
        <text x={padL + 2} y={yR(70) + 8} fill="#8b5cf6" fontSize="7" opacity="0.6">70</text>
        <text x={padL + 2} y={yR(30) - 2} fill="#8b5cf6" fontSize="7" opacity="0.6">30</text>
        <path d={rsi_series.map((r, i) => r.value != null ? `${i === 0 || rsi_series[i - 1]?.value == null ? 'M' : 'L'}${xI(i)},${yR(r.value)}` : '').filter(Boolean).join(' ')}
          fill="none" stroke="#a78bfa" strokeWidth="1.2" opacity="0.8" />
      </>}

      {/* Date labels */}
      {dateLabels.map((c) => {
        const i = candles.indexOf(c);
        return <text key={c.date} x={xI(i)} y={totalH - 2} textAnchor="middle" fill="#64748b" fontSize="8">{c.date.slice(5)}</text>;
      })}
    </svg>
  );
};

/* ── Main Component ── */
const BTCScenarioTracker = ({ compact = false, onOpen }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showEMA, setShowEMA] = useState(true);
  const [showRSI, setShowRSI] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/v1/btc-scenario-tracker`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.status === 'ready') setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-8 text-slate-400 text-xs">Loading tracker...</div>;
  if (!data) return <div className="text-slate-500 text-xs py-4">Scenario tracker unavailable.</div>;

  const align = ALIGN_COLORS[data.alignment?.state] || ALIGN_COLORS.neutral;
  const bull = data.scenario?.scenarios?.find(s => s.type === 'bull');
  const bear = data.scenario?.scenarios?.find(s => s.type === 'bear');
  const bullInv = data.scenario?.bull_invalidated;
  const bearInv = data.scenario?.bear_invalidated;
  const daysRemaining = data.alignment?.days_remaining;
  const daysElapsed = data.alignment?.days_elapsed;
  const breakStatus = data.break_status || {};

  if (compact) {
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className={`rounded px-1.5 py-0.5 font-semibold ${align.bg} ${align.text}`}>{align.label}</span>
          {daysRemaining != null && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-400">Day {daysElapsed} / {daysElapsed + daysRemaining}</span>}
          {bullInv && <span className="rounded bg-red-500/15 px-1.5 py-0.5 font-bold text-red-400">Bull ✗</span>}
          {bearInv && <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-bold text-emerald-400">Bear ✗</span>}
        </div>
        <ScenarioChart data={data} showEMA={false} showRSI={false} />
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-slate-400">
          {bull && <span>↑ Bull: {money(bull.trigger_level)} → {money(bull.target_level)} ({bull.probability}%)</span>}
          {bear && <span>↓ Bear: {money(bear.trigger_level)} → {money(bear.target_level)} ({bear.probability}%)</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-white">BTC Scenario Tracker</h3>
          <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${align.bg} ${align.text}`}>{align.label}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          {daysRemaining != null && <span className="text-slate-400">Day {daysElapsed} · {daysRemaining}d remaining</span>}
          <label className="flex items-center gap-1 cursor-pointer text-slate-400 hover:text-slate-200">
            <input type="checkbox" checked={showEMA} onChange={() => setShowEMA(!showEMA)} className="h-3 w-3 rounded border-slate-600 bg-slate-800 accent-sky-500" />
            EMAs
          </label>
          <label className="flex items-center gap-1 cursor-pointer text-slate-400 hover:text-slate-200">
            <input type="checkbox" checked={showRSI} onChange={() => setShowRSI(!showRSI)} className="h-3 w-3 rounded border-slate-600 bg-slate-800 accent-sky-500" />
            RSI
          </label>
        </div>
      </div>

      {/* Alignment detail */}
      {data.alignment?.detail && (
        <p className="text-xs text-slate-400 leading-snug">{data.alignment.detail}</p>
      )}

      {/* Chart */}
      <div className="rounded-lg border border-slate-700/60 bg-slate-900/60 p-2 overflow-x-auto">
        <ScenarioChart data={data} showEMA={showEMA} showRSI={showRSI} />
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-[11px]">
        <div className="rounded-md border border-slate-700/50 bg-slate-800/50 p-2">
          <div className="text-slate-500">RSI(14)</div>
          <div className={`font-bold ${data.rsi_14 > 70 ? 'text-red-400' : data.rsi_14 < 30 ? 'text-emerald-400' : 'text-white'}`}>
            {data.rsi_14?.toFixed(1)}
            <span className="ml-1 text-[10px] font-normal text-slate-500">
              {data.rsi_14 > 70 ? 'Overbought' : data.rsi_14 < 30 ? 'Oversold' : 'Neutral'}
            </span>
          </div>
        </div>
        <div className="rounded-md border border-slate-700/50 bg-slate-800/50 p-2">
          <div className="text-slate-500">ATR(14)</div>
          <div className="font-bold text-white">{money(data.atr_14)} <span className="text-[10px] font-normal text-slate-500">{pct(data.atr_pct)}</span></div>
        </div>
        <div className="rounded-md border border-slate-700/50 bg-slate-800/50 p-2">
          <div className="text-slate-500">Volume</div>
          <div className="font-bold text-white">{data.volume_ratio?.toFixed(2)}x <span className="text-[10px] font-normal text-slate-500">{data.volume_status}</span></div>
        </div>
        <div className="rounded-md border border-slate-700/50 bg-slate-800/50 p-2">
          <div className="text-slate-500">EMAs</div>
          <div className="font-bold text-white">
            <span className="text-sky-400">20: {money(data.ema_20)}</span>
            <span className="ml-1 text-orange-400">50: {money(data.ema_50)}</span>
          </div>
        </div>
      </div>

      {/* Scenarios + S/R Zones */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {/* Scenario paths */}
        {bull && bear && (
          <div className="rounded-md border border-slate-700/50 bg-slate-800/50 p-2.5">
            <div className="text-[10px] font-semibold uppercase text-slate-500 mb-1">Historical Scenario Ranges</div>
            <div className="space-y-1 text-[11px]">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${bullInv ? 'bg-slate-600' : 'bg-emerald-400'}`} />
                <span className={bullInv ? 'text-slate-500 line-through' : 'text-emerald-300'}>
                  Bull: {money(bull.trigger_level)} → {money(bull.target_level)} ({bull.probability}%)
                </span>
                {bullInv && <span className="text-red-400 text-[10px]">✗</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${bearInv ? 'bg-slate-600' : 'bg-red-400'}`} />
                <span className={bearInv ? 'text-slate-500 line-through' : 'text-red-300'}>
                  Bear: {money(bear.trigger_level)} → {money(bear.target_level)} ({bear.probability}%)
                </span>
                {bearInv && <span className="text-emerald-400 text-[10px]">✗</span>}
              </div>
            </div>
          </div>
        )}

        {/* S/R Zones */}
        <div className="rounded-md border border-slate-700/50 bg-slate-800/50 p-2.5">
          <div className="text-[10px] font-semibold uppercase text-slate-500 mb-1">Swing-Point Zones</div>
          <div className="space-y-0.5 text-[11px]">
            {data.support_zones.slice(0, 2).map((z, i) => (
              <div key={`s${i}`} className="flex items-center gap-1 text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                S: {money(z.low)}–{money(z.high)}
                <span className="text-slate-500 text-[10px]">{z.strength_label} · {z.touch_count} touches</span>
              </div>
            ))}
            {data.resistance_zones.slice(0, 2).map((z, i) => (
              <div key={`r${i}`} className="flex items-center gap-1 text-red-300">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                R: {money(z.low)}–{money(z.high)}
                <span className="text-slate-500 text-[10px]">{z.strength_label} · {z.touch_count} touches</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Break confirmation status */}
      {(breakStatus.support_detail || breakStatus.resistance_detail) && (
        <div className="rounded-md border border-slate-700/50 bg-slate-800/50 p-2.5 text-[11px]">
          <div className="text-[10px] font-semibold uppercase text-slate-500 mb-1">Break Confirmation</div>
          {breakStatus.support_detail && (
            <p className={breakStatus.support === 'confirmed_break' ? 'text-red-300' : breakStatus.support === 'testing' ? 'text-amber-300' : 'text-slate-400'}>
              {breakStatus.support_detail}
            </p>
          )}
          {breakStatus.resistance_detail && (
            <p className={breakStatus.resistance === 'confirmed_break' ? 'text-emerald-300' : breakStatus.resistance === 'testing' ? 'text-amber-300' : 'text-slate-400'}>
              {breakStatus.resistance_detail}
            </p>
          )}
        </div>
      )}

      {/* VWAP info */}
      {(data.vwap_from_high || data.vwap_from_low) && (
        <div className="flex flex-wrap gap-3 text-[10px] text-slate-500">
          {data.vwap_from_high?.current_value && (
            <span>Anchored VWAP (from swing high{data.vwap_from_high.anchor_date ? ` ${data.vwap_from_high.anchor_date}` : ''}): <span className="text-purple-300">{money(data.vwap_from_high.current_value)}</span></span>
          )}
          {data.vwap_from_low?.current_value && (
            <span>Anchored VWAP (from swing low{data.vwap_from_low.anchor_date ? ` ${data.vwap_from_low.anchor_date}` : ''}): <span className="text-purple-300">{money(data.vwap_from_low.current_value)}</span></span>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500 border-t border-slate-800 pt-2">
        <span className="flex items-center gap-1"><span className="inline-block h-[2px] w-3 bg-purple-400 rounded" /> Actual Price</span>
        <span className="flex items-center gap-1"><span className="inline-block h-[2px] w-3 bg-emerald-400 rounded" style={{ borderBottom: '1px dashed' }} /> Bull Path (frozen)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-[2px] w-3 bg-red-400 rounded" style={{ borderBottom: '1px dashed' }} /> Bear Path (frozen)</span>
        {showEMA && <>
          <span className="flex items-center gap-1"><span className="inline-block h-[2px] w-3 bg-sky-400 rounded" /> EMA 20</span>
          <span className="flex items-center gap-1"><span className="inline-block h-[2px] w-3 bg-orange-400 rounded" /> EMA 50</span>
        </>}
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 bg-emerald-500/30 rounded" /> Support Zone</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 bg-red-500/30 rounded" /> Resistance Zone</span>
        {(data.vwap_from_high || data.vwap_from_low) && (
          <span className="flex items-center gap-1"><span className="inline-block h-[2px] w-3 bg-purple-400/50 rounded" style={{ borderBottom: '1px dashed' }} /> VWAP</span>
        )}
        <span className="flex items-center gap-1"><span className="inline-block h-[2px] w-3 bg-yellow-400 rounded" style={{ borderBottom: '1px dashed' }} /> Publication</span>
      </div>
    </div>
  );
};

export default BTCScenarioTracker;
