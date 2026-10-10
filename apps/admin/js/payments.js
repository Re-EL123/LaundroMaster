import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyState, errorState, badge, toast, statTile } from '../../../shared/js/ui.js';
import { currency, formatDate, statusLabel, statusTone, escapeHtml } from '../../../shared/js/format.js';
import { mountDashboard } from '../../../shared/js/shell.js';

(async function () {
  const user = await mountDashboard({ allowed: ['admin', 'super_admin'] });
  if (!user) return;

  const list = document.getElementById('list');
  const stats = document.getElementById('stats');
  const filter = document.getElementById('statusFilter');

  async function load() {
    skeleton(list, 3, 150);
    try {
      const q = filter.value ? `&status=${encodeURIComponent(filter.value)}` : '';
      const { data } = await api.get(`/admin?action=payments${q}`);
      const { payments, totals } = data;
      stats.innerHTML = [
        statTile({ label: 'Collected', value: currency(totals.collected), tone: 'success' }),
        statTile({ label: 'Refunded', value: currency(totals.refunded), tone: 'warn' }),
        statTile({ label: 'Pending', value: totals.pending }),
        statTile({ label: 'Failed', value: totals.failed, tone: 'danger' }),
      ].join('');
      if (!payments.length) return emptyState(list, 'No payments found.');
      list.innerHTML = payments.map(render).join('');
    } catch (err) {
      errorState(list, err.message || 'Failed to load payments.');
    }
  }

  function render(p) {
    const customer = (p.profiles && (p.profiles.full_name || p.profiles.email)) || '—';
    const biz = (p.bookings && p.bookings.laundromats && p.bookings.laundromats.name) || p.purpose || '—';
    const refundable = p.status === 'succeeded' && p.amount > 0;
    return `<article class="card">
      <div class="card-body">
        <div class="flex justify-between wrap">
          ${badge(statusLabel(p.status), statusTone(p.status))}
          <span class="text-xs text-muted">${formatDate(p.created_at)}</span>
        </div>
        <h3 class="card-title">${currency(p.amount, p.currency)}</h3>
        <p class="card-meta">${escapeHtml(customer)} · ${escapeHtml(biz)}</p>
        <p class="text-xs text-muted">${escapeHtml(p.provider || '')} · ${escapeHtml((p.id || '').slice(0, 8))}</p>
        ${refundable ? `<button class="btn btn-secondary" data-refund="${p.id}" data-amount="${p.amount}">Refund</button>` : ''}
      </div>
    </article>`;
  }

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-refund]');
    if (!btn) return;
    const input = prompt('Refund amount', btn.dataset.amount);
    if (input === null) return;
    const amount = Number(input);
    if (!amount || amount <= 0) return;
    const reason = prompt('Reason (optional)') || null;
    btn.disabled = true;
    try {
      await api.post('/admin?action=refund-create', { payment_id: btn.dataset.refund, amount, reason });
      toast('Refund created', 'success');
      load();
    } catch (err) {
      toast(err.message || 'Could not create refund', 'danger');
      btn.disabled = false;
    }
  });

  filter.addEventListener('change', load);
  load();
})();
