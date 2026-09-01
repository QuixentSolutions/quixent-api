import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../../auth/src/middleware/verifyToken';

// No per-product "admin" role exists on the shared User (auth/src/models/User.ts
// only has 'user' | 'admin' for its own dating-app purposes) — Thallu Vandi's
// stall-approval admins are a separate phone allowlist, same pattern as the
// shared auth module's REVIEW_PHONES.
const ADMIN_PHONES = (process.env.THALLUVANDI_ADMIN_PHONES ?? '').split(',').map((p) => p.trim()).filter(Boolean);

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }
  if (!ADMIN_PHONES.includes(req.user.mobile)) {
    return res.status(403).json({ success: false, message: 'Not authorized for this action' });
  }
  next();
}
