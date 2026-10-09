import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyState, errorState, toast } from '../../../shared/js/ui.js';
import { escapeHtml, currency, formatDate, param } from '../../../shared/js/format.js';
import { mountCustomerHeader, requireCustomer } from '../../../shared/js/chrome.js';
import { getSession, portalUrl } from '../../../shared/js/auth-client.js';
import { serviceCard } from './components.js';

mountCustomerHeader('');

const id = param('id');
const bizEl = document.getElementById('biz');
const svcsEl = document.getElementById('svcs');
const reviewsEl = document.getElementById('reviews');
const continueBtn = document.getElementById('continueBtn');
const favBtn = document.getElementById('favBtn');
const totalEl = document.getElementById('selectionTotal');
const reviewFormCard = document.getElementById('reviewFormCard');

let servicesById = new Map();

function readSelection() {
  const items = [];
  let subtotal = 0;
  document.querySelectorAll('[data-service]').forEach((cb) => {
    if (!cb.checked) return;
    const qtyInput = document.querySelector(`[data-qty="${cb.dataset.service}"]`);
    const qty = Math.max(1, Number(qtyInput && qtyInput.value) || 1);
    const price = Number(cb.dataset.price) || 0;
    subtotal += price * qty;
    items.push({ service_id: cb.dataset.service, quantity: qty });
  });
  return { items, subtotal };
}

function updateSelection() {
  const { items, subtotal } = readSelection();
  continueBtn.disabled = items.length === 0;
  totalEl.textContent = items.length ? `${items.length} service(s) · ${currency(subtotal)}` : '';
}

async function loadBusiness() {
  if (!id) { errorState(bizEl, 'Missing laundromat id.'); continueBtn.disabled = true; return; }
  skeleton(bizEl, 1, 140);
  try {
    const { data: b } = await api.get(`/laundromats?id=${encodeURIComponent(id)}`);
    const rating = Number(b.rating_average) || 0;
    bizEl.innerHTML = `<article class="card">
      <div class="card-body">
        <div class="detail-head">
          <div>
            <h1 class="card-title" style="font-size:1.6rem">${escapeHtml(b.name)}</h1>
            <p class="card-meta">${escapeHtml(b.address || 'Address not provided')}</p>
            <p class="rating text-sm">${b.rating_count ? `\u2605 ${rating.toFixed(1)} (${b.rating_count} reviews)` : 'New'}</p>
          </div>
        </div>
        ${b.description ? `<p>${escapeHtml(b.description)}</p>` : ''}
      </div>
    </article>`;
  } catch (err) {
    errorState(bizEl, err.message || 'Failed to load laundromat.');
    return;
  }

  const session = getSession();
  if (session && session.access_token) {
    favBtn.hidden = false;
    reviewFormCard.hidden = false;
  }
}

async function loadServices() {
  skeleton(svcsEl, 3, 160);
  try {
    const { data: services } = await api.get(`/laundromats?action=services&id=${encodeURIComponent(id)}`);
    servicesById = new Map((services || []).map((s) => [s.id, s]));
    if (!services.length) return emptyState(svcsEl, 'This laundromat has not published services yet.');
    svcsEl.innerHTML = services.map(serviceCard).join('');
    svcsEl.querySelectorAll('[data-service], [data-qty]').forEach((el) => {
      el.addEventListener('change', updateSelection);
      el.addEventListener('input', updateSelection);
    });
  } catch (err) {
    errorState(svcsEl, err.message || 'Failed to load services.');
  }
}

async function loadReviews() {
  skeleton(reviewsEl, 2, 100);
  try {
    const { data: reviews } = await api.get(`/reviews?laundromat_id=${encodeURIComponent(id)}`);
    if (!reviews.length) return emptyState(reviewsEl, 'No reviews yet.');
    reviewsEl.innerHTML = reviews.map((r) => `<article class="card" style="margin-bottom:var(--space-3)">
      <div class="card-body">
        <p class="rating">${'\u2605'.repeat(r.rating)}<span class="text-muted">${'\u2606'.repeat(5 - r.rating)}</span></p>
        <p>${escapeHtml(r.review_text || '')}</p>
        <p class="text-xs text-muted">${escapeHtml((r.profiles && r.profiles.full_name) || 'Customer')} · ${formatDate(r.created_at)}</p>
      </div>
    </article>`).join('');
  } catch (err) {
    errorState(reviewsEl, err.message || 'Failed to load reviews.');
  }
}

continueBtn.addEventListener('click', () => {
  const { items } = readSelection();
  if (!items.length) return;
  sessionStorage.setItem('lm_booking_selection', JSON.stringify({ laundromat_id: id, items }));
  location.href = 'booking.html?id=' + encodeURIComponent(id);
});

favBtn.addEventListener('click', async () => {
  try {
    const res = await api.post('/laundromats?action=favorite', { laundromat_id: id });
    toast(res.data.favorited ? 'Added to favorites' : 'Removed from favorites', 'success');
  } catch (err) {
    if (err.status === 401) return (location.href = portalUrl());
    toast(err.message || 'Could not update favorites', 'danger');
  }
});

document.getElementById('reviewForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('reviewMsg');
  msg.className = 'form-msg text-sm';
  const rating = Number(document.getElementById('rating').value);
  const review_text = document.getElementById('review_text').value.trim();
  try {
    await api.post('/reviews', { laundromat_id: id, rating, review_text });
    msg.textContent = 'Thanks for your review!';
    msg.classList.add('is-success');
    e.target.reset();
    loadReviews();
  } catch (err) {
    msg.textContent = err.message || 'Could not submit review.';
    msg.classList.add('is-error');
  }
});

loadBusiness();
loadServices();
loadReviews();
