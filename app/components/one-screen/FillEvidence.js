'use client';

import React, { useEffect, useState } from 'react';
import { ShieldCheck, ArrowUpRight } from 'lucide-react';
import { API_BASE } from '../../lib/api';
import ModalShell from './ModalShell';
import { money, when, NavigateLink } from './OneScreenHome';

// Position evidence resolves the real lot ID carried by an economic FILL
// ledger event. Never treat a proposal ID as a completed execution.
const FillEvidence = ({ fill, onClose, onNav }) => {
  const [record, setRecord] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!fill?.entityId) { setError('This fill has no linked position ID. Ledger evidence is unavailable.'); return; }
    const controller = new AbortController();
    fetch(`${API_BASE}/v1/albert/paper/trades/${encodeURIComponent(fill.entityId)}/evidence`, { credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error('evidence unavailable'); return r.json(); })
      .then((j) => setRecord(j))
      .catch((e) => { if (e.name !== 'AbortError') setError('The linked position evidence could not be loaded.'); });
    return () => controller.abort();
  }, [fill?.entityId]);
  const decision = record?.strategyDecisionSnapshot;
  const linkedEntry = (record?.ledger || []).find((e) => e.ledgerEventId === fill?.ledgerEventId);
  return <ModalShell title={`${fill?.side === 'BUY' ? 'Bought' : 'Sold'} ${fill?.asset} · fill evidence`} onClose={onClose} className="max-w-2xl">
    <div className="space-y-3 text-sm text-slate-300">
      <p><strong className="text-sky-300">What:</strong> Completed {fill?.side} of {fill?.qty} {fill?.asset} at {money(fill?.fillPx, 2)} · fee {money(fill?.fee, 2)} · {when(fill?.effectiveAt || fill?.recordedAt)}. This is an executed paper fill, not an open proposal.</p>
      <p><strong className="text-sky-300">Why:</strong> This fill changed the cash and holdings in the {fill?.strategyName || 'named paper'} wallet; profit from a buy is not implied.</p>
      <p><strong className="text-sky-300">How:</strong> Position {fill?.entityId || 'unavailable'} · ledger event {fill?.ledgerEventId || 'unavailable'} · strategy {fill?.strategyId || 'unavailable'}. {record ? `Canonical decision ${record.decisionSnapshotId || 'unavailable'}; execution profile ${record.executionProfile?.executionProfileId || 'unavailable'}.` : error || 'Loading the owner-scoped decision and ledger trace…'}</p>
      {linkedEntry && <p className="rounded-md border border-slate-700 bg-slate-950 p-2 text-xs text-slate-300">Ledger entry: {linkedEntry.note || linkedEntry.eventType} · {money(linkedEntry.amount, 2)} · recorded {when(linkedEntry.recordedAt)}</p>}
      {decision?.gateTrace?.length ? <div className="rounded-md border border-slate-700 bg-slate-950 p-3"><p className="mb-1 text-xs font-bold uppercase text-slate-400">Decision gate trace</p><ul className="list-inside list-disc text-xs">{decision.gateTrace.map((g, i) => <li key={i}>{typeof g === 'string' ? g : JSON.stringify(g)}</li>)}</ul></div> : null}
      <p><strong className="text-sky-300">When:</strong> This fill completed at {when(fill?.effectiveAt)}; subsequent marks update unrealized P/L on the next valid quote. The next mark time is not confirmed.</p>
      <p className="text-xs text-slate-400"><ShieldCheck className="mr-1 inline h-3.5 w-3.5" />Owner-scoped paper ledger and position decision trace · source as of {when(fill?.recordedAt)} · execution profile {record?.executionProfile?.version || 'version unavailable'}.</p>
      <NavigateLink id="paperengine" onNav={(id) => { onClose(); onNav(id); }}>Open complete Paper Engine <ArrowUpRight className="h-4 w-4" /></NavigateLink>
    </div>
  </ModalShell>;
};

export default FillEvidence;
