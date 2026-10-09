export class ApiError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function errorEnvelope(err) {
  return {
    ok: false,
    data: null,
    error: { code: err.code || 'INTERNAL', message: err.message || 'Error' },
    meta: { requestId: 'req' },
  };
}

export function successEnvelope(data, meta = {}) {
  return { ok: true, data, error: null, meta: { requestId: 'req', ...meta } };
}
