'use client';

import AnalysisRefreshStatus, { announceAnalysis } from './AnalysisRefreshStatus';
import AlbertReplyMeta from './AlbertReplyMeta';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Send, Loader2, ShieldCheck, ChevronDown, ChevronRight, Sparkles, MessageCircle, Info,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { API_BASE } from '../lib/api';
import EvidenceDrawer from './albert/EvidenceDrawer';

const FRESH_COLOR = { FRESH: 'text-emerald-400', STALE: 'text-amber-400', MISSING: 'text-red-400', UNKNOWN: 'text-slate-400' };
function sectionFromDeepLink(dl) {
  if (!dl) return null;
  try { return new URLSearchParams(dl.split('?')[1] || '').get('section'); } catch (e) { return null; }
}
const STARTERS = [
  'How is my paper account doing right now?',
  'What is the market doing, and what does it mean for me?',
  'Why hasn’t anything traded recently?',
  'Show me my strategies and what would make Albert act.',
  'Does my latest decision follow the engine’s risk rules?',
];

// Deterministic client hint: does the message ask to CHANGE the paper account?
// If so we route to the typed-confirmation-card endpoint (no mutation happens there).
function looksLikePaperCommand(msg) {
  const m = (msg || '').toLowerCase();
  return /\b(pause|resume|restart|halt|close|sell|exit|dump|observe|approval|autopilot)\b/.test(m);
}

function ConfirmationCard({ card, onDone }) {
  const [state, setState] = useState('idle'); // idle | busy | done | error
  const [note, setNote] = useState('');
  const run = async () => {
    setState('busy');
    try {
      const mut = card.mutation;
      const r = await fetch(mut.path, { method: mut.method, credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mut.body || {}) });
      if (r.ok) { setState('done'); setNote('Done — your paper account was updated.'); onDone && onDone(); }
      else { const j = await r.json().catch(() => ({})); setState('error'); setNote(j.detail || 'That could not be completed.'); }
    } catch (e) { setState('error'); setNote('Network error — please try again.'); }
  };
  return (
    <div className="mt-2 rounded-xl border border-amber-500/40 bg-amber-500/[0.06] p-3">
      <p className="flex items-center gap-1.5 text-[13px] font-bold text-amber-200"><ShieldCheck className="h-4 w-4" />{card.title}</p>
      <p className="mt-1 text-[13px] text-slate-200">{card.summary}</p>
      {card.preview && (
        <div className="mt-2 grid grid-cols-2 gap-1.5 text-[12px] sm:grid-cols-4">
          {Object.entries(card.preview).map(([k, v]) => (
            <div key={k} className="rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-1.5"><p className="text-[10px] uppercase tracking-wider text-slate-500">{k}</p><p className="font-semibold text-white">{String(v)}</p></div>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-500">{card.note}</p>
      {state === 'idle' && (
        <Button size="sm" onClick={run} className="mt-2 h-7 gap-1 bg-emerald-600 px-2.5 text-[12px] hover:bg-emerald-500">Confirm</Button>
      )}
      {state === 'busy' && <p className="mt-2 flex items-center gap-1.5 text-[12px] text-slate-300"><Loader2 className="h-3.5 w-3.5 animate-spin" />Applying…</p>}
      {(state === 'done' || state === 'error') && <p className={`mt-2 text-[12px] font-medium ${state === 'done' ? 'text-emerald-300' : 'text-red-400'}`}>{note}</p>}
    </div>
  );
}

function EvidenceRow({ evidence, onNav, onEvidence }) {
  if (!evidence || !evidence.length) return null;
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
      {evidence.map((e, i) => {
        const sec = sectionFromDeepLink(e.deepLink);
        const fc = FRESH_COLOR[e.freshness] || FRESH_COLOR.UNKNOWN;
        // A snapshot id resolves to the EXACT record the claim was made from; only fall
        // back to a screen when no snapshot exists for that source.
        const open = () => (e.snapshotId && onEvidence ? onEvidence(e.snapshotId)
          : (sec && onNav && onNav(sec)));
        return (
          <button key={i} onClick={open}
            title={`${e.sourceId || ''}${e.asOf ? ` · ${e.asOf}` : ''}`}
            className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/70 px-2 py-0.5 text-[10px] font-semibold text-sky-300 hover:border-sky-500/50 hover:text-sky-200">
            <ShieldCheck className="h-3 w-3" />{(e.label || 'evidence').replace(/_/g, ' ')}
            <span className={`ml-0.5 ${fc}`}>·{e.freshness || '?'}</span>
          </button>
        );
      })}
    </div>
  );
}

function TechnicalDetails({ msg }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-300">
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />How Albert answered
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 text-[11px] text-slate-400">
          <p><span className="text-slate-500">Model:</span> <span className="font-mono text-slate-300">{msg.model || '—'}</span></p>
          <p><span className="text-slate-500">Owner-scoped read functions consulted:</span> {(msg.contextFunctions || []).join(', ') || 'none'}</p>
          <p className="text-slate-500">Each evidence chip above links to the screen that owns that number — open it for the full technical read-out.</p>
        </div>
      )}
    </div>
  );
}

