export class ApiError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// ApiError messages are written for people. Anything else that reaches here is a
// database or driver fault whose text describes our schema, so it is replaced
// with a generic message and reported as INTERNAL.
export function errorEnvelope(err) {
  const internal = !(err instanceof ApiError);
  return {
    ok: false,
    data: null,
    error: {
      code: internal ? 'INTERNAL' : (err.code || 'ERROR'),
      message: internal ? 'Something went wrong on our side. Please try again.' : err.message,
    },
    meta: { requestId: 'req' },
  };
}

export function successEnvelope(data, meta = {}) {
  return { ok: true, data, error: null, meta: { requestId: 'req', ...meta } };
}
