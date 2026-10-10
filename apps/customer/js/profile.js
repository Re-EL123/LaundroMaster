import { api } from '../../../shared/js/api-client.js';
import { toast, badge } from '../../../shared/js/ui.js';
import { statusLabel, currency, escapeHtml, formatDateOnly } from '../../../shared/js/format.js';
import { mountCustomerHeader, requireCustomer } from '../../../shared/js/chrome.js';
import { logout, portalUrl } from '../../../shared/js/auth-client.js';
import { publicUrl } from '../../../shared/js/uploads.js';

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
    if (user.avatar_path) document.getElementById('avatarPreview').src = publicUrl('avatars', user.avatar_path);
  } catch (err) {
    msg.textContent = err.message || 'Failed to load profile.';
    msg.className = 'form-msg is-error';
  }
}

const avatarBtn = document.getElementById('avatarBtn');
if (avatarBtn) {
  avatarBtn.addEventListener('click', () => document.getElementById('avatarInput').click());
  document.getElementById('avatarInput').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const img = document.getElementById('avatarPreview');
    try {
      img.src = URL.createObjectURL(file);
      const { uploadImage, publicUrl } = await import('../../../shared/js/uploads.js');
      const path = await uploadImage(file, { bucket: 'avatars', prefix: 'avatars' });
      await api.post('/auth?action=update-profile', { avatar_path: path });
      img.src = publicUrl('avatars', path);
      toast('Photo updated', 'success');
    } catch (err) {
      toast(err.message || 'Upload failed', 'danger');
    }
  });
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
const savingsCard = document.getElementById('savingsCard');

async function loadSavings() {
  if (!savingsCard) return;
  try {
    const { data } = await api.get('/payments?action=savings');
    const fee = currency(data.delivery_fee);
    if (!data.active) {
      savingsCard.innerHTML = `<div class="card"><div class="card-body">
        <h3 class="card-title">Deliveries add up</h3>
        <p class="text-sm text-muted">A single delivery costs up to ${fee}. LaundroMaster+ waives it on every order — most members save within three orders.</p>
      </div></div>`;
      return;
    }
    const goal = Math.max(data.delivered_orders + 1, 3);
    const progress = Math.min(100, Math.round((data.delivered_orders / goal) * 100));
    savingsCard.innerHTML = `<div class="card"><div class="card-body">
      <div class="flex justify-between wrap">
        <div>
          <span class="text-xs text-muted">Saved on delivery so far</span>
          <p class="stat-value">${currency(data.saved)}</p>
        </div>
        ${badge('Member', 'success')}
      </div>
      <div class="meter-track"><div class="meter-fill" style="width:${progress}%"></div></div>
      <p class="text-sm text-muted">${data.delivered_orders} free deliver${data.delivered_orders === 1 ? 'y' : 'ies'} · member since ${formatDateOnly(data.member_since)}</p>
    </div></div>`;
  } catch (err) {
    savingsCard.innerHTML = `<p class="text-muted">${escapeHtml(err.message || 'Could not load savings.')}</p>`;
  }
}

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
      const { data } = await api.post('/payments?action=subscribe', { plan_id: join.dataset.plan });
      if (data.checkout_url) { window.location.href = data.checkout_url; return; }
      toast(data.subscription ? 'Membership active' : 'Welcome to LaundroMaster+', 'success');
      loadPlus();
      loadSavings();
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

async function reconcileReturn() {
  const params = new URLSearchParams(location.search);
  const paymentId = params.get('payment');
  const sub = params.get('sub');
  if (!sub) return;
  history.replaceState(null, '', location.pathname);
  if (sub === 'canceled') { toast('Checkout cancelled', 'info'); return; }
  if (sub === 'failed') { toast('Payment failed — please try again', 'danger'); return; }
  if (sub === 'paid' && paymentId) {
    try {
      const { data } = await api.post('/payments?action=verify', { payment_id: paymentId });
      if (data.subscription) toast('LaundroMaster+ is active', 'success');
      else toast('Confirming your membership…', 'info');
    } catch { /* webhook may still arrive */ }
    loadPlus();
    loadSavings();
  }
}

const addressList = document.getElementById('addressList');
const addressForm = document.getElementById('addressForm');
let savedAddresses = [];

