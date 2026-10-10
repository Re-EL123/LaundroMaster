import { api } from '../../../shared/js/api-client.js';
import { skeleton, errorState, badge, toast, statusStepper, moneyBreakdown, confirmAction } from '../../../shared/js/ui.js';
import { escapeHtml, currency, formatDate, relativeTime, statusLabel, statusTone, param } from '../../../shared/js/format.js';
import { mountCustomerHeader, requireCustomer } from '../../../shared/js/chrome.js';
import { pageHref } from './components.js';

mountCustomerHeader('');

const session = requireCustomer();
const id = param('id');
const out = document.getElementById('out');

const CANCELLABLE = ['pending_payment', 'pending_acceptance'];
const REFUNDABLE = ['completed', 'cancelled', 'rejected', 'payment_failed'];

function printReceipt(b) {
  const items = (b.booking_items || []).map((i) => `<tr><td>${escapeHtml(i.service_name_snapshot)} × ${i.quantity}</td><td style="text-align:right">${currency(i.line_total)}</td></tr>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt ${escapeHtml(b.id.slice(0, 8))}</title>
    <style>body{font-family:system-ui,Arial,sans-serif;max-width:420px;margin:24px auto;color:#111}h1{font-size:18px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:12px;font-size:14px}td{padding:4px 0;border-bottom:1px solid #eee}.total{font-weight:700;border-top:2px solid #111}.muted{color:#666;font-size:12px}</style></head><body>
    <h1>${escapeHtml((b.laundromats && b.laundromats.name) || 'LaundroMaster')}</h1>
    <div class="muted">Receipt · Order ${escapeHtml(b.id)}<br>${escapeHtml(formatDate(b.created_at))}</div>
    <table>${items}
      <tr><td>Subtotal</td><td style="text-align:right">${currency(b.subtotal_amount)}</td></tr>
      <tr><td>Collection &amp; delivery</td><td style="text-align:right">${currency(b.delivery_fee)}</td></tr>
      <tr class="total"><td>Total</td><td style="text-align:right">${currency(b.total_amount)}</td></tr>
      <tr><td>Payment</td><td style="text-align:right">${escapeHtml(b.payment ? statusLabel(b.payment.status) : 'Unpaid')}</td></tr>
    </table>
    <p class="muted">Thank you for choosing LaundroMaster.</p>
    <script>window.onload=function(){window.print();}</script>
    </body></html>`;
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to print your receipt', 'info'); return; }
  w.document.write(html);
  w.document.close();
}

function messagesPanel(b) {
  const messages = (b.messages || []).map((m) => {
    const own = m.sender_id === undefined ? false : true;
    return `<div class="chat-line ${m.sender_role === 'customer' ? 'is-out' : 'is-in'}">
      <span class="chat-meta">${escapeHtml(m.sender_role === 'customer' ? 'you' : 'laundry')} · ${escapeHtml(relativeTime(m.created_at))}</span>
      <p class="chat-body">${escapeHtml(m.body)}</p>
    </div>`;
  }).join('') || '<p class="text-muted text-sm">No messages yet. Ask the laundromat anything about this order.</p>';
  return `<h3 class="text-sm mt-4">Messages</h3>
    <div class="chat-thread" id="chatThread">${messages}</div>
    <form class="flex mt-2" id="chatForm">
      <input class="input" id="chatInput" placeholder="Type a message…" autocomplete="off">
      <button class="btn btn-primary" type="submit">Send</button>
    </form>`;
}

async function payNow(bookingId, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Starting secure payment…'; }
  try {
    const { data } = await api.post('/payments?action=create', { booking_id: bookingId });
    if (data.checkout_url) {
      window.location.href = data.checkout_url;
      return;
    }
    toast('Payment confirmed', 'success');
    load();
  } catch (err) {
    toast(err.message || 'Could not start payment', 'danger');
    if (btn) { btn.disabled = false; btn.textContent = 'Pay now'; }
  }
}

async function reconcileReturn() {
  const paymentId = param('payment');
  const flag = param('paid') ? 'paid' : param('failed') ? 'failed' : param('canceled') ? 'canceled' : null;
  if (!flag) return;
  // Clean the URL so a refresh doesn't repeat the check.
  history.replaceState(null, '', location.pathname + (id ? `?id=${encodeURIComponent(id)}` : ''));
  if (flag === 'canceled') { toast('Payment cancelled', 'info'); return; }
  if (flag === 'failed') { toast('Payment failed — you can try again', 'danger'); return; }
  if (paymentId) {
    try {
      const { data } = await api.post('/payments?action=verify', { payment_id: paymentId });
      if (data.payment && data.payment.status === 'succeeded') toast('Payment received', 'success');
      else toast('Confirming your payment…', 'info');
    } catch { /* webhook may still be arriving */ }
  } else {
    toast('Payment received', 'success');
  }
}

function timeline(history) {
  if (!history || !history.length) return '';
  return `<h3 class="text-sm mt-4">Activity</h3>
    <ul class="timeline">${history.slice().reverse().map((h) => `<li>
      <span class="stepper-dot" style="width:0.6rem;height:0.6rem;border-width:0;background:var(--color-primary)"></span>
      <span><strong>${escapeHtml(statusLabel(h.status))}</strong> · <span class="text-muted">${escapeHtml(relativeTime(h.created_at))}</span>${h.reason ? `<br><span class="text-xs text-muted">${escapeHtml(h.reason)}</span>` : ''}</span>
    </li>`).join('')}</ul>`;
}

function renderBooking(b) {
  const items = (b.booking_items || []).map((i) => `<li>${escapeHtml(i.service_name_snapshot)} × ${i.quantity} — ${currency(i.line_total)}</li>`).join('');
  const canCancel = CANCELLABLE.includes(b.status);
  const canRefund = REFUNDABLE.includes(b.status) && b.payment && !(b.refund && ['pending', 'approved'].includes(b.refund.status));
  const canPay = b.status === 'pending_payment';
  const amountDue = Number(b.total_amount) || 0;

  const address = (a) => (a && (a.line1 || a.address)) ? `<p class="text-sm text-muted">${escapeHtml(b.pickup_required ? 'Pickup' : 'Delivery')}: ${escapeHtml(a.line1 || a.address || '')}</p>` : '';
  const pickup = b.pickup_required ? `<p class="text-sm text-muted">Pickup: ${escapeHtml((b.pickup_address && b.pickup_address.line1) || '—')}</p>` : '';
  const delivery = b.delivery_required ? `<p class="text-sm text-muted">Delivery: ${escapeHtml((b.delivery_address && b.delivery_address.line1) || '—')}</p>` : '';

  const paymentLine = b.payment
    ? `<div class="breakdown-row is-sub"><span>Payment</span><span>${escapeHtml(statusLabel(b.payment.status))} · ${escapeHtml(b.payment.provider || '')}</span></div>`
    : '';
  const refundNote = b.refund
    ? `<p class="text-sm">Refund ${escapeHtml(statusLabel(b.refund.status))} · ${currency(b.refund.amount)}</p>`
    : '';

  out.innerHTML = `
    <article class="card">
      <div class="card-body">
        <div class="detail-head">
          <div>
            <h1 class="card-title" style="font-size:1.4rem">${escapeHtml((b.laundromats && b.laundromats.name) || 'Booking')}</h1>
            <p class="text-xs text-muted">Order ${escapeHtml(b.id)} · ${escapeHtml(relativeTime(b.created_at))}</p>
          </div>
          ${badge(statusLabel(b.status), statusTone(b.status))}
        </div>

        ${statusStepper(b.status)}

        <h3 class="text-sm mt-4">Items</h3>
        <ul class="text-sm">${items || '<li>No items</li>'}</ul>

        ${moneyBreakdown([
          { label: 'Subtotal', value: currency(b.subtotal_amount) },
          { label: 'Collection & delivery', value: currency(b.delivery_fee) },
        ], { total: currency(b.total_amount) })}

        ${b.scheduled_at ? `<p class="text-sm text-muted">Scheduled: ${formatDate(b.scheduled_at)}</p>` : ''}
        ${b.customer_notes ? `<p class="text-sm text-muted">Notes: ${escapeHtml(b.customer_notes)}</p>` : ''}
        ${b.payment ? `<p class="text-xs text-muted">Payment: ${escapeHtml(statusLabel(b.payment.status))}${b.refund ? ` · Refund: ${escapeHtml(statusLabel(b.refund.status))}` : ''}</p>` : ''}
        <p class="text-xs text-muted">Placed ${formatDate(b.created_at)}</p>

        ${messagesPanel(b)}

        <div class="flex wrap mt-4">
          ${b.laundromat_id ? `<a class="btn btn-secondary" href="${pageHref('laundromat.html')}?id=${encodeURIComponent(b.laundromat_id)}">Rebook</a>` : ''}
          ${b.payment && b.payment.status === 'succeeded' ? '<button class="btn btn-secondary" id="receiptBtn">Receipt</button>' : ''}
          ${canPay ? `<button class="btn btn-primary" id="payBtn">${amountDue > 0 ? `Pay ${currency(amountDue)}` : 'Complete order'}</button>` : ''}
          ${canCancel ? '<button class="btn btn-danger" id="cancelBtn">Cancel booking</button>' : ''}
          ${canRefund ? '<button class="btn btn-secondary" id="refundBtn">Request refund</button>' : ''}
        </div>
      </div>
    </article>
    ${timeline(b.history)}`;

  const payBtn = document.getElementById('payBtn');
  if (payBtn) payBtn.addEventListener('click', () => payNow(id, payBtn));

  const cancelBtn = document.getElementById('cancelBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', async () => {
      if (!confirmAction('Cancel this booking?')) return;
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

  const refundBtn = document.getElementById('refundBtn');
  if (refundBtn) {
    refundBtn.addEventListener('click', async () => {
      const reason = window.prompt('Tell us why you are requesting a refund (optional):') || '';
      if (!confirmAction('Submit a refund request for this order?')) return;
      refundBtn.disabled = true;
      try {
        await api.post('/bookings?action=request-refund', { booking_id: id, reason });
        toast('Refund requested', 'success');
        load();
      } catch (err) {
        toast(err.message || 'Could not request refund', 'danger');
        refundBtn.disabled = false;
      }
    });
  }

  const receiptBtn = document.getElementById('receiptBtn');
  if (receiptBtn) receiptBtn.addEventListener('click', () => printReceipt(b));

  const chatForm = document.getElementById('chatForm');
  if (chatForm) {
    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('chatInput');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      try {
        const { data: msg } = await api.post('/bookings?action=message', { booking_id: id, body: text });
        const thread = document.getElementById('chatThread');
        if (thread.querySelector('.text-muted')) thread.innerHTML = '';
        thread.insertAdjacentHTML('beforeend', `<div class="chat-line is-out"><span class="chat-meta">you · just now</span><p class="chat-body">${escapeHtml(msg.body)}</p></div>`);
        thread.scrollTop = thread.scrollHeight;
      } catch (err) {
        toast(err.message || 'Could not send message', 'danger');
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

(async function init() {
  await reconcileReturn();
  load();
})();
