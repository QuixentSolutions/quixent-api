import Booking, { IBookingDocument } from '../models/booking/Booking';
import Turf from '../models/turf/Turf';
import { getTurfForBooking } from './turf.service';
import { assertSlotBookable } from './availability.service';
import { buildBreakup, splitEarnings } from './pricing.service';
import { getConfig } from './config.service';
import { generateBookingCode } from '../utils/bookingCode';
import { sendPushNotification } from './notifications';

/**
 * Step 1 of checkout: create a short-lived hold on the slot.
 * The unique partial index {turfId, slotStart | slotHeld:true} is what
 * actually prevents a double-booking under concurrency.
 */
export async function lockSlot(customerId: string, turfId: string, slotStartISO: string) {
  const turf = await getTurfForBooking(turfId);
  const { slotStart, slotEnd } = await assertSlotBookable(turfId, slotStartISO);
  const config = await getConfig();
  const priceBreakup = await buildBreakup(turf, slotStart, slotEnd);

  try {
    const booking = await Booking.create({
      turfId,
      ownerId: turf.ownerId,
      customerId,
      slotStart,
      slotEnd,
      status: 'locked',
      slotHeld: true,
      lockExpiresAt: new Date(Date.now() + config.slotLockMinutes * 60_000),
      priceBreakup,
    });
    return booking;
  } catch (err: any) {
    // Only the turfId+slotStart index means the slot is actually taken.
    // Any other duplicate key (e.g. bookingCode) is a real bug, not a race —
    // let it surface as a 500 instead of masking it as SLOT_UNAVAILABLE.
    if (err?.code === 11000 && err?.keyPattern?.turfId && err?.keyPattern?.slotStart) {
      throw { status: 409, message: 'That slot was just taken. Pick another.', error: 'SLOT_UNAVAILABLE' };
    }
    throw err;
  }
}

/** Confirm a booking after a successful payment. Idempotent. */
export async function confirmBooking(bookingId: string, paymentId: string): Promise<IBookingDocument> {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw { status: 404, message: 'Booking not found', error: 'BOOKING_NOT_FOUND' };
  if (booking.status === 'confirmed' || booking.status === 'completed') return booking;
  if (booking.status !== 'locked') {
    throw { status: 409, message: `Booking is ${booking.status}`, error: 'BOOKING_NOT_LOCKABLE' };
  }

  const { commissionAmount, ownerEarning } = await splitEarnings(booking.priceBreakup.turfCharge);

  // retry once on the (rare) bookingCode collision
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      booking.bookingCode = generateBookingCode();
      booking.status = 'confirmed';
      booking.slotHeld = true;
      booking.lockExpiresAt = null;
      booking.commissionAmount = commissionAmount;
      booking.ownerEarning = ownerEarning;
      booking.paymentId = paymentId as any;
      await booking.save();
      break;
    } catch (err: any) {
      if (err?.code === 11000 && attempt < 2) continue;
      throw err;
    }
  }

  const turf = await Turf.findById(booking.turfId).select('name').lean();
  const when = booking.slotStart.toISOString();
  sendPushNotification(booking.customerId, 'Booking confirmed 🎉', `${turf?.name ?? 'Your turf'} is booked. Ref ${booking.bookingCode}.`, { bookingId: booking.id });
  sendPushNotification(booking.ownerId, 'New booking', `${turf?.name ?? 'A turf'} booked for ${when}.`, { bookingId: booking.id });

  return booking;
}

/** Release a lock that never got paid. */
export async function expireBooking(bookingId: string): Promise<void> {
  await Booking.updateOne(
    { _id: bookingId, status: 'locked' },
    { status: 'expired', slotHeld: false, lockExpiresAt: null },
  );
}

export async function getBookingForUser(bookingId: string, userId: string): Promise<IBookingDocument> {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw { status: 404, message: 'Booking not found', error: 'BOOKING_NOT_FOUND' };
  if (booking.customerId !== userId && booking.ownerId !== userId) {
    throw { status: 403, message: 'Access denied', error: 'FORBIDDEN' };
  }
  return booking;
}

export async function listCustomerBookings(customerId: string, tab?: 'upcoming' | 'completed' | 'cancelled') {
  const now = new Date();
  const filter: Record<string, unknown> = { customerId };
  if (tab === 'upcoming') Object.assign(filter, { status: 'confirmed', slotEnd: { $gte: now } });
  else if (tab === 'completed') filter.status = 'completed';
  else if (tab === 'cancelled') filter.status = { $in: ['cancelled', 'expired'] };
  else filter.status = { $in: ['confirmed', 'completed', 'cancelled'] };
  return Booking.find(filter).sort({ slotStart: -1 }).limit(200);
}
