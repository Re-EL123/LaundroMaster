// Dependency-free SVG chart toolkit. All builders return HTML strings and are
// safe to inject with innerHTML; values are escaped. Call initCharts(root) after
// inserting to enable hover/focus tooltips.

import { escapeHtml, currency } from './format.js';

function fmtVal(v, format) {
  if (typeof format === 'function') return format(v);
  if (format === 'currency') return currency(v);
  if (format === 'percent') return `${Math.round(v)}%`;
  if (format === 'number') return Math.round(v).toLocaleString('en-ZA');
  return String(Math.round(v * 100) / 100);
}

// Compact label for axis ticks: R1.2k, 3.4k, etc.
function fmtAxis(v, format) {
  const abs = Math.abs(v);
  const compact = (n) => {
    if (abs >= 1000000) return `${(n / 1000000).toFixed(abs >= 10000000 ? 0 : 1)}M`;
    if (abs >= 1000) return `${(n / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
    return `${Math.round(n)}`;
  };
  if (format === 'currency') return `R${compact(v)}`;
  if (format === 'percent') return `${Math.round(v)}%`;
  return compact(v);
}

function series(rows) {
  return (rows || []).map((r) => (typeof r === 'number'
    ? { label: '', value: r }
    : { label: r.label ?? r.name ?? '', value: Number(r.value ?? r.revenue ?? 0) || 0 }));
}

// Line / area chart. rows: [{label, value}] or [number].
export function lineChart(rows, {
  height = 200, area = true, format = 'number', color = 'var(--chart-1)', empty = 'No data yet.',
} = {}) {
  const data = series(rows);
  if (data.length < 2) return `<div class="chart-empty">${escapeHtml(empty)}</div>`;

  const W = 600;
  const H = height;
  const padL = 46;
  const padR = 10;
  const padT = 12;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const values = data.map((d) => d.value);
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const x = (i) => padL + (i / (data.length - 1)) * innerW;
  const y = (v) => padT + innerH - ((v - min) / span) * innerH;
  const pts = data.map((d, i) => [x(i), y(d.value)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const baseY = (padT + innerH).toFixed(1);
  const areaPath = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${baseY} L${pts[0][0].toFixed(1)} ${baseY} Z`;

  const grid = [0, 0.5, 1].map((t) => {
    const gy = padT + innerH - t * innerH;
    const val = min + t * span;
    return `<line class="chart-grid" x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}"/>`
      + `<text class="chart-ytick" x="${padL - 6}" y="${(gy + 3).toFixed(1)}" text-anchor="end">${escapeHtml(fmtAxis(val, format))}</text>`;
  }).join('');

  const step = Math.ceil(data.length / 7);
  const xlabels = data.map((d, i) => (i % step === 0 || i === data.length - 1
    ? `<text class="chart-xtick" x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${escapeHtml(d.label)}</text>`
    : '')).join('');

  const dots = data.map((d, i) => {
    const tip = `${d.label ? `${d.label}: ` : ''}${fmtVal(d.value, format)}`;
    return `<circle class="chart-dot" cx="${pts[i][0].toFixed(1)}" cy="${pts[i][1].toFixed(1)}" r="3.5" stroke="${color}" tabindex="0" role="img" aria-label="${escapeHtml(tip)}" data-tip="${escapeHtml(tip)}"><title>${escapeHtml(tip)}</title></circle>`;
  }).join('');

  const gid = `lmc${Math.random().toString(36).slice(2, 8)}`;
  return `<div class="chart" data-chart>
    <svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="group" aria-label="Trend chart">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient></defs>
      ${grid}
      ${area ? `<path class="chart-area" d="${areaPath}" fill="url(#${gid})"/>` : ''}
      <path class="chart-line" d="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" pathLength="1"/>
      ${dots}
      ${xlabels}
    </svg>
    <div class="chart-tip" hidden></div>
  </div>`;
}

// Bar chart (vertical). rows: [{label, value}].
export function barChart(rows, { height = 200, format = 'number', color = 'var(--chart-1)', empty = 'No data yet.' } = {}) {
  const data = series(rows);
  if (!data.length) return `<div class="chart-empty">${escapeHtml(empty)}</div>`;
  const max = Math.max(1, ...data.map((d) => d.value));
  const bars = data.map((d, i) => {
    const h = Math.max(2, Math.round((d.value / max) * 100));
    const tip = `${d.label}: ${fmtVal(d.value, format)}`;
    return `<div class="bar-col" tabindex="0" role="img" aria-label="${escapeHtml(tip)}" data-tip="${escapeHtml(tip)}" style="--i:${i}">
      <span class="bar" style="height:${h}%;background:${color}"></span>
      <span class="bar-label">${escapeHtml(d.label)}</span>
    </div>`;
  }).join('');
  return `<div class="chart" data-chart><div class="bars" style="height:${height}px">${bars}</div><div class="chart-tip" hidden></div></div>`;
}

// Donut chart. segments: [{label, value, color?}].
export function donutChart(segments, {
  size = 180, thickness = 26, centerValue = '', centerLabel = '', format = 'number',
} = {}) {
  const data = (segments || [])
    .map((s, i) => ({ label: s.label ?? '', value: Number(s.value) || 0, color: s.color || `var(--chart-${(i % 6) + 1})` }))
    .filter((s) => s.value > 0);
  const total = data.reduce((a, s) => a + s.value, 0);
  if (!total) return `<div class="chart-empty">No data yet.</div>`;

  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const C = 2 * Math.PI * r;
  let offset = 0;
  const arcs = data.map((s) => {
    const len = (s.value / total) * C;
    const tip = `${s.label}: ${fmtVal(s.value, format)}`;
    const circle = `<circle class="donut-seg" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${thickness}" stroke-dasharray="${len.toFixed(1)} ${(C - len).toFixed(1)}" stroke-dashoffset="${(-offset).toFixed(1)}" tabindex="0" role="img" aria-label="${escapeHtml(tip)}" data-tip="${escapeHtml(tip)}"><title>${escapeHtml(tip)}</title></circle>`;
    offset += len;
    return circle;
  }).join('');
  const legend = data.map((s) => `<li><span class="donut-swatch" style="background:${s.color}"></span><span class="donut-label">${escapeHtml(s.label)}</span><strong>${escapeHtml(fmtVal(s.value, format))}</strong></li>`).join('');

  return `<div class="donut">
    <div class="chart" data-chart>
      <svg class="donut-svg" viewBox="0 0 ${size} ${size}" role="group" aria-label="Breakdown">
        <g transform="rotate(-90 ${cx} ${cy})">${arcs}</g>
        ${centerValue ? `<text class="donut-center-value" x="${cx}" y="${cy - 2}" text-anchor="middle">${escapeHtml(centerValue)}</text>` : ''}
        ${centerLabel ? `<text class="donut-center-label" x="${cx}" y="${cy + 16}" text-anchor="middle">${escapeHtml(centerLabel)}</text>` : ''}
      </svg>
      <div class="chart-tip" hidden></div>
    </div>
    <ul class="donut-legend">${legend}</ul>
  </div>`;
}

// Horizontal bar list. items: [{label, value}].
export function hbarChart(items, { format = 'number', color = 'var(--chart-1)', empty = 'No data yet.' } = {}) {
  const data = series(items).filter((d) => d.label || d.value);
  if (!data.length) return `<div class="chart-empty">${escapeHtml(empty)}</div>`;
  const sorted = data.slice().sort((a, b) => b.value - a.value);
  const max = Math.max(...sorted.map((d) => d.value)) || 1;
  return `<ul class="hbar">${sorted.map((d, i) => `<li>
    <span class="hbar-label">${escapeHtml(d.label)}</span>
    <span class="hbar-track"><span class="hbar-fill" style="width:${((d.value / max) * 100).toFixed(1)}%;background:${d.color || color};--i:${i}"></span></span>
    <span class="hbar-value">${escapeHtml(fmtVal(d.value, format))}</span>
  </li>`).join('')}</ul>`;
}

// Tiny inline trend line.
export function sparkline(values, { width = 120, height = 34, color = 'var(--chart-3)', fill = true } = {}) {
  const nums = (values || []).map((v) => Number(v) || 0);
  if (nums.length < 2) return '';
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  const span = (max - min) || 1;
  const x = (i) => (i / (nums.length - 1)) * width;
  const y = (v) => height - 3 - ((v - min) / span) * (height - 6);
  const pts = nums.map((v, i) => [x(i), y(v)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const areaPath = `${line} L${width} ${height} L0 ${height} Z`;
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${fill ? `<path class="spark-area" d="${areaPath}" fill="${color}"/>` : ''}<path class="spark-line" d="${line}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

// Wire tooltips for every rendered chart under root. Idempotent.
export function initCharts(root = document) {
  root.querySelectorAll('.chart[data-chart]').forEach((box) => {
    if (box.dataset.wired) return;
    box.dataset.wired = '1';
    const tip = box.querySelector('.chart-tip');
    if (!tip) return;

    const show = (e) => {
      const el = e.target.closest('[data-tip]');
      if (!el || !box.contains(el)) return;
      tip.textContent = el.getAttribute('data-tip');
      tip.hidden = false;
      const b = box.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      tip.style.left = `${r.left - b.left + r.width / 2}px`;
      tip.style.top = `${r.top - b.top}px`;
      requestAnimationFrame(() => tip.classList.add('is-visible'));
    };
    const hide = (e) => {
      const el = e.target.closest('[data-tip]');
      if (!el) return;
      tip.classList.remove('is-visible');
      tip.hidden = true;
    };

    box.addEventListener('pointerover', show);
    box.addEventListener('pointerout', hide);
    box.addEventListener('focusin', show);
    box.addEventListener('focusout', hide);
  });
}
