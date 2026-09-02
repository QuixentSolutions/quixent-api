import { ITurfDocument } from '../models/turf/Turf';
import { IPriceBreakup } from '../models/booking/Booking';
import { getConfig } from './config.service';
import { weekdayKey, hhmm, hoursBetween } from '../utils/time';

/** Per-hour rate for a turf at a given slot instant: first matching pricing rule, else base. */
export function resolveHourlyRate(turf: ITurfDocument, slotStart: Date): number {
  const day = weekdayKey(slotStart);
  const t = hhmm(slotStart);

  for (const rule of turf.pricingRules) {
    if (!rule.days.includes(day)) continue;
    if (t >= rule.startTime && t < rule.endTime) return rule.pricePerHour;
  }
  return turf.basePricePerHour;
}

/** Full customer-facing breakup for a slot. */
export async function buildBreakup(turf: ITurfDocument, slotStart: Date, slotEnd: Date): Promise<IPriceBreakup> {
  const config = await getConfig();
  const hours = hoursBetween(hhmm(slotStart), hhmm(slotEnd));
  const turfCharge = Math.round(resolveHourlyRate(turf, slotStart) * hours);
  const platformFee = config.platformFeeFlat;
  const gst = Math.round((turfCharge * config.gstPercent) / 100);
  const total = turfCharge + platformFee + gst;
  return { turfCharge, platformFee, gst, total };
}

/** Owner economics, frozen onto the booking at confirm time. */
export async function splitEarnings(turfCharge: number): Promise<{ commissionAmount: number; ownerEarning: number }> {
  const config = await getConfig();
  const commissionAmount = Math.round((turfCharge * config.commissionPercent) / 100);
  return { commissionAmount, ownerEarning: turfCharge - commissionAmount };
}
