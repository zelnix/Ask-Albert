'use client';

import React from 'react';
import { RefreshCw, Sparkles, Info, Brain, Volume2, VolumeX, Clock, X, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { API_BASE } from '../lib/api';
import { fmtUsd, fmtPct, scoreColor } from '../lib/format';
import { speakAlbert, stopAlbert } from '../lib/albertVoice';
import { SymbolContext } from '../lib/context';

function CoinIcon({ symbol, size = 24, className = '' }) {
  const [err, setErr] = React.useState(false);
  const sym = (symbol || '').toUpperCase();
  React.useEffect(() => { setErr(false); }, [symbol]);
  if (err || !symbol) {
    return (
      <span className={`flex items-center justify-center rounded-full bg-gradient-to-br from-amber-400/30 to-sky-500/30 font-black text-sky-200 ring-1 ring-sky-500/40 ${className}`} style={{ width: size, height: size, fontSize: size * 0.36 }}>{sym.slice(0, 3)}</span>
    );
  }
  return (
    <img src={`https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${sym.toLowerCase()}.png`} alt={sym} onError={() => setErr(true)} className={`rounded-full ${className}`} style={{ width: size, height: size }} />
  );
}

function Shimmer({ className = '', style }) {
  return <div className={`animate-pulse rounded-md bg-slate-800/70 ${className}`} style={style} />;
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 shadow-xl">
      <p className="mb-1 text-xs font-bold text-slate-400">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-xs" style={{ color: p.color }}>
          {p.name}: {p.name && p.name.includes('Price') ? fmtUsd(p.value) : fmtPct(p.value)}
        </p>
      ))}
    </div>
  );
}

function QuantGauge({ score }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score || 0));
  const dash = (c * pct) / 100;
  const color = scoreColor(score);
  return (
    <div className="relative flex h-44 w-44 items-center justify-center">
      <svg className="h-44 w-44 -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#1e293b" strokeWidth="12" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="12"
          strokeLinecap="round" strokeDasharray={`${dash} ${c}`} />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-5xl font-black text-white">{score}</span>
        <span className="text-[11px] text-slate-500">/ 100</span>
      </div>
    </div>
  );
}

const InfoBlock = ({ children }) => (
  <div className="flex gap-3 rounded-lg border border-sky-500/20 bg-sky-500/[0.04] p-4 text-sm text-slate-400">
    <img src="/albert.png" alt="Albert" className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-sky-500/40" />
    <div>
      <div className="mb-0.5 flex items-center gap-2">
        <span className="font-semibold text-sky-200">Albert</span>
        <span className="text-[11px] font-normal text-slate-500">· in plain English</span>
      </div>
      <div>{children}</div>
    </div>
  </div>
);

// Reusable explainer tooltip. Shows on hover AND on tap/click (mobile-friendly). Bigger, readable popup.
function InfoTip({ text, below = true, className = '' }) {
  const [open, setOpen] = React.useState(false);
  return (
    <span
      className={`group/info relative inline-flex cursor-help align-middle text-slate-500 hover:text-sky-400 ${className}`}
      onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Info className="h-3.5 w-3.5" />
      {open && (
        <span className={`absolute left-1/2 z-[70] w-72 max-w-[80vw] -translate-x-1/2 animate-in fade-in-0 zoom-in-95 duration-200 ease-out ${below ? 'top-full mt-2 origin-top slide-in-from-top-1' : 'bottom-full mb-2 origin-bottom slide-in-from-bottom-1'}`}>
          <span className={`absolute left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 rounded-[2px] bg-slate-900 ${below ? '-top-1.5 border-l border-t border-slate-600' : '-bottom-1.5 border-b border-r border-slate-600'}`} />
          <span className="relative block rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-[13px] font-normal normal-case leading-relaxed tracking-normal text-slate-100 shadow-2xl">
            {text}
          </span>
        </span>
      )}
    </span>
  );
}

// Whole-card explainer: the entire wrapped area is a hover/tap target that reveals a big popup.
function TapInfo({ text, className = '', below = true, children }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div
      className={`group/info relative cursor-help ${className}`}
      onClick={() => setOpen((o) => !o)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {text && <span className="absolute right-2 top-2 z-10 text-slate-500 transition-colors group-hover/info:text-sky-400"><Info className="h-3.5 w-3.5" /></span>}
      {children}
      {text && open && (
        <div className={`absolute left-1/2 z-[70] w-72 max-w-[80vw] -translate-x-1/2 animate-in fade-in-0 zoom-in-95 duration-200 ease-out ${below ? 'top-full mt-2 origin-top slide-in-from-top-1' : 'bottom-full mb-2 origin-bottom slide-in-from-bottom-1'}`}>
          <div className={`absolute left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 rounded-[2px] bg-slate-900 ${below ? '-top-1.5 border-l border-t border-slate-600' : '-bottom-1.5 border-b border-r border-slate-600'}`} />
          <div className="relative rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-[13px] leading-relaxed text-slate-100 shadow-2xl">
            {text}
          </div>
        </div>
      )}
    </div>
  );
}



