import { Router, Request, Response } from 'express';
import turfRoutes from './src/routes/turf.routes';
import bookingRoutes from './src/routes/booking.routes';
import ownerRoutes from './src/routes/owner.routes';
import adminRoutes from './src/routes/admin.routes';
import uploadRoutes from './src/routes/upload.routes';
import { deleteUserDataService } from './src/services/turf.service';

const router = Router();

router.use('/turfs', turfRoutes);
router.use('/bookings', bookingRoutes);
router.use('/owner', ownerRoutes);
router.use('/admin', adminRoutes);
router.use('/uploads', uploadRoutes);

// Internal route — called by the shared auth service on account deletion,
// same pattern as match-calculator-api / thallu-vandi-api.
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
  res.json({ success: true, status: 'ok', module: 'turf' });
});

router.get('/test', (_req: Request, res: Response) => {
  res.json({ success: true, message: 'Turf module is working' });
});

export default router;
