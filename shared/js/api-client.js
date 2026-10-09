const API_BASE = (typeof window !== 'undefined' && window.API_BASE) || '/api';

export async function apiRequest(path, { method='GET', body=null, headers={} }={}) {
  const opts = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${path}`, opts);
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error((data && data.error && data.error.message) || `Request failed ${res.status}`);
  return data;
}

export const api = {
  get: (p, o) => apiRequest(p, { method: 'GET', ...o }),
  post: (p, b, o) => apiRequest(p, { method: 'POST', body: b, ...o }),
  patch: (p, b, o) => apiRequest(p, { method: 'PATCH', body: b, ...o }),
  delete: (p, o) => apiRequest(p, { method: 'DELETE', ...o }),
};
