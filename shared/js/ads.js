import { api } from './api-client.js';
import { publicUrl } from './uploads.js';
import { escapeHtml } from './format.js';

function mediaUrl(ad) {
  const path = String(ad.media_path || '');
  const parts = path.split('/');
  if (parts.length < 2) return path;
  // Ads store `bucket/path`; be forgiving if only the path was saved.
  const bucket = parts[0] === 'laundromat-media' ? parts.shift() : 'laundromat-media';
  return publicUrl(bucket, parts.join('/'));
}

function seen(key) {
  try { return sessionStorage.getItem(key) === '1'; } catch { return false; }
}

function markSeen(key) {
  try { sessionStorage.setItem(key, '1'); } catch { /* private mode */ }
}

export async function renderAds() {
  const roots = ['heroAds', 'bannerAds'].map((id) => document.getElementById(id)).filter(Boolean);
  if (!roots.length) return;
  try {
    const { data } = await api.get('/laundromats?action=ads');
    const items = Array.isArray(data) ? data : [];
    renderHero(items.filter((a) => a.placement === 'hero'));
    renderBanner(items.filter((a) => a.placement === 'banner'));
    renderPopup(items.filter((a) => a.placement === 'popup'));
  } catch { /* ads are never critical to the page */ }
}

function renderHero(items) {
  const root = document.getElementById('heroAds');
  if (!root || !items.length) return;
  const a = items[0];
  const url = mediaUrl(a);
  root.innerHTML = a.media_type === 'image'
    ? `<a href="${escapeHtml(a.link_url || '#')}" target="_blank" rel="noopener sponsored" data-ad-click="${escapeHtml(a.id)}"><img src="${escapeHtml(url)}" alt="${escapeHtml(a.title || 'Advertisement')}" loading="lazy" style="width:100%;border-radius:12px"></a>`
    : `<video src="${escapeHtml(url)}" controls autoplay muted loop playsinline style="width:100%;border-radius:12px"></video>`;
  trackImpression(a.id);
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-ad-click]')) trackClick(a.id);
  }, { once: true });
}

function renderBanner(items) {
  const root = document.getElementById('bannerAds');
  if (!root || !items.length) return;
  const a = items[0];
  root.innerHTML = `<aside class="callout callout-primary" style="margin:12px 0" aria-label="Sponsored">
    <div><strong class="text-sm">${escapeHtml(a.title || 'Sponsored')}</strong>
    <p class="text-xs text-muted">Advertisement</p></div>
    <a class="btn btn-secondary text-sm" href="${escapeHtml(a.link_url || '#')}" target="_blank" rel="noopener sponsored" data-ad-click="${escapeHtml(a.id)}">Learn more</a>
  </aside>`;
  trackImpression(a.id);
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-ad-click]')) trackClick(a.id);
  }, { once: true });
}

function renderPopup(items) {
  if (!items.length) return;
  const a = items[0];
  if (seen(`lm_ad_seen_${a.id}`)) return;
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  div.innerHTML = `<div role="dialog" aria-modal="true" aria-label="Advertisement" style="max-width:90vw;background:var(--color-panel);padding:20px;border-radius:12px;position:relative">
    <button type="button" data-ad-close aria-label="Close advertisement" style="position:absolute;right:10px;top:10px">✕</button>
    <p class="text-xs text-muted" style="margin:0 0 8px">Advertisement</p>
    ${a.media_type === 'image'
      ? `<a href="${escapeHtml(a.link_url || '#')}" target="_blank" rel="noopener sponsored" data-ad-click="${escapeHtml(a.id)}"><img src="${escapeHtml(mediaUrl(a))}" alt="${escapeHtml(a.title || 'Advertisement')}" style="max-width:90vw;max-height:80vh"></a>`
      : `<video src="${escapeHtml(mediaUrl(a))}" controls style="max-width:90vw;max-height:80vh"></video>`}
  </div>`;
  document.body.appendChild(div);
  markSeen(`lm_ad_seen_${a.id}`);
  trackImpression(a.id);
  const close = () => div.remove();
  div.querySelector('[data-ad-close]').addEventListener('click', close);
  div.addEventListener('click', (e) => {
    if (e.target.closest('[data-ad-click]')) { trackClick(a.id); close(); }
  });
  setTimeout(close, 15000);
}

function trackClick(id) { api.post(`/laundromats?action=ad-click&id=${encodeURIComponent(id)}`).catch(() => {}); }
function trackImpression(id) {
  if (seen(`lm_ad_imp_${id}`)) return;
  markSeen(`lm_ad_imp_${id}`);
  api.post(`/laundromats?action=ad-impression&id=${encodeURIComponent(id)}`).catch(() => {});
}
