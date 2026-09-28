'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Maximize2, Minimize2, X, Clock, Send, Brain, RefreshCw, Copy, Check, MessageSquarePlus, Search } from 'lucide-react';
import { API_BASE, getPid } from '../lib/api';
import { useAlbertChat, chatToText } from '../lib/chatStore';
import CopyButton from './CopyButton';
import ThreadMenu from './ThreadMenu';
import AlbertText from './AlbertText';
import AlbertReplyMeta from './AlbertReplyMeta';
import BasketChatCard from './BasketChatCard';
import BasketRebalanceCard from './BasketRebalanceCard';
import BasketCloseCard from './BasketCloseCard';
import MandateChangeCard from './MandateChangeCard';
import MicButton from './MicButton';

// Human-readable scope label per screen, so the floating chat can tell Albert
// (and the user) which screen the conversation is grounded in.
const SECTION_LABELS = {
  overview: 'all things Ask Albert', forecasts: 'Forecasts', 'market-intel': 'Market Intelligence',
  crossmarket: 'Cross-Market', analogs: 'Happening Again', smartmoney: 'Smart Money',
  whales: 'Whale Watch', institutional: 'Institutional & Derivatives', leverage: 'Leverage',
  macro: 'Macro & Policy', news: 'News', risk: 'Risk', events: 'Events',
  performance: 'Performance', timemachine: 'Time Machine', network: 'Network & Sentiment',
  dataaudit: 'Data Audit', admin: 'Admin', settings: 'Settings', alerts: 'Alerts',
};

