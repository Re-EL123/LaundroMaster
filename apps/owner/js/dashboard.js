import { api } from '../../../shared/js/api-client.js';
import { escapeHtml, currency, formatDate, statusLabel, statusTone } from '../../../shared/js/format.js';
import { badge, emptyState, toast } from '../../../shared/js/ui.js';
import { mountDashboard } from '../../../shared/js/shell.js';

(async function () {
  const user = await mountDashboard({ allowed: ['owner', 'staff', 'admin', 'super_admin'] });
  if (!user) return;

  const statsEl = document.getElementById('stats');
  const recentEl = document.getElementById('recent');

  try {
    const { data: stats } = await api.get('/owner?action=stats');
    statsEl.innerHTML = `
      <article class="card"><div class="card-body"><h2 class="text-sm text-muted">Pending</h2><p class="stat-value">${stats.pending}</p></div></article>
      <article class="card"><div class="card-body"><h2 class="text-sm text-muted">Active</h2><p class="stat-value">${stats.active}</p></div></article>
      <article class="card"><div class="card-body"><h2 class="text-sm text-muted">Completed</h2><p class="stat-value">${stats.completed}</p></div></article>
      <article class="card"><div class="card-body"><h2 class="text-sm text-muted">Revenue</h2><p class="stat-value">${currency(stats.revenue)}</p></div></article>`;
  } catch (err) {
    statsEl.innerHTML = `<p class="error">${escapeHtml(err.message || 'Failed to load stats.')}</p>`;
  }

  try {
    const { data: bookings } = await api.get('/bookings?limit=6');
    if (!bookings.length) return emptyState(recentEl, 'No bookings yet.');
    recentEl.innerHTML = bookings.map((b) => `<article class="card">
      <div class="card-body">
        ${badge(statusLabel(b.status), statusTone(b.status))}
        <h3 class="card-title">${escapeHtml((b.laundromats && b.laundromats.name) || 'Booking')}</h3>
        <p class="card-meta">${b.booking_items ? b.booking_items.length : 0} item(s) · ${currency(b.total_amount)}</p>
        <p class="text-xs text-muted">${formatDate(b.created_at)}</p>
      </div>
    </article>`).join('');
  } catch (err) {
    emptyState(recentEl, 'Could not load bookings.');
  }
})();
