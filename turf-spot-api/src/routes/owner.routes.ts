import { Router } from 'express';
import { verifyToken } from '../middleware/verifyToken';
import { loadRole, requireRole } from '../middleware/roles';
import { validate, asyncHandler } from '../utils/validate';
import { cancelSchema } from '../schemas/booking.schema';
import { ownerBookings, ownerDashboard, ownerEarnings } from '../services/owner.service';
import { cancelBooking } from '../services/refund.service';

const router = Router();

router.use(verifyToken, loadRole, requireRole('turf_admin', 'super_admin'));

router.get('/dashboard', asyncHandler(async (req: any, res) => {
  res.json({ success: true, ...(await ownerDashboard(req.user.userId, req.query.turfId as string | undefined)) });
}));

router.get('/bookings', asyncHandler(async (req: any, res) => {
  const bookings = await ownerBookings(req.user.userId, {
    turfId: req.query.turfId,
    date: req.query.date,
    status: req.query.status,
    authHeader: req.headers.authorization ?? '',
  });
  res.json({ success: true, bookings });
}));

router.patch('/bookings/:id/cancel', validate(cancelSchema), asyncHandler(async (req: any, res) => {
  const booking = await cancelBooking({ bookingId: req.params.id, actorId: req.user.userId, by: 'owner', reason: req.body.reason });
  res.json({ success: true, booking });
}));

router.get('/earnings', asyncHandler(async (req: any, res) => {
  res.json({ success: true, ...(await ownerEarnings(req.user.userId, req.query.from, req.query.to)) });
}));

export default router;
