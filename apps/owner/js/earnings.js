import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyState, errorState } from '../../../shared/js/ui.js';
import { escapeHtml, currency, formatDate } from '../../../shared/js/format.js';
import { mountDashboard } from '../../../shared/js/shell.js';

(async function () {
  const user = await mountDashboard({ allowed: ['owner', 'staff', 'admin', 'super_admin'] });
  if (!user) return;

  const totalEl = document.getElementById('total');
  const availableEl = document.getElementById('available');
  const paidOutEl = document.getElementById('paidOut');
  const txnsEl = document.getElementById('txns');

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
          <h3 class="card-title">${escapeHtml(t.type)}</h3>
          <p class="text-xs text-muted">${formatDate(t.created_at)}</p>
        </div>
        <strong>${currency(t.amount)}</strong>
      </div>
    </article>`).join('');
  } catch (err) {
    errorState(txnsEl, err.message || 'Failed to load earnings.');
  }
})();
