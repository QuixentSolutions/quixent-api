import { Router } from 'express';
import { verifyToken } from '../middleware/verifyToken';
import { loadRole, requireRole } from '../middleware/roles';
import { validate, asyncHandler } from '../utils/validate';
import { rejectTurfSchema, roleSchema, configSchema } from '../schemas/admin.schema';
import { listPendingTurfs, setTurfStatus } from '../services/turf.service';
import { grantRole, revokeRole, listRoles, listAllBookings, listAllPayments, reportSummary } from '../services/admin.service';
import { getConfig, updateConfig } from '../services/config.service';

const router = Router();

router.use(verifyToken, loadRole, requireRole('super_admin'));

// ---- turf approval queue ----
router.get('/turfs/pending', asyncHandler(async (_req, res) => {
  res.json({ success: true, turfs: await listPendingTurfs() });
}));

router.patch('/turfs/:id/approve', asyncHandler(async (req, res) => {
  res.json({ success: true, turf: await setTurfStatus(req.params.id, 'approved') });
}));

router.patch('/turfs/:id/reject', validate(rejectTurfSchema), asyncHandler(async (req, res) => {
  res.json({ success: true, turf: await setTurfStatus(req.params.id, 'rejected', req.body.reason) });
}));

router.patch('/turfs/:id/block', asyncHandler(async (req, res) => {
  res.json({ success: true, turf: await setTurfStatus(req.params.id, 'blocked') });
}));

// ---- roles ----
router.get('/roles', asyncHandler(async (req, res) => {
  res.json({ success: true, roles: await listRoles(req.query.role as any) });
}));

router.post('/roles', validate(roleSchema), asyncHandler(async (req: any, res) => {
  res.status(201).json({ success: true, role: await grantRole(req.body.userId, req.body.role, req.user.userId) });
}));

router.delete('/roles', validate(roleSchema), asyncHandler(async (req, res) => {
  await revokeRole(req.body.userId, req.body.role);
  res.status(204).send();
}));

// ---- oversight ----
router.get('/bookings', asyncHandler(async (req: any, res) => {
  res.json({ success: true, ...(await listAllBookings({ ...req.query, page: Number(req.query.page) || 1 })) });
}));

router.get('/payments', asyncHandler(async (req: any, res) => {
  res.json({ success: true, ...(await listAllPayments({ status: req.query.status, page: Number(req.query.page) || 1 })) });
}));

router.get('/reports/summary', asyncHandler(async (req: any, res) => {
  res.json({ success: true, ...(await reportSummary(req.query.from, req.query.to)) });
}));

// ---- platform config ----
router.get('/config', asyncHandler(async (_req, res) => {
  res.json({ success: true, config: await getConfig(true) });
}));

router.put('/config', validate(configSchema), asyncHandler(async (req, res) => {
  res.json({ success: true, config: await updateConfig(req.body) });
}));

export default router;
