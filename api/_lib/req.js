export function query(req) {
  if (req.query && typeof req.query === 'object') return req.query;
  try {
    const url = new URL(req.url, 'http://localhost');
    return Object.fromEntries(url.searchParams.entries());
  } catch {
    return {};
  }
}

export function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

export function bearer(req) {
  const header = (req.headers && req.headers.authorization) || '';
  return header.replace(/^Bearer\s+/i, '').trim();
}

// Public origin of the frontend app (for redirect/return URLs).
export function appBase() {
  return (process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL || 'https://laundromaster.re-el.co.za').replace(/\/$/, '');
}

// Public origin of this API (for gateway callback/webhook URLs).
export function apiBase(req) {
  if (process.env.API_PUBLIC_URL) return process.env.API_PUBLIC_URL.replace(/\/$/, '');
  const host = (req && req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || 'laundromaster-sable.vercel.app';
  const proto = (req && req.headers && req.headers['x-forwarded-proto']) || 'https';
  return `${proto}://${host}`;
}
