import { Router } from 'express';
import { verifyToken } from '../../../auth/src/middleware/verifyToken';
import { requireAdmin } from '../middleware/requireAdmin';
import { asyncHandler } from '../utils/validate';
import { listPendingStalls, setStallStatus } from '../services/stall.service';

const router = Router();

router.use(verifyToken, requireAdmin);

router.get(
  '/stalls/pending',
  asyncHandler(async (_req, res) => {
    const stalls = await listPendingStalls();
    res.json({ success: true, stalls });
  }),
);

router.patch(
  '/stalls/:id/approve',
  asyncHandler(async (req, res) => {
    const stall = await setStallStatus(req.params.id, 'approved');
    res.json({ success: true, stall });
  }),
);

router.patch(
  '/stalls/:id/reject',
  asyncHandler(async (req, res) => {
    const stall = await setStallStatus(req.params.id, 'rejected');
    res.json({ success: true, stall });
  }),
);

export default router;
