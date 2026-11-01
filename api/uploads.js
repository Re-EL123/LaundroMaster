import { randomUUID } from 'node:crypto';
import { createHandler } from './_lib/handler.js';
import { successEnvelope, errorEnvelope, ApiError } from './_lib/errors.js';
import { adminClient } from './_lib/supabase-admin.js';
import { query, body } from './_lib/req.js';
import { requireUser, isAdmin } from './_lib/auth.js';

const PUBLIC_BUCKETS = new Set(['avatars', 'laundromat-media']);

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const DOC_TYPES = new Set([
  'application/pdf', 'text/plain', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const BUCKETS = {
  avatars: { type: 'user', contentType: IMAGE_TYPES, ext: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'heic', 'heif'] },
  'laundromat-media': { type: 'laundromat', contentType: new Set([...IMAGE_TYPES, ...VIDEO_TYPES]), ext: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'heic', 'heif', 'mp4', 'webm', 'mov'] },
  'verification-documents': { type: 'laundromat', contentType: new Set([...DOC_TYPES, ...IMAGE_TYPES]), ext: ['pdf', 'txt', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'heic'] },
  'booking-attachments': { type: 'user', contentType: new Set([...DOC_TYPES, ...IMAGE_TYPES]), ext: ['pdf', 'txt', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'webp'] },
  receipts: { type: 'user', contentType: new Set([...DOC_TYPES, ...IMAGE_TYPES]), ext: ['pdf', 'png', 'jpg', 'jpeg', 'webp'] },
};

function extensionOf(filename, allowed) {
  const raw = String(filename || '').split('.').pop() || '';
  const ext = raw.toLowerCase().replace(/^jpeg$/, 'jpg');
  return allowed.includes(ext) ? ext : allowed[0];
}

function contentTypeAllowed(rule, contentType) {
  if (!contentType) return true; // client may rely on storage defaults
  return rule.contentType.has(String(contentType).toLowerCase());
}

async function canManageLaundromat(supa, ctx, laundromatId) {
  if (!laundromatId) return false;
  if (isAdmin(ctx)) return true;
  const { data: owned } = await supa.from('laundromats')
    .select('id').eq('id', laundromatId).eq('owner_id', ctx.user.id).maybeSingle();
  if (owned) return true;
  const { data: member } = await supa.from('laundromat_members')
    .select('id').eq('laundromat_id', laundromatId).eq('user_id', ctx.user.id)
    .eq('invite_status', 'active').maybeSingle();
  return Boolean(member);
}

/** Derive the effective scope for a bucket, rejecting anything the caller cannot write. */
async function resolveScope(supa, ctx, bucket, rule, input) {
  if (rule.type === 'user') return ctx.user.id;

  // Admin-uploaded ad media lives under a shared "ads" prefix.
  const requested = String(input.laundromat_id || input.scope || '').trim();
  if (requested === 'ads' && isAdmin(ctx)) return 'ads';

  let laundromatId = requested;
  if (!laundromatId && input.path) {
    // Back-compat: callers used to send `${laundromatId}/...` or `${userId}/...`.
    laundromatId = String(input.path).split('/')[0];
  }
  if (!laundromatId) return null;
  const allowed = await canManageLaundromat(supa, ctx, laundromatId);
  return allowed ? laundromatId : null;
}

async function canReadPath(supa, ctx, bucket, path) {
  if (isAdmin(ctx)) return true;
  if (bucket === 'verification-documents') {
    const laundromatId = String(path || '').split('/')[0];
    return canManageLaundromat(supa, ctx, laundromatId);
  }
  // booking-attachments / receipts are per-user.
  return String(path || '').startsWith(`${ctx.user.id}/`);
}

export default createHandler(async function handler(req, res) {
  const q = query(req);
  const supa = adminClient();
  if (!supa) return res.status(503).json(errorEnvelope(new ApiError('NOT_CONFIGURED', 'Supabase not configured', 503)));

  const ctx = await requireUser(req);

  if (req.method === 'POST') {
    if ((q.action || '') !== 'sign') {
      return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
    }

    const input = body(req);
    const bucket = String(input.bucket || '');
    const rule = BUCKETS[bucket];
    if (!rule) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Bucket not allowed')));

    if (!contentTypeAllowed(rule, input.content_type || input.contentType)) {
      return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'That file type is not allowed for this upload')));
    }

    const scope = await resolveScope(supa, ctx, bucket, rule, input);
    if (!scope) {
      return res.status(403).json(errorEnvelope(new ApiError('FORBIDDEN', 'You cannot upload to this location', 403)));
    }

    // Always generate the object path server-side: callers must never be able
    // to overwrite another tenant's files via `path` or `x-upsert`.
    const ext = extensionOf(input.filename, rule.ext);
    const path = `${scope}/${randomUUID()}.${ext}`;

    const { data, error } = await supa.storage.from(bucket).createSignedUploadUrl(path);
    if (error) return res.status(400).json(errorEnvelope(error));
    return res.status(201).json(successEnvelope({
      bucket,
      path,
      token: data.token,
      signed_url: data.signedUrl,
      public_url: PUBLIC_BUCKETS.has(bucket)
        ? `${String(process.env.SUPABASE_URL || '').replace(/\/$/, '')}/storage/v1/object/public/${bucket}/${path}`
        : null,
    }));
  }

  if (req.method === 'GET') {
    const bucket = String(q.bucket || '');
    const path = String(q.path || '');
    const rule = BUCKETS[bucket];
    if (!rule || !path) {
      return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'bucket and path required')));
    }
    if (!(await canReadPath(supa, ctx, bucket, path))) {
      return res.status(403).json(errorEnvelope(new ApiError('FORBIDDEN', 'Forbidden', 403)));
    }
    const { data, error } = await supa.storage.from(bucket).createSignedUrl(path, 60 * 10);
    if (error) return res.status(400).json(errorEnvelope(error));
    return res.status(200).json(successEnvelope({ url: data.signedUrl }));
  }

  return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
});
