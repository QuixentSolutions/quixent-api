import { Router } from 'express';
import { verifyToken } from '../../../auth/src/middleware/verifyToken';
import { validate, asyncHandler } from '../utils/validate';
import { createTurfSchema, updateTurfSchema, blockSlotSchema } from '../schemas/turf.schema';
import { cancelBookingSchema, ownerBookingsQuerySchema } from '../schemas/booking.schema';
import {
  createTurf,
  listOwnerTurfs,
  getOwnedTurf,
  updateOwnerTurf,
  deleteOwnerTurf,
} from '../services/turf.service';
import {
  listOwnerBookings,
  ownerConfirmBooking,
  ownerCancelBooking,
  ownerMarkNoShow,
  listBlockedSlots,
  createBlockedSlot,
  deleteBlockedSlot,
  ownerStats,
} from '../services/booking.service';

const router = Router();

// "Owner" isn't a role on the shared User — anyone with an account becomes an
// owner by registering a turf (ownership-based, same as thallu-vandi vendors).
router.use(verifyToken);

// --- Dashboard ---
router.get(
  '/stats',
  asyncHandler(async (req: any, res) => {
    res.json({ success: true, stats: await ownerStats(req.user.userId) });
  }),
);

// --- Turf CRUD ---
router.get(
  '/turfs',
  asyncHandler(async (req: any, res) => {
    res.json({ success: true, turfs: await listOwnerTurfs(req.user.userId) });
  }),
);

router.post(
  '/turfs',
  validate(createTurfSchema),
  asyncHandler(async (req: any, res) => {
    const turf = await createTurf(req.user.userId, req.body);
    res.status(201).json({ success: true, turf });
  }),
);

router.get(
  '/turfs/:id',
  asyncHandler(async (req: any, res) => {
    res.json({ success: true, turf: await getOwnedTurf(req.params.id, req.user.userId) });
  }),
);

router.patch(
  '/turfs/:id',
  validate(updateTurfSchema),
  asyncHandler(async (req: any, res) => {
    const turf = await updateOwnerTurf(req.params.id, req.user.userId, req.body);
    res.json({ success: true, turf });
  }),
);

router.delete(
  '/turfs/:id',
  asyncHandler(async (req: any, res) => {
    await deleteOwnerTurf(req.params.id, req.user.userId);
    res.status(204).send();
  }),
);

// --- Bookings for the owner's turfs ---
router.get(
  '/bookings',
  validate(ownerBookingsQuerySchema, 'query'),
  asyncHandler(async (req: any, res) => {
    const bookings = await listOwnerBookings(req.user.userId, req.query);
    res.json({ success: true, bookings });
  }),
);

router.patch(
  '/bookings/:id/confirm',
  asyncHandler(async (req: any, res) => {
    res.json({ success: true, booking: await ownerConfirmBooking(req.params.id, req.user.userId) });
  }),
);

router.patch(
  '/bookings/:id/cancel',
  validate(cancelBookingSchema),
  asyncHandler(async (req: any, res) => {
    res.json({ success: true, booking: await ownerCancelBooking(req.params.id, req.user.userId, req.body.reason) });
  }),
);

router.patch(
  '/bookings/:id/no-show',
  asyncHandler(async (req: any, res) => {
    res.json({ success: true, booking: await ownerMarkNoShow(req.params.id, req.user.userId) });
  }),
);

// --- Blocked slots (maintenance / private events) ---
router.get(
  '/turfs/:id/blocks',
  asyncHandler(async (req: any, res) => {
    const blocks = await listBlockedSlots(req.params.id, req.user.userId, req.query.date as string | undefined);
    res.json({ success: true, blocks });
  }),
);

router.post(
  '/turfs/:id/blocks',
  validate(blockSlotSchema),
  asyncHandler(async (req: any, res) => {
    const result = await createBlockedSlot(req.params.id, req.user.userId, req.body);
    res.status(201).json({ success: true, ...result });
  }),
);

router.delete(
  '/blocks/:id',
  asyncHandler(async (req: any, res) => {
    await deleteBlockedSlot(req.params.id, req.user.userId);
    res.status(204).send();
  }),
);

export default router;
