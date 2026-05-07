/**
 * notificationService.ts
 *
 * Firestore-backed notification service.
 * Collection path: /notifications/{notificationId}
 * Each doc fields:
 *   userId      : string   – owner of the notification
 *   type        : "trade_offer" | "trade_accepted" | "message" | "generic"
 *   title       : string
 *   body        : string
 *   avatar?     : string   – remote image URL
 *   read        : boolean
 *   createdAt   : Timestamp
 *   tradeId?    : string   – for trade_offer / trade_accepted
 *   otherUserId?: string   – for message notifications
 */

import {
    collection,
    doc,
    getDocs,
    orderBy,
    query,
    updateDoc,
    where,
    writeBatch,
} from "firebase/firestore";
import { db } from "../firebaseConfig"; // adjust path if needed

const NOTIF_COLLECTION = "notifications";

// ─── Fetch ────────────────────────────────────────────────────────────────────

/**
 * Returns all notifications for a user, newest first.
 */
export async function getNotifications(userId: string): Promise<any[]> {
  const q = query(
    collection(db, NOTIF_COLLECTION),
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─── Mark read ────────────────────────────────────────────────────────────────

/**
 * Mark a single notification as read.
 */
export async function markNotificationRead(
  notificationId: string,
): Promise<void> {
  const ref = doc(db, NOTIF_COLLECTION, notificationId);
  await updateDoc(ref, { read: true });
}

/**
 * Mark ALL unread notifications for a user as read.
 */
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

/**
 * Delete one or more notifications by their Firestore document IDs.
 */
export async function deleteNotifications(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const batch = writeBatch(db);
  ids.forEach((id) => batch.delete(doc(db, NOTIF_COLLECTION, id)));
  await batch.commit();
}

// ─── Create (call from Cloud Function or other services) ─────────────────────

/**
 * Example payload for creating a notification.
 * Typically called from a Cloud Function — provided here for reference.
 *
 * await addDoc(collection(db, "notifications"), {
 *   userId:      targetUserId,
 *   type:        "trade_offer",           // or "trade_accepted" | "message" | "generic"
 *   title:       "Neymar Cruz",
 *   body:        "offered a trade on your item!",
 *   avatar:      "https://...",           // optional
 *   read:        false,
 *   createdAt:   serverTimestamp(),
 *   tradeId:     "abc123",               // optional
 *   otherUserId: "xyz456",               // optional
 * });
 */
