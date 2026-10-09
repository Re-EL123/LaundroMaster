import { api } from '../../../shared/js/api-client.js';
import { emptyState, errorState, skeleton, badge, toast } from '../../../shared/js/ui.js';
import { escapeHtml, formatDate, statusLabel, statusTone } from '../../../shared/js/format.js';
import { mountDashboard } from '../../../shared/js/shell.js';

const ROLES = ['customer', 'owner', 'staff', 'admin', 'super_admin'];

(async function () {
  const user = await mountDashboard({ allowed: ['admin', 'super_admin'] });
  if (!user) return;

  const list = document.getElementById('list');

  function render(u) {
    const roles = new Set((u.user_roles || []).map((r) => r.role));
    const suspended = u.account_status === 'suspended';
    return `<article class="card" data-id="${u.id}" style="margin-bottom:var(--space-3)">
      <div class="card-body">
        <div class="flex justify-between items-center">
          <div>
            <h3 class="card-title">${escapeHtml(u.full_name || '—')}</h3>
            <p class="text-sm text-muted">${escapeHtml(u.email || '—')} &middot; joined ${formatDate(u.created_at)}</p>
          </div>
          ${badge(statusLabel(u.account_status || 'active'), statusTone(suspended ? 'suspended' : 'active'))}
        </div>
        <div class="flex" style="flex-wrap:wrap; gap:var(--space-3); margin-top:var(--space-2)">
          ${ROLES.map((r) => `<label class="text-sm"><input type="checkbox" data-role="${r}" ${roles.has(r) ? 'checked' : ''}> ${r}</label>`).join('')}
        </div>
        <div class="flex" style="margin-top:var(--space-2)">
          <button class="btn btn-primary" data-save>Save roles</button>
          <button class="btn ${suspended ? 'btn-secondary' : 'btn-danger'}" data-suspend="${suspended ? 'active' : 'suspended'}">${suspended ? 'Reactivate' : 'Suspend'}</button>
        </div>
      </div>
    </article>`;
  }

  async function load() {
    skeleton(list, 3, 90);
    try {
      const { data: users } = await api.get('/admin?action=users');
      if (!users.length) return emptyState(list, 'No users found.');
      list.innerHTML = users.map(render).join('');
    } catch (err) {
      errorState(list, err.message || 'Failed to load users.');
    }
  }

  list.addEventListener('click', async (e) => {
    const card = e.target.closest('article[data-id]');
    if (!card) return;
    const id = card.dataset.id;

    if (e.target.closest('[data-save]')) {
      const btn = e.target.closest('[data-save]');
      btn.disabled = true;
      const roles = Array.from(card.querySelectorAll('input[data-role]:checked')).map((i) => i.dataset.role);
      try {
        await api.post('/admin?action=user-roles', { user_id: id, roles });
        toast('Roles updated', 'success');
        load();
      } catch (err) {
        toast(err.message || 'Could not update roles', 'danger');
        btn.disabled = false;
      }
    }

    const suspend = e.target.closest('[data-suspend]');
    if (suspend) {
      suspend.disabled = true;
      try {
        await api.post('/admin?action=user-update', { user_id: id, account_status: suspend.dataset.suspend });
        toast('User updated', 'success');
        load();
      } catch (err) {
        toast(err.message || 'Could not update user', 'danger');
        suspend.disabled = false;
      }
    }
  });

  load();
})();
