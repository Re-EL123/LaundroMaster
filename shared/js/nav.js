// Progressive UI decoration: Lucide icons for navigation + action buttons,
// plus a collapsible desktop sidebar with hover tooltips.
import { icon } from './icons.js';
import { escapeHtml } from './format.js';

const COLLAPSE_KEY = 'lm_sidebar_collapsed';

// Sidebar / top-nav icon per label (falls back to the href's first word).
const NAV_ICONS = {
  dashboard: 'layout-dashboard', overview: 'layout-dashboard', home: 'house',
  bookings: 'calendar-days', booking: 'calendar-days', orders: 'package', order: 'package',
  services: 'sparkles', service: 'sparkles',
  earnings: 'trending-up', revenue: 'trending-up',
  payouts: 'banknote', payout: 'banknote',
  plan: 'layers', plans: 'layers', subscription: 'layers',
  promotions: 'tag', promotion: 'tag',
  ads: 'megaphone', ad: 'megaphone',
  settings: 'settings', setting: 'settings',
  laundromats: 'store', laundromat: 'store', stores: 'store',
  verifications: 'badge-check', verification: 'badge-check',
  users: 'users', user: 'user', customers: 'users',
  commissions: 'percent', commission: 'percent',
  payments: 'credit-card', payment: 'credit-card',
  refunds: 'rotate-ccw', refund: 'rotate-ccw',
  audit: 'scroll-text', activity: 'scroll-text', log: 'scroll-text',
  discover: 'compass', explore: 'compass', browse: 'compass',
  favorites: 'heart', favourites: 'heart', favorite: 'heart',
  profile: 'user', account: 'user',
  notifications: 'bell', messages: 'message-circle', chat: 'message-circle',
  support: 'life-buoy', help: 'life-buoy',
};

function pickNavIcon(label, href) {
  const key = String(label || '').trim().toLowerCase();
  if (NAV_ICONS[key]) return NAV_ICONS[key];
  const base = String(href || '').split(/[?#]/)[0].split('/').pop().replace(/\.html$/, '').toLowerCase();
  if (NAV_ICONS[base]) return NAV_ICONS[base];
  const first = base.split('-')[0];
  if (NAV_ICONS[first]) return NAV_ICONS[first];
  return null;
}

// Wraps a link's label and prepends an icon so it can collapse to icon-only.
function decorateLink(a) {
  if (a.dataset.navReady) return;
  const label = (a.textContent || '').trim();
  const name = pickNavIcon(label, a.getAttribute('href'));
  a.dataset.navReady = '1';
  if (!name || !label) return;
  a.classList.add('nav-item');
  a.setAttribute('data-label', label);
  a.innerHTML = `<span class="nav-icon">${icon(name, { size: 18 })}</span><span class="nav-label">${escapeHtml(label)}</span>`;
}

/** Adds icons to sidebar (or top-nav) links. */
export function decorateNav(root = document, selector = '.side-nav a') {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  root.querySelectorAll(selector).forEach(decorateLink);
}

function iconSwap(btn, name) {
  const svg = btn.querySelector('svg');
  if (svg) svg.outerHTML = icon(name, { size: 18 });
}

/** Adds a desktop-only collapse toggle to the sidebar and restores its state. */
export function mountSidebarCollapse() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar || sidebar.querySelector('.sidebar-collapse')) return null;

  const brand = sidebar.querySelector('.brand');
  if (brand && !brand.querySelector('.brand-label')) {
    const img = brand.querySelector('img');
    const label = (brand.textContent || '').trim();
    brand.innerHTML = `${img ? img.outerHTML : ''}<span class="brand-label">${escapeHtml(label)}</span>`;
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sidebar-collapse';
  btn.innerHTML = `${icon('chevrons-left', { size: 18 })}<span class="nav-label">Collapse</span>`;
  sidebar.appendChild(btn);

  const apply = (collapsed) => {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    btn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    btn.setAttribute('aria-expanded', String(!collapsed));
    iconSwap(btn, collapsed ? 'chevrons-right' : 'chevrons-left');
    const lbl = btn.querySelector('.nav-label');
    if (lbl) lbl.textContent = collapsed ? 'Expand' : 'Collapse';
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }
  };

  let collapsed = false;
  try { collapsed = localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { /* ignore */ }
  apply(collapsed);

  btn.addEventListener('click', () => {
    collapsed = !collapsed;
    apply(collapsed);
  });

  return { apply, isCollapsed: () => collapsed };
}

// Action buttons get a leading icon based on their label, when one fits.
const ACTION_ICONS = [
  [/\b(save|update|apply|confirm|approve|accept|verify|complete)\b/i, 'check'],
  [/\b(create|add|new|invite|upload)\b/i, 'plus'],
  [/\b(delete|remove|discard|reject|decline)\b/i, 'trash-2'],
  [/\b(edit|change|manage)\b/i, 'pencil'],
  [/\b(cancel|close|dismiss)\b/i, 'x'],
  [/\b(search)\b/i, 'search'],
  [/\b(filter|sort)\b/i, 'filter'],
  [/\b(export|download)\b/i, 'download'],
  [/\b(refresh|reload|retry|sync)\b/i, 'refresh-cw'],
  [/\b(sign out|log out|logout)\b/i, 'log-out'],
  [/\b(install)\b/i, 'download'],
  [/\b(pay|checkout|purchase|buy)\b/i, 'credit-card'],
  [/\b(send|submit|message|reply)\b/i, 'send'],
  [/\b(back)\b/i, 'arrow-left'],
  [/\b(next|continue|view|open|details)\b/i, 'arrow-right'],
  [/\b(promote|promotion|feature)\b/i, 'megaphone'],
  [/\b(payout|withdraw|cash out)\b/i, 'banknote'],
  [/\b(share)\b/i, 'share-2'],
];

/** Adds a leading icon to action buttons whose label has a natural match. */
export function decorateButtons(root = document) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  root.querySelectorAll('.btn').forEach((btn) => {
    if (btn.dataset.iconized || btn.dataset.noIcon != null) return;
    if (btn.querySelector('.icon')) { btn.dataset.iconized = '1'; return; }
    if (btn.classList.contains('theme-toggle') || btn.classList.contains('nav-toggle')
      || btn.classList.contains('notif-btn') || btn.classList.contains('modal-close')
      || btn.classList.contains('sidebar-collapse') || btn.classList.contains('btn-icon')) return;
    const text = (btn.textContent || '').trim();
    if (!text || text.length > 48) return;
    let name = null;
    for (const [re, ic] of ACTION_ICONS) { if (re.test(text)) { name = ic; break; } }
    if (!name) return;
    btn.insertAdjacentHTML('afterbegin', icon(name, { size: 16 }));
    btn.dataset.iconized = '1';
  });
}

/** Runs every decoration pass over the given root. */
export function decorateAll(root = document) {
  decorateNav(root);
  decorateButtons(root);
}
