'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../../lib/api';

const endpoint = (name) => `${API_BASE}/v1/${name}`;
const previewBody = (assetId) => ({ assetId, horizon: 'P7D', quoteCurrency: 'USD', phaseMode: 'ASSESSED', ...(assetId === 'ETH' ? { modelVersion: 'v1', historyDays: 45 } : {}) });

const useOneScreenData = (enabled) => {
  const [data, setData] = useState({ sop: null, paper: null, outlook: null, eth: null, streams: null, driver: null, etf: null });
  const [health, setHealth] = useState({ sop: 'loading', paper: 'loading', outlook: 'loading', eth: 'loading', streams: 'loading', driver: 'loading', etf: 'loading' });
  const mounted = useRef(false);
  const inflight = useRef(new Set());
  const read = useCallback(async (key, url, options) => {
    if (inflight.current.has(key)) return;
    inflight.current.add(key);
    try {
      const response = await fetch(url, { credentials: 'include', cache: 'no-store', ...options });
      if (!response.ok) throw new Error(String(response.status));
      const body = await response.json();
      if (!mounted.current) return;
      if (body.status && !['ready', 'partial'].includes(body.status)) {
        setHealth((h) => ({ ...h, [key]: body.status === 'computing' || body.status === 'preparing' ? 'loading' : 'unavailable' }));
        return;
      }
      setData((old) => ({ ...old, [key]: body }));
      setHealth((h) => ({ ...h, [key]: 'ready' }));
    } catch (error) {
      if (mounted.current) {
        setHealth((h) => ({ ...h, [key]: dataRef.current[key] ? 'stale' : 'error' }));
      }
    } finally { inflight.current.delete(key); }
  }, []);
  const dataRef = useRef(data);
  dataRef.current = data;
  const core = useCallback(() => {
    read('sop', endpoint('albert/state-of-play'));
    read('paper', endpoint('albert/paper/overview'));
    read('outlook', endpoint('albert/scenario-outlooks/preview'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(previewBody('BTC')),
    });
  }, [read]);
  const optional = useCallback(() => {
    read('streams', endpoint('albert/market-streams?participants=1'));
    read('driver', endpoint('albert/market-driver/btc?horizon=SWING'));
    read('etf', endpoint('etf-flows'));
    read('eth', endpoint('albert/scenario-outlooks/preview'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(previewBody('ETH')),
    });
  }, [read]);
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
  }, [enabled, core, optional]);
  // The scenario provider computes its gate asynchronously on a cold cache. Only
  // retry the *read* while pending; no background trading/engine cycle is triggered.
  useEffect(() => {
    if (!enabled || data.outlook?.band?.reasonCode !== 'EVALUATION_NOT_COMPUTED_YET') return;
    const retry = setTimeout(() => read('outlook', endpoint('albert/scenario-outlooks/preview'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(previewBody('BTC')),
    }), 4000);
    return () => clearTimeout(retry);
  }, [enabled, data.outlook, read]);
  return { ...data, health, refresh: () => { core(); optional(); } };
};

export default useOneScreenData;
