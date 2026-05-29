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
  message?: string;
}

export interface TradeMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
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
 * Real-time subscription to all offers on a specific item.
 * Use this in TradeOffersModal so the list updates instantly on accept/decline.
 */
export const subscribeToOffersForItem = (
  itemId: string,
  onUpdate: (offers: TradeOffer[]) => void,
): (() => void) => {
  const q = query(
    collection(db, "trades"),
    where("requestedItemId", "==", itemId),
  );
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
  const docRef = doc(db, "trades", offerId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<TradeOffer, "id">) };
};

// ─── Update ───────────────────────────────────────────────────────────────────

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

export const cancelTradeOffer = async (offerId: string): Promise<void> => {
  const docRef = doc(db, "trades", offerId);
  await updateDoc(docRef, {
    status: "cancelled",
    updatedAt: Timestamp.now(),
  });
};

// ─── Messaging ────────────────────────────────────────────────────────────────

/**
 * Send a message in a trade's chat thread.
 * Messages are stored in: trades/{tradeId}/messages/{messageId}
 */
export const sendTradeMessage = async (
  tradeId: string,
  sender: {
    uid: string;
    displayName: string | null;
    photoURL: string | null;
  },
  text: string,
): Promise<void> => {
  if (!text.trim()) return;
  const messagesRef = collection(db, "trades", tradeId, "messages");
  await addDoc(messagesRef, {
    senderId: sender.uid,
    senderName: sender.displayName ?? "Unknown",
    senderAvatar: sender.photoURL ?? "",
    text: text.trim(),
    createdAt: Timestamp.now(),
  });
};

/**
 * Real-time subscription to a trade's chat messages.
 * Returns an unsubscribe function — call it in useEffect cleanup.
 */
export const subscribeToTradeMessages = (
  tradeId: string,
  onUpdate: (messages: TradeMessage[]) => void,
): (() => void) => {
  const q = query(
    collection(db, "trades", tradeId, "messages"),
    orderBy("createdAt", "asc"),
  );
  return onSnapshot(q, (snap) => {
    const messages: TradeMessage[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<TradeMessage, "id">),
    }));
    onUpdate(messages);
  });
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveImage(item: { images?: string[]; image?: string }): string {
  if (Array.isArray(item.images) && item.images.length > 0) {
    return item.images[0];
  }
  return item.image ?? "";
}
