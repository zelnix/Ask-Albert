'use client';

import React from 'react';
import { Volume2, VolumeX, ExternalLink, BellPlus, Check, Loader2, Crosshair } from 'lucide-react';
import { API_BASE } from '../lib/api';
import { speakAlbert, stopAlbert } from '../lib/albertVoice';

// Detect whether Albert's answer contains an actionable directional call worth
// turning into a tracked strategy (buy/sell/long/short/accumulate + a level).
function hasDirectionalCall(text) {
  const t = String(text || '').toLowerCase();
  const dir = /\b(buy|sell|long|short|accumulate|take profit|add here|entry|enter|target|stop[- ]?loss|invalidat|breakout|breakdown)\b/.test(t);
  const hasLevel = /\$\s?\d/.test(t);
  return dir && hasLevel;
}

// Pull dollar levels Albert mentions (e.g. "$74,000", "$77411") so we can offer
// one-tap price alerts for them.
function extractLevels(text) {
  const out = [];
  const seen = new Set();
  const re = /\$\s?(\d{1,3}(?:,\d{3})+|\d{4,7})(?:\.\d+)?/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1].replace(/,/g, ''));
    if (n >= 100 && !seen.has(n)) { seen.add(n); out.push(n); }
  }
  return out.slice(0, 5);
}

export default function AlbertReplyMeta({ text, sources = [], symbol = 'BTC', pid = '' }) {
  const [speaking, setSpeaking] = React.useState(false);
  const [warming, setWarming] = React.useState(false);
  const [alerted, setAlerted] = React.useState({});
  const levels = React.useMemo(() => extractLevels(text || ''), [text]);
  const showStrategy = React.useMemo(() => hasDirectionalCall(text || ''), [text]);

  const saveAsStrategy = () => {
    try {
      window.dispatchEvent(new CustomEvent('albert:build-strategy', {
        detail: { symbol: symbol || 'BTC', seed: String(text || '') },
      }));
    } catch (e) { /* noop */ }
  };

  React.useEffect(() => () => { try { stopAlbert(); } catch (e) { /* noop */ } }, []);
  // Warm up the TTS voice list (some browsers load voices asynchronously).
  React.useEffect(() => {
    try { window.speechSynthesis?.getVoices(); } catch (e) { /* noop */ }
  }, []);

  const speak = () => {
    if (speaking || warming) { stopAlbert(); setSpeaking(false); setWarming(false); return; }
    if (!String(text || '').trim()) return;
    setWarming(true);
    speakAlbert(text, {
      onStart: () => { setWarming(false); setSpeaking(true); },
      onEnd: () => { setSpeaking(false); setWarming(false); },
    });
  };

  const setAlert = async (level) => {
    setAlerted((a) => ({ ...a, [level]: true }));
    try {
      await fetch(`${API_BASE}/v1/price-alert`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid, asset: symbol, level }),
      });
      // Let the Alert Manager card refresh immediately (instead of waiting for its poll).
      try { window.dispatchEvent(new CustomEvent('albert:alert-created')); } catch (e) { /* noop */ }
    } catch (e) {
      setAlerted((a) => ({ ...a, [level]: false }));
    }
  };

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={speak}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${warming ? 'border-amber-500/50 bg-amber-500/10 text-amber-200' : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:text-white'}`}>
          {warming ? <><Loader2 className="h-3 w-3 animate-spin" />Warming up…</> : speaking ? <><VolumeX className="h-3 w-3" />Stop</> : <><Volume2 className="h-3 w-3" />Listen</>}
        </button>
        {showStrategy && (
          <button onClick={saveAsStrategy}
            className="inline-flex items-center gap-1 rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-200 transition-colors hover:bg-violet-500/20">
            <Crosshair className="h-3 w-3" />Save as strategy
          </button>
        )}
        {levels.map((lv) => (
          <button key={lv} onClick={() => setAlert(lv)} disabled={!!alerted[lv]}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${alerted[lv] ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300' : 'border-sky-600/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20'}`}>
            {alerted[lv] ? <><Check className="h-3 w-3" />Alerting ${lv.toLocaleString()}</> : <><BellPlus className="h-3 w-3" />Alert @ ${lv.toLocaleString()}</>}
          </button>
        ))}
      </div>
      {sources && sources.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">Sources</span>
          {sources.map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/40 px-2 py-0.5 text-[11px] text-slate-400 transition-colors hover:text-sky-300">
              <ExternalLink className="h-3 w-3" />{(s.title || 'source').slice(0, 28)}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
