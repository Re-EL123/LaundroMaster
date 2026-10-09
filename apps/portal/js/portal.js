import { login, register, me, homeForRole, getSession } from '../../../shared/js/auth-client.js';
import { register as registerServiceWorker, wireInstallButton } from '../../../shared/js/pwa.js';

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
const tabs = document.querySelector('.portal-tabs');

function nextTarget(role) {
  const next = new URLSearchParams(location.search).get('next');
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  return homeForRole(role);
}

function showTab(which) {
  const isLogin = which === 'login';
  tabLogin.classList.toggle('is-active', isLogin);
  tabRegister.classList.toggle('is-active', !isLogin);
  tabLogin.setAttribute('aria-selected', String(isLogin));
  tabRegister.setAttribute('aria-selected', String(!isLogin));
  loginForm.hidden = !isLogin;
  registerForm.hidden = isLogin;
  tabs.dataset.active = which;
  const focus = isLogin ? document.getElementById('loginEmail') : document.getElementById('regName');
  focus.focus({ preventScroll: true });
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
    btn.textContent = form.id === 'registerForm' ? 'Creating account…' : 'Signing in…';
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
  if (raw.includes('failed to fetch') || raw.includes('networkerror')) {
    return 'Network error. Check your connection and try again.';
  }
  return (err && err.message) || 'Something went wrong. Please try again.';
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('loginMsg');
  setMsg(msg, '');
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
  const accountType = (registerForm.querySelector('input[name="account_type"]:checked') || {}).value || 'customer';
  setLoading(registerForm, true);
  try {
    const result = await register({
      email: document.getElementById('regEmail').value.trim(),
      password: document.getElementById('regPassword').value,
      full_name: document.getElementById('regName').value.trim(),
      account_type: accountType,
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

/* Already signed in? Go straight to the right app. */
(async () => {
  if (!getSession()) return;
  const user = await me();
  if (user && user.role) location.href = nextTarget(user.role);
})();
