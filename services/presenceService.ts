import {
    doc,
    getFirestore,
    onSnapshot,
    serverTimestamp,
    setDoc,
} from "firebase/firestore";
import { AppState, AppStateStatus } from "react-native";

const db = getFirestore();

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

export const setUserOffline = async (uid: string) => {
  try {
    await setDoc(
      doc(db, "presence", uid),
      { isOnline: false, lastSeen: serverTimestamp() },
      { merge: true },
    );
  } catch (err) {
    console.error("setUserOffline error:", err);
  }
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
      callback({
        isOnline: !!data.isOnline,
        lastSeen: data.lastSeen ?? null,
      });
    },
    () => callback(null),
  );
};

// ─── Heartbeat: call once near the app root (e.g. in root _layout.tsx) ─────
// Keeps the current user's presence doc fresh while the app is foregrounded,
// and marks them offline when the app goes to background/inactive.
export const startPresenceHeartbeat = (uid: string): (() => void) => {
  if (!uid) return () => {};

  setUserOnline(uid);

  const heartbeatInterval = setInterval(() => {
    setUserOnline(uid);
  }, 60 * 1000); // refresh every 60s while active

  const handleAppStateChange = (state: AppStateStatus) => {
    if (state === "active") {
      setUserOnline(uid);
    } else {
      setUserOffline(uid);
    }
  };

  const subscription = AppState.addEventListener(
    "change",
    handleAppStateChange,
  );

  return () => {
    clearInterval(heartbeatInterval);
    subscription.remove();
    setUserOffline(uid);
  };
};