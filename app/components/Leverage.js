'use client';

import React from 'react';
import { Brain, Gauge, History, Lock, Activity, Zap } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Line, Area, Bar, BarChart, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Cell } from 'recharts';
import { Card } from '@/components/ui/card';
import { API_BASE } from '../lib/api';
import { riskColor, TF_TOUCH } from '../lib/format';
import { sec } from '../lib/sections';
import { SectionHead, AiReview, InfoTip } from './shared';
import MetricProvenance, { observed } from './MetricProvenance';

function LiveOrderFlow() {
  const [o, setO] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    const tick = () => fetch(`${API_BASE}/v1/orderflow`, { cache: 'no-store' })
      .then((r) => r.json()).then((j) => { if (alive) setO(j); }).catch(() => {});
    tick();
    const id = setInterval(tick, 2500);
    return () => { alive = false; clearInterval(id); };
  }, []);
  if (!o) return null;
  const live = o.status === 'live' && Boolean(o.as_of);
  const liq = o.liquidations || {};
  const cvdUp = (o.cvd_window_btc ?? 0) >= 0;
  const fUsd = (v) => (v == null ? '—' : '$' + (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(0) + 'k' : Math.round(v)));
  const flowColor = o.flow_state === 'Aggressive buying' ? '#34d399' : o.flow_state === 'Aggressive selling' ? '#f87171' : '#94a3b8';
  return (
    <Card className="border-0 bg-slate-900 p-4 ring-1 ring-slate-800">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white"><Activity className="h-4 w-4 text-sky-400" />Live Order Flow</h3>
        <InfoTip below text="Real-time trade flow from Coinbase + Bybit WebSocket streams, aggregated every second. CVD = cumulative volume delta (buy − sell BTC). OFI = order-flow imbalance per second. VPIN ≈ order-flow toxicity (0–1, higher = more one-sided). Liquidation cascade watch flags >$1M force-liquidated in 10s." />
        <span className={`ml-auto flex items-center gap-1 text-[10px] font-bold ${live ? 'text-emerald-400' : 'text-amber-400'}`}>
          <span className={`h-2 w-2 rounded-full ${live ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />{live ? 'LIVE' : (o.status || 'connecting').toUpperCase()}
        </span>
      </div>
      {live && <MetricProvenance source="Coinbase + Bybit public order-flow streams" asOf={o.as_of} />}
      {!live ? (
        <p className="text-sm text-amber-300">Coming soon · {o.message || 'No current dated order-flow observation.'} Stale values are not counted as neutral evidence.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><p className="text-[10px] uppercase text-slate-500">Flow (1m)</p><p className="mt-1 text-sm font-black" style={{ color: flowColor }}>{o.flow_state || 'Coming soon'}</p><p className="text-[10px] text-slate-600">{o.buy_ratio_pct != null ? `${o.buy_ratio_pct}% buys` : 'Buy ratio Coming soon'}</p></div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><p className="text-[10px] uppercase text-slate-500">CVD (1m)</p><p className="mt-1 text-sm font-black" style={{ color: cvdUp ? '#34d399' : '#f87171' }}>{o.cvd_window_btc != null ? `${cvdUp ? '+' : ''}${o.cvd_window_btc} BTC` : 'Coming soon'}</p></div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><p className="text-[10px] uppercase text-slate-500">OFI /s</p><p className="mt-1 text-sm font-black text-slate-100">{o.ofi_btc_per_s ?? 'Coming soon'}</p></div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><p className="text-[10px] uppercase text-slate-500">VPIN</p><p className="mt-1 text-sm font-black" style={{ color: o.vpin == null ? '#94a3b8' : o.vpin > 0.6 ? '#fbbf24' : '#34d399' }}>{o.vpin ?? 'Coming soon'}</p></div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><p className="text-[10px] uppercase text-slate-500">Trades/s</p><p className="mt-1 text-sm font-black text-slate-100">{o.trades_per_sec ?? 'Coming soon'}</p></div>
            <div className={`rounded-xl border p-3 ${liq.long_usd_1m != null && liq.short_usd_1m != null && liq.cascade_risk ? 'border-red-500/40 bg-red-500/10' : 'border-slate-800 bg-slate-950/50'}`}><p className="text-[10px] uppercase text-slate-500 flex items-center gap-1"><Zap className="h-3 w-3" />Liq (1m)</p><p className="mt-1 text-sm font-black text-slate-100">{liq.long_usd_1m != null && liq.short_usd_1m != null ? fUsd(liq.long_usd_1m + liq.short_usd_1m) : 'Coming soon'}</p><p className="text-[10px] text-slate-600">{liq.long_usd_1m != null && liq.short_usd_1m != null ? liq.cascade_risk ? 'cascade risk' : `L ${fUsd(liq.long_usd_1m)} / S ${fUsd(liq.short_usd_1m)}` : 'No observed liquidation totals'}</p></div>
          </div>
          {(o.history || []).length > 3 && (
            <div className="mt-3">
              <p className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500"><span>Session CVD trend (~90s)</span><span className="normal-case text-slate-600">net liq/1m: {fUsd(liq.net_usd_1m)}</span></p>
              <div className="h-16 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={o.history} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
                    <YAxis hide domain={['dataMin', 'dataMax']} />
                    <XAxis dataKey="t" hide />
                    <ReferenceLine y={0} stroke="#334155" strokeDasharray="2 2" />
                    <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }}
                      labelFormatter={() => ''} formatter={(v) => [`${v} BTC`, 'Session CVD']} />
                    <Line dataKey="cvd" stroke={cvdUp ? '#34d399' : '#f87171'} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {o.orderbook && o.orderbook.bins && o.orderbook.bins.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500">
                <span>Resting liquidity (±{o.orderbook.band_pct}%)</span>
                <span className="normal-case text-slate-600">walls: <span className="text-emerald-400">bid {fUsd(o.orderbook.max_bid_wall?.usd)}</span> · <span className="text-red-400">ask {fUsd(o.orderbook.max_ask_wall?.usd)}</span></span>
              </p>
              <div className="flex h-10 w-full overflow-hidden rounded-md ring-1 ring-slate-800">
                {(() => {
                  const bins = o.orderbook.bins;
                  const mx = Math.max(1, ...bins.map((b) => Math.max(b.bid_usd || 0, b.ask_usd || 0)));
                  return bins.map((b, i) => {
                    const isBid = (b.bid_usd || 0) >= (b.ask_usd || 0);
                    const usd = isBid ? (b.bid_usd || 0) : (b.ask_usd || 0);
                    const a = Math.min(1, usd / mx);
                    const bg = usd <= 0 ? 'transparent' : isBid ? `rgba(52,211,153,${0.12 + a * 0.78})` : `rgba(248,113,113,${0.12 + a * 0.78})`;
                    return <div key={i} title={`$${Math.round(b.price).toLocaleString()} · ${isBid ? 'bids' : 'asks'} ${fUsd(usd)}`} className="flex-1 border-r border-slate-950/40" style={{ background: bg }} />;
                  });
                })()}
              </div>
              <div className="mt-0.5 flex justify-between text-[9px] text-slate-600"><span>−{o.orderbook.band_pct}% (bids)</span><span>mid ${Math.round(o.orderbook.mid).toLocaleString()}</span><span>+{o.orderbook.band_pct}% (asks)</span></div>
            </div>
          )}
          {o.orderbook?.depth_imbalance && (
            <div className="mt-3">
              <p className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500">
                <span>Depth imbalance (±{o.orderbook.band_pct}%)</span>
                <span className="normal-case font-semibold" style={{ color: o.orderbook.depth_imbalance.state === 'Bids stacked' ? '#34d399' : o.orderbook.depth_imbalance.state === 'Asks stacked' ? '#f87171' : '#94a3b8' }}>{o.orderbook.depth_imbalance.state} · {o.orderbook.depth_imbalance.bid_pct}% bids</span>
              </p>
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div className="h-full bg-emerald-500/70" style={{ width: `${o.orderbook.depth_imbalance.bid_pct}%` }} />
                <div className="h-full bg-red-500/70" style={{ width: `${100 - o.orderbook.depth_imbalance.bid_pct}%` }} />
              </div>
              <div className="mt-0.5 flex justify-between text-[9px] text-slate-600"><span>bids {fUsd(o.orderbook.depth_imbalance.bid_usd_total)}</span><span>asks {fUsd(o.orderbook.depth_imbalance.ask_usd_total)}</span></div>
              {(o.history || []).some((x) => x.imb != null) && (
                <div className="mt-1 h-10 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={(o.history || []).filter((x) => x.imb != null)} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
                      <YAxis hide domain={[0, 100]} />
                      <XAxis dataKey="t" hide />
                      <ReferenceLine y={50} stroke="#475569" strokeDasharray="2 2" />
                      <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }}
                        labelFormatter={() => ''} formatter={(v) => [`${v}% bids`, 'Depth imbalance']} />
                      <Line dataKey="imb" stroke="#38bdf8" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
          {(o.walls?.recent_events || []).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {o.walls.recent_events.slice().reverse().map((e, i) => (
                <span key={i} className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${e.event === 'pulled' ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : e.side === 'bid' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-red-500/40 bg-red-500/10 text-red-300'}`}>
                  {e.event === 'pulled' ? '✕ ' : e.side === 'bid' ? '⬆ ' : '⬇ '}{fUsd(e.usd)} {e.side} wall {e.event === 'pulled' ? 'pulled' : 'appeared'}{e.price ? ` @ ${Math.round(e.price).toLocaleString()}` : ''}
                </span>
              ))}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-600">
            {Object.entries(o.venues || {}).map(([v, st]) => (
              <span key={v} className="flex items-center gap-1"><span className={`h-1.5 w-1.5 rounded-full ${st === 'live' ? 'bg-emerald-400' : 'bg-amber-400'}`} />{v}</span>
            ))}
            <span className="ml-auto italic">WebSocket → Redis Streams → 1s aggregator{o.redis ? '' : ' (in-memory)'}</span>
          </div>
        </>
      )}
    </Card>
  );
}


