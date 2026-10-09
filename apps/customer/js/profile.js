import { api } from '../../../shared/js/api-client.js';
import { toast } from '../../../shared/js/ui.js';
import { statusLabel } from '../../../shared/js/format.js';
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

load();
