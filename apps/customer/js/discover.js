import { api } from '../../../shared/js/api-client.js';
import { skeleton, errorState, emptyState, toast } from '../../../shared/js/ui.js';
import { mountCustomerHeader } from '../../../shared/js/chrome.js';
import { laundromatCard } from './components.js';
import { param, escapeHtml } from '../../../shared/js/format.js';
import { renderAds } from '../../../shared/js/ads.js';
import { currentPosition, currentPositionIfPermitted, permissionState } from '../../../shared/js/geolocation.js';

mountCustomerHeader('discover');

const list = document.getElementById('list');
const form = document.getElementById('searchForm');
const input = document.getElementById('q');
const minRating = document.getElementById('min_rating');
const maxPrice = document.getElementById('max_price');
const radiusSel = document.getElementById('radius');
const resultCount = document.getElementById('resultCount');
const sortBar = document.getElementById('sortBar');
const nearBtn = document.getElementById('nearBtn');
const moreWrap = document.getElementById('moreWrap');

input.value = param('q') || '';
if (minRating) minRating.value = param('min_rating') || '';
if (maxPrice) maxPrice.value = param('max_price') || '';
let sort = param('sort') || 'featured';
sortBar.querySelectorAll('[data-sort]').forEach((chip) => {
  chip.classList.toggle('is-active', chip.dataset.sort === sort);
});

// Discovery is distance-bound by default. `includeFar` and `showAll` are only
// set when the customer explicitly clicks "show further" / "browse all".
let radiusKm = Number(param('radius')) || 25;
let includeFar = param('far') === '1';
let showAll = param('all') === '1';
if (radiusSel) {
  const match = [...radiusSel.options].find((o) => Number(o.value) === radiusKm);
  if (match) radiusSel.value = String(radiusKm);
  else {
    const option = document.createElement('option');
    option.value = String(radiusKm);
    option.textContent = `${radiusKm} km`;
    radiusSel.appendChild(option);
    radiusSel.value = String(radiusKm);
  }
}

let origin = null;
let lastMeta = null;

function syncUrl() {
  const url = new URL(location.href);
  const v = input.value.trim();
  if (v) url.searchParams.set('q', v); else url.searchParams.delete('q');
  if (minRating.value) url.searchParams.set('min_rating', minRating.value); else url.searchParams.delete('min_rating');
  if (maxPrice.value) url.searchParams.set('max_price', maxPrice.value); else url.searchParams.delete('max_price');
  url.searchParams.set('sort', sort);
  url.searchParams.set('radius', String(radiusKm));
  if (includeFar) url.searchParams.set('far', '1'); else url.searchParams.delete('far');
  if (showAll) url.searchParams.set('all', '1'); else url.searchParams.delete('all');

  if (origin && origin.lat != null) {
    url.searchParams.set('lat', String(origin.lat));
    url.searchParams.set('lng', String(origin.lng));
    url.searchParams.delete('near');
  } else if (origin && origin.q) {
    url.searchParams.set('near', origin.q);
    url.searchParams.delete('lat');
    url.searchParams.delete('lng');
  } else {
    url.searchParams.delete('lat');
    url.searchParams.delete('lng');
    url.searchParams.delete('near');
  }
  history.replaceState(null, '', url);
}

function applyFilters(items) {
  const min = Number(minRating.value) || 0;
  const max = Number(maxPrice.value) || 0;
  return items.filter((item) => {
    if (min && (Number(item.rating_average) || 0) < min) return false;
    if (max && Number(item.starting_price != null ? item.starting_price : 0) > max) return false;
    return true;
  });
}

function applySort(items) {
  const rows = items.slice();
  if (sort === 'rating') rows.sort((a, b) => (Number(b.rating_average) || 0) - (Number(a.rating_average) || 0));
  else if (sort === 'name') rows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  else if (sort === 'newest') rows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  else if (sort === 'distance' && origin) {
    rows.sort((a, b) => (a.distance_km == null ? Infinity : a.distance_km) - (b.distance_km == null ? Infinity : b.distance_km));
  }
  return rows;
}

