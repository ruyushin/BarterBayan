import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { createNotification } from "./notificationService";

// ─── Constants ────────────────────────────────────────────────────────────────

const CLOUDINARY_CLOUD_NAME = "dh97c25iz";
const CLOUDINARY_UPLOAD_PRESET = "chat_media"; // unsigned preset

// ─── Types ────────────────────────────────────────────────────────────────────

export type MessageType = "text" | "photo" | "video" | "voice";

interface ConversationData {
  id: string;
  participants: string[];
  lastMessage?: string;
  lastMessageTime?: Timestamp;
  lastMessageSenderId?: string;
  isRead?: boolean;
  readBy?: string[];
  deletedBy?: string[];
  archivedBy?: string[];
  mutedBy?: Record<string, Timestamp | null>;
  deletedAt?: Timestamp;
}

interface ReplyRef {
  id: string;
  text: string;
  senderId: string;
}

interface MessageExtra {
  type?: MessageType;
  mediaUrl?: string;   // Cloudinary secure_url for photo / video / voice
  duration?: number;   // seconds – voice & video
  thumbnailUrl?: string; // optional video poster
}

interface MessageData {
  id: string;
  senderId: string;
  recipientId: string;
  text: string | null;
  timestamp: Timestamp;
  read: boolean;
  msgType: MessageType;
  mediaUrl?: string;
  duration?: number;
  thumbnailUrl?: string;
  itemId?: string;
  replyTo?: ReplyRef;
  deletedForEveryone?: boolean;
  deletedFor?: string[];
  edited?: boolean;
  editHistory?: { text: string; editedAt: Timestamp }[];
  reactions?: Record<string, string[]>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getConversationId = (userId1: string, userId2: string): string =>
  [userId1, userId2].sort().join("_");

// ─── Cloudinary upload ────────────────────────────────────────────────────────

/**
 * Uploads a local file URI to Cloudinary.
 * resourceType: "image" for photos, "video" for videos AND audio (Cloudinary treats audio as video).
 * Returns the secure_url of the uploaded asset.
 */
export const uploadToCloudinary = async (
  localUri: string,
  resourceType: "image" | "video" = "image",
): Promise<string> => {
  const filename = localUri.split("/").pop() ?? "upload";
  const ext = (filename.split(".").pop() ?? "").toLowerCase();

  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    heic: "image/heic",
    mp4: "video/mp4",
    mov: "video/quicktime",
    avi: "video/avi",
    mkv: "video/x-matroska",
    m4a: "audio/m4a",
    caf: "audio/x-caf",
    wav: "audio/wav",
    aac: "audio/aac",
    mp3: "audio/mpeg",
  };
  const type = mimeMap[ext] ?? (resourceType === "image" ? "image/jpeg" : "video/mp4");

  const formData = new FormData();
  formData.append("file", { uri: localUri, name: filename, type } as any);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("folder", "chat_media");

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
    { method: "POST", body: formData },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Cloudinary upload failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.secure_url as string;
};

// ─── Real-time message subscription ──────────────────────────────────────────

export const subscribeToMessages = (
  userId1: string,
  userId2: string,
  onMessages: (messages: MessageData[]) => void,
  limitCount: number = 100,
): (() => void) => {
  const conversationId = getConversationId(userId1, userId2);
  const messagesRef = collection(db, "messages", conversationId, "threads");
  const q = query(messagesRef, orderBy("timestamp", "asc"), limit(limitCount));

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const msgs: MessageData[] = snapshot.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<MessageData, "id">) }))
        .filter((msg) => {
          if (msg.deletedForEveryone) return true;
          if (Array.isArray(msg.deletedFor) && msg.deletedFor.includes(userId1))
            return false;
          return true;
        });
      onMessages(msgs);
    },
    (error) => {
      console.error("Message subscription error:", error);
    },
  );

  return unsubscribe;
};

// ─── Send (unified: text / photo / video / voice) ─────────────────────────────

