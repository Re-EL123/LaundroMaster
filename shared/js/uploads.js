import { api } from './api-client.js';

const MAX_BYTES = 8 * 1024 * 1024;
const PUBLIC_BUCKETS = new Set(['avatars', 'laundromat-media']);

function storageBase() {
  return ((typeof window !== 'undefined' && window.SUPABASE_URL) || '').replace(/\/$/, '');
}

// Builds a public URL for objects in a public bucket (avatars, laundromat-media).
export function publicUrl(bucket, path) {
  const base = storageBase();
  if (!base || !path) return '';
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

// Resolves any stored object to a displayable URL (public or short-lived signed).
export async function resolveUrl(bucket, path) {
  if (!path) return '';
  if (PUBLIC_BUCKETS.has(bucket)) return publicUrl(bucket, path);
  try {
    const { data } = await api.get(`/uploads?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`);
    return data.url;
  } catch {
    return '';
  }
}

function extension(name = '') {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return /^(png|jpe?g|webp|gif|avif|heic)$/.test(ext) ? ext.replace('jpeg', 'jpg') : 'jpg';
}

// Uploads a single image and returns its storage path.
export async function uploadImage(file, { bucket = 'laundromat-media', prefix = '' } = {}) {
  if (!file) throw new Error('No file selected');
  if (!file.type || !file.type.startsWith('image/')) throw new Error('Please choose an image file');
  if (file.size > MAX_BYTES) throw new Error('Image must be under 8MB');

  const cleanPrefix = prefix ? `${prefix.replace(/^\/|\/$/g, '')}/` : '';
  const path = `${cleanPrefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension(file.name)}`;

  const { data } = await api.post('/uploads', { bucket, path, filename: file.name });
  const put = await fetch(data.signed_url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type, 'x-upsert': 'true' },
    body: file,
  });
  if (!put.ok) throw new Error('Upload failed. Please try again.');
  return data.path;
}

// Wire a hidden <input type="file"> to a button and preview element.
export function wireImageField({ input, button, preview, bucket, prefix, onUploaded }) {
  if (!input) return;
  button?.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const original = button ? button.textContent : '';
    if (button) { button.disabled = true; button.textContent = 'Uploading…'; }
    try {
      if (preview && preview.tagName === 'IMG') preview.src = URL.createObjectURL(file);
      const path = await uploadImage(file, { bucket, prefix });
      if (preview && preview.tagName === 'IMG') preview.src = publicUrl(bucket, path);
      onUploaded?.(path);
    } catch (err) {
      alert(err.message || 'Upload failed');
    } finally {
      if (button) { button.disabled = false; button.textContent = original; }
      input.value = '';
    }
  });
}
