import { escapeHtml, currency } from '../../../shared/js/format.js';
import { badge } from '../../../shared/js/ui.js';

export function pageHref(file) {
  const inPages = /\/pages\//.test(location.pathname);
  return inPages ? file : `pages/${file}`;
}

function stars(rating) {
  const full = Math.round(Number(rating) || 0);
  return `${'\u2605'.repeat(full)}<span class="text-muted">${'\u2606'.repeat(Math.max(0, 5 - full))}</span>`;
}

export function laundromatCard(item) {
  const rating = Number(item.rating_average) || 0;
  const ratingText = item.rating_count ? `${stars(rating)} <span class="text-muted">${rating.toFixed(1)} (${item.rating_count})</span>` : '<span class="text-muted">New</span>';
  const distance = item.distance_km != null ? `<span class="pill">${Number(item.distance_km).toFixed(1)} km</span>` : '';
  const featured = item.is_featured ? badge('Featured', 'warning') : '';
  const views = Number(item.view_count) > 0 ? `<span class="text-xs text-muted">${Number(item.view_count)} views</span>` : '';
  return `<article class="card">
    <div class="card-body">
      <div class="flex justify-between wrap">
        <h3 class="card-title">${escapeHtml(item.name)}</h3>
        ${featured}
      </div>
      <p class="card-meta">${escapeHtml(item.address || 'Address not provided')}</p>
      <p class="rating text-sm">${ratingText}</p>
      <p class="flex wrap text-xs">${distance}${views}</p>
      <a class="btn btn-primary" href="${pageHref('laundromat.html')}?id=${encodeURIComponent(item.id)}">View &amp; book</a>
    </div>
  </article>`;
}

export function serviceCard(service) {
  const turnaround = Number(service.turnaround_hours) || 24;
  return `<article class="card">
    <div class="card-body">
      <h3 class="card-title">${escapeHtml(service.name)}</h3>
      <p class="card-meta">${escapeHtml(service.description || '')}</p>
      <p class="text-sm">${currency(service.base_price)} &middot; ${turnaround}h turnaround</p>
      <label class="check text-sm">
        <input type="checkbox" data-service="${service.id}" data-name="${escapeHtml(service.name)}" data-price="${Number(service.base_price) || 0}">
        Add to order
      </label>
      <label class="field text-sm">Quantity
        <input class="input" style="width:6rem" type="number" min="1" value="1" data-qty="${service.id}">
      </label>
    </div>
  </article>`;
}

