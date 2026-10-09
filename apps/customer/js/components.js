import { escapeHtml, currency } from '../../../shared/js/format.js';

export function pageHref(file) {
  const inPages = /\/pages\//.test(location.pathname);
  return inPages ? file : `pages/${file}`;
}

export function laundromatCard(item) {
  const rating = Number(item.rating_average) || 0;
  const ratingText = item.rating_count ? `\u2605 ${rating.toFixed(1)} (${item.rating_count})` : 'New';
  const distance = item.distance_km != null ? `<p class="text-sm text-muted">${item.distance_km} km away</p>` : '';
  return `<article class="card">
    <div class="card-body">
      <h3 class="card-title">${escapeHtml(item.name)}</h3>
      <p class="card-meta">${escapeHtml(item.address || 'Address not provided')}</p>
      <p class="rating text-sm">${ratingText}</p>
      ${distance}
      <a class="btn btn-primary" href="${pageHref('laundromat.html')}?id=${encodeURIComponent(item.id)}">View details</a>
    </div>
  </article>`;
}

export function serviceCard(service) {
  return `<article class="card">
    <div class="card-body">
      <h3 class="card-title">${escapeHtml(service.name)}</h3>
      <p class="card-meta">${escapeHtml(service.description || '')}</p>
      <p class="text-sm">${currency(service.base_price)} &middot; ${Number(service.turnaround_hours) || 24}h turnaround</p>
      <label class="flex text-sm">
        <input type="checkbox" data-service="${service.id}" data-name="${escapeHtml(service.name)}" data-price="${Number(service.base_price) || 0}">
        Add
      </label>
      <label class="field text-sm">Quantity
        <input class="input" style="width:6rem" type="number" min="1" value="1" data-qty="${service.id}">
      </label>
    </div>
  </article>`;
}
