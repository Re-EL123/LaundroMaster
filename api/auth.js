import { createHandler } from './_lib/handler.js';
import { successEnvelope, errorEnvelope, ApiError } from './_lib/errors.js';
import { anonClient } from './_lib/supabase-anon.js';
import { adminClient } from './_lib/supabase-admin.js';
import { query, body, bearer } from './_lib/req.js';
import { getUser, requireUser, topRole, ROLE_PRIORITY } from './_lib/auth.js';
import { z } from 'zod';
import { profileUpdate, addressSave } from './_lib/validation.js';
import { enforceRateLimit } from './_lib/ratelimit.js';
import { sendBrandedEmail, emailConfigured, appLink } from './_lib/email.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Use at least 8 characters'),
  full_name: z.string().min(2).optional(),
  account_type: z.enum(['customer', 'owner']).default('customer'),
  ref: z.string().max(20).optional(),
});

const forgotPasswordSchema = z.object({ email: z.string().email() });

const resetPasswordSchema = z.object({ password: z.string().min(8, 'Use at least 8 characters') });

// Where Supabase sends people back to after they follow an emailed link.
// Must be listed in Supabase → Authentication → URL Configuration → Redirect URLs.
function portalRedirect() {
  return appLink('apps/portal/index.html');
}

async function resolveRole(admin, userId) {
  if (!admin || !userId) return 'customer';
  const { data } = await admin.from('user_roles').select('role').eq('user_id', userId);
  const roles = (data || []).map((r) => r.role);
  return topRole(roles) || ROLE_PRIORITY[ROLE_PRIORITY.length - 1];
}

// Provision a *confirmed* account. Called on registration only when Supabase
// returns a session (email confirmation disabled) and on every successful
// login, so unconfirmed sign-ups never receive roles or a laundromat.
async function provisionUser(admin, user, { accountType = 'customer', fullName, ref } = {}) {
  if (!admin || !user || !user.id) return;

  const type = user.user_metadata?.account_type || accountType || 'customer';
  const name = fullName || user.user_metadata?.full_name || null;

  await admin.from('profiles').upsert({
    id: user.id,
    email: user.email,
    full_name: name,
    account_status: 'active',
  }, { onConflict: 'id' });

  const roles = ['customer'];
  if (type === 'owner') roles.push('owner');
  await admin.from('user_roles').upsert(
    roles.map((role) => ({ user_id: user.id, role })),
    { onConflict: 'user_id,role', ignoreDuplicates: true }
  );

  if (type === 'owner') {
    const { data: existing } = await admin.from('laundromats').select('id').eq('owner_id', user.id).limit(1);
    if (!existing || existing.length === 0) {
      await admin.from('laundromats').insert({
        owner_id: user.id,
        name: name ? `${name}'s Laundry` : 'My Laundry',
        verification_status: 'pending',
        business_status: 'pending',
      });
    }
  }

  const referralCode = ref || user.user_metadata?.ref;
  if (referralCode && type !== 'owner') {
    try {
      const code = String(referralCode).trim().toUpperCase();
      const { data: existingReferral } = await admin.from('referrals')
        .select('id').eq('referee_id', user.id).maybeSingle();
      if (!existingReferral) {
        const { data: referrer } = await admin.from('profiles')
          .select('id').eq('referral_code', code).maybeSingle();
        if (referrer && referrer.id !== user.id) {
          await admin.from('referrals').insert({
            referrer_id: referrer.id,
            referee_id: user.id,
            code,
            status: 'pending',
          });
        }
      }
    } catch { /* referral linking is best effort */ }
  }
}

// Confirm a new account with a link we mail ourselves, so the message is
// branded and not subject to Supabase's shared SMTP rate limits.
async function sendConfirmationEmail(admin, { email, password, full_name, account_type, ref }) {
  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'signup',
      email,
      password,
      options: {
        data: { full_name, account_type, ref: ref || null },
        redirectTo: portalRedirect(),
      },
    });
    const link = data && data.properties && data.properties.action_link;
    if (error || !link) return { ok: false, created: false, error };

    const result = await sendBrandedEmail(email, {
      subject: 'Confirm your LaundroMaster email',
      preheader: 'One tap and your account is ready.',
      heading: full_name ? `Welcome, ${full_name}` : 'Welcome to LaundroMaster',
      paragraphs: [
        'Confirm this email address to activate your LaundroMaster account.',
        'This link expires in 24 hours. If you did not create an account, you can safely ignore this email.',
      ],
      ctaLabel: 'Confirm my email',
      ctaUrl: link,
    });
    return { ok: Boolean(result.sent), created: true, user: data.user || null, error: result.error };
  } catch (err) {
    return { ok: false, created: false, error: err };
  }
}

