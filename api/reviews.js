import { createHandler } from './_lib/handler.js';
import { successEnvelope } from './_lib/errors.js';

export default createHandler(async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json(successEnvelope({ service: 'reviews', ok: true }));
  }
  return res.status(405).json(successEnvelope(null));
});
