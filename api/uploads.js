import { createHandler } from './_lib/handler.js';
import { successEnvelope, errorEnvelope, ApiError } from './_lib/errors.js';
import { adminClient } from './_lib/supabase-admin.js';
import { query, body } from './_lib/req.js';
import { requireUser } from './_lib/auth.js';

const ALLOWED_BUCKETS = [
  'avatars',
  'laundromat-media',
  'verification-documents',
  'booking-attachments',
  'receipts',
];

export default createHandler(async function handler(req, res) {
  const q = query(req);
  const supa = adminClient();
  if (!supa) return res.status(503).json(errorEnvelope(new ApiError('NOT_CONFIGURED', 'Supabase not configured', 503)));

  const ctx = await requireUser(req);

  if (req.method === 'POST') {
    const action = q.action || '';
    if (action !== 'sign') return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));

    const input = body(req);
    const bucket = input.bucket;
    if (!ALLOWED_BUCKETS.includes(bucket)) {
      return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Bucket not allowed')));
    }
    const ext = (input.filename || '').split('.').pop() || 'bin';
    const path = input.path || `${ctx.user.id}/${Date.now()}.${ext}`;

    const { data, error } = await supa.storage.from(bucket).createSignedUploadUrl(path);
    if (error) return res.status(400).json(errorEnvelope(error));
    return res.status(201).json(successEnvelope({ bucket, path, token: data.token, signed_url: data.signedUrl }));
  }

  if (req.method === 'GET') {
    const bucket = q.bucket;
    const path = q.path;
    if (!ALLOWED_BUCKETS.includes(bucket) || !path) {
      return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'bucket and path required')));
    }
    const { data, error } = await supa.storage.from(bucket).createSignedUrl(path, 60 * 10);
    if (error) return res.status(400).json(errorEnvelope(error));
    return res.status(200).json(successEnvelope({ url: data.signedUrl }));
  }

  return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
});
