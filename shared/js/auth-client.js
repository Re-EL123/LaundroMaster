// Shared session + role client. Uses the LaundroMaster API (which wraps Supabase Auth).
// No Supabase secret is ever needed in the browser.

const STORAGE_KEY = 'lm_session';

// Site base so the same code works on github.io/<repo>/ and on the custom domain root.
function siteBase() {
  const p = location.pathname;
  const i = p.indexOf('/apps/');
  return i >= 0 ? p.slice(0, i) : '';
}

export function appUrl(app) {
  return `${siteBase()}/apps/${app}/index.html`;
}

export function portalUrl() {
  return `${siteBase()}/apps/portal/index.html`;
}

function base() {
  return (typeof window !== 'undefined' && window.API_BASE) || '/api';
}

export function getSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSession(session) {
  if (!session) return clearSession();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export function getRole() {
  const s = getSession();
  return (s && s.role) || null;
}

export function homeForRole(role) {
  if (role === 'owner') return appUrl('owner');
  if (role === 'admin' || role === 'super_admin') return appUrl('admin');
  return appUrl('customer');
}

async function raw(path, { method = 'GET', body = null, token = null } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base()}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, data };
}

export async function login(email, password) {
  const { ok, status, data } = await raw('/auth?action=login', { method: 'POST', body: { email, password } });
  if (!ok) throw new Error((data && data.error && data.error.message) || `Login failed (${status})`);
  const session = {
    access_token: data.data.access_token,
    refresh_token: data.data.refresh_token,
    user: data.data.user,
    role: data.data.role,
  };
  setSession(session);
  return session;
}

export async function register({ email, password, full_name, account_type = 'customer' }) {
  const { ok, status, data } = await raw('/auth?action=register', {
    method: 'POST',
    body: { email, password, full_name, account_type },
  });
  if (!ok) throw new Error((data && data.error && data.error.message) || `Registration failed (${status})`);
  const payload = data.data || {};
  if (payload.session) {
    const session = {
      access_token: payload.session.access_token,
      refresh_token: payload.session.refresh_token,
      user: payload.user,
      role: payload.role,
    };
    setSession(session);
    return { session, email_confirmation_required: false };
  }
  return { session: null, email_confirmation_required: true };
}

export async function logout() {
  const s = getSession();
  try {
    await raw('/auth?action=logout', { method: 'POST', token: s && s.access_token });
  } catch { /* best effort */ }
  clearSession();
}

export async function me() {
  const s = getSession();
  if (!s || !s.access_token) return null;
  let r = await raw('/auth?action=me', { token: s.access_token });
  if (r.status === 401 && s.refresh_token) {
    const refreshed = await raw('/auth?action=refresh', { method: 'POST', body: { refresh_token: s.refresh_token } });
    if (refreshed.ok) {
      const next = {
        access_token: refreshed.data.data.access_token,
        refresh_token: refreshed.data.data.refresh_token,
        user: refreshed.data.data.user,
        role: refreshed.data.data.role,
      };
      setSession(next);
      r = await raw('/auth?action=me', { token: next.access_token });
    } else {
      clearSession();
      return null;
    }
  }
  if (!r.ok) return null;
  return r.data.data;
}

// Client-side convenience only. Server-side authorisation remains authoritative.
export async function requireRole(allowed = []) {
  const user = await me();
  if (!user) {
    location.href = portalUrl();
    return null;
  }
  if (allowed.length && !allowed.includes(user.role)) {
    location.href = homeForRole(user.role);
    return null;
  }
  return user;
}
