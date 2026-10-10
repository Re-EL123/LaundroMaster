// Reusable dashboard web components. Light DOM (no shadow) so the shared
// stylesheet applies. Both fall back gracefully if JS is slow.

import { statTile, animateCounts } from './ui.js';
import { lineChart, barChart, donutChart, hbarChart, initCharts } from './charts.js';

function parse(json, fallback) {
  if (!json) return fallback;
  try { return JSON.parse(json); } catch { return fallback; }
}

class LmStat extends HTMLElement {
  static get observedAttributes() {
    return ['label', 'value', 'hint', 'tone', 'href', 'format', 'animate', 'spark', 'delta'];
  }

  connectedCallback() { this.render(); }
  attributeChangedCallback() { if (this.isConnected) this.render(); }

  render() {
    const animate = this.hasAttribute('animate');
    const raw = this.getAttribute('value');
    const value = animate ? Number(raw) : (raw ?? '');
    this.innerHTML = statTile({
      label: this.getAttribute('label') || '',
      value,
      hint: this.getAttribute('hint') || '',
      tone: this.getAttribute('tone') || '',
      href: this.getAttribute('href') || undefined,
      animate,
      format: this.getAttribute('format') || 'number',
      spark: parse(this.getAttribute('spark'), null),
      delta: parse(this.getAttribute('delta'), null),
    });
    animateCounts(this);
  }
}

class LmChart extends HTMLElement {
  static get observedAttributes() { return ['type', 'data', 'options']; }

  connectedCallback() { this.render(); }
  attributeChangedCallback() { if (this.isConnected) this.render(); }

  render() {
    const type = this.getAttribute('type') || 'line';
    const data = parse(this.getAttribute('data'), []);
    const options = parse(this.getAttribute('options'), {});
    if (type === 'donut') this.innerHTML = donutChart(data, options);
    else if (type === 'hbar') this.innerHTML = hbarChart(data, options);
    else if (type === 'bar') this.innerHTML = barChart(data, options);
    else this.innerHTML = lineChart(data, options);
    initCharts(this);
  }
}

if (typeof customElements !== 'undefined') {
  if (!customElements.get('lm-stat')) customElements.define('lm-stat', LmStat);
  if (!customElements.get('lm-chart')) customElements.define('lm-chart', LmChart);
}
