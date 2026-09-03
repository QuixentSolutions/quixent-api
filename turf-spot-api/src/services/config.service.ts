import PlatformConfig, { IPlatformConfigDocument } from '../models/platform/Config';

let cached: IPlatformConfigDocument | null = null;

/** Get the singleton config, creating it (seeded from env) on first call. */
export async function getConfig(force = false): Promise<IPlatformConfigDocument> {
  if (cached && !force) return cached;

  let doc = await PlatformConfig.findOne({ key: 'default' });
  if (!doc) {
    doc = await PlatformConfig.create({
      key: 'default',
      commissionPercent: Number(process.env.TURFSPOT_COMMISSION_PERCENT ?? 10),
      gstPercent: Number(process.env.TURFSPOT_GST_PERCENT ?? 18),
      platformFeeFlat: Number(process.env.TURFSPOT_PLATFORM_FEE ?? 50),
      slotLockMinutes: Number(process.env.TURFSPOT_SLOT_LOCK_MINUTES ?? 10),
    });
  }
  cached = doc;
  return doc;
}

export async function updateConfig(patch: Partial<IPlatformConfigDocument>): Promise<IPlatformConfigDocument> {
  const doc = await PlatformConfig.findOneAndUpdate({ key: 'default' }, patch, { new: true, upsert: true });
  cached = doc;
  return doc!;
}

/** Public-facing subset (for the app's cancellation-policy screen). */
export async function getPublicPolicy() {
  const c = await getConfig();
  return {
    refundPolicy: c.refundPolicy,
    gstPercent: c.gstPercent,
    platformFeeFlat: c.platformFeeFlat,
    slotLockMinutes: c.slotLockMinutes,
  };
}
