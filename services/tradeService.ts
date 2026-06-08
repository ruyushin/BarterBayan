import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
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

export interface TradeReview {
  reviewerId: string;
  targetUserId: string;
  rating: number;
  comment: string;
  createdAt: Timestamp;
}

export interface TradeOffer {
  id: string;
  offeredItemId: string;
  offeredItemTitle: string;
  offeredItemImage: string;
  requestedItemId: string;
  requestedItemTitle: string;
  requestedItemImage: string;
  offererId: string;
  offererName: string;
  offererAvatar: string;
  ownerId: string;
  status: TradeStatus;
  participants: string[];
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  completedAt?: Timestamp;
  // BUG FIX: must be stored in Firestore so dual-confirmation UX works
  completedBy?: string[];
  message?: string;
  // Reviews keyed by REVIEWER'S uid
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

// ─── Create ───────────────────────────────────────────────────────────────────

export const proposeTrade = async (
  offeredItem: {
    id: string;
    title: string;
    images?: string[];
    image?: string;
  },
  requestedItem: {
    id: string;
    title: string;
    images?: string[];
    image?: string;
    ownerId: string;
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

export const updateTradeStatus = async (
  offerId: string,
  newStatus: "accepted" | "declined",
): Promise<void> => {
  const docRef = doc(db, "trades", offerId);
  const snap = await getDoc(docRef);
  const data = snap.data();

  await updateDoc(docRef, {
    status: newStatus,
    updatedAt: Timestamp.now(),
  });

  // When accepted: hide both items from the public feed
  if (newStatus === "accepted" && data) {
    const ops: Promise<void>[] = [];
    if (data.offeredItemId)
      ops.push(
        updateDoc(doc(db, "items", data.offeredItemId), { isTraded: true }),
      );
    if (data.requestedItemId)
      ops.push(
        updateDoc(doc(db, "items", data.requestedItemId), { isTraded: true }),
      );
    await Promise.all(ops).catch((e) =>
      console.warn("Could not mark items as traded (non-fatal):", e),
    );
  }

  if (data) {
    await createNotification({
      userId: data.offererId,
      type:
        newStatus === "accepted" ? "trade_accepted" : ("trade_declined" as any),
      title: newStatus === "accepted" ? "Trade Accepted! 🎉" : "Trade Declined",
      body:
        newStatus === "accepted"
          ? `Your offer for "${data.requestedItemTitle}" was accepted!`
          : `Your offer for "${data.requestedItemTitle}" was declined.`,
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

/**
 * BUG FIX: dual-confirmation — each participant confirms separately.
 * Trade becomes "completed" only when BOTH have confirmed.
 * completedBy is now written to Firestore so the UI can read it live.
 */
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
  if (current.includes(completedByUserId)) return; // already confirmed, no-op

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
    await createNotification({
      userId: otherUserId,
      type: "generic",
      title: "Trade Completed! 🎉",
      body: `Your trade for "${data.requestedItemTitle}" is complete. Leave a review!`,
      tradeId,
      otherUserId: completedByUserId,
    });
  } else {
    // First to confirm — store, wait for the other party
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

/**
 * BUG FIX: explicitly typed as Promise<boolean>.
 * Reviews are keyed by REVIEWER'S uid.
 * Returns true when both parties have reviewed (triggers profile publish).
 */
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
        publishReviewToProfile(reviews[k].targetUserId, {
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
  review: {
    fromUserId: string;
    rating: number;
    comment: string;
    tradeId: string;
    createdAt: Timestamp;
  },
): Promise<void> {
  try {
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;
    const userData = userSnap.data();
    const existing: any[] = userData.userReviews ?? [];
    if (existing.some((r) => r.tradeId === review.tradeId)) return;
    const count = userData.reviewCount ?? 0;
    const oldRating = userData.rating ?? 0;
    const newCount = count + 1;
    const newRating = (oldRating * count + review.rating) / newCount;
    await updateDoc(userRef, {
      userReviews: [...existing, review],
      rating: Math.round(newRating * 10) / 10,
      reviewCount: newCount,
    });
  } catch (e) {
    console.warn("publishReviewToProfile failed (non-fatal):", e);
  }
}
