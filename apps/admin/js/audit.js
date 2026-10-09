import { api } from '../../../shared/js/api-client.js';
import { emptyState, errorState, skeleton } from '../../../shared/js/ui.js';
import { escapeHtml, formatDate } from '../../../shared/js/format.js';
import { mountDashboard } from '../../../shared/js/shell.js';

(async function () {
  const user = await mountDashboard({ allowed: ['admin', 'super_admin'] });
  if (!user) return;

  const list = document.getElementById('list');
  skeleton(list, 3, 60);
  try {
    const { data: logs } = await api.get('/admin?action=audit');
    if (!logs.length) return emptyState(list, 'No audit entries yet.');
    list.innerHTML = `<div class="table-wrap"><table class="table">
      <thead><tr><th>When</th><th>Action</th><th>Target type</th><th>Target id</th></tr></thead>
      <tbody>${logs.map((l) => `<tr>
        <td>${formatDate(l.created_at)}</td>
        <td>${escapeHtml(l.action)}</td>
        <td>${escapeHtml(l.target_type || '—')}</td>
        <td>${escapeHtml(l.target_id || '—')}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  } catch (err) {
    errorState(list, err.message || 'Failed to load audit log.');
  }
})();
