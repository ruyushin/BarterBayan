import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { createNotification } from "./notificationService";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TradeStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "completed";

export type TradeSortOrder = "newest" | "oldest";

export interface TradeReview {
  reviewerId: string;
  targetUserId: string;
  rating: number;
  comment: string;
  createdAt: Timestamp;
}

export interface TradeOffer {
  id: string;
  // Primary offered item (backward-compat single-item field)
  offeredItemId: string;
  offeredItemTitle: string;
  offeredItemImage: string;
  // PATCH: optional extra items for bundle / multi-select offers
  offeredItemIds?: string[];
  offeredItemTitles?: string[];
  offeredItemImages?: string[];
  requestedItemId: string;
  requestedItemTitle: string;
  requestedItemImage: string;
  offererId: string;
  offererName: string;
  offererAvatar: string;
  ownerId: string;
  status: TradeStatus;
  // PATCH: stored when owner declines so offerer sees the reason
  declineReason?: string;
  participants: string[];
  // PATCH: categories persisted for filter UI
  offeredItemCategory?: string;
  requestedItemCategory?: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  completedAt?: Timestamp;
  completedBy?: string[];
  message?: string;
  reviews?: Record<string, TradeReview>;
}

export interface TradeMessage {
  id: string;
  tradeId: string;
  senderId: string;
  senderName: string | null;
  senderAvatar: string | null;
  text: string;
  createdAt: Timestamp;
}

// ─── Client-side filter helpers ───────────────────────────────────────────────

/**
 * PATCH: filterAndSortOffers
 * Pure utility used by screens for "Your Trades" / "Your Offers" filtering.
 * Pass the full list from a listener and this returns the filtered + sorted view.
 */
export function filterAndSortOffers(
  offers: TradeOffer[],
  opts: {
    category?: string | null; // null / undefined = all categories
    sortOrder?: TradeSortOrder; // default "newest"
    statusFilter?: TradeStatus | "all"; // default "all"
  } = {},
): TradeOffer[] {
  const { category, sortOrder = "newest", statusFilter = "all" } = opts;

  let result = [...offers];

  if (statusFilter !== "all") {
    result = result.filter((o) => o.status === statusFilter);
  }

  if (category) {
    result = result.filter(
      (o) =>
        o.offeredItemCategory === category ||
        o.requestedItemCategory === category,
    );
  }

  result.sort((a, b) => {
    const aMs = a.createdAt?.toMillis?.() ?? 0;
    const bMs = b.createdAt?.toMillis?.() ?? 0;
    return sortOrder === "newest" ? bMs - aMs : aMs - bMs;
  });

  return result;
}

/**
 * PATCH: deriveCategories
 * Extracts the unique category strings from a list of offers for building
 * filter chip lists in the UI.
 */
export function deriveCategories(offers: TradeOffer[]): string[] {
  const set = new Set<string>();
  for (const o of offers) {
    if (o.offeredItemCategory) set.add(o.offeredItemCategory);
    if (o.requestedItemCategory) set.add(o.requestedItemCategory);
  }
  return Array.from(set).sort();
}

// ─── Create ───────────────────────────────────────────────────────────────────

