import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyCTA, errorState, badge } from '../../../shared/js/ui.js';
import { escapeHtml, currency, relativeTime, statusLabel, statusTone } from '../../../shared/js/format.js';
import { mountCustomerHeader, requireCustomer } from '../../../shared/js/chrome.js';
import { pageHref } from './components.js';

mountCustomerHeader('orders');

const session = requireCustomer();
const list = document.getElementById('list');

const ACTIVE = ['pending_payment', 'pending_acceptance', 'accepted', 'pickup_scheduled', 'collected', 'washing', 'drying', 'ironing', 'ready', 'out_for_delivery', 'refund_pending'];

function card(b) {
  const items = b.booking_items ? b.booking_items.length : 0;
  const active = ACTIVE.includes(b.status);
  return `<article class="card">
    <div class="card-body">
      <div class="flex justify-between wrap">
        ${badge(statusLabel(b.status), statusTone(b.status))}
        <span class="text-xs text-muted">${escapeHtml(relativeTime(b.created_at))}</span>
      </div>
      <h3 class="card-title">${escapeHtml((b.laundromats && b.laundromats.name) || 'Laundromat')}</h3>
      <p class="card-meta">${items} item(s) · ${currency(b.total_amount)}${Number(b.delivery_fee) > 0 ? ` · delivery ${currency(b.delivery_fee)}` : ''}</p>
      <div class="flex wrap">
        <a class="btn btn-primary" href="order-details.html?id=${encodeURIComponent(b.id)}">Track order</a>
        ${b.laundromat_id ? `<a class="btn btn-secondary" href="${pageHref('laundromat.html')}?id=${encodeURIComponent(b.laundromat_id)}">Rebook</a>` : ''}
      </div>
      ${active ? '<p class="text-xs text-muted">We will keep you posted as your order progresses.</p>' : ''}
    </div>
  </article>`;
}

async function loadOrders() {
  if (!session) return;
  skeleton(list, 3, 160);
  try {
    const { data: orders } = await api.get('/bookings');
    if (!orders.length) {
      return emptyCTA(list, {
        title: 'No orders yet',
        message: 'Find a laundromat near you and place your first order.',
        href: pageHref('discover.html'),
        label: 'Browse laundromats',
      });
    }
    const active = orders.filter((b) => ACTIVE.includes(b.status));
    const past = orders.filter((b) => !ACTIVE.includes(b.status));
    const section = (title, rows) => (rows.length
      ? `<div class="section-head mt-6"><h2>${title}</h2><span class="text-sm text-muted">${rows.length}</span></div>
         <div class="card-grid">${rows.map(card).join('')}</div>`
      : '');
    list.innerHTML = section('Active orders', active) + section('Past orders', past);
  } catch (err) {
    if (err.status === 401) return;
    errorState(list, err.message || 'Failed to load orders.');
  }
}

loadOrders();
