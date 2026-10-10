// Stale-while-revalidate helpers backed by sessionStorage (per-tab, survives
// client-side navigation but not a hard reload). Used to make dashboards feel
// instant on revisit while refreshing in the background.

const PREFIX = 'lm_cache:';

function store() {
  try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null; } catch { return null; }
}

export function cacheGet(key) {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function cacheSet(key, value) {
  const s = store();
  if (!s) return;
  try { s.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), value })); } catch { /* quota */ }
}

export function cacheClear(prefix = '') {
  const s = store();
  if (!s) return;
  try {
    Object.keys(s)
      .filter((k) => k.startsWith(PREFIX + prefix))
      .forEach((k) => s.removeItem(k));
  } catch { /* ignore */ }
}

// Returns cached value if present (even if stale). When stale and onUpdate is
// given, refreshes in the background and calls onUpdate with fresh data.
// When absent, awaits the loader. loader() must resolve to the raw data.
export async function swr(key, loader, { ttl = 60000, onUpdate } = {}) {
  const hit = cacheGet(key);
  if (hit) {
    if (Date.now() - hit.at >= ttl) {
      loader()
        .then((value) => { cacheSet(key, value); onUpdate?.(value); })
        .catch(() => { /* keep stale on failure */ });
    }
    return hit.value;
  }
  const value = await loader();
  cacheSet(key, value);
  return value;
}
