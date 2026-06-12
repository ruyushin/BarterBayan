/**
 * notificationService.ts
 *
 * Firestore-backed notification service.
 * Collection path: /notifications/{notificationId}
 */

import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebaseConfig";

const NOTIF_COLLECTION = "notifications";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotifType =
  | "trade_offer"
  | "trade_accepted"
  | "trade_declined"
  | "trade_message" // ← NEW: message sent inside a trade chat
  | "message"
  | "generic";

export interface CreateNotificationPayload {
  userId: string;
  type: NotifType;
  title: string;
  body: string;
  avatar?: string;
  /** For all trade-related notifications */
  tradeId?: string;
  /** For message notifications — the UID of the sender */
  otherUserId?: string;
  /** For message notifications — the conversation document ID */
  conversationId?: string;
}

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Write a notification document for `userId`.
 * Silently swallows errors so it never breaks the calling operation.
 */
export async function createNotification(
  payload: CreateNotificationPayload,
): Promise<void> {
  try {
    await addDoc(collection(db, NOTIF_COLLECTION), {
      userId: payload.userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      avatar: payload.avatar ?? null,
      read: false,
      createdAt: serverTimestamp(),
      ...(payload.tradeId ? { tradeId: payload.tradeId } : {}),
      ...(payload.otherUserId ? { otherUserId: payload.otherUserId } : {}),
      ...(payload.conversationId
        ? { conversationId: payload.conversationId }
        : {}),
    });
  } catch (err) {
    console.warn("createNotification failed (non-fatal):", err);
  }
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

/**
 * Returns all notifications for a user, newest first.
 * All Firestore fields are spread onto the returned objects so tradeId,
 * otherUserId, conversationId etc. are always available to the caller.
 */
export async function getNotifications(userId: string): Promise<any[]> {
  try {
    const q = query(
      collection(db, NOTIF_COLLECTION),
      where("userId", "==", userId),
      orderBy("createdAt", "desc"),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err: any) {
    // Composite index may not exist yet — fall back to unordered fetch
    if (err?.code === "failed-precondition") {
      console.warn(
        "notifications index missing — fetching unordered. " +
          "Create the index in Firebase Console.",
      );
      const q2 = query(
        collection(db, NOTIF_COLLECTION),
        where("userId", "==", userId),
      );
      const snap2 = await getDocs(q2);
      return snap2.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => {
          const aMs =
            typeof a.createdAt?.toMillis === "function"
              ? a.createdAt.toMillis()
              : 0;
          const bMs =
            typeof b.createdAt?.toMillis === "function"
              ? b.createdAt.toMillis()
              : 0;
          return bMs - aMs;
        });
    }
    throw err;
  }
}

// ─── Realtime subscription ─────────────────────────────────────────────────────

/**
 * Subscribes to realtime updates for a user's notifications, newest first.
 *
 * Calls `callback` immediately with the current snapshot and again on every
 * subsequent change (new notification, read-state change, deletion, etc.)
 * without requiring a manual refresh.
 *
 * Returns an unsubscribe function — call it on cleanup (e.g. in a
 * useEffect's return) to detach the listener.
 *
 * NOTE: This query requires the same composite index as `getNotifications`
 * (userId ASC/== + createdAt DESC). Unlike `getDocs`, `onSnapshot` will not
 * retry or fall back if the index is missing — it will emit a permanent
 * "failed-precondition" error via the `onError` callback. Create the index
 * via the link in that error, or Firebase Console → Firestore → Indexes.
 */
export function subscribeToNotifications(
  userId: string,
  callback: (notifications: any[]) => void,
  onError?: (err: any) => void,
): () => void {
  const q = query(
    collection(db, NOTIF_COLLECTION),
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
  );

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const notifs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(notifs);
    },
    (err) => {
      console.error("subscribeToNotifications error:", err);
      onError?.(err);
    },
  );

  return unsubscribe;
}

// ─── Mark read ────────────────────────────────────────────────────────────────

export async function markNotificationRead(
  notificationId: string,
): Promise<void> {
  const ref = doc(db, NOTIF_COLLECTION, notificationId);
  await updateDoc(ref, { read: true });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const q = query(
    collection(db, NOTIF_COLLECTION),
    where("userId", "==", userId),
    where("read", "==", false),
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return;

  const batch = writeBatch(db);
  snapshot.docs.forEach((d) => batch.update(d.ref, { read: true }));
  await batch.commit();
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteNotifications(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const batch = writeBatch(db);
  ids.forEach((id) => batch.delete(doc(db, NOTIF_COLLECTION, id)));
  await batch.commit();
}