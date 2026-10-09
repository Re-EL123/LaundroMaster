import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyState, errorState } from '../../../shared/js/ui.js';
import { mountCustomerHeader } from '../../../shared/js/chrome.js';
import { laundromatCard } from './components.js';
import { param } from '../../../shared/js/format.js';

mountCustomerHeader('discover');

const list = document.getElementById('list');
const form = document.getElementById('searchForm');
const input = document.getElementById('q');
input.value = param('q') || '';

async function search(queryText) {
  skeleton(list, 6, 180);
  try {
    const qs = queryText ? `?q=${encodeURIComponent(queryText)}&limit=50` : '?limit=50';
    const res = await api.get(`/laundromats${qs}`);
    const items = res.data || [];
    if (!items.length) return emptyState(list, queryText ? `No results for "${queryText}".` : 'No laundromats available.');
    list.innerHTML = items.map(laundromatCard).join('');
  } catch (err) {
    errorState(list, err.message || 'Failed to load laundromats.');
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const value = input.value.trim();
  const url = new URL(location.href);
  if (value) url.searchParams.set('q', value); else url.searchParams.delete('q');
  history.replaceState(null, '', url);
  search(value);
});

document.getElementById('nearBtn').addEventListener('click', () => {
  if (!navigator.geolocation) return errorState(list, 'Geolocation is not supported by this browser.');
  skeleton(list, 6, 180);
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const { latitude, longitude } = pos.coords;
        const res = await api.get(`/geo?action=search&lat=${latitude}&lng=${longitude}&radius_km=50&limit=50`);
        const items = res.data || [];
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

search(input.value.trim());
