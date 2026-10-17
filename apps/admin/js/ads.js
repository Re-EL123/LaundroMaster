import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyState, errorState, toast, badge } from '../../../shared/js/ui.js';
import { escapeHtml, publicUrl } from '../../../shared/js/format.js';
import { mountDashboard } from '../../../shared/js/shell.js';

(async function () {
  const user = await mountDashboard({ allowed: ['admin', 'super_admin'] });
  if (!user) return;

  const list = document.getElementById('list');
  const form = document.getElementById('adForm');

  async function load() {
    skeleton(list, 3, 120);
    try {
      const { data } = await api.get('/admin?action=ads');
      if (!data.length) return emptyState(list, 'No ads yet.');
      list.innerHTML = data.map(render).join('');
    } catch (err) {
      errorState(list, err.message || 'Failed to load ads.');
    }
  }

  function render(a) {
    const media = a.media_type === 'image'
      ? `<img src="${publicUrl(a.media_path.split('/')[0], a.media_path.split('/').slice(1).join('/'))}" alt="" style="max-width:100%;border-radius:8px;margin-bottom:8px">`
      : `<video src="${publicUrl(a.media_path.split('/')[0], a.media_path.split('/').slice(1).join('/'))}" controls style="max-width:100%;border-radius:8px;margin-bottom:8px"></video>`;
    return `<article class="card"><div class="card-body">
      <div class="flex justify-between">${badge(a.placement)} ${badge(a.is_active ? 'active' : 'inactive', a.is_active ? 'success' : 'danger')}</div>
      <h3 class="card-title">${escapeHtml(a.title)}</h3>
      ${media}
      <p class="text-xs text-muted">Clicks ${a.clicks} · Impressions ${a.impressions}</p>
      <button class="btn btn-secondary" data-toggle="${a.id}" data-active="${a.is_active}">${a.is_active ? 'Deactivate' : 'Activate'}</button>
      <button class="btn btn-danger" data-del="${a.id}">Delete</button>
    </div></article>`;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    payload.priority = Number(payload.priority) || 0;
    try {
      await api.post('/admin?action=ad-create', payload);
      toast('Ad created', 'success');
      form.reset();
      load();
    } catch (err) {
      toast(err.message || 'Could not create ad', 'danger');
    }
  });

  list.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.dataset.toggle) {
      await api.post('/admin?action=ad-update', { id: t.dataset.toggle, is_active: t.dataset.active !== 'true' });
      load();
    }
    if (t.dataset.del) {
      if (!confirm('Delete ad?')) return;
      await api.post('/admin?action=ad-delete', { id: t.dataset.del });
      load();
    }
  });

  load();
})();
