import { Types } from 'mongoose';
import Turf, { ITurfDocument, TurfStatus } from '../models/turf/Turf';
import Review from '../models/review/Review';
import Booking from '../models/booking/Booking';
import TurfBlock from '../models/turf/Block';
import TurfSpotRole from '../models/platform/Role';
import { sendPushNotification, notifySuperAdmins, sendEmail } from './notifications';

const DEFAULT_RADIUS_KM = Number(process.env.TURFSPOT_SEARCH_RADIUS_KM ?? 10);

export async function findNearbyTurfs(params: { lat: number; lng: number; radiusKm?: number; sport?: string; city?: string }) {
  const radiusMeters = (params.radiusKm ?? DEFAULT_RADIUS_KM) * 1000;
  const filter: Record<string, unknown> = {
    status: 'approved',
    location: {
      $nearSphere: {
        $geometry: { type: 'Point', coordinates: [params.lng, params.lat] },
        $maxDistance: radiusMeters,
      },
    },
  };
  if (params.sport) filter.sports = params.sport;
  if (params.city) filter.city = params.city;
  return Turf.find(filter).limit(200);
}

export async function getApprovedTurf(id: string): Promise<ITurfDocument> {
  const turf = await Turf.findOne({ _id: id, status: 'approved' });
  if (!turf) throw { status: 404, message: 'Turf not found', error: 'TURF_NOT_FOUND' };
  return turf;
}

export async function getTurfForBooking(id: string): Promise<ITurfDocument> {
  // used by booking flow — must exist, be approved, not blocked
  const turf = await Turf.findById(id);
  if (!turf || turf.status !== 'approved') {
    throw { status: 404, message: 'Turf not available for booking', error: 'TURF_NOT_BOOKABLE' };
  }
  return turf;
}

/**
 * A logged-in customer submits a turf to list. It starts `pending` and goes to
 * the super_admin approval queue. NO role is granted here — `turf_admin` access
 * is added only once the turf is approved (see setTurfStatus).
 */
export async function createTurf(ownerId: string, data: any): Promise<ITurfDocument> {
  const turf = await Turf.create({
    ownerId,
    name: data.name,
    contactEmail: data.contactEmail ?? '',
    contactPhone: data.contactPhone ?? '',
    sports: data.sports ?? [],
    description: data.description ?? '',
    address: data.address ?? '',
    city: data.city ?? '',
    location: { type: 'Point', coordinates: [data.lng, data.lat] },
    facilities: data.facilities ?? [],
    photos: data.photos ?? [],
    operatingHours: data.operatingHours ?? { open: '06:00', close: '23:00' },
    slotDurationMins: data.slotDurationMins ?? 60,
    basePricePerHour: data.basePricePerHour,
    pricingRules: data.pricingRules ?? [],
    status: 'pending',
  });

  notifySuperAdmins(
    'New turf awaiting review',
    `"${turf.name}"${turf.city ? ` in ${turf.city}` : ''} was submitted for approval.`,
    { turfId: turf.id, action: 'review_turf' },
  );

  return turf;
}

export async function listOwnerTurfs(ownerId: string) {
  return Turf.find({ ownerId }).sort({ createdAt: -1 });
}

/** The caller's own turf submissions + statuses — usable before turf_admin is granted. */
export async function listMyRegistrations(userId: string) {
  return Turf.find({ ownerId: userId })
    .select('name city sports status rejectionReason ratingAvg ratingCount createdAt updatedAt')
    .sort({ createdAt: -1 });
}

export async function updateTurf(turf: ITurfDocument, data: any): Promise<ITurfDocument> {
  const fields = ['name', 'sports', 'description', 'address', 'city', 'facilities', 'photos', 'operatingHours', 'slotDurationMins', 'basePricePerHour'];
  for (const f of fields) if (data[f] !== undefined) (turf as any)[f] = data[f];
  if (data.lat !== undefined && data.lng !== undefined) {
    turf.location = { type: 'Point', coordinates: [data.lng, data.lat] };
  }
  if (data.pricingRules !== undefined) turf.pricingRules = data.pricingRules;

  // Edits to an already-live turf send it back through moderation.
  if (turf.status === 'approved') turf.status = 'pending';
  await turf.save();
  return turf;
}

export async function setPricing(turf: ITurfDocument, pricingRules: any[], basePricePerHour?: number): Promise<ITurfDocument> {
  turf.pricingRules = pricingRules as any;
  if (basePricePerHour !== undefined) turf.basePricePerHour = basePricePerHour;
  if (turf.status === 'approved') turf.status = 'pending';
  await turf.save();
  return turf;
}

