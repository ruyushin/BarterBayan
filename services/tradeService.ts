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

// ─── Types ────────────────────────────────────────────────────────────────────

export type TradeStatus = "pending" | "accepted" | "declined" | "cancelled";

export interface TradeOffer {
  id: string;
  // The item being offered BY the proposer
  offeredItemId: string;
  offeredItemTitle: string;
  offeredItemImage: string;
  // The item the proposer WANTS (belongs to ownerId)
  requestedItemId: string;
  requestedItemTitle: string;
  requestedItemImage: string;
  // People involved
  offererId: string;
  offererName: string;
  offererAvatar: string;
  ownerId: string; // owner of the requested item
  // State
  status: TradeStatus;
  participants: string[]; // [offererId, ownerId] — used for array-contains queries
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  // Optional message from proposer
  message?: string;
}

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Propose a trade: offer one of YOUR items in exchange for someone else's item.
 *
 * @param offeredItem   - Your item object (must have id, title, images/image, ownerId)
 * @param requestedItem - The item you want (must have id, title, images/image, ownerId)
 * @param offererUser   - Current Firebase Auth user (uid, displayName, photoURL)
 * @param message       - Optional note to the owner
 * @returns The new TradeOffer document ID
 */
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
  // Guard: cannot trade with yourself
  if (offererUser.uid === requestedItem.ownerId) {
    throw new Error("You cannot propose a trade for your own item.");
  }

  // Guard: duplicate pending offer
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

  const offeredImage = resolveImage(offeredItem);
  const requestedImage = resolveImage(requestedItem);

  const payload: Omit<TradeOffer, "id"> = {
    offeredItemId: offeredItem.id,
    offeredItemTitle: offeredItem.title,
    offeredItemImage: offeredImage,
    requestedItemId: requestedItem.id,
    requestedItemTitle: requestedItem.title,
    requestedItemImage: requestedImage,
    offererId: offererUser.uid,
    offererName: offererUser.displayName ?? "Unknown User",
    offererAvatar: offererUser.photoURL ?? "",
    ownerId: requestedItem.ownerId,
    status: "pending",
    participants: [offererUser.uid, requestedItem.ownerId],
    createdAt: Timestamp.now(),
    ...(message?.trim() ? { message: message.trim() } : {}),
  };

  const docRef = await addDoc(collection(db, "trades"), payload);
  return docRef.id;
};

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Get all trade offers sent BY a user (the "Your Offers" tab in trade.tsx).
 */
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
    // Firestore index might not exist yet — fall back to unordered
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

/**
 * Subscribe to all trade offers sent BY a user in real-time.
 * Returns an unsubscribe function — call it in useEffect cleanup.
 */
export const subscribeToSentOffers = (
  userId: string,
  onUpdate: (offers: TradeOffer[]) => void,
): (() => void) => {
  const q = query(collection(db, "trades"), where("offererId", "==", userId));
  return onSnapshot(q, (snap) => {
    const offers: TradeOffer[] = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<TradeOffer, "id">) }))
      .sort(
        (a, b) =>
          (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
      );
    onUpdate(offers);
  });
};

/**
 * Get all trade offers received ON a specific item (the "See Offers" modal in trade.tsx).
 */
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

/**
 * Get all trade offers for a user (both sent AND received).
 * Useful for a notification badge or full history.
 */
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

/**
 * Fetch a single trade offer by ID.
 */
export const getTradeOffer = async (
  offerId: string,
): Promise<TradeOffer | null> => {
  const docRef = doc(db, "trades", offerId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<TradeOffer, "id">) };
};

// ─── Update ───────────────────────────────────────────────────────────────────

/**
 * Accept or decline a trade offer.
 * Only the item owner (ownerId) should call this.
 */
export const updateTradeStatus = async (
  offerId: string,
  newStatus: "accepted" | "declined",
): Promise<void> => {
  const docRef = doc(db, "trades", offerId);
  await updateDoc(docRef, {
    status: newStatus,
    updatedAt: Timestamp.now(),
  });
};

/**
 * Cancel a trade offer.
 * Only the offerer should call this, and only while status is "pending".
 */
export const cancelTradeOffer = async (offerId: string): Promise<void> => {
  const docRef = doc(db, "trades", offerId);
  await updateDoc(docRef, {
    status: "cancelled",
    updatedAt: Timestamp.now(),
  });
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveImage(item: { images?: string[]; image?: string }): string {
  if (Array.isArray(item.images) && item.images.length > 0) {
    return item.images[0];
  }
  return item.image ?? "";
}
