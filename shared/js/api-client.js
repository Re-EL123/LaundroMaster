import { getSession, refreshSession } from './auth-client.js';

function base() {
  return (typeof window !== 'undefined' && window.API_BASE) || '/api';
}

async function call(path, { method = 'GET', body = null, headers = {}, auth = true } = {}) {
  const finalHeaders = { 'Content-Type': 'application/json', ...headers };
  const session = getSession();
  if (auth && session && session.access_token) {
    finalHeaders.Authorization = `Bearer ${session.access_token}`;
  }
  const res = await fetch(`${base()}${path}`, {
    method,
    headers: finalHeaders,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  return { res, data };
}

async function tryRefresh() {
  const next = await refreshSession();
  return Boolean(next);
}

export async function apiRequest(path, options = {}) {
  let { res, data } = await call(path, options);
  if (res.status === 401 && options.auth !== false) {
    const refreshed = await tryRefresh();
    if (refreshed) ({ res, data } = await call(path, options));
  }
  if (!res.ok) {
    const err = new Error((data && data.error && data.error.message) || `Request failed (${res.status})`);
    err.code = data && data.error && data.error.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (p, o) => apiRequest(p, { method: 'GET', ...o }),
  post: (p, b, o) => apiRequest(p, { method: 'POST', body: b, ...o }),
  patch: (p, b, o) => apiRequest(p, { method: 'PATCH', body: b, ...o }),
  put: (p, b, o) => apiRequest(p, { method: 'PUT', body: b, ...o }),
  delete: (p, o) => apiRequest(p, { method: 'DELETE', ...o }),
};
