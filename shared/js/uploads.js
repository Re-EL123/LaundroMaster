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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Translate the UI's `prefix` convention into the server's scope parameter.
function scopePayload(bucket, prefix) {
  if (!prefix) return {};
  const first = String(prefix).split('/')[0];
  if (first === 'ads') return { scope: 'ads' };
  if (UUID_RE.test(first)) return { laundromat_id: first };
  return {};
}

// Uploads a non-image verification/business document and returns its storage path.
export async function uploadDocument(file, { bucket = 'verification-documents', prefix = '' } = {}) {
  if (!file) throw new Error('No file selected');
  if (file.size > MAX_BYTES) throw new Error('Document must be under 8MB');

  const allowed = /^(application\/pdf|text\/plain|image\/(png|jpe?g|webp|gif|avif|heic)|video\/(mp4|webm|quicktime)|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/i;
  if (!allowed.test(file.type || '')) throw new Error('Please choose a PDF, image or Word document');

  const { data } = await api.post('/uploads?action=sign', {
    bucket,
    filename: file.name,
    content_type: file.type || 'application/octet-stream',
    ...scopePayload(bucket, prefix),
  });
  const put = await fetch(data.signed_url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!put.ok) throw new Error('Upload failed. Please try again.');
  return data.path;
}

// Uploads a single image and returns its storage path.
export async function uploadImage(file, { bucket = 'laundromat-media', prefix = '' } = {}) {
  if (!file) throw new Error('No file selected');
  if (!file.type || !file.type.startsWith('image/')) throw new Error('Please choose an image file');
  if (file.size > MAX_BYTES) throw new Error('Image must be under 8MB');

  const { data } = await api.post('/uploads?action=sign', {
    bucket,
    filename: file.name,
    content_type: file.type,
    ...scopePayload(bucket, prefix),
  });
  const put = await fetch(data.signed_url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
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
