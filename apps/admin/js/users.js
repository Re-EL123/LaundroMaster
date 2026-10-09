import { api } from '../../../shared/js/api-client.js';
import { emptyState, errorState, skeleton } from '../../../shared/js/ui.js';
import { escapeHtml, formatDate, statusLabel, statusTone } from '../../../shared/js/format.js';
import { badge } from '../../../shared/js/ui.js';
import { mountDashboard } from '../../../shared/js/shell.js';

(async function () {
  const user = await mountDashboard({ allowed: ['admin', 'super_admin'] });
  if (!user) return;

  const list = document.getElementById('list');
  skeleton(list, 3, 60);
  try {
    const { data: users } = await api.get('/admin?action=users');
    if (!users.length) return emptyState(list, 'No users found.');
    list.innerHTML = `<div class="table-wrap"><table class="table">
      <thead><tr><th>Name</th><th>Email</th><th>Roles</th><th>Status</th><th>Joined</th></tr></thead>
      <tbody>${users.map((u) => {
        const roles = (u.user_roles || []).map((r) => r.role).join(', ') || 'customer';
        return `<tr>
          <td>${escapeHtml(u.full_name || '—')}</td>
          <td>${escapeHtml(u.email || '—')}</td>
          <td>${escapeHtml(roles)}</td>
          <td>${badge(statusLabel(u.account_status), statusTone(u.account_status))}</td>
          <td>${formatDate(u.created_at)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
  } catch (err) {
    errorState(list, err.message || 'Failed to load users.');
  }
})();
