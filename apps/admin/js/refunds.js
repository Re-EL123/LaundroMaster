import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyState, errorState, badge, toast } from '../../../shared/js/ui.js';
import { currency, formatDate, statusLabel, statusTone } from '../../../shared/js/format.js';
import { mountDashboard } from '../../../shared/js/shell.js';

(async function () {
  const user = await mountDashboard({ allowed: ['admin', 'super_admin'] });
  if (!user) return;

  const list = document.getElementById('list');

  function render(r) {
    const pending = ['pending', 'approved'].includes(r.status);
    return `<article class="card">
      <div class="card-body">
        ${badge(statusLabel(r.status), statusTone(r.status))}
        <h3 class="card-title">${currency(r.amount)}</h3>
        <p class="card-meta">Payment ${r.payments ? r.payments.id.slice(0, 8) : '—'}</p>
        <p class="text-xs text-muted">${formatDate(r.created_at)}</p>
        ${pending ? `<div class="flex">
          <button class="btn btn-primary" data-id="${r.id}" data-status="processed">Mark processed</button>
          <button class="btn btn-danger" data-id="${r.id}" data-status="rejected">Reject</button>
        </div>` : ''}
      </div>
    </article>`;
  }

  async function load() {
    skeleton(list, 3, 170);
    try {
      const { data: items } = await api.get('/admin?action=refunds');
      if (!items.length) return emptyState(list, 'No refunds.');
      list.innerHTML = items.map(render).join('');
    } catch (err) {
      errorState(list, err.message || 'Failed to load refunds.');
    }
  }

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-status]');
    if (!btn) return;
    btn.disabled = true;
    try {
      await api.post('/admin?action=refund-update', { refund_id: btn.dataset.id, status: btn.dataset.status });
      toast('Refund updated', 'success');
      load();
    } catch (err) {
      toast(err.message || 'Could not update refund', 'danger');
      btn.disabled = false;
    }
  });

  load();
})();
