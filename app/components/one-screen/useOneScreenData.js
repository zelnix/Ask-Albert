'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from '../../lib/api';

const endpoint = (name) => `${API_BASE}/v1/${name}`;
const previewBody = (assetId) => ({ assetId, horizon: 'P7D', quoteCurrency: 'USD', phaseMode: 'ASSESSED', ...(assetId === 'ETH' ? { modelVersion: 'v1', historyDays: 45 } : {}) });

const FOCUS_SOURCES = {
  brief: ['sop', 'outlook'], paper: ['paper'], portfolio: ['sop', 'paper'],
  btc: ['outlook'], intelligence: ['sop', 'driver', 'streams', 'outlook', 'eth'], news: ['sop'],
  evidence: ['sop', 'paper', 'outlook'], flows: ['streams', 'etf'],
  radar: ['streams', 'paper'],
};
const HOME_SOURCES = ['sop', 'paper', 'outlook', 'streams', 'driver', 'etf', 'eth', 'whales', 'network', 'sentiment'];
const EMPTY_DATA = { sop: null, paper: null, outlook: null, eth: null, streams: null, driver: null, etf: null, whales: null, network: null, sentiment: null };
const EMPTY_HEALTH = { sop: 'loading', paper: 'loading', outlook: 'loading', eth: 'loading', streams: 'loading', driver: 'loading', etf: 'loading', whales: 'loading', network: 'loading', sentiment: 'loading' };
const useOneScreenData = (enabled, focus = 'home', ownerId = null) => {
  const [data, setData] = useState(EMPTY_DATA);
  const [health, setHealth] = useState(EMPTY_HEALTH);
  const mounted = useRef(false);
  const ownerRef = useRef(ownerId);
  const generation = useRef(0);
  const inflight = useRef(new Set());
  useEffect(() => {
    if (ownerRef.current === ownerId) return;
    ownerRef.current = ownerId;
    generation.current += 1;
    dataRef.current = EMPTY_DATA;
    setData(EMPTY_DATA);
    setHealth(EMPTY_HEALTH);
  }, [ownerId]);
  const read = useCallback(async (key, url, options) => {
    const requestGeneration = generation.current;
    const requestKey = `${requestGeneration}:${key}`;
    if (inflight.current.has(requestKey)) return;
    inflight.current.add(requestKey);
    try {
      const response = await fetch(url, { credentials: 'include', cache: 'no-store', ...options });
      if (!response.ok) throw new Error(String(response.status));
      const body = await response.json();
      if (!mounted.current || generation.current !== requestGeneration) return;
      // Store returned data regardless of status — display any returned fields.
      // Retain previous results when the new response has no usable payload.
      const hasPayload = Object.keys(body).some((k) => k !== 'status' && k !== 'error' && body[k] != null);
      if (hasPayload) {
        setData((old) => ({ ...old, [key]: body }));
      } else if (!dataRef.current[key]) {
        setData((old) => ({ ...old, [key]: body }));
      }
      // Track request status separately from data.
      if (body.status && !['ready', 'partial'].includes(body.status)) {
        setHealth((h) => ({ ...h, [key]: (hasPayload || dataRef.current[key]) ? 'stale' : ['computing', 'preparing'].includes(body.status) ? 'loading' : 'unavailable' }));
      } else {
        setHealth((h) => ({ ...h, [key]: body.status === 'partial' ? 'stale' : 'ready' }));
      }
    } catch (error) {
      if (mounted.current && generation.current === requestGeneration) {
        setHealth((h) => ({ ...h, [key]: dataRef.current[key] ? 'stale' : 'error' }));
      }
    } finally { inflight.current.delete(requestKey); }
  }, []);
  const dataRef = useRef(data);
  dataRef.current = data;
  const wanted = useMemo(() => FOCUS_SOURCES[focus] || HOME_SOURCES, [focus]);
  const core = useCallback(() => {
    if (wanted.includes('sop')) read('sop', endpoint('albert/state-of-play'));
    if (wanted.includes('paper')) read('paper', endpoint('albert/paper/overview'));
    if (wanted.includes('outlook')) read('outlook', endpoint('albert/scenario-outlooks/preview'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(previewBody('BTC')),
    });
  }, [read, wanted]);
  const optional = useCallback(() => {
    if (wanted.includes('streams')) read('streams', endpoint('albert/market-streams?participants=1'));
    if (wanted.includes('driver')) read('driver', endpoint('albert/market-driver/btc?horizon=SWING'));
    if (wanted.includes('etf')) read('etf', endpoint('etf-flows'));
    if (wanted.includes('eth')) read('eth', endpoint('albert/scenario-outlooks/preview'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(previewBody('ETH')),
    });
    if (wanted.includes('whales')) read('whales', endpoint('whales'));
    if (wanted.includes('network')) read('network', endpoint('network-health'));
    if (wanted.includes('sentiment')) read('sentiment', endpoint('fear-greed'));
  }, [read, wanted]);
  useEffect(() => {
    if (!enabled) { mounted.current = false; return; }
    mounted.current = true;
    core();
    const timer = setTimeout(optional, 800);
    const refreshCore = setInterval(core, 60000);
    const refreshOptional = setInterval(optional, 180000);
    const onFocus = () => { if (document.visibilityState === 'visible') core(); };
    const onEvent = () => core();
    window.addEventListener('focus', onFocus);
    window.addEventListener('albert:paper-updated', onEvent);
    window.addEventListener('albert:mandate-updated', onEvent);
    return () => {
      mounted.current = false;
      clearTimeout(timer); clearInterval(refreshCore); clearInterval(refreshOptional);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('albert:paper-updated', onEvent);
      window.removeEventListener('albert:mandate-updated', onEvent);
    };
  }, [enabled, core, optional, ownerId]);
  // The scenario provider computes its gate asynchronously on a cold cache. Only
  // retry the *read* while pending; no background trading/engine cycle is triggered.
  useEffect(() => {
    if (!enabled || data.outlook?.band?.reasonCode !== 'EVALUATION_NOT_COMPUTED_YET') return;
    const retry = setTimeout(() => read('outlook', endpoint('albert/scenario-outlooks/preview'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(previewBody('BTC')),
    }), 4000);
    return () => clearTimeout(retry);
  }, [enabled, data.outlook, read]);
  return { ...(ownerRef.current === ownerId ? data : EMPTY_DATA), health: ownerRef.current === ownerId ? health : EMPTY_HEALTH, refresh: () => { core(); optional(); } };
};

export default useOneScreenData;
