import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

initializeApp();

exports.sendPushOnNotification = onDocumentCreated(
  "notifications/{notifId}",
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const { userId, title, body, type, tradeId, otherUserId, conversationId } = data;
    if (!userId || !title || !body) return;

    const db = getFirestore();

    const userSnap = await db.collection("users").doc(userId).get();
    if (!userSnap.exists) {
      console.log(`[Push] User ${userId} not found`);
      return;
    }

    const pushToken: string | undefined = userSnap.data()?.pushToken;
    if (!pushToken || !pushToken.startsWith("ExponentPushToken[")) {
      console.log(`[Push] No valid Expo push token for user ${userId}`);
      return;
    }

    const message = {
      to: pushToken,
      title,
      body,
      sound: "default",
      badge: 1,
      data: {
        type: type ?? "generic",
        ...(tradeId ? { tradeId } : {}),
        ...(otherUserId ? { otherUserId } : {}),
        ...(conversationId ? { conversationId } : {}),
      },
      channelId: "default",
    };

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    console.log("[Push] Expo response:", JSON.stringify(result));

    if (result?.data?.status === "error") {
      console.error("[Push] Expo push error:", result.data.message);
    }
  },
);