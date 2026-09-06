import Booking, { IBookingDocument } from '../models/Booking';
import BlockedSlot from '../models/BlockedSlot';
import Turf from '../models/Turf';
import User from '../../../auth/src/models/User';
import { resolveBookingWindow } from './availability.service';
import { getOwnedTurf } from './turf.service';
import { computeFeeBreakdown } from '../config/fees';

const CANCEL_CUTOFF_HOURS = Number(process.env.TURFSPOT_CANCEL_CUTOFF_HOURS ?? 4);

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function slotStartsAt(dateStr: string, hhmm: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0);
}

// Best-effort transition of past confirmed bookings to 'completed' so
// "upcoming vs past" and review-eligibility stay honest without a cron job.
async function sweepCompleted(filter: Record<string, unknown>) {
  const now = new Date();
  const candidates = await Booking.find({ ...filter, status: 'confirmed' }).select('date endTime').lean();
  const doneIds = candidates
    .filter((b) => slotStartsAt(b.date, b.endTime) < now)
    .map((b) => b._id);
  if (doneIds.length) {
    await Booking.updateMany({ _id: { $in: doneIds } }, { $set: { status: 'completed' } });
  }
}

export interface CreateBookingInput {
  turfId: string;
  date: string;
  startTime: string;
  slotCount?: number;
  sport?: string;
  playerCount?: number;
  notes?: string;
}

export async function createBooking(userId: string, input: CreateBookingInput) {
  if (input.date < todayStr()) {
    throw { status: 400, message: 'Cannot book a date in the past', error: 'DATE_IN_PAST' };
  }

  const slotCount = input.slotCount ?? 1;
  const resolved = await resolveBookingWindow(input.turfId, input.date, input.startTime, slotCount);
  // Additive model: resolved.totalPrice is the owner's listed price for this
  // slot (the base amount) — the platform fee and its GST are ADDED on top
  // and charged to the customer; the owner is paid out the base in full.
  const fees = computeFeeBreakdown(resolved.totalPrice);

  // Owners are regular customers too — they may book their own turf (e.g. to
  // hold a slot for a walk-in / phone booking). No role separation.

  try {
    const booking = await Booking.create({
      turfId: resolved.turf._id,
      turfName: resolved.turf.name,
      userId,
      ownerId: resolved.turf.ownerId,
      date: input.date,
      startTime: resolved.startTime,
      endTime: resolved.endTime,
      slotCount: resolved.slotCount,
      durationMinutes: resolved.durationMinutes,
      sport: input.sport,
      playerCount: input.playerCount,
      notes: input.notes,
      pricePerSlot: resolved.pricePerSlot,
      baseAmount: fees.baseAmount,
      totalPrice: fees.totalAmount,
      platformFeePercent: fees.platformFeePercent,
      gstPercent: fees.gstPercent,
      platformFeeAmount: fees.platformFeeAmount,
      cgstAmount: fees.cgstAmount,
      sgstAmount: fees.sgstAmount,
      gstAmount: fees.gstAmount,
      ownerPayoutAmount: fees.ownerPayoutAmount,
      // Every booking pays via PayU — no "pay at venue" option. It holds the
      // slot but isn't a real reservation yet: it only becomes 'confirmed'
      // once payment is verified (see payment.service.handlePayuCallback).
      paymentMode: 'online',
      status: 'pending',
      paymentStatus: 'unpaid',
    });
    return booking;
  } catch (err: any) {
    // Partial unique index race — someone grabbed the same start concurrently.
    if (err?.code === 11000) {
      throw { status: 409, message: 'That slot was just booked by someone else', error: 'SLOT_UNAVAILABLE' };
    }
    throw err;
  }
}

async function decorate(bookings: IBookingDocument[] | any[]) {
  const turfIds = [...new Set(bookings.map((b) => b.turfId.toString()))];
  const turfs = await Turf.find({ _id: { $in: turfIds } })
    .select('name address city photos location contactPhone ratingAvg')
    .lean();
  const byId = new Map(turfs.map((t) => [t._id.toString(), t]));
  return bookings.map((b) => ({ ...b, turf: byId.get(b.turfId.toString()) ?? null }));
}

