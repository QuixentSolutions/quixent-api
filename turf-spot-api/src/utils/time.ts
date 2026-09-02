import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

// The whole product operates in a single wall-clock timezone (India).
export const TZ = 'Asia/Kolkata';

export const dj = dayjs;

/** "2026-08-28" + "18:00" (IST wall clock) -> absolute Date (UTC instant). */
export function slotInstant(dateISO: string, timeHHmm: string): Date {
  return dayjs.tz(`${dateISO} ${timeHHmm}`, 'YYYY-MM-DD HH:mm', TZ).toDate();
}

/** Local weekday key for a given instant, e.g. "mon". */
export function weekdayKey(d: Date): string {
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dayjs(d).tz(TZ).day()];
}

/** "HH:mm" wall-clock string for an instant. */
export function hhmm(d: Date): string {
  return dayjs(d).tz(TZ).format('HH:mm');
}

/** Whole hours between two "HH:mm" strings (end must be after start). */
export function hoursBetween(startHHmm: string, endHHmm: string): number {
  const [sh, sm] = startHHmm.split(':').map(Number);
  const [eh, em] = endHHmm.split(':').map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) / 60;
}

/** Generate slot start times ("HH:mm") between open/close for a given duration. */
export function slotStartsForDay(open: string, close: string, durationMins: number): string[] {
  const [oh, om] = open.split(':').map(Number);
  const [ch, cm] = close.split(':').map(Number);
  const out: string[] = [];
  for (let m = oh * 60 + om; m + durationMins <= ch * 60 + cm; m += durationMins) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
}
