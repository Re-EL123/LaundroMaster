import { createClient } from '@supabase/supabase-js';

export function userClient({ req }) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const auth = { autoRefreshToken: false, persistSession: false };
  return createClient(url, anon, { auth, global: { headers: req?.headers?.authorization ? { Authorization: req.headers.authorization } : {} } });
}
