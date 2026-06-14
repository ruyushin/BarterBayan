import { getAuth } from "firebase/auth";
import {
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { AppState, AppStateStatus } from "react-native";

const db = getFirestore();

let _cachedUid: string | null = null;

// ─── Format "last seen" text ───────────────────────────────────────────────
export const formatLastSeen = (timestamp: any): string => {
  if (!timestamp) return "Offline";
  let date: Date;
  try {
    if (timestamp?.toDate) date = timestamp.toDate();
    else if (timestamp instanceof Date) date = timestamp;
    else if (typeof timestamp.seconds === "number")
      date = new Date(timestamp.seconds * 1000);
    else date = new Date(timestamp);
    if (isNaN(date.getTime())) return "Offline";
  } catch {
    return "Offline";
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 60) return "Active just now";
  if (diffMin < 60) return `Active ${diffMin}m ago`;
  if (diffHr < 24) return `Active ${diffHr}h ago`;
  if (diffDays === 1) return "Active yesterday";
  if (diffDays < 7) return `Active ${diffDays}d ago`;
  return `Active on ${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}`;
};

// ─── Presence shape ─────────────────────────────────────────────────────────
export interface PresenceData {
  isOnline: boolean;
  lastSeen: any;
}

// ─── Set current user's presence ───────────────────────────────────────────
export const setUserOnline = async (uid: string) => {
  _cachedUid = uid;
  try {
    await setDoc(
      doc(db, "presence", uid),
      { isOnline: true, lastSeen: serverTimestamp() },
      { merge: true },
    );
  } catch (err) {
    console.error("setUserOnline error:", err);
  }
};

export const setUserOffline = async (uid?: string) => {
  const targetUid = uid ?? _cachedUid ?? getAuth().currentUser?.uid;
  if (!targetUid) return;

  try {
    await setDoc(
      doc(db, "presence", targetUid),
      { isOnline: false, lastSeen: serverTimestamp() },
      { merge: true },
    );
  } catch (err) {
    // Silently ignore permission errors after sign-out — presence was
    // already written offline by setUserOfflineBeforeSignOut before the
    // token was cleared.
    const code = (err as any)?.code;
    if (code === "permission-denied") return;
    console.error("setUserOffline error:", err);
  }
};

/** Call this BEFORE auth.signOut() so the auth token is still valid */
export const setUserOfflineBeforeSignOut = async () => {
  const targetUid = _cachedUid ?? getAuth().currentUser?.uid;
  if (!targetUid) return;
  await setUserOffline(targetUid);
  _cachedUid = null;
};

// ─── Subscribe to another user's presence ──────────────────────────────────
export const subscribeToPresence = (
  uid: string,
  callback: (presence: PresenceData | null) => void,
): (() => void) => {
  if (!uid) return () => {};
  const ref = doc(db, "presence", uid);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      const data = snap.data();

      // Don't trust the isOnline boolean — Android kills the JS thread
      // before the "offline" write can complete. Instead, derive online
      // status from the lastSeen heartbeat timestamp. If the user hasn't
      // pinged in 2.5 minutes (heartbeat interval is 60s), treat as offline.
      let isOnline = false;
      if (data.isOnline) {
        const lastSeen: Date | null = data.lastSeen?.toDate?.() ?? null;
        if (lastSeen) {
          const diffMs = Date.now() - lastSeen.getTime();
          isOnline = diffMs < 2.5 * 60 * 1000; // 150 seconds
        }
      }

      callback({
        isOnline,
        lastSeen: data.lastSeen ?? null,
      });
    },
    () => callback(null),
  );
};

// ─── Heartbeat: call once near the app root (e.g. in root _layout.tsx) ─────
export const startPresenceHeartbeat = (uid: string): (() => void) => {
  if (!uid) return () => {};

  setUserOnline(uid);

  let heartbeatInterval: ReturnType<typeof setInterval> | null = setInterval(() => {
    setUserOnline(uid);
  }, 60 * 1000);

  const handleAppStateChange = (state: AppStateStatus) => {
    if (state === "active") {
      setUserOnline(uid);
      // Resume heartbeat if it was cleared
      if (!heartbeatInterval) {
        heartbeatInterval = setInterval(() => {
          setUserOnline(uid);
        }, 60 * 1000);
      }
    } else {
      // App went to background or inactive — stop heartbeat and mark offline
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      setUserOffline(uid);
    }
  };

  const subscription = AppState.addEventListener("change", handleAppStateChange);

  return () => {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    subscription.remove();
    setUserOffline(uid);
  };
};