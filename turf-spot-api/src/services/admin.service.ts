import Booking from '../models/booking/Booking';
import Payment from '../models/booking/Payment';
import Turf from '../models/turf/Turf';
import TurfSpotRole, { TurfRole } from '../models/platform/Role';
import { slotInstant } from '../utils/time';

// --- roles ---
export async function grantRole(targetUserId: string, role: TurfRole, grantedBy: string) {
  return TurfSpotRole.findOneAndUpdate(
    { userId: targetUserId, role },
    { userId: targetUserId, role, status: 'active', createdBy: grantedBy },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

export async function revokeRole(targetUserId: string, role: TurfRole) {
  const r = await TurfSpotRole.deleteOne({ userId: targetUserId, role });
  if (r.deletedCount === 0) throw { status: 404, message: 'Role not found', error: 'ROLE_NOT_FOUND' };
}

export async function listRoles(role?: TurfRole) {
  return TurfSpotRole.find(role ? { role } : {}).sort({ createdAt: -1 });
}

// --- platform-wide oversight ---
export async function listAllBookings(q: { turfId?: string; ownerId?: string; status?: string; from?: string; to?: string; page?: number }) {
  const filter: Record<string, unknown> = {};
  if (q.turfId) filter.turfId = q.turfId;
  if (q.ownerId) filter.ownerId = q.ownerId;
  if (q.status) filter.status = q.status;
  if (q.from || q.to) {
    filter.slotStart = {};
    if (q.from) (filter.slotStart as any).$gte = slotInstant(q.from, '00:00');
    if (q.to) (filter.slotStart as any).$lte = new Date(slotInstant(q.to, '00:00').getTime() + 86_400_000);
  }
  const page = Math.max(1, q.page ?? 1);
  const limit = 50;
  const [items, total] = await Promise.all([
    Booking.find(filter).sort({ slotStart: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Booking.countDocuments(filter),
  ]);
  return { items, total, page, pages: Math.ceil(total / limit) };
}

export async function listAllPayments(q: { status?: string; page?: number }) {
  const filter: Record<string, unknown> = {};
  if (q.status) filter.status = q.status;
  const page = Math.max(1, q.page ?? 1);
  const limit = 50;
  const [items, total] = await Promise.all([
    Payment.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Payment.countDocuments(filter),
  ]);
  return { items, total, page, pages: Math.ceil(total / limit) };
}

export async function reportSummary(from?: string, to?: string) {
  const match: Record<string, unknown> = { status: { $in: ['confirmed', 'completed'] } };
  if (from || to) {
    match.slotStart = {};
    if (from) (match.slotStart as any).$gte = slotInstant(from, '00:00');
    if (to) (match.slotStart as any).$lte = new Date(slotInstant(to, '00:00').getTime() + 86_400_000);
  }
  const [rev, counts, turfCount] = await Promise.all([
    Booking.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          bookings: { $sum: 1 },
          gmv: { $sum: '$priceBreakup.total' },
          turfCharge: { $sum: '$priceBreakup.turfCharge' },
          commission: { $sum: '$commissionAmount' },
          ownerPayouts: { $sum: '$ownerEarning' },
        },
      },
    ]),
    Booking.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Turf.countDocuments({ status: 'approved' }),
  ]);
  return {
    range: { from: from ?? null, to: to ?? null },
    revenue: rev[0] ?? { bookings: 0, gmv: 0, turfCharge: 0, commission: 0, ownerPayouts: 0 },
    bookingsByStatus: Object.fromEntries(counts.map((c: any) => [c._id, c.n])),
    approvedTurfs: turfCount,
  };
}
