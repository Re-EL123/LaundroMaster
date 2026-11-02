import { getSession, logout, portalUrl, appUrl } from './auth-client.js';
import { escapeHtml } from './format.js';
import { mountNotifications } from './notifications-ui.js';
import { wireInstallButton } from './pwa.js';
import { initTheme, mountThemeToggle } from './theme.js';
import { wirePrefetch } from './prefetch.js';
import { observeEnhancements } from './ui.js';
import { icon } from './icons.js';
import { decorateNav, decorateButtons } from './nav.js';
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
    icon: `${shared}/assets/app-icon.png?v=20`,
  };
}

function mountCustomerNavToggle(host) {
  const nav = host.querySelector('#customerNav');
  const toggle = host.querySelector('.nav-toggle');
  if (!nav || !toggle) return null;

  toggle.innerHTML = icon('menu', { size: 20 });

  const backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.className = 'nav-backdrop';
  backdrop.setAttribute('aria-label', 'Close navigation menu');
  backdrop.setAttribute('tabindex', '-1');
  document.body.appendChild(backdrop);

  const desktop = window.matchMedia('(min-width: 1024px)');

  const setOpen = (open) => {
    document.body.classList.toggle('nav-open', open);
    document.body.classList.toggle('nav-lock', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    if (open) {
      const first = nav.querySelector('a');
      if (first) first.focus({ preventScroll: true });
    } else if (!desktop.matches) {
      toggle.focus({ preventScroll: true });
    }
  };

  const close = () => { if (document.body.classList.contains('nav-open')) setOpen(false); };

  toggle.addEventListener('click', () => setOpen(!document.body.classList.contains('nav-open')));
  backdrop.addEventListener('click', close);
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  desktop.addEventListener?.('change', (e) => { if (e.matches) close(); });
  return { setOpen };
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
    <div class="page-shell app-header-inner">
      <a href="${p.home}" class="brand"><img src="${p.icon}" alt="" width="28" height="28">LaundroMaster</a>
      <nav class="nav" id="customerNav" aria-label="Primary">
        ${link('Discover', p.discover, 'discover')}
        ${link('Orders', p.orders, 'orders')}
        ${link('Favorites', p.favorites, 'favorites')}
        <span id="notifSlot"></span>
        <span id="authSlot"></span>
      </nav>
      <div class="flex header-actions"></div>
      <button type="button" class="btn btn-secondary nav-toggle" aria-label="Open navigation menu" aria-expanded="false" aria-controls="customerNav"></button>
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

  const actions = host.querySelector('.header-actions');
  const installBtn = document.createElement('button');
  installBtn.type = 'button';
  installBtn.className = 'btn btn-secondary install-app-btn';
  installBtn.setAttribute('aria-label', 'Install app');
  installBtn.innerHTML = `${icon('download', { size: 16 })}<span>Install</span>`;
  installBtn.hidden = true;
  wireInstallButton(installBtn);
  actions?.appendChild(installBtn);
  if (actions) mountThemeToggle(actions);

  decorateNav(host, '.nav a:not(.btn)');
  decorateButtons(host);
  mountCustomerNavToggle(host);
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
