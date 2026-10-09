import { api } from '../../../shared/js/api-client.js';
import { escapeHtml, currency } from '../../../shared/js/format.js';
import { statTile } from '../../../shared/js/ui.js';
import { mountDashboard } from '../../../shared/js/shell.js';

(async function () {
  const user = await mountDashboard({ allowed: ['admin', 'super_admin'] });
  if (!user) return;

  const statsEl = document.getElementById('stats');
  const queueEl = document.getElementById('queue');
  const moneyEl = document.getElementById('money');

  try {
    const { data: s } = await api.get('/admin?action=stats');

    if (queueEl) {
      queueEl.innerHTML = [
        { label: 'Verifications pending', value: s.pending, hint: 'Review & approve owners', href: 'pages/verifications.html', tone: s.pending ? 'warn' : '' },
        { label: 'Refunds pending', value: s.refunds_pending, hint: 'Awaiting decision', href: 'pages/refunds.html', tone: s.refunds_pending ? 'warn' : '' },
        { label: 'Payouts pending', value: s.payouts_pending_count, hint: currency(s.payouts_pending), href: 'pages/payouts.html', tone: s.payouts_pending_count ? 'warn' : '' },
        { label: 'Commissions unsettled', value: s.commissions_pending, hint: 'Settle ledger', href: 'pages/commissions.html', tone: s.commissions_pending ? 'warn' : '' },
      ].map(statTile).join('');
    }

    if (moneyEl) {
      moneyEl.innerHTML = [
        { label: 'GMV', value: currency(s.gmv) },
        { label: 'Platform revenue', value: currency(s.commission_revenue) },
        { label: 'MRR', value: currency(s.mrr) },
        { label: 'Active subscriptions', value: s.active_subscriptions },
      ].map(statTile).join('');
    }

    if (statsEl) {
      statsEl.innerHTML = [
        { label: 'Users', value: s.users },
        { label: 'Bookings', value: s.bookings },
        { label: 'Approved', value: s.approved },
        { label: 'Active promotions', value: s.promotions_active },
      ].map(statTile).join('');
    }
  } catch (err) {
    const msg = `<p class="error">${escapeHtml(err.message || 'Failed to load stats.')}</p>`;
    if (statsEl) statsEl.innerHTML = msg;
    if (queueEl) queueEl.innerHTML = msg;
    if (moneyEl) moneyEl.innerHTML = msg;
  }
})();
