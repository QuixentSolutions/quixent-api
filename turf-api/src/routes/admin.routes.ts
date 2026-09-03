import { Router } from 'express';
import { verifyToken } from '../../../auth/src/middleware/verifyToken';
import { requireAdmin } from '../middleware/requireAdmin';
import { validate, asyncHandler } from '../utils/validate';
import { rejectTurfSchema, updateTurfSchema } from '../schemas/turf.schema';
import { listTurfsByStatus, getTurfByIdAdmin, setTurfStatus, adminUpdateTurf, adminStats } from '../services/turf.service';
import { adminListBookings } from '../services/booking.service';
import { listReviewsForTurf } from '../services/review.service';

const router = Router();

router.use(verifyToken, requireAdmin);

router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, stats: await adminStats() });
  }),
);

// ?status=pending|approved|rejected  (omit for all)
router.get(
  '/turfs',
  asyncHandler(async (req, res) => {
    const turfs = await listTurfsByStatus(req.query.status as string | undefined);
    res.json({ success: true, turfs });
  }),
);

router.get(
  '/turfs/pending',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, turfs: await listTurfsByStatus('pending') });
  }),
);

router.get(
  '/turfs/:id',
  asyncHandler(async (req, res) => {
    res.json({ success: true, turf: await getTurfByIdAdmin(req.params.id) });
  }),
);

router.get(
  '/turfs/:id/reviews',
  asyncHandler(async (req, res) => {
    res.json({ success: true, reviews: await listReviewsForTurf(req.params.id) });
  }),
);

router.get(
  '/turfs/:id/bookings',
  asyncHandler(async (req, res) => {
    const bookings = await adminListBookings({ turfId: req.params.id, scope: (req.query.scope as any) ?? 'all' });
    res.json({ success: true, bookings });
  }),
);

// ?turfId= &ownerId= &status= &date= &scope=upcoming|past|all &limit=
router.get(
  '/bookings',
  asyncHandler(async (req, res) => {
    const { turfId, ownerId, status, date, scope, limit } = req.query as Record<string, string>;
    const bookings = await adminListBookings({
      turfId,
      ownerId,
      status,
      date,
      scope: scope as any,
      limit: limit ? Number(limit) : undefined,
    });
    res.json({ success: true, bookings });
  }),
);

router.patch(
  '/turfs/:id',
  validate(updateTurfSchema),
  asyncHandler(async (req, res) => {
    const turf = await adminUpdateTurf(req.params.id, req.body);
    res.json({ success: true, turf });
  }),
);

router.patch(
  '/turfs/:id/approve',
  asyncHandler(async (req, res) => {
    res.json({ success: true, turf: await setTurfStatus(req.params.id, 'approved') });
  }),
);

router.patch(
  '/turfs/:id/reject',
  validate(rejectTurfSchema),
  asyncHandler(async (req, res) => {
    res.json({ success: true, turf: await setTurfStatus(req.params.id, 'rejected', req.body.reason) });
  }),
);

export default router;
