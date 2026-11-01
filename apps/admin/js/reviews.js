import { api } from '../../../shared/js/api-client.js';
import { skeleton, emptyState, errorState, badge, toast, confirmAction } from '../../../shared/js/ui.js';
import { escapeHtml, formatDate, statusLabel, statusTone } from '../../../shared/js/format.js';
import { mountDashboard } from '../../../shared/js/shell.js';

(async function () {
  const user = await mountDashboard({ allowed: ['admin', 'super_admin'] });
  if (!user) return;

  const list = document.getElementById('list');
  const statusBar = document.getElementById('statusBar');
  let status = 'pending';

  function stars(rating) {
    const n = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    return `${'★'.repeat(n)}<span class="text-muted">${'☆'.repeat(5 - n)}</span>`;
  }

  function render(r) {
    const biz = r.laundromats ? r.laundromats.name : 'Unknown laundromat';
    const reviewer = r.profiles ? (r.profiles.full_name || r.profiles.email || 'Customer') : 'Customer';
    const actions = [];
    if (r.moderation_status !== 'published') actions.push(`<button type="button" class="btn btn-primary" data-moderate="${r.id}" data-status="published">Publish</button>`);
    if (r.moderation_status !== 'hidden') actions.push(`<button type="button" class="btn btn-secondary" data-moderate="${r.id}" data-status="hidden">Hide</button>`);
    actions.push(`<button type="button" class="btn btn-danger" data-delete="${r.id}">Delete</button>`);
    const photos = Array.isArray(r.photos) && r.photos.length
      ? `<p class="text-xs text-muted">${r.photos.length} photo(s) attached</p>` : '';
    return `<article class="card" data-id="${r.id}">
      <div class="card-body">
        <div class="flex justify-between items-center">
          ${badge(statusLabel(r.moderation_status), statusTone(r.moderation_status))}
          <span class="text-xs text-muted">${formatDate(r.created_at)}</span>
        </div>
        <h3 class="card-title">${escapeHtml(biz)}</h3>
        <p class="text-sm">${stars(r.rating)} <span class="text-muted">by ${escapeHtml(reviewer)}</span></p>
        <p class="text-sm">${escapeHtml(r.review_text || 'No comment left.')}</p>
        ${photos}
        <div class="flex wrap">${actions.join('')}</div>
      </div>
    </article>`;
  }

  async function load() {
    skeleton(list, 3, 150);
    const q = status ? `&status=${encodeURIComponent(status)}` : '';
    try {
      const { data: items } = await api.get(`/reviews?action=all${q}&limit=200`);
      if (!items.length) {
        return emptyState(list, status === 'pending' ? 'Nothing waiting for moderation.' : 'No reviews in this view.');
      }
      list.innerHTML = items.map(render).join('');
    } catch (err) {
      errorState(list, err.message || 'Failed to load reviews.');
    }
  }

  statusBar.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-status]');
    if (!chip) return;
    status = chip.dataset.status;
    statusBar.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-active', c === chip));
    load();
  });

  list.addEventListener('click', async (e) => {
    const moderate = e.target.closest('[data-moderate]');
    const del = e.target.closest('[data-delete]');
    if (moderate) {
      moderate.disabled = true;
      try {
        await api.post('/reviews?action=moderate', { review_id: moderate.dataset.moderate, status: moderate.dataset.status });
        toast(`Review ${moderate.dataset.status}`, 'success');
        load();
      } catch (err) {
        toast(err.message || 'Could not update review', 'danger');
        moderate.disabled = false;
      }
      return;
    }
    if (del) {
      if (!confirmAction('Delete this review permanently?')) return;
      del.disabled = true;
      try {
        await api.post('/reviews?action=delete', { review_id: del.dataset.delete });
        toast('Review deleted', 'success');
        load();
      } catch (err) {
        toast(err.message || 'Could not delete review', 'danger');
        del.disabled = false;
      }
    }
  });

  load();
})();
