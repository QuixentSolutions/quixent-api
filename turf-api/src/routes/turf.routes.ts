import { Router } from 'express';
import { verifyToken } from '../../../auth/src/middleware/verifyToken';
import { validate, asyncHandler } from '../utils/validate';
import { listTurfsQuerySchema, availabilityQuerySchema } from '../schemas/turf.schema';
import { createReviewSchema } from '../schemas/review.schema';
import { listApprovedTurfs, getApprovedTurfById, listCities } from '../services/turf.service';
import { getDayAvailability } from '../services/availability.service';
import { listReviewsForTurf, upsertReview } from '../services/review.service';

const router = Router();

// --- Public browse ---

router.get(
  '/',
  validate(listTurfsQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = await listApprovedTurfs(req.query as any);
    res.json({ success: true, ...result });
  }),
);

router.get(
  '/cities',
  asyncHandler(async (_req, res) => {
    const cities = await listCities();
    res.json({ success: true, cities });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const turf = await getApprovedTurfById(req.params.id);
    res.json({ success: true, turf });
  }),
);

router.get(
  '/:id/availability',
  validate(availabilityQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const availability = await getDayAvailability(req.params.id, (req.query as any).date);
    res.json({ success: true, availability });
  }),
);

router.get(
  '/:id/reviews',
  asyncHandler(async (req, res) => {
    const reviews = await listReviewsForTurf(req.params.id);
    res.json({ success: true, reviews });
  }),
);

router.post(
  '/:id/reviews',
  verifyToken,
  validate(createReviewSchema),
  asyncHandler(async (req: any, res) => {
    const review = await upsertReview(req.params.id, req.user.userId, req.body.rating, req.body.text);
    res.status(201).json({ success: true, review });
  }),
);

export default router;
