import { getSession, logout, portalUrl, appUrl } from './auth-client.js';
import { escapeHtml } from './format.js';
import { mountNotifications } from './notifications-ui.js';
import { wireInstallButton } from './pwa.js';
import { initTheme, mountThemeToggle } from './theme.js';
import { wirePrefetch } from './prefetch.js';
import { observeEnhancements } from './ui.js';
import { cacheClear } from './cache.js';
import './components.js';

function customerPaths() {
  const inPages = /\/pages\//.test(location.pathname);
  const shared = inPages ? '../../../shared' : '../../shared';
  return {
    home: inPages ? '../index.html' : './index.html',
    discover: inPages ? 'discover.html' : './pages/discover.html',
    orders: inPages ? 'orders.html' : './pages/orders.html',
    favorites: inPages ? 'favorites.html' : './pages/favorites.html',
    profile: inPages ? 'profile.html' : './pages/profile.html',
    icon: `${shared}/assets/app-icon.png?v=10`,
  };
}

export function mountCustomerHeader(active = '') {
  initTheme();
  const host = document.getElementById('appHeader');
  if (!host) return;
  const p = customerPaths();
  const session = getSession();
  const user = session && session.user;

  const link = (label, href, key) =>
    `<a href="${href}"${active === key ? ' class="is-active" aria-current="page"' : ''}>${label}</a>`;

  host.innerHTML = `
    <div class="page-shell flex justify-between">
      <a href="${p.home}" class="brand"><img src="${p.icon}" alt="" width="28" height="28">LaundroMaster</a>
      <nav class="nav flex" aria-label="Primary">
        ${link('Discover', p.discover, 'discover')}
        ${link('Orders', p.orders, 'orders')}
        ${link('Favorites', p.favorites, 'favorites')}
        <span id="notifSlot"></span>
        <span id="authSlot"></span>
      </nav>
    </div>`;

  if (user) mountNotifications(document.getElementById('notifSlot'));

  const slot = host.querySelector('#authSlot');
  if (user) {
    slot.className = 'flex';
    slot.innerHTML = `
      ${link('Profile', p.profile, 'profile')}
      <button type="button" class="btn btn-secondary" id="signOutBtn">Sign out</button>`;
    slot.querySelector('#signOutBtn').addEventListener('click', async (e) => {
      e.target.disabled = true;
      cacheClear();
      await logout();
      location.href = p.home;
    });
  } else {
    slot.innerHTML = `<a class="btn btn-primary" href="${portalUrl()}">Sign in</a>`;
  }

  const installBtn = document.createElement('button');
  installBtn.type = 'button';
  installBtn.className = 'btn btn-secondary';
  installBtn.textContent = 'Install';
  installBtn.hidden = true;
  wireInstallButton(installBtn);

  const actions = document.createElement('div');
  actions.className = 'flex header-actions';
  actions.appendChild(installBtn);
  mountThemeToggle(actions);
  host.querySelector('.page-shell')?.appendChild(actions);

  wirePrefetch();
  observeEnhancements();
}

export function requireCustomer() {
  const session = getSession();
  if (!session || !session.access_token) {
    location.href = `${portalUrl()}?next=${encodeURIComponent(location.pathname + location.search)}`;
    return null;
  }
  const role = session.role;
  if (role && role !== 'customer' && role !== 'admin' && role !== 'super_admin') {
    location.href = appUrl('owner');
    return null;
  }
  return session;
}

export function escape(value) {
  return escapeHtml(value);
}
