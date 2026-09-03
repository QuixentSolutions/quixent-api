import crypto from 'crypto';

// Human-friendly booking reference, e.g. "TS-48213". Not a security token —
// uniqueness is enforced by a unique index on Booking.bookingCode, callers
// retry on the rare collision.
export function generateBookingCode(): string {
  const n = 10000 + crypto.randomInt(0, 90000);
  return `TS-${n}`;
}

// Unique-ish transaction id for the payment gateway.
export function generateTxnId(): string {
  return `TSX${Date.now()}${crypto.randomInt(100, 999)}`;
}
