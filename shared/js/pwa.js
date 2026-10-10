// Progressive Web App helpers: service worker registration + install prompt.

function siteBase() {
  const p = location.pathname;
  const i = p.indexOf('/apps/');
  return i >= 0 ? p.slice(0, i) : '';
}

export function assetBase() {
  return siteBase();
}

let deferredPrompt = null;
const listeners = new Set();

export function onInstallAvailable(fn) {
  listeners.add(fn);
  if (deferredPrompt) fn(true);
  return () => listeners.delete(fn);
}

export function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export async function promptInstall() {
  if (!deferredPrompt) return false;
  const prompt = deferredPrompt;
  deferredPrompt = null;
  const choice = await prompt.prompt().then(() => prompt.userChoice).catch(() => null);
  listeners.forEach((fn) => fn(false));
  return !!(choice && choice.outcome === 'accepted');
}

export function register() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register(`${siteBase()}/sw.js`, { scope: `${siteBase()}/` }).catch(() => {});
}

// Wire an install button; returns a cleanup function.
export function wireInstallButton(button, { hideWhenUnavailable = true } = {}) {
  if (!button) return () => {};
  const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  const iosManual = isIOS() && !standalone;

  const apply = (available) => {
    if (standalone) { button.hidden = true; return; }
    if (!hideWhenUnavailable) { button.hidden = false; return; }
    button.hidden = !(available || iosManual);
  };
  const off = onInstallAvailable(apply);
  apply(Boolean(deferredPrompt));

  button.addEventListener('click', async () => {
    if (deferredPrompt) {
      await promptInstall();
    } else if (isIOS()) {
      alert('To install: tap the Share button, then "Add to Home Screen".');
    } else {
      alert('Use your browser menu and choose "Install app" or "Add to Home screen".');
    }
  });
  return off;
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register);

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    listeners.forEach((fn) => fn(true));
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    listeners.forEach((fn) => fn(false));
  });
}
