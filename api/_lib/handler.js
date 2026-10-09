import { setRequestId } from './request-id.js';
import { errorEnvelope } from './errors.js';

function corsHeaders(req) {
  const allowed = (process.env.ALLOWED_ORIGINS || 'https://re-el123.github.io,http://localhost:3000,http://localhost:5173')
    .split(',').map(s => s.trim()).filter(Boolean);
  const origin = req.headers.origin;
  const headers = {
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-Id',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  else headers['Access-Control-Allow-Origin'] = allowed[0] || '*';
  return headers;
}

export function createHandler(fn) {
  return async function handler(req, res) {
    try {
      const headers = corsHeaders(req);
      for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
      if (req.method === 'OPTIONS') return res.status(204).end();
      setRequestId(req, res);
      return await fn(req, res);
    } catch (err) {
      return res.status(500).json(errorEnvelope(err));
    }
  };
}
