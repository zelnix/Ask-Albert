'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, Send, ShieldCheck, ArrowUpRight, Loader2 } from 'lucide-react';
import { API_BASE } from '../../lib/api';

// The dashboard companion is deliberately read-only. This component only calls /ask;
// trading or strategy commands must be reviewed in the existing full Ask workspace.
const DashboardAskPanel = ({ selected, onNav, onEvidence, stateId }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const session = useRef(null);
  const endRef = useRef(null);
  useEffect(() => { session.current = `dashboard_${crypto.randomUUID()}`; }, []);
  useEffect(() => { if (messages.length) endRef.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }, [messages]);
  const send = async (question) => {
    const text = String(question ?? input).trim();
    if (!text || busy) return;
    setInput(''); setBusy(true);
    const context = selected?.snapshotId ? { snapshotId: selected.snapshotId, stateId } : { stateId };
    const groundedQuestion = `${text}\n\nFor this dashboard answer: use four brief headings — What (observed and as-of), Why (here), How (source and uncertainty), When (verified time or time not confirmed). Use only the owner-scoped evidence you actually have. Do not treat a historical scenario as validated predictive performance or propose an unapproved trade.`;
    setMessages((m) => [...m, { role: 'user', text }]);
    try {
      const r = await fetch(`${API_BASE}/v1/albert/ask`, { method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: groundedQuestion, session_id: session.current, context }) });
      if (!r.ok) throw new Error('unavailable');
      const j = await r.json();
      setMessages((m) => [...m, { role: 'albert', text: j.reply || 'There is no grounded answer available right now.', evidence: j.evidence || [], snapshotId: j.answerSnapshotId }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'albert', text: 'I cannot reach the evidence service right now. Please try again later.' }]);
    } finally { setBusy(false); }
  };
  return <aside aria-label="Ask Albert dashboard companion" className="flex min-h-[320px] min-w-0 flex-col overflow-hidden rounded-lg border border-sky-500/25 bg-slate-900/90 lg:sticky lg:top-28 lg:h-[calc(100dvh-8.5rem)] xl:static xl:h-full xl:min-h-0">
    <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3.5 py-3">
      <div className="flex min-w-0 items-center gap-2"><img src="/albert.png" alt="" className="h-8 w-8 rounded-full object-cover" /><div className="min-w-0"><h2 className="text-sm font-bold text-white">Ask Albert</h2><p className="truncate text-xs text-slate-400">Your evidence-aware companion</p></div></div>
      <a href="/?section=ask" onClick={(e) => { e.preventDefault(); onNav('ask'); }} aria-label="Open full Ask Albert workspace" className="rounded-md p-1.5 text-sky-300 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"><ArrowUpRight className="h-4 w-4" /></a>
    </div>
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3.5" aria-live="polite">
      {!messages.length && <>
        <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.06] p-3 text-sm leading-relaxed text-slate-200">Ask about the market, your paper account or a selected card. I use your evidence; I don’t place trades.</div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Try asking</p>
        {['Why is the market stance qualified?', 'What would change Albert’s brief?', 'Why is the scenario not a forecast?'].map((q) => <button type="button" key={q} onClick={() => send(q)} className="block w-full rounded-md border border-slate-700 bg-slate-950/50 px-3 py-2 text-left text-xs leading-snug text-slate-300 hover:border-sky-500/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">{q}</button>)}
      </>}
      {messages.map((m, i) => <div key={i} className={`max-w-full rounded-lg px-3 py-2 text-sm leading-relaxed ${m.role === 'user' ? 'ml-6 bg-sky-700/50 text-white' : 'mr-2 bg-slate-800 text-slate-100'}`}>
        <p className="whitespace-pre-wrap break-words">{m.text}</p>
        {m.role === 'albert' && (m.evidence?.length || m.snapshotId) ? <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-700 pt-2">
          {(m.evidence || []).filter((e) => e.snapshotId).slice(0, 3).map((e, ix) => <button key={ix} type="button" onClick={() => onEvidence(e.snapshotId)} className="rounded-md border border-sky-500/30 px-2 py-1 text-xs text-sky-200 hover:bg-sky-500/10"><ShieldCheck className="mr-1 inline h-3 w-3" />{e.label || 'Evidence'} · {e.freshness || 'unknown'}</button>)}
          {m.snapshotId && <button type="button" onClick={() => onEvidence(m.snapshotId)} className="text-xs text-sky-300 underline">Answer evidence</button>}
        </div> : null}
      </div>)}
      {busy && <p className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-4 w-4 motion-safe:animate-spin" />Checking the evidence…</p>}
      <div ref={endRef} />
    </div>
    {selected && <div className="border-t border-slate-800 px-3.5 py-2 text-xs text-sky-200">
      <div className="flex items-center gap-1.5"><MessageCircle className="h-3.5 w-3.5" />Context: {selected.title}<button type="button" onClick={() => send(`Regarding ${selected.title}${selected.commentary ? ': ' + selected.commentary : ''}.\n\nExplain what is observed, why it matters to me, how the evidence supports it and when it updates.`)} disabled={busy} className="ml-auto font-semibold underline disabled:opacity-50">Explain</button></div>
      {selected.source && <p className="mt-1 truncate text-[11px] text-slate-400" title={`Source: ${selected.source}; as of ${selected.asOf || 'unavailable'}; version: ${selected.version || 'unavailable'}`}>Source {selected.source} · {selected.asOf || 'time unavailable'} · {selected.version || 'version unavailable'}{selected.to && <> · <a href={`/?section=${encodeURIComponent(selected.to)}`} onClick={(e) => { e.preventDefault(); onNav(selected.to); }} className="text-sky-300 underline">Detail</a></>}</p>}
    </div>}
    <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-2 border-t border-slate-800 p-3">
      <label htmlFor="dashboard-ask-input" className="sr-only">Ask Albert a question</label>
      <textarea id="dashboard-ask-input" rows={2} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Ask about this snapshot…" className="min-h-10 min-w-0 flex-1 resize-none rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-white placeholder:text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400" />
      <button type="submit" disabled={busy || !input.trim()} aria-label="Send question to Albert" className="rounded-md bg-sky-600 p-2.5 text-white hover:bg-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 disabled:opacity-50"><Send className="h-4 w-4" /></button>
    </form>
  </aside>;
};

export default DashboardAskPanel;
