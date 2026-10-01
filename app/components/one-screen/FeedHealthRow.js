'use client';

import React, { useEffect, useState } from 'react';
import { API_BASE } from '../../lib/api';

const STATUS_COLORS = {
  live: 'bg-emerald-500',
  empty: 'bg-amber-500',
  rate_limited: 'bg-red-500',
  error: 'bg-red-500',
  unknown: 'bg-slate-500',
};

const FeedHealthRow = () => {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchHealth = () => {
    setLoading(true);
    fetch(`${API_BASE}/v1/feed-health`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.status === 'ready') setHealth(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchHealth(); }, []);

  if (!health) return null;

  return (
    <div className="flex items-center gap-2 rounded-md border border-slate-700/50 bg-slate-800/40 px-2.5 py-1.5 text-[11px]">
      <span className="font-semibold text-slate-400">Feeds:</span>
      <div className="flex items-center gap-1.5">
        {health.feeds.map(f => (
          <div key={f.source} className="group relative flex items-center gap-1"
            title={`${f.source}: ${f.status}${f.error_msg ? ` — ${f.error_msg}` : ''}`}>
            <span className={`h-2 w-2 rounded-full ${STATUS_COLORS[f.status] || STATUS_COLORS.unknown}`} />
            <span className="text-slate-400 hidden sm:inline">{f.source.split(' ')[0]}</span>
          </div>
        ))}
      </div>
      <span className={`ml-auto text-[10px] ${health.all_healthy ? 'text-emerald-400' : 'text-amber-400'}`}>
        {health.summary}
      </span>
      {loading && <span className="animate-pulse text-slate-500">...</span>}
    </div>
  );
};

/* ── News Staleness Badge ── */
export const NewsStaleBadge = ({ stale, ageMinutes }) => {
  if (!stale) return null;
  return (
    <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300"
      title={`News data is ${ageMinutes} minutes old. A refresh is pending.`}>
      ⏳ {ageMinutes}m old
    </span>
  );
};

export default FeedHealthRow;