function renderAddresses() {
  if (!addressList) return;
  if (!savedAddresses.length) {
    addressList.innerHTML = '<p class="text-muted text-sm">No saved addresses yet.</p>';
    return;
  }
  addressList.innerHTML = savedAddresses.map((a) => `<div class="flex justify-between items-center">
    <div>
      <strong>${escapeHtml(a.label || 'Address')}</strong>
      <p class="text-sm text-muted">${escapeHtml([a.line1, a.suburb, a.city, a.postal_code].filter(Boolean).join(', '))}</p>
    </div>
    <button class="btn btn-secondary" type="button" data-remove-address="${escapeHtml(a.id)}">Remove</button>
  </div>`).join('');
}

async function saveAddresses(list) {
  const { data } = await api.post('/auth?action=addresses', { addresses: list });
  savedAddresses = data.addresses || [];
  renderAddresses();
}

async function loadAddresses() {
  if (!addressList) return;
  try {
    const { data } = await api.get('/auth?action=me');
    savedAddresses = data.user.addresses || [];
    renderAddresses();
  } catch (err) {
    addressList.innerHTML = `<p class="text-muted text-sm">${escapeHtml(err.message || 'Could not load addresses.')}</p>`;
  }
}

if (addressForm) {
  addressForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const addrMsg = document.getElementById('addrMsg');
    const entry = {
      label: document.getElementById('addr_label').value.trim(),
      line1: document.getElementById('addr_line1').value.trim(),
      suburb: document.getElementById('addr_suburb').value.trim() || null,
      city: document.getElementById('addr_city').value.trim() || null,
      postal_code: document.getElementById('addr_postal').value.trim() || null,
    };
    try {
      await saveAddresses([...savedAddresses, entry]);
      addressForm.reset();
      addrMsg.textContent = 'Address saved.';
      addrMsg.className = 'form-msg is-success';
      toast('Address saved', 'success');
    } catch (err) {
      addrMsg.textContent = err.message || 'Could not save address.';
      addrMsg.className = 'form-msg is-error';
    }
  });
  addressList.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-remove-address]');
    if (!btn) return;
    try {
      await saveAddresses(savedAddresses.filter((a) => a.id !== btn.dataset.removeAddress));
      toast('Address removed', 'success');
    } catch (err) {
      toast(err.message || 'Could not remove address', 'danger');
    }
  });
}

const rewardsCard = document.getElementById('rewardsCard');
async function loadRewards() {
  if (!rewardsCard) return;
  try {
    const [{ data: loyalty }, { data: referral }] = await Promise.all([
      api.get('/bookings?action=loyalty'),
      api.get('/auth?action=referral'),
    ]);
    const link = `${location.origin}${location.pathname.replace('/apps/customer/pages/profile.html', '/apps/portal/index.html')}?ref=${encodeURIComponent(referral.code)}`;
    rewardsCard.innerHTML = `<div class="card"><div class="card-body">
      <div class="flex justify-between wrap">
        <div><span class="text-xs text-muted">Loyalty points</span><p class="stat-value">${loyalty.points}</p></div>
        <div><span class="text-xs text-muted">Credit</span><p class="stat-value">${currency(loyalty.credit)}</p></div>
      </div>
      <h3 class="text-sm mt-4">Refer a friend</h3>
      <p class="text-sm text-muted">Share your code <strong>${escapeHtml(referral.code)}</strong> — you both earn rewards.</p>
      <div class="flex">
        <input class="input" value="${escapeHtml(link)}" readonly id="refLink">
        <button class="btn btn-primary" type="button" id="copyRef">Copy</button>
      </div>
      <p class="text-xs text-muted mt-2">${referral.invited} invited · ${referral.completed} completed · ${referral.pending} pending</p>
    </div></div>`;
    const copyBtn = document.getElementById('copyRef');
    if (copyBtn) copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(link);
        toast('Invite link copied', 'success');
      } catch {
        document.getElementById('refLink').select();
      }
    });
  } catch (err) {
    rewardsCard.innerHTML = `<p class="text-muted">${escapeHtml(err.message || 'Could not load rewards.')}</p>`;
  }
}

load();
loadPlus();
loadSavings();
loadAddresses();
loadRewards();
reconcileReturn();