export const sendMessage = async (
  senderId: string,
  recipientId: string,
  messageText: string,
  itemId?: string,
  replyTo?: ReplyRef,
  extra?: MessageExtra,
): Promise<string> => {
  try {
    const conversationId = getConversationId(senderId, recipientId);
    const messagesRef = collection(db, "messages", conversationId, "threads");

    const msgType: MessageType = extra?.type ?? "text";

    const messageData: Omit<MessageData, "id"> = {
      senderId,
      recipientId,
      text: messageText || null,
      timestamp: Timestamp.now(),
      read: false,
      msgType,
      deletedForEveryone: false,
      deletedFor: [],
      reactions: {},
    };

    if (itemId) (messageData as any).itemId = itemId;
    if (replyTo) messageData.replyTo = replyTo;
    if (extra?.mediaUrl) messageData.mediaUrl = extra.mediaUrl;
    if (extra?.duration !== undefined) messageData.duration = extra.duration;
    if (extra?.thumbnailUrl) messageData.thumbnailUrl = extra.thumbnailUrl;

    const messageDoc = await addDoc(messagesRef, messageData);

    // Last message preview label
    const lastMessagePreview =
      msgType === "photo" ? "📷 Photo"
      : msgType === "video" ? "🎬 Video"
      : msgType === "voice" ? "🎙️ Voice message"
      : messageText;

    const conversationRef = doc(db, "messages", conversationId);
    await setDoc(
      conversationRef,
      {
        participants: [senderId, recipientId],
        lastMessage: lastMessagePreview,
        lastMessageTime: Timestamp.now(),
        lastMessageSenderId: senderId,
        deletedBy: [],
        deletedAt: null,
      },
      { merge: true },
    );

    // ── Notify recipient only when conversation is NOT muted ──────────────
    const convSnap = await getDoc(conversationRef);
    const convData = convSnap.data();
    const mutedUntilTs = convData?.mutedBy?.[recipientId];
    const isMuted =
      mutedUntilTs &&
      (mutedUntilTs.toMillis?.() ?? 0) > Date.now();

    if (!isMuted) {
      const senderName = auth.currentUser?.displayName ?? "Someone";
      const senderAvatar = auth.currentUser?.photoURL ?? undefined;

      await createNotification({
        userId: recipientId,
        type: "message",
        title: senderName,
        body: lastMessagePreview.length > 80
          ? lastMessagePreview.slice(0, 80) + "…"
          : lastMessagePreview,
        avatar: senderAvatar,
        otherUserId: senderId,
        conversationId,
      });
    }

    return messageDoc.id;
  } catch (error) {
    console.error("Error sending message:", error);
    throw error;
  }
};

// ─── React to message ─────────────────────────────────────────────────────────

export const reactToMessage = async (
  conversationId: string,
  messageId: string,
  emoji: string,
  userId: string,
): Promise<void> => {
  try {
    const msgRef = doc(db, "messages", conversationId, "threads", messageId);
    const snap = await getDoc(msgRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const reactions: Record<string, string[]> = data.reactions ?? {};

    const updated: Record<string, string[]> = {};
    for (const [key, users] of Object.entries(reactions)) {
      updated[key] = (users as string[]).filter((u) => u !== userId);
    }

    const hadThisEmoji = (reactions[emoji] ?? []).includes(userId);
    if (!hadThisEmoji) {
      updated[emoji] = [...(updated[emoji] ?? []), userId];
    }

    await updateDoc(msgRef, { reactions: updated });
  } catch (error) {
    console.error("Error reacting to message:", error);
    throw error;
  }
};

// ─── Edit message ─────────────────────────────────────────────────────────────

export const editMessage = async (
  conversationId: string,
  messageId: string,
  newText: string,
): Promise<void> => {
  try {
    const msgRef = doc(db, "messages", conversationId, "threads", messageId);
    const snap = await getDoc(msgRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const editHistoryEntry = { text: data.text, editedAt: data.timestamp };

    await updateDoc(msgRef, {
      text: newText,
      edited: true,
      editHistory: arrayUnion(editHistoryEntry),
    });
  } catch (error) {
    console.error("Error editing message:", error);
    throw error;
  }
};

// ─── Delete for me ────────────────────────────────────────────────────────────

export const deleteMessageForMe = async (
  conversationId: string,
  messageId: string,
  userId: string,
): Promise<void> => {
  try {
    const msgRef = doc(db, "messages", conversationId, "threads", messageId);
    await updateDoc(msgRef, { deletedFor: arrayUnion(userId) });
  } catch (error) {
    console.error("Error deleting message for me:", error);
    throw error;
  }
};

// ─── Delete for everyone ──────────────────────────────────────────────────────

export const deleteMessageForEveryone = async (
  conversationId: string,
  messageId: string,
  _userId: string,
): Promise<void> => {
  try {
    const msgRef = doc(db, "messages", conversationId, "threads", messageId);
    await updateDoc(msgRef, { deletedForEveryone: true, text: null });
  } catch (error) {
    console.error("Error deleting message for everyone:", error);
    throw error;
  }
};

// ─── Read ─────────────────────────────────────────────────────────────────────

export const getConversationMessages = async (
  userId1: string,
  userId2: string,
  limitCount: number = 50,
): Promise<MessageData[]> => {
  try {
    const conversationId = getConversationId(userId1, userId2);
    const messagesRef = collection(db, "messages", conversationId, "threads");
    const q = query(messagesRef, orderBy("timestamp", "desc"), limit(limitCount));
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<MessageData, "id">) }))
      .reverse();
  } catch (error) {
    console.error("Error getting messages:", error);
    throw error;
  }
};

