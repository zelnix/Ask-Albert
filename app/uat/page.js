'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ShieldCheck, AlertTriangle, Loader2, CheckCircle2, XCircle } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_BASE_URL
  ? `${process.env.NEXT_PUBLIC_BASE_URL}/api`
  : '/api';

/**
 * UAT Entry Page — /uat?t=<token>
 *
 * Security:
 * - Token is read from the URL once, then removed from the address bar.
 * - Loading/previewing does NOT consume the token.
 * - Only pressing "Enter UAT" submits the token via POST.
 * - The token is never sent to third parties, logged, or stored in state beyond memory.
 */
export default function UATEntryPage() {
  const [token, setToken] = useState(null);
  const [status, setStatus] = useState('ready'); // ready | loading | success | error
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);

  // Read the token from the URL fragment (#t=) ONCE, then clear it.
  // The fragment never reaches the server in the request URL.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash || '';
    const match = hash.match(/[#&]t=([^&]+)/);
    if (match) {
      setToken(decodeURIComponent(match[1]));
      // Remove the fragment immediately — replace, don't push.
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const redeem = useCallback(async () => {
    if (!token || status === 'loading') return;
    setStatus('loading');
    setError('');
    try {
      const r = await fetch(`${API_BASE}/auth/uat/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        credentials: 'include',
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) {
        setStatus('success');
        setUser(j.user);
        setToken(null); // Clear from memory after successful redemption.
        // Redirect to the dashboard after a short delay.
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      } else {
        setStatus('error');
        setError(j.detail || j.error || 'Could not redeem link. It may be expired, used, or revoked.');
        setToken(null); // Clear invalid token from memory.
      }
    } catch (e) {
      setStatus('error');
      setError('Network error — please check your connection and try again.');
    }
  }, [token, status]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <Card className="w-full max-w-md border-0 bg-slate-900 p-8 ring-1 ring-slate-800">
        <div className="mb-6 text-center">
          <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-sky-400" />
          <h1 className="text-xl font-bold text-white">Ask Albert — UAT Access</h1>
          <p className="mt-1 text-sm text-slate-400">User Acceptance Testing environment</p>
        </div>

        {status === 'ready' && token && (
          <div className="space-y-4 text-center">
            <p className="text-sm text-slate-300">
              You have a valid UAT sign-in link. Press the button below to enter the testing account.
            </p>
            <Button
              onClick={redeem}
              className="w-full bg-sky-500 py-3 text-base font-semibold hover:bg-sky-400"
            >
              Enter UAT
            </Button>
            <p className="text-[11px] text-slate-500">
              This link is single-use and expires 15 minutes after creation.
            </p>
          </div>
        )}

        {status === 'ready' && !token && (
          <div className="space-y-3 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-amber-400" />
            <p className="text-sm text-slate-300">No sign-in token found.</p>
            <p className="text-xs text-slate-500">
              Ask the account owner to generate a new UAT link from Settings.
            </p>
          </div>
        )}

        {status === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="h-8 w-8 animate-spin text-sky-400" />
            <p className="text-sm text-slate-300">Signing in to UAT account...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            <p className="text-sm font-semibold text-emerald-300">Signed in as {user?.name || 'UAT Tester'}</p>
            <p className="text-xs text-slate-400">Redirecting to the dashboard...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <XCircle className="h-8 w-8 text-red-400" />
            <p className="text-sm font-semibold text-red-300">Access denied</p>
            <p className="text-xs text-slate-400">{error}</p>
            <p className="mt-2 text-[11px] text-slate-500">
              Ask the account owner to generate a new link if needed.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