function nearbyLabel(nearText) {
  return nearText ? `near ${nearText}` : 'near you';
}

function ofLabel(nearText) {
  return nearText ? `of ${nearText}` : 'of you';
}

function rangeNotice(meta, nearText) {
  if (!moreWrap) return;
  const within = Number(meta.totalWithin) || 0;
  const outside = Number(meta.totalOutside) || 0;
  const unknown = Number(meta.totalUnknown) || 0;
  const where = escapeHtml(nearbyLabel(nearText));
  const anchor = nearText ? escapeHtml(nearText) : '';
  const withinPhrase = anchor ? `within ${radiusKm} km of ${anchor}` : `within ${radiusKm} km of you`;
  const awayPhrase = anchor ? `more than ${radiusKm} km from ${anchor}` : `more than ${radiusKm} km away`;

  if (showAll) {
    moreWrap.innerHTML = `<div class="callout">
      <div><strong class="text-sm">Showing every partner</strong>
        <p class="text-xs text-muted">Distances are shown where we know them. Switch back to only see laundromats ${where}.</p></div>
      <button class="btn btn-secondary text-sm" type="button" data-action="nearby">Only nearby</button>
    </div>`;
    return;
  }

  // Text match without coordinates: we cannot prove these are near.
  if (!meta.origin) {
    moreWrap.innerHTML = outside + unknown > 0
      ? `<div class="callout">
          <div><strong class="text-sm">Matches for “${escapeHtml(nearText)}”</strong>
            <p class="text-xs text-muted">We could not place that search on the map. Share your location to rank these by distance and only see nearby partners.</p></div>
          <div class="flex wrap">
            <button class="btn btn-primary text-sm" type="button" data-action="locate">Use my location</button>
            <button class="btn btn-secondary text-sm" type="button" data-action="all">Browse all partners</button>
          </div>
        </div>`
      : '';
    return;
  }

  if (includeFar) {
    moreWrap.innerHTML = `<div class="callout">
      <div><strong class="text-sm">Showing all distances</strong>
        <p class="text-xs text-muted">${within} ${withinPhrase}${outside ? ` · ${outside} further away` : ''}.</p></div>
      <button class="btn btn-secondary text-sm" type="button" data-action="nearby">Only nearby</button>
    </div>`;
    return;
  }

  if (outside > 0) {
    const wider = radiusKm < 100
      ? `<button class="btn btn-secondary text-sm" type="button" data-action="radius100">Widen to 100 km</button>`
      : '';
    moreWrap.innerHTML = `<div class="callout">
      <div><strong class="text-sm">${within ? `${within} ${withinPhrase}` : `Nothing ${withinPhrase}`}</strong>
        <p class="text-xs text-muted">${outside} more partner${outside === 1 ? ' is' : 's are'} ${awayPhrase}. They stay hidden unless you choose to see them.</p></div>
      <div class="flex wrap">
        <button class="btn btn-primary text-sm" type="button" data-action="widen">Show further afield</button>
        ${wider}
      </div>
    </div>`;
    return;
  }

  if (!within && !outside) {
    const noPin = unknown > 0
      ? ` ${unknown} partner${unknown === 1 ? ' has' : 's have'} no map pin yet, so we cannot show how far away they are.`
      : '';
    moreWrap.innerHTML = `<div class="callout">
      <div><strong class="text-sm">No partners ${withinPhrase}</strong>
        <p class="text-xs text-muted">There are no approved laundromats ${where} yet. Try a wider radius or another suburb.${noPin}</p></div>
      <div class="flex wrap">
        ${radiusKm < 100 ? `<button class="btn btn-secondary text-sm" type="button" data-action="radius100">Widen to 100 km</button>` : ''}
        <button class="btn btn-secondary text-sm" type="button" data-action="all">Browse all partners</button>
      </div>
    </div>`;
    return;
  }

  if (unknown > 0) {
    moreWrap.innerHTML = `<div class="callout">
      <div><strong class="text-sm">${unknown} partner${unknown === 1 ? '' : 's'} without a map pin</strong>
        <p class="text-xs text-muted">We cannot tell how far away ${unknown === 1 ? 'it is' : 'they are'}, so ${unknown === 1 ? 'it is' : 'they are'} hidden from nearby results.</p></div>
      <button class="btn btn-secondary text-sm" type="button" data-action="all">Browse all partners</button>
    </div>`;
    return;
  }

  moreWrap.innerHTML = '';
}