function LeverageSection() {
  const [tf, setTf] = React.useState('4H');
  const [d, setD] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    let alive = true; setLoading(true);
    fetch(`${API_BASE}/v1/leverage?timeframe=${tf}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (alive) { setD(j); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tf]);

  const fUsd = (v) => v == null ? '—' : '$' + (Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Number(v).toLocaleString());
  const pressColor = (p) => ({ LOW: 'text-emerald-400', MODERATE: 'text-lime-400', ELEVATED: 'text-amber-400', HIGH: 'text-orange-400', EXTREME: 'text-red-400' }[p] || 'text-slate-300');
  const biasColor = (b) => b === 'Long Dominant' ? 'text-emerald-400' : b === 'Short Dominant' ? 'text-red-400' : 'text-slate-300';
  const sqColor = (x) => x === 'Long Squeeze Risk' ? 'text-red-400' : x === 'Short Squeeze Risk' ? 'text-emerald-400' : 'text-slate-300';
  const riskColor = (l) => ({ Low: 'text-emerald-400', Normal: 'text-lime-400', Moderate: 'text-amber-400', Elevated: 'text-orange-400', High: 'text-red-400', Extreme: 'text-red-400' }[l] || 'text-slate-300');
  const ttime = (t) => { try { return new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

  if (loading && !d) return (<div className="space-y-5"><SectionHead icon={Gauge} title="Leverage" blurb={sec('leverage').blurb} coin="BTC" /><Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800"><p className="text-sm text-slate-500">Loading observed leverage data…</p></Card></div>);
  if (!d || d.status !== 'ready') return (<div className="space-y-5"><SectionHead icon={Gauge} title="Leverage" blurb={sec('leverage').blurb} coin="BTC" /><Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800"><p className="text-sm text-amber-300">Coming soon · no verified leverage reading is available. Other market screens remain accessible.</p></Card></div>);

  const p = d.positioning || {}, oi = d.open_interest || {}, f = d.funding || {}, bm = d.bitmark || {};
  const readyPos = observed(p.account_ratio, p.source, p.as_of) && p.status === 'ready';
  const readyOi = observed(oi.value_usd ?? oi.change_tf_pct, oi.source, oi.as_of) && oi.status === 'ready';
  const readyFund = observed(f.rate, f.source, f.as_of) && f.status === 'ready';
  const oiChart = readyOi ? (oi.series || []).map((x) => ({ t: x.t, oi: x.oi, price: x.price })).filter((x) => x.oi != null) : [];
  const fChart = readyFund ? (f.series || []).map((x) => ({ t: x.t, rate: x.rate })) : [];

  return (
    <div className="space-y-5">
      <SectionHead icon={Gauge} title="Leverage" blurb="Long & short positioning, market leverage and liquidation pressure" coin="BTC" />

      <LiveOrderFlow />

      <Card className="border-0 bg-slate-900 p-4 ring-1 ring-slate-800">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div><div className="text-[11px] text-slate-500">BTC price</div><div className="text-lg font-bold text-white">{observed(d.price, d.price_source, d.price_as_of) ? '$' + Number(d.price).toLocaleString() : 'Coming soon'} {observed(d.price_change_24h, d.price_source, d.price_as_of) && <span className={`text-xs font-semibold ${d.price_change_24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{d.price_change_24h >= 0 ? '+' : ''}{d.price_change_24h}%</span>}</div><MetricProvenance source={d.price_source} asOf={d.price_as_of} /></div>
          <div><div className="text-[11px] text-slate-500">Measured derivatives</div><div className="text-sm text-slate-300">{d.dataAvailability === 'ready' ? 'Partial readings available' : 'Coming soon'}</div></div>
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/40 p-1">
            {['1H', '4H', '1D', '7D'].map((x) => (<button key={x} onClick={() => setTf(x)} className={`${TF_TOUCH} rounded px-2.5 py-1 text-xs font-semibold ${tf === x ? 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/40' : 'text-slate-500 hover:text-slate-300'}`}>{x}</button>))}
          </div>
        </div>
      </Card>

      <AiReview section="leverage" text="Albert is reviewing dated leverage readings; missing factors are excluded…" voice />

      <Card className="border-0 bg-gradient-to-br from-slate-900 to-slate-900/60 p-6 ring-1 ring-slate-800">
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {['Leverage pressure', 'Market bias', 'Squeeze risk'].map((label) => <div key={label} className="rounded-lg border border-slate-800 bg-slate-950/40 p-4"><p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p><p className="text-lg font-bold text-amber-300">Coming soon</p><p className="text-[11px] text-slate-500">No verified composite reading</p></div>)}
        </div>
        <p className="rounded-lg border border-sky-500/20 bg-sky-500/[0.05] p-3 text-sm text-slate-300">Measured funding, positioning and open interest appear independently below. Missing inputs are never counted as balanced or neutral.</p>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
          <h3 className="mb-4 flex items-center gap-1 font-semibold text-white">Long vs Short Positioning<InfoTip below text="Share of leveraged accounts positioned long vs short (OKX). A ratio above 1 means more accounts are long than short." /></h3>
          {readyPos ? <>
            <div className="mb-1 flex justify-between text-sm font-semibold"><span className="text-emerald-400">Long {p.long_pct}%</span><span className="text-red-400">{p.short_pct}% Short</span></div>
            <div className="flex h-6 overflow-hidden rounded-lg"><div className="bg-emerald-500/70" style={{ width: `${p.long_pct}%` }} /><div className="bg-red-500/70" style={{ width: `${p.short_pct}%` }} /></div>
            <p className="mt-3 text-sm text-slate-200">Observed account ratio: {p.account_ratio}{p.account_ratio_prev != null ? ` · previous ${p.account_ratio_prev}` : ''}</p>
            <MetricProvenance source={p.source} asOf={p.as_of} />
            {p.ratio_change_tf != null && <p className="mt-2 text-xs text-slate-400">Change over {d.timeframe}: {p.ratio_change_tf > 0 ? '+' : ''}{p.ratio_change_tf} · {p.trend || 'trend unavailable'}</p>}
          </> : <p className="text-sm text-amber-300">Coming soon · no dated OKX account positioning observation</p>}
          <p className="mt-2 text-xs text-slate-500">Size-weighted position ratio: Coming soon</p>
        </Card>

        <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
          <h3 className="mb-3 flex items-center gap-1 font-semibold text-white">Open Interest<InfoTip below text="Total value of leveraged futures positions currently open. Rising OI means new leveraged money entering; falling OI means positions closing." /></h3>
          {readyOi ? <>
            <div className="mb-3 flex flex-wrap items-end gap-4"><div><div className="text-2xl font-bold text-white">{oi.value_usd != null ? fUsd(oi.value_usd) : 'USD amount Coming soon'}</div><div className="text-[11px] text-slate-500">OKX open interest</div></div>{oi.change_tf_pct != null && <div className={`text-sm font-semibold ${oi.change_tf_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{oi.change_tf_pct >= 0 ? '+' : ''}{oi.change_tf_pct}% <span className="text-[11px] text-slate-500">/ {d.timeframe}</span></div>}{oi.state && <span className="rounded border border-slate-600 px-1.5 py-0.5 text-[10px] text-slate-300">{oi.state}</span>}</div>
            <MetricProvenance source={oi.source} asOf={oi.as_of} />
          </> : <p className="text-sm text-amber-300">Coming soon · no dated OKX open-interest observation</p>}
          {oiChart.length > 1 && <div className="mt-3 h-32 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={oiChart} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="t" hide />
                <YAxis yAxisId="p" hide domain={['auto', 'auto']} />
                <YAxis yAxisId="oi" hide domain={['auto', 'auto']} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }} labelFormatter={() => ''} formatter={(v, n) => [n === 'price' ? '$' + Number(v).toLocaleString() : fUsd(v), n === 'price' ? 'Price' : 'OI']} />
                <Area yAxisId="oi" type="monotone" dataKey="oi" stroke="#a78bfa" fill="#a78bfa22" strokeWidth={1.4} dot={false} />
                <Line yAxisId="p" type="monotone" dataKey="price" stroke="#38bdf8" strokeWidth={1.6} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>}
          {readyOi && oi.interpretation && <p className="mt-2 text-[11px] text-slate-400">{oi.interpretation}</p>}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
          <h3 className="mb-3 flex items-center gap-1 font-semibold text-white">Funding Rates<InfoTip below text="Periodic payment between longs and shorts on perpetual futures. Positive = longs pay shorts (long demand); negative = shorts pay longs." /></h3>
          {readyFund ? <><div className="mb-3 flex flex-wrap items-center gap-3"><div className={`text-2xl font-bold ${f.rate >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{f.rate >= 0 ? '+' : ''}{f.rate}%</div><span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">{f.direction || 'direction unavailable'} · {f.trend || 'trend unavailable'}</span></div><MetricProvenance source={f.source} asOf={f.as_of} /></> : <p className="text-sm text-amber-300">Coming soon · no dated funding observation</p>}
          {fChart.length > 1 && <div className="mt-3 h-20 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fChart} margin={{ top: 2, right: 2, left: -20, bottom: 0 }}>
                <ReferenceLine y={0} stroke="#475569" />
                <YAxis hide /><XAxis dataKey="t" hide />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }} labelFormatter={() => ''} formatter={(v) => [v + '%', 'Funding']} />
                <Bar dataKey="rate">{fChart.map((x, i) => <Cell key={i} fill={x.rate >= 0 ? '#34d399' : '#f87171'} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>}
          <div className="mt-2 flex flex-wrap gap-2">{readyFund && (f.exchanges || []).filter((e) => observed(e.rate, e.source, e.as_of)).map((e, i) => (<span key={i} className="rounded border border-slate-800 bg-slate-950/40 px-2 py-0.5 text-[11px] text-slate-300">{e.name}: {e.rate}% <MetricProvenance source={e.source} asOf={e.as_of} /></span>))}</div>
          {readyFund && f.interpretation && <p className="mt-2 text-[11px] text-slate-400">{f.interpretation}</p>}
        </Card>

        <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
          <h3 className="mb-3 flex items-center gap-1 font-semibold text-white">Estimated Leverage<InfoTip below text="An estimated leverage percentile is not available from the observed public feeds." /></h3>
          <div className="flex h-28 flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/30 p-4 text-center">
            <Lock className="mb-2 h-5 w-5 text-slate-600" />
            <div className="text-sm font-semibold text-amber-300">Coming soon</div>
            <p className="mt-1 text-[11px] text-slate-500">No measured estimated-leverage reading. Not used in Albert’s analysis.</p>
          </div>
        </Card>
      </div>

      <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
        <h3 className="mb-3 flex items-center gap-1 font-semibold text-white">Liquidations<InfoTip below text="Long and short liquidation totals require a dated observed feed. No estimate is shown." /></h3>
        <div className="flex h-28 flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/30 p-4 text-center">
          <Lock className="mb-2 h-5 w-5 text-slate-600" />
          <div className="text-sm font-semibold text-amber-300">Coming soon</div>
          <p className="mt-1 text-[11px] text-slate-500">No observed liquidation totals. Missing data is not zero.</p>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
          <div className="mb-3 flex flex-wrap items-center gap-2"><h3 className="flex items-center gap-1 font-semibold text-white">Liquidation Heatmap<InfoTip below text="Observed liquidation-level zones are not available; market price is not a liquidation zone." /></h3></div>
          <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/30 p-4 text-center">
            <Lock className="mb-2 h-6 w-6 text-slate-600" />
            <div className="text-sm font-semibold text-amber-300">Coming soon</div>
            <p className="mt-1 max-w-xs text-[11px] text-slate-500">No measured liquidation-level map is available.</p>
          </div>
        </Card>

        <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
          <h3 className="mb-4 flex items-center gap-1 font-semibold text-white">Squeeze Risk<InfoTip below text="No measured forced-liquidation levels or size-weighted position estimates are available." /></h3>
          <div className="flex h-28 flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/30 p-4 text-center"><Lock className="mb-2 h-5 w-5 text-slate-600" /><p className="text-sm font-semibold text-amber-300">Coming soon</p><p className="mt-1 text-[11px] text-slate-500">An absent squeeze score is not a neutral score.</p></div>
        </Card>
      </div>

      <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
        <h3 className="mb-3 flex items-center gap-2 font-semibold text-white"><Brain className="h-5 w-5 text-sky-400" />CryptoMarkAI Leverage Intelligence</h3>
        <ul className="space-y-1.5">{(bm.observations || []).map((o, i) => (<li key={i} className="flex gap-2 text-sm text-slate-300"><span className="text-sky-500">•</span>{o}</li>))}</ul>
        <div className="mt-4 rounded-lg border border-sky-500/20 bg-sky-500/[0.05] p-3"><div className="text-[11px] uppercase tracking-wider text-slate-500">Overall Leverage Assessment</div><div className="text-lg font-bold text-white">{bm.assessment_title}</div><p className="mt-1 text-sm text-slate-300">{bm.assessment_text}</p></div>
      </Card>

      <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
        <h3 className="mb-2 flex items-center gap-2 font-semibold text-white"><img src="/albert.png" alt="Albert" className="h-8 w-8 rounded-full" onError={(e) => { e.currentTarget.style.display = 'none'; }} />Impact on Albert's Call</h3>
        <div className="flex items-center gap-3"><span className="text-[11px] text-slate-500">Currently:</span><span className="text-lg font-bold text-amber-300">Coming soon · no leverage vote</span></div>
        <p className="mt-2 text-sm text-slate-300">Missing factors are excluded from Albert’s analysis and paper-trading decisions, not scored as neutral.</p>
      </Card>

      <Card className="border-0 bg-slate-900/60 p-4 ring-1 ring-slate-800">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Data sources</div>
        <ul className="space-y-1 text-[11px] text-slate-400">{(d.sources || []).map((x, i) => (<li key={i}>• {x}</li>))}</ul>
        <p className="mt-3 border-t border-slate-800 pt-3 text-[11px] italic text-slate-500">{d.disclaimer}</p>
      </Card>
    </div>
  );
}

/* ---------------- Whale Intelligence: ETF Flows / Impact / Tx feed / History ---------------- */

export default LeverageSection;
