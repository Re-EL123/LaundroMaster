import { escapeHtml, currency } from './format.js';
import { sparkline, barChart as svgBarChart, initCharts } from './charts.js';
import { icon, mountIcons } from './icons.js';
import { decorateAll } from './nav.js';

const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function skeleton(el, rows = 3, height = 160) {
  if (!el) return;
  el.innerHTML = Array.from({ length: rows })
    .map(() => `<div class="card skeleton" style="height:${height}px"></div>`)
    .join('');
}

export function emptyState(el, message, { icon: iconName = 'inbox' } = {}) {
  if (!el) return;
  el.innerHTML = `<div class="empty-state">${icon(iconName, { size: 30 })}<p class="text-muted">${escapeHtml(message)}</p></div>`;
}

export function errorState(el, message) {
  if (!el) return;
  el.innerHTML = `<div class="empty-state is-error">${icon('alert-triangle', { size: 30 })}<p class="error">${escapeHtml(message)}</p></div>`;
}

export function badge(text, tone = 'info') {
  return `<span class="badge badge-${tone}">${escapeHtml(text)}</span>`;
}

const TOAST_ICON = { info: 'info', success: 'circle-check', warning: 'alert-triangle', error: 'circle-alert', danger: 'circle-alert' };

export function toast(message, tone = 'info', timeout = 4000) {
  let host = document.getElementById('toastHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toastHost';
    host.className = 'toast-host';
    document.body.appendChild(host);
  }
  const node = document.createElement('div');
  node.className = `toast toast-${tone}`;
  node.setAttribute('role', 'status');
  node.innerHTML = icon(TOAST_ICON[tone] || 'info', { size: 16 });
  const span = document.createElement('span');
  span.textContent = message;
  node.appendChild(span);
  host.appendChild(node);
  setTimeout(() => node.classList.add('toast-in'), 10);
  setTimeout(() => {
    node.classList.remove('toast-in');
    setTimeout(() => node.remove(), 300);
  }, timeout);
}

export function emptyCTA(el, { title, message, href, label, icon: iconName = 'inbox' } = {}) {
  if (!el) return;
  el.innerHTML = `<div class="card"><div class="card-body empty-cta">
    ${icon(iconName, { size: 34 })}
    ${title ? `<h3 class="card-title">${escapeHtml(title)}</h3>` : ''}
    ${message ? `<p class="text-muted">${escapeHtml(message)}</p>` : ''}
    ${href && label ? `<a class="btn btn-primary" href="${escapeHtml(href)}">${escapeHtml(label)}</a>` : ''}
  </div></div>`;
}

const FLOW_STEPS = [
  { key: 'placed', label: 'Placed', statuses: ['pending_payment', 'pending_acceptance'] },
  { key: 'accepted', label: 'Accepted', statuses: ['accepted', 'pickup_scheduled'] },
  { key: 'collected', label: 'Collected', statuses: ['collected'] },
  { key: 'washing', label: 'Washing', statuses: ['washing', 'drying', 'ironing'] },
  { key: 'ready', label: 'Ready', statuses: ['ready'] },
  { key: 'delivery', label: 'On the way', statuses: ['out_for_delivery'] },
  { key: 'completed', label: 'Delivered', statuses: ['completed'] },
];

export function statusStepper(status) {
  const terminal = ['cancelled', 'rejected', 'payment_failed'].includes(status);
  let current = 0;
  FLOW_STEPS.forEach((step, i) => { if (step.statuses.includes(status)) current = i; });
  const refundNote = status === 'refund_pending' ? '<p class="text-xs text-muted">Refund requested — we will update you soon.</p>' : '';
  const steps = FLOW_STEPS.map((step, i) => {
    const state = terminal ? 'cancelled' : i < current ? 'done' : i === current ? 'current' : 'upcoming';
    return `<div class="stepper-step is-${state}">
      <span class="stepper-dot">${state === 'done' ? icon('check', { size: 12 }) : i + 1}</span>
      <span class="stepper-label">${escapeHtml(step.label)}</span>
    </div>`;
  }).join('');
  return `<div class="stepper${terminal ? ' is-cancelled' : ''}">${steps}</div>${refundNote}`;
}

export function moneyBreakdown(rows = [], { total } = {}) {
  const body = rows.map((r) => `<div class="breakdown-row${r.sub ? ' is-sub' : ''}">
    <span>${escapeHtml(r.label)}</span><span>${r.value}</span></div>`).join('');
  const totalRow = total != null
    ? `<div class="breakdown-row is-total"><span>Total</span><span>${total}</span></div>`
    : '';
  return `<div class="breakdown">${body}${totalRow}</div>`;
}

