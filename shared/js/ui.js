import { escapeHtml, currency } from './format.js';
import { sparkline, barChart as svgBarChart, initCharts } from './charts.js';

const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function skeleton(el, rows = 3, height = 160) {
  if (!el) return;
  el.innerHTML = Array.from({ length: rows })
    .map(() => `<div class="card skeleton" style="height:${height}px"></div>`)
    .join('');
}

export function emptyState(el, message) {
  if (!el) return;
  el.innerHTML = `<p class="text-muted">${escapeHtml(message)}</p>`;
}

export function errorState(el, message) {
  if (!el) return;
  el.innerHTML = `<p class="error">${escapeHtml(message)}</p>`;
}

export function badge(text, tone = 'info') {
  return `<span class="badge badge-${tone}">${escapeHtml(text)}</span>`;
}

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
  node.textContent = message;
  host.appendChild(node);
  setTimeout(() => node.classList.add('toast-in'), 10);
  setTimeout(() => {
    node.classList.remove('toast-in');
    setTimeout(() => node.remove(), 300);
  }, timeout);
}

export function emptyCTA(el, { title, message, href, label } = {}) {
  if (!el) return;
  el.innerHTML = `<div class="card"><div class="card-body" style="align-items:center;text-align:center">
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
      <span class="stepper-dot">${state === 'done' ? '✓' : i + 1}</span>
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

export function statTile({ label, value, hint, tone = '', href, animate = false, format = 'number', spark = null, delta = null } = {}) {
  const numeric = typeof value === 'number' && Number.isFinite(value);
  const valueHtml = animate && numeric
    ? `<span class="stat-value" data-count="${value}" data-format="${escapeHtml(format)}">0</span>`
    : `<span class="stat-value">${escapeHtml(String(value == null ? '' : value))}</span>`;

  const deltaHtml = delta && delta.label
    ? `<span class="stat-delta ${delta.dir === 'down' ? 'is-down' : 'is-up'}">${delta.dir === 'down' ? '▼' : '▲'} ${escapeHtml(String(delta.label))}</span>`
    : '';
  const sparkHtml = (spark && spark.length > 1) ? sparkline(spark, { width: 140, height: 36 }) : '';

  const inner = `<span class="text-muted text-xs">${escapeHtml(label || '')}</span>
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
