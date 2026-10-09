export function escapeHtml(value) {
  if (value == null) return '';
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[c]));
}

export function currency(amount, cur = 'ZAR') {
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: cur }).format(n);
  } catch {
    return `R${n.toFixed(2)}`;
  }
}

export function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

export function param(name) {
  return new URLSearchParams(location.search).get(name);
}

export function formatDateOnly(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium' }).format(d);
}

export function relativeTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const abs = Math.abs(diff);
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;
  const week = 7 * day;
  const fmt = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'} ${diff >= 0 ? 'ago' : 'from now'}`;
  if (abs < min) return 'just now';
  if (abs < hour) return fmt(Math.round(abs / min), 'min');
  if (abs < day) return fmt(Math.round(abs / hour), 'hour');
  if (abs < week) return fmt(Math.round(abs / day), 'day');
  return formatDateOnly(value);
}

export function pct(value, digits = 0) {
  const n = Number(value) || 0;
  return `${n.toFixed(digits)}%`;
}

export function titleCase(value) {
  if (!value) return '';
  return String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_LABELS = {
  pending_payment: 'Pending payment',
  pending_acceptance: 'Awaiting acceptance',
  accepted: 'Accepted',
  pickup_scheduled: 'Pickup scheduled',
  collected: 'Collected',
  washing: 'Washing',
  drying: 'Drying',
  ironing: 'Ironing',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
  payment_failed: 'Payment failed',
  refund_pending: 'Refund pending',
  pending: 'Pending',
  approved: 'Approved',
  suspended: 'Suspended',
  active: 'Active',
};

export function statusLabel(status) {
  if (!status) return '';
  return STATUS_LABELS[status] || String(status).replace(/_/g, ' ');
}

export function statusTone(status) {
  if (['completed', 'approved', 'active', 'ready'].includes(status)) return 'success';
  if (['cancelled', 'rejected', 'payment_failed', 'suspended'].includes(status)) return 'danger';
  if (['pending_payment', 'pending_acceptance', 'pending', 'refund_pending'].includes(status)) return 'warning';
  return 'info';
}
