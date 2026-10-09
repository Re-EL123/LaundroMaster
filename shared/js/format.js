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
