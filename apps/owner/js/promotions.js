import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyState, errorState, badge, toast } from '../../../shared/js/ui.js';
import { escapeHtml, currency, formatDate, statusLabel, statusTone } from '../../../shared/js/format.js';
import { mountDashboard } from '../../../shared/js/shell.js';

(async function () {
  const user = await mountDashboard({ allowed: ['owner', 'staff', 'admin', 'super_admin'] });
  if (!user) return;

  const list = document.getElementById('list');
  const select = document.getElementById('laundromat_id');
  const form = document.getElementById('promoForm');

  function render(p) {
    const biz = p.laundromats ? escapeHtml(p.laundromats.name) : '';
    return `<article class="card">
      <div class="card-body">
        ${badge(statusLabel(p.status), statusTone(p.status))}
        <h3 class="card-title">${biz}</h3>
        <p class="card-meta">${escapeHtml(p.kind)} &middot; ${currency(p.amount_paid, p.currency)}</p>
        <p class="text-xs text-muted">Ends ${formatDate(p.ends_at)}</p>
      </div>
    </article>`;
  }

  async function load() {
    skeleton(list, 3, 150);
    try {
      const [{ data: promo }, { data: laundromats }] = await Promise.all([
        api.get('/owner?action=promotions'),
        api.get('/owner?action=laundromats'),
      ]);
      document.getElementById('priceNote').textContent = `${currency(promo.price)} for ${promo.days} days of featured placement.`;
      select.innerHTML = (laundromats || []).map((l) => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('') || '<option value="">No laundromat</option>';
      const items = promo.promotions || [];
      if (!items.length) return emptyState(list, 'No promotions yet.');
      list.innerHTML = items.map(render).join('');
    } catch (err) {
      errorState(list, err.message || 'Failed to load promotions.');
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!select.value) return;
    const btn = document.getElementById('buyBtn');
    btn.disabled = true;
    try {
      await api.post('/owner?action=promote', { laundromat_id: select.value, kind: 'featured' });
      toast('Promotion purchased', 'success');
      load();
    } catch (err) {
      toast(err.message || 'Could not purchase promotion', 'danger');
    } finally {
      btn.disabled = false;
    }
  });

  load();
})();
