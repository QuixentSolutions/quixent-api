import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../../auth/src/middleware/verifyToken';

// The shared User (auth/src/models/User.ts) only has 'user' | 'admin' for its
// own purposes — TurfSpot's listing-approval superadmins are a separate phone
// allowlist, same pattern thallu-vandi-api uses for THALLUVANDI_ADMIN_PHONES.
const ADMIN_PHONES = (process.env.TURFSPOT_SUPERADMIN_PHONES ?? '')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }
  if (!ADMIN_PHONES.includes(req.user.mobile)) {
    return res.status(403).json({ success: false, message: 'Not authorized for this action' });
  }
  next();
}

export function isAdminPhone(mobile?: string): boolean {
  return !!mobile && ADMIN_PHONES.includes(mobile);
}
