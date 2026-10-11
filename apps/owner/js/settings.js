import { api } from '../../../shared/js/api-client.js';
import { toast, confirmAction, emptyState } from '../../../shared/js/ui.js';
import { escapeHtml } from '../../../shared/js/format.js';
import { mountDashboard } from '../../../shared/js/shell.js';
import { mountBranding } from '../../../shared/js/branding.js';
import { openHoursEditor, openZonesEditor } from '../../../shared/js/operations.js';
import { uploadDocument } from '../../../shared/js/uploads.js';

(async function () {
  const user = await mountDashboard({ allowed: ['owner', 'staff', 'admin', 'super_admin'] });
  if (!user) return;

  const isOwner = ['owner', 'admin', 'super_admin'].includes(user.role);
  const form = document.getElementById('profileForm');
  const msg = document.getElementById('msg');
  const bizList = document.getElementById('bizList');

  const [meRes, laundromatsRes, brandingRes] = await Promise.allSettled([
    api.get('/auth?action=me'),
    isOwner ? api.get('/owner?action=laundromats') : Promise.resolve({ data: [] }),
    api.get('/owner?action=branding'),
  ]);

  if (meRes.status === 'fulfilled') {
    const envelope = meRes.value;
    const profile = envelope.data || envelope;
    document.getElementById('full_name').value = (profile.user && profile.user.full_name) || (profile.full_name) || '';
    document.getElementById('email').value = (profile.user && profile.user.email) || (profile.email) || document.getElementById('email').value || '';
    document.getElementById('phone').value = (profile.user && profile.user.phone) || (profile.phone) || '';
  } else {
    msg.textContent = (meRes.reason && meRes.reason.message) || 'Failed to load profile.';
    msg.className = 'form-msg is-error';
  }

  const owned = laundromatsRes.status === 'fulfilled' ? (laundromatsRes.value.data || []) : [];
  if (brandingRes.status === 'fulfilled') {
    mountBranding(bizList, brandingRes.value.data);
  } else {
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

  function initOperations() {
    const wrap = document.getElementById('operationsList');
    if (!owned.length) {
      emptyState(wrap, 'No laundromats to configure.');
      return;
    }
    wrap.innerHTML = owned.map((l) => `<article class="card"><div class="card-body">
      <h3 class="card-title">${escapeHtml(l.name)}</h3>
      <p class="text-muted text-sm">Set the weekly opening hours and the areas you deliver to.</p>
      <div class="flex mt-4">
        <button class="btn btn-secondary" data-hours="${l.id}">Configure hours</button>
        <button class="btn btn-secondary" data-zones="${l.id}">Configure delivery zones</button>
      </div>
    </div></article>`).join('');

    wrap.addEventListener('click', (e) => {
      const hoursBtn = e.target.closest('[data-hours]');
      const zonesBtn = e.target.closest('[data-zones]');
      if (hoursBtn) openHoursEditor(hoursBtn.dataset.hours);
      else if (zonesBtn) openZonesEditor(zonesBtn.dataset.zones);
    });
  }

  const DOC_TYPE_LABELS = {
    business_registration: 'Business registration (CIPC)',
    identity: 'ID / passport',
    proof_of_address: 'Proof of address',
    other: 'Other',
  };

  async function initDocuments() {
    const wrap = document.getElementById('documentsList');
    if (!owned.length) {
      emptyState(wrap, 'Add a laundromat before uploading documents.');
      return;
    }
    let docs = {};
    try {
      const { data } = await api.get('/owner?action=documents');
      docs = (data || []).reduce((m, d) => {
        (m[d.laudromat_id] = m[d.laudromat_id] || []).push(d);
        return m;
      }, {});
    } catch { /* list still renders without existing docs */ }

    wrap.innerHTML = owned.map((l) => {
      const rows = (docs[l.id] || []).map((d) => {
        const label = DOC_TYPE_LABELS[d.doc_type] || d.doc_type;
        return `<li class="flex justify-between items-center">
          <span>${escapeHtml(label)} <span class="text-xs text-muted">· ${d.verification_state}</span></span>
          <button class="btn btn-ghost" type="button" data-doc-view="${d.id}" data-bucket="verification-documents" data-path="${escapeHtml(d.storage_path)}">View</button>
        </li>`;
      }).join('') || '<li class="text-sm text-muted">No documents uploaded yet.</li>';
      return `<article class="card" data-biz="${l.id}"><div class="card-body">
        <h3 class="card-title">${escapeHtml(l.name)}</h3>
        <ul class="plain-list">${rows}</ul>
        <hr class="my-4">
        <div class="field">
          <label class="label">Document type</label>
          <select class="input" data-doc-type>
            ${Object.entries(DOC_TYPE_LABELS).map(([v, t]) => `<option value="${v}">${escapeHtml(t)}</option>`).join('')}
          </select>
        </div>
        <div class="flex items-center">
          <input class="input" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" data-doc-file>
          <button class="btn btn-primary" type="button" data-doc-upload>Upload</button>
        </div>
      </div></article>`;
    }).join('');

    wrap.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-doc-upload]');
      const view = e.target.closest('button[data-doc-view]');
      if (btn) {
        const card = btn.closest('[data-biz]');
        const fileInput = card && card.querySelector('[data-doc-file]');
        const file = fileInput && fileInput.files && fileInput.files[0];
        if (!file) { toast('Choose a document first', 'info'); return; }
        btn.disabled = true;
        const original = btn.textContent;
        btn.textContent = 'Uploading…';
        try {
          const path = await uploadDocument(file, { bucket: 'verification-documents', prefix: card.dataset.biz });
          await api.post('/owner?action=document-upload', {
            laundromat_id: card.dataset.biz,
            storage_path: path,
            doc_type: card.querySelector('[data-doc-type]').value,
          });
          toast('Document uploaded for review', 'success');
          initDocuments();
        } catch (err) {
          toast(err.message || 'Could not upload document', 'danger');
          btn.textContent = original;
          btn.disabled = false;
        }
      } else if (view) {
        view.disabled = true;
        try {
          const { data } = await api.get(`/uploads?bucket=${encodeURIComponent(view.dataset.bucket)}&path=${encodeURIComponent(view.dataset.path)}`);
          window.open(data.url, '_blank', 'noopener');
        } catch (err) {
          toast(err.message || 'Could not open document', 'danger');
        } finally {
          view.disabled = false;
        }
      }
    });
  }

  if (isOwner) {
    document.getElementById('teamSection').hidden = false;
    document.getElementById('availabilitySection').hidden = false;
    document.getElementById('operationsSection').hidden = false;
    document.getElementById('documentsSection').hidden = false;
    document.getElementById('inviteBiz').innerHTML = owned
      .map((l) => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');

    loadTeam();
    initCapacity();
    initOperations();
    initDocuments();

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
