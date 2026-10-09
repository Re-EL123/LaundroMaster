import { api } from '../../../shared/js/api-client.js';
import { escapeHtml, currency } from '../../../shared/js/format.js';
import { mountDashboard } from '../../../shared/js/shell.js';

(async function () {
  const user = await mountDashboard({ allowed: ['admin', 'super_admin'] });
  if (!user) return;

  const statsEl = document.getElementById('stats');
  const card = (label, value) => `<article class="card"><div class="card-body"><h2 class="text-sm text-muted">${label}</h2><p class="stat-value">${value}</p></div></article>`;
  try {
    const { data: s } = await api.get('/admin?action=stats');
    statsEl.innerHTML = [
      card('Pending', s.pending),
      card('Approved', s.approved),
      card('Users', s.users),
      card('Bookings', s.bookings),
      card('GMV', currency(s.gmv)),
      card('Platform revenue', currency(s.commission_revenue)),
      card('MRR', currency(s.mrr)),
      card('Active subscriptions', s.active_subscriptions),
      card('Payouts pending', currency(s.payouts_pending)),
      card('Active promotions', s.promotions_active),
    ].join('');
  } catch (err) {
    statsEl.innerHTML = `<p class="error">${escapeHtml(err.message || 'Failed to load stats.')}</p>`;
  }
})();
