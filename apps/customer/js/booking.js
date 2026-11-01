import { api } from '../../../shared/js/api-client.js';
import { escapeHtml, currency, param } from '../../../shared/js/format.js';
import { mountCustomerHeader, requireCustomer } from '../../../shared/js/chrome.js';
import { toast, moneyBreakdown } from '../../../shared/js/ui.js';

mountCustomerHeader('');

const session = requireCustomer();

const laundromatId = param('id');
const summaryEl = document.getElementById('summary');
const orderSummaryEl = document.getElementById('orderSummary');
const plusUpsellEl = document.getElementById('plusUpsell');
const form = document.getElementById('frm');
const msg = document.getElementById('msg');
const submitBtn = document.getElementById('submitBtn');

let selection = [];
let servicesById = new Map();
let quote = null;
let quoteError = null;
let quoteSeq = 0;
let quoteTimer = null;

function readStoredSelection() {
  try {
    const raw = sessionStorage.getItem('lm_booking_selection');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.laundromat_id !== laundromatId) return null;
    return parsed.items || null;
  } catch {
    return null;
  }
}

async function loadServices() {
  try {
    const { data: services } = await api.get(`/laundromats?action=services&id=${encodeURIComponent(laundromatId)}`);
    servicesById = new Map((services || []).map((s) => [s.id, s]));
  } catch {
    /* ignore; summary will fall back to ids */
  }
}

function payload() {
  const pickupRequired = document.getElementById('pickup_required').checked;
  const deliveryRequired = document.getElementById('delivery_required').checked;
  const scheduled = document.getElementById('scheduled_at').value;
  return {
    laundromat_id: laundromatId,
    items: selection,
    pickup_required: pickupRequired,
    delivery_required: deliveryRequired,
    pickup_address: pickupRequired ? { line1: document.getElementById('pickup_address').value.trim() } : null,
    delivery_address: deliveryRequired ? { line1: document.getElementById('delivery_address').value.trim() } : null,
    scheduled_at: scheduled ? new Date(scheduled).toISOString() : null,
    customer_notes: document.getElementById('customer_notes').value.trim() || null,
  };
}

function localEstimate() {
  let subtotal = 0;
  selection.forEach((item) => {
    const svc = servicesById.get(item.service_id);
    subtotal += (svc ? Number(svc.base_price) || 0 : 0) * item.quantity;
  });
  return { subtotal, delivery: 0, total: subtotal };
}

function renderSummary() {
  if (!selection.length) {
    summaryEl.innerHTML = '<p class="error">No services selected. Please pick services from the laundromat page.</p>';
    orderSummaryEl.innerHTML = '<p class="text-muted">No items selected.</p>';
    plusUpsellEl.innerHTML = '';
    submitBtn.disabled = true;
    return;
  }

  const rows = selection.map((item) => {
    const svc = servicesById.get(item.service_id);
    const price = svc ? Number(svc.base_price) || 0 : 0;
    const line = price * item.quantity;
    return `<li>${escapeHtml(svc ? svc.name : item.service_id)} × ${item.quantity} — ${svc ? currency(line) : '—'}</li>`;
  }).join('');
  summaryEl.innerHTML = `<p class="text-sm text-muted">${selection.length} item(s) selected</p><ul class="text-sm">${rows}</ul>`;

  const estimate = localEstimate();
  const subtotal = quote ? Number(quote.subtotal) || 0 : estimate.subtotal;
  const delivery = quote ? Number(quote.delivery_fee) || 0 : 0;
  const total = quote ? Number(quote.total) || 0 : estimate.total;

  const lines = [{ label: 'Subtotal', value: currency(subtotal) }];
  lines.push({
    label: quote && quote.zone && quote.zone.name ? `Collection & delivery · ${quote.zone.name}` : 'Collection & delivery',
    value: currency(delivery),
  });
  if (quote && quote.has_plan) lines.push({ label: 'Plus savings', value: 'Free delivery', sub: true });

  orderSummaryEl.innerHTML = moneyBreakdown(lines, { total: currency(total) });

  if (quote && quote.out_of_area) {
    plusUpsellEl.innerHTML = `<div class="callout"><strong class="text-sm">Outside the delivery area</strong>
      <p class="text-xs text-muted">This laundromat does not deliver to that address. Try a nearby laundromat or choose drop-off.</p></div>`;
  } else if (quote && quote.hours_error) {
    plusUpsellEl.innerHTML = `<div class="callout"><strong class="text-sm">Closed at that time</strong>
      <p class="text-xs text-muted">${escapeHtml(quote.hours_error)}</p></div>`;
  } else if (quote && !quote.has_plan && delivery > 0) {
    plusUpsellEl.innerHTML = `<div class="callout callout-primary">
      <div>
        <strong class="text-sm">Save ${currency(delivery)} with LaundroMaster+</strong>
        <p class="text-xs text-muted">Members get free collection &amp; delivery on every order.</p>
        <a class="btn btn-primary text-sm mt-4" href="profile.html">Join from profile</a>
      </div>
    </div>`;
  } else {
    plusUpsellEl.innerHTML = '';
  }

  submitBtn.disabled = Boolean((quote && (quote.out_of_area || quote.hours_error)) || quoteError);
  if (quoteError) {
    msg.textContent = quoteError;
    msg.className = 'form-msg is-error';
  }
}

function scheduleQuote() {
  clearTimeout(quoteTimer);
  quoteTimer = setTimeout(refreshQuote, 350);
}

async function refreshQuote() {
  if (!selection.length || !laundromatId) return;
  const seq = ++quoteSeq;
  try {
    const res = await api.post('/bookings?action=quote', payload());
    if (seq !== quoteSeq) return;
    quote = res.data;
    quoteError = null;
  } catch (err) {
    if (seq !== quoteSeq) return;
    quote = null;
    quoteError = err.message || 'Could not calculate the total.';
  }
  renderSummary();
}

function toggleAddressFields() {
  const pickup = document.getElementById('pickup_required').checked;
  const delivery = document.getElementById('delivery_required').checked;
  document.getElementById('pickupAddressField').hidden = !pickup;
  document.getElementById('deliveryAddressField').hidden = !delivery;
  document.getElementById('pickup_address').required = pickup;
  document.getElementById('delivery_address').required = delivery;
  renderSummary();
  scheduleQuote();
}

document.getElementById('pickup_required').addEventListener('change', toggleAddressFields);
document.getElementById('delivery_required').addEventListener('change', toggleAddressFields);
['pickup_address', 'delivery_address', 'scheduled_at'].forEach((id) => {
  document.getElementById(id).addEventListener('input', scheduleQuote);
  document.getElementById(id).addEventListener('change', scheduleQuote);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selection.length) return;
  msg.className = 'form-msg';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Placing booking…';

  try {
    const res = await api.post('/bookings?action=create', payload());
    sessionStorage.removeItem('lm_booking_selection');
    toast('Booking created', 'success');
    location.href = 'order-details.html?id=' + encodeURIComponent(res.data.id);
  } catch (err) {
    msg.textContent = err.message || 'Could not create booking.';
    msg.classList.add('is-error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Place booking';
  }
});

(async function init() {
  if (!session) return;
  if (!laundromatId) {
    summaryEl.innerHTML = '<p class="error">Missing laundromat id.</p>';
    submitBtn.disabled = true;
    return;
  }
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('scheduled_at').min = now.toISOString().slice(0, 16);
  selection = readStoredSelection() || [];
  await loadServices();
  renderSummary();
  await refreshQuote();
})();
