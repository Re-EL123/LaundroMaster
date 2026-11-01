import { api } from '../../../shared/js/api-client.js';
import { skeleton, errorState, emptyCTA, toast } from '../../../shared/js/ui.js';
import { mountCustomerHeader } from '../../../shared/js/chrome.js';
import { laundromatCard } from './components.js';
import { renderAds } from '../../../shared/js/ads.js';
import { escapeHtml } from '../../../shared/js/format.js';
import {
  bestEffortPosition, currentPositionIfPermitted, permissionState, supported,
} from '../../../shared/js/geolocation.js';

mountCustomerHeader('');

const list = document.getElementById('nearbyList');
const nearbyNote = document.getElementById('nearbyNote');

// Home mirrors the discover page: distance-bound by default. A customer only
// sees laundromats outside this radius after explicitly asking for them.
const RADIUS_KM = 25;
const WIDE_RADIUS_KM = 100;

function discoverHref({ lat, lng, near, far = false, radius = RADIUS_KM, all = false } = {}) {
  const params = new URLSearchParams();
  if (lat != null && lng != null) {
    params.set('lat', String(lat));
    params.set('lng', String(lng));
    // Coordinates we pass on came from the device, so let Discover re-read the
    // position rather than inheriting a possibly stale snapshot of it.
    params.set('loc', '1');
  } else if (near) {
    params.set('near', near);
  }
  params.set('radius', String(radius));
  if (far) params.set('far', '1');
  if (all) params.set('all', '1');
  return `./pages/discover.html?${params.toString()}`;
}

function setNote(text) {
  if (!nearbyNote) return;
  if (!text) {
    nearbyNote.innerHTML = '';
    return;
  }
  nearbyNote.innerHTML = `<p class="text-sm text-muted">${text}</p>`;
}

function show(items, { outside = 0, unknown = 0, radius = RADIUS_KM, lat, lng, near } = {}) {
  if (items.length) {
    const more = outside > 0
      ? ` There ${outside === 1 ? 'is' : 'are'} ${outside} more further away. <a href="${discoverHref({ lat, lng, near, far: true, radius })}">See ${outside === 1 ? 'it' : 'them'}?</a>`
      : '';
    setNote(`Showing laundromats within ${radius} km.${more}`);
    list.innerHTML = items.map(laundromatCard).join('');
    return;
  }

  if (outside > 0) {
    // The nearby list is empty because everything is beyond the radius. A
    // device reading can point at the wrong town entirely, so name that
    // possibility rather than letting the customer assume there is nothing.
    const hint = lat != null && lng != null && !near
      ? ' We placed you using your device\u2019s location, which can be approximate \u2014 type your suburb if that is not where you are.'
      : '';
    emptyCTA(list, {
      title: `Nothing within ${radius} km`,
      message: `${outside} partner${outside === 1 ? ' is' : 's are'} further away. We only show them when you choose to look further.${hint}`,
      href: discoverHref({ lat, lng, near, far: true, radius }),
      label: 'Show further afield',
    });
    setNote('');
    return;
  }

  if (unknown > 0) {
    emptyCTA(list, {
      title: 'Partners are still finding their pin',
      message: `${unknown} approved partner${unknown === 1 ? ' has' : 's have'} no map pin yet, so we cannot confirm they are nearby. You can browse every partner if you like.`,
      href: discoverHref({ all: true }),
      label: 'Browse all partners',
    });
    setNote('');
    return;
  }

  emptyCTA(list, {
    title: 'No laundromats yet',
    message: 'There are no approved partners near you right now. New partners are joining soon.',
    href: discoverHref({ lat, lng, near, radius: WIDE_RADIUS_KM }),
    label: 'Search a wider area',
  });
  setNote('');
}

function locationPrompt(message = '') {
  setNote('');
  list.innerHTML = `<div class="card"><div class="card-body empty-cta">
    <h3 class="card-title">Find laundromats near you</h3>
    <p class="text-muted">${escapeHtml(message) || `Share your location or use your saved address to see partners within ${RADIUS_KM} km.`} We only show nearby listings unless you ask for more.</p>
    <div class="flex wrap">
      ${supported() ? '<button class="btn btn-primary" type="button" data-home-action="locate">Use my location</button>' : ''}
      <a class="btn btn-secondary" href="${discoverHref()}">Type your suburb</a>
      <a class="btn btn-secondary" href="${discoverHref({ all: true })}">Browse all partners</a>
    </div>
  </div></div>`;
}

function messageForError(err) {
  return (err && err.message) || 'Failed to load nearby laundromats.';
}

async function searchNear({ lat, lng, near } = {}) {
  skeleton(list, 3, 200);
  setNote('');
  const params = new URLSearchParams({
    action: 'search',
    radius_km: String(RADIUS_KM),
    limit: '6',
    backfill: '1',
  });
  if (lat != null && lng != null) {
    params.set('lat', String(lat));
    params.set('lng', String(lng));
  }
  if (near) params.set('q', near);

  const res = await api.get(`/geo?${params.toString()}`);
  const meta = res.meta || {};
  if (meta.needsLocation) {
    locationPrompt();
    return;
  }
  // We had a saved address but could not place it on the map: ask the customer
  // to confirm a location instead of claiming there are no partners.
  if (near && !meta.origin) {
    locationPrompt(`We could not find “${near}” on the map.`);
    return;
  }
  const items = res.data || [];
  show(items, {
    outside: Number(meta.totalOutside) || 0,
    unknown: Number(meta.totalUnknown) || 0,
    radius: Number(meta.radiusKm) || RADIUS_KM,
    lat,
    lng,
    near,
  });
}

async function savedAddressQuery() {
  try {
    const res = await api.get('/auth?action=me', { auth: true });
    const user = (res && res.data && res.data.user) || null;
    const first = (user && user.addresses && user.addresses[0]) || null;
    if (!first) return null;
    const q = [first.line1, first.suburb, first.city, first.postal_code].filter(Boolean).join(', ');
    return q || null;
  } catch {
    return null;
  }
}

async function locate({ interactive = false } = {}) {
  try {
    const pos = await bestEffortPosition();
    await searchNear({ lat: pos.lat, lng: pos.lng });
    return true;
  } catch (err) {
    if (interactive) toast(messageForError(err), 'info');
    // A failed search (as opposed to a denied permission) must not leave the
    // customer staring at skeletons.
    if (list.querySelector('.skeleton')) errorState(list, messageForError(err));
    return false;
  }
}

async function loadNearby() {
  skeleton(list, 3, 200);
  try {
    // Only use the browser position when the customer already granted access;
    // don't pop a permission dialog on page load.
    if (await permissionState() === 'granted') {
      const pos = await currentPositionIfPermitted();
      if (pos) {
        await searchNear({ lat: pos.lat, lng: pos.lng });
        return;
      }
    }

    const saved = await savedAddressQuery();
    if (saved) {
      await searchNear({ near: saved });
      return;
    }

    locationPrompt();
  } catch (err) {
    errorState(list, messageForError(err));
  }
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-home-action="locate"]');
  if (!btn) return;
  e.preventDefault();
  btn.disabled = true;
  locate({ interactive: true }).finally(() => { btn.disabled = false; });
});

loadNearby();
renderAds();
