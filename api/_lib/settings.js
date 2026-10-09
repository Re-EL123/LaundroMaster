import { adminClient } from './supabase-admin.js';

export const DEFAULT_SETTINGS = {
  platform_name: 'LaundroMaster',
  currency: 'ZAR',
  commission_percent: 8,
  delivery_fee: 25,
  payout_min: 200,
  payout_auto_approve: false,
  promotion_price: 199,
  promotion_days: 30,
  customer_plus_free_delivery: true,
  feature_owner_subscriptions: true,
  feature_customer_plans: true,
  feature_promotions: true,
  feature_payouts: true,
  feature_refunds: true,
  maintenance_mode: false,
};

export function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function bool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

export async function getSettings(supa) {
  const client = supa || adminClient();
  const merged = { ...DEFAULT_SETTINGS };
  if (!client) return merged;
  try {
    const { data } = await client.from('platform_settings').select('key, value');
    for (const row of data || []) if (row && row.key != null) merged[row.key] = row.value;
  } catch { /* settings table not ready */ }
  return merged;
}

export async function setSettings(supa, patch = {}) {
  const rows = Object.entries(patch)
    .filter(([key]) => key && !key.startsWith('schema_'))
    .map(([key, value]) => ({ key, value }));
  if (!rows.length || !supa) return [];
  const { data, error } = await supa.from('platform_settings').upsert(rows, { onConflict: 'key' }).select();
  if (error) throw error;
  return data || [];
}
