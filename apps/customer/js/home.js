import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyState, errorState } from '../../../shared/js/ui.js';
import { mountCustomerHeader } from '../../../shared/js/chrome.js';
import { laundromatCard } from './components.js';

mountCustomerHeader('');

const list = document.getElementById('nearbyList');

async function loadNearby() {
  skeleton(list, 3, 200);
  try {
    const res = await api.get('/laundromats?limit=6');
    const items = res.data || [];
    if (!items.length) return emptyState(list, 'No laundromats are listed yet. Check back soon.');
    list.innerHTML = items.map(laundromatCard).join('');
  } catch (err) {
    errorState(list, err.message || 'Failed to load nearby laundromats.');
  }
}

loadNearby();
