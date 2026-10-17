/** Redirect to PayFast hosted checkout via POST (avoids leaking merchant_key in the URL bar). */
export function beginPayfastCheckout(checkout) {
  if (!checkout) return false;

  let action;
  let fields;

  if (typeof checkout === 'string') {
    try {
      const url = new URL(checkout, window.location.origin);
      if (!url.pathname.includes('/eng/process')) {
        window.location.href = checkout;
        return true;
      }
      action = `${url.origin}${url.pathname}`;
      fields = Object.fromEntries(url.searchParams.entries());
    } catch {
      window.location.href = checkout;
      return true;
    }
  } else {
    action = checkout.action;
    fields = checkout.fields;
  }

  if (!action || !fields || typeof fields !== 'object') return false;

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = action;
  form.style.display = 'none';
  for (const [name, value] of Object.entries(fields)) {
    if (value == null || value === '') continue;
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = String(value);
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
  return true;
}
