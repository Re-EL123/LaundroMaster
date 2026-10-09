import { api } from '../../../shared/js/api-client.js';
import { escapeHtml, currency, param } from '../../../shared/js/format.js';
import { mountCustomerHeader, requireCustomer } from '../../../shared/js/chrome.js';
import { toast } from '../../../shared/js/ui.js';

mountCustomerHeader('');

const session = requireCustomer();

const laundromatId = param('id');
const summaryEl = document.getElementById('summary');
const orderSummaryEl = document.getElementById('orderSummary');
const form = document.getElementById('frm');
const msg = document.getElementById('msg');
const submitBtn = document.getElementById('submitBtn');

let selection = [];
let servicesById = new Map();

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

function renderSummary() {
  if (!selection.length) {
    summaryEl.innerHTML = '<p class="error">No services selected. Please pick services from the laundromat page.</p>';
    orderSummaryEl.innerHTML = '<p class="text-muted">No items selected.</p>';
    submitBtn.disabled = true;
    return;
  }
  let total = 0;
  const rows = selection.map((item) => {
    const svc = servicesById.get(item.service_id);
    const price = svc ? Number(svc.base_price) || 0 : 0;
    total += price * item.quantity;
    return `<li>${escapeHtml(svc ? svc.name : item.service_id)} × ${item.quantity} — ${svc ? currency(price * item.quantity) : '—'}</li>`;
  }).join('');
  summaryEl.innerHTML = `<p class="text-sm text-muted">${selection.length} item(s) selected</p><ul class="text-sm">${rows}</ul>`;
  orderSummaryEl.innerHTML = `<div class="flex justify-between"><span>Subtotal</span><strong>${currency(total)}</strong></div>
    <p class="text-xs text-muted">Delivery fees and taxes are calculated by the laundromat.</p>`;
}

function toggleAddressFields() {
  document.getElementById('pickupAddressField').hidden = !document.getElementById('pickup_required').checked;
  document.getElementById('deliveryAddressField').hidden = !document.getElementById('delivery_required').checked;
}

document.getElementById('pickup_required').addEventListener('change', toggleAddressFields);
document.getElementById('delivery_required').addEventListener('change', toggleAddressFields);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selection.length) return;
  msg.className = 'form-msg';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Placing booking…';

  const pickupRequired = document.getElementById('pickup_required').checked;
  const deliveryRequired = document.getElementById('delivery_required').checked;
  const payload = {
    laundromat_id: laundromatId,
    items: selection,
    pickup_required: pickupRequired,
    delivery_required: deliveryRequired,
    pickup_address: pickupRequired ? { line1: document.getElementById('pickup_address').value.trim() } : null,
    delivery_address: deliveryRequired ? { line1: document.getElementById('delivery_address').value.trim() } : null,
    scheduled_at: document.getElementById('scheduled_at').value ? new Date(document.getElementById('scheduled_at').value).toISOString() : null,
    customer_notes: document.getElementById('customer_notes').value.trim() || null,
  };

  try {
    const res = await api.post('/bookings?action=create', payload);
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
  selection = readStoredSelection() || [];
  await loadServices();
  renderSummary();
})();
