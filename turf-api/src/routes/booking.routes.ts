import { Router } from 'express';
import { verifyToken } from '../../../auth/src/middleware/verifyToken';
import { validate, asyncHandler } from '../utils/validate';
import { createBookingSchema, cancelBookingSchema, myBookingsQuerySchema } from '../schemas/booking.schema';
import {
  createBooking,
  listMyBookings,
  getMyBooking,
  cancelMyBooking,
} from '../services/booking.service';

const router = Router();

router.use(verifyToken);

router.post(
  '/',
  validate(createBookingSchema),
  asyncHandler(async (req: any, res) => {
    const booking = await createBooking(req.user.userId, req.body);
    res.status(201).json({ success: true, booking });
  }),
);

router.get(
  '/mine',
  validate(myBookingsQuerySchema, 'query'),
  asyncHandler(async (req: any, res) => {
    const { scope, status } = req.query;
    const bookings = await listMyBookings(req.user.userId, scope, status);
    res.json({ success: true, bookings });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req: any, res) => {
    const booking = await getMyBooking(req.params.id, req.user.userId);
    res.json({ success: true, booking });
  }),
);

router.patch(
  '/:id/cancel',
  validate(cancelBookingSchema),
  asyncHandler(async (req: any, res) => {
    const booking = await cancelMyBooking(req.params.id, req.user.userId, req.body.reason);
    res.json({ success: true, booking });
  }),
);

export default router;
