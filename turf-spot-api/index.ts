import { Router, Request, Response } from 'express';
import turfRoutes from './src/routes/turf.routes';
import bookingRoutes from './src/routes/booking.routes';
import paymentRoutes from './src/routes/payment.routes';
import ownerRoutes from './src/routes/owner.routes';
import adminRoutes from './src/routes/admin.routes';
import uploadRoutes from './src/routes/upload.routes';
import configRoutes from './src/routes/config.routes';
import { deleteUserDataService } from './src/services/turf.service';
import { getConfig } from './src/services/config.service';
import { startSweepers } from './src/jobs/sweepers';

const router = Router();

router.use('/turfs', turfRoutes);
router.use('/bookings', bookingRoutes);
router.use('/payments', paymentRoutes);
router.use('/owner', ownerRoutes);
router.use('/admin', adminRoutes);
router.use('/uploads', uploadRoutes);
router.use('/', configRoutes); // /policy, /me/role

// Internal — called by the shared auth service on account deletion.
// Same pattern as match-calculator-api / thallu-vandi-api's /user-data.
router.delete('/user-data', async (req: Request, res: Response) => {
  const secret = req.headers['x-internal-secret'];
  if (secret !== (process.env.INTERNAL_SECRET ?? '')) {
    res.status(403).json({ success: false, message: 'Forbidden' });
    return;
  }
  const { userId } = req.body;
  if (!userId) {
    res.status(400).json({ success: false, message: 'userId required' });
    return;
  }
  try {
    await deleteUserDataService(userId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/health', (_req: Request, res: Response) => {
  res.json({ success: true, status: 'ok', module: 'turf-spot' });
});

router.get('/test', (_req: Request, res: Response) => {
  res.json({ success: true, message: 'TurfSpot module is working' });
});

// Seed PlatformConfig + start background sweepers when the module loads
// (index.ts already ensures the DB connection is live before importing this).
getConfig().catch((e) => console.error('[turf-spot] config seed failed', e));
startSweepers();

export default router;
