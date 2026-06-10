/**
 * likeCache.ts
 *
 * Tiny module-level store for like state, keyed by item ID.
 * Both ProductDetailModal and ProductDetailsScreen read/write here so they
 * always share the same truth for the current app session — no context,
 * no prop-drilling, no Firestore round-trip needed.
 */

interface LikeEntry {
  isLiked: boolean;
  likeCount: number;
}

const cache = new Map<string, LikeEntry>();

export function getLikeState(itemId: string): LikeEntry | undefined {
  return cache.get(itemId);
}

export function setLikeState(
  itemId: string,
  isLiked: boolean,
  likeCount: number,
): void {
  cache.set(itemId, { isLiked, likeCount });
}
