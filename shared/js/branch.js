// Branch (multi-laundromat) context for the owner app.
//
// An owner may run several branches. Every owner page can be scoped to one of
// them through a `?laundromat=<id>` URL parameter (so a view can be shared or
// bookmarked) backed by a remembered choice in local storage. No scope means
// "all branches".
import { api } from './api-client.js';
import { escapeHtml } from './format.js';
import { icon } from './icons.js';

const KEY = 'lm_branch';
let cache = null;

// The branch the owner is currently looking at. Read synchronously so pages can
// build their first request without waiting on a network round-trip.
export function branchScope() {
  try {
    const fromUrl = new URLSearchParams(location.search).get('laundromat');
    if (fromUrl) return fromUrl;
  } catch { /* malformed URL */ }
  try { return localStorage.getItem(KEY) || null; } catch { return null; }
}

export function setBranchScope(id) {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch { /* private mode */ }
}

// Forget the scope, in storage and in the URL, then reload so every panel
// refetches for all branches.
export function clearScope() {
  setBranchScope(null);
  try {
    const url = new URL(location.href);
    url.searchParams.delete('laundromat');
    location.href = url.toString();
  } catch {
    location.reload();
  }
}

// A stable suffix for cache keys, so a branch-scoped response never bleeds into
// the "all branches" view (or another branch).
export function scopeKey() {
  return branchScope() || 'all';
}

// `path` is an owner API path that may already carry a query string. Returns it
// with the current branch scope merged in.
export function scoped(path) {
  const id = branchScope();
  if (!id) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}laundromat_id=${encodeURIComponent(id)}`;
}

export async function loadBranches({ refresh = false } = {}) {
  if (cache && !refresh) return cache;
  const { data } = await api.get('/owner?action=laundromats');
  cache = (data || []).slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  return cache;
}

export function branchName(id) {
  const hit = (cache || []).find((b) => b.id === id);
  return hit ? hit.name : null;
}

export function invalidateBranches() { cache = null; }

// Sidebar links are plain relative paths, so a scope set on one page would be
// forgotten the moment the owner navigates. Tag them with the current branch so
// the scope follows them around the app.
export function applyScopeToNav(root = document) {
  const id = branchScope();
  if (!id) return;
  root.querySelectorAll('.side-nav a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    if (!href || /^(https?:|mailto:|#)/.test(href)) return;
    // Remember the untagged target once, so repeated decoration passes (the
    // shell re-runs on DOM mutations) never stack two query strings.
    if (a.dataset.scopeBase == null) a.dataset.scopeBase = href;
    if (a.dataset.scopeFor === id) return;
    const base = a.dataset.scopeBase;
    const sep = base.includes('?') ? '&' : '?';
    a.setAttribute('href', `${base}${sep}laundromat=${encodeURIComponent(id)}`);
    a.dataset.scopeFor = id;
  });
}

function optionLabel(b) {
  const state = b.verification_status && b.verification_status !== 'approved' ? ` — ${b.verification_status}` : '';
  return `${b.name || 'Branch'}${state}`;
}

// Renders the branch picker into `target`. Owners with a single branch get no
// picker at all — there is nothing to switch. When a branch is selected the
// control is visibly "on" and gets a clear button, so a filtered list can never
// be mistaken for the whole business. Switching reloads the page so every panel
// refetches against the new scope.
export async function mountBranchSwitcher(target) {
  if (!target) return null;
  let branches = [];
  try {
    branches = (await loadBranches()).filter((b) => b.business_status !== 'archived');
  } catch { return null; }

  const current = branchScope();
  if (current && !branches.some((b) => b.id === current)) {
    // The remembered branch was archived or removed; drop it before it makes
    // every request fail.
    setBranchScope(null);
    location.reload();
    return null;
  }
  if (branches.length < 2) return null;

  const inPages = /\/pages\//.test(location.pathname);
  const manageHref = `${inPages ? 'settings.html' : 'pages/settings.html'}#branchesSection`;

  const wrap = document.createElement('div');
  wrap.className = `branch-switcher${current ? ' is-scoped' : ''}`;
  wrap.innerHTML = `<span class="branch-switcher-icon" aria-hidden="true">${icon('store', { size: 16 })}</span>
    <label class="sr-only" for="branchSelect">Branch</label>
    <select class="input" id="branchSelect" title="Scope this page to one branch">
      <option value="">All branches</option>
      ${branches.map((b) => `<option value="${b.id}"${b.id === current ? ' selected' : ''}>${escapeHtml(optionLabel(b))}</option>`).join('')}
    </select>
    ${current ? `<button type="button" class="branch-clear" aria-label="Show all branches" title="Show all branches">${icon('x', { size: 14 })}</button>` : ''}
    <a class="branch-manage" href="${manageHref}" title="Manage branches" aria-label="Manage branches">${icon('settings', { size: 16 })}</a>`;
  target.insertBefore(wrap, target.firstChild);

  // A scoped view looks identical to an unscoped one at a glance, which is how
  // an owner ends up wondering where the other branch's bookings went. Repeat
  // the scope at the top of the content until the owner clears it.
  if (current) {
    const content = document.querySelector('.page-shell.content');
    const branch = branches.find((b) => b.id === current);
    if (content && branch && !content.querySelector('.scope-bar')) {
      const banner = document.createElement('div');
      banner.className = 'scope-bar';
      banner.setAttribute('role', 'status');
      banner.innerHTML = `<span class="scope-bar-icon" aria-hidden="true">${icon('filter', { size: 15 })}</span>
        <span>Showing <strong>${escapeHtml(branch.name)}</strong> only</span>
        <button type="button" class="scope-bar-clear">Show all branches</button>`;
      content.insertBefore(banner, content.firstChild);
      banner.querySelector('.scope-bar-clear').addEventListener('click', () => clearScope());
    }
  }

  wrap.querySelector('select').addEventListener('change', (e) => {
    const id = e.target.value || null;
    setBranchScope(id);
    // Keep the URL in step with the choice so the view stays shareable and the
    // remembered branch cannot be overridden by a stale `?laundromat=` in the URL.
    const url = new URL(location.href);
    if (id) url.searchParams.set('laundromat', id);
    else url.searchParams.delete('laundromat');
    location.href = url.toString();
  });
  const clearBtn = wrap.querySelector('.branch-clear');
  if (clearBtn) clearBtn.addEventListener('click', () => clearScope());

  return { branches, current };
}
