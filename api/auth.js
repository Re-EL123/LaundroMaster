import { createHandler } from './_lib/handler.js';
import { successEnvelope, errorEnvelope, ApiError } from './_lib/errors.js';
import { anonClient } from './_lib/supabase-anon.js';
import { adminClient } from './_lib/supabase-admin.js';
import { query, body, bearer } from './_lib/req.js';
import { getUser, requireUser, topRole, ROLE_PRIORITY } from './_lib/auth.js';
import { z } from 'zod';
import { profileUpdate, addressSave } from './_lib/validation.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  full_name: z.string().min(2).optional(),
  account_type: z.enum(['customer', 'owner']).default('customer'),
  ref: z.string().max(20).optional(),
});

async function resolveRole(admin, userId) {
  if (!admin || !userId) return 'customer';
  const { data } = await admin.from('user_roles').select('role').eq('user_id', userId);
  const roles = (data || []).map((r) => r.role);
  return topRole(roles) || ROLE_PRIORITY[ROLE_PRIORITY.length - 1];
}

async function bootstrapUser(admin, user, accountType, fullName) {
  if (!admin || !user) return;
  await admin.from('profiles').upsert({
    id: user.id,
    email: user.email,
    full_name: fullName || user.user_metadata?.full_name || null,
    account_status: 'active',
  }, { onConflict: 'id' });

  const roles = ['customer'];
  if (accountType === 'owner') roles.push('owner');
  await admin.from('user_roles').upsert(
    roles.map((role) => ({ user_id: user.id, role })),
    { onConflict: 'user_id,role' }
  );

  if (accountType === 'owner') {
    const { data: existing } = await admin.from('laundromats').select('id').eq('owner_id', user.id).limit(1);
    if (!existing || existing.length === 0) {
      await admin.from('laundromats').insert({
        owner_id: user.id,
        name: fullName ? `${fullName}'s Laundry` : 'My Laundry',
        verification_status: 'pending',
        business_status: 'pending',
      });
    }
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
      const { data, error } = await anon.auth.signInWithPassword(parsed.data);
      if (error || !data.session) return res.status(401).json(errorEnvelope(new ApiError('INVALID_CREDENTIALS', 'Incorrect email or password', 401)));
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

    if (action === 'register') {
      const parsed = registerSchema.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { email, password, full_name, account_type, ref } = parsed.data;
      const { data, error } = await anon.auth.signUp({ email, password, options: { data: { full_name, account_type } } });
      if (error) return res.status(400).json(errorEnvelope(new ApiError('REGISTRATION_FAILED', error.message)));
      if (data.user) await bootstrapUser(admin, data.user, account_type, full_name);
      if (ref && data.user && account_type === 'customer') {
        try {
          const { data: referrer } = await admin.from('profiles')
            .select('id').eq('referral_code', String(ref).trim().toUpperCase()).maybeSingle();
          if (referrer && referrer.id !== data.user.id) {
            await admin.from('referrals').insert({ referrer_id: referrer.id, referee_id: data.user.id, code: String(ref).trim().toUpperCase(), status: 'pending' });
          }
        } catch { /* referral linking is best effort */ }
      }
      const role = data.user ? await resolveRole(admin, data.user.id) : account_type;
      return res.status(201).json(successEnvelope({
        user: data.user ? { id: data.user.id, email: data.user.email } : null,
        session: data.session ? { access_token: data.session.access_token, refresh_token: data.session.refresh_token } : null,
        role,
        email_confirmation_required: !data.session,
      }));
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
