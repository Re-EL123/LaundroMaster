import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyState, errorState, badge, toast } from '../../../shared/js/ui.js';
import { escapeHtml, currency, formatDate, statusLabel, statusTone } from '../../../shared/js/format.js';
import { mountDashboard } from '../../../shared/js/shell.js';

const NEXT_STATUS = {
  accepted: 'collected',
  collected: 'washing',
  washing: 'drying',
  drying: 'ironing',
  ironing: 'ready',
  ready: 'out_for_delivery',
  out_for_delivery: 'completed',
};

const ACTION_LABEL = {
  accepted: 'Mark collected',
  collected: 'Start washing',
  washing: 'Start drying',
  drying: 'Start ironing',
  ironing: 'Mark ready',
  ready: 'Out for delivery',
  out_for_delivery: 'Mark completed',
};

(async function () {
  const user = await mountDashboard({ allowed: ['owner', 'staff', 'admin', 'super_admin'] });
  if (!user) return;

  const list = document.getElementById('list');
  const filter = document.getElementById('statusFilter');

  async function load() {
    skeleton(list, 3, 160);
    try {
      const qs = filter.value ? `?status=${encodeURIComponent(filter.value)}` : '';
      const { data: bookings } = await api.get('/bookings' + qs);
      if (!bookings.length) return emptyState(list, 'No bookings found.');
      list.innerHTML = bookings.map(render).join('');
    } catch (err) {
      errorState(list, err.message || 'Failed to load bookings.');
    }
  }

  function render(b) {
    const next = NEXT_STATUS[b.status];
    const actions = [];
    if (b.status === 'pending_acceptance') {
      actions.push(`<button class="btn btn-primary" data-id="${b.id}" data-status="accepted">Accept</button>`);
      actions.push(`<button class="btn btn-danger" data-id="${b.id}" data-status="rejected">Reject</button>`);
    } else if (next) {
      actions.push(`<button class="btn btn-primary" data-id="${b.id}" data-status="${next}">${ACTION_LABEL[b.status]}</button>`);
    }
    return `<article class="card">
      <div class="card-body">
        ${badge(statusLabel(b.status), statusTone(b.status))}
        <h3 class="card-title">${escapeHtml((b.laundromats && b.laundromats.name) || 'Booking')}</h3>
        <p class="card-meta">${b.booking_items ? b.booking_items.length : 0} item(s) · ${currency(b.total_amount)}</p>
        <p class="text-xs text-muted">${formatDate(b.created_at)}</p>
        <div class="flex">${actions.join('') || '<span class="text-sm text-muted">No action</span>'}</div>
      </div>
    </article>`;
  }

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-status]');
    if (!btn) return;
    btn.disabled = true;
    try {
      await api.post('/bookings?action=update-status', { booking_id: btn.dataset.id, status: btn.dataset.status });
      toast('Booking updated', 'success');
      load();
    } catch (err) {
      toast(err.message || 'Could not update booking', 'danger');
      btn.disabled = false;
    }
  });

  filter.addEventListener('change', load);
  load();
})();
