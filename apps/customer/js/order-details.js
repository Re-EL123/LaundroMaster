import { api } from '../../../shared/js/api-client.js';
import { skeleton, errorState, badge, toast } from '../../../shared/js/ui.js';
import { escapeHtml, currency, formatDate, statusLabel, statusTone, param } from '../../../shared/js/format.js';
import { mountCustomerHeader, requireCustomer } from '../../../shared/js/chrome.js';

mountCustomerHeader('');

const session = requireCustomer();
const id = param('id');
const out = document.getElementById('out');

const CANCELLABLE = ['pending_payment', 'pending_acceptance'];

function renderBooking(b) {
  const items = (b.booking_items || []).map((i) => `<li>${escapeHtml(i.service_name_snapshot)} × ${i.quantity} — ${currency(i.line_total)}</li>`).join('');
  const canCancel = CANCELLABLE.includes(b.status);
  out.innerHTML = `
    <article class="card">
      <div class="card-body">
        <div class="detail-head">
          <div>
            <h1 class="card-title" style="font-size:1.4rem">${escapeHtml((b.laundromats && b.laundromats.name) || 'Booking')}</h1>
            <p class="text-xs text-muted">Order ${escapeHtml(b.id)}</p>
          </div>
          ${badge(statusLabel(b.status), statusTone(b.status))}
        </div>
        <h3 class="text-sm">Items</h3>
        <ul class="text-sm">${items || '<li>No items</li>'}</ul>
        <div class="flex justify-between"><span>Subtotal</span><span>${currency(b.subtotal_amount)}</span></div>
        <div class="flex justify-between"><span>Delivery</span><span>${currency(b.delivery_fee)}</span></div>
        <div class="flex justify-between"><strong>Total</strong><strong>${currency(b.total_amount)}</strong></div>
        ${b.scheduled_at ? `<p class="text-sm text-muted">Scheduled: ${formatDate(b.scheduled_at)}</p>` : ''}
        ${b.customer_notes ? `<p class="text-sm text-muted">Notes: ${escapeHtml(b.customer_notes)}</p>` : ''}
        <p class="text-xs text-muted">Placed ${formatDate(b.created_at)}</p>
        ${canCancel ? '<button class="btn btn-danger" id="cancelBtn">Cancel booking</button>' : ''}
      </div>
    </article>`;

  const cancelBtn = document.getElementById('cancelBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', async () => {
      if (!confirm('Cancel this booking?')) return;
      cancelBtn.disabled = true;
      try {
        await api.post('/bookings?action=cancel', { booking_id: id });
        toast('Booking cancelled', 'success');
        load();
      } catch (err) {
        toast(err.message || 'Could not cancel', 'danger');
        cancelBtn.disabled = false;
      }
    });
  }
}

async function load() {
  if (!session) return;
  if (!id) return errorState(out, 'Missing booking id.');
  skeleton(out, 1, 220);
  try {
    const { data: b } = await api.get(`/bookings?id=${encodeURIComponent(id)}`);
    renderBooking(b);
  } catch (err) {
    errorState(out, err.message || 'Failed to load booking.');
  }
}

load();