export async function listMyBookings(userId: string, scope: 'upcoming' | 'past' | 'all' = 'all', status?: string) {
  await sweepCompleted({ userId });

  const filter: Record<string, unknown> = { userId };
  if (status) filter.status = status;
  if (scope === 'upcoming') {
    filter.date = { $gte: todayStr() };
    filter.status = status ?? { $in: ['pending', 'confirmed'] };
  } else if (scope === 'past') {
    filter.$or = [{ date: { $lt: todayStr() } }, { status: { $in: ['completed', 'cancelled', 'no_show'] } }];
  }

  const bookings = await Booking.find(filter).sort({ date: scope === 'past' ? -1 : 1, startTime: 1 }).lean();
  return decorate(bookings);
}

export async function getMyBooking(bookingId: string, userId: string) {
  const booking = await Booking.findOne({ _id: bookingId, userId }).lean();
  if (!booking) throw { status: 404, message: 'Booking not found', error: 'BOOKING_NOT_FOUND' };
  const [decorated] = await decorate([booking]);
  return decorated;
}

export async function cancelMyBooking(bookingId: string, userId: string, reason?: string) {
  const booking = await Booking.findOne({ _id: bookingId, userId });
  if (!booking) throw { status: 404, message: 'Booking not found', error: 'BOOKING_NOT_FOUND' };
  if (!['pending', 'confirmed'].includes(booking.status)) {
    throw { status: 409, message: `Booking is already ${booking.status}`, error: 'BOOKING_NOT_CANCELLABLE' };
  }

  // A booking still awaiting payment hasn't actually reserved anything from
  // the user's perspective yet — let them drop it any time, no cutoff.
  const awaitingPayment = booking.status === 'pending' && booking.paymentStatus === 'unpaid';
  if (!awaitingPayment) {
    const startsAt = slotStartsAt(booking.date, booking.startTime);
    const hoursUntil = (startsAt.getTime() - Date.now()) / 3_600_000;
    if (hoursUntil < CANCEL_CUTOFF_HOURS) {
      throw {
        status: 409,
        message: `Bookings can only be cancelled at least ${CANCEL_CUTOFF_HOURS} hours before the slot`,
        error: 'CANCEL_CUTOFF_PASSED',
      };
    }
  }

  booking.status = 'cancelled';
  booking.cancelledBy = 'user';
  booking.cancellationReason = reason;
  booking.cancelledAt = new Date();
  await booking.save();
  return booking;
}

// ---------- Owner side ----------

export async function listOwnerBookings(
  ownerId: string,
  opts: { turfId?: string; date?: string; scope?: 'upcoming' | 'past' | 'all'; status?: string },
) {
  await sweepCompleted({ ownerId });

  const filter: Record<string, unknown> = { ownerId };
  if (opts.turfId) filter.turfId = opts.turfId;
  if (opts.date) filter.date = opts.date;
  if (opts.status) filter.status = opts.status;
  if (!opts.date && opts.scope === 'upcoming') {
    filter.date = { $gte: todayStr() };
    filter.status = opts.status ?? { $in: ['pending', 'confirmed'] };
  } else if (!opts.date && opts.scope === 'past') {
    filter.date = { $lt: todayStr() };
  }

  const bookings = await Booking.find(filter).sort({ date: 1, startTime: 1 }).lean();

  // Attach the player's display name for the owner's manifest view.
  const userIds = [...new Set(bookings.map((b) => b.userId))];
  const users = await User.find({ _id: { $in: userIds } }).select('name mobile').lean();
  const byId = new Map(users.map((u) => [u._id.toString(), u]));
  return bookings.map((b) => ({
    ...b,
    user: byId.get(b.userId) ? { name: byId.get(b.userId)!.name, mobile: byId.get(b.userId)!.mobile } : null,
  }));
}

