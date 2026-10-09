import { randomUUID } from 'node:crypto';

export function newRequestId(req) {
  const header = req && req.headers && req.headers['x-request-id'];
  return (header || randomUUID()).toString();
}
