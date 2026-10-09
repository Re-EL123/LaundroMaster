import { api } from '../../../shared/js/api-client.js';
import { skeleton, errorState, emptyCTA } from '../../../shared/js/ui.js';
import { mountCustomerHeader } from '../../../shared/js/chrome.js';
import { laundromatCard } from './components.js';

mountCustomerHeader('');

const list = document.getElementById('nearbyList');

async function loadNearby() {
  skeleton(list, 3, 200);
  try {
    const res = await api.get('/laundromats?limit=6&sort=rating');
    const items = res.data || [];
    if (!items.length) return emptyCTA(list, { title: 'No laundromats yet', message: 'New partners are joining soon. Check back shortly.', href: './pages/discover.html', label: 'Refresh' });
    list.innerHTML = items.map(laundromatCard).join('');
  } catch (err) {
    errorState(list, err.message || 'Failed to load nearby laundromats.');
  }
}

loadNearby();
