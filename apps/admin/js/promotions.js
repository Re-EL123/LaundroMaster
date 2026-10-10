import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyState, errorState, badge, toast, confirmAction } from '../../../shared/js/ui.js';
import { escapeHtml, currency, formatDate, statusLabel, statusTone } from '../../../shared/js/format.js';
import { mountDashboard } from '../../../shared/js/shell.js';

(async function () {
  const user = await mountDashboard({ allowed: ['admin', 'super_admin'] });
  if (!user) return;

  const list = document.getElementById('list');

  function effectiveStatus(p) {
    if (p.status === 'active' && p.ends_at && new Date(p.ends_at).getTime() <= Date.now()) return 'expired';
    return p.status;
  }

  function render(p) {
    const biz = p.laundromats ? escapeHtml(p.laundromats.name) : '';
    const owner = p.profiles ? escapeHtml(p.profiles.full_name || p.profiles.email || '') : '';
    const status = effectiveStatus(p);
    const active = status === 'active';
    return `<article class="card">
      <div class="card-body">
        ${badge(statusLabel(status), statusTone(status))}
        <h3 class="card-title">${biz}</h3>
        <p class="card-meta">${escapeHtml(p.kind)} &middot; ${currency(p.amount_paid, p.currency)}</p>
        <p class="text-xs text-muted">${owner}</p>
        <p class="text-xs text-muted">${formatDate(p.starts_at)} &rarr; ${formatDate(p.ends_at)}</p>
        ${active ? `<div class="flex">
          <button class="btn btn-secondary" data-id="${p.id}" data-status="expired">Expire</button>
          <button class="btn btn-danger" data-id="${p.id}" data-status="cancelled">Cancel</button>
        </div>` : ''}
      </div>
    </article>`;
  }

  async function load() {
    skeleton(list, 3, 170);
    try {
      const { data: items } = await api.get('/admin?action=promotions');
      if (!items.length) return emptyState(list, 'No promotions yet.');
      list.innerHTML = items.map(render).join('');
    } catch (err) {
      errorState(list, err.message || 'Failed to load promotions.');
    }
  }

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-status]');
    if (!btn) return;
    const status = btn.dataset.status;
    const verb = status === 'cancelled' ? 'Cancel' : 'Expire';
    if (!confirmAction(`${verb} this promotion? It will stop being featured immediately.`)) return;
    btn.disabled = true;
    try {
      await api.post('/admin?action=promotion-update', { promotion_id: btn.dataset.id, status });
      toast('Promotion updated', 'success');
      load();
    } catch (err) {
      toast(err.message || 'Could not update promotion', 'danger');
      btn.disabled = false;
    }
  });

  load();
})();

