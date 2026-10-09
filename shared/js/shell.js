import { guard } from './guard.js';
import { mountSignOut } from './session.js';
import { mountNotifications } from './notifications-ui.js';
import { wireInstallButton } from './pwa.js';

export async function mountDashboard({ allowed, sidebarSelector = '.side-nav' } = {}) {
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
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-secondary install-app-btn';
    btn.hidden = true;
    btn.textContent = 'Install';
    topbar.appendChild(btn);
    wireInstallButton(btn);
  }
  return user;
}