async function getOwnerBooking(bookingId: string, ownerId: string) {
  const booking = await Booking.findOne({ _id: bookingId, ownerId });
  if (!booking) throw { status: 404, message: 'Booking not found for your turfs', error: 'BOOKING_NOT_FOUND' };
  return booking;
}

export async function ownerCancelBooking(bookingId: string, ownerId: string, reason?: string) {
  const booking = await getOwnerBooking(bookingId, ownerId);
  if (!['pending', 'confirmed'].includes(booking.status)) {
    throw { status: 409, message: `Booking is already ${booking.status}`, error: 'BOOKING_NOT_CANCELLABLE' };
  }
  booking.status = 'cancelled';
  booking.cancelledBy = 'owner';
  booking.cancellationReason = reason;
  booking.cancelledAt = new Date();
  await booking.save();
  return booking;
}

// Bookings confirm themselves automatically once PayU payment is verified
// (see payment.service.handlePayuCallback). This endpoint is only for the
// rare case a payment already succeeded but the booking is still marked
// pending (e.g. a webhook race) — it can never confirm an unpaid booking, so
// it can't be used to bypass payment.
export async function ownerConfirmBooking(bookingId: string, ownerId: string) {
  const booking = await getOwnerBooking(bookingId, ownerId);
  if (booking.status !== 'pending') {
    throw { status: 409, message: `Booking is ${booking.status}, cannot confirm`, error: 'BOOKING_NOT_PENDING' };
  }
  if (booking.paymentStatus !== 'paid') {
    throw { status: 409, message: 'Payment has not been completed for this booking yet', error: 'PAYMENT_INCOMPLETE' };
  }
  booking.status = 'confirmed';
  await booking.save();
  return booking;
}

// Lets the owner flag an offline ("pay at venue") booking as settled once
// they've actually collected the cash/UPI in person. Online bookings are
// already marked 'paid' automatically by the PayU callback, so this only
// makes sense for offline ones.
export async function ownerMarkPaid(bookingId: string, ownerId: string) {
  const booking = await getOwnerBooking(bookingId, ownerId);
  if (booking.paymentMode !== 'offline') {
    throw { status: 409, message: 'Only offline bookings can be marked paid manually', error: 'NOT_OFFLINE' };
  }
  if (booking.paymentStatus === 'paid') {
    throw { status: 409, message: 'Already marked as paid', error: 'ALREADY_PAID' };
  }
  booking.paymentStatus = 'paid';
  await booking.save();
  return booking;
}

// Cancelling a paid booking does NOT call PayU's refund API — this platform
// doesn't auto-refund online. The owner refunds the player in person at the
// venue (cash/UPI) and then calls this to reconcile the record.
export async function ownerMarkRefunded(bookingId: string, ownerId: string) {
  const booking = await getOwnerBooking(bookingId, ownerId);
  if (booking.status !== 'cancelled') {
    throw { status: 409, message: 'Only a cancelled booking can be marked refunded', error: 'NOT_CANCELLED' };
  }
  if (booking.paymentStatus !== 'paid') {
    throw { status: 409, message: `Booking payment is ${booking.paymentStatus}, nothing to refund`, error: 'NOTHING_TO_REFUND' };
  }
  booking.paymentStatus = 'refunded';
  await booking.save();
  return booking;
}

export async function ownerMarkNoShow(bookingId: string, ownerId: string) {
  const booking = await getOwnerBooking(bookingId, ownerId);
  if (!['confirmed', 'completed'].includes(booking.status)) {
    throw { status: 409, message: `Booking is ${booking.status}`, error: 'BOOKING_BAD_STATE' };
  }
  booking.status = 'no_show';
  await booking.save();
  return booking;
}

// ---------- Blocked slots ----------

export async function listBlockedSlots(turfId: string, ownerId: string, date?: string) {
  await getOwnedTurf(turfId, ownerId);
  const filter: Record<string, unknown> = { turfId };
  if (date) filter.date = date;
  else filter.date = { $gte: todayStr() };
  return BlockedSlot.find(filter).sort({ date: 1, startTime: 1 }).lean();
}

