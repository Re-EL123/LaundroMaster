import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyState, errorState, toast } from '../../../shared/js/ui.js';
import { escapeHtml } from '../../../shared/js/format.js';
import { mountCustomerHeader, requireCustomer } from '../../../shared/js/chrome.js';
import { pageHref } from './components.js';
import { brandAvatar } from '../../../shared/js/avatar.js';

mountCustomerHeader('favorites');

const session = requireCustomer();
const list = document.getElementById('list');

function card(item) {
  return `<article class="card">
    <div class="card-body">
      <div class="identity identity-head">
        ${brandAvatar({ name: item.name, path: item.logo_path, size: 40 })}
        <div class="identity-text">
          <h3 class="card-title">${escapeHtml(item.name)}</h3>
          <p class="card-meta">${escapeHtml(item.address || 'Address not provided')}</p>
        </div>
      </div>
      <div class="flex">
        <a class="btn btn-primary" href="${pageHref('laundromat.html')}?id=${encodeURIComponent(item.id)}">View</a>
        <button class="btn btn-secondary" data-remove="${item.id}">Remove</button>
      </div>
    </div>
  </article>`;
}

async function load() {
  if (!session) return;
  skeleton(list, 3, 160);
  try {
    const { data: items } = await api.get('/laundromats?action=favorites');
    if (!items.length) return emptyState(list, 'You have no favorites yet.');
    list.innerHTML = items.map(card).join('');
  } catch (err) {
    errorState(list, err.message || 'Failed to load favorites.');
  }
}

list.addEventListener('click', async (e) => {
  const id = e.target.dataset && e.target.dataset.remove;
  if (!id) return;
  try {
    await api.post('/laundromats?action=favorite', { laundromat_id: id });
    toast('Removed from favorites', 'success');
    load();
  } catch (err) {
    toast(err.message || 'Could not update favorites', 'danger');
  }
});

load();
