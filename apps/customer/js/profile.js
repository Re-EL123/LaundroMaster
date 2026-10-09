import { api } from '../../../shared/js/api-client.js';
import { toast, badge } from '../../../shared/js/ui.js';
import { statusLabel, currency, escapeHtml } from '../../../shared/js/format.js';
import { mountCustomerHeader, requireCustomer } from '../../../shared/js/chrome.js';
import { logout, portalUrl } from '../../../shared/js/auth-client.js';

mountCustomerHeader('profile');

const session = requireCustomer();
const form = document.getElementById('profileForm');
const msg = document.getElementById('msg');

async function load() {
  if (!session) return;
  try {
    const { data } = await api.get('/auth?action=me');
    const user = data.user;
    document.getElementById('full_name').value = user.full_name || '';
    document.getElementById('email').value = user.email || '';
    document.getElementById('phone').value = user.phone || '';
    document.getElementById('accountEmail').textContent = user.email || '';
    document.getElementById('roleLabel').textContent = statusLabel(data.role);
  } catch (err) {
    msg.textContent = err.message || 'Failed to load profile.';
    msg.className = 'form-msg is-error';
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.className = 'form-msg';
  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  try {
    await api.post('/auth?action=update-profile', {
      full_name: document.getElementById('full_name').value.trim(),
      phone: document.getElementById('phone').value.trim() || null,
    });
    msg.textContent = 'Profile updated.';
    msg.classList.add('is-success');
    toast('Profile updated', 'success');
  } catch (err) {
    msg.textContent = err.message || 'Could not save profile.';
    msg.classList.add('is-error');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('signOutBtn').addEventListener('click', async () => {
  await logout();
  location.href = portalUrl();
});

const plusCard = document.getElementById('plusCard');

function renderPlus(subscription, plans) {
  const active = Boolean(subscription);
  const cards = plans.map((p) => {
    const features = Array.isArray(p.features) ? p.features : [];
    const current = active && subscription.plan_id === p.id;
    return `<div class="card-body">
      ${current ? badge('Active', 'success') : ''}
      <h3 class="card-title">${escapeHtml(p.name)}</h3>
      <p class="stat-value">${currency(p.price_monthly, p.currency)}<span class="text-sm text-muted">/mo</span></p>
      <ul class="text-sm">${features.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
      ${current
        ? '<button class="btn btn-secondary" id="cancelPlus" type="button">Cancel membership</button>'
        : `<button class="btn btn-primary" data-plan="${p.id}" type="button">Join ${escapeHtml(p.name)}</button>`}
    </div>`;
  }).join('');
  plusCard.innerHTML = `<div class="card">${cards}</div>`;
}

async function loadPlus() {
  try {
    const [{ data: plans }, { data: sub }] = await Promise.all([
      api.get('/payments?action=plans&audience=customer'),
      api.get('/payments?action=subscription&audience=customer'),
    ]);
    if (!plans.length) { plusCard.innerHTML = '<p class="text-muted">No memberships available right now.</p>'; return; }
    renderPlus(sub.subscription, plans);
  } catch (err) {
    plusCard.innerHTML = `<p class="text-muted">${escapeHtml(err.message || 'Could not load memberships.')}</p>`;
  }
}

plusCard.addEventListener('click', async (e) => {
  const join = e.target.closest('[data-plan]');
  const cancel = e.target.closest('#cancelPlus');
  if (join) {
    join.disabled = true;
    try {
      await api.post('/payments?action=subscribe', { plan_id: join.dataset.plan });
      toast('Welcome to LaundroMaster+', 'success');
      loadPlus();
    } catch (err) {
      toast(err.message || 'Could not subscribe', 'danger');
      join.disabled = false;
    }
  } else if (cancel) {
    cancel.disabled = true;
    try {
      await api.post('/payments?action=cancel-subscription', { audience: 'customer' });
      toast('Membership cancelled', 'success');
      loadPlus();
    } catch (err) {
      toast(err.message || 'Could not cancel', 'danger');
      cancel.disabled = false;
    }
  }
});

load();
loadPlus();
