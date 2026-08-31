import { Types } from 'mongoose';
import Review from '../models/Review';
import Stall from '../models/Stall';
import User from '../../../auth/src/models/User';

async function recomputeStallRating(stallId: string) {
  const stats = await Review.aggregate([
    { $match: { stallId: new Types.ObjectId(stallId) } },
    { $group: { _id: '$stallId', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);

  const avg = stats[0]?.avg ?? 0;
  const count = stats[0]?.count ?? 0;
  await Stall.findByIdAndUpdate(stallId, {
    ratingAvg: Math.round(avg * 10) / 10,
    ratingCount: count,
  });
}

// Reviews only store the shared auth userId (Thallu Vandi's own DB can't
// populate across connections) — look display names up from the shared
// User collection directly, same monorepo so a plain relative import works.
export async function listReviewsForStall(stallId: string) {
  const reviews = await Review.find({ stallId }).sort({ createdAt: -1 }).lean();
  const userIds = [...new Set(reviews.map((r) => r.userId))];
  const users = await User.find({ _id: { $in: userIds } }).select('name').lean();
  const nameById = new Map(users.map((u) => [u._id.toString(), u.name]));

  return reviews.map((r) => ({ ...r, userName: nameById.get(r.userId) || undefined }));
}

export async function upsertReview(stallId: string, userId: string, rating: number, text?: string) {
  const stall = await Stall.findOne({ _id: stallId, status: 'approved' });
  if (!stall) throw { status: 404, message: 'Stall not found', error: 'STALL_NOT_FOUND' };

  const review = await Review.findOneAndUpdate(
    { stallId, userId },
    { $set: { rating, text } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await recomputeStallRating(stallId);
  return review;
}
