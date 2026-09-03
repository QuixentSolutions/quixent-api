import Booking from '../models/booking/Booking';
import Turf from '../models/turf/Turf';
import { sendPushNotification } from '../services/notifications';

let started = false;

/** Release slot holds whose payment never completed in time. */
async function expireStaleLocks() {
  const now = new Date();
  await Booking.updateMany(
    { status: 'locked', lockExpiresAt: { $lt: now } },
    { status: 'expired', slotHeld: false, lockExpiresAt: null },
  );
}

/** Mark finished bookings complete + prompt the customer for a review. */
async function completeFinishedBookings() {
  const now = new Date();
  const due = await Booking.find({ status: 'confirmed', slotEnd: { $lt: now } }).limit(200);
  for (const b of due) {
    b.status = 'completed';
    await b.save();
    const turf = await Turf.findById(b.turfId).select('name').lean();
    sendPushNotification(b.customerId, 'How was your game? ⭐', `Rate your visit to ${turf?.name ?? 'the turf'}.`, { bookingId: b.id, action: 'review' });
  }
}

/** Remind customers ~60 min before their slot. */
async function sendReminders() {
  const now = Date.now();
  const soon = new Date(now + 60 * 60_000);
  const upcoming = await Booking.find({
    status: 'confirmed',
    reminderSentAt: null,
    slotStart: { $gt: new Date(now), $lte: soon },
  }).limit(200);
  for (const b of upcoming) {
    const turf = await Turf.findById(b.turfId).select('name').lean();
    sendPushNotification(b.customerId, 'Game soon ⏰', `Your slot at ${turf?.name ?? 'the turf'} starts within the hour.`, { bookingId: b.id });
    b.reminderSentAt = new Date();
    await b.save();
  }
}

async function tick() {
  try { await expireStaleLocks(); } catch (e) { console.error('[turf-spot sweep] locks', e); }
  try { await completeFinishedBookings(); } catch (e) { console.error('[turf-spot sweep] complete', e); }
  try { await sendReminders(); } catch (e) { console.error('[turf-spot sweep] reminders', e); }
}

/** Call once from the module index, in the main server process only. */
export function startSweepers() {
  if (started) return;
  started = true;
  setInterval(tick, 60_000).unref();
  // first run shortly after boot
  setTimeout(tick, 10_000).unref();
}