export const proposeTrade = async (
  offeredItem: {
    id: string;
    title: string;
    images?: string[];
    image?: string;
    category?: string;
  },
  requestedItem: {
    id: string;
    title: string;
    images?: string[];
    image?: string;
    ownerId: string;
    category?: string;
  },
  offererUser: {
    uid: string;
    displayName: string | null;
    photoURL: string | null;
  },
  message?: string,
): Promise<string> => {
  if (offererUser.uid === requestedItem.ownerId) {
    throw new Error("You cannot propose a trade for your own item.");
  }

  const existingQ = query(
    collection(db, "trades"),
    where("offererId", "==", offererUser.uid),
    where("requestedItemId", "==", requestedItem.id),
    where("status", "==", "pending"),
  );
  const existingSnap = await getDocs(existingQ);
  if (!existingSnap.empty) {
    throw new Error(
      "You already have a pending offer on this item. Please wait for the owner to respond.",
    );
  }

  const payload: Omit<TradeOffer, "id"> = {
    offeredItemId: offeredItem.id,
    offeredItemTitle: offeredItem.title,
    offeredItemImage: resolveImage(offeredItem),
    requestedItemId: requestedItem.id,
    requestedItemTitle: requestedItem.title,
    requestedItemImage: resolveImage(requestedItem),
    offererId: offererUser.uid,
    offererName: offererUser.displayName ?? "Unknown User",
    offererAvatar: offererUser.photoURL ?? "",
    ownerId: requestedItem.ownerId,
    status: "pending",
    participants: [offererUser.uid, requestedItem.ownerId],
    createdAt: Timestamp.now(),
    completedBy: [],
    // PATCH: persist categories so filter UI can use them without extra reads
    ...(offeredItem.category
      ? { offeredItemCategory: offeredItem.category }
      : {}),
    ...(requestedItem.category
      ? { requestedItemCategory: requestedItem.category }
      : {}),
    ...(message?.trim() ? { message: message.trim() } : {}),
  };

  const docRef = await addDoc(collection(db, "trades"), payload);

  await createNotification({
    userId: requestedItem.ownerId,
    type: "trade_offer",
    title: offererUser.displayName ?? "Someone",
    body: `wants to trade their "${offeredItem.title}" for your "${requestedItem.title}"`,
    avatar: offererUser.photoURL ?? undefined,
    tradeId: docRef.id,
    otherUserId: offererUser.uid,
  });

  return docRef.id;
};

// ─── One-time reads ───────────────────────────────────────────────────────────

export const getOffersByUser = async (
  userId: string,
): Promise<TradeOffer[]> => {
  try {
    const q = query(
      collection(db, "trades"),
      where("offererId", "==", userId),
      orderBy("createdAt", "desc"),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<TradeOffer, "id">),
    }));
  } catch {
    const q2 = query(
      collection(db, "trades"),
      where("offererId", "==", userId),
    );
    const snap2 = await getDocs(q2);
    return snap2.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<TradeOffer, "id">) }))
      .sort(
        (a, b) =>
          (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
      );
  }
};

export const getOffersForItem = async (
  itemId: string,
): Promise<TradeOffer[]> => {
  try {
    const q = query(
      collection(db, "trades"),
      where("requestedItemId", "==", itemId),
      orderBy("createdAt", "desc"),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<TradeOffer, "id">),
    }));
  } catch {
    const q2 = query(
      collection(db, "trades"),
      where("requestedItemId", "==", itemId),
    );
    const snap2 = await getDocs(q2);
    return snap2.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<TradeOffer, "id">) }))
      .sort(
        (a, b) =>
          (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
      );
  }
};

export const getAllOffersForUser = async (
  userId: string,
): Promise<TradeOffer[]> => {
  try {
    const q = query(
      collection(db, "trades"),
      where("participants", "array-contains", userId),
      orderBy("createdAt", "desc"),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<TradeOffer, "id">),
    }));
  } catch {
    const q2 = query(
      collection(db, "trades"),
      where("participants", "array-contains", userId),
    );
    const snap2 = await getDocs(q2);
    return snap2.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<TradeOffer, "id">) }))
      .sort(
        (a, b) =>
          (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
      );
  }
};

export const getTradeOffer = async (
  offerId: string,
): Promise<TradeOffer | null> => {
  const snap = await getDoc(doc(db, "trades", offerId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<TradeOffer, "id">) };
};

// ─── Real-time listeners ──────────────────────────────────────────────────────

export const subscribeToSentOffers = (
  userId: string,
  callback: (offers: TradeOffer[]) => void,
): (() => void) => {
  const q = query(collection(db, "trades"), where("offererId", "==", userId));
  return onSnapshot(
    q,
    (snap) => {
      callback(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<TradeOffer, "id">) }))
          .sort(
            (a, b) =>
              (b.createdAt?.toMillis?.() ?? 0) -
              (a.createdAt?.toMillis?.() ?? 0),
          ),
      );
    },
    (error) => {
      console.error("subscribeToSentOffers error:", error);
      callback([]);
    },
  );
};

