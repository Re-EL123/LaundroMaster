// Page-level role guard. Server-side authorisation is still authoritative.
import { me, homeForRole, portalUrl } from './auth-client.js';

export async function guard(allowed = []) {
  const user = await me();
  if (!user) {
    location.href = portalUrl();
    return null;
  }
  if (allowed.length && !allowed.includes(user.role)) {
    location.href = homeForRole(user.role);
    return null;
  }
  return user;
}
