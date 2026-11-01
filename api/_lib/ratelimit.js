import { ApiError } from './errors.js';
import { adminClient } from './supabase-admin.js';

/** Best-effort client identifier (Vercel forwards the real IP). */
export function clientIp(req) {
  const forwarded = req && req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip']);
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return (req && req.socket && req.socket.remoteAddress) || 'unknown';
}

/**
 * Shared (database-backed) rate limit so every serverless instance sees the
 * same counters. Fails open: a database hiccup must not lock users out.
 */
export async function checkRateLimit(supa, key, { limit, windowSeconds }) {
  const client = supa || adminClient();
  if (!client) return { allowed: true, count: 0 };
  try {
    const { data, error } = await client.rpc('check_rate_limit', {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error || !data) return { allowed: true, count: 0 };
    return data;
  } catch {
    return { allowed: true, count: 0 };
  }
}

export async function enforceRateLimit(supa, req, bucket, { limit, windowSeconds, identifier = '' }) {
  const key = `${bucket}:${identifier || clientIp(req)}`;
  const result = await checkRateLimit(supa, key, { limit, windowSeconds });
  if (result && result.allowed === false) {
    throw new ApiError('RATE_LIMITED', 'Too many attempts. Please wait a few minutes and try again.', 429);
  }
  return result;
}
