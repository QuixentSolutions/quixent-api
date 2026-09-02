import Turf, { ITurfDocument, Weekday } from '../models/Turf';
import Booking from '../models/Booking';
import BlockedSlot from '../models/BlockedSlot';
import { generateDaySlots, bookedRangeMinutes, rangesOverlap, toMinutes, GeneratedSlot } from '../utils/slots';

export interface AvailabilitySlot {
  startTime: string;
  endTime: string;
  price: number;
  available: boolean;
  reason?: 'booked' | 'blocked' | 'past' | 'closed';
}

export interface DayAvailability {
  turfId: string;
  date: string;
  weekday: Weekday;
  isClosed: boolean;
  slotDurationMinutes: number;
  slots: AvailabilitySlot[];
}

function weekdayOf(dateStr: string): Weekday {
  // Interpret the date as local midnight — matches how slots are wall-clock.
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay() as Weekday;
}

export async function getTurfForBooking(turfId: string): Promise<ITurfDocument> {
  const turf = await Turf.findOne({ _id: turfId, status: 'approved' });
  if (!turf) throw { status: 404, message: 'Turf not found', error: 'TURF_NOT_FOUND' };
  return turf;
}

export async function getDayAvailability(turfId: string, date: string): Promise<DayAvailability> {
  const turf = await getTurfForBooking(turfId);
  const weekday = weekdayOf(date);
  const openMinutes = toMinutes(turf.openTime);

  const isClosed = !turf.isActive || turf.weeklyClosedDays.includes(weekday);

  const baseSlots: GeneratedSlot[] = isClosed ? [] : generateDaySlots(turf, weekday);

  const [bookings, blocks] = await Promise.all([
    Booking.find({ turfId, date, status: { $in: ['pending', 'confirmed'] } }).select('startTime endTime').lean(),
    BlockedSlot.find({ turfId, date }).select('startTime endTime').lean(),
  ]);

  const takenRanges = [
    ...bookings.map((b) => bookedRangeMinutes(b.startTime, b.endTime, openMinutes)),
    ...blocks.map((b) => bookedRangeMinutes(b.startTime, b.endTime, openMinutes)),
  ];

  // "Now" as wall-clock minutes, only compared when the requested date is today.
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const isToday = date === todayStr;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const slots: AvailabilitySlot[] = baseSlots.map((s) => {
    // Post-midnight slots (startMinutes >= 1440) belong to the small hours of
    // the next calendar day, so they're never "past" relative to today's clock.
    const past = isToday && s.startMinutes < 1440 && s.startMinutes <= nowMinutes;
    const overlapsTaken = takenRanges.some((r) => rangesOverlap(s.startMinutes, s.endMinutes, r.start, r.end));

    let available = true;
    let reason: AvailabilitySlot['reason'];
    if (past) {
      available = false;
      reason = 'past';
    } else if (overlapsTaken) {
      available = false;
      reason = 'booked';
    }

    return { startTime: s.startTime, endTime: s.endTime, price: s.price, available, reason };
  });

  return {
    turfId,
    date,
    weekday,
    isClosed,
    slotDurationMinutes: turf.slotDurationMinutes || 60,
    slots,
  };
}

// Validate a requested booking window against the live availability and
// return the concrete slot rows it covers. Throws on any conflict.
export async function resolveBookingWindow(turfId: string, date: string, startTime: string, slotCount: number) {
  const availability = await getDayAvailability(turfId, date);
  if (availability.isClosed) {
    throw { status: 409, message: 'Turf is closed on this day', error: 'TURF_CLOSED' };
  }

  const startIdx = availability.slots.findIndex((s) => s.startTime === startTime);
  if (startIdx === -1) {
    throw { status: 400, message: 'That start time is not a valid slot for this turf', error: 'INVALID_SLOT' };
  }

  const chosen = availability.slots.slice(startIdx, startIdx + slotCount);
  if (chosen.length < slotCount) {
    throw { status: 400, message: 'Requested duration runs past the turf’s closing time', error: 'SLOT_OUT_OF_RANGE' };
  }

  const blocked = chosen.find((s) => !s.available);
  if (blocked) {
    const msg =
      blocked.reason === 'past'
        ? 'That slot has already started'
        : blocked.reason === 'booked'
        ? 'One or more of those slots is already booked'
        : 'That slot is unavailable';
    throw { status: 409, message: msg, error: 'SLOT_UNAVAILABLE' };
  }

  const turf = await getTurfForBooking(turfId);
  const durationMinutes = slotCount * (turf.slotDurationMinutes || 60);
  const totalPrice = chosen.reduce((sum, s) => sum + s.price, 0);

  return {
    turf,
    startTime,
    endTime: chosen[chosen.length - 1].endTime,
    slotCount,
    durationMinutes,
    pricePerSlot: chosen[0].price,
    totalPrice,
  };
}
