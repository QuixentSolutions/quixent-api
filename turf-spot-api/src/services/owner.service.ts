import axios from 'axios';
import Booking from '../models/booking/Booking';
import Turf from '../models/turf/Turf';
import { slotInstant } from '../utils/time';
import dayjs from 'dayjs';
import { TZ } from '../utils/time';

async function fetchUserName(userId: string, authHeader: string): Promise<string | null> {
  try {
    const res = await axios.get(`${process.env.AUTH_API_URL}/auth/user/${userId}`, {
      headers: { Authorization: authHeader },
      timeout: 3000,
    });
    return res.data?.data?.user?.name ?? null;
  } catch {
    return null;
  }
}

/** Owner's turfs, any status. */
export async function ownerTurfIds(ownerId: string): Promise<string[]> {
  const turfs = await Turf.find({ ownerId }).select('_id').lean();
  return turfs.map((t) => t._id.toString());
}

export async function ownerBookings(
  ownerId: string,
  opts: { turfId?: string; date?: string; status?: string; authHeader: string },
) {
  const filter: Record<string, unknown> = { ownerId };
  if (opts.turfId) filter.turfId = opts.turfId;
  if (opts.status) filter.status = opts.status;
  if (opts.date) {
    const dayStart = slotInstant(opts.date, '00:00');
    filter.slotStart = { $gte: dayStart, $lt: new Date(dayStart.getTime() + 86_400_000) };
  }

  const bookings = await Booking.find(filter).sort({ slotStart: -1 }).limit(300).lean();
  const names = new Map<string, string | null>();
  for (const b of bookings) {
    if (!names.has(b.customerId)) names.set(b.customerId, await fetchUserName(b.customerId, opts.authHeader));
  }
  return bookings.map((b) => ({
    _id: b._id,
    turfId: b.turfId,
    customerName: names.get(b.customerId) ?? 'Customer',
    slotStart: b.slotStart,
    slotEnd: b.slotEnd,
    status: b.status,
    amount: b.priceBreakup.total,
    ownerEarning: b.ownerEarning,
    bookingCode: b.bookingCode,
  }));
}

/** Today's KPI tiles for the owner dashboard. */
export async function ownerDashboard(ownerId: string, turfId?: string) {
  const today = dayjs().tz(TZ).format('YYYY-MM-DD');
  const dayStart = slotInstant(today, '00:00');
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const match: Record<string, unknown> = { ownerId, slotStart: { $gte: dayStart, $lt: dayEnd } };
  if (turfId) match.turfId = turfId;

  const [confirmedToday, revenueAgg] = await Promise.all([
    Booking.countDocuments({ ...match, status: { $in: ['confirmed', 'completed'] } }),
    Booking.aggregate([
      { $match: { ...match, status: { $in: ['confirmed', 'completed'] } } },
      { $group: { _id: null, revenue: { $sum: '$priceBreakup.turfCharge' }, earning: { $sum: '$ownerEarning' } } },
    ]),
  ]);

  return {
    date: today,
    bookingsToday: confirmedToday,
    grossToday: revenueAgg[0]?.revenue ?? 0,
    earningToday: revenueAgg[0]?.earning ?? 0,
  };
}

export async function ownerEarnings(ownerId: string, from?: string, to?: string) {
  const match: Record<string, unknown> = { ownerId, status: { $in: ['confirmed', 'completed'] } };
  if (from || to) {
    match.slotStart = {};
    if (from) (match.slotStart as any).$gte = slotInstant(from, '00:00');
    if (to) (match.slotStart as any).$lte = new Date(slotInstant(to, '00:00').getTime() + 86_400_000);
  }
  const agg = await Booking.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        bookings: { $sum: 1 },
        gross: { $sum: '$priceBreakup.turfCharge' },
        commission: { $sum: '$commissionAmount' },
        net: { $sum: '$ownerEarning' },
      },
    },
  ]);
  const r = agg[0] ?? { bookings: 0, gross: 0, commission: 0, net: 0 };
  return { bookings: r.bookings, gross: r.gross, commission: r.commission, net: r.net };
}
