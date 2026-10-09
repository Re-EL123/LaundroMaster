import { createHandler } from './_lib/handler.js';
import { successEnvelope, errorEnvelope, ApiError } from './_lib/errors.js';
import { adminClient } from './_lib/supabase-admin.js';
import { query, body } from './_lib/req.js';
import { requireUser } from './_lib/auth.js';
import { pushSubscribe } from './_lib/validation.js';
import { vapidPublicKey, pushConfigured, notifyUser } from './_lib/push.js';

async function freesoundSearch(term, pageSize = 12) {
  const key = process.env.FREESOUND_API_KEY;
  if (!key) return { configured: false, results: [] };
  const params = new URLSearchParams({
    query: term || 'notification alert',
    token: key,
    fields: 'id,name,previews,duration,username',
    page_size: String(Math.min(Math.max(pageSize, 1), 30)),
  });
  const res = await fetch(`https://freesound.org/apiv2/search/text/?${params.toString()}`);
  if (!res.ok) return { configured: true, results: [], error: `Freesound ${res.status}` };
  const data = await res.json().catch(() => ({}));
  const results = (data.results || []).map((s) => ({
    id: s.id,
    name: s.name,
    duration: s.duration,
    username: s.username,
    preview: (s.previews && (s.previews['preview-hq-mp3'] || s.previews['preview-lq-mp3'])) || null,
  })).filter((s) => s.preview);
  return { configured: true, results };
}

export default createHandler(async function handler(req, res) {
  const q = query(req);
  const supa = adminClient();
  if (!supa) return res.status(503).json(errorEnvelope(new ApiError('NOT_CONFIGURED', 'Supabase not configured', 503)));

  const ctx = await requireUser(req);

  if (req.method === 'GET') {
    if ((q.action || '') === 'unread') {
      const { count, error } = await supa
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', ctx.user.id)
        .is('read_at', null);
      if (error) return res.status(500).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope({ count: count || 0 }));
    }

    if ((q.action || '') === 'vapid') {
      return res.status(200).json(successEnvelope({ publicKey: vapidPublicKey(), configured: pushConfigured() }));
    }

    if ((q.action || '') === 'sound') {
      try {
        const out = await freesoundSearch(q.q, Number(q.page_size) || 12);
        return res.status(200).json(successEnvelope(out));
      } catch (err) {
        return res.status(200).json(successEnvelope({ configured: Boolean(process.env.FREESOUND_API_KEY), results: [], error: err.message }));
      }
    }

    const { data, error } = await supa
      .from('notifications')
      .select('*')
      .eq('user_id', ctx.user.id)
      .order('created_at', { ascending: false })
      .limit(Math.min(Number(q.limit) || 50, 100));
    if (error) return res.status(500).json(errorEnvelope(error));
    return res.status(200).json(successEnvelope(data || []));
  }

  if (req.method === 'PATCH') {
    const id = q.id || body(req).id;
    if (!id) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Missing id')));
    const { data, error } = await supa
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', ctx.user.id)
      .select()
      .maybeSingle();
    if (error) return res.status(400).json(errorEnvelope(error));
    return res.status(200).json(successEnvelope(data));
  }

  if (req.method === 'POST') {
    const action = q.action || '';

    if (action === 'read-all') {
      const { error } = await supa
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', ctx.user.id)
        .is('read_at', null);
      if (error) return res.status(400).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope({ ok: true }));
    }

    if (action === 'subscribe') {
      const parsed = pushSubscribe.safeParse(body(req).subscription || body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { endpoint, keys } = parsed.data;
      const { error } = await supa.from('push_subscriptions').upsert({
        user_id: ctx.user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: (req.headers['user-agent'] || '').slice(0, 300),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' });
      if (error) return res.status(400).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope({ ok: true }));
    }

    if (action === 'unsubscribe') {
      const endpoint = body(req).endpoint;
      if (!endpoint) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Missing endpoint')));
      await supa.from('push_subscriptions').delete().eq('user_id', ctx.user.id).eq('endpoint', endpoint);
      return res.status(200).json(successEnvelope({ ok: true }));
    }

    if (action === 'test') {
      await notifyUser(supa, ctx.user.id, {
        type: 'system',
        title: 'Test notification',
        body: 'Notifications are working. You will be alerted about your orders here.',
        url: 'apps/customer/pages/orders.html',
      });
      return res.status(200).json(successEnvelope({ ok: true, push: pushConfigured() }));
    }

    return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
  }

  return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
});
