import { newRequestId } from './request-id.js';
import { errorEnvelope } from './errors.js';

const DEFAULT_ORIGINS = [
  'https://laundromaster.re-el.co.za',
  'https://re-el123.github.io',
  'http://localhost:3000',
  'http://localhost:5173',
];

function corsHeaders(req) {
  const allowed = (process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : DEFAULT_ORIGINS
  ).map((s) => s.trim()).filter(Boolean);

  const origin = req.headers.origin;
  const headers = {
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-Id',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  headers['Access-Control-Allow-Origin'] = origin && allowed.includes(origin)
    ? origin
    : (allowed[0] || '*');
  return headers;
}

export function createHandler(fn) {
  return async function handler(req, res) {
    const requestId = newRequestId(req);

    const originalJson = res.json.bind(res);
    res.json = (payload) => {
      if (payload && typeof payload === 'object' && payload.meta && typeof payload.meta === 'object') {
        payload.meta.requestId = requestId;
      }
      return originalJson(payload);
    };

    try {
      const headers = corsHeaders(req);
      for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
      if (req.method === 'OPTIONS') return res.status(204).end();
      req.requestId = requestId;
      return await fn(req, res);
    } catch (err) {
      const status = err && err.status ? err.status : 500;
      return res.status(status).json(errorEnvelope(err));
    }
  };
}
