import { api } from '../../../shared/js/api-client.js';

async function loadNearby() {
  const list = document.getElementById('nearbyList');
  list.innerHTML = '<div class="card skeleton" style="height: 220px;"></div><div class="card skeleton" style="height: 220px;"></div><div class="card skeleton" style="height: 220px;"></div>';
  try {
    const res = await api.get('/laundromats?limit=6');
    list.innerHTML = '';
    (res.data || []).forEach(item => {
      const card = document.createElement('article');
      card.className = 'card';
      card.innerHTML = `<div class="card-body"><h3 class="card-title">${escapeHtml(item.name)}</h3><p class="card-meta">${escapeHtml(item.address||'')}</p><a class="btn btn-primary" href="./pages/laundromat.html?id=${encodeURIComponent(item.id)}">View details</a></div>`;
      list.appendChild(card);
    });
    if ((res.data||[]).length===0) list.innerHTML = '<p class="text-muted">No laundromats found.</p>';
  } catch (e) {
    list.innerHTML = '<p class="error">Failed to load nearby laundromats.</p>';
  }
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[c])); }
loadNearby();
