import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyState, errorState, barChart } from '../../../shared/js/ui.js';
import { escapeHtml, currency, relativeTime } from '../../../shared/js/format.js';
import { mountDashboard } from '../../../shared/js/shell.js';

const TXN_LABELS = {
  booking_earning: 'Booking earning',
  platform_commission: 'Platform commission',
  booking_reversal: 'Booking reversed',
  payout: 'Payout',
  promotion: 'Promotion',
};

(async function () {
  const user = await mountDashboard({ allowed: ['owner', 'staff', 'admin', 'super_admin'] });
  if (!user) return;

  const totalEl = document.getElementById('total');
  const availableEl = document.getElementById('available');
  const paidOutEl = document.getElementById('paidOut');
  const txnsEl = document.getElementById('txns');
  const chartEl = document.getElementById('chart');

  skeleton(txnsEl, 3, 90);
  try {
    const { data } = await api.get('/owner?action=earnings');
    totalEl.textContent = currency(data.total);
    if (availableEl) availableEl.textContent = currency(data.available);
    if (paidOutEl) paidOutEl.textContent = currency(data.paidOut);
    const txns = data.transactions || [];
    if (!txns.length) return emptyState(txnsEl, 'No transactions yet.');
    txnsEl.innerHTML = txns.map((t) => `<article class="card" style="margin-bottom:var(--space-3)">
      <div class="card-body" style="flex-direction:row; justify-content:space-between; align-items:center">
        <div>
          <h3 class="card-title">${escapeHtml(TXN_LABELS[t.type] || t.type)}</h3>
          <p class="text-xs text-muted">${escapeHtml(relativeTime(t.created_at))}</p>
        </div>
        <strong class="${Number(t.amount) < 0 ? 'error' : ''}">${currency(t.amount)}</strong>
      </div>
    </article>`).join('');
  } catch (err) {
    errorState(txnsEl, err.message || 'Failed to load earnings.');
  }

  try {
    const { data } = await api.get('/owner?action=analytics');
    const hasData = (data.months || []).some((m) => m.revenue > 0);
    chartEl.innerHTML = hasData ? barChart(data.months, { valueKey: 'revenue' }) : '<p class="text-muted">No completed orders yet.</p>';
  } catch {
    chartEl.innerHTML = '<p class="text-muted">Trend unavailable.</p>';
  }
})();
