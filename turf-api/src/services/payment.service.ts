import Booking from '../models/Booking';
import Payment, { IPaymentDocument } from '../models/Payment';
import User from '../../../auth/src/models/User';
import {
  PAYU_PAYMENT_URL,
  generateRequestHash,
  verifyResponseHash,
  generateTxnId,
  getCallbackBaseUrl,
  sanitizePayuText,
} from '../config/payu';

const HOLD_MINUTES = Number(process.env.TURFSPOT_PAYMENT_HOLD_MINUTES ?? 15);

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// ---------- Initiate ----------

export async function initiatePayment(userId: string, bookingId: string) {
  const booking = await Booking.findOne({ _id: bookingId, userId });
  if (!booking) throw { status: 404, message: 'Booking not found', error: 'BOOKING_NOT_FOUND' };
  if (booking.status !== 'pending' || booking.paymentStatus !== 'unpaid') {
    throw { status: 409, message: `Booking is ${booking.status}, cannot start payment`, error: 'BOOKING_NOT_PAYABLE' };
  }

  const holdExpiry = new Date(booking.createdAt.getTime() + HOLD_MINUTES * 60_000);
  if (holdExpiry.getTime() < Date.now()) {
    throw { status: 409, message: 'This booking’s payment window has expired — please book again', error: 'HOLD_EXPIRED' };
  }

  const user = await User.findById(userId).select('name mobile email').lean();
  const firstname = sanitizePayuText(user?.name || 'Player', 60);
  // PayU requires a non-empty email. The profile's real email is used when
  // set; otherwise fall back to a synthetic one (the platform is phone-first).
  const email = user?.email || `${(user?.mobile ?? userId).replace(/\D/g, '') || 'guest'}@turfspot.app`;
  const phone = (user?.mobile ?? '').replace(/\D/g, '') || '9999999999';
  const amount = booking.totalPrice.toFixed(2);
  const productinfo = sanitizePayuText(`Turf booking - ${booking.turfName}`, 100);
  const txnid = generateTxnId();

  const hash = generateRequestHash({ txnid, amount, productinfo, firstname, email });

  const payment = await Payment.create({
    bookingId: booking._id,
    userId,
    turfId: booking.turfId,
    txnid,
    amount: booking.totalPrice,
    status: 'initiated',
    gateway: 'payu',
    // Copied from the booking's own stored breakdown (computed once, at
    // booking creation, in config/fees.ts) — never recomputed from anything
    // the client sends, since the client only ever supplies a bookingId.
    baseAmount: booking.baseAmount,
    platformFee: booking.platformFeeAmount,
    gstAmount: booking.gstAmount,
    cgstAmount: booking.cgstAmount,
    sgstAmount: booking.sgstAmount,
    requestSnapshot: { amount, productinfo, firstname, email, phone },
    payuStatus: undefined,
    rawResponse: { hash }, // stored so the redirect page never has to recompute/trust anything client-supplied
  });

  return {
    txnid: payment.txnid,
    redirectUrl: `${getCallbackBaseUrl()}/turf/payments/payu/redirect/${payment.txnid}`,
  };
}

// ---------- Auto-submitting redirect page ----------

export async function renderRedirectForm(txnid: string): Promise<string> {
  const payment = await Payment.findOne({ txnid });
  if (!payment) throw { status: 404, message: 'Payment session not found', error: 'PAYMENT_NOT_FOUND' };
  if (payment.status !== 'initiated') {
    throw { status: 409, message: `Payment already ${payment.status}`, error: 'PAYMENT_NOT_PENDING' };
  }

  const hash = (payment.rawResponse as { hash?: string } | undefined)?.hash;
  if (!hash) throw { status: 500, message: 'Payment session is missing its hash', error: 'PAYMENT_HASH_MISSING' };

  const base = getCallbackBaseUrl();
  const s = payment.requestSnapshot;
  const fields: Record<string, string> = {
    key: process.env.PAYU_KEY ?? '',
    txnid: payment.txnid,
    amount: s.amount,
    productinfo: s.productinfo,
    firstname: s.firstname,
    email: s.email,
    phone: s.phone,
    surl: `${base}/turf/payments/payu/success`,
    furl: `${base}/turf/payments/payu/failure`,
    hash,
  };

  const inputs = Object.entries(fields)
    .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}" />`)
    .join('\n      ');

  return `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Redirecting to PayU…</title></head>
  <body onload="document.forms[0].submit()">
    <p style="font-family: sans-serif; text-align: center; margin-top: 3rem;">Redirecting to PayU, please wait…</p>
    <form action="${escapeHtml(PAYU_PAYMENT_URL)}" method="post">
      ${inputs}
    </form>
  </body>
</html>`;
}

