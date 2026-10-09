import { adminClient } from './supabase-admin.js';
import { ApiError } from './errors.js';
import { bearer } from './req.js';

export const ROLE_PRIORITY = ['super_admin', 'admin', 'owner', 'staff', 'customer'];

export function topRole(roles = []) {
  return ROLE_PRIORITY.find((r) => roles.includes(r)) || null;
}

export async function getUser(req) {
  const admin = adminClient();
  if (!admin) throw new ApiError('NOT_CONFIGURED', 'Supabase not configured', 503);
  const token = bearer(req);
  if (!token) return { user: null, roles: [], role: null, admin };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data || !data.user) return { user: null, roles: [], role: null, admin };
  const { data: roleRows } = await admin.from('user_roles').select('role').eq('user_id', data.user.id);
  const roles = (roleRows || []).map((r) => r.role);
  return { user: data.user, roles, role: topRole(roles), admin };
}

export async function requireUser(req) {
  const ctx = await getUser(req);
  if (!ctx.user) throw new ApiError('UNAUTHORIZED', 'Authentication required', 401);
  return ctx;
}

export async function requireRoles(req, allowed = []) {
  const ctx = await requireUser(req);
  if (allowed.length && !allowed.some((r) => ctx.roles.includes(r))) {
    throw new ApiError('FORBIDDEN', 'You do not have access to this resource', 403);
  }
  return ctx;
}

export function isAdmin(ctx) {
  return ctx.roles.some((r) => r === 'admin' || r === 'super_admin');
}

export function isOwner(ctx) {
  return ctx.roles.some((r) => r === 'owner' || r === 'staff' || r === 'admin' || r === 'super_admin');
}