export default createHandler(async function handler(req, res) {
  const q = query(req);
  const action = q.action || '';
  const anon = anonClient();
  const admin = adminClient();

  if (!anon || !admin) {
    return res.status(503).json(errorEnvelope(new ApiError('NOT_CONFIGURED', 'Supabase not configured', 503)));
  }

  if (req.method === 'POST') {
    if (action === 'login') {
      const parsed = loginSchema.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { email, password } = parsed.data;
      await enforceRateLimit(admin, req, 'login-ip', { limit: 20, windowSeconds: 900 });
      await enforceRateLimit(admin, req, 'login-account', { limit: 8, windowSeconds: 900, identifier: email.toLowerCase() });
      const { data, error } = await anon.auth.signInWithPassword({ email, password });
      if (error || !data.session) return res.status(401).json(errorEnvelope(new ApiError('INVALID_CREDENTIALS', 'Incorrect email or password', 401)));
      const { data: profile } = await admin.from('profiles').select('account_status').eq('id', data.user.id).maybeSingle();
      if (profile && profile.account_status !== 'active') {
        return res.status(403).json(errorEnvelope(new ApiError('ACCOUNT_SUSPENDED', 'This account is not active', 403)));
      }
      // A confirmed login is the earliest safe moment to grant roles: accounts
      // created with email confirmation on have no profile until now.
      await provisionUser(admin, data.user, {});
      const role = await resolveRole(admin, data.user.id);
      return res.status(200).json(successEnvelope({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user: { id: data.user.id, email: data.user.email },
        role,
      }));
    }

    if (action === 'register') {
      const parsed = registerSchema.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { email, password, full_name, account_type, ref } = parsed.data;
      await enforceRateLimit(admin, req, 'register-ip', { limit: 10, windowSeconds: 3600 });
      await enforceRateLimit(admin, req, 'register-email', { limit: 3, windowSeconds: 3600, identifier: email.toLowerCase() });

      // With a mail provider configured we create the account and send the
      // confirmation link ourselves: branded, and not queued behind Supabase's
      // shared SMTP.
      if (emailConfigured()) {
        const sent = await sendConfirmationEmail(admin, { email, password, full_name, account_type, ref });
        if (sent.ok) {
          return res.status(201).json(successEnvelope({
            user: sent.user ? { id: sent.user.id, email: sent.user.email } : null,
            session: null,
            role: account_type,
            email_confirmation_required: true,
          }));
        }
        // The account exists but the mail did not go out. Falling through to
        // signUp() would silently do nothing for an existing user, so say so.
        if (sent.created) {
          return res.status(502).json(errorEnvelope(new ApiError(
            'EMAIL_SEND_FAILED',
            'Your account was created but the confirmation email could not be sent. Use "Forgot password" to request a new link.',
            502,
          )));
        }
        // generateLink refused (typically "already registered"): let the normal
        // sign-up path answer, which does not reveal whether the account exists.
      }

      const { data, error } = await anon.auth.signUp({
        email,
        password,
        options: { data: { full_name, account_type, ref: ref || null } },
      });
      if (error) return res.status(400).json(errorEnvelope(new ApiError('REGISTRATION_FAILED', error.message)));

      // Supabase returns a user with no identities when the email is already
      // registered; do not leak that or provision anything.
      const isNewUser = Boolean(data.user && Array.isArray(data.user.identities) && data.user.identities.length > 0);
      if (isNewUser && data.session) {
        await provisionUser(admin, data.user, { accountType: account_type, fullName: full_name, ref });
      }
      const role = data.user && data.session ? await resolveRole(admin, data.user.id) : account_type;
      return res.status(201).json(successEnvelope({
        user: data.user ? { id: data.user.id, email: data.user.email } : null,
        session: data.session ? { access_token: data.session.access_token, refresh_token: data.session.refresh_token } : null,
        role,
        email_confirmation_required: !data.session,
      }));
    }

    if (action === 'forgot-password') {
      const parsed = forgotPasswordSchema.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const email = parsed.data.email;
      await enforceRateLimit(admin, req, 'forgot-ip', { limit: 10, windowSeconds: 3600 });
      await enforceRateLimit(admin, req, 'forgot-email', { limit: 3, windowSeconds: 3600, identifier: email.toLowerCase() });

      // Always answer identically so this endpoint cannot be used to discover
      // which addresses have accounts.
      const done = () => res.status(200).json(successEnvelope({ sent: true }));

      if (!emailConfigured()) {
        // No mail provider yet: let Supabase send its own recovery email.
        try { await anon.auth.resetPasswordForEmail(email, { redirectTo: portalRedirect() }); } catch { /* stay silent */ }
        return done();
      }

      try {
        const { data, error } = await admin.auth.admin.generateLink({
          type: 'recovery',
          email,
          options: { redirectTo: portalRedirect() },
        });
        const link = data && data.properties && data.properties.action_link;
        if (!error && link) {
          await sendBrandedEmail(email, {
            subject: 'Reset your LaundroMaster password',
            preheader: 'Choose a new password — the link expires shortly.',
            heading: 'Reset your password',
            paragraphs: [
              'We received a request to reset the password for your LaundroMaster account.',
              'This link can only be used once and expires in 60 minutes. If you did not ask for a reset, you can ignore this email — your password stays unchanged.',
            ],
            ctaLabel: 'Choose a new password',
            ctaUrl: link,
          });
        }
      } catch { /* never reveal whether the address exists */ }
      return done();
    }

    if (action === 'reset-password') {
      const ctx = await requireUser(req);
      const parsed = resetPasswordSchema.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { error } = await admin.auth.admin.updateUserById(ctx.user.id, { password: parsed.data.password });
      if (error) return res.status(400).json(errorEnvelope(new ApiError('PASSWORD_UPDATE_FAILED', error.message)));
      if (ctx.user.email) {
        try {
          await sendBrandedEmail(ctx.user.email, {
            subject: 'Your LaundroMaster password was changed',
            preheader: 'If this was not you, reset it again immediately.',
            heading: 'Your password was changed',
            paragraphs: [
              'The password for your LaundroMaster account was just changed.',
              'If this was not you, reset your password immediately from the sign-in page.',
            ],
            ctaLabel: 'Go to sign in',
            ctaUrl: portalRedirect(),
          });
        } catch { /* the password did change; the notice is a nicety */ }
      }
      return res.status(200).json(successEnvelope({ ok: true }));
    }

    if (action === 'logout') {
      const token = bearer(req);
      if (token) { try { await admin.auth.admin.signOut(token); } catch { /* best effort */ } }
      return res.status(200).json(successEnvelope({ ok: true }));
    }

    if (action === 'refresh') {
      const refresh_token = (body(req).refresh_token) || '';
      if (!refresh_token) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Missing refresh_token')));
      const { data, error } = await anon.auth.refreshSession({ refresh_token });
      if (error || !data.session) return res.status(401).json(errorEnvelope(new ApiError('UNAUTHORIZED', 'Could not refresh session', 401)));
      const { data: profile } = await admin.from('profiles').select('account_status').eq('id', data.user.id).maybeSingle();
      if (profile && profile.account_status !== 'active') {
        return res.status(403).json(errorEnvelope(new ApiError('ACCOUNT_SUSPENDED', 'This account is not active', 403)));
      }
      const role = await resolveRole(admin, data.user.id);
      return res.status(200).json(successEnvelope({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user: { id: data.user.id, email: data.user.email },
        role,
      }));
    }

    if (action === 'update-profile') {
      const ctx = await requireUser(req);
      const parsed = profileUpdate.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const patch = { ...parsed.data, updated_at: new Date().toISOString() };
      const { data, error } = await ctx.admin.from('profiles').update(patch).eq('id', ctx.user.id).select().single();
      if (error) return res.status(400).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope(data));
    }

    if (action === 'addresses') {
      const ctx = await requireUser(req);
      const parsed = addressSave.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const addresses = parsed.data.addresses.map((a) => ({
        id: a.id || (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `a${Date.now()}${Math.random().toString(36).slice(2, 8)}`),
        label: a.label,
        line1: a.line1,
        suburb: a.suburb || null,
        city: a.city || null,
        postal_code: a.postal_code || null,
      }));
      const { data, error } = await ctx.admin.from('profiles')
        .update({ addresses, updated_at: new Date().toISOString() })
        .eq('id', ctx.user.id).select('addresses').single();
      if (error) return res.status(400).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope({ addresses: data.addresses || [] }));
    }
  }

  if (req.method === 'GET') {
    if (action === 'me') {
      const ctx = await getUser(req);
      if (!ctx.user) return res.status(401).json(errorEnvelope(new ApiError('UNAUTHORIZED', 'Invalid session', 401)));
      const { data: profile } = await admin.from('profiles').select('*').eq('id', ctx.user.id).maybeSingle();
      return res.status(200).json(successEnvelope({
        user: {
          id: ctx.user.id,
          email: ctx.user.email,
          full_name: (profile && profile.full_name) || ctx.user.user_metadata?.full_name || null,
          phone: profile ? profile.phone : null,
          avatar_path: profile ? profile.avatar_path : null,
          addresses: (profile && profile.addresses) || [],
          credit_balance: profile ? Number(profile.credit_balance) || 0 : 0,
          referral_code: profile ? profile.referral_code : null,
        },
        roles: ctx.roles,
        role: ctx.role,
      }));
    }

    if (action === 'referral') {
      const ctx = await getUser(req);
      if (!ctx.user) return res.status(401).json(errorEnvelope(new ApiError('UNAUTHORIZED', 'Invalid session', 401)));
      let { data: profile } = await admin.from('profiles').select('referral_code').eq('id', ctx.user.id).maybeSingle();
      let code = profile && profile.referral_code;
      if (!code) {
        code = `LM${(ctx.user.id || '').replace(/-/g, '').slice(0, 6).toUpperCase()}`;
        await admin.from('profiles').update({ referral_code: code }).eq('id', ctx.user.id);
      }
      const [{ data: refs }, { count: rewarded }] = await Promise.all([
        admin.from('referrals').select('status').eq('referrer_id', ctx.user.id),
        admin.from('referrals').select('*', { count: 'exact', head: true }).eq('referrer_id', ctx.user.id).eq('status', 'rewarded'),
      ]);
      const rows = refs || [];
      return res.status(200).json(successEnvelope({
        code,
        invited: rows.length,
        completed: (rewarded || 0),
        pending: rows.filter((r) => r.status === 'pending').length,
      }));
    }

    return res.status(200).json(successEnvelope({ service: 'auth', ok: true }));
  }

  return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
});
