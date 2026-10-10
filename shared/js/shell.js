import { guard } from './guard.js';
import { mountSignOut } from './session.js';
import { mountNotifications } from './notifications-ui.js';
import { wireInstallButton } from './pwa.js';
import { initTheme, mountThemeToggle } from './theme.js';
import { wirePrefetch } from './prefetch.js';
import { observeEnhancements } from './ui.js';
import './components.js';

function mountNavToggle() {
  const sidebar = document.querySelector('.sidebar');
  const topbar = document.querySelector('.topbar');
  if (!sidebar || !topbar || topbar.querySelector('.nav-toggle')) return null;

  if (!sidebar.id) sidebar.id = 'appSidebar';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-secondary nav-toggle';
  btn.setAttribute('aria-label', 'Open navigation menu');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', sidebar.id);
  btn.innerHTML = '<span aria-hidden="true">☰</span>';
  topbar.insertBefore(btn, topbar.firstChild);

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
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    if (open) {
      const first = sidebar.querySelector('a');
      if (first) first.focus({ preventScroll: true });
    } else if (!desktop.matches) {
      btn.focus({ preventScroll: true });
    }
  };

  const close = () => {
    if (document.body.classList.contains('nav-open')) setOpen(false);
  };

  btn.addEventListener('click', () => setOpen(!document.body.classList.contains('nav-open')));
  backdrop.addEventListener('click', close);
  sidebar.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  desktop.addEventListener?.('change', (e) => { if (e.matches) close(); });
  return { setOpen };
}

export async function mountDashboard({ allowed, sidebarSelector = '.side-nav' } = {}) {
  initTheme();
  const user = await guard(allowed || []);
  if (!user) return null;

  const current = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll(`${sidebarSelector} a`).forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (href.endsWith(current)) {
      a.classList.add('is-active');
      a.setAttribute('aria-current', 'page');
    }
  });

  const slot = document.getElementById('sessionMount');
  if (slot) mountSignOut(slot);
  mountNotifications(document.getElementById('notifMount'));

  const topbar = document.querySelector('.topbar .page-shell') || document.querySelector('.topbar');
  if (topbar && !topbar.querySelector('.install-app-btn')) {
    const actions = document.createElement('div');
    actions.className = 'flex topbar-actions';
    mountThemeToggle(actions);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-secondary install-app-btn';
    btn.hidden = true;
    btn.textContent = 'Install';
    actions.appendChild(btn);
    wireInstallButton(btn);

    const cluster = document.getElementById('sessionMount')?.parentElement;
    const target = (cluster && cluster !== topbar && cluster.classList.contains('flex')) ? cluster : topbar;
    target.appendChild(actions);
  }

  mountNavToggle();
  wirePrefetch();
  observeEnhancements();
  return user;
}
