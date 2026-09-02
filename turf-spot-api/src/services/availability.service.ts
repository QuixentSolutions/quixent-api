import Turf from '../models/turf/Turf';
import Booking from '../models/booking/Booking';
import TurfBlock from '../models/turf/Block';
import { resolveHourlyRate } from './pricing.service';
import { slotInstant, slotStartsForDay, hoursBetween } from '../utils/time';

export type SlotState = 'available' | 'booked' | 'blocked' | 'past';

export interface SlotView {
  start: string;      // "18:00" IST wall clock
  end: string;        // "19:00"
  slotStartISO: string;
  state: SlotState;
  pricePerHour: number;
}

/** Slot grid for one turf on one calendar day (YYYY-MM-DD, IST). */
export async function getDayAvailability(turfId: string, dateISO: string): Promise<{ turfId: string; date: string; slots: SlotView[] }> {
  const turf = await Turf.findOne({ _id: turfId, status: 'approved' });
  if (!turf) throw { status: 404, message: 'Turf not found', error: 'TURF_NOT_FOUND' };

  const { open, close } = turf.operatingHours;
  const duration = turf.slotDurationMins;
  const starts = slotStartsForDay(open, close, duration);

  const dayStart = slotInstant(dateISO, open);
  const dayEnd = slotInstant(dateISO, close);

  const [heldBookings, blocks] = await Promise.all([
    Booking.find({
      turfId,
      slotHeld: true,
      slotStart: { $gte: dayStart, $lt: dayEnd },
    }).select('slotStart').lean(),
    TurfBlock.find({ turfId, startsAt: { $lt: dayEnd }, endsAt: { $gt: dayStart } }).lean(),
  ]);

  const bookedSet = new Set(heldBookings.map((b) => new Date(b.slotStart).getTime()));
  const now = Date.now();

  const slots: SlotView[] = starts.map((startHHmm) => {
    const startDate = slotInstant(dateISO, startHHmm);
    const endMins = duration;
    const endDate = new Date(startDate.getTime() + endMins * 60000);
    const [h, m] = startHHmm.split(':').map(Number);
    const endHHmm = `${String(Math.floor((h * 60 + m + duration) / 60)).padStart(2, '0')}:${String((h * 60 + m + duration) % 60).padStart(2, '0')}`;

    let state: SlotState = 'available';
    if (startDate.getTime() < now) state = 'past';
    else if (bookedSet.has(startDate.getTime())) state = 'booked';
    else if (blocks.some((b) => startDate < new Date(b.endsAt) && endDate > new Date(b.startsAt))) state = 'blocked';

    return {
      start: startHHmm,
      end: endHHmm,
      slotStartISO: startDate.toISOString(),
      state,
      pricePerHour: resolveHourlyRate(turf, startDate),
    };
  });

  return { turfId, date: dateISO, slots };
}

/** Validate a requested slot against the turf's schedule + blocks (throws on problems). */
export async function assertSlotBookable(turfId: string, slotStartISO: string): Promise<{ slotStart: Date; slotEnd: Date }> {
  const turf = await Turf.findById(turfId);
  if (!turf || turf.status !== 'approved') throw { status: 404, message: 'Turf not available', error: 'TURF_NOT_BOOKABLE' };

  const slotStart = new Date(slotStartISO);
  if (isNaN(slotStart.getTime())) throw { status: 400, message: 'Invalid slotStart', error: 'INVALID_INPUT' };
  if (slotStart.getTime() < Date.now()) throw { status: 400, message: 'Slot is in the past', error: 'SLOT_IN_PAST' };

  const slotEnd = new Date(slotStart.getTime() + turf.slotDurationMins * 60000);

  const block = await TurfBlock.findOne({ turfId, startsAt: { $lt: slotEnd }, endsAt: { $gt: slotStart } });
  if (block) throw { status: 409, message: 'Slot is blocked by the owner', error: 'SLOT_BLOCKED' };

  return { slotStart, slotEnd };
}
