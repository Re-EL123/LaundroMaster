import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyState, errorState, badge, toast } from '../../../shared/js/ui.js';
import { escapeHtml, currency, formatDate, statusLabel, statusTone } from '../../../shared/js/format.js';
import { mountDashboard } from '../../../shared/js/shell.js';

(async function () {
  const user = await mountDashboard({ allowed: ['admin', 'super_admin'] });
  if (!user) return;

  const list = document.getElementById('list');

  function render(c) {
    const biz = c.laundromats ? escapeHtml(c.laundromats.name) : '';
    return `<article class="card">
      <div class="card-body">
        ${badge(statusLabel(c.status), statusTone(c.status))}
        <h3 class="card-title">${biz}</h3>
        <p class="card-meta">Gross ${currency(c.gross_amount)} &middot; ${c.commission_percent}% commission</p>
        <p class="text-sm"><strong>${currency(c.commission_amount)}</strong> platform &middot; ${currency(c.net_amount)} to owner</p>
        <p class="text-xs text-muted">${formatDate(c.created_at)}</p>
        <div class="flex">
          <button class="btn btn-primary" data-id="${c.id}" data-status="settled">Settle</button>
          <button class="btn btn-danger" data-id="${c.id}" data-status="reversed">Reverse</button>
        </div>
      </div>
    </article>`;
  }

  async function load() {
    skeleton(list, 3, 170);
    try {
      const { data: items } = await api.get('/admin?action=commissions');
      if (!items.length) return emptyState(list, 'No commission entries yet.');
      list.innerHTML = items.map(render).join('');
    } catch (err) {
      errorState(list, err.message || 'Failed to load commissions.');
    }
  }

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-status]');
    if (!btn) return;
    btn.disabled = true;
    try {
      await api.post('/admin?action=commission-update', { commission_id: btn.dataset.id, status: btn.dataset.status });
      toast('Commission updated', 'success');
      load();
    } catch (err) {
      toast(err.message || 'Could not update commission', 'danger');
      btn.disabled = false;
    }
  });

  load();
})();
