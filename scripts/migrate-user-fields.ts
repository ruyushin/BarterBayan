/**
 * One-time migration script.
 *
 * Fixes existing user documents created before the rating/tradeCount fix:
 *  - If `ratingCount` is missing or 0 AND `rating` is currently 5 (the old
 *    hardcoded default), reset `rating` to 0 and set `ratingCount: 0`.
 *    (Users who genuinely earned a 5.0 average from real reviews will have
 *    `ratingCount > 0`, so they are left untouched.)
 *  - If `tradesCount` exists (the old, mis-named field written by
 *    completeTrade) and `tradeCount` is missing or 0, copy the value of
 *    `tradesCount` into `tradeCount`.
 *
 * This uses a standalone Firebase init (no React Native / Google Sign-In /
 * Auth persistence code), so it can run in plain Node via ts-node.
 *
 * Run with:
 *   npx ts-node --compiler-options "{\"module\":\"commonjs\"}" scripts/migrate-user-fields.ts
 *
 * NOTE: If your Firestore security rules restrict writes to
 * `users/{userId}` to the authenticated owner (request.auth.uid == userId),
 * this script — running unauthenticated — will fail with
 * "permission-denied" on every update. In that case you'll need to either:
 *   1. Temporarily relax the rule for the `users` collection, run this,
 *      then restore the rule, OR
 *   2. Re-run this using the Firebase Admin SDK with a service account key
 *      (which bypasses security rules).
 */

import { initializeApp } from "firebase/app";
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  updateDoc,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCnKXpp6R9BqkLF0_joqxA3Ur0Gqi-e3Ic",
  authDomain: "barterbayan.firebaseapp.com",
  projectId: "barterbayan",
  storageBucket: "barterbayan.firebasestorage.app",
  messagingSenderId: "1081232685961",
  appId: "1:1081232685961:web:565d7fcae9e5f7c0b1bf58",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function migrateUserFields() {
  const snap = await getDocs(collection(db, "users"));

  let ratingFixed = 0;
  let tradeCountFixed = 0;
  let skipped = 0;
  let failed = 0;

  for (const userDoc of snap.docs) {
    const data = userDoc.data();
    const updates: Record<string, unknown> = {};

    // ── Fix stale default rating of 5.0 for users with no real reviews ──
    const ratingCount = data.ratingCount ?? 0;
    const rating = data.rating ?? 0;
    if (ratingCount === 0 && rating === 5) {
      updates.rating = 0;
      updates.ratingCount = 0;
    }

    // ── Migrate old `tradesCount` → `tradeCount` ──
    const oldTradesCount = data.tradesCount;
    const currentTradeCount = data.tradeCount ?? 0;
    if (
      typeof oldTradesCount === "number" &&
      oldTradesCount > 0 &&
      currentTradeCount === 0
    ) {
      updates.tradeCount = oldTradesCount;
    }

    if (Object.keys(updates).length > 0) {
      try {
        await updateDoc(doc(db, "users", userDoc.id), updates);
        if (updates.rating !== undefined) ratingFixed++;
        if (updates.tradeCount !== undefined) tradeCountFixed++;
        console.log(`Updated user ${userDoc.id}:`, updates);
      } catch (err: any) {
        failed++;
        console.error(
          `Failed to update user ${userDoc.id}:`,
          err?.message ?? err,
        );
      }
    } else {
      skipped++;
    }
  }

  console.log("─────────────────────────────");
  console.log(`Ratings reset to 0:     ${ratingFixed}`);
  console.log(`tradeCount migrated:    ${tradeCountFixed}`);
  console.log(`Users unchanged:        ${skipped}`);
  console.log(`Updates failed:         ${failed}`);
}

migrateUserFields()
  .then(() => {
    console.log("Migration complete.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });