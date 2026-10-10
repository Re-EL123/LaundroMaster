import { api } from '../../../shared/js/api-client.js';
import { escapeHtml, currency, relativeTime, statusLabel, statusTone } from '../../../shared/js/format.js';
import { badge, emptyState, statTile, animateCounts, initReveal } from '../../../shared/js/ui.js';
import { lineChart, hbarChart, initCharts } from '../../../shared/js/charts.js';
import { swr } from '../../../shared/js/cache.js';
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
  const rangeFilter = document.getElementById('rangeFilter');
  let range = '6m';

  // Shaped skeletons while the first paint loads.
  statsEl.innerHTML = Array.from({ length: 4 })
    .map(() => '<article class="card"><div class="card-body"><div class="skeleton" style="height:0.7rem;width:40%"></div><div class="skeleton" style="height:1.6rem;width:60%"></div></div></article>')
    .join('');
  chartEl.innerHTML = '<div class="skeleton" style="height:180px"></div>';
  recentEl.innerHTML = Array.from({ length: 3 })
    .map(() => '<div class="skeleton" style="height:150px"></div>')
    .join('');

  function paintStats(stats) {
    statsEl.innerHTML = [
      statTile({ label: 'Needs action', value: stats.pending, href: 'pages/bookings.html?status=pending_acceptance', tone: stats.pending ? 'warning' : '', animate: true }),
      statTile({ label: 'In progress', value: stats.active, href: 'pages/bookings.html', animate: true }),
      statTile({ label: 'Completed', value: stats.completed, animate: true }),
      statTile({ label: 'Net earnings', value: stats.net, format: 'currency', hint: `Rating ${stats.rating || '—'} · ${stats.repeat_rate}% repeat`, href: 'pages/earnings.html', tone: 'success', animate: true }),
    ].join('');
    animateCounts(statsEl);
  }

  function paintVerification(list) {
    if (!list.length) {
      bannerEl.innerHTML = '<div class="banner banner-warning"><div><strong>Set up your business</strong><p class="text-sm">Add your laundromat details to start receiving bookings.</p></div></div>';
      checklistEl.innerHTML = '<h2 class="card-title">Setup checklist</h2><p class="text-muted text-sm mt-4">No laundromat linked yet.</p>';
      return;
    }
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

  function paintAnalytics(data) {
    const months = data.months || [];
    const hasData = months.some((m) => m.revenue > 0);
    chartEl.innerHTML = hasData
      ? lineChart(months, { format: 'currency', height: 200 })
      : '<p class="text-muted">No completed orders in this period. Your trend will appear here.</p>';
    initCharts(chartEl);

    const tops = data.top_services || [];
    topServicesEl.innerHTML = tops.length
      ? `<div class="card reveal"><div class="card-body">${hbarChart(tops.map((s) => ({ label: s.name, value: s.revenue })), { format: 'currency' })}</div></div>`
      : '<p class="text-muted">No service data yet.</p>';
    initReveal(topServicesEl);
  }

  function paintRecent(bookings) {
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
  }

  async function loadAnalytics(nextRange) {
    const r = nextRange || range;
    chartEl.innerHTML = '<div class="skeleton" style="height:180px"></div>';
    try {
      const data = await swr(`owner:analytics:${r}`, async () => {
        const { data: d } = await api.get(`/owner?action=analytics&range=${r}`);
        return d;
      }, { ttl: 120000, onUpdate: (fresh) => { if (r === range) paintAnalytics(fresh); } });
      if (r !== range) return;
      paintAnalytics(data);
    } catch {
      chartEl.innerHTML = '<p class="text-muted">Trend unavailable.</p>';
      topServicesEl.innerHTML = '';
    }
  }

  if (rangeFilter) {
    rangeFilter.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-range]');
      if (!btn) return;
      range = btn.dataset.range;
      rangeFilter.querySelectorAll('[data-range]').forEach((c) => c.classList.toggle('is-active', c === btn));
      loadAnalytics(range);
    });
  }

  // Stats + verification + recent in parallel; analytics paints first as well.
  const [statsRes, verifyRes, recentRes] = await Promise.allSettled([
    swr('owner:stats', async () => (await api.get('/owner?action=stats')).data, { ttl: 60000, onUpdate: paintStats }),
    swr('owner:verification', async () => (await api.get('/owner?action=verification')).data, { ttl: 60000, onUpdate: paintVerification }),
    swr('owner:recent', async () => (await api.get('/bookings?limit=6')).data, { ttl: 30000, onUpdate: paintRecent }),
  ]);

  if (statsRes.status === 'fulfilled') paintStats(statsRes.value);
  else statsEl.innerHTML = `<p class="error">${escapeHtml((statsRes.reason && statsRes.reason.message) || 'Failed to load stats.')}</p>`;

  if (verifyRes.status === 'fulfilled') paintVerification(verifyRes.value);
  else { bannerEl.innerHTML = ''; checklistEl.innerHTML = `<p class="error">${escapeHtml((verifyRes.reason && verifyRes.reason.message) || 'Could not load setup status.')}</p>`; }

  if (recentRes.status === 'fulfilled') paintRecent(recentRes.value);
  else emptyState(recentEl, 'Could not load bookings.');

  loadAnalytics();

  initReveal(document);
  animateCounts(document);
})();
