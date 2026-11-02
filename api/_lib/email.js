// Transactional email via Resend.
//
// Every message LaundroMaster sends is rendered here so the brand stays
// consistent, and every send degrades quietly: email must never break a request
// whose real work already succeeded in the database.
//
// Configuration:
//   RESEND_API_KEY      (EMAIL_PROVIDER_API_KEY also accepted) — required to send
//   EMAIL_FROM          e.g. "LaundroMaster <no-reply@re-el.co.za>"
//                       Must be a domain verified in Resend. The app's web
//                       domain (laundromaster.re-el.co.za) is a CNAME to GitHub
//                       Pages and cannot host the DKIM/SPF records Resend needs,
//                       so mail must be sent from the verified apex domain.
//   PUBLIC_APP_URL      public origin of the frontend, used for links and images

import { appBase } from './req.js';
import { adminClient } from './supabase-admin.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'LaundroMaster <no-reply@re-el.co.za>';

const BRAND = {
  name: 'LaundroMaster',
  accent: '#D90429',
  ink: '#111111',
  muted: '#6B7280',
  line: '#E4E4E7',
  surface: '#F7F7F8',
};

export function emailApiKey() {
  return String(process.env.RESEND_API_KEY || process.env.EMAIL_PROVIDER_API_KEY || '').trim();
}

export function emailConfigured() {
  return Boolean(emailApiKey());
}

export function emailFrom() {
  return String(process.env.EMAIL_FROM || '').trim() || DEFAULT_FROM;
}

export function appLink(path = '') {
  return `${appBase()}/${String(path || '').replace(/^\/+/, '')}`;
}

