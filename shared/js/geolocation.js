// Small wrapper around the browser geolocation API used by discovery.

export function supported() {
  return typeof navigator !== 'undefined' && Boolean(navigator.geolocation);
}

export async function permissionState() {
  if (typeof navigator === 'undefined' || !navigator.permissions || !navigator.permissions.query) {
    return 'prompt';
  }
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state || 'prompt';
  } catch {
    return 'prompt';
  }
}

function toResult(pos) {
  const c = pos && pos.coords;
  if (!c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) return null;
  return { lat: c.latitude, lng: c.longitude, accuracy: c.accuracy };
}

/** Resolve the current position. Rejects with a readable message. */
export function currentPosition({ enableHighAccuracy = false, timeout = 9000, maximumAge = 300000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!supported()) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const result = toResult(pos);
        if (result) resolve(result);
        else reject(new Error('Could not read your location.'));
      },
      (err) => {
        const message = err && err.code === 1
          ? 'Location permission was denied.'
          : err && err.code === 3
            ? 'Finding your location took too long.'
            : 'Could not determine your location.';
        // Keep the PositionError code so callers can tell a permanent denial
        // apart from a fix that simply was not available this time.
        const failure = new Error(message);
        if (err && err.code != null) failure.code = err.code;
        reject(failure);
      },
      { enableHighAccuracy, timeout, maximumAge },
    );
  });
}

/** Position only when the user has already granted permission (no prompt on load). */
export async function currentPositionIfPermitted(options = {}) {
  if (!supported()) return null;
  const state = await permissionState();
  if (state !== 'granted') return null;
  try {
    return await currentPosition(options);
  } catch {
    return null;
  }
}

/**
 * A GPS-grade fix, for a position that will be *stored* (a business pin) or that
 * decides which laundromats a customer is shown. The browser's default reading
 * is often an uncached-free network/IP estimate that can land in a different
 * town, so ask for high accuracy and refuse to reuse a cached fix — a GPS lock
 * usually takes a few seconds, hence the longer default timeout.
 */
export function precisePosition({ timeout = 25000 } = {}) {
  return currentPosition({ enableHighAccuracy: true, timeout, maximumAge: 0 });
}

/**
 * Ask for a GPS-grade fix, but never leave the caller with nothing: if the
 * high-accuracy attempt fails or times out — normal on a laptop, which has no
 * GPS — take the browser's fastest fresh reading instead. `maximumAge: 0` on
 * the fallback keeps a cached position from being mistaken for the current one.
 * Callers can read `pos.accuracy` to see how precise the result really is.
 */
export async function bestEffortPosition(options = {}) {
  try {
    return await precisePosition(options);
  } catch (err) {
    // A denied permission is sticky: retrying can only fail again, so keep the
    // caller's own "permission denied" handling intact.
    if (err && err.code === 1) throw err;
    return currentPosition({ maximumAge: 0 });
  }
}

export function distanceKm(a, b) {
  if (!a || !b) return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
