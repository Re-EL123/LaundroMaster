// Workspace block for the owner app: which business (or branch) am I looking at?
//
// The sidebar says "LM Owner" for everyone. A person who runs a business — or
// several — needs to see whose data they are working in, with the logo they
// uploaded, without opening the settings page.
import { loadBranches, branchScope } from './branch.js';
import { branchAvatar } from './avatar.js';
import { escapeHtml } from './format.js';
import { icon } from './icons.js';

const ROLE_LABELS = { owner: 'Owner', manager: 'Manager', staff: 'Staff' };

function inPages() {
  return /\/pages\//.test(location.pathname);
}

/**
 * Renders a compact business chip into `target`. Silently does nothing when the
 * account has no branch yet (staff, or an owner mid-setup) — there is nothing
 * meaningful to show before the business exists.
 */
export async function mountWorkspace(target, { role = 'owner' } = {}) {
  if (!target) return null;
  let branches = [];
  try {
    branches = (await loadBranches()).filter((b) => b.business_status !== 'archived');
  } catch {
    return null;
  }
  if (!branches.length) return null;

  // Prefer the branch the page is scoped to; otherwise the first one. The
  // switcher renders the same choice, so the two always agree.
  const scoped = branchScope();
  const branch = branches.find((b) => b.id === scoped) || branches[0];
  const scopeNote = branches.length > 1
    ? (scoped ? `1 of ${branches.length} branches` : `${branches.length} branches`)
    : null;
  const meta = [ROLE_LABELS[role] || role, scopeNote].filter(Boolean).join(' · ');

  const el = document.createElement('a');
  el.className = 'workspace';
  el.href = inPages() ? 'settings.html#brandingSection' : 'pages/settings.html#brandingSection';
  el.title = scopeNote ? `${branch.name} — ${meta}` : branch.name;
  el.innerHTML = `
    ${branchAvatar({ name: branch.name, path: branch.logo_path, size: 32, alt: '' })}
    <span class="identity-text">
      <span class="identity-name">${escapeHtml(branch.name || 'Your business')}</span>
      ${meta ? `<span class="identity-meta">${escapeHtml(meta)}</span>` : ''}
    </span>
    ${icon('chevron-down', { size: 14, className: 'workspace-caret' })}`;

  target.insertBefore(el, target.firstChild);
  return el;
}
