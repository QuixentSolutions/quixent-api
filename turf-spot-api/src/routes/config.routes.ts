import { Router } from 'express';
import { verifyToken } from '../middleware/verifyToken';
import { loadRole } from '../middleware/roles';
import { asyncHandler } from '../utils/validate';
import { getPublicPolicy } from '../services/config.service';
import TurfSpotRole from '../models/platform/Role';
import Turf from '../models/turf/Turf';

const router = Router();

// Public — cancellation/refund policy + fee constants for the app to display.
router.get('/policy', asyncHandler(async (_req, res) => {
  res.json({ success: true, policy: await getPublicPolicy() });
}));

// Which dashboard should the web app show after login?
router.get('/me/role', verifyToken, loadRole, (req: any, res) => {
  res.json({ success: true, role: req.turfRole ?? 'customer' });
});

/**
 * Everyone is a customer. This says whether the SAME account also holds
 * Turf Owner / platform access, plus how many turf submissions they have.
 * The customer app uses `isTurfAdmin` to show the "You are also a Turf Owner"
 * profile tag; `pendingCount` drives the "under review" state.
 */
router.get('/me/capabilities', verifyToken, loadRole, asyncHandler(async (req: any, res) => {
  const userId = req.user.userId;
  const [turfAdminRow, turfCount, pendingCount, approvedCount] = await Promise.all([
    TurfSpotRole.findOne({ userId, role: 'turf_admin', status: 'active' }).lean(),
    Turf.countDocuments({ ownerId: userId }),
    Turf.countDocuments({ ownerId: userId, status: 'pending' }),
    Turf.countDocuments({ ownerId: userId, status: 'approved' }),
  ]);

  res.json({
    success: true,
    capabilities: {
      isCustomer: true,
      isTurfAdmin: !!turfAdminRow || req.turfRole === 'super_admin',
      isSuperAdmin: req.turfRole === 'super_admin',
      turfCount,
      pendingCount,
      approvedCount,
    },
  });
}));

export default router;
