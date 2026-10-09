import { successEnvelope, errorEnvelope } from './_lib/errors.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      return res.status(200).json(successEnvelope({ ok: true }));
    }
    return res.status(405).json(errorEnvelope({ code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(err));
  }
}
