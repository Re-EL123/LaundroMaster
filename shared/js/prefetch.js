// Prefetch same-origin HTML documents when a link is hovered/focused so the
// next in-app navigation feels instant. Idempotent; returns a dispose fn.

export function wirePrefetch(root = document) {
  const done = new Set();

  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ''))) return () => {};

  const prefetch = (href) => {
    if (!href || href.startsWith('#') || /^(mailto:|tel:|https?:)/i.test(href)) return;
    let url;
    try { url = new URL(href, location.href); } catch { return; }
    if (url.origin !== location.origin) return;
    if (!/\.html?$|\/$/.test(url.pathname)) return;
    if (done.has(url.href)) return;
    done.add(url.href);
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = 'document';
    link.href = url.href;
    document.head.appendChild(link);
  };

  const onOver = (e) => {
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (a) prefetch(a.getAttribute('href'));
  };

  root.addEventListener('pointerover', onOver, { passive: true });
  root.addEventListener('focusin', onOver);

  // Speculatively warm the primary navigation once the page is idle so the
  // next in-app jump is instant even without a hover.
  const warm = () => {
    root.querySelectorAll('.side-nav a[href], .nav a[href], .header-actions a[href]')
      .forEach((a) => prefetch(a.getAttribute('href')));
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(warm, { timeout: 2500 });
  else setTimeout(warm, 900);

  return () => {
    root.removeEventListener('pointerover', onOver);
    root.removeEventListener('focusin', onOver);
  };
}
