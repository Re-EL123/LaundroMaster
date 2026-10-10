import { api } from '../../../shared/js/api-client.js';
import { escapeHtml, currency, statusLabel } from '../../../shared/js/format.js';
import { statTile, animateCounts, initReveal } from '../../../shared/js/ui.js';
import { initCharts } from '../../../shared/js/charts.js';
import { swr } from '../../../shared/js/cache.js';
import { mountDashboard } from '../../../shared/js/shell.js';
import '../../../shared/js/components.js';

function makeChart(type, data, options) {
  const el = document.createElement('lm-chart');
  el.setAttribute('type', type);
  el.setAttribute('data', JSON.stringify(data));
  el.setAttribute('options', JSON.stringify(options || {}));
  return el;
}

(async function () {
  const user = await mountDashboard({ allowed: ['admin', 'super_admin'] });
  if (!user) return;

  const statsEl = document.getElementById('stats');
  const queueEl = document.getElementById('queue');
  const moneyEl = document.getElementById('money');
  const trendEl = document.getElementById('trendEl');
  const statusEl = document.getElementById('statusEl');

  [statsEl, queueEl, moneyEl].forEach((el) => {
    if (el) el.innerHTML = Array.from({ length: 4 })
      .map(() => '<div class="skeleton" style="height:96px"></div>')
      .join('');
  });

  function render(s) {
    if (queueEl) {
      queueEl.innerHTML = [
        { label: 'Verifications pending', value: s.pending, hint: 'Review & approve owners', href: 'pages/verifications.html', tone: s.pending ? 'warn' : '', animate: true },
        { label: 'Refunds pending', value: s.refunds_pending, hint: 'Awaiting decision', href: 'pages/refunds.html', tone: s.refunds_pending ? 'warn' : '', animate: true },
        { label: 'Payouts pending', value: s.payouts_pending_count, hint: currency(s.payouts_pending), href: 'pages/payouts.html', tone: s.payouts_pending_count ? 'warn' : '', animate: true },
        { label: 'Commissions unsettled', value: s.commissions_pending, hint: 'Settle ledger', href: 'pages/commissions.html', tone: s.commissions_pending ? 'warn' : '', animate: true },
      ].map(statTile).join('');
    }

    if (moneyEl) {
      moneyEl.innerHTML = [
        { label: 'GMV', value: s.gmv, format: 'currency', animate: true },
        { label: 'Platform revenue', value: s.commission_revenue, format: 'currency', animate: true },
        { label: 'MRR', value: s.mrr, format: 'currency', animate: true },
        { label: 'Active subscriptions', value: s.active_subscriptions, animate: true },
      ].map(statTile).join('');
    }

    if (statsEl) {
      statsEl.innerHTML = [
        { label: 'Users', value: s.users, animate: true },
        { label: 'Bookings', value: s.bookings, animate: true },
        { label: 'Approved', value: s.approved, animate: true },
        { label: 'Active promotions', value: s.promotions_active, animate: true },
      ].map(statTile).join('');
    }

    const months = s.months || [];
    if (trendEl) {
      trendEl.replaceChildren(months.some((m) => m.revenue > 0)
        ? makeChart('line', months, { format: 'currency', height: 200, color: 'var(--chart-2)' })
        : Object.assign(document.createElement('p'), { className: 'text-muted', textContent: 'No revenue recorded yet.' }));
      initCharts(trendEl);
    }

    const statusRows = (s.by_status || []).map((r) => ({ label: statusLabel(r.status), value: r.count }));
    if (statusEl) {
      const total = statusRows.reduce((a, r) => a + r.value, 0);
      statusEl.replaceChildren(statusRows.length
        ? makeChart('donut', statusRows, { format: 'number', centerValue: String(total), centerLabel: 'last 12 mo' })
        : Object.assign(document.createElement('p'), { className: 'text-muted', textContent: 'No bookings yet.' }));
      initCharts(statusEl);
    }

    animateCounts(document);
    initReveal(document);
  }

  try {
    const data = await swr('admin:stats', async () => (await api.get('/admin?action=stats')).data, {
      ttl: 45000,
      onUpdate: render,
    });
    render(data);
  } catch (err) {
    const msg = `<p class="error">${escapeHtml(err.message || 'Failed to load stats.')}</p>`;
    if (statsEl) statsEl.innerHTML = msg;
    if (queueEl) queueEl.innerHTML = msg;
    if (moneyEl) moneyEl.innerHTML = msg;
    if (trendEl) trendEl.innerHTML = msg;
    if (statusEl) statusEl.innerHTML = msg;
  }
})();