function AiReview({ text, voice = true, section, footer }) {
  const symbol = React.useContext(SymbolContext);
  const symbolRef = React.useRef(symbol);
  React.useEffect(() => { symbolRef.current = symbol; }, [symbol]);
  const [speaking, setSpeaking] = React.useState(false);
  const [warming, setWarming] = React.useState(false);
  const [techOpen, setTechOpen] = React.useState(false);
  const [cache, setCache] = React.useState({ plain: null, technical: null });
  const [genAt, setGenAt] = React.useState({ plain: null, technical: null });
  const [now, setNow] = React.useState(Date.now());
  const [loading, setLoading] = React.useState(!!section);

  const load = React.useCallback((m, force) => {
    if (!section) return;
    const reqSym = symbol;
    setLoading(true);
    fetch(`${API_BASE}/v1/albert/insight?section=${encodeURIComponent(section)}&mode=${m}&symbol=${encodeURIComponent(reqSym)}${force ? '&refresh=1' : ''}`)
      .then((r) => r.json())
      .then((j) => { if (j && j.status === 'ready' && j.text && symbolRef.current === reqSym) { setCache((c) => ({ ...c, [m]: j.text })); setGenAt((g) => ({ ...g, [m]: j.generated_at || new Date().toISOString() })); } })
      .catch(() => { /* keep fallback */ })
      .finally(() => setLoading(false));
  }, [section, symbol]);

  // Reset cached insight whenever the coin changes so we never show the wrong asset.
  React.useEffect(() => { setCache({ plain: null, technical: null }); setGenAt({ plain: null, technical: null }); }, [symbol]);
  React.useEffect(() => { if (section) load('plain'); }, [section, symbol, load]);
  // tick for "updated X ago" + auto-refresh on new compute data every 5 min (cached, cheap)
  React.useEffect(() => {
    if (!section) return;
    const tick = setInterval(() => setNow(Date.now()), 30000);
    const refresh = setInterval(() => load('plain'), 300000);
    return () => { clearInterval(tick); clearInterval(refresh); };
  }, [section, load]);

  const openTech = () => { setTechOpen(true); if (section && !cache.technical) load('technical'); };
  const regenerate = () => load('plain', true);

  const aiText = cache.plain;
  const shown = aiText || text;
  const agoLabel = (() => {
    const iso = genAt.plain;
    if (!iso) return null;
    const secs = Math.max(0, Math.floor((now - new Date(iso + (iso.endsWith('Z') ? '' : 'Z')).getTime()) / 1000));
    if (secs < 60) return 'just now';
    const m = Math.floor(secs / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  })();

  const speak = () => {
    if (speaking || warming) { stopAlbert(); setSpeaking(false); setWarming(false); return; }
    if (!shown) return;
    setWarming(true);
    speakAlbert(shown, {
      onStart: () => { setWarming(false); setSpeaking(true); },
      onEnd: () => { setSpeaking(false); setWarming(false); },
    });
  };
  return (
    <Card className="border-0 bg-gradient-to-br from-sky-500/10 to-violet-500/[0.06] p-5 ring-1 ring-sky-500/25">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <img src="/albert.png" alt="Albert" className="h-10 w-10 rounded-full object-cover ring-2 ring-sky-500/40" />
        <h3 className="text-sm font-semibold text-sky-100">Albert’s Review</h3>
        {aiText ? (
          <span className="flex items-center gap-1 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-semibold text-violet-200 ring-1 ring-violet-500/40"><Sparkles className="h-3 w-3" />AI insight</span>
        ) : loading ? (
          <span className="flex items-center gap-1.5 text-[10px] text-slate-400"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />Albert is thinking…</span>
        ) : null}
        {aiText && agoLabel && <span className="flex items-center gap-1 text-[10px] text-slate-500"><Clock className="h-2.5 w-2.5" />updated {agoLabel}</span>}

        <div className="ml-auto flex items-center gap-1.5">
          {section && (
            <button onClick={regenerate} disabled={loading} title="Ask Albert for a fresh take" className="rounded-full border border-slate-700 p-1.5 text-slate-300 transition-colors hover:border-sky-500/40 hover:text-sky-300 disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
          {voice && (
            <button onClick={speak} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${(speaking || warming) ? 'border-sky-400 bg-sky-500/20 text-sky-200' : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:border-sky-500/40 hover:text-sky-300'}`}>
              {warming ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Warming up…</> : speaking ? <><VolumeX className="h-3.5 w-3.5" />Stop</> : <><Volume2 className="h-3.5 w-3.5" />Listen</>}
            </button>
          )}
        </div>
      </div>
      <p className={`whitespace-pre-line text-sm leading-relaxed text-slate-200 transition-opacity duration-300 ${loading && !aiText ? 'opacity-70' : 'opacity-100'}`}>{shown}</p>
      {section && (
        <button onClick={openTech} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-300 underline decoration-violet-500/40 underline-offset-2 transition-colors hover:text-violet-200">
          <Brain className="h-3.5 w-3.5" />Read Albert’s technical briefing
        </button>
      )}
      {footer && <div className="mt-3">{footer}</div>}

      {techOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onClick={() => setTechOpen(false)}>
          <div className="max-h-[86vh] w-full max-w-2xl overflow-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center gap-3">
              <img src="/albert.png" alt="Albert" className="h-11 w-11 rounded-full object-cover ring-2 ring-violet-500/40" />
              <div className="flex-1">
                <h3 className="flex items-center gap-1.5 text-base font-bold text-white"><Brain className="h-4 w-4 text-violet-300" />Technical Briefing</h3>
                <p className="text-[11px] text-slate-500">Albert’s deeper, indicator-level read · probability, not certainty</p>
              </div>
              <button onClick={() => { if (!cache.technical) return; load('technical', true); }} disabled={loading || !cache.technical} title="Regenerate" className="rounded-lg border border-slate-700 p-1.5 text-slate-400 transition-colors hover:border-violet-500/40 hover:text-violet-300 disabled:opacity-50">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={() => setTechOpen(false)} className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            {cache.technical ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-200">{cache.technical}</p>
            ) : (
              <div className="flex items-center gap-2 py-6 text-sm text-slate-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-violet-400" />Albert is writing the technical briefing…
              </div>
            )}
            <p className="mt-4 border-t border-slate-800 pt-3 text-[11px] italic text-slate-500">Educational analysis of Bitcoin market data — not financial advice. Albert is an original fictional AI quant persona and does not represent any real or other fictional person or character.</p>
          </div>
        </div>
      )}
    </Card>
  );
}

const SectionHead = ({ icon: Icon, title, blurb, coin }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="flex items-center gap-2">
      {coin ? <CoinIcon symbol={coin} size={28} className="ring-1 ring-slate-700" /> : <Icon className="h-6 w-6 text-sky-400" />}
      <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
      {blurb && (
        <div className="relative">
          <button
            type="button"
            aria-label="What is this section?"
            title="What is this section?"
            onClick={() => setOpen((o) => !o)}
            className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${open ? 'border-sky-400 bg-sky-500/20 text-sky-200' : 'border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20'}`}
          >
            <Info className="h-4 w-4" />
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} />
              <div className="absolute left-0 top-full z-[80] mt-2 w-[min(30rem,90vw)] origin-top-left animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-200 ease-out">
                {/* caret arrow anchored under the info button */}
                <div className="absolute -top-1.5 left-2.5 h-3 w-3 rotate-45 rounded-[2px] border-l border-t border-slate-700 bg-slate-900" />
                <div className="relative rounded-lg bg-slate-900 shadow-2xl ring-1 ring-slate-700">
                  <InfoBlock>{blurb}</InfoBlock>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};


function DemoBadge({ label = 'Inactive' }) {
  return <span className="rounded border border-slate-500/40 bg-slate-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-300">{label}</span>;
}

function Spark({ data, color = '#94a3b8', width = 72, height = 22 }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const rng = (max - min) || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (width - 2) + 1;
    const y = height - 1 - ((v - min) / rng) * (height - 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const last = data[data.length - 1];
  const lx = width - 1;
  const ly = height - 1 - ((last - min) / rng) * (height - 2);
  return (
    <svg width={width} height={height} className="shrink-0" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx.toFixed(1)} cy={ly.toFixed(1)} r="1.6" fill={color} />
    </svg>
  );
}

function LevGauge({ value = 0, label = '', color = '#f87171' }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const R = 34, C = Math.PI * R; // semicircle
  const off = C * (1 - v / 100);
  return (
    <div className="flex flex-col items-center">
      <svg width="96" height="58" viewBox="0 0 96 58">
        <path d="M8 52 A40 40 0 0 1 88 52" fill="none" stroke="#1e293b" strokeWidth="8" strokeLinecap="round" />
        <path d="M8 52 A40 40 0 0 1 88 52" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={off} />
        <text x="48" y="46" textAnchor="middle" className="fill-white" style={{ fontSize: 18, fontWeight: 700 }}>{Math.round(v)}</text>
      </svg>
      <span className="text-[11px] font-semibold" style={{ color }}>{label}</span>
    </div>
  );
}



function ComingSoonSection({ section }) {
  const Icon = section.icon;
  return (
    <div className="space-y-5">
      <SectionHead icon={Icon} title={section.label} blurb={section.blurb} />
      <Card className="flex flex-col items-center justify-center gap-4 border-0 bg-slate-900 p-16 ring-1 ring-slate-800">
        <div className="rounded-full bg-slate-800 p-4"><Icon className="h-8 w-8 text-sky-400" /></div>
        <h3 className="text-xl font-bold text-white">{section.label} is coming soon</h3>
        <p className="max-w-md text-center text-sm text-slate-400">This section is on the roadmap. The core intelligence engine (score, regime, forecasts, performance) is live now — this builds on top of it.</p>
        <Badge variant="outline" className="border-slate-700 text-slate-400">Roadmap</Badge>
      </Card>
    </div>
  );
}

export { CoinIcon, Shimmer, ChartTooltip, QuantGauge, InfoBlock, InfoTip, TapInfo, AiReview, SectionHead, DemoBadge, Spark, LevGauge, ComingSoonSection };
