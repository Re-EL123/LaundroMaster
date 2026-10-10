// Theme (light/dark) controller. The preferred theme is booted inline in <head>
// to avoid a flash of the wrong theme; this module keeps it in sync + renders toggles.

const KEY = 'lm_theme';

export function getTheme() {
  if (typeof document !== 'undefined' && document.documentElement.dataset.theme) {
    return document.documentElement.dataset.theme;
  }
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch { /* ignore */ }
  if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

export function applyTheme(theme) {
  if (typeof document === 'undefined') return theme;
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', next === 'dark' ? '#0B0B0D' : '#D90429');
  try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next } }));
  return next;
}

export function toggleTheme() {
  return applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

export function initTheme() {
  return applyTheme(getTheme());
}

export function mountThemeToggle(container, { compact = true } = {}) {
  if (!container) return null;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = compact ? 'btn btn-secondary theme-toggle' : 'btn btn-secondary';
  btn.setAttribute('aria-label', 'Toggle dark mode');

  const render = () => {
    const dark = getTheme() === 'dark';
    btn.textContent = dark ? '☀' : '☾';
    btn.setAttribute('aria-pressed', String(dark));
    btn.setAttribute('title', dark ? 'Switch to light mode' : 'Switch to dark mode');
  };

  btn.addEventListener('click', () => { toggleTheme(); render(); });
  document.addEventListener('themechange', render);
  render();
  container.appendChild(btn);
  return btn;
}
