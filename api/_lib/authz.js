export function requireRole(user, roles=[]) {
  const role = user?.role || user?.user_metadata?.role;
  if (roles.length && !roles.includes(role)) throw new Error('Forbidden');
  return true;
}