export const subscribeToOffersForItem = (
  itemId: string,
  callback: (offers: TradeOffer[]) => void,
): (() => void) => {
  const q = query(
    collection(db, "trades"),
    where("requestedItemId", "==", itemId),
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<TradeOffer, "id">) }))
          .sort(
            (a, b) =>
              (b.createdAt?.toMillis?.() ?? 0) -
              (a.createdAt?.toMillis?.() ?? 0),
          ),
      );
    },
    (error) => {
      console.error("subscribeToOffersForItem error:", error);
      callback([]);
    },
  );
};

/** Live single-doc listener — used by TradeChatModal and the status modal */
export const subscribeToTrade = (
  tradeId: string,
  callback: (trade: TradeOffer | null) => void,
): (() => void) => {
  return onSnapshot(
    doc(db, "trades", tradeId),
    (snap) => {
      callback(
        snap.exists()
          ? { id: snap.id, ...(snap.data() as Omit<TradeOffer, "id">) }
          : null,
      );
    },
    (error) => {
      console.error("subscribeToTrade error:", error);
    },
  );
};

// ─── Trade chat ───────────────────────────────────────────────────────────────

export const sendTradeMessage = async (
  tradeId: string,
  sender: {
    uid: string;
    displayName: string | null;
    photoURL: string | null;
  },
  text: string,
  recipientUserId: string,
): Promise<void> => {
  if (!text.trim()) return;

  await addDoc(collection(db, "trades", tradeId, "messages"), {
    tradeId,
    senderId: sender.uid,
    senderName: sender.displayName ?? "Anonymous",
    senderAvatar: sender.photoURL ?? "",
    text: text.trim(),
    createdAt: Timestamp.now(),
  });

  await createNotification({
    userId: recipientUserId,
    type: "message",
    title: sender.displayName ?? "Someone",
    body:
      text.trim().length > 60
        ? text.trim().substring(0, 60) + "…"
        : text.trim(),
    avatar: sender.photoURL ?? undefined,
    tradeId,
    otherUserId: sender.uid,
  });
};

export const subscribeToTradeMessages = (
  tradeId: string,
  callback: (messages: TradeMessage[]) => void,
): (() => void) => {
  const q = query(
    collection(db, "trades", tradeId, "messages"),
    orderBy("createdAt", "asc"),
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<TradeMessage, "id">),
        })),
      );
    },
    (error) => {
      console.error("subscribeToTradeMessages error:", error);
      callback([]);
    },
  );
};

// ─── Update ───────────────────────────────────────────────────────────────────

/**
 * PATCH: cancelPendingOffersForItems
 * Cancels every pending trade that involves any of the supplied item IDs,
 * skipping `excludeOfferId` (the accepted trade itself).
 * Exported so itemService.deleteItem can call it to clean up on deletion.
 */
export const cancelPendingOffersForItems = async (
  itemIds: string[],
  excludeOfferId = "",
): Promise<void> => {
  const now = Timestamp.now();
  const validIds = itemIds.filter(Boolean);
  if (validIds.length === 0) return;

  const cancelSnap = async (
    snap: Awaited<ReturnType<typeof getDocs>>,
  ): Promise<void> => {
    await Promise.all(
      snap.docs
        .filter((d) => d.id !== excludeOfferId)
        .map((d) => updateDoc(d.ref, { status: "cancelled", updatedAt: now })),
    );
  };

  for (const itemId of validIds) {
    const [snapReq, snapOff] = await Promise.all([
      getDocs(
        query(
          collection(db, "trades"),
          where("requestedItemId", "==", itemId),
          where("status", "==", "pending"),
        ),
      ),
      getDocs(
        query(
          collection(db, "trades"),
          where("offeredItemId", "==", itemId),
          where("status", "==", "pending"),
        ),
      ),
    ]);
    await Promise.all([cancelSnap(snapReq), cancelSnap(snapOff)]);
  }
};

