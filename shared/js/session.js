// Session UI helpers: mount a sign-out control and current-user label.
import { getSession, logout, portalUrl } from './auth-client.js';

export function currentUser() {
  const s = getSession();
  return (s && s.user) || null;
}

export function mountSignOut(container, { redirect = true } = {}) {
  if (!container) return;
  const user = currentUser();
  const wrap = document.createElement('div');
  wrap.className = 'session-control flex';

  const label = document.createElement('span');
  label.className = 'text-sm text-muted';
  label.textContent = user && user.email ? user.email : '';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-secondary';
  btn.textContent = 'Sign out';
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Signing out…';
    await logout();
    if (redirect) location.href = portalUrl();
  });

  wrap.append(label, btn);
  container.appendChild(wrap);
}
