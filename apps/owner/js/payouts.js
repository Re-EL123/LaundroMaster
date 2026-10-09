import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyState, errorState, badge, toast } from '../../../shared/js/ui.js';
import { escapeHtml, currency, formatDate, statusLabel, statusTone } from '../../../shared/js/format.js';
import { mountDashboard } from '../../../shared/js/shell.js';

(async function () {
  const user = await mountDashboard({ allowed: ['owner', 'staff', 'admin', 'super_admin'] });
  if (!user) return;

  const list = document.getElementById('list');
  const form = document.getElementById('payoutForm');

  function render(p) {
    return `<article class="card" style="margin-bottom:var(--space-3)">
      <div class="card-body" style="flex-direction:row; justify-content:space-between; align-items:center">
        <div>
          ${badge(statusLabel(p.status), statusTone(p.status))}
          <p class="text-xs text-muted">${formatDate(p.created_at)}${p.reference ? ` &middot; Ref ${escapeHtml(p.reference)}` : ''}</p>
        </div>
        <strong>${currency(p.amount, p.currency)}</strong>
      </div>
    </article>`;
  }

  async function load() {
    skeleton(list, 3, 80);
    try {
      const { data } = await api.get('/owner?action=payouts');
      document.getElementById('available').textContent = currency(data.available);
      document.getElementById('earned').textContent = currency(data.earned);
      document.getElementById('paidOut').textContent = currency(data.paidOut);
      document.getElementById('minNote').textContent = `Minimum payout ${currency(data.min)}. Available now: ${currency(data.available)}.`;
      const amount = document.getElementById('amount');
      amount.max = data.available;
      if (!amount.value) amount.value = data.available > 0 ? data.available : '';
      const items = data.payouts || [];
      if (!items.length) return emptyState(list, 'No payouts yet.');
      list.innerHTML = items.map(render).join('');
    } catch (err) {
      errorState(list, err.message || 'Failed to load payouts.');
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('reqBtn');
    btn.disabled = true;
    try {
      await api.post('/owner?action=payout-request', {
        amount: Number(document.getElementById('amount').value),
        method: document.getElementById('method').value.trim() || null,
      });
      toast('Payout requested', 'success');
      load();
    } catch (err) {
      toast(err.message || 'Could not request payout', 'danger');
    } finally {
      btn.disabled = false;
    }
  });

  load();
})();