function ScopePanel({ sop, onNav }) {
  // M-F: no duplicated state summary here. Albert home owns the plain status,
  // the Technical Centre owns the engine read-outs. This panel states the
  // BOUNDARY Albert answers inside, and links to the single source of each number.
  const connected = !!sop;
  const Link = ({ to, children }) => (
    <button onClick={() => onNav && onNav(to)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-sky-400 hover:text-sky-300">
      {children}<ChevronRight className="h-3.5 w-3.5" />
    </button>
  );
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400"><Info className="h-3.5 w-3.5" />What Albert can and cannot do</p>
      <ul className="space-y-1.5 text-[12.5px] leading-relaxed text-slate-300">
        <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />Albert analyses the market and identifies opportunities — he gives clear opinions on timing, levels and risk.</li>
        <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />Albert can recommend and prepare paper-trading strategies for your review.</li>
        <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />Albert can read your paper wallets, strategy performance and trade history.</li>
        <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />Albert cannot connect to an exchange or place a real trade. You review, save and start every strategy.</li>
      </ul>
      <div className="flex flex-col items-start gap-1.5 border-t border-slate-800 pt-2.5">
        <Link to="home">Your current status on Albert home</Link>
        <Link to="paperengine">Engine detail in Technical Centre</Link>
      </div>
      <p className={`text-[10.5px] ${connected ? 'text-slate-600' : 'text-amber-400'}`}>
        {connected ? 'Connected to your live state of play.' : 'Your state of play is unavailable right now — Albert will say so rather than guess.'}
      </p>
    </div>
  );
}

