import { escapeHtml } from './format.js';

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
