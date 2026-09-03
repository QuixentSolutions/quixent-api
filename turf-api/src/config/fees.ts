// Platform fee + GST — additive model: the owner's price is the BASE amount
// and is exactly what the owner receives. The platform fee and its GST are
// added ON TOP and charged to the customer via PayU — the customer pays more
// than the owner's listed price, and the owner is never shorted.
//
// GST applies only to the platform's own commission (the "service" the
// platform provides to the turf owner) — same model Zomato/Swiggy use for
// restaurant-partner commissions. It is NOT applied to the turf rental
// itself; that's a separate tax question outside this system's scope.
const PLATFORM_FEE_PERCENT = Number(process.env.TURFSPOT_PLATFORM_FEE_PERCENT ?? 1);
const GST_PERCENT = Number(process.env.TURFSPOT_GST_PERCENT ?? 18);

// GST is split evenly into CGST + SGST for an intra-state transaction (the
// standard case here — platform and turf owner in the same state). A
// genuinely inter-state booking would use IGST instead of CGST+SGST, but
// that split isn't modelled yet.
const CGST_PERCENT = GST_PERCENT / 2;
const SGST_PERCENT = GST_PERCENT / 2;

export interface FeeBreakdown {
  baseAmount: number; // the owner's price — exactly what the owner is paid out
  platformFeePercent: number;
  gstPercent: number;
  platformFeeAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  gstAmount: number; // cgstAmount + sgstAmount
  totalAmount: number; // baseAmount + platformFeeAmount + gstAmount — charged to the customer via PayU
  ownerPayoutAmount: number; // == baseAmount; kept as its own field for reporting clarity
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Both the backend (here, the source of truth) and the mobile app's
// utils/fees.ts compute this identically, using the same rates, so the
// checkout modal's preview matches what the server actually charges. The
// server is what's authoritative, though — the client never supplies an
// amount; it only ever sends a bookingId, and every amount PayU is handed
// comes from this function running server-side (see booking.service and
// payment.service), never anything the client proposed.
export function computeFeeBreakdown(baseAmount: number): FeeBreakdown {
  const platformFeeAmount = round2(baseAmount * (PLATFORM_FEE_PERCENT / 100));
  // Round each GST half independently (paise-accurate) rather than halving a
  // pre-rounded total, then derive the combined gstAmount from those.
  const cgstAmount = round2(platformFeeAmount * (CGST_PERCENT / 100));
  const sgstAmount = round2(platformFeeAmount * (SGST_PERCENT / 100));
  const gstAmount = round2(cgstAmount + sgstAmount);
  const totalAmount = round2(baseAmount + platformFeeAmount + gstAmount);

  return {
    baseAmount,
    platformFeePercent: PLATFORM_FEE_PERCENT,
    gstPercent: GST_PERCENT,
    platformFeeAmount,
    cgstAmount,
    sgstAmount,
    gstAmount,
    totalAmount,
    ownerPayoutAmount: baseAmount,
  };
}
