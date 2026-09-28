'use client';

import React from 'react';
import { Bell, CandlestickChart, Layers, Magnet, Maximize2, Minimize2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { API_BASE } from '../lib/api';
import { SymbolContext } from '../lib/context';

function DrawableChart({ ohlc, symbol: propSymbol }) {
  const ctxSymbol = React.useContext(SymbolContext);
  const symbol = propSymbol || ctxSymbol;
  const [tool, setTool] = React.useState('cursor');
  const [pending, setPending] = React.useState(null);
  const [hover, setHover] = React.useState(null);
  const [measure, setMeasure] = React.useState(null);
  const [fs, setFs] = React.useState(false);
  const [snapMode, setSnapMode] = React.useState('ohlc');
  const [layouts, setLayouts] = React.useState({ Default: [] });
  const [activeLayout, setActiveLayout] = React.useState('Default');
  const [livePrice, setLivePrice] = React.useState(null);
  const [toasts, setToasts] = React.useState([]);
  const svgRef = React.useRef(null);
  // Per-asset drawing storage so drawings stay associated with their asset.
  const LKEY = `btciq_layouts_${symbol}`;

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    setLayouts({ Default: [] }); setActiveLayout('Default');
    try {
      const raw = window.localStorage.getItem(LKEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && o.layouts && typeof o.layouts === 'object' && Object.keys(o.layouts).length) {
          setLayouts(o.layouts);
          setActiveLayout(o.active && o.layouts[o.active] ? o.active : Object.keys(o.layouts)[0]);
          return;
        }
      }
      // Migrate BTC legacy drawings once.
      if (symbol === 'BTC') {
        const legacy = JSON.parse(window.localStorage.getItem('btciq_drawings'));
        if (Array.isArray(legacy)) {
          const seed = { Default: legacy };
          setLayouts(seed); setActiveLayout('Default');
          window.localStorage.setItem(LKEY, JSON.stringify({ active: 'Default', layouts: seed }));
        }
      }
    } catch (e) { /* noop */ }
  }, [LKEY, symbol]);

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setFs(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Live price for Ruler Alerts — fetches for the chart's own asset.
  React.useEffect(() => {
    let on = true;
    const qs = symbol === 'BTC' ? '' : `?symbol=${encodeURIComponent(symbol)}`;
    const fetchP = async () => {
      try { const r = await fetch(`${API_BASE}/v1/ticker${qs}`); const j = await r.json(); if (on && j && typeof j.price === 'number') setLivePrice(j.price); } catch (e) { /* noop */ }
    };
    fetchP();
    const id = setInterval(fetchP, 20000);
    return () => { on = false; clearInterval(id); };
  }, [symbol]);

  const draw = layouts[activeLayout] || [];
  const persist = (nextLayouts, nextActive) => {
    const active = nextActive !== undefined ? nextActive : activeLayout;
    setLayouts(nextLayouts);
    if (nextActive !== undefined) setActiveLayout(nextActive);
    if (typeof window !== 'undefined') window.localStorage.setItem(LKEY, JSON.stringify({ active, layouts: nextLayouts }));
  };
  const save = (next) => persist({ ...layouts, [activeLayout]: next });

  const switchLayout = (nm) => { if (layouts[nm]) { persist(layouts, nm); setTool('cursor'); setPending(null); setMeasure(null); } };
  const newLayout = () => {
    const nm = (window.prompt('Name this new layout:') || '').trim().slice(0, 24);
    if (!nm) return;
    if (layouts[nm]) { window.alert('A layout with that name already exists.'); return; }
    persist({ ...layouts, [nm]: [] }, nm); setTool('cursor');
  };
  const renameLayout = () => {
    const nm = (window.prompt('Rename layout to:', activeLayout) || '').trim().slice(0, 24);
    if (!nm || nm === activeLayout) return;
    if (layouts[nm]) { window.alert('That name already exists.'); return; }
    const nl = {}; Object.keys(layouts).forEach((k) => { nl[k === activeLayout ? nm : k] = layouts[k]; });
    persist(nl, nm);
  };
  const delLayout = () => {
    if (Object.keys(layouts).length <= 1) { save([]); return; }
    if (!window.confirm(`Delete layout "${activeLayout}" and everything on it?`)) return;
    const nl = { ...layouts }; delete nl[activeLayout];
    persist(nl, Object.keys(nl)[0]);
  };

  const data = ohlc || [];
  const W = 1000, H = 440, pL = 58, pR = 54, pT = 14, pB = 30;
  const plotW = W - pL - pR, plotH = H - pT - pB;
  const n = data.length;
  if (n < 2) return <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800"><p className="text-sm text-slate-500">Chart data loading…</p></Card>;
  const vals = data.flatMap((c) => [c.h, c.l]);
  const mn = Math.min(...vals), mx = Math.max(...vals), pad = (mx - mn) * 0.06 || 1;
  const lo = mn - pad, hi = mx + pad;
  const cw = Math.max(2, (plotW / n) * 0.62);
  const xAt = (i) => pL + (i / (n - 1)) * plotW;
  const yAt = (p) => pT + (1 - (p - lo) / (hi - lo)) * plotH;
  const idxOf = (t) => data.findIndex((c) => c.t === t);
  const fUsd = (v) => '$' + Math.round(v).toLocaleString();
  const FIBS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const SNAP_PX = 12;

  const beep = (up) => {
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const ctx = new AC(); const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.type = 'sine'; o.frequency.value = up ? 880 : 440; g.gain.value = 0.06;
      o.start(); setTimeout(() => { o.stop(); ctx.close(); }, 220);
    } catch (e) { /* noop */ }
  };
  const fireAlert = (dr, side) => {
    const msg = `${symbol} ${side === 'above' ? 'crossed above' : 'dropped below'} ${fUsd(dr.price)}`;
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, up: side === 'above' }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 8000);
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Ask Albert Price Alert', { body: msg }); } catch (e) { /* noop */ }
    beep(side === 'above');
  };

  // check ruler alerts whenever the live price updates
  React.useEffect(() => {
    if (livePrice == null) return;
    const cur = layouts[activeLayout] || [];
    let changed = false;
    const next = cur.map((dr) => {
      if (dr.type !== 'alert' || dr.triggered) return dr;
      const side = livePrice >= dr.price ? 'above' : 'below';
      if (dr.side == null) { changed = true; return { ...dr, side }; }
      const touched = Math.abs(livePrice - dr.price) / dr.price <= 0.0005;
      if (side !== dr.side || touched) { changed = true; fireAlert(dr, side); return { ...dr, triggered: true, side }; }
      return dr;
    });
    if (changed) save(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePrice]);

  const snapAt = (i, rawY) => {
    const c = data[i]; if (!c) return null;
    let cand;
    if (snapMode === 'close') cand = [['C', c.c]];
    else if (snapMode === 'hl') cand = [['H', c.h], ['L', c.l]];
    else cand = [['O', c.o], ['H', c.h], ['L', c.l], ['C', c.c]];
    let best = null, bd = 1e9;
    cand.forEach(([label, val]) => { const d = Math.abs(yAt(val) - rawY); if (d < bd) { bd = d; best = { label, val }; } });
    return best && bd <= SNAP_PX ? best : null;
  };

  const toLocal = (e) => {
    const svg = svgRef.current; const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const l = pt.matrixTransform(svg.getScreenCTM().inverse());
    let i = Math.round((l.x - pL) / plotW * (n - 1)); i = Math.max(0, Math.min(n - 1, i));
    let price = lo + (1 - (l.y - pT) / plotH) * (hi - lo);
    let snapLabel = null;
    if (snapMode !== 'off' && tool !== 'cursor') {
      const s = snapAt(i, l.y);
      if (s) { price = s.val; snapLabel = s.label; }
    }
    price = Math.round(price);
    return { i, t: data[i].t, price, x: xAt(i), y: snapLabel ? yAt(price) : l.y, snap: snapLabel };
  };
  const TWO_PT = ['trend', 'fib', 'measure'];
  const onClick = (e) => {
    if (tool === 'cursor') return;
    const p = toLocal(e);
    if (tool === 'hline') { save([...draw, { type: 'hline', price: p.price }]); }
    else if (tool === 'alert') {
      try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (er) { /* noop */ }
      const side = livePrice != null ? (livePrice >= p.price ? 'above' : 'below') : null;
      save([...draw, { type: 'alert', price: p.price, side, triggered: false }]);
    }
    else if (tool === 'note') { const text = window.prompt('Note text:'); if (text) save([...draw, { type: 'note', t: p.t, price: p.price, text: text.slice(0, 60) }]); }
    else if (TWO_PT.includes(tool)) {
      if (!pending || pending.tool !== tool) { setPending({ tool, t: p.t, price: p.price }); if (tool === 'measure') setMeasure(null); }
      else {
        const a = { t: pending.t, price: pending.price }, b = { t: p.t, price: p.price };
        if (tool === 'trend') save([...draw, { type: 'trend', a, b }]);
        else if (tool === 'fib') save([...draw, { type: 'fib', a, b }]);
        else if (tool === 'measure') setMeasure({ a, b });
        setPending(null);
      }
    } else if (tool === 'erase') {
      const px = xAt(p.i), py = yAt(p.price);
      let best = -1, bd = 1e9;
      draw.forEach((dr, k) => {
        let dist = 1e9;
        if (dr.type === 'hline' || dr.type === 'alert') dist = Math.abs(yAt(dr.price) - py);
        else if (dr.type === 'note') dist = Math.hypot(xAt(Math.max(0, idxOf(dr.t))) - px, yAt(dr.price) - py);
        else if (dr.type === 'trend' || dr.type === 'fib') { const ax = xAt(Math.max(0, idxOf(dr.a.t))), ay = yAt(dr.a.price), bx = xAt(Math.max(0, idxOf(dr.b.t))), by = yAt(dr.b.price); dist = Math.min(Math.hypot(ax - px, ay - py), Math.hypot(bx - px, by - py)); }
        if (dist < bd) { bd = dist; best = k; }
      });
      if (best >= 0 && bd < 40) save(draw.filter((_, k) => k !== best));
    }
  };
  const renderFib = (a, b, k, ghost) => {
    const ai = idxOf(a.t), bi = ghost ? b.i : idxOf(b.t);
    if (ai < 0 || (!ghost && bi < 0)) return null;
    const x0 = Math.min(xAt(ai), xAt(bi < 0 ? ai : bi));
    return (
      <g key={k} opacity={ghost ? 0.6 : 1}>
        {FIBS.map((L, j) => {
          const price = b.price + (a.price - b.price) * L;
          const y = yAt(price);
          return (<g key={j}><line x1={x0} y1={y} x2={W - pR} y2={y} stroke="#f59e0b" strokeWidth={L === 0 || L === 1 ? 1.5 : 1} strokeOpacity={0.75} strokeDasharray={L === 0 || L === 1 ? '' : '4 4'} /><text x={x0 + 3} y={y - 3} fontSize="10" fill="#fbbf24">{(L * 100).toFixed(1)}% · {fUsd(price)}</text></g>);
        })}
      </g>
    );
  };
  const TOOLS = [['cursor', 'Cursor'], ['trend', 'Trendline'], ['hline', 'Horizontal'], ['alert', 'Alert'], ['fib', 'Fib'], ['measure', 'Measure'], ['note', 'Note'], ['erase', 'Erase']];
  const hint = { trend: pending?.tool === 'trend' ? 'Click a second point to finish the trendline.' : 'Click two points to draw a trendline.',
    fib: pending?.tool === 'fib' ? 'Click the second swing point to place Fibonacci levels.' : 'Click a swing high then a swing low (or vice-versa) for Fibonacci.',
    measure: pending?.tool === 'measure' ? 'Click the end point to measure the move.' : 'Click start then end to measure price & % move.',
    hline: 'Click at a price to drop a horizontal level.', note: 'Click to place a note, then type its text.',
    alert: `Click at a price to arm a ruler alert — it pings (sound + banner) when ${symbol} touches it.`,
    erase: 'Click near a drawing to remove it.', cursor: 'Pick a tool to annotate. ' }[tool];
  const alertCount = draw.filter((dr) => dr.type === 'alert' && !dr.triggered).length;

  let measureView = null;
  if (measure) {
    const ai = idxOf(measure.a.t), bi = idxOf(measure.b.t);
    if (ai >= 0 && bi >= 0) {
      const up = measure.b.price >= measure.a.price;
      const col = up ? '#34d399' : '#f87171';
      const pct = ((measure.b.price - measure.a.price) / measure.a.price * 100).toFixed(2);
      const dol = measure.b.price - measure.a.price;
      const x1 = xAt(ai), x2 = xAt(bi), y1 = yAt(measure.a.price), y2 = yAt(measure.b.price);
      measureView = (<g><rect x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1) || 1} height={Math.abs(y2 - y1) || 1} fill={col} fillOpacity={0.12} stroke={col} strokeOpacity={0.5} /><rect x={(x1 + x2) / 2 - 66} y={(y1 + y2) / 2 - 14} width="132" height="28" rx="5" fill="#0f172a" stroke={col} /><text x={(x1 + x2) / 2} y={(y1 + y2) / 2 + 4} textAnchor="middle" fontSize="11" fill={col}>{up ? '+' : ''}{fUsd(dol)} · {up ? '+' : ''}{pct}% · {Math.abs(bi - ai)} bars</text></g>);
    }
  }

  return (
    <Card className={`relative flex flex-col border-0 bg-slate-900 p-4 ring-1 ring-slate-800 ${fs ? 'fixed inset-0 z-[100] overflow-auto rounded-none' : ''}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <CandlestickChart className="h-4 w-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-white">Draw Board · {symbol} {data.length}-day</h3>
        <div className="flex items-center gap-1 rounded-md bg-slate-800 px-1.5 py-0.5">
          <Layers className="h-3.5 w-3.5 text-slate-400" />
          <select value={activeLayout} onChange={(e) => switchLayout(e.target.value)} className="max-w-[120px] bg-transparent text-xs font-medium text-slate-200 focus:outline-none" title="Switch drawing layout">
            {Object.keys(layouts).map((nm) => <option key={nm} value={nm} className="bg-slate-900">{nm}</option>)}
          </select>
          <button onClick={newLayout} title="New layout" className="px-1 text-sm font-bold text-slate-400 hover:text-emerald-300">+</button>
          <button onClick={renameLayout} title="Rename layout" className="px-0.5 text-[10px] text-slate-400 hover:text-sky-300">Ren</button>
          <button onClick={delLayout} title="Delete layout" className="px-1 text-xs text-slate-400 hover:text-red-300">✕</button>
        </div>
        {livePrice != null && <span className="flex items-center gap-1 text-[11px] text-slate-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Live {fUsd(livePrice)}</span>}
        {alertCount > 0 && <span className="flex items-center gap-1 rounded-md bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-200 ring-1 ring-rose-500/30"><Bell className="h-3 w-3" />{alertCount} armed</span>}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-1">
        {TOOLS.map(([id, l]) => (
          <button key={id} onClick={() => { setTool(id); setPending(null); }} className={`rounded-md px-2.5 py-1 text-xs font-medium ${tool === id ? 'bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/40' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>{l}</button>
        ))}
        <button onClick={() => { save([]); setMeasure(null); }} className="rounded-md bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-500/20">Clear all</button>
        <div className="flex items-center gap-1 rounded-md bg-slate-800 px-1.5 py-0.5">
          <Magnet className={`h-3.5 w-3.5 ${snapMode !== 'off' ? 'text-emerald-300' : 'text-slate-500'}`} />
          <select value={snapMode} onChange={(e) => setSnapMode(e.target.value)} className="bg-transparent text-xs font-medium text-slate-200 focus:outline-none" title="Snap drawing points to candles">
            <option value="off" className="bg-slate-900">Snap: Off</option>
            <option value="ohlc" className="bg-slate-900">Snap: O/H/L/C</option>
            <option value="close" className="bg-slate-900">Snap: Close</option>
            <option value="hl" className="bg-slate-900">Snap: High/Low</option>
          </select>
        </div>
        <button onClick={() => setFs(!fs)} className="ml-auto flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800">{fs ? <><Minimize2 className="h-3.5 w-3.5" />Exit</> : <><Maximize2 className="h-3.5 w-3.5" />Full</>}</button>
      </div>
      {toasts.length > 0 && (<div className="pointer-events-none absolute right-4 top-24 z-[120] space-y-2">
        {toasts.map((t) => (<div key={t.id} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold shadow-lg ring-1 ${t.up ? 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/40' : 'bg-rose-500/15 text-rose-200 ring-rose-500/40'}`}><Bell className="h-3.5 w-3.5" />{t.msg}</div>))}
      </div>)}
      <div className="w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-950/40">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className={`w-full ${tool === 'cursor' ? 'cursor-default' : 'cursor-crosshair'}`} style={{ height: 'auto' }}
          onClick={onClick} onMouseMove={(e) => setHover(toLocal(e))} onMouseLeave={() => setHover(null)}>
          {[0, 0.25, 0.5, 0.75, 1].map((f, k) => { const p = hi - f * (hi - lo); return (<g key={k}><line x1={pL} y1={yAt(p)} x2={W - pR} y2={yAt(p)} stroke="#1e293b" /><text x={pL - 6} y={yAt(p) + 3} textAnchor="end" fontSize="11" fill="#64748b">${(p / 1000).toFixed(1)}k</text></g>); })}
          {/* candlesticks */}
          {data.map((c, i) => { const up = c.c >= c.o; const col = up ? '#34d399' : '#f87171'; const cx = xAt(i); const top = yAt(Math.max(c.o, c.c)); const bot = yAt(Math.min(c.o, c.c)); return (<g key={i}><line x1={cx} y1={yAt(c.h)} x2={cx} y2={yAt(c.l)} stroke={col} strokeWidth="1" /><rect x={cx - cw / 2} y={top} width={cw} height={Math.max(1, bot - top)} fill={col} /></g>); })}
          {data.filter((_, i) => i % Math.ceil(n / 8) === 0).map((c, k) => { const i = data.indexOf(c); return <text key={k} x={xAt(i)} y={H - 10} textAnchor="middle" fontSize="10" fill="#64748b">{c.t}</text>; })}
          {/* live price line */}
          {livePrice != null && livePrice >= lo && livePrice <= hi && (<g pointerEvents="none"><line x1={pL} y1={yAt(livePrice)} x2={W - pR} y2={yAt(livePrice)} stroke="#38bdf8" strokeWidth="1" strokeOpacity="0.6" strokeDasharray="1 3" /><rect x={W - pR} y={yAt(livePrice) - 8} width={pR} height="16" fill="#0ea5e9" /><text x={W - pR + 4} y={yAt(livePrice) + 4} fontSize="10" fill="#e0f2fe">{fUsd(livePrice)}</text></g>)}
          {/* saved drawings */}
          {draw.map((dr, k) => {
            if (dr.type === 'hline') return (<g key={k}><line x1={pL} y1={yAt(dr.price)} x2={W - pR} y2={yAt(dr.price)} stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="6 4" /><text x={W - pR - 2} y={yAt(dr.price) - 4} textAnchor="end" fontSize="11" fill="#fbbf24">{fUsd(dr.price)}</text></g>);
            if (dr.type === 'alert') { const y = yAt(dr.price); const col = dr.triggered ? '#f43f5e' : '#fb7185'; return (<g key={k}><line x1={pL} y1={y} x2={W - pR} y2={y} stroke={col} strokeWidth="1.5" strokeDasharray="2 4" /><rect x={pL + 2} y={y - 9} width={dr.triggered ? 128 : 104} height="16" rx="3" fill="#1e293b" stroke={col} strokeWidth="0.75" /><circle cx={pL + 11} cy={y} r="2.6" fill={col} /><text x={pL + 18} y={y + 3} fontSize="10" fill={col}>{dr.triggered ? 'Triggered · ' : 'Alert · '}{fUsd(dr.price)}</text></g>); }
            if (dr.type === 'trend') { const ai = idxOf(dr.a.t), bi = idxOf(dr.b.t); if (ai < 0 || bi < 0) return null; return <line key={k} x1={xAt(ai)} y1={yAt(dr.a.price)} x2={xAt(bi)} y2={yAt(dr.b.price)} stroke="#38bdf8" strokeWidth="2" />; }
            if (dr.type === 'fib') return renderFib(dr.a, dr.b, k, false);
            if (dr.type === 'note') { const i = idxOf(dr.t); if (i < 0) return null; return (<g key={k}><circle cx={xAt(i)} cy={yAt(dr.price)} r="4" fill="#a78bfa" /><text x={xAt(i) + 7} y={yAt(dr.price) + 3} fontSize="11" fill="#c4b5fd">{dr.text}</text></g>); }
            return null;
          })}
          {measureView}
          {/* pending 2-point preview */}
          {pending && hover && (<>
            <circle cx={xAt(idxOf(pending.t))} cy={yAt(pending.price)} r="4" fill="#38bdf8" />
            {pending.tool === 'fib' ? renderFib({ t: pending.t, price: pending.price }, hover, 'ghost', true)
              : <line x1={xAt(idxOf(pending.t))} y1={yAt(pending.price)} x2={hover.x} y2={yAt(hover.price)} stroke={pending.tool === 'measure' ? '#fbbf24' : '#38bdf8'} strokeWidth="1.5" strokeDasharray="4 4" />}
          </>)}
          {/* crosshair */}
          {hover && (<g pointerEvents="none">
            <line x1={hover.x} y1={pT} x2={hover.x} y2={pT + plotH} stroke="#475569" strokeDasharray="3 3" />
            <line x1={pL} y1={hover.y} x2={W - pR} y2={hover.y} stroke="#475569" strokeDasharray="3 3" />
            <rect x={W - pR} y={hover.y - 9} width={pR} height="18" fill="#1e293b" /><text x={W - pR + 4} y={hover.y + 4} fontSize="10" fill="#e2e8f0">{fUsd(hover.price)}</text>
            <rect x={hover.x - 22} y={pT + plotH} width="44" height="16" fill="#1e293b" /><text x={hover.x} y={pT + plotH + 12} textAnchor="middle" fontSize="10" fill="#e2e8f0">{hover.t}</text>
            {hover.snap && (<g><circle cx={hover.x} cy={hover.y} r="6" fill="none" stroke="#34d399" strokeWidth="1.8" /><circle cx={hover.x} cy={hover.y} r="2.5" fill="#34d399" /><rect x={hover.x + 8} y={hover.y - 9} width="20" height="16" rx="3" fill="#064e3b" stroke="#34d399" strokeWidth="0.75" /><text x={hover.x + 18} y={hover.y + 3} textAnchor="middle" fontSize="10" fill="#6ee7b7">{hover.snap}</text></g>)}
          </g>)}
        </svg>
      </div>
      <p className="mt-2 text-[11px] text-slate-600">{hint} {snapMode !== 'off' ? `Snap "${{ ohlc: 'O/H/L/C', close: 'Close', hl: 'High/Low' }[snapMode]}" locks points to candles (green ring).` : 'Snap is off — points follow the cursor freely.'} Layout "{activeLayout}" ({draw.length} items) auto-saves to this browser. Alerts ping while this page is open.</p>
    </Card>
  );
}


export default DrawableChart;