/**
 * PATCH: updateTradeStatus
 * - Accepts optional `declineReason` written to the trade doc so the offerer
 *   can see exactly why their offer was declined.
 * - On "accepted": marks both items as traded (hides them from home/explore)
 *   then auto-cancels every other pending offer involving either item.
 */
export const updateTradeStatus = async (
  offerId: string,
  newStatus: "accepted" | "declined",
  declineReason?: string,
): Promise<void> => {
  const docRef = doc(db, "trades", offerId);
  const snap = await getDoc(docRef);
  const data = snap.data();

  const updatePayload: Record<string, unknown> = {
    status: newStatus,
    updatedAt: Timestamp.now(),
  };

  // PATCH: persist the decline reason
  if (newStatus === "declined" && declineReason?.trim()) {
    updatePayload.declineReason = declineReason.trim();
  }

  await updateDoc(docRef, updatePayload);

  if (newStatus === "accepted" && data) {
    // Mark both items as traded → filtered out on home/explore screens
    const itemOps: Promise<void>[] = [];
    if (data.offeredItemId) {
      itemOps.push(
        updateDoc(doc(db, "items", data.offeredItemId), { isTraded: true }),
      );
    }
    if (data.requestedItemId) {
      itemOps.push(
        updateDoc(doc(db, "items", data.requestedItemId), { isTraded: true }),
      );
    }
    await Promise.all(itemOps).catch((e) =>
      console.warn("Could not mark items as traded (non-fatal):", e),
    );

    // PATCH: auto-cancel every other pending offer for both items
    await cancelPendingOffersForItems(
      [data.offeredItemId, data.requestedItemId],
      offerId,
    ).catch((e) =>
      console.warn("Could not auto-cancel sibling offers (non-fatal):", e),
    );
  }

  if (data) {
    const reasonNote =
      newStatus === "declined" && declineReason?.trim()
        ? ` Reason: "${declineReason.trim()}"`
        : "";

    await createNotification({
      userId: data.offererId,
      type:
        newStatus === "accepted" ? "trade_accepted" : ("trade_declined" as any),
      title: newStatus === "accepted" ? "Trade Accepted! 🎉" : "Trade Declined",
      body:
        newStatus === "accepted"
          ? `Your offer for "${data.requestedItemTitle}" was accepted!`
          : `Your offer for "${data.requestedItemTitle}" was declined.${reasonNote}`,
      avatar: data.ownerAvatar ?? undefined,
      tradeId: offerId,
      otherUserId: data.ownerId,
    });
  }
};

