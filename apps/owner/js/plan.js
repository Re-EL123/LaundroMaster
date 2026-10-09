import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyState, errorState, badge, toast } from '../../../shared/js/ui.js';
import { escapeHtml, currency } from '../../../shared/js/format.js';
import { mountDashboard } from '../../../shared/js/shell.js';

(async function () {
  const user = await mountDashboard({ allowed: ['owner', 'staff', 'admin', 'super_admin'] });
  if (!user) return;

  const list = document.getElementById('list');
  const currentName = document.getElementById('currentName');
  const roiNote = document.getElementById('roiNote');
  let stats = null;
  let currentPercent = null;

  function roiFor(plan) {
    if (!stats || currentPercent == null || plan.commission_percent == null) return '';
    const subtotal = Number(stats.net || 0) + Number(stats.commission || 0);
    if (subtotal <= 0) return '';
    const saved = Math.max(0, Math.round(subtotal * ((currentPercent - plan.commission_percent) / 100) * 100) / 100);
    const price = Number(plan.price_monthly) || 0;
    if (saved <= 0) return '<p class="text-xs text-muted">Same commission rate as your current plan.</p>';
    const net = Math.round((saved - price) * 100) / 100;
    return `<p class="text-xs ${net >= 0 ? 'text-muted' : 'error'}">Est. commission saved ${currency(saved)} vs your ${currency(price)}/mo — ${net >= 0 ? `net gain ${currency(net)}` : `short by ${currency(Math.abs(net))}`} on completed volume so far.</p>`;
  }

  function render(p, activeId) {
    const features = Array.isArray(p.features) ? p.features : [];
    const isCurrent = p.id === activeId;
    return `<article class="card">
      <div class="card-body">
        ${isCurrent ? badge('Current plan', 'success') : ''}
        <h3 class="card-title">${escapeHtml(p.name)}</h3>
        <p class="stat-value">${currency(p.price_monthly, p.currency)}<span class="text-sm text-muted">/mo</span></p>
        <p class="text-sm text-muted">${p.commission_percent}% commission &middot; up to ${p.includes_branches} branches</p>
        <ul class="text-sm">${features.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
        ${roiFor(p)}
        ${isCurrent
          ? `<button class="btn btn-secondary" data-cancel>Cancel subscription</button>`
          : `<button class="btn btn-primary" data-subscribe="${p.id}">Choose ${escapeHtml(p.name)}</button>`}
      </div>
    </article>`;
  }

  async function load() {
    skeleton(list, 3, 180);
    try {
      const [{ data }, statsRes] = await Promise.all([
        api.get('/owner?action=plan'),
        api.get('/owner?action=stats').catch(() => ({ data: null })),
      ]);
      stats = statsRes ? statsRes.data : null;
      const activeId = data.subscription ? data.subscription.plan_id : (data.plan ? data.plan.id : null);
      const activePlan = data.subscription ? data.subscription.plans : data.plan;
      currentPercent = activePlan && activePlan.commission_percent != null ? Number(activePlan.commission_percent) : null;
      currentName.textContent = data.subscription
        ? `${data.subscription.plans.name} (renews ${data.subscription.current_period_end ? new Date(data.subscription.current_period_end).toLocaleDateString() : '—'})`
        : `${data.plan ? data.plan.name : 'Free'} — platform default`;
      if (roiNote) {
        roiNote.textContent = currentPercent != null
          ? `You are currently on ${currentPercent}% commission. Estimates use ${currency(Number(stats && stats.net) + Number(stats && stats.commission))} of completed service value.`
          : '';
      }
      if (!data.plans.length) return emptyState(list, 'No plans available.');
      list.innerHTML = data.plans.map((p) => render(p, activeId)).join('');
    } catch (err) {
      errorState(list, err.message || 'Failed to load plans.');
    }
  }

  list.addEventListener('click', async (e) => {
    const sub = e.target.closest('[data-subscribe]');
    const cancel = e.target.closest('[data-cancel]');
    if (sub) {
      sub.disabled = true;
      try {
        await api.post('/payments?action=subscribe', { plan_id: sub.dataset.subscribe });
        toast('Plan updated', 'success');
        load();
      } catch (err) {
        toast(err.message || 'Could not change plan', 'danger');
        sub.disabled = false;
      }
    } else if (cancel) {
      cancel.disabled = true;
      try {
        await api.post('/payments?action=cancel-subscription', { audience: 'owner' });
        toast('Subscription cancelled', 'success');
        load();
      } catch (err) {
        toast(err.message || 'Could not cancel', 'danger');
        cancel.disabled = false;
      }
    }
  });

  load();
})();
