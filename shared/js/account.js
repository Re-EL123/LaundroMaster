// Account menu: the one place the signed-in person sees who they are and how
// to leave. Shared by the owner, admin and customer headers so an avatar, a
// name and a sign-out path look and behave the same everywhere.
import { getSession, getProfile, logout, portalUrl } from './auth-client.js';
import { cacheClear } from './cache.js';
import { icon } from './icons.js';
import { escapeHtml } from './format.js';
import { avatar } from './avatar.js';

const ROLE_LABELS = {
  owner: 'Owner',
  manager: 'Manager',
  staff: 'Staff',
  admin: 'Administrator',
  super_admin: 'Super admin',
  customer: 'Customer',
};

// Session `user` only carries id/email; the cached profile carries the name and
// photo. Prefer the profile and fall back to the email's local part, so the menu
// never renders as an empty chip.
function identity() {
  const session = getSession() || {};
  const user = session.user || {};
  const profile = getProfile() || {};
  const email = profile.email || user.email || '';
  const name = profile.full_name || user.full_name || (email ? email.split('@')[0] : '') || 'Account';
  return {
    name,
    email,
    avatarPath: profile.avatar_path || user.avatar_path || null,
    role: session.role || profile.role || null,
  };
}

function roleLabel(role) {
  return ROLE_LABELS[role] || (role ? String(role).replace(/_/g, ' ') : '');
}

/**
 * Markup for the account menu. Pass `links` as `{ label, href, icon }` items to
 * sit above Sign out. Reads the current session/profile itself so every caller
 * renders the same identity without threading it through.
 */
export function accountMenuHTML({ links = [], label = 'Account menu' } = {}) {
  const { name, email, avatarPath, role } = identity();
  const linksHtml = links.map((l) => `<a class="account-item" role="menuitem" href="${escapeHtml(l.href)}">${icon(l.icon || 'user', { size: 16 })}<span>${escapeHtml(l.label)}</span></a>`).join('');

  return `<div class="account-menu">
    <button type="button" class="account-trigger" aria-haspopup="menu" aria-expanded="false" aria-label="${escapeHtml(label)}">
      ${avatar({ name, path: avatarPath, size: 34 })}
      <span class="account-trigger-text">
        <span class="identity-name">${escapeHtml(name)}</span>
        <span class="identity-meta">${escapeHtml(roleLabel(role) || email)}</span>
      </span>
      ${icon('chevron-down', { size: 16, className: 'account-caret' })}
    </button>
    <div class="account-panel" role="menu" hidden>
      <div class="account-head">
        ${avatar({ name, path: avatarPath, size: 44, alt: name })}
        <span class="identity-text">
          <span class="identity-name">${escapeHtml(name)}</span>
          ${email ? `<span class="identity-meta">${escapeHtml(email)}</span>` : ''}
        </span>
      </div>
      ${linksHtml}
      <button type="button" class="account-item account-signout" role="menuitem" data-account-signout>${icon('log-out', { size: 16 })}<span>Sign out</span></button>
    </div>
  </div>`;
}

/**
 * Wires up a rendered menu. Closes on outside click and Escape (returning focus
 * to the trigger), supports Up/Down between items, and signs out. Pass
 * `signOutTo: null` to sign out without navigating, or `onSignOut` to take over
 * the whole flow.
 */
export function wireAccountMenu(root, { signOutTo = portalUrl(), onSignOut = null } = {}) {
  if (!root) return null;
  const trigger = root.querySelector('.account-trigger');
  const panel = root.querySelector('.account-panel');
  if (!trigger || !panel) return null;

  const items = () => [...panel.querySelectorAll('[role="menuitem"]')];

  const setOpen = (open) => {
    panel.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    if (open) {
      const first = items()[0];
      if (first) first.focus({ preventScroll: true });
    }
  };

  const close = () => {
    if (panel.hidden) return;
    setOpen(false);
    trigger.focus({ preventScroll: true });
  };

  trigger.addEventListener('click', () => setOpen(panel.hidden));
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
    }
  });

  panel.addEventListener('keydown', (e) => {
    const list = items();
    const index = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      list[Math.min(list.length - 1, index + 1)]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      list[Math.max(0, index - 1)]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      list[list.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      close();
    }
  });

  document.addEventListener('click', (e) => {
    if (!root.contains(e.target) && !panel.hidden) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) close();
  });

  panel.querySelector('[data-account-signout]').addEventListener('click', async () => {
    const btn = panel.querySelector('[data-account-signout]');
    btn.disabled = true;
    cacheClear();
    if (onSignOut) return onSignOut();
    await logout();
    if (signOutTo) location.href = signOutTo;
    return undefined;
  });

  return { setOpen, close };
}

/** Renders and wires the account menu into `container` in one call. */
export function mountAccountMenu(container, opts = {}) {
  if (!container) return null;
  container.innerHTML = accountMenuHTML(opts);
  return wireAccountMenu(container.firstElementChild, opts);
}
