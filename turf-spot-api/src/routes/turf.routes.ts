import { Router } from 'express';
import { verifyToken } from '../middleware/verifyToken';
import { loadRole, requireRole, requireOwnTurf } from '../middleware/roles';
import { validate, asyncHandler } from '../utils/validate';
import { createTurfSchema, updateTurfSchema, pricingSchema, nearbyQuerySchema, availabilityQuerySchema, blockSchema } from '../schemas/turf.schema';
import { createReviewSchema } from '../schemas/review.schema';
import {
  findNearbyTurfs, getApprovedTurf, createTurf, listOwnerTurfs, listMyRegistrations, updateTurf, setPricing,
  addBlock, listBlocks, removeBlock,
} from '../services/turf.service';
import { getDayAvailability } from '../services/availability.service';
import { listReviewsForTurf, upsertReview, deleteReview } from '../services/review.service';

const router = Router();
const ownerGuards = [verifyToken, loadRole, requireRole('turf_admin', 'super_admin')];

// ---- literal paths first (before the /:id wildcard) ----

router.get('/nearby', validate(nearbyQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const { lat, lng, radiusKm, sport, city } = req.query as any;
  res.json({ success: true, turfs: await findNearbyTurfs({ lat, lng, radiusKm, sport, city }) });
}));

router.get('/mine/list', ...ownerGuards, asyncHandler(async (req: any, res) => {
  res.json({ success: true, turfs: await listOwnerTurfs(req.user.userId) });
}));

// "Register as Turf Owner" — any logged-in customer can submit a turf and
// track its status here, before any role is granted.
router.get('/my-registrations', verifyToken, asyncHandler(async (req: any, res) => {
  res.json({ success: true, registrations: await listMyRegistrations(req.user.userId) });
}));

// Submit a turf for listing. Starts `pending`; goes to the super_admin queue.
// turf_admin access is granted only on approval, not here.
router.post('/', verifyToken, validate(createTurfSchema), asyncHandler(async (req: any, res) => {
  res.status(201).json({ success: true, turf: await createTurf(req.user.userId, req.body) });
}));

// ---- owner turf management (/:id) ----

router.patch('/:id', ...ownerGuards, requireOwnTurf, validate(updateTurfSchema), asyncHandler(async (req: any, res) => {
  res.json({ success: true, turf: await updateTurf(req.turf, req.body) });
}));

router.patch('/:id/pricing', ...ownerGuards, requireOwnTurf, validate(pricingSchema), asyncHandler(async (req: any, res) => {
  res.json({ success: true, turf: await setPricing(req.turf, req.body.pricingRules, req.body.basePricePerHour) });
}));

router.get('/:id/blocks', ...ownerGuards, requireOwnTurf, asyncHandler(async (req, res) => {
  res.json({ success: true, blocks: await listBlocks(req.params.id) });
}));

router.post('/:id/blocks', ...ownerGuards, requireOwnTurf, validate(blockSchema), asyncHandler(async (req: any, res) => {
  res.status(201).json({ success: true, block: await addBlock(req.params.id, req.user.userId, req.body) });
}));

router.delete('/:id/blocks/:blockId', ...ownerGuards, requireOwnTurf, asyncHandler(async (req, res) => {
  await removeBlock(req.params.id, req.params.blockId);
  res.status(204).send();
}));

// ---- public turf detail + reviews (/:id) ----

router.get('/:id', asyncHandler(async (req, res) => {
  res.json({ success: true, turf: await getApprovedTurf(req.params.id) });
}));

router.get('/:id/availability', validate(availabilityQuerySchema, 'query'), asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await getDayAvailability(req.params.id, (req.query as any).date)) });
}));

// Public — anyone can read a turf's reviews (unchanged).
router.get('/:id/reviews', asyncHandler(async (req, res) => {
  res.json({ success: true, reviews: await listReviewsForTurf(req.params.id) });
}));

// Any authenticated user can rate/review an approved turf (no booking required).
// Re-submitting updates the caller's existing review.
router.post('/:id/reviews', verifyToken, validate(createReviewSchema), asyncHandler(async (req: any, res) => {
  const review = await upsertReview(req.params.id, req.user.userId, req.body.rating, req.body.text);
  res.status(201).json({ success: true, review });
}));

// Delete the caller's own review; turf rating is recomputed.
router.delete('/:id/reviews', verifyToken, asyncHandler(async (req: any, res) => {
  await deleteReview(req.params.id, req.user.userId);
  res.status(204).send();
}));

export default router;
