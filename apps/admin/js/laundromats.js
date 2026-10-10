import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyState, errorState, badge, toast } from '../../../shared/js/ui.js';
import { escapeHtml, formatDate, statusLabel, statusTone } from '../../../shared/js/format.js';
import { mountDashboard } from '../../../shared/js/shell.js';

(async function () {
  const user = await mountDashboard({ allowed: ['admin', 'super_admin'] });
  if (!user) return;

  const action = document.body.dataset.adminAction || 'laundromats';
  const list = document.getElementById('list');

  async function load() {
    skeleton(list, 3, 170);
    try {
      const { data: items } = await api.get(`/admin?action=${action}`);
      if (!items.length) return emptyState(list, 'Nothing to show.');
      list.innerHTML = items.map(render).join('');
    } catch (err) {
      errorState(list, err.message || 'Failed to load laundromats.');
    }
  }

  function render(l) {
    const owner = l.profiles ? escapeHtml(l.profiles.full_name || l.profiles.email || '') : '';
    return `<article class="card">
      <div class="card-body">
        ${badge(statusLabel(l.verification_status), statusTone(l.verification_status))}
        <h3 class="card-title">${escapeHtml(l.name)}</h3>
        <p class="card-meta">${escapeHtml(l.address || 'No address')}</p>
        ${owner ? `<p class="text-xs text-muted">Owner: ${owner}</p>` : ''}
        <p class="text-xs text-muted">Created ${formatDate(l.created_at)}</p>
        <div class="flex">
          <button class="btn btn-primary" data-id="${l.id}" data-status="approved">Approve</button>
          <button class="btn btn-danger" data-id="${l.id}" data-status="rejected">Reject</button>
          <button class="btn btn-secondary" data-id="${l.id}" data-status="suspended">Suspend</button>
        </div>
      </div>
    </article>`;
  }

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-status]');
    if (!btn) return;
    btn.disabled = true;
    const status = btn.dataset.status;
    let reason = `Marked ${status} by ${(user.user && user.user.email) || 'admin'}`;
    if (status !== 'approved') {
      reason = window.prompt('Reason (recorded in the audit log):', reason) || reason;
    }
    try {
      await api.post('/admin?action=verify', {
        laundromat_id: btn.dataset.id,
        status,
        reason,
      });
      toast('Laundromat updated', 'success');
      load();
    } catch (err) {
      toast(err.message || 'Could not update', 'danger');
      btn.disabled = false;
    }
  });

  load();
})();
