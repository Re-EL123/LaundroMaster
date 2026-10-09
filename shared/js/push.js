import { api } from './api-client.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function isSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

export function permission() {
  return typeof Notification !== 'undefined' ? Notification.permission : 'denied';
}

async function ready() {
  if (!('serviceWorker' in navigator)) throw new Error('Service worker not supported');
  return navigator.serviceWorker.ready;
}

export async function currentSubscription() {
  try {
    const reg = await ready();
    return reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function vapidKey() {
  const { data } = await api.get('/notifications?action=vapid');
  return data.publicKey;
}

export async function enable(onStatus) {
  if (!isSupported()) throw new Error('Push notifications are not supported on this device');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notification permission was not granted');
  onStatus?.('Registering device…');

  const reg = await ready();
  const key = await vapidKey();
  if (!key) throw new Error('Push is not configured on the server yet');

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
  }
  onStatus?.('Saving…');
  const json = sub.toJSON();
  await api.post('/notifications?action=subscribe', {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    user_agent: navigator.userAgent,
  });
  return sub;
}

export async function disable() {
  const sub = await currentSubscription();
  if (sub) {
    try {
      await api.post('/notifications?action=unsubscribe', { endpoint: sub.endpoint });
    } catch { /* still unsubscribe locally */ }
    await sub.unsubscribe().catch(() => {});
  }
  return true;
}

export async function sendTest() {
  try {
    await api.post('/notifications?action=test', {});
    return true;
  } catch {
    return false;
  }
}
