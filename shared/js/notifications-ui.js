import { api } from './api-client.js';
import { getSession } from './auth-client.js';
import { escapeHtml, relativeTime } from './format.js';
import { toast } from './ui.js';
import { getPrefs, setPrefs, playNotification, playUrl, testSound, searchSounds } from './sound.js';
import * as push from './push.js';

const BELL = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;

function siteBase() {
  const p = location.pathname;
  const i = p.indexOf('/apps/');
  return i >= 0 ? p.slice(0, i) : '';
}

function targetUrl(item) {
  const rel = item && item.data && item.data.url;
  if (!rel) return '';
  return new URL(rel, location.origin + siteBase() + '/').href;
}

function notifyTag(item) {
  return (item && (item.data?.tag || item.type)) || 'lm';
}

export async function mountNotifications(host) {
  if (!host) return null;
  const session = getSession();
  if (!session) return null;

  let items = [];
  let seen = new Set();
  let primed = false;

  host.classList.add('notif');
  host.innerHTML = `
    <button type="button" class="notif-btn" aria-label="Notifications" aria-haspopup="true" aria-expanded="false">
      ${BELL}<span class="notif-count" hidden>0</span>
    </button>
    <div class="notif-panel" hidden>
      <header class="notif-head">
        <strong>Notifications</strong>
        <button type="button" class="notif-link" data-act="read-all">Mark all read</button>
      </header>
      <div class="notif-list" data-list><p class="notif-empty">Loading…</p></div>
      <footer class="notif-prefs">
        <label class="notif-row"><span>Alert sound</span>
          <input type="checkbox" data-pref="sound" ${getPrefs().sound ? 'checked' : ''}>
        </label>
        <label class="notif-row"><span>Volume</span>
          <input type="range" min="0" max="1" step="0.1" data-pref="volume" value="${getPrefs().volume}">
        </label>
        <div class="notif-row notif-actions">
          <button type="button" class="notif-link" data-act="test-sound">Test sound</button>
          <button type="button" class="notif-link" data-act="toggle-push">Enable device alerts</button>
        </div>
        <details class="notif-sounds">
          <summary>Choose a sound (Freesound)</summary>
          <div class="notif-search">
            <input type="search" data-sound-q placeholder="Search sounds…" aria-label="Search notification sounds">
            <button type="button" class="notif-link" data-act="search">Search</button>
          </div>
          <div data-sound-results class="notif-sound-results"></div>
        </details>
      </footer>
    </div>`;

  const bell = host.querySelector('.notif-btn');
  const panel = host.querySelector('.notif-panel');
  const badge = host.querySelector('.notif-count');
  const list = host.querySelector('[data-list]');
  const pushBtn = host.querySelector('[data-act="toggle-push"]');

  function setBadge(n) {
    if (n > 0) { badge.hidden = false; badge.textContent = n > 9 ? '9+' : String(n); }
    else { badge.hidden = true; }
  }

  function open(force) {
    const next = force === undefined ? panel.hidden : force;
    panel.hidden = !next;
    bell.setAttribute('aria-expanded', String(next));
    if (next) syncPushButton();
  }

  function render() {
    if (!items.length) { list.innerHTML = '<p class="notif-empty">You are all caught up.</p>'; return; }
    list.innerHTML = items.map((n) => `
      <button type="button" class="notif-item${n.read_at ? '' : ' is-unread'}" data-id="${escapeHtml(n.id)}">
        <strong>${escapeHtml(n.title || 'Update')}</strong>
        ${n.body ? `<p>${escapeHtml(n.body)}</p>` : ''}
        <p>${escapeHtml(relativeTime(n.created_at))}</p>
      </button>`).join('');
  }

  async function markRead(item, el) {
    if (!item || item.read_at) return;
    try {
      await api.patch(`/notifications?id=${encodeURIComponent(item.id)}`);
      item.read_at = new Date().toISOString();
      el?.classList.remove('is-unread');
      setBadge(items.filter((n) => !n.read_at).length);
    } catch { /* ignore */ }
  }

  list.addEventListener('click', (e) => {
    const el = e.target.closest('[data-id]');
    if (!el) return;
    const item = items.find((n) => n.id === el.dataset.id);
    markRead(item, el);
    const url = targetUrl(item);
    if (url) location.assign(url);
  });

  host.querySelector('[data-act="read-all"]').addEventListener('click', async () => {
    try {
      await api.post('/notifications?action=read-all', {});
      items = items.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }));
      setBadge(0);
      render();
    } catch (err) { toast(err.message || 'Could not update', 'danger'); }
  });

  host.addEventListener('click', (e) => e.stopPropagation());
  bell.addEventListener('click', () => open());
  const onDocClick = () => open(false);
  document.addEventListener('click', onDocClick);

  host.querySelector('[data-pref="sound"]').addEventListener('change', (e) => setPrefs({ sound: e.target.checked }));
  host.querySelector('[data-pref="volume"]').addEventListener('input', (e) => setPrefs({ volume: Number(e.target.value) }));

  host.querySelector('[data-act="test-sound"]').addEventListener('click', () => testSound());

  host.querySelector('[data-act="search"]').addEventListener('click', runSearch);
  host.querySelector('[data-sound-q]').addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(); });

  async function runSearch() {
    const q = host.querySelector('[data-sound-q]').value.trim();
    const box = host.querySelector('[data-sound-results]');
    box.innerHTML = '<p class="notif-empty">Searching…</p>';
    try {
      const payload = await searchSounds(q);
      const results = (payload && payload.results) || [];
      if (!results.length) { box.innerHTML = '<p class="notif-empty">No sounds found. The built-in chime still works.</p>'; return; }
      box.innerHTML = results.map((r) => `
        <button type="button" class="notif-sound" data-url="${escapeHtml(r.preview)}" data-name="${escapeHtml(r.name)}">
          <span>${escapeHtml(r.name)}</span><small>${escapeHtml(r.username || '')} · ${Math.round(r.duration || 0)}s</small>
        </button>`).join('');
      box.querySelectorAll('[data-url]').forEach((el) => el.addEventListener('click', () => {
        setPrefs({ soundUrl: el.dataset.url, soundName: el.dataset.name });
        playUrl(el.dataset.url);
        toast('Notification sound updated');
      }));
    } catch {
      box.innerHTML = '<p class="notif-empty">Could not reach the sound library.</p>';
    }
  }

  async function syncPushButton() {
    if (!push.isSupported()) { pushBtn.hidden = true; return; }
    const sub = await push.currentSubscription();
    pushBtn.textContent = sub ? 'Disable device alerts' : 'Enable device alerts';
  }

  pushBtn.addEventListener('click', async () => {
    pushBtn.disabled = true;
    try {
      const sub = await push.currentSubscription();
      if (sub) { await push.disable(); toast('Device alerts turned off'); }
      else { await push.enable(); toast('Device alerts enabled'); }
    } catch (err) {
      toast(err.message || 'Could not change device alerts', 'danger');
    } finally {
      pushBtn.disabled = false;
      syncPushButton();
    }
  });

  async function load() {
    try {
      const { data } = await api.get('/notifications?limit=20');
      const rows = data || [];
      const fresh = primed ? rows.filter((n) => !seen.has(n.id)) : [];
      items = rows;
      setBadge(items.filter((n) => !n.read_at).length);
      render();
      items.forEach((n) => seen.add(n.id));
      primed = true;
      if (fresh.length) {
        playNotification();
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          const latest = fresh[fresh.length - 1];
          const note = new Notification(latest.title || 'LaundroMaster', {
            body: latest.body || '',
            icon: `${siteBase()}/shared/assets/app-icon.png`,
            tag: notifyTag(latest),
          });
          note.onclick = () => { window.focus(); const url = targetUrl(latest); if (url) location.assign(url); };
        }
      }
    } catch (err) {
      if (err.status !== 401) list.innerHTML = '<p class="notif-empty">Could not load notifications.</p>';
    }
  }

  await load();
  const timer = setInterval(load, 30000);

  syncPushButton();
  return {
    refresh: load,
    destroy: () => {
      clearInterval(timer);
      document.removeEventListener('click', onDocClick);
    },
  };
}
