import { Router } from 'express';
import { verifyToken } from '../middleware/verifyToken';
import { validate, asyncHandler } from '../utils/validate';
import { lockSlotSchema, cancelSchema, myBookingsQuerySchema, pushTokenSchema } from '../schemas/booking.schema';
import { lockSlot, getBookingForUser, listCustomerBookings } from '../services/booking.service';
import { cancelBooking } from '../services/refund.service';
import { savePushToken } from '../services/notifications';

const router = Router();

router.use(verifyToken);

router.post('/push-token', validate(pushTokenSchema), asyncHandler(async (req: any, res) => {
  await savePushToken(req.user.userId, req.body.token);
  res.json({ success: true });
}));

// Step 1 of checkout — hold the slot
router.post('/lock', validate(lockSlotSchema), asyncHandler(async (req: any, res) => {
  const booking = await lockSlot(req.user.userId, req.body.turfId, req.body.slotStart);
  res.status(201).json({
    success: true,
    bookingId: booking.id,
    priceBreakup: booking.priceBreakup,
    lockExpiresAt: booking.lockExpiresAt,
    slotStart: booking.slotStart,
    slotEnd: booking.slotEnd,
  });
}));

router.get('/mine', validate(myBookingsQuerySchema, 'query'), asyncHandler(async (req: any, res) => {
  res.json({ success: true, bookings: await listCustomerBookings(req.user.userId, (req.query as any).tab) });
}));

router.get('/:id', asyncHandler(async (req: any, res) => {
  const booking = await getBookingForUser(req.params.id, req.user.userId);
  res.json({ success: true, booking, ticket: booking.bookingCode ? { code: booking.bookingCode, qrPayload: `TURFSPOT|${booking.bookingCode}` } : null });
}));

router.post('/:id/cancel', validate(cancelSchema), asyncHandler(async (req: any, res) => {
  const booking = await cancelBooking({ bookingId: req.params.id, actorId: req.user.userId, by: 'customer', reason: req.body.reason });
  res.json({ success: true, booking });
}));

export default router;
