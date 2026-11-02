// Client-side form validation.
//
// The portal and the app forms are `novalidate`, so a mistake used to reach the
// server before the person was told about it — one slow round-trip per typo, and
// a single form-level message that did not say which box was wrong. This reads
// the constraints already declared in the markup (required, minlength, type)
// and puts a specific message under the field that failed.
//
// It is a courtesy, not a gate: the server still validates everything, because
// a browser check can be skipped.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Human-readable name for a control, from its <label> or its own attributes. */
function labelFor(field) {
  const label = field.labels && field.labels[0];
  const text = (label && label.textContent)
    || field.getAttribute('aria-label')
    || field.getAttribute('placeholder')
    || field.name
    || 'This field';
  return text.trim().replace(/[:*]\s*$/, '');
}

function errorId(field) {
  return `${field.id || field.name || 'field'}-error`;
}

function isCheckable(field) {
  return field.type === 'checkbox' || field.type === 'radio';
}

/** Digits only, so "+27 82 123 4567" and "0821234567" are judged the same. */
function digits(value) {
  return String(value).replace(/[^\d]/g, '');
}

/**
 * The first problem with a single control, or null when it looks fine.
 * Returns a sentence ready to show to the person.
 */
export function fieldError(field) {
  if (!field || !field.tagName || field.disabled || field.type === 'hidden') return null;
  if (isCheckable(field) || field.type === 'submit' || field.type === 'button' || field.type === 'file') return null;

  const label = labelFor(field);
  const value = String(field.value == null ? '' : field.value).trim();

  if (field.required && !value) {
    return field.type === 'email' ? 'Enter your email address.' : `${label} is required.`;
  }
  if (!value) return null;

  if (field.type === 'email' && !EMAIL_RE.test(value)) {
    return 'Enter a valid email address, e.g. you@example.com.';
  }
  if (field.type === 'tel') {
    const count = digits(value).length;
    // South African numbers are 9–10 digits locally or 11 with the 27 country
    // code; the wider window keeps foreign numbers from being rejected.
    if (count < 9 || count > 15) return 'Enter a phone number we can reach you on, e.g. 082 123 4567.';
  }

  const min = Number(field.getAttribute('minlength'));
  if (min && value.length < min) return `${label} must be at least ${min} characters.`;

  const max = Number(field.getAttribute('maxlength'));
  if (max && value.length > max) return `${label} must be at most ${max} characters.`;

  if (field.type === 'number' && field.value !== '') {
    const number = Number(value);
    if (!Number.isFinite(number)) return `${label} must be a number.`;
    if (field.getAttribute('min') != null && number < Number(field.getAttribute('min'))) {
      return `${label} must be at least ${field.getAttribute('min')}.`;
    }
    if (field.getAttribute('max') != null && number > Number(field.getAttribute('max'))) {
      return `${label} must be at most ${field.getAttribute('max')}.`;
    }
  }

  const pattern = field.getAttribute('pattern');
  if (pattern) {
    try {
      if (!new RegExp(`^(?:${pattern})$`).test(value)) return `Check the format of ${label.toLowerCase()}.`;
    } catch { /* an unparsable pattern is the markup's problem, not the user's */ }
  }
  return null;
}

/** Creates (or reuses) the message slot that sits under a control. */
function slotFor(field) {
  const id = errorId(field);
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('p');
    el.className = 'field-error';
    el.id = id;
    el.setAttribute('role', 'alert');
    el.dataset.errorFor = field.name || field.id;
    // The password eye sits in a wrapper: drop the message below the whole
    // control rather than inside its flex row.
    const anchor = field.closest('.password-field') || field;
    anchor.insertAdjacentElement('afterend', el);
  }
  return el;
}

/** Marks a control invalid and shows `message` beneath it. */
export function setFieldError(field, message) {
  if (!field) return;
  const el = slotFor(field);
  el.textContent = message;
  field.setAttribute('aria-invalid', 'true');
  const ids = new Set((field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
  ids.add(el.id);
  field.setAttribute('aria-describedby', [...ids].join(' '));
}

/** Removes the message and the invalid state from one control. */
export function clearFieldError(field) {
  if (!field) return;
  const el = document.getElementById(errorId(field));
  if (!el) return;
  const ids = (field.getAttribute('aria-describedby') || '').split(/\s+/).filter((t) => t && t !== el.id);
  if (ids.length) field.setAttribute('aria-describedby', ids.join(' '));
  else field.removeAttribute('aria-describedby');
  field.removeAttribute('aria-invalid');
  el.remove();
}

/** Removes every message this module added inside `form`. */
export function clearErrors(form) {
  if (!form) return;
  form.querySelectorAll('.field-error').forEach((el) => {
    const target = el.dataset.errorFor ? form.elements.namedItem(el.dataset.errorFor) : null;
    if (target) clearFieldError(target);
    else el.remove();
  });
}

/**
 * Checks every control in the form.
 * Returns `{ valid, errors, firstInvalid }` so callers can focus the first
 * problem instead of leaving the person to hunt for it.
 */
export function validateForm(form) {
  if (!form) return { valid: true, errors: [], firstInvalid: null };
  clearErrors(form);
  const errors = [];
  Array.from(form.elements).forEach((field) => {
    const message = fieldError(field);
    if (!message) return;
    setFieldError(field, message);
    errors.push({ field, name: field.name, message });
  });
  return { valid: errors.length === 0, errors, firstInvalid: errors.length ? errors[0].field : null };
}

/**
 * Re-checks a field as soon as the person edits it, so the message disappears
 * the moment the problem is fixed instead of on the next submit.
 */
export function wireLiveValidation(form) {
  if (!form) return;
  form.addEventListener('input', (e) => {
    const field = e.target;
    if (!field || field.getAttribute('aria-invalid') !== 'true') return;
    const message = fieldError(field);
    if (message) setFieldError(field, message);
    else clearFieldError(field);
  });
  form.addEventListener('change', (e) => {
    const field = e.target;
    if (field && field.type === 'radio') clearFieldError(field);
  });
}
