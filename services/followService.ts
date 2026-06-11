/**
 * followService.ts
 *
 * Centralized follow/unfollow logic for BarterBayan.
 * Uses Firestore subcollections:
 *   users/{userId}/followers/{followerId}  — who follows this user
 *   users/{userId}/following/{followingId} — who this user follows
 *
 * Also maintains denormalized counts on the user doc:
 *   users/{userId}.followerCount
 *   users/{userId}.followingCount
 */

import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    increment,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    Unsubscribe,
    updateDoc,
} from "firebase/firestore";
import { db } from "../firebaseConfig";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface FollowUser {
  uid: string;
  username: string;
  avatarUrl?: string;
  isVerified?: boolean;
  followedAt?: any;
}

// ─── Check if currentUser follows targetUser ──────────────────────────────────
export async function isFollowing(
  currentUserId: string,
  targetUserId: string,
): Promise<boolean> {
  if (!currentUserId || !targetUserId || currentUserId === targetUserId)
    return false;
  const ref = doc(db, "users", targetUserId, "followers", currentUserId);
  const snap = await getDoc(ref);
  return snap.exists();
}

// ─── Subscribe to follow state (real-time) ────────────────────────────────────
export function subscribeToFollowState(
  currentUserId: string,
  targetUserId: string,
  callback: (following: boolean) => void,
): Unsubscribe {
  if (!currentUserId || !targetUserId || currentUserId === targetUserId) {
    callback(false);
    return () => {};
  }
  const ref = doc(db, "users", targetUserId, "followers", currentUserId);
  return onSnapshot(ref, (snap) => callback(snap.exists()));
}

// ─── Follow ───────────────────────────────────────────────────────────────────
export async function followUser(
  currentUserId: string,
  currentUserData: { username: string; avatarUrl?: string },
  targetUserId: string,
  targetUserData: { username: string; avatarUrl?: string },
): Promise<void> {
  if (!currentUserId || !targetUserId || currentUserId === targetUserId) return;

  const batch = [
    // Add currentUser to targetUser's followers
    setDoc(doc(db, "users", targetUserId, "followers", currentUserId), {
      uid: currentUserId,
      username: currentUserData.username,
      avatarUrl: currentUserData.avatarUrl ?? null,
      followedAt: serverTimestamp(),
    }),
    // Add targetUser to currentUser's following
    setDoc(doc(db, "users", currentUserId, "following", targetUserId), {
      uid: targetUserId,
      username: targetUserData.username,
      avatarUrl: targetUserData.avatarUrl ?? null,
      followedAt: serverTimestamp(),
    }),
    // Increment targetUser's followerCount
    updateDoc(doc(db, "users", targetUserId), {
      followerCount: increment(1),
    }),
    // Increment currentUser's followingCount
    updateDoc(doc(db, "users", currentUserId), {
      followingCount: increment(1),
    }),
  ];

  await Promise.all(batch);
}

// ─── Unfollow ─────────────────────────────────────────────────────────────────
export async function unfollowUser(
  currentUserId: string,
  targetUserId: string,
): Promise<void> {
  if (!currentUserId || !targetUserId || currentUserId === targetUserId) return;

  await Promise.all([
    deleteDoc(doc(db, "users", targetUserId, "followers", currentUserId)),
    deleteDoc(doc(db, "users", currentUserId, "following", targetUserId)),
    updateDoc(doc(db, "users", targetUserId), {
      followerCount: increment(-1),
    }),
    updateDoc(doc(db, "users", currentUserId), {
      followingCount: increment(-1),
    }),
  ]);
}

// ─── Toggle follow (convenience) ──────────────────────────────────────────────
export async function toggleFollow(
  currentUserId: string,
  currentUserData: { username: string; avatarUrl?: string },
  targetUserId: string,
  targetUserData: { username: string; avatarUrl?: string },
  currentlyFollowing: boolean,
): Promise<boolean> {
  if (currentlyFollowing) {
    await unfollowUser(currentUserId, targetUserId);
    return false;
  } else {
    await followUser(
      currentUserId,
      currentUserData,
      targetUserId,
      targetUserData,
    );
    return true;
  }
}

// ─── Get followers list ───────────────────────────────────────────────────────
export async function getFollowers(
  userId: string,
  maxCount = 50,
): Promise<FollowUser[]> {
  const q = query(
    collection(db, "users", userId, "followers"),
    orderBy("followedAt", "desc"),
    limit(maxCount),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as FollowUser);
}

// ─── Get following list ───────────────────────────────────────────────────────
export async function getFollowing(
  userId: string,
  maxCount = 50,
): Promise<FollowUser[]> {
  const q = query(
    collection(db, "users", userId, "following"),
    orderBy("followedAt", "desc"),
    limit(maxCount),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as FollowUser);
}

// ─── Subscribe to follower count (real-time) ──────────────────────────────────
export function subscribeToFollowCounts(
  userId: string,
  callback: (followerCount: number, followingCount: number) => void,
): Unsubscribe {
  const ref = doc(db, "users", userId);
  return onSnapshot(ref, (snap) => {
    const data = snap.data();
    callback(data?.followerCount ?? 0, data?.followingCount ?? 0);
  });
}