function locationPrompt() {
  resultCount.textContent = '';
  list.innerHTML = `<div class="card"><div class="card-body empty-cta">
    <h3 class="card-title">Find laundromats near you</h3>
    <p class="text-muted">Share your location, or type your suburb, to see partners within ${radiusKm} km. We only show nearby listings unless you ask for more.</p>
    <div class="flex wrap">
      <button class="btn btn-primary" type="button" data-action="locate">Use my location</button>
      <button class="btn btn-secondary" type="button" data-action="all">Browse all partners</button>
    </div>
  </div></div>`;
  if (moreWrap) moreWrap.innerHTML = '';
}

function render(items, { nearText = '' } = {}) {
  const hasOrigin = Boolean(lastMeta && lastMeta.origin);
  if (!items.length) {
    resultCount.textContent = '';
    const term = input.value.trim() || nearText;
    emptyState(list, !hasOrigin
      ? `No laundromats match “${term}”.`
      : includeFar
        ? 'No laundromats match your filters.'
        : `No laundromats within ${radiusKm} km ${ofLabel(nearText)}.`);
    return;
  }
  resultCount.textContent = showAll
    ? `${items.length} partner${items.length === 1 ? '' : 's'}`
    : !hasOrigin
      ? `${items.length} result${items.length === 1 ? '' : 's'}`
      : includeFar
        ? `${items.length} partner${items.length === 1 ? '' : 's'} by distance`
        : `${items.length} within ${radiusKm} km`;
  list.innerHTML = items.map(laundromatCard).join('');
}

function rerun() {
  if (showAll) return geoSearch({ all: true, q: input.value.trim() || undefined });
  if (origin && origin.lat != null) return geoSearch({ lat: origin.lat, lng: origin.lng });
  if (origin && origin.q) return geoSearch({ q: origin.q });
  return geoSearch({});
}

async function geoSearch({ lat, lng, q, all = false } = {}) {
  skeleton(list, 6, 180);
  resultCount.textContent = '';
  if (moreWrap) moreWrap.innerHTML = '';
  showAll = Boolean(all);

  const params = new URLSearchParams({
    action: 'search',
    limit: '50',
    radius_km: String(radiusKm),
    backfill: '1',
  });
  if (showAll) params.set('all', '1');
  if (includeFar) params.set('include_far', '1');
  if (lat != null && lng != null) {
    params.set('lat', String(lat));
    params.set('lng', String(lng));
  }
  if (q) params.set('q', q);

  try {
    const res = await api.get(`/geo?${params.toString()}`);
    const rows = res.data || [];
    const meta = res.meta || {};
    lastMeta = meta;

    if (lat != null && lng != null) origin = { lat, lng };
    else if (q) origin = { q };
    else if (!showAll) origin = null;

    const nearText = q || meta.originLabel || (origin && origin.lat != null ? 'your location' : '');
    if (meta.needsLocation) {
      origin = null;
      syncUrl();
      locationPrompt();
      return;
    }

    // Default the sort to distance whenever we have an origin.
    if (origin && sort === 'featured') {
      sort = 'distance';
      sortBar.querySelectorAll('[data-sort]').forEach((chip) => {
        chip.classList.toggle('is-active', chip.dataset.sort === sort);
      });
    }

    syncUrl();
    render(applySort(applyFilters(rows)), { nearText });
    rangeNotice(meta, nearText);
  } catch (err) {
    errorState(list, err.message || 'Failed to search near you.');
    if (moreWrap) moreWrap.innerHTML = '';
  }
}