// ---------- Callback (surl / furl) ----------

function resultPage(status: 'success' | 'failure', bookingId: string, message: string): string {
  const deepLink = `turfspot://payment/result?status=${status}&bookingId=${encodeURIComponent(bookingId)}`;
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Payment ${status === 'success' ? 'successful' : 'failed'}</title>
    <script>window.location.replace(${JSON.stringify(deepLink)});</script>
  </head>
  <body style="font-family: sans-serif; text-align: center; margin-top: 3rem;">
    <h2>${status === 'success' ? '✅ Payment successful' : '❌ Payment failed'}</h2>
    <p>${escapeHtml(message)}</p>
    <p><a href="${escapeHtml(deepLink)}">Tap here to return to the app</a></p>
  </body>
</html>`;
}

export async function handlePayuCallback(body: Record<string, string>, viaSuccessUrl: boolean): Promise<string> {
  const { txnid, status, hash } = body;
  if (!txnid) return resultPage('failure', '', 'Malformed response from the payment gateway.');

  const payment = await Payment.findOne({ txnid });
  if (!payment) return resultPage('failure', '', 'Payment session not found.');

  // Idempotent: PayU (or a resubmitted browser) may call this more than once.
  if (payment.status === 'success' || payment.status === 'failure') {
    const booking = await Booking.findById(payment.bookingId).lean();
    return resultPage(
      payment.status === 'success' ? 'success' : 'failure',
      booking?._id?.toString() ?? '',
      payment.status === 'success' ? 'Your slot is confirmed.' : 'Your booking was not confirmed.',
    );
  }

  const verified = verifyResponseHash(
    {
      status: status ?? '',
      txnid,
      amount: body.amount ?? payment.requestSnapshot.amount,
      productinfo: body.productinfo ?? payment.requestSnapshot.productinfo,
      firstname: body.firstname ?? payment.requestSnapshot.firstname,
      email: body.email ?? payment.requestSnapshot.email,
      udf1: body.udf1,
      udf2: body.udf2,
      udf3: body.udf3,
      udf4: body.udf4,
      udf5: body.udf5,
      key: body.key ?? process.env.PAYU_KEY ?? '',
    },
    hash ?? '',
  );

  const booking = await Booking.findById(payment.bookingId);
  const isSuccess = verified && status === 'success' && viaSuccessUrl;

  payment.status = isSuccess ? 'success' : 'failure';
  payment.payuMihpayid = body.mihpayid;
  payment.payuMode = body.mode;
  payment.payuStatus = status;
  payment.rawResponse = { ...body, hashVerified: verified };
  if (!verified) payment.errorMessage = 'Response hash verification failed';
  await payment.save();

  if (!booking) return resultPage(isSuccess ? 'success' : 'failure', '', 'Booking record not found.');

  if (isSuccess && booking.status === 'pending') {
    booking.status = 'confirmed';
    booking.paymentStatus = 'paid';
    booking.paymentId = payment._id as any;
    await booking.save();
    return resultPage('success', booking._id.toString(), 'Your slot is confirmed.');
  }

  if (!isSuccess && booking.status === 'pending') {
    booking.status = 'cancelled';
    booking.cancelledBy = 'system';
    booking.cancellationReason = verified ? 'Payment failed' : 'Payment verification failed';
    booking.cancelledAt = new Date();
    booking.paymentId = payment._id as any;
    await booking.save();
  }

  return resultPage('failure', booking._id.toString(), 'Your booking was not confirmed — the slot has been released.');
}

// ---------- Status polling (authoritative re-check from the app) ----------

export async function getPaymentStatus(userId: string, txnid: string) {
  const payment = await Payment.findOne({ txnid, userId }).lean();
  if (!payment) throw { status: 404, message: 'Payment not found', error: 'PAYMENT_NOT_FOUND' };
  const booking = await Booking.findById(payment.bookingId).lean();
  return { status: payment.status, booking };
}

export type { IPaymentDocument };
