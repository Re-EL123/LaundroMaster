import { uploadImage, publicUrl } from './uploads.js';
import { escapeHtml } from './format.js';

// Renders per-laundromat branding controls (logo + gallery + details) into `host`.
export function mountBranding(host, laundromats = []) {
  if (!host) return;
  if (!laundromats.length) {
    host.innerHTML = '<p class="text-muted text-sm">No laundromat linked to your account yet.</p>';
    return;
  }

  host.innerHTML = laundromats.map((l) => {
    const photos = Array.isArray(l.photos) ? l.photos : [];
    return `
    <article class="card branding-card" data-id="${l.id}">
      <div class="card-body stack">
        <div class="flex branding-head">
          <img class="branding-logo" alt="" src="${l.logo_path ? publicUrl('laundromat-media', l.logo_path) : ''}">
          <div>
            <h3 class="card-title">${escapeHtml(l.name || 'Laundromat')}</h3>
            <p class="text-muted text-sm">${escapeHtml(l.verification_status || '')}</p>
            <button type="button" class="btn btn-secondary" data-logo-btn>Change logo</button>
          </div>
        </div>
        <input type="file" accept="image/*" hidden data-logo-input>

        <div class="field"><label class="label">Name</label>
          <input class="input" data-field="name" value="${escapeHtml(l.name || '')}"></div>
        <div class="field"><label class="label">Description</label>
          <textarea class="input" rows="3" data-field="description">${escapeHtml(l.description || '')}</textarea></div>
        <div class="field"><label class="label">Address</label>
          <input class="input" data-field="address" value="${escapeHtml(l.address || '')}"></div>
        <div class="field"><label class="label">Phone</label>
          <input class="input" data-field="phone" value="${escapeHtml(l.phone || '')}"></div>

        <div class="gallery" data-gallery>
          ${photos.map((p) => galleryItem(p)).join('')}
          <button type="button" class="gallery-add" data-add-photo aria-label="Add photo">+</button>
        </div>
        <input type="file" accept="image/*" hidden data-photo-input>

        <button type="button" class="btn btn-primary" data-save>Save changes</button>
        <p class="form-msg" data-msg role="status" aria-live="polite"></p>
      </div>
    </article>`;
  }).join('');

  host.querySelectorAll('.branding-card').forEach((card) => {
    const id = card.dataset.id;
    const source = laundromats.find((l) => l.id === id) || {};
    const state = { logo_path: source.logo_path || null, photos: [...(Array.isArray(source.photos) ? source.photos : [])] };

    wireLogo(card, id, state);
    wireGallery(card, id, state);
    wireSave(card, id, state);
  });
}

function galleryItem(path) {
  return `<span class="gallery-item"><img src="${publicUrl('laundromat-media', path)}" alt="">
    <button type="button" class="gallery-remove" data-remove="${escapeHtml(path)}" aria-label="Remove photo">×</button></span>`;
}

function wireLogo(card, id, state) {
  const input = card.querySelector('[data-logo-input]');
  const img = card.querySelector('.branding-logo');
  card.querySelector('[data-logo-btn]').addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    try {
      img.src = URL.createObjectURL(file);
      img.style.visibility = 'visible';
      state.logo_path = await uploadImage(file, { bucket: 'laundromat-media', prefix: `${id}/logo` });
      img.src = publicUrl('laundromat-media', state.logo_path);
    } catch (err) {
      alert(err.message || 'Upload failed');
    }
  });
}

function wireGallery(card, id, state) {
  const gallery = card.querySelector('[data-gallery]');
  const input = card.querySelector('[data-photo-input]');

  gallery.querySelector('[data-add-photo]').addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    try {
      const path = await uploadImage(file, { bucket: 'laundromat-media', prefix: `${id}/photos` });
      state.photos.push(path);
      gallery.insertAdjacentHTML('beforeend', galleryItem(path));
    } catch (err) {
      alert(err.message || 'Upload failed');
    }
  });

  gallery.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    const path = btn.dataset.remove;
    state.photos = state.photos.filter((p) => p !== path);
    btn.closest('.gallery-item').remove();
  });
}

function wireSave(card, id, state) {
  const msg = card.querySelector('[data-msg]');
  card.querySelector('[data-save]').addEventListener('click', async () => {
    const button = card.querySelector('[data-save]');
    const val = (name) => card.querySelector(`[data-field="${name}"]`).value.trim();
    button.disabled = true;
    try {
      const { api } = await import('./api-client.js');
      await api.post('/owner', {
        action: 'laundromat-update',
        laundromat_id: id,
        name: val('name'),
        description: val('description'),
        address: val('address'),
        phone: val('phone'),
        logo_path: state.logo_path,
        photos: state.photos,
      });
      msg.textContent = 'Saved.';
      msg.className = 'form-msg is-success';
    } catch (err) {
      msg.textContent = err.message || 'Could not save changes.';
      msg.className = 'form-msg is-error';
    } finally {
      button.disabled = false;
    }
  });
}
