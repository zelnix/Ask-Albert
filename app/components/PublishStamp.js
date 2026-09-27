'use client';
// Published time comes from the last completed dashboard run, not this device's clock.
import React, { useEffect, useState } from 'react';

export default function PublishStamp({ publishedAt, className = '', compact = false }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const raw = String(publishedAt || '');
  const normalized = raw && /^\d{4}-\d{2}-\d{2}T/.test(raw) && !/(Z|[+-]\d\d:?\d\d)$/.test(raw) ? `${raw}Z` : raw;
  const date = normalized ? new Date(normalized) : null;
  const valid = date && !Number.isNaN(date.getTime());
  const stale = mounted && valid && Date.now() - date.getTime() > 36 * 3600000;
  return (
    <p className={`whitespace-nowrap text-[11px] leading-tight text-slate-400 ${className}`}
      title={valid && mounted ? `Published ${date.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' })}${stale ? ' · stale publication' : ''}` : 'Published time unavailable'}>
      <span className="text-slate-300">Published</span> {valid && mounted
        ? date.toLocaleString(undefined, compact ? { day: 'numeric', month: 'short', year: '2-digit', hour: 'numeric', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
        : 'time unavailable'}{stale ? <span className="ml-1 font-semibold text-amber-200">· stale</span> : null}
    </p>
  );
}
