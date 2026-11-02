// Shared identity chips: profile photos with an initials fallback.
//
// Every place that shows a person or a business needs the same three things:
// an image when one exists, readable initials when it doesn't, and a stable
// colour so the same person always looks the same. Without the fallback a
// missing avatar is a broken image icon, which is why so many surfaces used to
// show nothing at all.
import { escapeHtml } from './format.js';
import { publicUrl } from './uploads.js';

// Deliberately muted and dark enough for white text in both themes.
const PALETTE = ['#C1121F', '#1D4ED8', '#047857', '#B45309', '#6D28D9', '#0E7490', '#9D174D', '#3F6212'];

export function initials(name, fallback = '?') {
  const clean = String(name == null ? '' : name).trim();
  if (!clean) return fallback;
  // People sign up with an email and no name often enough that it is worth
  // turning "thabo.m@example.co.za" into "TM" rather than "TH".
  const base = clean.includes('@') ? clean.split('@')[0] : clean;
  const parts = base.split(/[\s._\-+]+/).filter(Boolean);
  if (!parts.length) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function avatarColor(seed) {
  const s = String(seed == null ? '' : seed);
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 100000;
  return PALETTE[h % PALETTE.length];
}

/**
 * Renders a photo when `path` resolves, otherwise a coloured initials chip.
 * `shape` is 'circle' for people and 'square' for business logos.
 * Pass `alt` when the chip stands alone; leave it empty when a visible label
 * sits next to it, so screen readers do not read the name twice.
 */
export function avatar({
  name, path, bucket = 'avatars', size = 40, shape = 'circle', className = '', alt = '',
} = {}) {
  const px = Number(size) || 40;
  const label = initials(name);
  const shapeClass = shape === 'square' ? ' avatar-square' : '';
  const style = `--avatar-size:${px}px;--avatar-bg:${avatarColor(name || label)}`;
  const extra = className ? ` ${className}` : '';
  const url = path ? publicUrl(bucket, path) : '';

  if (!url) {
    const a11y = alt
      ? ` role="img" aria-label="${escapeHtml(alt)}"`
      : ' aria-hidden="true"';
    return `<span class="avatar avatar-initials${shapeClass}${extra}" style="${style}"${a11y}>${escapeHtml(label)}</span>`;
  }
  return `<img class="avatar${shapeClass}${extra}" style="${style}" src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" width="${px}" height="${px}" loading="lazy" decoding="async">`;
}

/** Convenience wrapper for a laundromat's logo (square, from laundromat-media). */
export function brandAvatar({ name, path, size = 40, className = '', alt = '' } = {}) {
  return avatar({ name, path, bucket: 'laundromat-media', size, shape: 'square', className, alt });
}