export function statTile({ label, value, hint, tone = '', href, animate = false, format = 'number', spark = null, delta = null, icon: iconName = null } = {}) {
  const numeric = typeof value === 'number' && Number.isFinite(value);
  const valueHtml = animate && numeric
    ? `<span class="stat-value" data-count="${value}" data-format="${escapeHtml(format)}">0</span>`
    : `<span class="stat-value">${escapeHtml(String(value == null ? '' : value))}</span>`;

  const deltaHtml = delta && delta.label
    ? `<span class="stat-delta ${delta.dir === 'down' ? 'is-down' : 'is-up'}">${delta.dir === 'down' ? '▼' : '▲'} ${escapeHtml(String(delta.label))}</span>`
    : '';
  const sparkHtml = (spark && spark.length > 1) ? sparkline(spark, { width: 140, height: 36 }) : '';
  const iconHtml = iconName ? `<span class="stat-icon" aria-hidden="true">${icon(iconName, { size: 18 })}</span>` : '';

  const inner = `${iconHtml}<span class="text-muted text-xs">${escapeHtml(label || '')}</span>
    <span class="stat-figure">${valueHtml}${deltaHtml}</span>
    ${sparkHtml}
    ${hint ? `<span class="text-xs text-muted">${escapeHtml(hint)}</span>` : ''}`;

  const safeTone = tone === 'warn' ? 'warning' : tone;
  const cls = `card stat-tile${safeTone ? ` is-${safeTone}` : ''}`;
  return href
    ? `<a class="${cls}" href="${escapeHtml(href)}"><div class="card-body">${inner}</div></a>`
    : `<div class="${cls}"><div class="card-body">${inner}</div></div>`;
}

// Alias for backward compatibility with earlier callers.
export const barChart = svgBarChart;

function paintCount(el, target, format) {
  const fmt = (n) => (format === 'currency'
    ? currency(n)
    : Math.round(n).toLocaleString('en-ZA'));
  if (reduceMotion() || !Number.isFinite(target) || target === 0) {
    el.textContent = fmt(target || 0);
    return;
  }
  const duration = 700;
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(target * eased);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function animateCounts(root = document) {
  root.querySelectorAll('[data-count]').forEach((el) => {
    if (el.dataset.counted) return;
    el.dataset.counted = '1';
    paintCount(el, Number(el.dataset.count) || 0, el.dataset.format || 'number');
  });
}

export function initReveal(root = document) {
  const items = root.querySelectorAll('.reveal:not([data-revealed])');
  if (!items.length) return;
  if (reduceMotion() || typeof IntersectionObserver !== 'function') {
    items.forEach((el) => { el.dataset.revealed = '1'; el.classList.add('is-visible'); });
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        entry.target.dataset.revealed = '1';
        io.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -40px 0px', threshold: 0.05 });
  items.forEach((el) => io.observe(el));
}

let observer = null;
export function observeEnhancements() {
  if (observer || typeof MutationObserver !== 'function' || !document.body) return;
  let pending = false;
  observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      mountIcons();
      decorateAll();
      animateCounts();
      initCharts();
      initReveal();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

export function confirmAction(message) {
  return typeof window !== 'undefined' && window.confirm(message);
}

// Accessible modal dialog. `body` may be an HTML string or a Node. `actions`
// is a list of { label, variant, id, close, onClick(handle) }; a button stays
// open when close===false. Returns a handle: { overlay, dialog, body, footer, close }.
export function openModal({ title, body, actions = [], size = '', dismissible = true, onClose } = {}) {
  const previouslyFocused = typeof document !== 'undefined' ? document.activeElement : null;

  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';

  const dialog = document.createElement('div');
  dialog.className = `modal${size ? ` modal-${size}` : ''}`;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  if (title) dialog.setAttribute('aria-label', title);

  const header = document.createElement('div');
  header.className = 'modal-header';
  const titleEl = document.createElement('h3');
  titleEl.className = 'modal-title';
  titleEl.textContent = title || '';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.innerHTML = icon('x', { size: 18 });
  if (title) header.appendChild(titleEl);
  if (dismissible) header.appendChild(closeBtn);

  const bodyEl = document.createElement('div');
  bodyEl.className = 'modal-body';
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body instanceof Node) bodyEl.appendChild(body);

  const footer = document.createElement('div');
  footer.className = 'modal-footer';

  if (title || dismissible) dialog.appendChild(header);
  dialog.appendChild(bodyEl);
  dialog.appendChild(footer);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  document.body.classList.add('modal-open');

  const handle = { overlay, dialog, body: bodyEl, footer, close };

  function close() {
    document.removeEventListener('keydown', onKey);
    overlay.classList.remove('is-open');
    const remove = () => {
      overlay.remove();
      if (!document.querySelector('.modal-backdrop')) document.body.classList.remove('modal-open');
    };
    if (reduceMotion()) remove();
    else setTimeout(remove, 180);
    onClose?.();
    if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus({ preventScroll: true });
  }

  function onKey(e) {
    if (e.key === 'Escape' && dismissible) { e.preventDefault(); close(); }
  }

  closeBtn.addEventListener('click', close);
  if (dismissible) overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);

  actions.forEach((a) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn btn-${a.variant || 'secondary'}`;
    if (a.id) b.id = a.id;
    b.textContent = a.label;
    b.addEventListener('click', () => {
      const res = a.onClick ? a.onClick(handle) : undefined;
      if (a.close !== false && res !== false) close();
    });
    footer.appendChild(b);
  });
  if (!actions.length) footer.remove();

  requestAnimationFrame(() => {
    overlay.classList.add('is-open');
    const focusable = dialog.querySelector('input, select, textarea, button:not(.modal-close)') || (!dismissible ? dialog : closeBtn);
    if (focusable) focusable.focus({ preventScroll: true });
  });

  return handle;
}
