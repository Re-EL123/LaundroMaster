import { api } from '../../../shared/js/api-client.js';
import { toast, confirmAction, emptyState } from '../../../shared/js/ui.js';
import { escapeHtml } from '../../../shared/js/format.js';
import { mountDashboard } from '../../../shared/js/shell.js';
import { mountBranding } from '../../../shared/js/branding.js';

(async function () {
  const user = await mountDashboard({ allowed: ['owner', 'staff', 'admin', 'super_admin'] });
  if (!user) return;

  const isOwner = ['owner', 'admin', 'super_admin'].includes(user.role);
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

  let owned = [];
  try {
    if (isOwner) {
      const { data } = await api.get('/owner?action=laundromats');
      owned = data || [];
    }
    const { data: laundromats } = await api.get('/owner?action=branding');
    mountBranding(bizList, laundromats);
  } catch (err) {
    bizList.innerHTML = '<p class="text-muted text-sm">Could not load laundromats.</p>';
  }

  async function loadTeam() {
    const list = document.getElementById('teamList');
    if (!owned.length) {
      emptyState(list, 'Add a laundromat before inviting a team.');
      return;
    }
    try {
      const { data: members } = await api.get('/owner?action=staff');
      if (!members.length) {
        emptyState(list, 'No team members yet.');
        return;
      }
      list.innerHTML = members.map((m) => {
        const name = (m.profiles && (m.profiles.full_name || m.profiles.email)) || 'Member';
        const biz = (m.laundromats && m.laundromats.name) || '—';
        return `<article class="card"><div class="card-body flex justify-between items-center">
          <div>
            <h3 class="card-title">${escapeHtml(name)}</h3>
            <p class="card-meta">${escapeHtml(m.profiles ? (m.profiles.email || '') : '')}</p>
            <p class="text-xs text-muted">${escapeHtml(biz)}</p>
          </div>
          <div class="flex items-center">
            <select class="input" data-member="${m.id}" data-role>
              <option value="staff"${m.member_role === 'staff' ? ' selected' : ''}>Staff</option>
              <option value="manager"${m.member_role === 'manager' ? ' selected' : ''}>Manager</option>
            </select>
            <button class="btn btn-danger" data-member="${m.id}" data-remove>Remove</button>
          </div>
        </div></article>`;
      }).join('');
    } catch (err) {
      list.innerHTML = `<p class="error">${escapeHtml(err.message || 'Could not load team.')}</p>`;
    }
  }

  function initCapacity() {
    const wrap = document.getElementById('capacityList');
    if (!owned.length) {
      emptyState(wrap, 'No laundromats to configure.');
      return;
    }
    wrap.innerHTML = owned.map((l) => `<article class="card" data-biz="${l.id}"><div class="card-body">
      <h3 class="card-title">${escapeHtml(l.name)}</h3>
      <label class="flex items-center"><input type="checkbox" data-accepting${l.accepting_orders !== false ? ' checked' : ''}> Accepting new orders</label>
      <div class="field">
        <label class="label">Max orders per day (blank = unlimited)</label>
        <input class="input" type="number" min="1" data-max value="${l.max_orders_per_day != null ? Number(l.max_orders_per_day) : ''}">
      </div>
      <div class="field">
        <label class="label">Extra delivery fee</label>
        <input class="input" type="number" min="0" step="0.01" data-extra value="${Number(l.extra_delivery_fee) || 0}">
      </div>
      <button class="btn btn-secondary" data-save>Save availability</button>
    </div></article>`).join('');

    wrap.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-save]');
      if (!btn) return;
      const card = btn.closest('[data-biz]');
      btn.disabled = true;
      try {
        await api.post('/owner?action=capacity-update', {
          laundromat_id: card.dataset.biz,
          accepting_orders: card.querySelector('[data-accepting]').checked,
          max_orders_per_day: card.querySelector('[data-max]').value ? Number(card.querySelector('[data-max]').value) : null,
          extra_delivery_fee: Number(card.querySelector('[data-extra]').value) || 0,
        });
        toast('Availability saved', 'success');
      } catch (err) {
        toast(err.message || 'Could not save availability', 'danger');
      } finally {
        btn.disabled = false;
      }
    });
  }

  if (isOwner) {
    document.getElementById('teamSection').hidden = false;
    document.getElementById('availabilitySection').hidden = false;
    document.getElementById('inviteBiz').innerHTML = owned
      .map((l) => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');

    loadTeam();
    initCapacity();

    document.getElementById('inviteForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const teamMsg = document.getElementById('teamMsg');
      const btn = document.getElementById('inviteBtn');
      btn.disabled = true;
      teamMsg.className = 'form-msg';
      try {
        await api.post('/owner?action=staff-invite', {
          laundromat_id: document.getElementById('inviteBiz').value,
          email: document.getElementById('inviteEmail').value.trim(),
          member_role: document.getElementById('inviteRole').value,
        });
        teamMsg.textContent = 'Team member added.';
        teamMsg.classList.add('is-success');
        document.getElementById('inviteEmail').value = '';
        toast('Team member added', 'success');
        loadTeam();
      } catch (err) {
        teamMsg.textContent = err.message || 'Could not add team member.';
        teamMsg.classList.add('is-error');
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('teamList').addEventListener('change', async (e) => {
      const sel = e.target.closest('select[data-role]');
      if (!sel) return;
      try {
        await api.post('/owner?action=staff-update', { member_id: sel.dataset.member, member_role: sel.value });
        toast('Role updated', 'success');
      } catch (err) {
        toast(err.message || 'Could not update role', 'danger');
      }
    });

    document.getElementById('teamList').addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-remove]');
      if (!btn) return;
      if (!confirmAction('Remove this team member?')) return;
      try {
        await api.post('/owner?action=staff-remove', { member_id: btn.dataset.member });
        toast('Team member removed', 'success');
        loadTeam();
      } catch (err) {
        toast(err.message || 'Could not remove member', 'danger');
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
