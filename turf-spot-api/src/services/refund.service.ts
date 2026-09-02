import Booking, { IBookingDocument } from '../models/booking/Booking';
import Payment from '../models/booking/Payment';
import Turf from '../models/turf/Turf';
import { getConfig } from './config.service';
import { sendPushNotification } from './notifications';

/** Refund % for a customer-initiated cancellation, from the configurable policy. */
export async function refundPercentFor(slotStart: Date): Promise<number> {
  const config = await getConfig();
  const hoursBefore = (slotStart.getTime() - Date.now()) / 3_600_000;
  // policy is stored high-to-low; pick the first threshold we clear
  const sorted = [...config.refundPolicy].sort((a, b) => b.minHoursBefore - a.minHoursBefore);
  for (const rule of sorted) {
    if (hoursBefore >= rule.minHoursBefore) return rule.refundPercent;
  }
  return 0;
}

interface CancelArgs {
  bookingId: string;
  actorId: string;
  by: 'customer' | 'owner' | 'admin';
  reason?: string;
}

export async function cancelBooking({ bookingId, actorId, by, reason = '' }: CancelArgs): Promise<IBookingDocument> {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw { status: 404, message: 'Booking not found', error: 'BOOKING_NOT_FOUND' };

  if (by === 'customer' && booking.customerId !== actorId) throw { status: 403, message: 'Not your booking', error: 'FORBIDDEN' };
  if (by === 'owner' && booking.ownerId !== actorId) throw { status: 403, message: 'Not your turf', error: 'FORBIDDEN' };

  if (!['confirmed'].includes(booking.status)) {
    throw { status: 400, message: `Cannot cancel a ${booking.status} booking`, error: 'INVALID_STATUS' };
  }
  if (booking.slotEnd.getTime() < Date.now()) {
    throw { status: 400, message: 'Slot has already passed', error: 'SLOT_PASSED' };
  }

  // Owner/admin cancellations always refund fully; customer follows the policy.
  const refundPercent = by === 'customer' ? await refundPercentFor(booking.slotStart) : 100;
  const refundAmount = Math.round((booking.priceBreakup.total * refundPercent) / 100);

  booking.status = 'cancelled';
  booking.slotHeld = false; // frees the slot
  booking.cancellation = { cancelledAt: new Date(), by, refundPercent, refundAmount, reason };
  await booking.save();

  if (refundAmount > 0 && booking.paymentId) {
    // Phase 1: record intent to refund. Wiring the PayU refund API call is a
    // follow-up (needs the merchant refund credentials + async webhook).
    await Payment.findByIdAndUpdate(booking.paymentId, {
      status: refundPercent === 100 ? 'refunded' : 'partially_refunded',
      refund: { refundId: `PENDING-${Date.now()}`, amount: refundAmount, status: 'pending' },
    });
  }

  const turf = await Turf.findById(booking.turfId).select('name').lean();
  sendPushNotification(booking.customerId, 'Booking cancelled', `${turf?.name ?? 'Turf'} — ${refundAmount > 0 ? `₹${refundAmount} refund is being processed` : 'no refund per policy'}.`, { bookingId: booking.id });
  sendPushNotification(booking.ownerId, 'Booking cancelled', `${turf?.name ?? 'Turf'} slot on ${booking.slotStart.toISOString()} freed up.`, { bookingId: booking.id });

  return booking;
}
