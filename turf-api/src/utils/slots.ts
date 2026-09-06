import type { ITurfDocument, Weekday } from '../models/Turf';

// Single-market pilot — the server treats "YYYY-MM-DD" + "HH:mm" as the
// turf's local wall-clock and does plain minute arithmetic. No timezone
// conversion, matching thallu-vandi-api's utils/hours.ts approach.

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function toHHmm(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export interface GeneratedSlot {
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm" (end of a single base slot)
  startMinutes: number; // minutes from 00:00 of the operating day (can exceed 1440 for post-midnight)
  endMinutes: number;
  price: number;
}

// Expand a turf's opening window into its discrete base slots for one day.
// Handles venues whose closeTime is past midnight (closeTime <= openTime).
export function generateDaySlots(turf: Pick<ITurfDocument,
  'openTime' | 'closeTime' | 'slotDurationMinutes' | 'pricePerHour' | 'priceRules'>,
  weekday: Weekday,
): GeneratedSlot[] {
  const step = turf.slotDurationMinutes || 60;
  const open = toMinutes(turf.openTime);
  let close = toMinutes(turf.closeTime);
  if (close <= open) close += 1440; // wraps past midnight

  const slots: GeneratedSlot[] = [];
  for (let start = open; start + step <= close; start += step) {
    const end = start + step;
    slots.push({
      startTime: toHHmm(start),
      endTime: toHHmm(end),
      startMinutes: start,
      endMinutes: end,
      price: priceForSlot(turf, weekday, start, step),
    });
  }
  return slots;
}

// pricePerHour is the base rate; a matching price rule overrides it. Slot
// price is prorated when slotDuration isn't exactly 60 minutes.
export function priceForSlot(
  turf: Pick<ITurfDocument, 'pricePerHour' | 'priceRules'>,
  weekday: Weekday,
  startMinutes: number,
  durationMinutes: number,
): number {
  const hour = Math.floor((startMinutes % 1440) / 60);
  let rate = turf.pricePerHour;

  for (const rule of turf.priceRules ?? []) {
    const dayOk = !rule.days || rule.days.length === 0 || rule.days.includes(weekday);
    const hourOk = hour >= rule.startHour && hour < rule.endHour;
    if (dayOk && hourOk) {
      rate = rule.pricePerHour;
      break;
    }
  }

  return Math.round((rate * durationMinutes) / 60);
}

// Two [start, end) minute ranges overlap.
export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// Normalise a stored booking/block ("HH:mm" pair, no wrap info) onto the same
// minute axis generateDaySlots uses, given the day's openTime.
export function bookedRangeMinutes(startTime: string, endTime: string, openMinutes: number) {
  let s = toMinutes(startTime);
  let e = toMinutes(endTime);
  if (s < openMinutes) s += 1440;
  if (e <= s) e += 1440;
  return { start: s, end: e };
}
