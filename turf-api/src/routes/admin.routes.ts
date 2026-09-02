import { Router } from 'express';
import { verifyToken } from '../../../auth/src/middleware/verifyToken';
import { requireAdmin } from '../middleware/requireAdmin';
import { validate, asyncHandler } from '../utils/validate';
import { rejectTurfSchema } from '../schemas/turf.schema';
import { listTurfsByStatus, setTurfStatus, adminStats } from '../services/turf.service';

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
