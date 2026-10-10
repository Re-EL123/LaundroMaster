import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyState, errorState } from '../../../shared/js/ui.js';
import { mountCustomerHeader } from '../../../shared/js/chrome.js';
import { laundromatCard } from './components.js';
import { param } from '../../../shared/js/format.js';

mountCustomerHeader('discover');

const list = document.getElementById('list');
const form = document.getElementById('searchForm');
const input = document.getElementById('q');
const minRating = document.getElementById('min_rating');
const maxPrice = document.getElementById('max_price');
const resultCount = document.getElementById('resultCount');
const sortBar = document.getElementById('sortBar');
input.value = param('q') || '';
if (minRating) minRating.value = param('min_rating') || '';
if (maxPrice) maxPrice.value = param('max_price') || '';
let sort = param('sort') || 'featured';
sortBar.querySelectorAll('[data-sort]').forEach((chip) => {
  chip.classList.toggle('is-active', chip.dataset.sort === sort);
});

function buildQuery(extra = {}) {
  const p = new URLSearchParams();
  const v = input.value.trim();
  if (v) p.set('q', v);
  if (minRating.value) p.set('min_rating', minRating.value);
  if (maxPrice.value) p.set('max_price', maxPrice.value);
  p.set('sort', extra.sort || sort);
  p.set('limit', '50');
  return p.toString();
}

function syncUrl() {
  const url = new URL(location.href);
  const v = input.value.trim();
  if (v) url.searchParams.set('q', v); else url.searchParams.delete('q');
  if (minRating.value) url.searchParams.set('min_rating', minRating.value); else url.searchParams.delete('min_rating');
  if (maxPrice.value) url.searchParams.set('max_price', maxPrice.value); else url.searchParams.delete('max_price');
  url.searchParams.set('sort', sort);
  history.replaceState(null, '', url);
}

function render(items, queryText) {
  resultCount.textContent = items.length ? `${items.length} result${items.length === 1 ? '' : 's'}` : '';
  if (!items.length) return emptyState(list, queryText ? `No results for "${queryText}".` : 'No laundromats match your filters.');
  list.innerHTML = items.map(laundromatCard).join('');
}

async function search() {
  skeleton(list, 6, 180);
  resultCount.textContent = '';
  try {
    const res = await api.get(`/laundromats?${buildQuery()}`);
    const items = res.data || [];
    syncUrl();
    render(items, input.value.trim());
  } catch (err) {
    errorState(list, err.message || 'Failed to load laundromats.');
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  search();
});

[minRating, maxPrice].forEach((el) => el.addEventListener('change', search));

sortBar.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-sort]');
  if (!chip) return;
  sort = chip.dataset.sort;
  sortBar.querySelectorAll('[data-sort]').forEach((c) => c.classList.toggle('is-active', c === chip));
  search();
});

document.getElementById('nearBtn').addEventListener('click', () => {
  if (!navigator.geolocation) return errorState(list, 'Geolocation is not supported by this browser.');
  skeleton(list, 6, 180);
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const { latitude, longitude } = pos.coords;
        const res = await api.get(`/geo?action=search&lat=${latitude}&lng=${longitude}&radius_km=50&limit=50`);
        const items = (res.data || []).sort((a, b) => (Number(a.distance_km) || 0) - (Number(b.distance_km) || 0));
        resultCount.textContent = items.length ? `${items.length} nearby` : '';
        if (!items.length) return emptyState(list, 'No laundromats within 50 km.');
        list.innerHTML = items.map(laundromatCard).join('');
      } catch (err) {
        errorState(list, err.message || 'Failed to search near you.');
      }
    },
    () => errorState(list, 'Location permission denied.'),
    { enableHighAccuracy: false, timeout: 8000 }
  );
});

search();
