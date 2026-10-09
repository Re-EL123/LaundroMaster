import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyState, errorState, badge, toast, statTile } from '../../../shared/js/ui.js';
import { escapeHtml, currency, formatDate, statusLabel, statusTone } from '../../../shared/js/format.js';
import { mountDashboard } from '../../../shared/js/shell.js';

(async function () {
  const user = await mountDashboard({ allowed: ['owner', 'staff', 'admin', 'super_admin'] });
  if (!user) return;

  const list = document.getElementById('list');
  const select = document.getElementById('laundromat_id');
  const form = document.getElementById('promoForm');

  function metrics(p) {
    const impressions = Number(p.impressions) || 0;
    const clicks = Number(p.clicks) || 0;
    const ctr = impressions ? `${((clicks / impressions) * 100).toFixed(1)}%` : '—';
    const views = p.laundromats && p.laundromats.view_count != null ? Number(p.laundromats.view_count) : null;
    return `<div class="grid-3">
      <div class="muted-box"><span class="text-xs text-muted">Impressions</span><p class="text-sm"><strong>${impressions}</strong></p></div>
      <div class="muted-box"><span class="text-xs text-muted">Clicks</span><p class="text-sm"><strong>${clicks}</strong></p></div>
      <div class="muted-box"><span class="text-xs text-muted">Click rate</span><p class="text-sm"><strong>${ctr}</strong>${views != null ? ` &middot; ${views} views` : ''}</p></div>
    </div>`;
  }

  function render(p) {
    const biz = p.laundromats ? escapeHtml(p.laundromats.name) : '';
    return `<article class="card">
      <div class="card-body">
        ${badge(statusLabel(p.status), statusTone(p.status))}
        <h3 class="card-title">${biz}</h3>
        <p class="card-meta">${escapeHtml(p.kind)} &middot; ${currency(p.amount_paid, p.currency)}</p>
        <p class="text-xs text-muted">Ends ${formatDate(p.ends_at)}</p>
        ${metrics(p)}
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
      const priceNote = document.getElementById('priceNote');
      if (priceNote) priceNote.textContent = `${currency(promo.price)} for ${promo.days} days of featured placement at the top of search.`;
      select.innerHTML = (laundromats || []).map((l) => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');
      const s = promo.summary || {};
      const summaryEl = document.getElementById('promoStats');
      if (summaryEl) {
        summaryEl.innerHTML = [
          { label: 'Active', value: s.active, tone: s.active ? 'success' : '' },
          { label: 'Impressions', value: s.impressions },
          { label: 'Clicks', value: s.clicks },
          { label: 'Total spend', value: currency(s.spend) },
        ].map(statTile).join('');
      }
      if (!promo.promotions.length) return emptyState(list, 'No promotions yet. Feature a laundromat above to stand out in search.');
      list.innerHTML = promo.promotions.map(render).join('');
    } catch (err) {
      errorState(list, err.message || 'Failed to load promotions.');
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await api.post('/owner?action=promote', { laundromat_id: select.value, kind: 'featured' });
      toast('Promotion activated', 'success');
      load();
    } catch (err) {
      toast(err.message || 'Could not start promotion', 'danger');
    } finally {
      btn.disabled = false;
    }
  });

  load();
})();
