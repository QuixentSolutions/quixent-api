import { Router } from 'express';
import { verifyToken } from '../../../auth/src/middleware/verifyToken';
import { validate, asyncHandler } from '../utils/validate';
import { createStallSchema, updateStallSchema, nearbyQuerySchema } from '../schemas/stall.schema';
import { createReviewSchema } from '../schemas/review.schema';
import {
  findNearbyStalls,
  getApprovedStallById,
  createStall,
  updateVendorStall,
  deleteVendorStall,
  listVendorStalls,
} from '../services/stall.service';
import { listReviewsForStall, upsertReview } from '../services/review.service';
import { addFavorite, removeFavorite, listFavoriteStallIds, listFavoriteStalls } from '../services/favorite.service';
import { CATEGORIES } from '../config/categories';

const router = Router();

// --- Public / customer ---

// Registered before /:id so "categories" isn't captured as a stall id.
router.get('/categories', (_req, res) => {
  res.json({ success: true, categories: CATEGORIES });
});

router.get(
  '/nearby',
  validate(nearbyQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { lat, lng, radiusKm, category } = req.query as unknown as {
      lat: number;
      lng: number;
      radiusKm?: number;
      category?: string;
    };
    const stalls = await findNearbyStalls({ lat, lng, radiusKm, category });
    res.json({ success: true, stalls });
  }),
);

// Registered before /:id so "favorites" isn't captured as a stall id.
router.get(
  '/favorites',
  verifyToken,
  asyncHandler(async (req: any, res) => {
    const stalls = await listFavoriteStalls(req.user.userId);
    res.json({ success: true, stalls });
  }),
);

router.get(
  '/favorites/ids',
  verifyToken,
  asyncHandler(async (req: any, res) => {
    const stallIds = await listFavoriteStallIds(req.user.userId);
    res.json({ success: true, stallIds });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const stall = await getApprovedStallById(req.params.id);
    res.json({ success: true, stall });
  }),
);

router.get(
  '/:id/reviews',
  asyncHandler(async (req, res) => {
    const reviews = await listReviewsForStall(req.params.id);
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

router.post(
  '/:id/favorite',
  verifyToken,
  asyncHandler(async (req: any, res) => {
    await addFavorite(req.params.id, req.user.userId);
    res.status(201).json({ success: true });
  }),
);

router.delete(
  '/:id/favorite',
  verifyToken,
  asyncHandler(async (req: any, res) => {
    await removeFavorite(req.params.id, req.user.userId);
    res.status(204).send();
  }),
);

// --- Vendor (self-registration + management) ---
// Anyone with a shared account can become a vendor by registering a stall —
// "vendor" isn't a role on the shared User, it's just stall ownership.

router.get(
  '/mine/list',
  verifyToken,
  asyncHandler(async (req: any, res) => {
    const stalls = await listVendorStalls(req.user.userId);
    res.json({ success: true, stalls });
  }),
);

router.post(
  '/',
  verifyToken,
  validate(createStallSchema),
  asyncHandler(async (req: any, res) => {
    const stall = await createStall(req.user.userId, req.body);
    res.status(201).json({ success: true, stall });
  }),
);

router.patch(
  '/:id',
  verifyToken,
  validate(updateStallSchema),
  asyncHandler(async (req: any, res) => {
    const stall = await updateVendorStall(req.params.id, req.user.userId, req.body);
    res.json({ success: true, stall });
  }),
);

router.delete(
  '/:id',
  verifyToken,
  asyncHandler(async (req: any, res) => {
    await deleteVendorStall(req.params.id, req.user.userId);
    res.status(204).send();
  }),
);

export default router;