export const cancelTradeOffer = async (offerId: string): Promise<void> => {
  const docRef = doc(db, "trades", offerId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error("Trade offer not found.");
  if (snap.data()?.status !== "pending")
    throw new Error("Only pending offers can be cancelled.");
  await updateDoc(docRef, {
    status: "cancelled",
    updatedAt: Timestamp.now(),
  });
};

export const completeTrade = async (
  tradeId: string,
  completedByUserId: string,
): Promise<void> => {
  const docRef = doc(db, "trades", tradeId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error("Trade not found.");
  const data = snap.data()!;

  if (data.status !== "accepted") {
    throw new Error("Only accepted trades can be marked as finished.");
  }

  const current: string[] = data.completedBy ?? [];
  if (current.includes(completedByUserId)) return;

  const updated = [...current, completedByUserId];
  const otherUserId =
    completedByUserId === data.offererId ? data.ownerId : data.offererId;
  const bothConfirmed =
    updated.includes(data.offererId) && updated.includes(data.ownerId);

  if (bothConfirmed) {
    await updateDoc(docRef, {
      status: "completed",
      completedBy: updated,
      completedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    await Promise.all([
      updateDoc(doc(db, "users", data.offererId), {
        tradesCount: increment(1),
        exchangedCount: increment(1),
      }),
      updateDoc(doc(db, "users", data.ownerId), {
        tradesCount: increment(1),
        exchangedCount: increment(1),
      }),
    ]).catch((e) =>
      console.warn("Could not update tradesCount (non-fatal):", e),
    );

    await createNotification({
      userId: otherUserId,
      type: "generic",
      title: "Trade Completed! 🎉",
      body: `Your trade for "${data.requestedItemTitle}" is complete. Leave a review!`,
      tradeId,
      otherUserId: completedByUserId,
    });
  } else {
    await updateDoc(docRef, {
      completedBy: updated,
      updatedAt: Timestamp.now(),
    });
    await createNotification({
      userId: otherUserId,
      type: "generic",
      title: "Trade Completion Requested",
      body: `Your trade partner confirmed the exchange for "${data.requestedItemTitle}". Tap to confirm and complete!`,
      tradeId,
      otherUserId: completedByUserId,
    });
  }
};

export const submitTradeReview = async (
  tradeId: string,
  reviewerId: string,
  targetUserId: string,
  rating: number,
  comment: string,
): Promise<boolean> => {
  const docRef = doc(db, "trades", tradeId);

  await updateDoc(docRef, {
    [`reviews.${reviewerId}`]: {
      reviewerId,
      targetUserId,
      rating,
      comment,
      createdAt: Timestamp.now(),
    } as TradeReview,
  });

  const updatedSnap = await getDoc(docRef);
  const data = updatedSnap.data();
  const reviews: Record<string, TradeReview> = data?.reviews ?? {};
  const keys = Object.keys(reviews);

  if (keys.length >= 2) {
    await Promise.all(
      keys.map((k) =>
        publishReviewToProfile(reviews[k].targetUserId, reviews[k].reviewerId, {
          fromUserId: reviews[k].reviewerId,
          rating: reviews[k].rating,
          comment: reviews[k].comment,
          tradeId,
          createdAt: reviews[k].createdAt,
        }),
      ),
    );
    return true;
  }
  return false;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveImage(item: { images?: string[]; image?: string }): string {
  if (Array.isArray(item.images) && item.images.length > 0)
    return item.images[0];
  return item.image ?? "";
}

async function publishReviewToProfile(
  userId: string,
  reviewerUserId: string,
  review: {
    fromUserId: string;
    rating: number;
    comment: string;
    tradeId: string;
    createdAt: Timestamp;
  },
): Promise<void> {
  const userRef = doc(db, "users", userId);
  const [userSnap, reviewerSnap] = await Promise.all([
    getDoc(userRef),
    getDoc(doc(db, "users", reviewerUserId)),
  ]);

  if (!userSnap.exists()) {
    console.warn(`publishReviewToProfile: user ${userId} not found`);
    return;
  }

  const userData = userSnap.data();
  const reviewerData = reviewerSnap.exists() ? reviewerSnap.data() : null;

  const reviewerName: string =
    reviewerData?.username ?? reviewerData?.displayName ?? "Anonymous Trader";
  const reviewerAvatar: string | null =
    reviewerData?.avatarUrl ?? reviewerData?.photoURL ?? null;

  const existing: any[] = userData.userReviews ?? [];
  if (existing.some((r: any) => r.tradeId === review.tradeId)) {
    console.log(
      `publishReviewToProfile: review for trade ${review.tradeId} already published to ${userId}`,
    );
    return;
  }

  const count: number = userData.ratingCount ?? 0;
  const oldRating: number =
    typeof userData.rating === "number"
      ? userData.rating
      : parseFloat(userData.rating) || 0;
  const newCount = count + 1;
  const newRating = (oldRating * count + review.rating) / newCount;
  const roundedRating = Math.round(newRating * 10) / 10;

  await updateDoc(userRef, {
    userReviews: [...existing, review],
    rating: roundedRating,
    ratingCount: newCount,
  });

  await addDoc(collection(db, "users", userId, "reviews"), {
    reviewerName,
    reviewerAvatar: reviewerAvatar ?? "",
    rating: review.rating,
    comment: review.comment,
    tradeId: review.tradeId,
    createdAt: review.createdAt,
  });

  console.log(
    `✅ Review published: ${reviewerName} → ${userId} (${review.rating}★)`,
  );
}
