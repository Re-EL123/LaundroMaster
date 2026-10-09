import { api } from '../../../shared/js/api-client.js';
import { escapeHtml } from '../../../shared/js/format.js';
import { mountDashboard } from '../../../shared/js/shell.js';

(async function () {
  const user = await mountDashboard({ allowed: ['admin', 'super_admin'] });
  if (!user) return;

  const statsEl = document.getElementById('stats');
  try {
    const { data: s } = await api.get('/admin?action=stats');
    statsEl.innerHTML = `
      <article class="card"><div class="card-body"><h2 class="text-sm text-muted">Pending</h2><p class="stat-value">${s.pending}</p></div></article>
      <article class="card"><div class="card-body"><h2 class="text-sm text-muted">Approved</h2><p class="stat-value">${s.approved}</p></div></article>
      <article class="card"><div class="card-body"><h2 class="text-sm text-muted">Users</h2><p class="stat-value">${s.users}</p></div></article>
      <article class="card"><div class="card-body"><h2 class="text-sm text-muted">Bookings</h2><p class="stat-value">${s.bookings}</p></div></article>`;
  } catch (err) {
    statsEl.innerHTML = `<p class="error">${escapeHtml(err.message || 'Failed to load stats.')}</p>`;
  }
})();
