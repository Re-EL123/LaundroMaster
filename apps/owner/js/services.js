import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyState, errorState, badge, toast } from '../../../shared/js/ui.js';
import { escapeHtml, currency } from '../../../shared/js/format.js';
import { mountDashboard } from '../../../shared/js/shell.js';
import { uploadImage, publicUrl } from '../../../shared/js/uploads.js';
import { branchScope, scoped, loadBranches } from '../../../shared/js/branch.js';

(async function () {
  const user = await mountDashboard({ allowed: ['owner', 'admin', 'super_admin'], branchSwitcher: true });
  if (!user) return;

  const list = document.getElementById('list');
  const select = document.getElementById('laundromat_id');
  const form = document.getElementById('serviceForm');
  const msg = document.getElementById('msg');
  const netCalc = document.getElementById('netCalc');
  const priceInput = document.getElementById('base_price');
  // Fallback matches the Starter plan's take-rate so the calculator never
  // under-states the commission before the real plan loads.
  let commissionPercent = 10;
  // Services belong to a branch; with more than one we label each card so the
  // list is unambiguous even in the "all branches" view.
  const branchNames = new Map();
  let showBranch = false;

  function updateNetCalc() {
    if (!netCalc) return;
    const price = Number(priceInput.value) || 0;
    const commission = Math.round(price * (commissionPercent / 100) * 100) / 100;
    const net = Math.round((price - commission) * 100) / 100;
    netCalc.textContent = price > 0
      ? `Customer pays ${currency(price)} · commission ${currency(commission)} (${commissionPercent}%) · you keep ${currency(net)}`
      : `Commission is ${commissionPercent}% of each service price.`;
  }

  async function loadPlan() {
    try {
      const { data } = await api.get('/owner?action=plan');
      const plan = data.subscription ? data.subscription.plans : data.plan;
      if (plan && plan.commission_percent != null) commissionPercent = Number(plan.commission_percent);
    } catch { /* keep default */ }
    updateNetCalc();
  }

  priceInput.addEventListener('input', updateNetCalc);

  async function loadLaundromats() {
    try {
      const branches = (await loadBranches()).filter((l) => l.business_status !== 'archived');
      branchNames.clear();
      branches.forEach((l) => branchNames.set(l.id, l.name));
      showBranch = branches.length > 1;
      if (!branches.length) {
        select.innerHTML = '<option value="">No laundromat yet</option>';
        return;
      }
      const current = branchScope();
      select.innerHTML = branches
        .map((l) => `<option value="${l.id}"${l.id === current ? ' selected' : ''}>${escapeHtml(l.name)} (${escapeHtml(l.verification_status)})</option>`)
        .join('');
    } catch (err) {
      select.innerHTML = '<option value="">Failed to load</option>';
    }
  }

  async function load() {
    skeleton(list, 3, 150);
    try {
      const { data: services } = await api.get(scoped('/owner?action=services'));
      if (!services.length) return emptyState(list, 'No services yet. Add your first one.');
      list.innerHTML = services.map((s) => `<article class="card">
        <div class="card-body">
          ${s.image_path ? `<img class="service-thumb" src="${publicUrl('laundromat-media', s.image_path)}" alt="">` : ''}
          ${badge(s.is_active ? 'active' : 'inactive', s.is_active ? 'success' : 'danger')}
          <h3 class="card-title">${escapeHtml(s.name)}</h3>
          ${showBranch ? `<p class="text-xs text-muted">${escapeHtml(branchNames.get(s.laundromat_id) || 'Branch')}</p>` : ''}
          <p class="card-meta">${escapeHtml(s.description || '')}</p>
          <p class="text-sm">${currency(s.base_price)} · ${Number(s.turnaround_hours) || 24}h</p>
          <div class="flex">
            <button class="btn btn-secondary" data-toggle="${s.id}" data-active="${s.is_active}">${s.is_active ? 'Deactivate' : 'Activate'}</button>
          </div>
        </div>
      </article>`).join('');
    } catch (err) {
      errorState(list, err.message || 'Failed to load services.', { onRetry: load });
    }
  }

  let serviceImagePath = null;
  const imageInput = document.getElementById('serviceImageInput');
  const imageBtn = document.getElementById('serviceImageBtn');
  const imagePreview = document.getElementById('serviceImagePreview');
  if (imageBtn) {
    if (imagePreview) imagePreview.style.visibility = 'hidden';
    imageBtn.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', async () => {
      const file = imageInput.files && imageInput.files[0];
      imageInput.value = '';
      if (!file) return;
      try {
        imagePreview.src = URL.createObjectURL(file);
        imagePreview.style.visibility = 'visible';
        serviceImagePath = await uploadImage(file, { bucket: 'laundromat-media', prefix: 'services' });
      } catch (err) {
        toast(err.message || 'Upload failed', 'danger');
      }
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.className = 'form-msg';
    if (!select.value) {
      msg.textContent = 'Create or select a laundromat first.';
      msg.classList.add('is-error');
      return;
    }
    const btn = document.getElementById('saveBtn');
    btn.disabled = true;
    try {
      await api.post('/owner?action=service-create', {
        laundromat_id: select.value,
        name: document.getElementById('name').value.trim(),
        description: document.getElementById('description').value.trim() || null,
        base_price: Number(document.getElementById('base_price').value) || 0,
        turnaround_hours: Number(document.getElementById('turnaround_hours').value) || 24,
        image_path: serviceImagePath,
      });
      msg.textContent = 'Service added.';
      msg.classList.add('is-success');
      form.reset();
      serviceImagePath = null;
      if (imagePreview) { imagePreview.removeAttribute('src'); imagePreview.style.visibility = 'hidden'; }
      await loadLaundromats();
      load();
    } catch (err) {
      msg.textContent = err.message || 'Could not add service.';
      msg.classList.add('is-error');
    } finally {
      btn.disabled = false;
    }
  });

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-toggle]');
    if (!btn) return;
    btn.disabled = true;
    const nextActive = btn.dataset.active !== 'true';
    try {
      await api.post('/owner?action=service-update', { id: btn.dataset.toggle, is_active: nextActive });
      toast(nextActive ? 'Service activated' : 'Service deactivated', 'success');
      load();
    } catch (err) {
      toast(err.message || 'Could not update service', 'danger');
      btn.disabled = false;
    }
  });

  loadPlan();
  await loadLaundromats();
  load();
})();
