import { Router, Request, Response } from 'express';
import stallRoutes from './src/routes/stall.routes';
import adminRoutes from './src/routes/admin.routes';
import uploadRoutes from './src/routes/upload.routes';

const router = Router();

router.use('/stalls', stallRoutes);
router.use('/admin', adminRoutes);
router.use('/uploads', uploadRoutes);

router.get('/health', (_req: Request, res: Response) => {
  res.json({ success: true, status: 'ok', module: 'thallu-vandi' });
});

router.get('/test', (_req: Request, res: Response) => {
  res.json({ success: true, message: 'Thallu Vandi module is working' });
});

export default router;
