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

  let staffByLaundromat = new Map();
  async function loadStaff() {
    try {
      const { data } = await api.get('/owner?action=staff');
      staffByLaundromat = new Map();
      (data || []).forEach((m) => {
        const arr = staffByLaundromat.get(m.laundromat_id) || [];
        arr.push({ id: m.user_id, name: (m.profiles && m.profiles.full_name) || m.profiles?.email || 'Staff', role: m.member_role });
        staffByLaundromat.set(m.laundromat_id, arr);
      });
    } catch { /* staff list is optional */ }
  }

  function slaLine(b) {
    if (b.status !== 'pending_acceptance') return '';
    const waited = Math.round((Date.now() - new Date(b.created_at).getTime()) / 60000);
    const overdue = waited >= SLA_MINUTES;
    return `<p class="text-xs ${overdue ? 'error' : 'text-muted'}">${overdue ? `Waiting ${waited} min — respond now` : `New request · respond within ${SLA_MINUTES} min`}</p>`;
  }

  function staffOptions(b) {
    const members = staffByLaundromat.get(b.laundromat_id) || [];
    const opts = ['<option value="">Unassigned</option>'].concat(
      members.map((m) => `<option value="${m.id}"${b.assigned_staff_id === m.id ? ' selected' : ''}>${escapeHtml(m.name)} (${m.role})</option>`)
    );
    return opts.join('');
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
    return `<article class="card" data-booking="${b.id}">
      <div class="card-body">
        <div class="flex justify-between wrap">
          ${badge(statusLabel(b.status), statusTone(b.status))}
          <span class="text-xs text-muted">${escapeHtml(relativeTime(b.created_at))}</span>
        </div>
        <h3 class="card-title">${escapeHtml((b.laundromats && b.laundromats.name) || 'Booking')}</h3>
        ${customer}
        <p class="card-meta">${b.booking_items ? b.booking_items.length : 0} item(s) · ${currency(b.total_amount)}</p>
        ${slaLine(b)}
        <div class="flex wrap">
          ${actions.join('')}
          <button class="btn btn-secondary" data-manage="${b.id}">Message &amp; assign</button>
        </div>
        <div class="booking-manage" data-manage-panel="${b.id}" hidden></div>
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

  function panelHtml(b) {
    const messages = (b.messages || []).map((m) => {
      const mine = m.sender_role !== 'customer';
      return `<div class="chat-line ${mine ? 'is-out' : 'is-in'}">
        <span class="chat-meta">${escapeHtml(m.sender_role || 'user')} · ${escapeHtml(relativeTime(m.created_at))}</span>
        <p class="chat-body">${escapeHtml(m.body)}</p>
      </div>`;
    }).join('') || '<p class="text-muted text-sm">No messages yet.</p>';
    return `
      <div class="field mt-4">
        <label class="label">Assigned to</label>
        <select class="input" data-assign>${staffOptions(b)}</select>
      </div>
      <div class="field">
        <label class="label">Internal note (private)</label>
        <textarea class="input" rows="2" data-note>${escapeHtml(b.internal_notes || '')}</textarea>
        <button class="btn btn-secondary" data-save-note>Save note</button>
      </div>
      <div class="chat-thread" data-thread>${messages}</div>
      <form class="flex mt-2" data-chat-form>
        <input class="input" data-chat-input placeholder="Message the customer…" autocomplete="off">
        <button class="btn btn-primary" type="submit">Send</button>
      </form>`;
  }

  async function openPanel(id) {
    const card = list.querySelector(`[data-booking="${id}"]`);
    const panel = card && card.querySelector(`[data-manage-panel="${id}"]`);
    if (!panel) return;
    if (!panel.hidden) { panel.hidden = true; return; }
    panel.hidden = false;
    panel.innerHTML = '<p class="text-muted text-sm">Loading…</p>';
    try {
      const { data: b } = await api.get(`/bookings?id=${encodeURIComponent(id)}`);
      panel.innerHTML = panelHtml(b);
      wirePanel(id, panel);
    } catch (err) {
      panel.innerHTML = `<p class="error">${escapeHtml(err.message || 'Failed to load.')}</p>`;
    }
  }

  function wirePanel(id, panel) {
    const assign = panel.querySelector('[data-assign]');
    if (assign) {
      assign.addEventListener('change', async () => {
        try {
          await api.post('/bookings?action=assign-staff', { booking_id: id, staff_id: assign.value || null });
          toast(assign.value ? 'Order assigned' : 'Assignment cleared', 'success');
        } catch (err) {
          toast(err.message || 'Could not assign', 'danger');
        }
      });
    }
    const saveNote = panel.querySelector('[data-save-note]');
    if (saveNote) {
      saveNote.addEventListener('click', async () => {
        try {
          await api.post('/bookings?action=note', { booking_id: id, internal_notes: panel.querySelector('[data-note]').value || null });
          toast('Note saved', 'success');
        } catch (err) {
          toast(err.message || 'Could not save note', 'danger');
        }
      });
    }
    const chatForm = panel.querySelector('[data-chat-form]');
    if (chatForm) {
      chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = panel.querySelector('[data-chat-input]');
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        try {
          const { data: msg } = await api.post('/bookings?action=message', { booking_id: id, body: text });
          const thread = panel.querySelector('[data-thread]');
          if (thread.querySelector('.text-muted')) thread.innerHTML = '';
          thread.insertAdjacentHTML('beforeend', `<div class="chat-line is-out"><span class="chat-meta">you · just now</span><p class="chat-body">${escapeHtml(msg.body)}</p></div>`);
          thread.scrollTop = thread.scrollHeight;
        } catch (err) {
          toast(err.message || 'Could not send', 'danger');
        }
      });
    }
  }

  list.addEventListener('click', async (e) => {
    const manage = e.target.closest('[data-manage]');
    if (manage) { openPanel(manage.dataset.manage); return; }
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
  await loadStaff();
  load();
})();