export const getUserConversations = async (
  userId: string,
): Promise<ConversationData[]> => {
  try {
    const conversationsRef = collection(db, "messages");
    const q = query(conversationsRef, where("participants", "array-contains", userId));
    const snapshot = await getDocs(q);
    const conversations = snapshot.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<ConversationData, "id">) }))
      .filter(
        (conv) => !Array.isArray(conv.deletedBy) || !conv.deletedBy.includes(userId),
      );
    return conversations.sort((a, b) => {
      const timeA = a.lastMessageTime?.toMillis?.() ?? 0;
      const timeB = b.lastMessageTime?.toMillis?.() ?? 0;
      return timeB - timeA;
    });
  } catch (error) {
    console.error("Error getting conversations:", error);
    throw error;
  }
};

export const subscribeToUserConversations = (
  userId: string,
  onConversations: (conversations: ConversationData[]) => void,
): (() => void) => {
  const conversationsRef = collection(db, "messages");
  const q = query(conversationsRef, where("participants", "array-contains", userId));

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const conversations = snapshot.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<ConversationData, "id">) }))
        .filter(
          (conv) => !Array.isArray(conv.deletedBy) || !conv.deletedBy.includes(userId),
        )
        .sort((a, b) => {
          const timeA = a.lastMessageTime?.toMillis?.() ?? 0;
          const timeB = b.lastMessageTime?.toMillis?.() ?? 0;
          return timeB - timeA;
        });
      onConversations(conversations);
    },
    (error) => {
      console.error("Error subscribing to conversations:", error);
    },
  );

  return unsubscribe;
};

export const getOtherUserInConversation = (
  conversationId: string,
  currentUserId: string,
): string => {
  const [userId1, userId2] = conversationId.split("_");
  return userId1 === currentUserId ? userId2 : userId1;
};

// ─── Read / Unread ────────────────────────────────────────────────────────────