export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function money(amount, currency = 'ZAR') {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '';
  try {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function detailRows(details = []) {
  return details
    .filter((row) => row && row.label != null)
    .map((row) => `<tr>
        <td style="padding:7px 0;font-size:14px;line-height:1.5;color:${BRAND.muted}">${escapeHtml(row.label)}</td>
        <td align="right" style="padding:7px 0;font-size:14px;line-height:1.5;color:${BRAND.ink};font-weight:${row.emphasis ? 700 : 600}">${escapeHtml(row.value)}</td>
      </tr>`)
    .join('');
}

/** Branded HTML shell shared by every LaundroMaster email. */
export function renderEmail({
  preheader = '',
  heading,
  paragraphs = [],
  details = [],
  ctaLabel = null,
  ctaUrl = null,
  note = null,
  signOff = null,
} = {}) {
  const body = paragraphs
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${BRAND.ink}">${escapeHtml(p)}</p>`)
    .join('');

  const table = details.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;border-top:1px solid ${BRAND.line};border-bottom:1px solid ${BRAND.line}">${detailRows(details)}</table>`
    : '';

  const button = ctaLabel && ctaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr>
        <td style="border-radius:10px;background:${BRAND.accent}">
          <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(ctaLabel)}</a>
        </td>
      </tr></table>`
    : '';

  const footnote = note
    ? `<p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:${BRAND.muted}">${escapeHtml(note)}</p>`
    : '';

  const sign = signOff
    ? `<p style="margin:0;font-size:14px;line-height:1.6;color:${BRAND.ink}">${escapeHtml(signOff)}</p>`
    : `<p style="margin:0;font-size:14px;line-height:1.6;color:${BRAND.ink}">— The ${BRAND.name} team</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(heading || BRAND.name)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.surface};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.surface};padding:28px 16px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${BRAND.line};border-radius:16px;overflow:hidden">
      <tr><td style="padding:22px 28px;border-bottom:3px solid ${BRAND.accent}">
        <img src="${escapeHtml(appLink('shared/assets/logo.png'))}" alt="${BRAND.name}" height="30" style="height:30px;display:block">
      </td></tr>
      <tr><td style="padding:28px">
        <h1 style="margin:0 0 16px;font-size:21px;line-height:1.35;color:${BRAND.ink}">${escapeHtml(heading || BRAND.name)}</h1>
        ${body}
        ${table}
        ${button}
        ${footnote}
        ${sign}
      </td></tr>
      <tr><td style="padding:18px 28px;background:${BRAND.surface};border-top:1px solid ${BRAND.line}">
        <p style="margin:0;font-size:12px;line-height:1.6;color:${BRAND.muted}">
          You received this email because you have a ${BRAND.name} account.
          If this was not you, you can ignore this message.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/** Plain-text alternative, so providers and screen readers get a clean copy. */
export function renderText({ heading, paragraphs = [], details = [], ctaLabel = null, ctaUrl = null, note = null, signOff = null } = {}) {
  const lines = [
    heading || BRAND.name,
    '',
    ...paragraphs.filter(Boolean),
  ];
  if (details.length) {
    lines.push('');
    for (const row of details.filter((r) => r && r.label != null)) {
      lines.push(`${row.label}: ${row.value}`);
    }
  }
  if (ctaLabel && ctaUrl) lines.push('', `${ctaLabel}: ${ctaUrl}`);
  if (note) lines.push('', note);
  lines.push('', signOff || `— The ${BRAND.name} team`);
  return lines.join('\n');
}

/** Low-level send. Never throws: callers get `{ sent: false, reason }` instead. */
export async function sendEmail({ to, subject, html, text = null, replyTo = null } = {}) {
  const key = emailApiKey();
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!key) return { sent: false, reason: 'not_configured' };
  if (!recipients.length || !subject) return { sent: false, reason: 'missing_recipient_or_subject' };

  const payload = { from: emailFrom(), to: recipients, subject };
  if (html) payload.html = html;
  if (text) payload.text = text;
  if (replyTo) payload.reply_to = replyTo;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { sent: false, reason: 'provider_error', status: res.status, error: (data && (data.message || data.name)) || `HTTP ${res.status}` };
    }
    return { sent: true, id: (data && data.id) || null };
  } catch (err) {
    return { sent: false, reason: 'network_error', error: err && err.message };
  }
}

/** Render a branded message and send it in one step. */
export async function sendBrandedEmail(to, { subject, ...content } = {}) {
  if (!subject) return { sent: false, reason: 'missing_subject' };
  return sendEmail({
    to,
    subject,
    html: renderEmail(content),
    text: renderText(content),
  });
}

// ---------------------------------------------------------------------------
// Notification-driven email
// ---------------------------------------------------------------------------

// Only transactional events are emailed. Chat messages, admin broadcasts and
// in-app "system" pings stay in-app/push: emailing them would train people to
// ignore the messages that actually matter.
const EMAILABLE_TYPES = new Set([
  'booking_receipt',
  'booking_pending_acceptance',
  'booking_accepted',
  'booking_pickup_scheduled',
  'booking_collected',
  'booking_washing',
  'booking_drying',
  'booking_ironing',
  'booking_ready',
  'booking_out_for_delivery',
  'booking_completed',
  'booking_cancelled',
  'booking_rejected',
  'booking_payment_failed',
  'booking_paid',
  'booking_assigned',
  'refund',
  'refund_requested',
  'verification_approved',
  'verification_rejected',
  'verification_suspended',
  'verification',
  'staff_invite',
  'staff_accepted',
  'payout_requested',
  'payout_processing',
  'payout_paid',
  'payout_rejected',
  'subscription_active',
  'referral_reward',
]);

const CTA_LABELS = {
  'apps/owner/': 'Open the owner dashboard',
  'apps/admin/': 'Open the admin console',
  'apps/customer/pages/orders': 'View your orders',
  'apps/customer/pages/order-details': 'View your order',
  'apps/customer/pages/profile': 'Open your profile',
};

function ctaLabelFor(url) {
  if (!url) return 'Open LaundroMaster';
  const match = Object.keys(CTA_LABELS).find((prefix) => url.startsWith(prefix));
  return match ? CTA_LABELS[match] : 'Open LaundroMaster';
}

export function emailContentForNotification({ title, body, url } = {}) {
  if (!title) return null;
  return {
    preheader: body || title,
    heading: title,
    paragraphs: body ? [body] : [],
    ctaLabel: ctaLabelFor(url),
    ctaUrl: appLink(url || ''),
  };
}

async function addressFor(supa, userId) {
  const client = supa || adminClient();
  if (!client || !userId) return null;
  const { data } = await client.from('profiles').select('email, full_name').eq('id', userId).maybeSingle();
  if (data && data.email) return { email: data.email, name: data.full_name || null };
  // Profiles are created lazily on first login, so fall back to the auth record.
  try {
    const { data: authUser } = await client.auth.admin.getUserById(userId);
    if (authUser && authUser.user && authUser.user.email) {
      return { email: authUser.user.email, name: (authUser.user.user_metadata && authUser.user.user_metadata.full_name) || null };
    }
  } catch { /* not fatal — we simply skip the email */ }
  return null;
}

/**
 * Send the email that belongs to an in-app notification.
 *
 * `email` may be:
 *   - `false`  — never email this notification
 *   - an object — `{ subject, heading, paragraphs, details, ... }` for a message
 *     whose email copy differs from the in-app copy (receipts, invoices)
 *   - omitted  — the notification whitelist decides
 */
export async function sendNotificationEmail(supa, userId, { type, title, body, url, email } = {}) {
  if (email === false || !emailConfigured()) return { sent: false, reason: 'skipped' };

  let content = email && typeof email === 'object' ? email : null;
  if (!content) {
    if (!EMAILABLE_TYPES.has(String(type || ''))) return { sent: false, reason: 'not_emailable' };
    content = emailContentForNotification({ title, body, url });
  }
  if (!content) return { sent: false, reason: 'no_content' };

  const recipient = await addressFor(supa, userId);
  if (!recipient) return { sent: false, reason: 'no_address' };

  const paragraphs = [...(content.paragraphs || [])];
  if (recipient.name && !content.signOff) paragraphs.unshift(`Hi ${recipient.name},`);

  return sendBrandedEmail(recipient.email, { ...content, paragraphs });
}
