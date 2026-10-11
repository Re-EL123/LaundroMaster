// Page-level role guard. Server-side authorisation is still authoritative.
import { getSession, me, clearSession, homeForRole, portalUrl } from './auth-client.js';

const VALIDATED_KEY = 'lm_auth_validated';
const VALIDATE_TTL = 60000;

function lastValidated() {
  try { return Number(sessionStorage.getItem(VALIDATED_KEY)) || 0; } catch { return 0; }
}

// Resolves instantly from the cached session so the shell can paint without
// waiting on the network. The token/role are revalidated in the background
// (throttled) and the user is redirected only if the session proves invalid.
export function guard(allowed = []) {
  const session = getSession();
  if (!session || !session.access_token) {
    location.href = portalUrl();
    return null;
  }

  const role = session.role;
  if (allowed.length && role && !allowed.includes(role)) {
    location.href = homeForRole(role);
    return null;
  }

  if (Date.now() - lastValidated() > VALIDATE_TTL) {
    me()
      .then((fresh) => {
        if (!fresh) { clearSession(); location.href = portalUrl(); return; }
        try { sessionStorage.setItem(VALIDATED_KEY, String(Date.now())); } catch { /* ignore */ }
        if (allowed.length && !allowed.includes(fresh.role)) location.href = homeForRole(fresh.role);
      })
      .catch(() => { /* network hiccup: keep the cached view */ });
  }

  return { user: session.user || {}, roles: role ? [role] : [], role };
}
