import Favorite from '../models/Favorite';
import Stall from '../models/Stall';

export async function addFavorite(stallId: string, userId: string) {
  const stall = await Stall.findOne({ _id: stallId, status: 'approved' });
  if (!stall) throw { status: 404, message: 'Stall not found', error: 'STALL_NOT_FOUND' };

  // Upsert instead of create — favoriting an already-favorited stall is a
  // no-op, not a duplicate-key error.
  await Favorite.findOneAndUpdate(
    { stallId, userId },
    { $setOnInsert: { stallId, userId } },
    { upsert: true },
  );
}

export async function removeFavorite(stallId: string, userId: string) {
  await Favorite.deleteOne({ stallId, userId });
}

export async function listFavoriteStallIds(userId: string): Promise<string[]> {
  const favorites = await Favorite.find({ userId }).select('stallId').lean();
  return favorites.map((f) => f.stallId.toString());
}

export async function listFavoriteStalls(userId: string) {
  const favorites = await Favorite.find({ userId }).sort({ createdAt: -1 }).lean();
  const stallIds = favorites.map((f) => f.stallId);
  const stalls = await Stall.find({ _id: { $in: stallIds }, status: 'approved' });

  // Preserve favorited-most-recently-first order — the $in query above doesn't.
  const byId = new Map(stalls.map((s) => [s._id.toString(), s]));
  return stallIds.map((id) => byId.get(id.toString())).filter((s): s is NonNullable<typeof s> => !!s);
}

// Called by the shared auth service on account deletion — same pattern as
// stall.service.ts's deleteUserDataService.
export async function deleteUserFavorites(userId: string) {
  await Favorite.deleteMany({ userId });
}
