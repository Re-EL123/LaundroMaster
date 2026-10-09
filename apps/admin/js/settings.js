import { api } from '../../../shared/js/api-client.js';
import { skeleton, errorState, toast } from '../../../shared/js/ui.js';
import { escapeHtml } from '../../../shared/js/format.js';
import { mountDashboard } from '../../../shared/js/shell.js';

const FIELDS = [
  { key: 'platform_name', label: 'Platform name', type: 'text', section: 'Branding' },
  { key: 'currency', label: 'Currency', type: 'text', section: 'Branding' },
  { key: 'market', label: 'Market', type: 'text', section: 'Branding' },
  { key: 'commission_percent', label: 'Default commission (%)', type: 'number', step: '0.1', section: 'Fees & payouts' },
  { key: 'delivery_fee', label: 'Delivery fee', type: 'number', step: '0.01', section: 'Fees & payouts' },
  { key: 'payout_min', label: 'Minimum payout', type: 'number', step: '0.01', section: 'Fees & payouts' },
  { key: 'promotion_price', label: 'Promotion price', type: 'number', step: '0.01', section: 'Fees & payouts' },
  { key: 'promotion_days', label: 'Promotion duration (days)', type: 'number', section: 'Fees & payouts' },
  { key: 'payout_auto_approve', label: 'Auto-approve payouts', type: 'bool', section: 'Fees & payouts' },
  { key: 'customer_plus_free_delivery', label: 'LaundroMaster+ members get free delivery', type: 'bool', section: 'Fees & payouts' },
  { key: 'feature_owner_subscriptions', label: 'Owner subscriptions enabled', type: 'bool', section: 'Feature flags' },
  { key: 'feature_customer_plans', label: 'Customer plans enabled', type: 'bool', section: 'Feature flags' },
  { key: 'feature_promotions', label: 'Promotions enabled', type: 'bool', section: 'Feature flags' },
  { key: 'feature_payouts', label: 'Payouts enabled', type: 'bool', section: 'Feature flags' },
  { key: 'feature_refunds', label: 'Refunds enabled', type: 'bool', section: 'Feature flags' },
  { key: 'maintenance_mode', label: 'Maintenance mode', type: 'bool', section: 'Feature flags' },
];

function fieldHtml(f, data) {
  const value = data[f.key];
  if (f.type === 'bool') {
    return `<div class="field">
      <label class="label"><input type="checkbox" id="f_${f.key}" ${value ? 'checked' : ''}> ${escapeHtml(f.label)}</label>
    </div>`;
  }
  const v = value == null ? '' : String(value);
  return `<div class="field">
    <label class="label" for="f_${f.key}">${escapeHtml(f.label)}</label>
    <input class="input" id="f_${f.key}" type="${f.type}" step="${f.step || ''}" value="${escapeHtml(v)}">
  </div>`;
}

(async function () {
  const user = await mountDashboard({ allowed: ['admin', 'super_admin'] });
  if (!user) return;

  const host = document.getElementById('fields');
  const form = document.getElementById('settingsForm');
  const msg = document.getElementById('msg');

  skeleton(host, 5, 60);
  try {
    const { data } = await api.get('/admin?action=settings');
    const sections = [...new Set(FIELDS.map((f) => f.section))];
    host.innerHTML = sections.map((section) => `<section class="stack">
      <h3 class="text-sm text-muted">${escapeHtml(section)}</h3>
      ${FIELDS.filter((f) => f.section === section).map((f) => fieldHtml(f, data)).join('')}
    </section>`).join('');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.className = 'form-msg';
      const btn = document.getElementById('saveBtn');
      btn.disabled = true;
      const settings = {};
      for (const f of FIELDS) {
        const input = document.getElementById(`f_${f.key}`);
        if (f.type === 'bool') settings[f.key] = input.checked;
        else if (f.type === 'number') settings[f.key] = input.value === '' ? 0 : Number(input.value);
        else settings[f.key] = input.value.trim();
      }
      try {
        await api.post('/admin?action=settings-update', { settings });
        msg.textContent = 'Settings saved.';
        msg.classList.add('is-success');
        toast('Settings saved', 'success');
      } catch (err) {
        msg.textContent = err.message || 'Could not save settings.';
        msg.classList.add('is-error');
      } finally {
        btn.disabled = false;
      }
    });
  } catch (err) {
    errorState(host, err.message || 'Failed to load settings.');
  }
})();
