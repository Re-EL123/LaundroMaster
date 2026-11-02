import {
  login, register, me, homeForRole, getSession,
  requestPasswordReset, resetPassword, consumeAuthRedirect, logout,
} from '../../../shared/js/auth-client.js';
import { register as registerServiceWorker, wireInstallButton } from '../../../shared/js/pwa.js';
import { validateForm, setFieldError, wireLiveValidation } from '../../../shared/js/validate.js';

registerServiceWorker();

const installBtn = document.createElement('button');
installBtn.type = 'button';
installBtn.className = 'btn btn-secondary';
installBtn.hidden = true;
installBtn.textContent = 'Install app';
(document.querySelector('.portal-foot') || document.body).appendChild(installBtn);
wireInstallButton(installBtn);


const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const forgotForm = document.getElementById('forgotForm');
const resetForm = document.getElementById('resetForm');
const tabs = document.querySelector('.portal-tabs');

function nextTarget(role) {
  const next = new URLSearchParams(location.search).get('next');
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  return homeForRole(role);
}

function showTab(which) {
  const isLogin = which === 'login';
  const isRegister = which === 'register';
  // Forgot/reset are reached from the sign-in form, so the tabs keep whatever
  // state they were in rather than highlighting something that is not shown.
  if (isLogin || isRegister) {
    tabLogin.classList.toggle('is-active', isLogin);
    tabRegister.classList.toggle('is-active', isRegister);
    tabLogin.setAttribute('aria-selected', String(isLogin));
    tabRegister.setAttribute('aria-selected', String(isRegister));
    tabs.dataset.active = which;
  }
  for (const [name, form] of Object.entries({ login: loginForm, register: registerForm, forgot: forgotForm, reset: resetForm })) {
    form.hidden = name !== which;
  }
  const focus = {
    login: 'loginEmail',
    register: 'regName',
    forgot: 'forgotEmail',
    reset: 'resetPassword',
  }[which];
  const field = focus && document.getElementById(focus);
  if (field) field.focus({ preventScroll: true });
}

tabLogin.addEventListener('click', () => showTab('login'));
tabRegister.addEventListener('click', () => showTab('register'));

/* Password visibility toggles */
document.querySelectorAll('.password-toggle').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.toggle);
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-pressed', String(show));
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
});

function setMsg(el, text, kind) {
  el.textContent = text || '';
  el.className = `form-msg${kind ? ` is-${kind}` : ''}`;
}

function setLoading(form, loading) {
  const btn = form.querySelector('button[type="submit"]');
  if (!btn) return;
  if (loading) {
    btn.dataset.label = btn.textContent;
    btn.textContent = btn.dataset.loading || 'Working…';
  } else if (btn.dataset.label) {
    btn.textContent = btn.dataset.label;
  }
  btn.disabled = loading;
  form.setAttribute('aria-busy', String(loading));
  form.querySelectorAll('input, select').forEach((el) => { el.disabled = loading; });
}

function friendly(err) {
  const raw = String((err && err.message) || '').toLowerCase();
  if (raw.includes('not_configured') || raw.includes('supabase not configured')) {
    return 'Sign-in is temporarily unavailable. Please try again later.';
  }
  if (raw.includes('rate limit')) return 'Too many attempts. Please wait a moment and try again.';
  if (raw.includes('already registered') || raw.includes('already exists')) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (raw.includes('email not confirmed')) return 'Please confirm your email address, then sign in.';
  if (raw.includes('password') && raw.includes('6')) return 'Passwords must be at least 6 characters.';
  if (raw.includes('phone')) return 'Please enter a valid phone number.';
  if (raw.includes('failed to fetch') || raw.includes('networkerror')) {
    return 'Network error. Check your connection and try again.';
  }
  return (err && err.message) || 'Something went wrong. Please try again.';
}

/* Catch the obvious mistakes before the round-trip, and clear the message as
   soon as the field is corrected. */
[loginForm, registerForm, forgotForm, resetForm].forEach(wireLiveValidation);

