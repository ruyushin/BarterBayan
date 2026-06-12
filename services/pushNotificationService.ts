import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { doc, setDoc } from "firebase/firestore";
import { Platform } from "react-native";
import { db } from "../firebaseConfig";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotificationsAsync(
  userId: string,
): Promise<{ expoToken: string | null; fcmToken: string | null }> {
  if (Platform.OS === "web") return { expoToken: null, fcmToken: null };
  if (!Device.isDevice) return { expoToken: null, fcmToken: null };

  // Android channel must exist before any notification arrives
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#f5c518",
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.warn("[Push] Permission denied");
    return { expoToken: null, fcmToken: null };
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.warn(
      "[Push] Missing projectId — add extra.eas.projectId to app.json",
    );
  }

  let expoToken: string | null = null;
  let fcmToken: string | null = null;

  // Expo Push Token — used with https://exp.host/--/exps/v2/push/send
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    expoToken = tokenData.data;
    console.log("[Push] Expo token:", expoToken);
  } catch (err) {
    console.error("[Push] Failed to get Expo token:", err);
  }

  // FCM / APNs device token — used when calling FCM directly
  try {
    const deviceTokenData = await Notifications.getDevicePushTokenAsync();
    fcmToken = deviceTokenData.data as string;
    console.log("[Push] FCM/device token:", fcmToken);
  } catch (err) {
    console.error("[Push] Failed to get FCM/device token:", err);
  }

  // Persist both to Firestore so the backend can use whichever it needs
  try {
    await setDoc(
      doc(db, "users", userId),
      {
        pushToken: expoToken,   // for Expo Push API
        fcmToken: fcmToken,     // for direct FCM
        pushPlatform: Platform.OS,
        pushUpdatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  } catch (err) {
    console.error("[Push] Failed to save tokens to Firestore:", err);
  }

  return { expoToken, fcmToken };
}

export function addNotificationListeners(
  onReceive: (notification: Notifications.Notification) => void,
  onTap: (response: Notifications.NotificationResponse) => void,
): () => void {
  const receivedSub =
    Notifications.addNotificationReceivedListener(onReceive);
  const responseSub =
    Notifications.addNotificationResponseReceivedListener(onTap);
  return () => {
    receivedSub.remove();
    responseSub.remove();
  };
}

export async function sendLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data, sound: "default" },
    trigger: null,
  });
}