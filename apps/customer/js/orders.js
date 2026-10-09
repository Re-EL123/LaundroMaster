import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyState, errorState, badge } from '../../../shared/js/ui.js';
import { escapeHtml, currency, formatDate, statusLabel, statusTone } from '../../../shared/js/format.js';
import { mountCustomerHeader, requireCustomer } from '../../../shared/js/chrome.js';

mountCustomerHeader('orders');

const session = requireCustomer();
const list = document.getElementById('list');

async function loadOrders() {
  if (!session) return;
  skeleton(list, 3, 160);
  try {
    const { data: orders } = await api.get('/bookings');
    if (!orders.length) return emptyState(list, 'You have no orders yet.');
    list.innerHTML = orders.map((b) => `<article class="card">
      <div class="card-body">
        ${badge(statusLabel(b.status), statusTone(b.status))}
        <h3 class="card-title">${escapeHtml((b.laundromats && b.laundromats.name) || 'Laundromat')}</h3>
        <p class="card-meta">${b.booking_items ? b.booking_items.length : 0} item(s) · ${currency(b.total_amount)}</p>
        <p class="text-xs text-muted">${formatDate(b.created_at)}</p>
        <a class="btn btn-secondary" href="order-details.html?id=${encodeURIComponent(b.id)}">View details</a>
      </div>
    </article>`).join('');
  } catch (err) {
    if (err.status === 401) return;
    errorState(list, err.message || 'Failed to load orders.');
  }
}

loadOrders();
