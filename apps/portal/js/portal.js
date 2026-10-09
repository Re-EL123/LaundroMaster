import { login, register, me, homeForRole, getSession } from '../../../shared/js/auth-client.js';

function nextTarget(role) {
  const next = new URLSearchParams(location.search).get('next');
  if (next && next.startsWith('/')) return next;
  return homeForRole(role);
}

const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

function showTab(which) {
  const isLogin = which === 'login';
  tabLogin.classList.toggle('is-active', isLogin);
  tabRegister.classList.toggle('is-active', !isLogin);
  tabLogin.setAttribute('aria-selected', String(isLogin));
  tabRegister.setAttribute('aria-selected', String(!isLogin));
  loginForm.hidden = !isLogin;
  registerForm.hidden = isLogin;
}

tabLogin.addEventListener('click', () => showTab('login'));
tabRegister.addEventListener('click', () => showTab('register'));

function setMsg(el, text, kind) {
  el.textContent = text;
  el.className = `form-msg${kind ? ` is-${kind}` : ''}`;
}

function setLoading(btn, loading, label) {
  btn.disabled = loading;
  if (loading) {
    btn.dataset.label = btn.textContent;
    btn.textContent = label;
  } else if (btn.dataset.label) {
    btn.textContent = btn.dataset.label;
  }
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('loginMsg');
  const btn = document.getElementById('loginBtn');
  setMsg(msg, '', '');
  setLoading(btn, true, 'Signing in…');
  try {
    const session = await login(loginForm.email.value.trim(), loginForm.password.value);
    setMsg(msg, 'Success — redirecting…', 'success');
    location.href = nextTarget(session.role);
  } catch (err) {
    setMsg(msg, err.message, 'error');
    setLoading(btn, false);
  }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('registerMsg');
  const btn = document.getElementById('registerBtn');
  setMsg(msg, '', '');
  setLoading(btn, true, 'Creating…');
  try {
    const result = await register({
      email: registerForm.email.value.trim(),
      password: registerForm.password.value,
      full_name: registerForm.full_name.value.trim(),
      account_type: registerForm.account_type.value,
    });
    if (result.email_confirmation_required) {
      setMsg(msg, 'Check your email to confirm your account, then sign in.', 'success');
      setLoading(btn, false);
      showTab('login');
    } else {
      setMsg(msg, 'Account created — redirecting…', 'success');
      location.href = nextTarget(result.session.role);
    }
  } catch (err) {
    setMsg(msg, err.message, 'error');
    setLoading(btn, false);
  }
});

// Already signed in? Route straight to the portal for the user's role.
(async () => {
  if (!getSession()) return;
  const user = await me();
  if (user && user.role) location.href = nextTarget(user.role);
})();
