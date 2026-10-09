import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyState, errorState, badge, toast, statTile, confirmAction } from '../../../shared/js/ui.js';
import { escapeHtml, currency, formatDate, statusLabel, statusTone } from '../../../shared/js/format.js';
import { mountDashboard } from '../../../shared/js/shell.js';

(async function () {
  const user = await mountDashboard({ allowed: ['admin', 'super_admin'] });
  if (!user) return;

  const list = document.getElementById('list');
  const summary = document.getElementById('summary');
  const settleAll = document.getElementById('settleAll');

  function renderSummary(items) {
    if (!summary) return;
    const pending = items.filter((c) => c.status === 'pending');
    const settled = items.filter((c) => c.status === 'settled');
    summary.innerHTML = [
      { label: 'Pending entries', value: pending.length, tone: pending.length ? 'warn' : '' },
      { label: 'Pending platform', value: currency(pending.reduce((s, c) => s + Number(c.commission_amount || 0), 0)) },
      { label: 'Settled platform', value: currency(settled.reduce((s, c) => s + Number(c.commission_amount || 0), 0)) },
    ].map(statTile).join('');
    if (settleAll) settleAll.disabled = !pending.length;
  }

  function render(c) {
    const biz = c.laundromats ? escapeHtml(c.laundromats.name) : '';
    const pending = c.status === 'pending';
    return `<article class="card" data-id="${c.id}">
      <div class="card-body">
        ${badge(statusLabel(c.status), statusTone(c.status))}
        <h3 class="card-title">${biz}</h3>
        <p class="card-meta">Gross ${currency(c.gross_amount)} &middot; ${c.commission_percent}% commission</p>
        <p class="text-sm"><strong>${currency(c.commission_amount)}</strong> platform &middot; ${currency(c.net_amount)} to owner</p>
        <p class="text-xs text-muted">${formatDate(c.created_at)}</p>
        ${pending ? `<div class="flex">
          <button class="btn btn-primary" data-status="settled">Settle</button>
          <button class="btn btn-danger" data-status="reversed">Reverse</button>
        </div>` : ''}
      </div>
    </article>`;
  }

  async function load() {
    skeleton(list, 3, 170);
    try {
      const { data: items } = await api.get('/admin?action=commissions');
      renderSummary(items);
      if (!items.length) return emptyState(list, 'No commission entries yet.');
      list.innerHTML = items.map(render).join('');
    } catch (err) {
      errorState(list, err.message || 'Failed to load commissions.');
    }
  }

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-status]');
    if (!btn) return;
    btn.disabled = true;
    try {
      await api.post('/admin?action=commission-update', { commission_id: btn.closest('article[data-id]').dataset.id, status: btn.dataset.status });
      toast('Commission updated', 'success');
      load();
    } catch (err) {
      toast(err.message || 'Could not update commission', 'danger');
      btn.disabled = false;
    }
  });

  if (settleAll) {
    settleAll.addEventListener('click', async () => {
      if (!confirmAction('Settle all pending commission entries?')) return;
      settleAll.disabled = true;
      try {
        const { data } = await api.post('/admin?action=commission-settle-all', {});
        toast(`Settled ${data.settled} entr${data.settled === 1 ? 'y' : 'ies'}`, 'success');
        load();
      } catch (err) {
        toast(err.message || 'Could not settle commissions', 'danger');
        settleAll.disabled = false;
      }
    });
  }

  load();
})();