function failField(field, message, msgEl) {
  setFieldError(field, message);
  if (msgEl) setMsg(msgEl, '');
  field.focus({ preventScroll: false });
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('loginMsg');
  setMsg(msg, '');
  const check = validateForm(loginForm);
  if (!check.valid) return failField(check.firstInvalid, check.errors[0].message);
  setLoading(loginForm, true);
  try {
    const session = await login(loginForm.email.value.trim(), loginForm.password.value);
    setMsg(document.getElementById('loginMsg'), 'Signed in — taking you in…', 'success');
    location.href = nextTarget(session.role);
  } catch (err) {
    setMsg(document.getElementById('loginMsg'), friendly(err), 'error');
    setLoading(loginForm, false);
  }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('registerMsg');
  setMsg(msg, '');
  const check = validateForm(registerForm);
  if (!check.valid) return failField(check.firstInvalid, check.errors[0].message);
  const accountType = (registerForm.querySelector('input[name="account_type"]:checked') || {}).value || 'customer';
  setLoading(registerForm, true);
  try {
    const result = await register({
      email: document.getElementById('regEmail').value.trim(),
      password: document.getElementById('regPassword').value,
      full_name: document.getElementById('regName').value.trim(),
      phone: document.getElementById('regPhone').value.trim(),
      account_type: accountType,
      ref: new URLSearchParams(location.search).get('ref') || undefined,
    });
    if (result.email_confirmation_required) {
      setLoading(registerForm, false);
      document.getElementById('loginEmail').value = document.getElementById('regEmail').value.trim();
      showTab('login');
      setMsg(document.getElementById('loginMsg'), 'Account created. Check your email to confirm, then sign in.', 'success');
    } else {
      setMsg(msg, 'Account created — redirecting…', 'success');
      location.href = nextTarget(result.session.role);
    }
  } catch (err) {
    setMsg(msg, friendly(err), 'error');
    setLoading(registerForm, false);
  }
});

document.getElementById('forgotLink').addEventListener('click', () => {
  document.getElementById('forgotEmail').value = loginForm.email.value.trim();
  setMsg(document.getElementById('forgotMsg'), '');
  showTab('forgot');
});

document.getElementById('forgotBack').addEventListener('click', () => showTab('login'));

forgotForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('forgotMsg');
  setMsg(msg, '');
  const check = validateForm(forgotForm);
  if (!check.valid) return failField(check.firstInvalid, check.errors[0].message);
  setLoading(forgotForm, true);
  try {
    await requestPasswordReset(document.getElementById('forgotEmail').value.trim());
    setLoading(forgotForm, false);
    // Deliberately identical whether or not the address has an account.
    setMsg(msg, 'If that email has an account, a reset link is on its way. Check your inbox and spam folder.', 'success');
  } catch (err) {
    setMsg(msg, friendly(err), 'error');
    setLoading(forgotForm, false);
  }
});

resetForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('resetMsg');
  setMsg(msg, '');
  const check = validateForm(resetForm);
  if (!check.valid) return failField(check.firstInvalid, check.errors[0].message);
  const password = document.getElementById('resetPassword').value;
  const confirmField = document.getElementById('resetConfirm');
  if (password !== confirmField.value) {
    return failField(confirmField, 'Those passwords do not match.');
  }
  setLoading(resetForm, true);
  try {
    await resetPassword(password);
    // The recovery link signs the account in; end that session and make them
    // prove the new password works.
    await logout();
    setLoading(resetForm, false);
    resetForm.reset();
    showTab('login');
    setMsg(document.getElementById('loginMsg'), 'Password updated. Sign in with your new password.', 'success');
  } catch (err) {
    setMsg(msg, friendly(err), 'error');
    setLoading(resetForm, false);
  }
});

/* Emailed links (confirmation, recovery) land back here with the session in the
   URL fragment. Confirmation signs straight in; recovery asks for a new password. */
(async () => {
  const redirect = consumeAuthRedirect();
  if (redirect) {
    if (redirect.error) {
      showTab('login');
      setMsg(document.getElementById('loginMsg'), friendly({ message: redirect.error }), 'error');
      return;
    }
    if (redirect.type === 'recovery') { showTab('reset'); return; }
    try {
      const user = await me();
      if (user && user.role) { location.href = nextTarget(user.role); return; }
    } catch { /* fall through to the sign-in form */ }
    showTab('login');
    setMsg(document.getElementById('loginMsg'), 'Email confirmed. Sign in to continue.', 'success');
    return;
  }

  /* Already signed in? Go straight to the right app. */
  if (!getSession()) return;
  try {
    const user = await me();
    if (user && user.role) location.href = nextTarget(user.role);
  } catch { /* offline or transient server error — stay on sign-in */ }
})();