async function savedAddressQuery() {
  try {
    const res = await api.get('/auth?action=me', { auth: true });
    const user = (res && res.data && res.data.user) || null;
    const addresses = (user && user.addresses) || [];
    const first = addresses[0];
    if (!first) return null;
    return [first.line1, first.suburb, first.city, first.postal_code].filter(Boolean).join(', ');
  } catch {
    return null;
  }
}

async function locateAndSearch({ interactive = false } = {}) {
  if (nearBtn) nearBtn.disabled = true;
  includeFar = false;
  showAll = false;
  try {
    const pos = await currentPosition({ timeout: 9000 });
    await geoSearch({ lat: pos.lat, lng: pos.lng });
  } catch (err) {
    // No browser location: try the address saved on the customer's profile.
    const address = await savedAddressQuery();
    if (address) {
      toast('Using your saved address for nearby results.', 'info');
      await geoSearch({ q: address });
    } else if (interactive) {
      toast(err.message || 'Enter your suburb to see nearby laundromats.', 'info');
      input.focus();
      input.placeholder = 'Type your suburb, e.g. Sandton';
    }
  } finally {
    if (nearBtn) nearBtn.disabled = false;
  }
}

function handleRangeAction(action) {
  if (action === 'widen') {
    includeFar = true;
    return rerun();
  }
  if (action === 'nearby') {
    includeFar = false;
    showAll = false;
    return rerun();
  }
  if (action === 'radius100') {
    radiusKm = 100;
    includeFar = false;
    showAll = false;
    if (radiusSel) radiusSel.value = '100';
    return rerun();
  }
  if (action === 'all') {
    includeFar = false;
    return geoSearch({ all: true, q: input.value.trim() || undefined });
  }
  if (action === 'locate') {
    return locateAndSearch({ interactive: true });
  }
  return undefined;
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (!['widen', 'nearby', 'radius100', 'all', 'locate'].includes(action)) return;
  e.preventDefault();
  handleRangeAction(action);
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  includeFar = false;
  showAll = false;
  const v = input.value.trim();
  if (v) geoSearch({ q: v });
  else geoSearch({});
});

[minRating, maxPrice].forEach((el) => el.addEventListener('change', () => rerun()));

if (radiusSel) {
  radiusSel.addEventListener('change', () => {
    const next = Number(radiusSel.value);
    if (!Number.isFinite(next) || next <= 0) return;
    radiusKm = next;
    includeFar = false;
    showAll = false;
    rerun();
  });
}

sortBar.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-sort]');
  if (!chip) return;
  sort = chip.dataset.sort;
  sortBar.querySelectorAll('[data-sort]').forEach((c) => c.classList.toggle('is-active', c === chip));
  rerun();
});

nearBtn.addEventListener('click', () => locateAndSearch({ interactive: true }));

async function init() {
  const lat = Number(param('lat'));
  const lng = Number(param('lng'));
  const near = param('near');
  if (showAll) {
    await geoSearch({ all: true, q: input.value.trim() || undefined });
    return;
  }
  if (Number.isFinite(lat) && Number.isFinite(lng) && param('lat') && param('lng')) {
    await geoSearch({ lat, lng });
    return;
  }
  if (near) {
    await geoSearch({ q: near });
    return;
  }
  // Returning visitors who already allowed location get distance-sorted results
  // without another permission prompt.
  if (await permissionState() === 'granted') {
    const pos = await currentPositionIfPermitted();
    if (pos) {
      await geoSearch({ lat: pos.lat, lng: pos.lng });
      return;
    }
  }
  const saved = await savedAddressQuery();
  if (saved) {
    await geoSearch({ q: saved });
    return;
  }
  await geoSearch({});
}

init();
renderAds();
