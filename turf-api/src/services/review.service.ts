import { Types } from 'mongoose';
import Review from '../models/Review';
import Turf from '../models/Turf';
import Booking from '../models/Booking';
import User from '../../../auth/src/models/User';

export async function recomputeTurfRating(turfId: string) {
  const stats = await Review.aggregate([
    { $match: { turfId: new Types.ObjectId(turfId) } },
    { $group: { _id: '$turfId', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);

  const avg = stats[0]?.avg ?? 0;
  const count = stats[0]?.count ?? 0;
  await Turf.findByIdAndUpdate(turfId, {
    ratingAvg: Math.round(avg * 10) / 10,
    ratingCount: count,
  });
}

// Reviews only store the shared auth userId (Turf's own DB can't populate
// across connections) — look display names up from the shared User
// collection directly. Same monorepo, so a plain relative import works.
export async function listReviewsForTurf(turfId: string) {
  const reviews = await Review.find({ turfId }).sort({ createdAt: -1 }).lean();
  const userIds = [...new Set(reviews.map((r) => r.userId))];
  const users = await User.find({ _id: { $in: userIds } }).select('name profileImage').lean();
  const byId = new Map(users.map((u) => [u._id.toString(), u]));

  return reviews.map((r) => ({
    ...r,
    userName: byId.get(r.userId)?.name || undefined,
    userImage: byId.get(r.userId)?.profileImage || undefined,
  }));
}

export async function upsertReview(turfId: string, userId: string, rating: number, text?: string) {
  const turf = await Turf.findOne({ _id: turfId, status: 'approved' });
  if (!turf) throw { status: 404, message: 'Turf not found', error: 'TURF_NOT_FOUND' };

  // Gate: only players who actually finished a booking here can review.
  const eligibleBooking = await Booking.findOne({
    turfId,
    userId,
    status: { $in: ['completed', 'confirmed'] },
  })
    .sort({ date: -1 })
    .select('_id')
    .lean();

  if (!eligibleBooking) {
    throw {
      status: 403,
      message: 'You can review a turf only after you have a booking there',
      error: 'REVIEW_NOT_ALLOWED',
    };
  }

  const review = await Review.findOneAndUpdate(
    { turfId, userId },
    { $set: { rating, text, bookingId: eligibleBooking._id } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await recomputeTurfRating(turfId);
  return review;
}
