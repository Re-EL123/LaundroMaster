import { api } from './api-client.js';
import { getSession } from './auth-client.js';
import { escapeHtml, relativeTime } from './format.js';
import { toast } from './ui.js';

const BELL = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;

export async function mountNotifications(host) {
  if (!host) return;
  const session = getSession();
  if (!session || !session.access_token) return;

  host.classList.add('notif');
  host.innerHTML = `<button type="button" class="notif-btn" id="notifBtn" aria-haspopup="true" aria-expanded="false" aria-label="Notifications">
    ${BELL}<span class="notif-count" id="notifCount" hidden>0</span>
  </button>
  <div class="notif-panel" id="notifPanel" hidden>
    <div class="notif-head">
      <strong class="text-sm">Notifications</strong>
      <button type="button" class="btn btn-secondary text-xs" id="notifReadAll">Mark all read</button>
    </div>
    <div class="notif-list" id="notifList"><p class="text-muted text-sm" style="padding:var(--space-4)">Loading…</p></div>
  </div>`;

  const btn = host.querySelector('#notifBtn');
  const panel = host.querySelector('#notifPanel');
  const countEl = host.querySelector('#notifCount');
  const listEl = host.querySelector('#notifList');
  let items = [];

  function setCount(n) {
    if (n > 0) { countEl.hidden = false; countEl.textContent = n > 9 ? '9+' : String(n); }
    else countEl.hidden = true;
  }

  function renderList() {
    if (!items.length) { listEl.innerHTML = '<p class="text-muted text-sm" style="padding:var(--space-4)">You are all caught up.</p>'; return; }
    listEl.innerHTML = items.map((n) => `<button type="button" class="notif-item${n.read_at ? '' : ' is-unread'}" data-id="${escapeHtml(n.id)}">
      <strong>${escapeHtml(n.title || 'Update')}</strong>
      ${n.body ? `<p>${escapeHtml(n.body)}</p>` : ''}
      <p>${escapeHtml(relativeTime(n.created_at))}</p>
    </button>`).join('');
    listEl.querySelectorAll('[data-id]').forEach((el) => {
      el.addEventListener('click', async () => {
        const item = items.find((x) => x.id === el.dataset.id);
        if (item && !item.read_at) {
          try {
            await api.patch('/notifications?id=' + encodeURIComponent(item.id));
            item.read_at = new Date().toISOString();
            el.classList.remove('is-unread');
            setCount(items.filter((x) => !x.read_at).length);
          } catch { /* ignore */ }
        }
      });
    });
  }

  async function load() {
    try {
      const { data } = await api.get('/notifications?limit=20');
      items = data || [];
      setCount(items.filter((n) => !n.read_at).length);
      renderList();
    } catch (err) {
      if (err.status === 401) return;
      listEl.innerHTML = '<p class="error text-sm" style="padding:var(--space-4)">Could not load notifications.</p>';
    }
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = panel.hidden;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  });
  panel.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); });

  host.querySelector('#notifReadAll').addEventListener('click', async () => {
    try {
      await api.post('/notifications?action=read-all', {});
      items = items.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }));
      renderList();
      setCount(0);
    } catch (err) {
      toast(err.message || 'Could not update', 'danger');
    }
  });

  load();
  return { refresh: load };
}
