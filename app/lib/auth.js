// Native Google Sign-In helpers (Google Identity Services ID-token flow).
// The backend verifies the Google credential and issues an httpOnly session
// cookie; these helpers just talk to /api/auth/*.
import { API_BASE } from './api';

export async function fetchMe() {
  // Do not leave the entire app on "Waking Albert" if the preview/backend stalls.
  // A transient outage is different from a confirmed signed-out session.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch(`${API_BASE}/auth/me`, {
      credentials: 'include', cache: 'no-store', signal: controller.signal,
    });
    if (r.status === 401 || r.status === 403) return null;
    if (!r.ok) throw new Error('Session check unavailable');
    const d = await r.json();
    if (!d?.id) throw new Error('Invalid session response');
    return d;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getAuthConfig() {
  try {
    const r = await fetch(`${API_BASE}/auth/config`, { cache: 'no-store' });
    return await r.json();
  } catch (e) { return { configured: false, client_id: '' }; }
}

export async function exchangeGoogleCredential(credential) {
  const r = await fetch(`${API_BASE}/auth/google`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.detail || 'Sign-in failed');
  }
  return r.json();
}

// Persist the user id so getPid() scopes per-user data to this account.
export function rememberUser(user) {
  try { if (user && user.id) localStorage.setItem('btciq_user_id', user.id); } catch (e) { /* noop */ }
}

export async function logout() {
  try { await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' }); } catch (e) { /* noop */ }
  try {
    localStorage.removeItem('btciq_user_id');
    if (window.google && window.google.accounts && window.google.accounts.id) {
      window.google.accounts.id.disableAutoSelect();
    }
  } catch (e) { /* noop */ }
}
