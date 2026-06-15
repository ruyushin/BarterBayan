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
  getDoc,
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
  | "trade_message"
  | "message"
  | "generic";

export interface CreateNotificationPayload {
  userId: string;
  type: NotifType;
  title: string;
  body: string;
  avatar?: string;
  tradeId?: string;
  otherUserId?: string;
  conversationId?: string;
  senderId?: string;
}

// ─── Push helper ──────────────────────────────────────────────────────────────

async function sendExpoPush(
  pushToken: string,
  title: string,
  body: string,
  data?: Record<string, any>,
): Promise<void> {
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify({
        to: pushToken,
        title,
        body,
        data,
        sound: "default",
        channelId: "default",
      }),
    });
    const result = await response.json();
    if (result?.data?.status === "error") {
      console.warn("[Push] Expo error:", result.data.message);
    }
  } catch (err) {
    console.warn("[Push] sendExpoPush failed (non-fatal):", err);
  }
}

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Write a notification document for `userId` and send a push notification
 * to their device if they have a valid Expo push token saved.
 *
 * FIX BUG 4: If the recipient has archived this conversation, we skip both
 * writing the Firestore notification and sending the push notification.
 */
export async function createNotification(
  payload: CreateNotificationPayload,
): Promise<void> {
  try {
    // Skip notification entirely if the recipient has archived this conversation
    if (payload.conversationId) {
      const convRef = doc(db, "messages", payload.conversationId);
      const convSnap = await getDoc(convRef);
      if (convSnap.exists()) {
        const archivedBy: string[] = convSnap.data()?.archivedBy ?? [];
        if (archivedBy.includes(payload.userId)) {
          // Recipient archived this conversation — no notification, no push.
          return;
        }
      }
    }

    // 1. Write to Firestore
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
      ...(payload.conversationId ? { conversationId: payload.conversationId } : {}),
      ...(payload.senderId ? { senderId: payload.senderId } : {}),
    });

    // 2. Fetch the recipient's push token and send a push notification
    const userSnap = await getDoc(doc(db, "users", payload.userId));
    const pushToken: string | undefined = userSnap.data()?.pushToken;

    if (pushToken && pushToken.startsWith("ExponentPushToken[")) {
      await sendExpoPush(pushToken, payload.title, payload.body, {
        type: payload.type,
        ...(payload.tradeId ? { tradeId: payload.tradeId } : {}),
        ...(payload.otherUserId ? { otherUserId: payload.otherUserId } : {}),
        ...(payload.conversationId ? { conversationId: payload.conversationId } : {}),
      });
    }
  } catch (err) {
    console.warn("createNotification failed (non-fatal):", err);
  }
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

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

// ─── Realtime subscription ────────────────────────────────────────────────────

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

/**
 * FIX BUG 3: Mark all unread notifications for a specific conversation as read.
 * Called when the user opens chat.tsx so the notification tab reflects the
 * read state immediately when they return to the inbox.
 */
export async function markConversationNotificationsAsRead(
  userId: string,
  conversationId: string,
): Promise<void> {
  try {
    const q = query(
      collection(db, NOTIF_COLLECTION),
      where("userId", "==", userId),
      where("conversationId", "==", conversationId),
      where("read", "==", false),
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return;

    const batch = writeBatch(db);
    snapshot.docs.forEach((d) => batch.update(d.ref, { read: true }));
    await batch.commit();
  } catch (err) {
    console.warn("markConversationNotificationsAsRead failed:", err);
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteNotifications(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const batch = writeBatch(db);
  ids.forEach((id) => batch.delete(doc(db, NOTIF_COLLECTION, id)));
  await batch.commit();
}