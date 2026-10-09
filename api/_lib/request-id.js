export function setRequestId(req, res) {
  const id = (req.headers['x-request-id'] || crypto?.randomUUID?.() || Math.random().toString(36)).toString();
  if (process.env) process.env.REQUEST_ID = id;
  return id;
}
