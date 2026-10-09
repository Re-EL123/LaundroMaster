import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyState, errorState, badge, toast } from '../../../shared/js/ui.js';
import { escapeHtml, formatDate, statusLabel, statusTone } from '../../../shared/js/format.js';
import { mountDashboard } from '../../../shared/js/shell.js';

(async function () {
  const user = await mountDashboard({ allowed: ['admin', 'super_admin'] });
  if (!user) return;

  const list = document.getElementById('list');
  const detail = document.getElementById('detail');

  function render(l) {
    const owner = l.profiles ? escapeHtml(l.profiles.full_name || l.profiles.email || '') : '';
    return `<article class="card" data-id="${l.id}">
      <div class="card-body">
        ${badge(statusLabel(l.verification_status), statusTone(l.verification_status))}
        <h3 class="card-title">${escapeHtml(l.name)}</h3>
        <p class="card-meta">${owner}</p>
        <p class="text-xs text-muted">${escapeHtml(l.address || 'No address')}</p>
        <div class="flex">
          <button class="btn btn-secondary" data-review>Review</button>
          <button class="btn btn-primary" data-status="approved">Approve</button>
          <button class="btn btn-danger" data-status="rejected">Reject</button>
        </div>
      </div>
    </article>`;
  }

  function detailHtml(d, id) {
    const biz = d.laundromat || {};
    const services = d.services || [];
    const active = services.filter((s) => s.is_active).length;
    const docs = d.documents || [];
    const history = d.history || [];
    return `<article class="card">
      <div class="card-body stack">
        <div class="flex justify-between items-center">
          <h3 class="card-title">${escapeHtml(biz.name || 'Laundromat')}</h3>
          ${badge(statusLabel(biz.verification_status), statusTone(biz.verification_status))}
        </div>
        ${biz.description ? `<p class="text-sm text-muted">${escapeHtml(biz.description)}</p>` : ''}
        <p class="text-sm"><strong>${active}</strong> active services &middot; ${services.length} total</p>
        <h4 class="text-sm text-muted">Documents</h4>
        ${docs.length ? `<ul class="plain-list">${docs.map((doc) => `<li>${escapeHtml(doc.doc_type || 'Document')} <span class="text-xs text-muted">· ${formatDate(doc.created_at)}</span></li>`).join('')}</ul>` : '<p class="text-sm text-muted">No documents uploaded.</p>'}
        ${history.length ? `<h4 class="text-sm text-muted">Recent activity</h4><ul class="plain-list">${history.map((h) => `<li>${escapeHtml(h.action)} <span class="text-xs text-muted">· ${formatDate(h.created_at)}</span></li>`).join('')}</ul>` : ''}
        <div class="flex">
          <button class="btn btn-primary" data-approve="${id}">Approve</button>
          <button class="btn btn-danger" data-reject="${id}">Reject with reason</button>
        </div>
      </div>
    </article>`;
  }

  async function review(id) {
    if (!detail) return;
    skeleton(detail, 1, 220);
    try {
      const { data: d } = await api.get(`/admin?action=verification-detail&id=${encodeURIComponent(id)}`);
      detail.innerHTML = detailHtml(d, id);
      detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      errorState(detail, err.message || 'Failed to load verification details.');
    }
  }

  async function load() {
    skeleton(list, 3, 170);
    try {
      const { data: items } = await api.get('/admin?action=verifications');
      if (!items.length) return emptyState(list, 'No laundromats awaiting verification.');
      list.innerHTML = items.map(render).join('');
    } catch (err) {
      errorState(list, err.message || 'Failed to load verifications.');
    }
  }

  async function decide(id, status, reason) {
    await api.post('/admin?action=verify', { laundromat_id: id, status, reason });
    toast(`Laundromat ${status}`, 'success');
    if (detail) detail.innerHTML = '';
    load();
  }

  async function handle(btn, id, status) {
    btn.disabled = true;
    try {
      if (status === 'rejected') {
        const reason = window.prompt('Reason for rejection (recorded in the audit log):') || 'Did not meet requirements';
        await decide(id, 'rejected', reason);
      } else {
        await decide(id, 'approved');
      }
    } catch (err) {
      toast(err.message || 'Could not update', 'danger');
      btn.disabled = false;
    }
  }

  list.addEventListener('click', (e) => {
    const card = e.target.closest('article[data-id]');
    if (!card) return;
    const id = card.dataset.id;
    if (e.target.closest('[data-review]')) return review(id);
    const btn = e.target.closest('button[data-status]');
    if (btn) handle(btn, id, btn.dataset.status);
  });

  if (detail) {
    detail.addEventListener('click', (e) => {
      const approve = e.target.closest('[data-approve]');
      const reject = e.target.closest('[data-reject]');
      if (approve) return handle(approve, approve.dataset.approve, 'approved');
      if (reject) handle(reject, reject.dataset.reject, 'rejected');
    });
  }

  load();
})();