// Floating, screen-aware Ask Albert widget (present on every screen).
export default function FloatingAlbert({ active, symbol, onExpand }) {
  const [open, setOpen] = React.useState(false);
  const pid = React.useMemo(() => getPid(), []);
  const { messages, setMessages, sessionId, clear, threads, threadId, switchThread, newThread, renameThread, deleteThread } = useAlbertChat(pid);
  const [input, setInput] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [deep, setDeep] = React.useState(false);
  const [rateUntil, setRateUntil] = React.useState(0);
  const [, setRateTick] = React.useState(0);
  const endRef = React.useRef(null);
  const [copied, setCopied] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [showSearch, setShowSearch] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const isOverview = !active || active === 'overview';
  const scopeLabel = SECTION_LABELS[active] || 'all things Ask Albert';
  const shown = search.trim() ? messages.filter((m) => (m.text || '').toLowerCase().includes(search.trim().toLowerCase())) : messages;

  // Listen for close-chat event from strategy handoff.
  React.useEffect(() => {
    const onClose = () => setOpen(false);
    window.addEventListener('albert:close-chat', onClose);
    return () => window.removeEventListener('albert:close-chat', onClose);
  }, []);
  React.useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading, open]);
  const copyAll = () => {
    const txt = chatToText(messages);
    if (!txt) return;
    try { navigator.clipboard.writeText(txt); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (e) { /* noop */ }
  };
  React.useEffect(() => {
    if (!rateUntil) return;
    const id = setInterval(() => {
      if (Date.now() >= rateUntil) setRateUntil(0);
      else setRateTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [rateUntil]);
  const rateSecondsLeft = rateUntil ? Math.max(0, Math.ceil((rateUntil - Date.now()) / 1000)) : 0;

  const suggestions = isOverview
    ? ['Give me the candid read on Bitcoin right now.', 'Current cycle distribution / top signals?', 'How are ETF flows & the Fed shaping BTC?', 'Critique my strategy in one line.']
    : [`Give me a candid read on this ${scopeLabel} screen.`, `What should I watch on ${scopeLabel}?`, `What's the key signal here?`];

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: msg }]);
    setLoading(true);
    const ctrl = new AbortController();
    // Deep dive uses the heavy reasoning model, which can take ~30s — give it room.
    // Non-deep is also given 60s so an inline basket build (Basket from Chat, ~30-45s) completes.
    const timer = setTimeout(() => ctrl.abort(), deep ? 95000 : 60000);
    try {
      const r = await fetch(`${API_BASE}/v1/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: msg, symbol, section: active, deep, pid }),
        signal: ctrl.signal,
      });
      if (r.status === 429) {
        const j = await r.json().catch(() => ({}));
        const secs = Math.max(1, Math.min(120, Number(j.retry_in) || 30));
        setLoading(false);
        setMessages((m) => m.slice(0, -1));
        setInput(msg);
        setRateUntil(Date.now() + secs * 1000);
        return;
      }
      const j = await r.json();
      if (j && j.status === 'rate_limited') {
        const secs = Math.max(1, Math.min(120, Number(j.retry_in) || 30));
        setLoading(false);
        setMessages((m) => m.slice(0, -1));
        setInput(msg);
        setRateUntil(Date.now() + secs * 1000);
        return;
      }
      setRateUntil(0);
      setMessages((m) => [...m, { role: 'assistant', text: j.text || 'Sorry, I could not answer that just now.', sources: j.sources || [], basket_draft: j.basket_draft || null, basket_rebalance: j.basket_rebalance || null, basket_close: j.basket_close || null, mandate_change: j.mandate_change || null }]);
    } catch (e) {
      const aborted = e && e.name === 'AbortError';
      setMessages((m) => [...m, { role: 'assistant', error: true, retry: msg, text: aborted ? 'That took longer than expected — please try again (or turn off Deep dive for a faster answer).' : 'Network error — please try again.' }]);
    } finally { clearTimeout(timer); setLoading(false); }
  };

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button onClick={() => setOpen(true)} title="Ask Albert"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full border border-sky-500/40 bg-gradient-to-r from-sky-500 to-violet-600 py-2 pl-2 pr-4 text-white shadow-lg shadow-violet-500/30 transition-transform hover:scale-105">
          <img src="/albert.png" alt="Albert" className="h-10 w-10 rounded-full object-cover ring-2 ring-white/30" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <span className="text-sm font-semibold">Ask Albert</span>
        </button>
      )}
      {/* Panel */}
      {open && (
        <div className={expanded
          ? 'fixed inset-0 z-50 flex flex-col overflow-hidden border border-slate-700 bg-slate-900 shadow-2xl sm:inset-3 sm:rounded-2xl'
          : 'fixed bottom-5 right-5 z-50 flex h-[540px] w-[92vw] max-w-[400px] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/50 ring-1 ring-slate-800'}>
          <div className="flex items-center gap-2.5 border-b border-slate-800 bg-slate-950/60 px-4 py-3">
            <img src="/albert.png" alt="Albert" className="h-10 w-10 rounded-full object-cover ring-2 ring-sky-500/40" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">Ask Albert</p>
              <p className="truncate text-[10px] text-sky-400">{isOverview ? 'Talking about all things Ask Albert' : `Focused on: ${scopeLabel}`}</p>
            </div>
            {messages.length > 0 && (
              <>
                <button onClick={() => setShowSearch((v) => !v)} title="Search this chat" className={`rounded-lg p-1.5 hover:bg-slate-800 hover:text-slate-200 ${showSearch ? 'text-sky-400' : 'text-slate-400'}`}><Search className="h-4 w-4" /></button>
                <button onClick={copyAll} title="Copy whole conversation" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200">{copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}</button>
              </>
            )}
            <ThreadMenu compact threads={threads} activeId={threadId} title="" onSwitch={switchThread} onNew={newThread} onRename={renameThread} onDelete={deleteThread} />
            <button onClick={() => setExpanded((v) => !v)} title={expanded ? 'Exit full screen' : 'Full screen'} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200">{expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
            <button onClick={() => setOpen(false)} title="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {showSearch && messages.length > 0 && (
              <div className="sticky top-0 z-10 -mx-1 mb-1 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/90 px-2.5 py-1.5">
                <Search className="h-3.5 w-3.5 text-slate-500" />
                <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search messages…" className="flex-1 bg-transparent text-[12px] text-slate-100 placeholder-slate-500 focus:outline-none" />
                {search && <span className="text-[10px] text-slate-500">{shown.length} match{shown.length === 1 ? '' : 'es'}</span>}
                {search && <button onClick={() => setSearch('')} className="text-slate-500 hover:text-slate-300"><X className="h-3.5 w-3.5" /></button>}
              </div>
            )}
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <img src="/albert.png" alt="Albert" className="h-16 w-16 rounded-full object-cover ring-2 ring-sky-500/40" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                <p className="text-sm font-semibold text-slate-200">{isOverview ? "Hi, I'm Albert — ask me anything about Bitcoin" : `Ask me about the ${scopeLabel} screen`}</p>
                <p className="max-w-[16rem] text-[11px] text-slate-500">Market mentor & sounding board — live dashboard + web. I won’t invent dashboard numbers.</p>
                <div className="flex flex-col gap-1.5">
                  {suggestions.map((s, i) => (
                    <button key={i} onClick={() => send(s)} className="rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-[11px] text-slate-300 hover:border-sky-500/40 hover:text-sky-300">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {shown.map((m, i) => (
              <div key={i} className={`group flex items-end gap-1.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && <img src="/albert.png" alt="Albert" className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-sky-500/30" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${m.role === 'user' ? 'whitespace-pre-wrap bg-sky-500/15 text-sky-50 ring-1 ring-sky-500/25' : 'bg-slate-950/60 text-slate-200 ring-1 ring-slate-800'}`}>
                  {m.role === 'assistant' ? <><AlbertText text={m.text} />{m.error && m.retry ? <button onClick={() => send(m.retry)} disabled={loading} className="mt-2 flex items-center gap-1.5 rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold text-sky-300 transition-colors hover:bg-sky-500/20 disabled:opacity-50"><RefreshCw className="h-3 w-3" />Retry</button> : m.basket_draft ? <BasketChatCard draft={m.basket_draft} pid={pid} /> : m.basket_rebalance ? <BasketRebalanceCard rebalance={m.basket_rebalance} /> : m.basket_close ? <BasketCloseCard close={m.basket_close} /> : m.mandate_change ? <MandateChangeCard change={m.mandate_change} pid={pid} /> : <AlbertReplyMeta text={m.text} sources={m.sources} symbol={symbol} pid={pid} />}</> : m.text}
                </div>
                {!m.error && (m.text || '').trim() && <CopyButton text={m.text} className="shrink-0 self-center text-slate-500 hover:text-slate-200" />}
              </div>
            ))}
            {loading && (
              <div className="flex items-end justify-start gap-2">
                <img src="/albert.png" alt="Albert" className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-sky-500/30" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                <div className="flex items-center gap-1.5 rounded-2xl bg-slate-950/60 px-3 py-2.5 ring-1 ring-slate-800">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-400" style={{ animationDelay: '0ms' }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-400" style={{ animationDelay: '150ms' }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-400" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          <div className="border-t border-slate-800 p-2.5">
            {rateSecondsLeft > 0 && (
              <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-300">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>Chatting a little fast — try again in <span className="font-semibold tabular-nums">{rateSecondsLeft}s</span>.</span>
              </div>
            )}
            <div className="mb-2 flex items-center justify-between">
              <button onClick={() => setDeep((v) => !v)} title="Deep dive uses the heavy reasoning model for a more thorough answer (slower)"
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${deep ? 'border-violet-500/50 bg-violet-500/15 text-violet-300' : 'border-slate-700 bg-slate-800/60 text-slate-400 hover:text-slate-200'}`}>
                <Brain className="h-3.5 w-3.5" />Deep dive {deep ? 'ON' : 'OFF'}
              </button>
              {deep && <span className="text-[10px] text-slate-500">Slower · more thorough</span>}
            </div>
            <div className="flex items-end gap-1.5">
              <textarea value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                rows={1} placeholder={isOverview ? 'Ask about Bitcoin…' : `Ask about ${scopeLabel}…`}
                className="max-h-24 flex-1 resize-none rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-[13px] text-slate-100 placeholder-slate-500 focus:border-sky-500/50 focus:outline-none" />
              <MicButton value={input} onChange={setInput} disabled={loading || rateSecondsLeft > 0} />
              <Button onClick={() => send()} disabled={loading || !input.trim() || rateSecondsLeft > 0} size="sm" className="bg-sky-500 hover:bg-sky-400"><Send className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
