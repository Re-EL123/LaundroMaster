// Address search helpers. Photon + Nominatim (via /api/geo?action=places) return
// several candidates so a user can pick the exact street address instead of
// settling for the centroid of the suburb they typed.
import { api } from './api-client.js';
import { escapeHtml } from './format.js';

const UNIQUE = (values) => values.filter((value, index, all) => value && all.indexOf(value) === index);

/** Fetch candidate locations for a free-form query. */
export async function searchPlaces(query, { limit = 6 } = {}) {
  const term = String(query || '').trim();
  if (term.length < 3) return [];
  try {
    const res = await api.get(`/geo?action=places&q=${encodeURIComponent(term)}&limit=${limit}`);
    return Array.isArray(res && res.data) ? res.data : [];
  } catch {
    return [];
  }
}

function titleOf(place) {
  if (place.name) return place.name;
  const first = String(place.label || '').split(',')[0];
  return first || 'Address';
}

function detailOf(place) {
  const street = [place.housenumber, place.street].filter(Boolean).join(' ');
  return street || place.label || '';
}

function metaOf(place) {
  return UNIQUE([place.suburb, place.city, place.state, place.postcode, place.country]).join(', ');
}

/**
 * Turn a text input into an address autocomplete backed by `searchPlaces`.
 * `onSelect(place)` receives the chosen candidate (lat/lng + label) so the
 * caller can store an exact pin.
 */
export function attachPlaceAutocomplete(input, { onSelect, limit = 6, minChars = 3, debounceMs = 300 } = {}) {
  if (!input) return;

  const host = input.parentElement || input;
  host.classList.add('place-ac');
  const list = document.createElement('div');
  list.className = 'place-suggestions';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  host.appendChild(list);

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  if (!input.getAttribute('autocomplete')) input.setAttribute('autocomplete', 'off');

  let results = [];
  let active = -1;
  let timer = null;
  let seq = 0;

  function close() {
    list.hidden = true;
    list.innerHTML = '';
    active = -1;
    input.setAttribute('aria-expanded', 'false');
  }

  function open(html) {
    list.innerHTML = html;
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function render() {
    if (!results.length) {
      open('<div class="place-empty">No matches — try adding the street number or suburb.</div>');
      return;
    }
    open(results.map((place, index) => `
      <button type="button" class="place-suggestion${index === active ? ' is-active' : ''}" role="option" data-index="${index}">
        <span class="place-suggestion-title">${escapeHtml(titleOf(place))}</span>
        <span class="place-suggestion-meta">${escapeHtml(detailOf(place))}</span>
        <span class="place-suggestion-sub">${escapeHtml(metaOf(place))}${place.provider ? ` · ${escapeHtml(place.provider)}` : ''}</span>
      </button>`).join(''));
  }

  function choose(index) {
    const place = results[index];
    if (!place) return;
    input.value = place.label || place.name || `${place.lat}, ${place.lng}`;
    close();
    if (typeof onSelect === 'function') onSelect(place);
  }

  async function run() {
    const term = input.value.trim();
    if (term.length < minChars) { close(); return; }
    const token = ++seq;
    open('<div class="place-empty">Searching…</div>');
    const found = await searchPlaces(term, { limit });
    if (token !== seq) return;
    results = found;
    active = found.length ? 0 : -1;
    render();
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(run, debounceMs);
  });

  input.addEventListener('keydown', (event) => {
    if (list.hidden) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); active = Math.min(active + 1, results.length - 1); render(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); active = Math.max(active - 1, 0); render(); }
    else if (event.key === 'Enter' && active >= 0) { event.preventDefault(); choose(active); }
    else if (event.key === 'Escape') { close(); }
  });

  list.addEventListener('mousedown', (event) => {
    const button = event.target.closest('[data-index]');
    if (!button) return;
    event.preventDefault();
    choose(Number(button.dataset.index));
  });

  document.addEventListener('click', (event) => {
    if (!host.contains(event.target)) close();
  });

  input.addEventListener('blur', () => {
    setTimeout(() => { if (!host.contains(document.activeElement)) close(); }, 120);
  });
}
