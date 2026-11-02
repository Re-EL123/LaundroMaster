import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyState, errorState, barChart } from '../../../shared/js/ui.js';
import { escapeHtml, currency, relativeTime } from '../../../shared/js/format.js';
import { mountDashboard } from '../../../shared/js/shell.js';
import { scoped } from '../../../shared/js/branch.js';

const TXN_LABELS = {
  booking_earning: 'Booking earning',
  platform_commission: 'Platform commission',
  booking_reversal: 'Booking reversed',
  payout: 'Payout',
  promotion: 'Promotion',
};

(async function () {
  const user = await mountDashboard({ allowed: ['owner', 'staff', 'admin', 'super_admin'], branchSwitcher: true });
  if (!user) return;

  const totalEl = document.getElementById('total');
  const totalHint = document.getElementById('totalHint');
  const availableEl = document.getElementById('available');
  const paidOutEl = document.getElementById('paidOut');
  const txnsEl = document.getElementById('txns');
  const chartEl = document.getElementById('chart');
  const byBranchEl = document.getElementById('byBranch');

  async function loadEarnings() {
    skeleton(txnsEl, 3, 90);
    try {
      const { data } = await api.get(scoped('/owner?action=earnings'));
      totalEl.textContent = currency(data.total);
      if (availableEl) availableEl.textContent = currency(data.available);
      if (paidOutEl) paidOutEl.textContent = currency(data.paidOut);

      // Payouts are drawn from the whole business, so when a single branch is in
      // view the "available" and "paid out" figures still cover every branch.
      // Say so rather than let the tiles look like they contradict the total.
      if (data.scoped) {
        if (totalHint) { totalHint.hidden = false; totalHint.textContent = `For ${data.scope_name} only`; }
        document.querySelectorAll('[data-balance-hint]').forEach((el) => {
          el.hidden = false;
          el.textContent = 'Across all branches';
        });
      }

      // Consolidated reporting only matters once there is more than one branch.
      const branches = data.by_branch || [];
      if (byBranchEl && !data.scoped && branches.length > 1) {
        byBranchEl.innerHTML = `<div class="section-head"><h2>By branch</h2><span class="text-sm text-muted">Consolidated</span></div>
          <div class="card" style="margin-bottom:var(--space-6)"><div class="card-body">
            <ul class="plain-list">${branches.map((b) => `<li class="flex justify-between items-center">
              <span>${escapeHtml(b.name)}</span><strong>${currency(b.total)}</strong>
            </li>`).join('')}</ul>
          </div></div>`;
      } else if (byBranchEl) {
        byBranchEl.innerHTML = '';
      }

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
      errorState(txnsEl, err.message || 'Failed to load earnings.', { onRetry: loadEarnings });
    }
  }

  async function loadTrend() {
    try {
      const { data } = await api.get(scoped('/owner?action=analytics'));
      const hasData = (data.months || []).some((m) => m.revenue > 0);
      chartEl.innerHTML = hasData ? barChart(data.months, { valueKey: 'revenue' }) : '<p class="text-muted">No completed orders yet.</p>';
    } catch {
      chartEl.innerHTML = '<p class="text-muted">Trend unavailable.</p>';
    }
  }

  await loadEarnings();
  await loadTrend();
})();
