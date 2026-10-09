import { api } from '../../../shared/js/api-client.js';
import { emptyState, errorState, skeleton } from '../../../shared/js/ui.js';
import { escapeHtml, formatDate } from '../../../shared/js/format.js';
import { mountDashboard } from '../../../shared/js/shell.js';

(async function () {
  const user = await mountDashboard({ allowed: ['admin', 'super_admin'] });
  if (!user) return;

  const list = document.getElementById('list');
  const filters = document.getElementById('filters');

  function query() {
    const params = new URLSearchParams({ action: 'audit' });
    const q = document.getElementById('f_q').value.trim();
    const actor = document.getElementById('f_actor').value.trim();
    const target = document.getElementById('f_target').value;
    if (q) params.set('q', q);
    if (actor) params.set('actor', actor);
    if (target) params.set('target_type', target);
    return params.toString();
  }

  async function load() {
    skeleton(list, 3, 60);
    try {
      const { data: logs } = await api.get(`/admin?${query()}`);
      if (!logs.length) return emptyState(list, 'No matching audit entries.');
      list.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>When</th><th>Action</th><th>Target</th><th>Target id</th></tr></thead>
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
  }

  if (filters) {
    filters.addEventListener('submit', (e) => {
      e.preventDefault();
      load();
    });
    document.getElementById('clearFilters').addEventListener('click', () => {
      filters.reset();
      load();
    });
  }

  load();
})();