export default function AskAlbert({ onNav }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [entity, setEntity] = useState(null);
  const [context, setContext] = useState(null);
  const [evidenceId, setEvidenceId] = useState(null);
  const [sop, setSop] = useState(null);
  const endRef = useRef(null);
  const sessionId = useRef('ask_' + Math.random().toString(36).slice(2, 10));

  useEffect(() => {
    fetch(`${API_BASE}/v1/albert/state-of-play`, { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null)).then((j) => j && setSop(j)).catch(() => {});
  }, [messages.length]);

  const send = useCallback(async (text, ent, ctx) => {
    const q = (text ?? input).trim();
    if (!q || sending) return;
    setInput('');
    const useEnt = ent !== undefined ? ent : entity;
    const useCtx = ctx !== undefined ? ctx : context;
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setSending(true);
    try {
      // Conversational MUTATION requests never execute here — they return a typed
      // confirmation card the user must confirm (M-E: LLM never calls mutation routes).
      if (looksLikePaperCommand(q)) {
        const cr = await fetch(`${API_BASE}/v1/albert/paper/command`, {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: q }),
        });
        if (cr.ok) {
          const cj = await cr.json();
          if (cj.card) {
            setMessages((m) => [...m, { role: 'albert', text: 'Here’s what I’ll do once you confirm — nothing has changed yet:', card: cj.card }]);
            setSending(false); setEntity(null); return;
          }
          if (cj.message) {
            setMessages((m) => [...m, { role: 'albert', text: cj.message }]);
            setSending(false); setEntity(null); return;
          }
        }
      }
      const r = await fetch(`${API_BASE}/v1/albert/ask`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, session_id: sessionId.current,
          entity: useEnt || undefined, context: useCtx || undefined }),
      });
      if (r.status === 401 || r.status === 403) {
        setMessages((m) => [...m, { role: 'albert', text: 'Please sign in to talk with Albert.' }]);
      } else {
        const j = await r.json();
        announceAnalysis(j.analysisJob);
        setMessages((m) => [...m, { role: 'albert', text: j.reply || 'No answer came back.',
          evidence: j.evidence, model: j.model, contextFunctions: j.contextFunctions,
          answerSnapshotId: j.answerSnapshotId,
          basket_draft: j.basket_draft || null,
          strategyIntent: j.strategyIntent || false,
          strategyDraftFailed: j.strategyDraftFailed || false,
          sessionId: j.sessionId }]);
      }
    } catch (e) {
      // Instruction 9: preserve state on timeout, show retry action
      setMessages((m) => [...m, {
        role: 'albert',
        text: 'I couldn\'t complete this request — it may have timed out. Your conversation and any strategy details you provided are preserved. Tap "Retry" to try again.',
        strategyDraftFailed: true,
        strategyIntent: true,
        sessionId: sessionId.current
      }]);
    } finally {
      setSending(false); setEntity(null); setContext(null);
    }
  }, [input, sending, entity, context]);

  // Prefilled handoff: another screen opened Ask Albert with a question + entity.
  useEffect(() => {
    let pending = null;
    try { pending = window.__albertPendingAsk; window.__albertPendingAsk = null; } catch (e) { /* noop */ }
    if (pending && (pending.question || pending.entity || pending.context)) {
      setEntity(pending.entity || null);
      setContext(pending.context || null);
      if (pending.question) send(pending.question, pending.entity || null, pending.context || null);
      else setInput(pending.prefill || '');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);

  return (
    <div className="space-y-4">
      <AnalysisRefreshStatus />
      <div className="flex items-center gap-2.5">
        <MessageCircle className="h-5 w-5 text-sky-400" />
        <h1 className="text-lg font-bold text-white">Ask Albert</h1>
        <span className="text-[12px] text-slate-500">Your crypto market and strategy companion</span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Conversation */}
        <div className="lg:col-span-2">
          <Card className="flex min-h-[62vh] flex-col border-0 bg-slate-900 p-0 ring-1 ring-slate-800">
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {messages.length === 0 && (
                <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.05] p-4">
                  <div className="flex items-center gap-2.5">
                    <img src="/albert.png" alt="Albert" className="h-9 w-9 rounded-full object-cover ring-2 ring-sky-500/40" />
                    <p className="text-sm text-slate-200">Ask me about your market state, portfolio, a decision, a strategy or a paper trade. I explain in plain English and link the exact evidence.</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {STARTERS.map((s) => (
                      <button key={s} onClick={() => send(s)} className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-[12px] text-slate-300 hover:border-sky-500/50 hover:text-sky-200">{s}</button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                m.role === 'user' ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-sky-600 px-3.5 py-2 text-sm text-white">{m.text}</div>
                  </div>
                ) : (
                  <div key={i} className="flex gap-2.5">
                    <img src="/albert.png" alt="Albert" className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-sky-500/40" />
                    <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-slate-800/60 px-3.5 py-2.5">
                      <p className="max-w-[70ch] whitespace-pre-wrap text-[14px] leading-relaxed text-slate-100">{m.text}</p>
                      {m.card && <ConfirmationCard card={m.card} />}
                      <EvidenceRow evidence={m.evidence} onNav={onNav} onEvidence={setEvidenceId} />
                      {/* Strategy draft actions (Instruction 2) */}
                      {(m.basket_draft || m.strategyIntent) && (
                        <AlbertReplyMeta
                          draft={m.basket_draft}
                          strategyIntent={m.strategyIntent}
                          strategyDraftFailed={m.strategyDraftFailed}
                          sessionId={m.sessionId || sessionId.current}
                          onNav={onNav}
                          onRetry={() => send('Prepare this exact strategy for review now.')}
                        />
                      )}
                      {m.answerSnapshotId ? (
                        <button onClick={() => setEvidenceId(m.answerSnapshotId)}
                          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-sky-400 underline decoration-sky-500/40 underline-offset-2 hover:text-sky-300">
                          <ShieldCheck className="h-3 w-3" />Open the exact evidence set behind this answer
                        </button>
                      ) : null}
                      {(m.model || (m.evidence || []).length > 0) && <TechnicalDetails msg={m} />}
                    </div>
                  </div>
                )
              ))}
              {sending && (
                <div className="flex items-center gap-2 text-[13px] text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Albert is thinking…</div>
              )}
              <div ref={endRef} />
            </div>
            <div className="border-t border-slate-800 p-3">
              {entity && <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-violet-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-violet-300"><Sparkles className="h-3 w-3" />Context: {entity.type} attached</div>}
              {context && (
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-sky-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-sky-300">
                  <ShieldCheck className="h-3 w-3" />
                  Evidence attached{context.findingId ? ' · research finding' : ''}{context.snapshotId ? ' · snapshot' : ''} · re-checked on the server
                </div>
              )}
              <div className="flex items-end gap-2">
                <textarea rows={1} value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Ask Albert about your state, a decision, a strategy or a paper trade…"
                  className="max-h-32 flex-1 resize-none rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500" />
                <Button onClick={() => send()} disabled={sending || !input.trim()} className="h-10 gap-1.5 bg-gradient-to-r from-sky-500 to-violet-600 text-white hover:from-sky-400 hover:to-violet-500">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* State + evidence side panel (desktop/laptop) */}
        <div className="hidden lg:block">
          <Card className="border-0 bg-slate-900 p-4 ring-1 ring-slate-800"><ScopePanel sop={sop} onNav={onNav} /></Card>
          <p className="mt-3 px-1 text-center text-[11px] text-slate-600">Paper trading only — Albert has read-only visibility. He explains the deterministic engine; he never invents or alters trades.</p>
        </div>
      </div>

      {evidenceId ? (
        <EvidenceDrawer snapshotId={evidenceId} onClose={() => setEvidenceId(null)} />
      ) : null}
    </div>
  );
}
