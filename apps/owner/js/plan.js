import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyState, errorState, badge, toast } from '../../../shared/js/ui.js';
import { escapeHtml, currency } from '../../../shared/js/format.js';
import { mountDashboard } from '../../../shared/js/shell.js';

(async function () {
  const user = await mountDashboard({ allowed: ['owner', 'staff', 'admin', 'super_admin'] });
  if (!user) return;

  const list = document.getElementById('list');
  const currentName = document.getElementById('currentName');

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
        ${isCurrent
          ? `<button class="btn btn-secondary" data-cancel>Cancel subscription</button>`
          : `<button class="btn btn-primary" data-subscribe="${p.id}">Choose ${escapeHtml(p.name)}</button>`}
      </div>
    </article>`;
  }

  async function load() {
    skeleton(list, 3, 180);
    try {
      const { data } = await api.get('/owner?action=plan');
      const activeId = data.subscription ? data.subscription.plan_id : (data.plan ? data.plan.id : null);
      currentName.textContent = data.subscription
        ? `${data.subscription.plans.name} (renews ${data.subscription.current_period_end ? new Date(data.subscription.current_period_end).toLocaleDateString() : '—'})`
        : `${data.plan ? data.plan.name : 'Free'} — platform default`;
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
