// Session UI helpers: mount an account menu and expose the current user.
import { getSession, portalUrl } from './auth-client.js';
import { mountAccountMenu } from './account.js';

export function currentUser() {
  const s = getSession();
  return (s && s.user) || null;
}

/**
 * Mounts the account menu (avatar, name, role, links, sign out) into `container`.
 * Replaces the older email + sign-out button pair so the owner and admin shells
 * match the customer header.
 */
export function mountSignOut(container, { redirect = true, links = [] } = {}) {
  if (!container) return null;
  // No destination means "sign out and stay put" — the caller owns the redirect.
  return mountAccountMenu(container, { links, signOutTo: redirect ? portalUrl() : null });
}
