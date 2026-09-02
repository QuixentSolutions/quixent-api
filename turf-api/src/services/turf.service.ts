import Turf from '../models/Turf';
import Booking from '../models/Booking';
import Review from '../models/Review';
import BlockedSlot from '../models/BlockedSlot';
import { recomputeTurfRating } from './review.service';

const DEFAULT_RADIUS_KM = Number(process.env.TURFSPOT_SEARCH_RADIUS_KM ?? 25);
const DEFAULT_PAGE_SIZE = 20;

interface ListParams {
  city?: string;
  sport?: string;
  q?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  minPrice?: number;
  maxPrice?: number;
  sort?: 'recommended' | 'price_asc' | 'price_desc' | 'rating' | 'distance';
  page?: number;
  limit?: number;
}

// Public browse — approved + active turfs only.
export async function listApprovedTurfs(params: ListParams) {
  const page = params.page ?? 1;
  const limit = params.limit ?? DEFAULT_PAGE_SIZE;
  const skip = (page - 1) * limit;

  const match: Record<string, unknown> = { status: 'approved', isActive: true };
  if (params.city) match.city = new RegExp(`^${escapeRegex(params.city)}$`, 'i');
  if (params.sport) match.sports = params.sport;
  if (params.q) match.$text = { $search: params.q };
  if (params.minPrice !== undefined || params.maxPrice !== undefined) {
    match.pricePerHour = {};
    if (params.minPrice !== undefined) (match.pricePerHour as any).$gte = params.minPrice;
    if (params.maxPrice !== undefined) (match.pricePerHour as any).$lte = params.maxPrice;
  }

  // Geo search uses $geoNear-style $nearSphere and can't combine with $text,
  // so when both are given, text search wins and distance is computed after.
  const useGeo = params.lat !== undefined && params.lng !== undefined && !params.q;
  if (useGeo) {
    match.location = {
      $nearSphere: {
        $geometry: { type: 'Point', coordinates: [params.lng, params.lat] },
        $maxDistance: (params.radiusKm ?? DEFAULT_RADIUS_KM) * 1000,
      },
    };
  }

  const sortSpec = sortSpecFor(params.sort, params.q, useGeo);

  const query = Turf.find(match).skip(skip).limit(limit);
  if (sortSpec) query.sort(sortSpec);

  const [turfs, total] = await Promise.all([
    query.lean(),
    Turf.countDocuments(stripGeo(match)),
  ]);

  return {
    turfs,
    page,
    limit,
    total,
    hasMore: skip + turfs.length < total,
  };
}

function sortSpecFor(sort: ListParams['sort'], q?: string, useGeo?: boolean) {
  switch (sort) {
    case 'price_asc':
      return { pricePerHour: 1 as const };
    case 'price_desc':
      return { pricePerHour: -1 as const };
    case 'rating':
      return { ratingAvg: -1 as const, ratingCount: -1 as const };
    case 'distance':
      return useGeo ? undefined : { createdAt: -1 as const }; // $nearSphere already sorts by distance
    default:
      if (q) return { score: { $meta: 'textScore' } as any };
      if (useGeo) return undefined;
      return { ratingAvg: -1 as const, createdAt: -1 as const };
  }
}

