import { guard } from './guard.js';
import { mountSignOut } from './session.js';

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
  return user;
}
