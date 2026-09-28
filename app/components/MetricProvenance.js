'use client';

import React from 'react';

export const observed = (value, source, asOf) => value !== null && value !== undefined && value !== '' && Boolean(source && asOf);

const formatAsOf = (value) => {
  if (!value) return null;
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw} (reported UTC date; time not supplied)`;
  const stamp = /^\d{10}$/.test(raw) ? new Date(Number(raw) * 1000)
    : new Date(/^\d{4}-\d{2}-\d{2}T/.test(raw) && !/(Z|[+-]\d\d:?\d\d)$/.test(raw) ? `${raw}Z` : value);
  if (!Number.isFinite(stamp.getTime())) return null;
  return `${stamp.toLocaleString('en-GB', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} UTC`;
};

const MetricProvenance = ({ source, asOf, className = '' }) => {
  const formatted = formatAsOf(asOf);
  return <p className={`text-[11px] leading-snug text-muted-foreground ${className}`}>
    {source && formatted ? `${source} · as of ${formatted}` : 'Coming soon · source observation time unavailable'}
  </p>;
};

export default MetricProvenance;
