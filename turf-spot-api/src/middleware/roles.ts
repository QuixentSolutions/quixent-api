import { Response, NextFunction } from 'express';
import { AuthRequest } from './verifyToken';
import TurfSpotRole, { TurfRole } from '../models/platform/Role';
import Turf from '../models/turf/Turf';

export type EffectiveRole = 'customer' | TurfRole;

const SUPERADMIN_PHONES = (process.env.TURFSPOT_SUPERADMIN_PHONES ?? '')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);

export interface RoledRequest extends AuthRequest {
  turfRole?: EffectiveRole;
}

/** Resolves the caller's TurfSpot role (env bootstrap wins, then the roles collection). */
export async function loadRole(req: RoledRequest, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      req.turfRole = 'customer';
      return next();
    }
    if (SUPERADMIN_PHONES.includes(req.user.mobile)) {
      req.turfRole = 'super_admin';
      return next();
    }
    const row = await TurfSpotRole.findOne({ userId: req.user.userId, status: 'active' }).sort({
      // super_admin outranks turf_admin if somehow both exist
      role: 1,
    });
    req.turfRole = (row?.role as EffectiveRole) ?? 'customer';
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...allowed: TurfRole[]) {
  return (req: RoledRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated', error: 'TOKEN_MISSING' });
      return;
    }
    if (!req.turfRole || !allowed.includes(req.turfRole as TurfRole)) {
      res.status(403).json({ success: false, message: 'Not authorized for this action', error: 'FORBIDDEN' });
      return;
    }
    next();
  };
}

/**
 * For turf_admin: asserts the turf in :id (or :turfId) belongs to the caller.
 * super_admin bypasses. Stashes the loaded turf on req.turf.
 */
export async function requireOwnTurf(req: RoledRequest & { turf?: any }, res: Response, next: NextFunction): Promise<void> {
  try {
    const turfId = req.params.id ?? req.params.turfId;
    const turf = await Turf.findById(turfId);
    if (!turf) {
      res.status(404).json({ success: false, message: 'Turf not found', error: 'TURF_NOT_FOUND' });
      return;
    }
    if (req.turfRole !== 'super_admin' && turf.ownerId !== req.user!.userId) {
      res.status(403).json({ success: false, message: 'This turf is not yours', error: 'FORBIDDEN' });
      return;
    }
    req.turf = turf;
    next();
  } catch (err) {
    next(err);
  }
}
