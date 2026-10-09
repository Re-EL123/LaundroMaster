import webpush from 'web-push';

let configured = null;

export function pushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function vapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || '';
}

function ensureVapid() {
  if (!pushConfigured()) return false;
  if (configured) return true;
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@laundromaster.app',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    configured = true;
  } catch {
    configured = false;
  }
  return configured;
}

// Sends a Web Push message to every stored subscription for a user.
// Expired/removed subscriptions (404/410) are pruned automatically.
export async function sendPushToUser(supa, userId, payload) {
  if (!userId || !ensureVapid()) return 0;
  const { data: subs, error } = await supa
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);
  if (error || !subs || !subs.length) return 0;

  let sent = 0;
  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      );
      sent += 1;
    } catch (err) {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        await supa.from('push_subscriptions').delete().eq('id', sub.id);
      }
    }
  }));
  return sent;
}

// Inserts an in-app notification row and fires a Web Push message.
export async function notifyUser(supa, userId, { type = 'info', title, body = null, url = null, push = true } = {}) {
  if (!userId || !title) return null;
  const { data } = await supa
    .from('notifications')
    .insert({ user_id: userId, type, title, body: body || null, data: url ? { url } : {} })
    .select()
    .maybeSingle();
  if (push) {
    await sendPushToUser(supa, userId, { title, body: body || '', url: url || '', tag: type, type });
  }
  return data || null;
}

// Bulk in-app notify. Push is only attempted for small batches to stay within
// serverless execution limits; large broadcasts are in-app + on-next-open only.
export async function notifyUsers(supa, userIds, payload) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return 0;
  const rows = ids.map((user_id) => ({
    user_id,
    type: payload.type || 'admin',
    title: payload.title,
    body: payload.body || null,
    data: payload.url ? { url: payload.url } : {},
  }));
  const { error } = await supa.from('notifications').insert(rows);
  if (error) return 0;
  if (ids.length <= 50) {
    await Promise.all(ids.map((uid) => sendPushToUser(supa, uid, {
      title: payload.title, body: payload.body, url: payload.url, tag: payload.type || 'broadcast',
    })));
  }
  return ids.length;
}
