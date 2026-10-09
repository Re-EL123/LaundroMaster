import { api } from '../../../shared/js/api-client.js';
import { escapeHtml, currency, relativeTime, statusLabel, statusTone } from '../../../shared/js/format.js';
import { badge, emptyState, statTile, barChart } from '../../../shared/js/ui.js';
import { mountDashboard } from '../../../shared/js/shell.js';

(async function () {
  const user = await mountDashboard({ allowed: ['owner', 'staff', 'admin', 'super_admin'] });
  if (!user) return;

  const statsEl = document.getElementById('stats');
  const recentEl = document.getElementById('recent');
  const bannerEl = document.getElementById('banner');
  const checklistEl = document.getElementById('checklist');
  const chartEl = document.getElementById('chart');
  const topServicesEl = document.getElementById('topServices');

  // Stats
  try {
    const { data: stats } = await api.get('/owner?action=stats');
    statsEl.innerHTML = [
      statTile({ label: 'Needs action', value: stats.pending, href: 'pages/bookings.html?status=pending_acceptance', tone: stats.pending ? 'warning' : '' }),
      statTile({ label: 'In progress', value: stats.active, href: 'pages/bookings.html' }),
      statTile({ label: 'Completed', value: stats.completed }),
      statTile({ label: 'Net earnings', value: currency(stats.net), hint: `Rating ${stats.rating || '—'} · ${stats.repeat_rate}% repeat`, href: 'pages/earnings.html', tone: 'success' }),
    ].join('');
  } catch (err) {
    statsEl.innerHTML = `<p class="error">${escapeHtml(err.message || 'Failed to load stats.')}</p>`;
  }

  // Verification banner + activation checklist
  try {
    const { data: list } = await api.get('/owner?action=verification');
    if (!list.length) {
      bannerEl.innerHTML = '<div class="banner banner-warning"><div><strong>Set up your business</strong><p class="text-sm">Add your laundromat details to start receiving bookings.</p></div></div>';
      checklistEl.innerHTML = '<h2 class="card-title">Setup checklist</h2><p class="text-muted text-sm mt-4">No laundromat linked yet.</p>';
    } else {
      const primary = list[0];
      if (list.some((l) => l.verification_status === 'pending')) {
        bannerEl.innerHTML = '<div class="banner banner-info"><div><strong>Verification in progress</strong><p class="text-sm">Our team is reviewing your listing. You can keep preparing your services in the meantime.</p></div></div>';
      } else if (list.some((l) => l.verification_status === 'rejected')) {
        bannerEl.innerHTML = '<div class="banner banner-danger"><div><strong>Verification needs attention</strong><p class="text-sm">Your listing was rejected. Update your details and resubmit.</p></div></div>';
      } else if (primary.percent < 100) {
        bannerEl.innerHTML = '<div class="banner banner-warning"><div><strong>Finish setting up</strong><p class="text-sm">Complete the checklist to convert more visitors into bookings.</p></div></div>';
      } else {
        bannerEl.innerHTML = '<div class="banner banner-success"><div><strong>You are all set</strong><p class="text-sm">Your listing is live and complete.</p></div></div>';
      }
      const items = primary.checks.map((c) => `<div class="checklist-item${c.done ? ' is-done' : ''}">
        <span class="checklist-mark">${c.done ? '✓' : ''}</span>
        <span class="checklist-text">${escapeHtml(c.label)}</span>
      </div>`).join('');
      checklistEl.innerHTML = `<div class="flex justify-between"><h2 class="card-title">Setup checklist</h2><span class="text-sm text-muted">${primary.done}/${primary.total}</span></div>
        <div class="meter-track mt-4"><div class="meter-fill" style="width:${primary.percent}%"></div></div>
        <div class="checklist mt-4">${items}</div>`;
    }
  } catch (err) {
    bannerEl.innerHTML = '';
    checklistEl.innerHTML = `<p class="error">${escapeHtml(err.message || 'Could not load setup status.')}</p>`;
  }

  // Earnings chart + top services
  try {
    const { data } = await api.get('/owner?action=analytics');
    const hasData = (data.months || []).some((m) => m.revenue > 0);
    chartEl.innerHTML = hasData
      ? barChart(data.months, { valueKey: 'revenue' })
      : '<p class="text-muted">No completed orders yet. Your trend will appear here.</p>';
    const tops = data.top_services || [];
    topServicesEl.innerHTML = tops.length
      ? tops.map((s, i) => `<article class="card" style="margin-bottom:var(--space-3)"><div class="card-body" style="flex-direction:row;justify-content:space-between;align-items:center">
          <div><h3 class="card-title">${i + 1}. ${escapeHtml(s.name)}</h3><p class="text-xs text-muted">${s.quantity} unit(s)</p></div>
          <strong>${currency(s.revenue)}</strong>
        </div></article>`).join('')
      : '<p class="text-muted">No service data yet.</p>';
  } catch {
    chartEl.innerHTML = '<p class="text-muted">Trend unavailable.</p>';
    topServicesEl.innerHTML = '';
  }

  // Recent bookings
  try {
    const { data: bookings } = await api.get('/bookings?limit=6');
    if (!bookings.length) return emptyState(recentEl, 'No bookings yet.');
    recentEl.innerHTML = bookings.map((b) => `<article class="card">
      <div class="card-body">
        ${badge(statusLabel(b.status), statusTone(b.status))}
        <h3 class="card-title">${escapeHtml((b.laundromats && b.laundromats.name) || 'Booking')}</h3>
        <p class="card-meta">${b.booking_items ? b.booking_items.length : 0} item(s) · ${currency(b.total_amount)}</p>
        <p class="text-xs text-muted">${relativeTime(b.created_at)}</p>
        <a class="btn btn-secondary" href="pages/bookings.html">Manage</a>
      </div>
    </article>`).join('');
  } catch {
    emptyState(recentEl, 'Could not load bookings.');
  }
})();