export const getUnreadMessageCount = async (
  conversationId: string,
  userId: string,
): Promise<number> => {
  try {
    const messagesRef = collection(db, "messages", conversationId, "threads");
    const q = query(
      messagesRef,
      where("recipientId", "==", userId),
      where("read", "==", false),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.length;
  } catch (error) {
    console.error("Error getting unread message count:", error);
    return 0;
  }
};

export const markMessagesAsRead = async (
  conversationId: string,
  userId: string,
): Promise<void> => {
  try {
    const messagesRef = collection(db, "messages", conversationId, "threads");
    const q = query(
      messagesRef,
      where("recipientId", "==", userId),
      where("read", "==", false),
    );
    const snapshot = await getDocs(q);
    snapshot.docs.forEach((messageDoc) => {
      const messageRef = doc(db, "messages", conversationId, "threads", messageDoc.id);
      setDoc(messageRef, { read: true }, { merge: true }).catch((error) =>
        console.error("Error marking message as read:", error),
      );
    });
  } catch (error) {
    console.error("Error marking messages as read:", error);
    throw error;
  }
};

export const markMessagesAsUnread = async (
  conversationId: string,
  userId: string,
): Promise<void> => {
  try {
    const messagesRef = collection(db, "messages", conversationId, "threads");
    const q = query(
      messagesRef,
      where("recipientId", "==", userId),
      where("read", "==", true),
    );
    const snapshot = await getDocs(q);
    snapshot.docs.forEach((messageDoc) => {
      const messageRef = doc(db, "messages", conversationId, "threads", messageDoc.id);
      setDoc(messageRef, { read: false }, { merge: true }).catch((error) =>
        console.error("Error marking message as unread:", error),
      );
    });
  } catch (error) {
    console.error("Error marking messages as unread:", error);
    throw error;
  }
};

export const markConversationAsRead = async (
  conversationId: string,
  userId: string,
): Promise<void> => {
  try {
    const conversationRef = doc(db, "messages", conversationId);
    await setDoc(conversationRef, { isRead: true, readBy: arrayUnion(userId) }, { merge: true });
  } catch (error) {
    console.error("Error marking conversation as read:", error);
    throw error;
  }
};

export const markConversationAsUnread = async (
  conversationId: string,
  userId: string,
): Promise<void> => {
  try {
    await markMessagesAsUnread(conversationId, userId);
    const conversationRef = doc(db, "messages", conversationId);
    await setDoc(conversationRef, { isRead: false, readBy: [] }, { merge: true });
  } catch (error) {
    console.error("Error marking conversation as unread:", error);
    throw error;
  }
};

// ─── Archive / Unarchive ──────────────────────────────────────────────────────

export const archiveConversation = async (
  conversationId: string,
  userId: string,
): Promise<void> => {
  try {
    const conversationRef = doc(db, "messages", conversationId);
    await setDoc(conversationRef, { archivedBy: arrayUnion(userId) }, { merge: true });
  } catch (error) {
    console.error("Error archiving conversation:", error);
    throw error;
  }
};

export const unarchiveConversation = async (
  conversationId: string,
  _userId: string,
): Promise<void> => {
  try {
    const conversationRef = doc(db, "messages", conversationId);
    await setDoc(conversationRef, { archivedBy: [] }, { merge: true });
  } catch (error) {
    console.error("Error unarchiving conversation:", error);
    throw error;
  }
};

// ─── Delete conversation ──────────────────────────────────────────────────────

export const deleteConversation = async (
  conversationId: string,
  userId: string,
): Promise<void> => {
  try {
    const threadsRef = collection(db, "messages", conversationId, "threads");
    const threadsSnapshot = await getDocs(threadsRef);
    await Promise.all(
      threadsSnapshot.docs.map((threadDoc) =>
        deleteDoc(doc(db, "messages", conversationId, "threads", threadDoc.id)),
      ),
    );
    const conversationRef = doc(db, "messages", conversationId);
    await setDoc(
      conversationRef,
      { deletedBy: arrayUnion(userId), deletedAt: Timestamp.now(), lastMessage: "" },
      { merge: true },
    );
  } catch (error) {
    console.error("Error deleting conversation:", error);
    throw error;
  }
};

// ─── Mute / Unmute ────────────────────────────────────────────────────────────

export const muteConversation = async (
  conversationId: string,
  userId: string,
  muteUntil: Date,
): Promise<void> => {
  try {
    const conversationRef = doc(db, "messages", conversationId);
    await setDoc(
      conversationRef,
      { mutedBy: { [userId]: Timestamp.fromDate(muteUntil) } },
      { merge: true },
    );
  } catch (error) {
    console.error("Error muting conversation:", error);
    throw error;
  }
};

export const unmuteConversation = async (
  conversationId: string,
  userId: string,
): Promise<void> => {
  try {
    const conversationRef = doc(db, "messages", conversationId);
    await setDoc(conversationRef, { mutedBy: { [userId]: null } }, { merge: true });
  } catch (error) {
    console.error("Error unmuting conversation:", error);
    throw error;
  }
};

// ─── Fetch Conversation Metadata ──────────────────────────────────────────────

export const getConversationData = async (
  conversationId: string,
): Promise<ConversationData | null> => {
  try {
    const conversationRef = doc(db, "messages", conversationId);
    const snapshot = await getDoc(conversationRef);
    if (snapshot.exists()) {
      return { id: snapshot.id, ...(snapshot.data() as Omit<ConversationData, "id">) };
    }
    return null;
  } catch (error) {
    console.error("Error fetching conversation data:", error);
    throw error;
  }
};

// ─── One-time migration helper ────────────────────────────────────────────────

export const migrateMissingTimestamps = async (): Promise<number> => {
  let updatedCount = 0;
  try {
    const messagesRef = collection(db, "messages");
    const conversationDocs = await getDocs(messagesRef);
    for (const convDoc of conversationDocs.docs) {
      const conversationId = convDoc.id;
      const threadsRef = collection(db, "messages", conversationId, "threads");
      const threadDocs = await getDocs(threadsRef);
      for (const threadDoc of threadDocs.docs) {
        const msgData = threadDoc.data();
        if (!msgData.timestamp) {
          const msgRef = doc(db, "messages", conversationId, "threads", threadDoc.id);
          await setDoc(msgRef, { timestamp: Timestamp.now() }, { merge: true });
          updatedCount++;
        }
      }
    }
    console.log(`Migration complete: Updated ${updatedCount} messages`);
    return updatedCount;
  } catch (error) {
    console.error("Migration error:", error);
    throw error;
  }
};