import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyState, errorState, badge, toast } from '../../../shared/js/ui.js';
import { escapeHtml, currency } from '../../../shared/js/format.js';
import { mountDashboard } from '../../../shared/js/shell.js';

(async function () {
  const user = await mountDashboard({ allowed: ['admin', 'super_admin'] });
  if (!user) return;

  const list = document.getElementById('list');
  const newForm = document.getElementById('newForm');

  function render(p) {
    const features = Array.isArray(p.features) ? p.features.join('\n') : '';
    return `<form class="card" data-id="${p.id}" data-audience="${escapeHtml(p.audience)}">
      <div class="card-body stack">
        <div class="flex justify-between items-center">
          <h3 class="card-title">${escapeHtml(p.name)} <span class="text-xs text-muted">(${escapeHtml(p.audience)})</span></h3>
          ${badge(p.is_active ? 'Active' : 'Inactive', p.is_active ? 'success' : 'danger')}
        </div>
        <div class="field"><label class="label">Code</label><input class="input" name="code" value="${escapeHtml(p.code)}"></div>
        <div class="field"><label class="label">Name</label><input class="input" name="name" value="${escapeHtml(p.name)}"></div>
        <div class="field"><label class="label">Monthly price</label><input class="input" type="number" step="0.01" name="price_monthly" value="${p.price_monthly}"></div>
        <div class="field"><label class="label">Commission %</label><input class="input" type="number" step="0.1" name="commission_percent" value="${p.commission_percent}"></div>
        <div class="field"><label class="label">Includes branches</label><input class="input" type="number" name="includes_branches" value="${p.includes_branches}"></div>
        <div class="field"><label class="label">Features (one per line)</label><textarea class="input" name="features" rows="3">${escapeHtml(features)}</textarea></div>
        <div class="flex">
          <button class="btn btn-primary" type="submit">Save</button>
          <button class="btn btn-secondary" type="button" data-toggle="${p.is_active ? 'false' : 'true'}">${p.is_active ? 'Deactivate' : 'Activate'}</button>
        </div>
      </div>
    </form>`;
  }

  async function load() {
    skeleton(list, 3, 180);
    try {
      const { data: plans } = await api.get('/admin?action=plans');
      if (!plans.length) return emptyState(list, 'No plans yet.');
      list.innerHTML = plans.map(render).join('');
    } catch (err) {
      errorState(list, err.message || 'Failed to load plans.');
    }
  }

  list.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target.closest('form[data-id]');
    if (!form) return;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    const fd = new FormData(form);
    try {
      await api.post('/admin?action=plan-upsert', {
        id: form.dataset.id,
        code: fd.get('code').trim(),
        name: fd.get('name').trim(),
        audience: form.dataset.audience || 'owner',
        price_monthly: Number(fd.get('price_monthly')),
        commission_percent: Number(fd.get('commission_percent')),
        includes_branches: Number(fd.get('includes_branches')),
        features: fd.get('features').split('\n').map((s) => s.trim()).filter(Boolean),
      });
      toast('Plan saved', 'success');
      load();
    } catch (err) {
      toast(err.message || 'Could not save plan', 'danger');
      btn.disabled = false;
    }
  });

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-toggle]');
    if (!btn) return;
    const form = btn.closest('form[data-id]');
    btn.disabled = true;
    try {
      await api.post('/admin?action=plan-toggle', { id: form.dataset.id, is_active: btn.dataset.toggle === 'true' });
      toast('Plan updated', 'success');
      load();
    } catch (err) {
      toast(err.message || 'Could not update plan', 'danger');
      btn.disabled = false;
    }
  });

  newForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = newForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await api.post('/admin?action=plan-upsert', {
        code: document.getElementById('n_code').value.trim(),
        name: document.getElementById('n_name').value.trim(),
        audience: document.getElementById('n_audience').value,
        price_monthly: Number(document.getElementById('n_price').value || 0),
        commission_percent: Number(document.getElementById('n_commission').value || 0),
        features: document.getElementById('n_features').value.split('\n').map((s) => s.trim()).filter(Boolean),
      });
      toast('Plan created', 'success');
      newForm.reset();
      load();
    } catch (err) {
      toast(err.message || 'Could not create plan', 'danger');
    } finally {
      btn.disabled = false;
    }
  });

  load();
})();
