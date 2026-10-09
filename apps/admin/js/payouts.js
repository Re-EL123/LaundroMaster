import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyState, errorState, badge, toast } from '../../../shared/js/ui.js';
import { escapeHtml, currency, formatDate, statusLabel, statusTone } from '../../../shared/js/format.js';
import { mountDashboard } from '../../../shared/js/shell.js';

(async function () {
  const user = await mountDashboard({ allowed: ['admin', 'super_admin'] });
  if (!user) return;

  const list = document.getElementById('list');

  function render(p) {
    const owner = p.profiles ? escapeHtml(p.profiles.full_name || p.profiles.email || '') : '';
    const terminal = ['paid', 'rejected'].includes(p.status);
    return `<article class="card">
      <div class="card-body">
        ${badge(statusLabel(p.status), statusTone(p.status))}
        <h3 class="card-title">${currency(p.amount, p.currency)}</h3>
        <p class="card-meta">${owner}</p>
        <p class="text-xs text-muted">Requested ${formatDate(p.created_at)}</p>
        ${p.reference ? `<p class="text-xs text-muted">Ref: ${escapeHtml(p.reference)}</p>` : ''}
        ${terminal ? '' : `<div class="field"><input class="input" data-ref="${p.id}" placeholder="Payment reference"></div>
        <div class="flex">
          <button class="btn btn-secondary" data-id="${p.id}" data-status="processing">Processing</button>
          <button class="btn btn-primary" data-id="${p.id}" data-status="paid">Mark paid</button>
          <button class="btn btn-danger" data-id="${p.id}" data-status="rejected">Reject</button>
        </div>`}
      </div>
    </article>`;
  }

  async function load() {
    skeleton(list, 3, 170);
    try {
      const { data: items } = await api.get('/admin?action=payouts');
      if (!items.length) return emptyState(list, 'No payout requests.');
      list.innerHTML = items.map(render).join('');
    } catch (err) {
      errorState(list, err.message || 'Failed to load payouts.');
    }
  }

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-status]');
    if (!btn) return;
    btn.disabled = true;
    const refInput = list.querySelector(`input[data-ref="${btn.dataset.id}"]`);
    try {
      await api.post('/admin?action=payout-update', {
        payout_id: btn.dataset.id,
        status: btn.dataset.status,
        reference: refInput ? refInput.value.trim() || null : null,
      });
      toast('Payout updated', 'success');
      load();
    } catch (err) {
      toast(err.message || 'Could not update payout', 'danger');
      btn.disabled = false;
    }
  });

  load();
})();
