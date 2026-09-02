import Stall from '../models/Stall';
import Review from '../models/Review';
import { recomputeStallRating } from './review.service';

const DEFAULT_SEARCH_RADIUS_KM = Number(process.env.THALLUVANDI_SEARCH_RADIUS_KM ?? 5);

export async function findNearbyStalls(params: {
  lat: number;
  lng: number;
  radiusKm?: number;
  category?: string;
}) {
  const radiusMeters = (params.radiusKm ?? DEFAULT_SEARCH_RADIUS_KM) * 1000;

  const filter: Record<string, unknown> = {
    status: 'approved',
    location: {
      $nearSphere: {
        $geometry: { type: 'Point', coordinates: [params.lng, params.lat] },
        $maxDistance: radiusMeters,
      },
    },
  };
  if (params.category) {
    filter.category = params.category;
  }

  return Stall.find(filter).limit(200);
}

export async function getApprovedStallById(id: string) {
  const stall = await Stall.findOne({ _id: id, status: 'approved' });
  if (!stall) throw { status: 404, message: 'Stall not found', error: 'STALL_NOT_FOUND' };
  return stall;
}

export async function createStall(vendorId: string, data: {
  name: string;
  category: string;
  lat: number;
  lng: number;
  photos?: string[];
  menuItems?: { name: string; price?: number; photoUrl?: string }[];
  openTime?: string;
  closeTime?: string;
}) {
  return Stall.create({
    vendorId,
    name: data.name,
    category: data.category,
    location: { type: 'Point', coordinates: [data.lng, data.lat] },
    photos: data.photos ?? [],
    menuItems: data.menuItems ?? [],
    openTime: data.openTime,
    closeTime: data.closeTime,
    status: 'pending',
  });
}

export async function getStallOwnedByVendor(stallId: string, vendorId: string) {
  const stall = await Stall.findOne({ _id: stallId, vendorId });
  if (!stall) throw { status: 404, message: 'Stall not found for this vendor', error: 'STALL_NOT_FOUND' };
  return stall;
}

export async function updateVendorStall(stallId: string, vendorId: string, data: Partial<{
  name: string;
  category: string;
  lat: number;
  lng: number;
  photos: string[];
  menuItems: { name: string; price?: number; photoUrl?: string }[];
  openTime: string;
  closeTime: string;
}>) {
  const stall = await getStallOwnedByVendor(stallId, vendorId);

  if (data.name !== undefined) stall.name = data.name;
  if (data.category !== undefined) stall.category = data.category;
  if (data.lat !== undefined && data.lng !== undefined) {
    stall.location = { type: 'Point', coordinates: [data.lng, data.lat] };
  }
  if (data.photos !== undefined) stall.photos = data.photos;
  if (data.menuItems !== undefined) stall.menuItems = data.menuItems as any;
  if (data.openTime !== undefined) stall.openTime = data.openTime;
  if (data.closeTime !== undefined) stall.closeTime = data.closeTime;

  // Edits on an already-approved stall go back to pending, so vendors can't
  // slip changes past moderation once the listing is live.
  if (stall.status === 'approved') {
    stall.status = 'pending';
  }

  await stall.save();
  return stall;
}

export async function deleteVendorStall(stallId: string, vendorId: string) {
  const result = await Stall.deleteOne({ _id: stallId, vendorId });
  if (result.deletedCount === 0) {
    throw { status: 404, message: 'Stall not found for this vendor', error: 'STALL_NOT_FOUND' };
  }
}

export async function listVendorStalls(vendorId: string) {
  return Stall.find({ vendorId }).sort({ createdAt: -1 });
}

export async function listPendingStalls() {
  return Stall.find({ status: 'pending' }).sort({ createdAt: 1 });
}

export async function setStallStatus(stallId: string, status: 'approved' | 'rejected') {
  const stall = await Stall.findById(stallId);
  if (!stall) throw { status: 404, message: 'Stall not found', error: 'STALL_NOT_FOUND' };
  stall.status = status;
  await stall.save();
  return stall;
}

// Called by the shared auth service on account deletion — same pattern as
// match-calculator-api's deleteUserDataService.
export async function deleteUserDataService(userId: string) {
  await Stall.deleteMany({ vendorId: userId });

  const reviews = await Review.find({ userId }).select('stallId').lean();
  const affectedStallIds = [...new Set(reviews.map((r) => r.stallId.toString()))];
  await Review.deleteMany({ userId });
  await Promise.all(affectedStallIds.map((id) => recomputeStallRating(id)));
}
