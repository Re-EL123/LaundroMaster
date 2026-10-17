import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyState, errorState, toast, badge } from '../../../shared/js/ui.js';
import { escapeHtml } from '../../../shared/js/format.js';
import { uploadImage, uploadDocument, publicUrl } from '../../../shared/js/uploads.js';
import { mountDashboard } from '../../../shared/js/shell.js';

(async function () {
  const user = await mountDashboard({ allowed: ['admin', 'super_admin'] });
  if (!user) return;

  const list = document.getElementById('list');
  const form = document.getElementById('adForm');

  async function load() {
    skeleton(list, 3, 120);
    try {
      const { data } = await api.get('/admin?action=ads');
      if (!data.length) return emptyState(list, 'No ads yet.');
      list.innerHTML = data.map(render).join('');
    } catch (err) {
      errorState(list, err.message || 'Failed to load ads.');
    }
  }

  function render(a) {
    const parts = a.media_path.split('/');
    const url = parts.length > 1 ? publicUrl(parts[0], parts.slice(1).join('/')) : a.media_path;
    const media = a.media_type === 'image'
      ? `<img src="${url}" alt="" style="max-width:100%;border-radius:8px;margin-bottom:8px">`
      : `<video src="${url}" controls style="max-width:100%;border-radius:8px;margin-bottom:8px"></video>`;
    const ctr = a.impressions > 0 ? ((a.clicks / a.impressions) * 100).toFixed(1) : '0.0';
    return `<article class="card"><div class="card-body">
      <div class="flex justify-between">${badge(a.placement)} ${badge(a.is_active ? 'active' : 'inactive', a.is_active ? 'success' : 'danger')}</div>
      <h3 class="card-title">${escapeHtml(a.title)}</h3>
      ${media}
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:8px 0">
        <div style="text-align:center"><div style="font-size:1.5rem;font-weight:700">${a.impressions}</div><div class="text-xs text-muted">Impressions</div></div>
        <div style="text-align:center"><div style="font-size:1.5rem;font-weight:700">${a.clicks}</div><div class="text-xs text-muted">Clicks</div></div>
        <div style="text-align:center"><div style="font-size:1.5rem;font-weight:700">${ctr}%</div><div class="text-xs text-muted">CTR</div></div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" data-toggle="${a.id}" data-active="${a.is_active}">${a.is_active ? 'Deactivate' : 'Activate'}</button>
        <button class="btn btn-danger" data-del="${a.id}">Delete</button>
      </div>
    </div></article>`;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    payload.priority = Number(payload.priority) || 0;
    try {
      await api.post('/admin?action=ad-create', payload);
      toast('Ad created', 'success');
      form.reset();
      load();
    } catch (err) {
      toast(err.message || 'Could not create ad', 'danger');
    }
  });

  const mediaFile = document.getElementById('mediaFile');
  const mediaUploadBtn = document.getElementById('mediaUploadBtn');
  const mediaPathInput = document.getElementById('mediaPath');
  const mediaPreview = document.getElementById('mediaPreview');
  const mediaTypeSel = document.getElementById('mediaType');

  mediaUploadBtn.addEventListener('click', () => mediaFile.click());
  mediaFile.addEventListener('change', async () => {
    const file = mediaFile.files && mediaFile.files[0];
    if (!file) return;
    const isVideo = (mediaTypeSel.value === 'video') || file.type.startsWith('video/');
    mediaUploadBtn.disabled = true;
    mediaUploadBtn.textContent = 'Uploading…';
    try {
      const path = isVideo
        ? await uploadDocument(file, { bucket: 'laundromat-media', prefix: 'ads' })
        : await uploadImage(file, { bucket: 'laundromat-media', prefix: 'ads' });
      mediaPathInput.value = `laundromat-media/${path}`;
      mediaPreview.innerHTML = isVideo
        ? `<video src="${publicUrl('laundromat-media', path)}" controls style="max-width:100%;border-radius:8px"></video>`
        : `<img src="${publicUrl('laundromat-media', path)}" style="max-width:100%;border-radius:8px">`;
    } catch (err) {
      toast(err.message || 'Upload failed', 'danger');
    } finally {
      mediaUploadBtn.disabled = false;
      mediaUploadBtn.textContent = 'Upload media';
      mediaFile.value = '';
    }
  });

  list.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.dataset.toggle) {
      await api.post('/admin?action=ad-update', { id: t.dataset.toggle, is_active: t.dataset.active !== 'true' });
      load();
    }
    if (t.dataset.del) {
      if (!confirm('Delete ad?')) return;
      await api.post('/admin?action=ad-delete', { id: t.dataset.del });
      load();
    }
  });

  load();
})();