// countDocuments can't take a $nearSphere filter — drop it for the count.
function stripGeo(match: Record<string, unknown>) {
  const { location, ...rest } = match;
  return rest;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function getApprovedTurfById(id: string) {
  const turf = await Turf.findOne({ _id: id, status: 'approved' }).lean();
  if (!turf) throw { status: 404, message: 'Turf not found', error: 'TURF_NOT_FOUND' };
  return turf;
}

export async function listCities() {
  return Turf.distinct('city', { status: 'approved', isActive: true });
}

// ---------- Owner ----------

interface TurfInput {
  name: string;
  description?: string;
  sports: string[];
  surface?: string;
  size?: string;
  amenities?: string[];
  address: string;
  city: string;
  lat: number;
  lng: number;
  photos?: string[];
  contactPhone?: string;
  pricePerHour: number;
  priceRules?: any[];
  openTime?: string;
  closeTime?: string;
  slotDurationMinutes?: number;
  weeklyClosedDays?: number[];
  isActive?: boolean;
}

export async function createTurf(ownerId: string, data: TurfInput) {
  return Turf.create({
    ownerId,
    name: data.name,
    description: data.description,
    sports: data.sports,
    surface: data.surface,
    size: data.size,
    amenities: data.amenities ?? [],
    address: data.address,
    city: data.city,
    location: { type: 'Point', coordinates: [data.lng, data.lat] },
    photos: data.photos ?? [],
    contactPhone: data.contactPhone,
    pricePerHour: data.pricePerHour,
    priceRules: data.priceRules ?? [],
    openTime: data.openTime ?? '06:00',
    closeTime: data.closeTime ?? '23:00',
    slotDurationMinutes: data.slotDurationMinutes ?? 60,
    weeklyClosedDays: data.weeklyClosedDays ?? [],
    isActive: data.isActive ?? true,
    status: 'pending',
  });
}

export async function getOwnedTurf(turfId: string, ownerId: string) {
  const turf = await Turf.findOne({ _id: turfId, ownerId });
  if (!turf) throw { status: 404, message: 'Turf not found for this owner', error: 'TURF_NOT_FOUND' };
  return turf;
}

export async function listOwnerTurfs(ownerId: string) {
  return Turf.find({ ownerId }).sort({ createdAt: -1 }).lean();
}

const REAPPROVAL_FIELDS: (keyof TurfInput)[] = [
  'name', 'description', 'sports', 'surface', 'size', 'amenities', 'address', 'city', 'lat', 'lng', 'photos',
];

export async function updateOwnerTurf(turfId: string, ownerId: string, data: Partial<TurfInput>) {
  const turf = await getOwnedTurf(turfId, ownerId);

  if (data.name !== undefined) turf.name = data.name;
  if (data.description !== undefined) turf.description = data.description;
  if (data.sports !== undefined) turf.sports = data.sports;
  if (data.surface !== undefined) turf.surface = data.surface;
  if (data.size !== undefined) turf.size = data.size;
  if (data.amenities !== undefined) turf.amenities = data.amenities;
  if (data.address !== undefined) turf.address = data.address;
  if (data.city !== undefined) turf.city = data.city;
  if (data.lat !== undefined && data.lng !== undefined) {
    turf.location = { type: 'Point', coordinates: [data.lng, data.lat] };
  }
  if (data.photos !== undefined) turf.photos = data.photos;
  if (data.contactPhone !== undefined) turf.contactPhone = data.contactPhone;
  if (data.pricePerHour !== undefined) turf.pricePerHour = data.pricePerHour;
  if (data.priceRules !== undefined) turf.priceRules = data.priceRules as any;
  if (data.openTime !== undefined) turf.openTime = data.openTime;
  if (data.closeTime !== undefined) turf.closeTime = data.closeTime;
  if (data.slotDurationMinutes !== undefined) turf.slotDurationMinutes = data.slotDurationMinutes;
  if (data.weeklyClosedDays !== undefined) turf.weeklyClosedDays = data.weeklyClosedDays as any;
  if (data.isActive !== undefined) turf.isActive = data.isActive;

  // Material changes to an already-live listing send it back through
  // moderation; pricing / hours / pause toggles don't.
  const touchedReapproval = REAPPROVAL_FIELDS.some((f) => (data as any)[f] !== undefined);
  if (turf.status === 'approved' && touchedReapproval) {
    turf.status = 'pending';
    turf.rejectionReason = undefined;
  }

  await turf.save();
  return turf;
}

export async function deleteOwnerTurf(turfId: string, ownerId: string) {
  const turf = await Turf.findOne({ _id: turfId, ownerId });
  if (!turf) throw { status: 404, message: 'Turf not found for this owner', error: 'TURF_NOT_FOUND' };

  const upcoming = await Booking.countDocuments({
    turfId,
    status: { $in: ['pending', 'confirmed'] },
    date: { $gte: todayStr() },
  });
  if (upcoming > 0) {
    throw {
      status: 409,
      message: `This turf has ${upcoming} upcoming booking(s). Cancel or complete them before deleting.`,
      error: 'TURF_HAS_BOOKINGS',
    };
  }

  await Promise.all([
    Turf.deleteOne({ _id: turfId }),
    BlockedSlot.deleteMany({ turfId }),
    Review.deleteMany({ turfId }),
  ]);
}

// ---------- Admin ----------

export async function listTurfsByStatus(status?: string) {
  const filter = status ? { status } : {};
  return Turf.find(filter).sort({ createdAt: status === 'pending' ? 1 : -1 }).lean();
}

export async function setTurfStatus(turfId: string, status: 'approved' | 'rejected', reason?: string) {
  const turf = await Turf.findById(turfId);
  if (!turf) throw { status: 404, message: 'Turf not found', error: 'TURF_NOT_FOUND' };
  turf.status = status;
  turf.rejectionReason = status === 'rejected' ? reason : undefined;
  await turf.save();
  return turf;
}

export async function adminStats() {
  const [pending, approved, rejected, totalBookings, revenueAgg] = await Promise.all([
    Turf.countDocuments({ status: 'pending' }),
    Turf.countDocuments({ status: 'approved' }),
    Turf.countDocuments({ status: 'rejected' }),
    Booking.countDocuments({ status: { $in: ['confirmed', 'completed'] } }),
    Booking.aggregate([
      { $match: { status: { $in: ['confirmed', 'completed'] } } },
      { $group: { _id: null, total: { $sum: '$totalPrice' } } },
    ]),
  ]);
  return {
    turfs: { pending, approved, rejected },
    bookings: totalBookings,
    grossBookingValue: revenueAgg[0]?.total ?? 0,
  };
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Called by the shared auth service on account deletion.
export async function deleteUserDataService(userId: string) {
  const turfs = await Turf.find({ ownerId: userId }).select('_id').lean();
  const turfIds = turfs.map((t) => t._id);

  await Promise.all([
    Turf.deleteMany({ ownerId: userId }),
    BlockedSlot.deleteMany({ ownerId: userId }),
    Booking.updateMany(
      { userId, status: { $in: ['pending', 'confirmed'] } },
      { $set: { status: 'cancelled', cancelledBy: 'admin', cancellationReason: 'Account deleted', cancelledAt: new Date() } },
    ),
  ]);

  if (turfIds.length) {
    await BlockedSlot.deleteMany({ turfId: { $in: turfIds } });
  }

  const reviews = await Review.find({ userId }).select('turfId').lean();
  const affectedTurfIds = [...new Set(reviews.map((r) => r.turfId.toString()))];
  await Review.deleteMany({ userId });
  await Promise.all(affectedTurfIds.map((id) => recomputeTurfRating(id)));
}
