import { api } from './api-client.js';
import { publicUrl } from './uploads.js';

export async function renderAds() {
  try {
    const hero = await api.get('/ads?placement=hero');
    const banner = await api.get('/ads?placement=banner');
    const popup = await api.get('/ads?placement=popup');
    renderHero(hero.data);
    renderBanner(banner.data);
    renderPopup(popup.data);
  } catch {}
}

function renderHero(items) {
  const root = document.getElementById('heroAds');
  if (!root || !items.length) return;
  const a = items[0];
  root.innerHTML = a.media_type === 'image'
    ? `<a href="${a.link_url || '#'}" target="_blank" rel="noopener" data-ad-click="${a.id}"><img src="${getUrl(a)}" alt="${a.title}" style="width:100%;border-radius:12px"></a>`
    : `<video src="${getUrl(a)}" controls autoplay muted loop style="width:100%;border-radius:12px"></video>`;
  trackImpression(a.id);
  root.addEventListener('click', (e) => { const t = e.target.closest('[data-ad-click]'); if (t) trackClick(a.id); }, { once: true });
}

function renderBanner(items) {
  const root = document.getElementById('bannerAds');
  if (!root || !items.length) return;
  const a = items[0];
  root.innerHTML = `<div class="banner" style="margin:12px 0"><div><strong>${a.title}</strong><a href="${a.link_url || '#'}" data-ad-click="${a.id}">Learn more</a></div></div>`;
  trackImpression(a.id);
  root.addEventListener('click', (e) => { if (e.target.closest('[data-ad-click]')) trackClick(a.id); }, { once: true });
}

function renderPopup(items) {
  if (!items.length) return;
  const a = items[0];
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  div.innerHTML = `<div style="max-width:90vw;background:var(--color-panel);padding:20px;border-radius:12px;position:relative">
    <button id="adClose" style="position:absolute;right:10px;top:10px">✕</button>
    ${a.media_type === 'image' ? `<a href="${a.link_url || '#'}" data-ad-click="${a.id}"><img src="${getUrl(a)}" style="max-width:90vw;max-height:80vh"></a>` : `<video src="${getUrl(a)}" controls style="max-width:90vw;max-height:80vh"></video>`}
  </div>`;
  document.body.appendChild(div);
  trackImpression(a.id);
  div.querySelector('#adClose').onclick = () => div.remove();
  div.addEventListener('click', (e) => { if (e.target.closest('[data-ad-click]')) { trackClick(a.id); div.remove(); } }, { once: true });
  setTimeout(() => div.remove(), 15000);
}

function getUrl(a) {
  const parts = a.media_path.split('/');
  if (parts.length < 2) return a.media_path;
  return publicUrl(parts[0], parts.slice(1).join('/'));
}

async function trackClick(id) { try { await api.post(`/ads?id=${id}&action=click`); } catch {} }
async function trackImpression(id) { try { await api.post(`/ads?id=${id}&action=impression`); } catch {} }
