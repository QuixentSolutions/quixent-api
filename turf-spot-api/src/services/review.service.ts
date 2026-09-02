import Review from '../models/review/Review';
import Turf from '../models/turf/Turf';
import User from '../../../auth/src/models/User';
import { recomputeTurfRating } from './turf.service';

export async function listReviewsForTurf(turfId: string) {
  const reviews = await Review.find({ turfId }).sort({ createdAt: -1 }).lean();
  const userIds = [...new Set(reviews.map((r) => r.customerId))];
  const users = await User.find({ _id: { $in: userIds } }).select('name').lean();
  const nameById = new Map(users.map((u: any) => [u._id.toString(), u.name]));
  return reviews.map((r) => ({
    _id: r._id,
    rating: r.rating,
    text: r.text,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    userName: nameById.get(r.customerId) || 'TurfSpot user',
  }));
}

/**
 * Any authenticated user can rate/review any approved turf.
 * Policy for repeats: one review per user per turf — a second submission
 * edits the existing one (enforced by the unique {turfId, customerId} index).
 * The turf's ratingAvg / ratingCount are recomputed on every write.
 */
export async function upsertReview(turfId: string, customerId: string, rating: number, text?: string) {
  const turf = await Turf.findOne({ _id: turfId, status: 'approved' });
  if (!turf) throw { status: 404, message: 'Turf not found', error: 'TURF_NOT_FOUND' };

  const review = await Review.findOneAndUpdate(
    { turfId, customerId },
    { $set: { rating, text: text ?? '' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await recomputeTurfRating(turfId);
  return review;
}

/** Remove the caller's own review for a turf; recompute the aggregate afterwards. */
export async function deleteReview(turfId: string, customerId: string) {
  const result = await Review.deleteOne({ turfId, customerId });
  if (result.deletedCount === 0) {
    throw { status: 404, message: 'You have no review on this turf', error: 'REVIEW_NOT_FOUND' };
  }
  await recomputeTurfRating(turfId);
}
