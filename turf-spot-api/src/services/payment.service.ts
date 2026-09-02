import Booking from '../models/booking/Booking';
import Payment from '../models/booking/Payment';
import Turf from '../models/turf/Turf';
import { confirmBooking, expireBooking } from './booking.service';
import { buildCheckout, verifyResponseHash, verifyPayment } from '../config/payu';
import { generateTxnId } from '../utils/bookingCode';

interface Customer { userId: string; name: string; email?: string; phone: string }

/** Step 2: create a Payment row + return the PayU form the client auto-submits. */
export async function initiatePayment(booking_id: string, customer: Customer) {
  const booking = await Booking.findById(booking_id);
  if (!booking) throw { status: 404, message: 'Booking not found', error: 'BOOKING_NOT_FOUND' };
  if (booking.customerId !== customer.userId) throw { status: 403, message: 'Not your booking', error: 'FORBIDDEN' };
  if (booking.status !== 'locked') throw { status: 409, message: `Booking is ${booking.status}`, error: 'BOOKING_NOT_LOCKABLE' };
  if (booking.lockExpiresAt && booking.lockExpiresAt.getTime() < Date.now()) {
    await expireBooking(booking.id);
    throw { status: 409, message: 'Your slot hold expired. Please book again.', error: 'LOCK_EXPIRED' };
  }

  const turf = await Turf.findById(booking.turfId).select('name').lean();

  // Reuse an existing un-paid Payment for this booking if present.
  let payment = await Payment.findOne({ bookingId: booking._id, status: 'created' });
  if (!payment) {
    payment = await Payment.create({
      bookingId: booking._id,
      customerId: customer.userId,
      txnid: generateTxnId(),
      amount: booking.priceBreakup.total,
    });
  }

  const checkout = buildCheckout({
    txnid: payment.txnid,
    amount: booking.priceBreakup.total.toFixed(2),
    productinfo: `Turf booking - ${turf?.name ?? booking.turfId}`,
    firstname: customer.name || 'Customer',
    email: customer.email || 'noreply@turfspot.app',
    phone: customer.phone,
    udf1: booking.id,
  });

  return { paymentId: payment.id, txnid: payment.txnid, checkout };
}

/**
 * PayU redirect handler (SURL/FURL). `body` is the x-www-form-urlencoded
 * payload PayU posts back. Verifies the hash, then reconciles booking+payment.
 * Returns a small result the route turns into a redirect back to the app.
 */
export async function handlePayuCallback(body: Record<string, string>): Promise<{ ok: boolean; bookingId: string | null; reason?: string }> {
  const txnid = body.txnid;
  if (!txnid) return { ok: false, bookingId: null, reason: 'missing txnid' };

  const payment = await Payment.findOne({ txnid });
  if (!payment) return { ok: false, bookingId: null, reason: 'unknown txn' };

  const bookingId = (await Booking.findById(payment.bookingId).select('_id'))?.id ?? null;

  if (!verifyResponseHash(body)) {
    // Do NOT trust the payload. Fall back to a server-to-server check.
    const v = await verifyPayment(txnid);
    if (!v || String(v.status).toLowerCase() !== 'success') {
      payment.status = 'failed';
      payment.rawResponse = body;
      await payment.save();
      if (bookingId) await expireBooking(bookingId);
      return { ok: false, bookingId, reason: 'hash mismatch / not success' };
    }
  }

  const status = String(body.status || '').toLowerCase();
  payment.rawResponse = body;
  payment.payuMihpayid = body.mihpayid ?? null;
  payment.payuMode = body.mode ?? null;

  if (status === 'success') {
    payment.status = 'paid';
    await payment.save();
    await confirmBooking(payment.bookingId.toString(), payment.id);
    return { ok: true, bookingId };
  }

  payment.status = 'failed';
  await payment.save();
  if (bookingId) await expireBooking(bookingId);
  return { ok: false, bookingId, reason: status || 'failure' };
}

/** Client-triggered reconciliation (poll after returning to the app). */
export async function reconcile(txnid: string, userId: string) {
  const payment = await Payment.findOne({ txnid });
  if (!payment) throw { status: 404, message: 'Payment not found', error: 'PAYMENT_NOT_FOUND' };
  if (payment.customerId !== userId) throw { status: 403, message: 'Not your payment', error: 'FORBIDDEN' };

  if (payment.status === 'paid') {
    const booking = await confirmBooking(payment.bookingId.toString(), payment.id);
    return { status: 'paid', bookingId: booking.id, bookingCode: booking.bookingCode };
  }

  const v = await verifyPayment(txnid);
  const s = v ? String(v.status).toLowerCase() : 'pending';
  if (s === 'success') {
    payment.status = 'paid';
    payment.payuMihpayid = v.mihpayid ?? null;
    payment.rawResponse = v;
    await payment.save();
    const booking = await confirmBooking(payment.bookingId.toString(), payment.id);
    return { status: 'paid', bookingId: booking.id, bookingCode: booking.bookingCode };
  }
  if (s === 'failure') {
    payment.status = 'failed';
    await payment.save();
    await expireBooking(payment.bookingId.toString());
    return { status: 'failed', bookingId: payment.bookingId.toString() };
  }
  return { status: 'pending', bookingId: payment.bookingId.toString() };
}
