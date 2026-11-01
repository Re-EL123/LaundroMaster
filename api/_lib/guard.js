import { getSettings, bool } from './settings.js';
import { isAdmin } from './auth.js';
import { ApiError } from './errors.js';

/**
 * Enforce platform-wide switches. Returns the settings so callers can avoid a
 * second read.
 */
export async function assertFeature(supa, ctx, featureKey = null, { label = 'This feature' } = {}) {
  const settings = await getSettings(supa);
  if (bool(settings.maintenance_mode, false) && !isAdmin(ctx)) {
    throw new ApiError('MAINTENANCE', 'LaundroMaster is briefly under maintenance. Please try again shortly.', 503);
  }
  if (featureKey && bool(settings[featureKey], true) === false) {
    throw new ApiError('FEATURE_DISABLED', `${label} is temporarily unavailable.`, 403);
  }
  return settings;
}
