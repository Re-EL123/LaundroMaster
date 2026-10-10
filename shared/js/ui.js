import { escapeHtml, currency } from './format.js';

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

export function statTile({ label, value, hint, tone = '', href } = {}) {
  const inner = `<span class="text-muted text-xs">${escapeHtml(label || '')}</span>
    <span class="stat-value">${escapeHtml(String(value == null ? '' : value))}</span>
    ${hint ? `<span class="text-xs text-muted">${escapeHtml(hint)}</span>` : ''}`;
  const safeTone = tone === 'warn' ? 'warning' : tone;
  const cls = `card stat-tile${safeTone ? ` is-${safeTone}` : ''}`;
  return href
    ? `<a class="${cls}" href="${escapeHtml(href)}"><div class="card-body">${inner}</div></a>`
    : `<div class="${cls}"><div class="card-body">${inner}</div></div>`;
}

export function barChart(months = [], { valueKey = 'revenue' } = {}) {
  const max = Math.max(1, ...months.map((m) => Number(m[valueKey]) || 0));
  const cols = months.map((m) => {
    const v = Number(m[valueKey]) || 0;
    const h = Math.round((v / max) * 100);
    return `<div class="bar-col" title="${escapeHtml(m.label)}: ${currency(v)}">
      <div class="bar" style="height:${Math.max(h, 2)}%"></div>
      <span class="bar-label">${escapeHtml(m.label)}</span>
    </div>`;
  }).join('');
  return `<div class="bars">${cols}</div>`;
}

export function confirmAction(message) {
  return typeof window !== 'undefined' && window.confirm(message);
}
