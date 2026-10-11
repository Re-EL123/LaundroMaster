import { api } from './api-client.js';
import { openModal, toast } from './ui.js';
import { escapeHtml } from './format.js';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Opens a modal editor for a laundromat's weekly operating hours.
export async function openHoursEditor(laundromatId, { onSaved } = {}) {
  const handle = openModal({
    title: 'Operating hours',
    body: '<div class="skeleton" style="height:220px"></div>',
    actions: [
      { label: 'Cancel', variant: 'secondary' },
      { label: 'Save hours', variant: 'primary', id: 'saveHours', close: false, onClick: () => saveHours(handle, laundromatId, onSaved) },
    ],
  });

  try {
    const { data } = await api.get(`/owner?action=hours&laundromat_id=${encodeURIComponent(laundromatId)}`);
    const map = new Map((data || []).map((r) => [r.weekday, r]));
    handle.body.innerHTML = DAYS.map((label, i) => {
      const row = map.get(i) || {};
      const open = row.open_time ? String(row.open_time).slice(0, 5) : '08:00';
      const close = row.close_time ? String(row.close_time).slice(0, 5) : '17:00';
      return `<div class="hours-row" data-day="${i}">
        <span class="hours-day">${label}</span>
        <input class="input" type="time" data-open value="${open}" aria-label="${label} opening time">
        <span class="text-muted">to</span>
        <input class="input" type="time" data-close value="${close}" aria-label="${label} closing time">
        <label class="flex items-center text-xs"><input type="checkbox" data-closed${row.is_closed ? ' checked' : ''}> Closed</label>
      </div>`;
    }).join('');
  } catch (err) {
    handle.body.innerHTML = `<p class="error">${escapeHtml(err.message || 'Could not load operating hours.')}</p>`;
  }
  return handle;
}

async function saveHours(handle, laundromatId, onSaved) {
  const btn = handle.footer.querySelector('#saveHours');
  if (btn) btn.disabled = true;
  const hours = [...handle.body.querySelectorAll('[data-day]')].map((row) => ({
    weekday: Number(row.dataset.day),
    is_closed: row.querySelector('[data-closed]').checked,
    open_time: row.querySelector('[data-open]').value || null,
    close_time: row.querySelector('[data-close]').value || null,
  }));
  try {
    await api.post('/owner?action=hours-update', { laundromat_id: laundromatId, hours });
    toast('Operating hours saved', 'success');
    handle.close();
    onSaved?.();
  } catch (err) {
    toast(err.message || 'Could not save hours', 'danger');
    if (btn) btn.disabled = false;
  }
}

// Opens a modal editor for a laundromat's delivery zones.
export async function openZonesEditor(laundromatId, { onSaved } = {}) {
  const handle = openModal({
    title: 'Delivery zones',
    size: 'lg',
    body: '<div class="skeleton" style="height:160px"></div>',
    actions: [
      { label: 'Add zone', variant: 'secondary', close: false, onClick: (h) => addZoneRow(h) },
      { label: 'Save zones', variant: 'primary', id: 'saveZones', close: false, onClick: () => saveZones(handle, laundromatId, onSaved) },
    ],
  });

  handle.body.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove-zone]');
    if (rm) rm.closest('[data-zone]').remove();
  });

  try {
    const { data } = await api.get(`/owner?action=zones&laundromat_id=${encodeURIComponent(laundromatId)}`);
    if (data && data.length) {
      handle.body.innerHTML = `<div class="zones-list" data-zones>${data.map(zoneRow).join('')}</div>`;
    } else {
      handle.body.innerHTML = '<div class="zones-list" data-zones></div>';
      addZoneRow(handle);
    }
  } catch (err) {
    handle.body.innerHTML = `<p class="error">${escapeHtml(err.message || 'Could not load delivery zones.')}</p>`;
  }
  return handle;
}

function zoneRow(z = {}) {
  return `<div class="zone-row" data-zone>
    <div class="field"><label class="label">Zone name</label>
      <input class="input" data-name value="${escapeHtml(z.name || '')}" placeholder="e.g. City centre"></div>
    <div class="field"><label class="label">Radius (km)</label>
      <input class="input" type="number" min="0" step="1" data-radius value="${z.radius_km != null ? Number(z.radius_km) : ''}"></div>
    <div class="field"><label class="label">Delivery fee</label>
      <input class="input" type="number" min="0" step="0.01" data-fee value="${Number(z.fee) || 0}"></div>
    <button type="button" class="btn btn-danger" data-remove-zone>Remove</button>
  </div>`;
}

function addZoneRow(handle) {
  const list = handle.body.querySelector('[data-zones]');
  if (!list) return;
  list.insertAdjacentHTML('beforeend', zoneRow());
  list.lastElementChild.querySelector('[data-name]')?.focus();
}

async function saveZones(handle, laundromatId, onSaved) {
  const btn = handle.footer.querySelector('#saveZones');
  if (btn) btn.disabled = true;
  const zones = [...handle.body.querySelectorAll('[data-zone]')].map((row) => {
    const radius = row.querySelector('[data-radius]').value;
    return {
      name: row.querySelector('[data-name]').value.trim() || null,
      radius_km: radius === '' ? null : Number(radius),
      fee: Number(row.querySelector('[data-fee]').value) || 0,
    };
  }).filter((z) => z.name || z.radius_km != null || z.fee > 0);
  try {
    await api.post('/owner?action=zones-update', { laundromat_id: laundromatId, zones });
    toast('Delivery zones saved', 'success');
    handle.close();
    onSaved?.();
  } catch (err) {
    toast(err.message || 'Could not save zones', 'danger');
    if (btn) btn.disabled = false;
  }
}
