import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyState, errorState, badge, toast, confirmAction } from '../../../shared/js/ui.js';
import { escapeHtml, currency, relativeTime, statusLabel, statusTone, param } from '../../../shared/js/format.js';
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

const SLA_MINUTES = 60;

(async function () {
  const user = await mountDashboard({ allowed: ['owner', 'staff', 'admin', 'super_admin'] });
  if (!user) return;

  const list = document.getElementById('list');
  const filter = document.getElementById('statusFilter');
  const acceptAllBtn = document.getElementById('acceptAllBtn');
  const slaNote = document.getElementById('slaNote');

  const initial = param('status');
  if (initial) filter.value = initial;

  function slaLine(b) {
    if (b.status !== 'pending_acceptance') return '';
    const waited = Math.round((Date.now() - new Date(b.created_at).getTime()) / 60000);
    const overdue = waited >= SLA_MINUTES;
    return `<p class="text-xs ${overdue ? 'error' : 'text-muted'}">${overdue ? `Waiting ${waited} min — respond now` : `New request · respond within ${SLA_MINUTES} min`}</p>`;
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
    const customer = b.customer && b.customer.full_name ? `<p class="card-meta">${escapeHtml(b.customer.full_name)}${b.customer.phone ? ` · ${escapeHtml(b.customer.phone)}` : ''}</p>` : '';
    return `<article class="card">
      <div class="card-body">
        <div class="flex justify-between wrap">
          ${badge(statusLabel(b.status), statusTone(b.status))}
          <span class="text-xs text-muted">${escapeHtml(relativeTime(b.created_at))}</span>
        </div>
        <h3 class="card-title">${escapeHtml((b.laundromats && b.laundromats.name) || 'Booking')}</h3>
        ${customer}
        <p class="card-meta">${b.booking_items ? b.booking_items.length : 0} item(s) · ${currency(b.total_amount)}</p>
        ${slaLine(b)}
        <div class="flex wrap">${actions.join('') || '<span class="text-sm text-muted">No action</span>'}</div>
      </div>
    </article>`;
  }

  async function load() {
    skeleton(list, 3, 160);
    try {
      const qs = filter.value ? `?status=${encodeURIComponent(filter.value)}` : '';
      const { data: bookings } = await api.get('/bookings' + qs);
      const pending = bookings.filter((b) => b.status === 'pending_acceptance').length;
      if (slaNote) slaNote.textContent = pending ? `${pending} awaiting your acceptance` : '';
      acceptAllBtn.disabled = pending === 0;
      if (!bookings.length) return emptyState(list, 'No bookings found.');
      const ordered = [...bookings].sort((a, b) => (b.status === 'pending_acceptance') - (a.status === 'pending_acceptance'));
      list.innerHTML = ordered.map(render).join('');
    } catch (err) {
      errorState(list, err.message || 'Failed to load bookings.');
    }
  }

  async function setStatus(bookingId, status) {
    if (status === 'rejected' && !confirmAction('Reject this booking?')) return false;
    try {
      await api.post('/bookings?action=update-status', { booking_id: bookingId, status });
      return true;
    } catch (err) {
      toast(err.message || 'Could not update booking', 'danger');
      return false;
    }
  }

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-status]');
    if (!btn) return;
    btn.disabled = true;
    const ok = await setStatus(btn.dataset.id, btn.dataset.status);
    toast(ok ? 'Booking updated' : 'Update failed', ok ? 'success' : 'danger');
    if (ok) load(); else btn.disabled = false;
  });

  acceptAllBtn.addEventListener('click', async () => {
    const buttons = [...list.querySelectorAll('button[data-status="accepted"]')];
    if (!buttons.length) return;
    acceptAllBtn.disabled = true;
    let done = 0;
    for (const btn of buttons) {
      if (await setStatus(btn.dataset.id, 'accepted')) done += 1;
    }
    toast(`Accepted ${done} booking(s)`, 'success');
    load();
  });

  filter.addEventListener('change', load);
  load();
})();