export async function createBlockedSlot(
  turfId: string,
  ownerId: string,
  data: { date: string; startTime: string; endTime: string; reason?: string },
) {
  await getOwnedTurf(turfId, ownerId);

  const conflict = await Booking.countDocuments({
    turfId,
    date: data.date,
    status: { $in: ['pending', 'confirmed'] },
  });
  // Not a hard block (owner may want to block around existing bookings), but
  // surface it so they can cancel those first if needed.
  const overlapping = conflict > 0
    ? await Booking.find({ turfId, date: data.date, status: { $in: ['pending', 'confirmed'] } })
        .select('startTime endTime')
        .lean()
    : [];

  const block = await BlockedSlot.create({ turfId, ownerId, ...data });
  return { block, overlappingBookings: overlapping };
}

export async function deleteBlockedSlot(blockId: string, ownerId: string) {
  const res = await BlockedSlot.deleteOne({ _id: blockId, ownerId });
  if (res.deletedCount === 0) {
    throw { status: 404, message: 'Blocked slot not found', error: 'BLOCK_NOT_FOUND' };
  }
}

// ---------- Owner dashboard ----------

// ---------- Admin oversight ----------

export async function adminListBookings(opts: {
  turfId?: string;
  ownerId?: string;
  status?: string;
  date?: string;
  scope?: 'upcoming' | 'past' | 'all';
  limit?: number;
}) {
  await sweepCompleted({});

  const filter: Record<string, unknown> = {};
  if (opts.turfId) filter.turfId = opts.turfId;
  if (opts.ownerId) filter.ownerId = opts.ownerId;
  if (opts.status) filter.status = opts.status;
  if (opts.date) filter.date = opts.date;
  else if (opts.scope === 'upcoming') filter.date = { $gte: todayStr() };
  else if (opts.scope === 'past') filter.date = { $lt: todayStr() };

  const bookings = await Booking.find(filter)
    .sort({ date: -1, startTime: 1 })
    .limit(Math.min(opts.limit ?? 100, 500))
    .lean();

  const userIds = [...new Set(bookings.map((b) => b.userId))];
  const users = await User.find({ _id: { $in: userIds } }).select('name mobile').lean();
  const byId = new Map(users.map((u) => [u._id.toString(), u]));

  return bookings.map((b) => ({
    ...b,
    user: byId.get(b.userId) ? { name: byId.get(b.userId)!.name, mobile: byId.get(b.userId)!.mobile } : null,
  }));
}

export async function ownerStats(ownerId: string) {
  await sweepCompleted({ ownerId });
  const today = todayStr();

  const [turfCount, activeBookings, todayBookings, completed, revenueAgg] = await Promise.all([
    Turf.countDocuments({ ownerId }),
    Booking.countDocuments({ ownerId, status: { $in: ['pending', 'confirmed'] }, date: { $gte: today } }),
    Booking.countDocuments({ ownerId, date: today, status: { $in: ['pending', 'confirmed', 'completed'] } }),
    Booking.countDocuments({ ownerId, status: 'completed' }),
    Booking.aggregate([
      { $match: { ownerId, status: { $in: ['confirmed', 'completed'] } } },
      {
        $group: {
          _id: null,
          total: { $sum: '$totalPrice' },
          netPayout: { $sum: '$ownerPayoutAmount' },
          platformFees: { $sum: '$platformFeeAmount' },
          gst: { $sum: '$gstAmount' },
        },
      },
    ]),
  ]);

  return {
    turfs: turfCount,
    upcomingBookings: activeBookings,
    todayBookings,
    completedBookings: completed,
    // Gross = what customers paid (base + platform fee + GST); net = what
    // settles to the owner, which is just the base amount in full — the fee
    // and GST are added on top of it, never deducted (see config/fees.ts).
    grossBookingValue: revenueAgg[0]?.total ?? 0,
    netPayoutValue: revenueAgg[0]?.netPayout ?? 0,
    platformFeesValue: revenueAgg[0]?.platformFees ?? 0,
    gstValue: revenueAgg[0]?.gst ?? 0,
  };
}
