import { api } from '../../../shared/js/api-client.js';
import { toast } from '../../../shared/js/ui.js';
import { mountDashboard } from '../../../shared/js/shell.js';
import { mountBranding } from '../../../shared/js/branding.js';

(async function () {
  const user = await mountDashboard({ allowed: ['owner', 'staff', 'admin', 'super_admin'] });
  if (!user) return;

  const form = document.getElementById('profileForm');
  const msg = document.getElementById('msg');
  const bizList = document.getElementById('bizList');

  try {
    const { data } = await api.get('/auth?action=me');
    document.getElementById('full_name').value = data.user.full_name || '';
    document.getElementById('email').value = data.user.email || '';
    document.getElementById('phone').value = data.user.phone || '';
  } catch (err) {
    msg.textContent = err.message || 'Failed to load profile.';
    msg.className = 'form-msg is-error';
  }

  try {
    const { data: laundromats } = await api.get('/owner?action=branding');
    mountBranding(bizList, laundromats);
  } catch (err) {
    bizList.innerHTML = '<p class="text-muted text-sm">Could not load laundromats.</p>';
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
})();