// --- blocks ---
export async function addBlock(turfId: string, createdBy: string, data: { startsAt: string; endsAt: string; reason?: string; note?: string }) {
  const startsAt = new Date(data.startsAt);
  const endsAt = new Date(data.endsAt);
  if (!(endsAt > startsAt)) throw { status: 400, message: 'endsAt must be after startsAt', error: 'INVALID_INPUT' };
  return TurfBlock.create({ turfId, createdBy, startsAt, endsAt, reason: data.reason ?? 'manual', note: data.note ?? '' });
}

export async function listBlocks(turfId: string) {
  return TurfBlock.find({ turfId, endsAt: { $gte: new Date() } }).sort({ startsAt: 1 });
}

export async function removeBlock(turfId: string, blockId: string) {
  const r = await TurfBlock.deleteOne({ _id: blockId, turfId });
  if (r.deletedCount === 0) throw { status: 404, message: 'Block not found', error: 'BLOCK_NOT_FOUND' };
}

// --- admin moderation ---
export async function listPendingTurfs() {
  return Turf.find({ status: 'pending' }).sort({ createdAt: 1 });
}

export async function setTurfStatus(id: string, status: TurfStatus, rejectionReason = '') {
  const turf = await Turf.findById(id);
  if (!turf) throw { status: 404, message: 'Turf not found', error: 'TURF_NOT_FOUND' };

  const wasApproved = turf.status === 'approved';
  turf.status = status;
  turf.rejectionReason = status === 'rejected' ? rejectionReason : '';
  await turf.save();

  if (status === 'approved' && !wasApproved) {
    // Grant Turf Admin access to exactly the account that submitted this turf.
    // Idempotent — a user who already owns an approved turf keeps one role row.
    // Customer access is untouched (there is no "customer" role to remove).
    await TurfSpotRole.findOneAndUpdate(
      { userId: turf.ownerId, role: 'turf_admin' },
      { userId: turf.ownerId, role: 'turf_admin', status: 'active', createdBy: null },
      { upsert: true, setDefaultsOnInsert: true },
    );
    sendPushNotification(
      turf.ownerId,
      'You are now a Turf Owner 🎉',
      `"${turf.name}" is approved and live. Manage it from the TurfSpot web dashboard.`,
      { turfId: turf.id, action: 'turf_approved' },
    );
    sendEmail(
      turf.contactEmail,
      'Your TurfSpot listing is approved',
      `"${turf.name}" has been approved and is now live. Turf Owner access has been added to your account. ` +
        `Sign in to the TurfSpot web dashboard with the same phone number to manage pricing, bookings, blocks and earnings.`,
    );
  }

  if (status === 'rejected') {
    sendPushNotification(
      turf.ownerId,
      'Turf listing not approved',
      rejectionReason || 'Your turf submission was rejected. Please review and resubmit.',
      { turfId: turf.id, action: 'turf_rejected' },
    );
    sendEmail(
      turf.contactEmail,
      'Your TurfSpot listing was not approved',
      `"${turf.name}" was not approved.\n\nReason: ${rejectionReason || 'not specified'}\n\n` +
        `You can update the details and submit again from the app.`,
    );
  }

  return turf;
}

// --- ratings ---
export async function recomputeTurfRating(turfId: string) {
  const stats = await Review.aggregate([
    { $match: { turfId: new Types.ObjectId(turfId) } },
    { $group: { _id: '$turfId', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const avg = stats[0]?.avg ?? 0;
  const count = stats[0]?.count ?? 0;
  await Turf.findByIdAndUpdate(turfId, { ratingAvg: Math.round(avg * 10) / 10, ratingCount: count });
}

// --- account deletion cleanup (called by shared auth service) ---
export async function deleteUserDataService(userId: string) {
  // as owner: remove their turfs + related blocks + future bookings
  const turfs = await Turf.find({ ownerId: userId }).select('_id').lean();
  const turfIds = turfs.map((t) => t._id);
  await TurfBlock.deleteMany({ turfId: { $in: turfIds } });
  await Booking.deleteMany({ ownerId: userId });
  await Turf.deleteMany({ ownerId: userId });

  // as customer: remove reviews (recompute affected turfs), cancel/clear their bookings
  const reviews = await Review.find({ customerId: userId }).select('turfId').lean();
  const affected = [...new Set(reviews.map((r) => r.turfId.toString()))];
  await Review.deleteMany({ customerId: userId });
  await Booking.deleteMany({ customerId: userId });
  await Promise.all(affected.map((id) => recomputeTurfRating(id)));

  await TurfSpotRole.deleteMany({ userId });
}
