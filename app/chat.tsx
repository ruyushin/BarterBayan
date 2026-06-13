import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { auth } from "../firebaseConfig";
import { getUserInfo } from "../services/itemService";
import {
  archiveConversation,
  deleteConversation,
  deleteMessageForEveryone,
  deleteMessageForMe,
  editMessage,
  getConversationData,
  markConversationAsRead,
  markMessagesAsRead,
  muteConversation,
  reactToMessage,
  sendMessage,
  subscribeToMessages,
  unmuteConversation,
  uploadToCloudinary,
} from "../services/messagingService";
import { PresenceData, subscribeToPresence } from "../services/presenceService";

// ─── Constants ────────────────────────────────────────────────────────────────
const NAVY = "#2f2f6f";
const EDIT_WINDOW_MS = 10 * 60 * 1000;
const DELETE_WINDOW_MS = 15 * 60 * 1000;
const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");
const TIME_CLUSTER_MINUTES = 5;
const MEDIA_BUBBLE_WIDTH = Math.min(240, SCREEN_WIDTH * 0.65);
const MEDIA_BUBBLE_MAX_HEIGHT = MEDIA_BUBBLE_WIDTH * 1.4;
const MEDIA_BUBBLE_MIN_HEIGHT = MEDIA_BUBBLE_WIDTH * 0.6;

const SUGGESTED_MESSAGES = [
  "Is this still available?",
  "Is this negotiable?",
  "When can we meet?",
];

const AVATAR_COLORS = [
  "#e05c5c", "#e07a5c", "#5c7ae0",
  "#5cb8e0", "#7a5ce0", "#5ce07a",
];

const QUICK_EMOJIS = ["❤️", "😆", "😮", "😢", "😡", "👍"];

// ─── Types ────────────────────────────────────────────────────────────────────
interface SheetOption {
  label: string;
  icon: string;
  destructive?: boolean;
  onPress: () => void;
}

type ListItem =
  | { type: "dateSeparator"; id: string; date: string }
  | { type: "timeSeparator"; id: string; time: string }
  | { type: "message"; id: string; [key: string]: any };

// ─── Utility functions ────────────────────────────────────────────────────────
const toDate = (timestamp: any): Date => {
  if (!timestamp) return new Date(0);
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp.toDate === "function") return timestamp.toDate();
  if (typeof timestamp.seconds === "number") return new Date(timestamp.seconds * 1000);
  const parsed = new Date(timestamp);
  return isNaN(parsed.getTime()) ? new Date(0) : parsed;
};

const formatMessageTime = (timestamp: any): string => {
  const date = toDate(timestamp);
  if (date.getTime() === 0) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const formatDateLabel = (timestamp: any): string => {
  const date = toDate(timestamp);
  if (date.getTime() === 0) return "";
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((todayMidnight.getTime() - msgMidnight.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString([], {
    month: "long", day: "numeric",
    year: diffDays > 365 ? "numeric" : undefined,
  });
};

const dayKey = (timestamp: any): string => {
  const date = toDate(timestamp);
  if (date.getTime() === 0) return "unknown";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

const letterAvatarColor = (name: string) =>
  AVATAR_COLORS[(name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length];

const resolveAvatar = (info: any): string | null => {
  const url = info?.avatarUrl || info?.photoURL || info?.profileImage ||
    info?.avatar || info?.profilePicture || info?.photo || info?.picture || null;
  if (url && typeof url === "string" && url.startsWith("http")) return url;
  return null;
};

const withinWindow = (timestamp: any, windowMs: number): boolean => {
  const date = toDate(timestamp);
  if (date.getTime() === 0) return false;
  return Date.now() - date.getTime() < windowMs;
};

const formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

// ─── AvatarWithFallback ───────────────────────────────────────────────────────
function AvatarWithFallback({ uri, name, size, style, fallbackFontSize }: {
  uri: string | null; name: string; size: number; style?: any; fallbackFontSize?: number;
}) {
  const [failed, setFailed] = useState(false);
  const initials = (name || "?").charAt(0).toUpperCase();
  const base = { width: size, height: size, borderRadius: size / 2, backgroundColor: "#ddd" };
  if (uri && !failed) {
    return <Image source={{ uri }} style={[base, style]} onError={() => setFailed(true)} />;
  }
  return (
    <View style={[base, { backgroundColor: letterAvatarColor(name || "?"), justifyContent: "center", alignItems: "center" }, style]}>
      <Text style={{ color: "#fff", fontSize: fallbackFontSize ?? size * 0.42, fontWeight: "700" }}>{initials}</Text>
    </View>
  );
}

// ─── BottomSheet ──────────────────────────────────────────────────────────────
function BottomSheet({ visible, title, options, onClose }: {
  visible: boolean; title?: string; options: SheetOption[]; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sheet.overlay} onPress={onClose}>
        <Pressable style={sheet.panel}>
          {title ? <Text style={sheet.title}>{title}</Text> : null}
          {options.map((opt, i) => (
            <TouchableOpacity
              key={i}
              style={[sheet.option, i < options.length - 1 && sheet.optionBorder]}
              onPress={() => { onClose(); setTimeout(opt.onPress, 200); }}
              activeOpacity={0.7}
            >
              <Ionicons name={opt.icon as any} size={20} color={opt.destructive ? "#ef4444" : NAVY} style={sheet.optionIcon} />
              <Text style={[sheet.optionLabel, opt.destructive && sheet.optionDestructive]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={sheet.cancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={sheet.cancelLabel}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const sheet = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  panel: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },
  title: { fontSize: 13, color: "#999", textAlign: "center", marginBottom: 8 },
  option: { flexDirection: "row", alignItems: "center", paddingVertical: 15 },
  optionBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e5e5e5" },
  optionIcon: { marginRight: 14 },
  optionLabel: { fontSize: 16, color: "#111" },
  optionDestructive: { color: "#ef4444" },
  cancelBtn: { marginTop: 8, backgroundColor: "#f2f2f7", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  cancelLabel: { fontSize: 16, fontWeight: "600", color: "#333" },
});

// ─── DeleteConversationModal ──────────────────────────────────────────────────
function DeleteConversationModal({ visible, onCancel, onConfirm }: {
  visible: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={delModal.overlay} onPress={onCancel}>
        <Pressable style={delModal.panel}>
          <View style={delModal.iconWrap}>
            <Ionicons name="trash-outline" size={36} color="#ef4444" />
          </View>
          <Text style={delModal.title}>Delete Conversation</Text>
          <Text style={delModal.body}>
            Are you sure you want to delete this conversation? All messages will be removed.
          </Text>
          <View style={delModal.actions}>
            <TouchableOpacity style={delModal.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
              <Text style={delModal.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={delModal.deleteBtn} onPress={onConfirm} activeOpacity={0.8}>
              <Text style={delModal.deleteText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const delModal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center" },
  panel: { backgroundColor: "#fff", borderRadius: 20, padding: 24, width: "80%", alignItems: "center" },
  iconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#fff1f1", justifyContent: "center", alignItems: "center", marginBottom: 14 },
  title: { fontSize: 17, fontWeight: "700", color: "#111", marginBottom: 8, textAlign: "center" },
  body: { fontSize: 14, color: "#666", textAlign: "center", lineHeight: 20, marginBottom: 20 },
  actions: { flexDirection: "row", gap: 12, width: "100%" },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: "#f2f2f7", alignItems: "center" },
  cancelText: { fontWeight: "600", color: "#333", fontSize: 15 },
  deleteBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: "#ef4444", alignItems: "center" },
  deleteText: { fontWeight: "600", color: "#fff", fontSize: 15 },
});

// ─── UploadProgressModal ──────────────────────────────────────────────────────
function UploadProgressModal({ visible, label }: { visible: boolean; label: string }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={upModal.overlay}>
        <View style={upModal.panel}>
          <ActivityIndicator size="large" color={NAVY} />
          <Text style={upModal.label}>{label}</Text>
        </View>
      </View>
    </Modal>
  );
}

const upModal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  panel: { backgroundColor: "#fff", borderRadius: 16, padding: 28, alignItems: "center", gap: 14, minWidth: 160 },
  label: { fontSize: 14, color: "#333", fontWeight: "600" },
});

// ─── MessageContextMenu ───────────────────────────────────────────────────────
function MessageContextMenu({ visible, message, isMe, senderName, anchorY, onClose,
  onReact, onReply, onEdit, onCopy, onViewEditHistory, onDeleteForMe, onDeleteForEveryone,
  onSaveMedia }: {
  visible: boolean; message: any; isMe: boolean; senderName: string; anchorY: number;
  onClose: () => void; onReact: (emoji: string) => void; onReply: () => void;
  onEdit?: () => void; onCopy: () => void; onViewEditHistory?: () => void;
  onDeleteForMe: () => void; onDeleteForEveryone?: () => void;
  onSaveMedia?: () => void;
}) {
  if (!message) return null;
  const isMedia = ["photo", "video", "voice"].includes(message.msgType);
  const isPhotoOrVideo = ["photo", "video"].includes(message.msgType);
  const canEdit = isMe && message.msgType === "text" && withinWindow(message.timestamp, EDIT_WINDOW_MS);
  const canDelAll = isMe && withinWindow(message.timestamp, DELETE_WINDOW_MS);
  const hasEditHistory = message.editHistory && message.editHistory.length > 0;

  const EMOJI_ROW_H = 70;
  const ACTION_H = 52;
  const actionCount = 2 + (canEdit ? 1 : 0) + (hasEditHistory ? 1 : 0) + (!isMedia ? 1 : 0) + (canDelAll ? 1 : 0) + (isPhotoOrVideo ? 1 : 0);
  const panelHeight = EMOJI_ROW_H + actionCount * ACTION_H + 20;
  const spaceBelow = SCREEN_HEIGHT - anchorY - 80;
  const topPos = spaceBelow > panelHeight ? anchorY + 10 : Math.max(60, anchorY - panelHeight - 10);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={ctx.overlay} onPress={onClose}>
        <Pressable
          style={[ctx.panel, { top: topPos, left: isMe ? undefined : 12, right: isMe ? 12 : undefined }]}
          onStartShouldSetResponder={() => true}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={ctx.emojiScrollContainer} contentContainerStyle={ctx.emojiRow}>
            {QUICK_EMOJIS.map((emoji) => {
              const uid = auth.currentUser?.uid;
              const reactions: Record<string, string[]> = message.reactions ?? {};
              const isActive = reactions[emoji]?.includes(uid ?? "") ?? false;
              return (
                <TouchableOpacity key={emoji}
                  style={[ctx.emojiBtn, isActive && ctx.emojiBtnActive]}
                  onPress={() => { onClose(); onReact(emoji); }} activeOpacity={0.7}>
                  <Text style={ctx.emoji}>{emoji}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={ctx.divider} />
          {canEdit && (
            <TouchableOpacity style={ctx.action} onPress={() => { onClose(); setTimeout(() => onEdit?.(), 150); }} activeOpacity={0.7}>
              <Text style={ctx.actionLabel}>Edit</Text>
              <Ionicons name="pencil-outline" size={18} color="#333" />
            </TouchableOpacity>
          )}
          {hasEditHistory && (
            <TouchableOpacity style={ctx.action} onPress={() => { onClose(); setTimeout(() => onViewEditHistory?.(), 150); }} activeOpacity={0.7}>
              <Text style={ctx.actionLabel}>Edit History</Text>
              <Ionicons name="time-outline" size={18} color="#333" />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={ctx.action} onPress={() => { onClose(); setTimeout(onReply, 150); }} activeOpacity={0.7}>
            <Text style={ctx.actionLabel}>Reply</Text>
            <Ionicons name="arrow-undo-outline" size={18} color="#333" />
          </TouchableOpacity>
          {!isMedia && (
            <TouchableOpacity style={ctx.action} onPress={() => { onClose(); setTimeout(onCopy, 150); }} activeOpacity={0.7}>
              <Text style={ctx.actionLabel}>Copy</Text>
              <Ionicons name="copy-outline" size={18} color="#333" />
            </TouchableOpacity>
          )}
          {isPhotoOrVideo && onSaveMedia && (
            <TouchableOpacity style={ctx.action} onPress={() => { onClose(); setTimeout(onSaveMedia, 150); }} activeOpacity={0.7}>
              <Text style={ctx.actionLabel}>{message.msgType === "video" ? "Save Video" : "Save Photo"}</Text>
              <Ionicons name="download-outline" size={18} color="#333" />
            </TouchableOpacity>
          )}
          <View style={ctx.divider} />
          <TouchableOpacity style={ctx.action} onPress={() => { onClose(); setTimeout(onDeleteForMe, 150); }} activeOpacity={0.7}>
            <Text style={[ctx.actionLabel, ctx.destructive]}>Delete for Me</Text>
            <Ionicons name="trash-outline" size={18} color="#ef4444" />
          </TouchableOpacity>
          {canDelAll && onDeleteForEveryone && (
            <TouchableOpacity style={ctx.action} onPress={() => { onClose(); setTimeout(onDeleteForEveryone, 150); }} activeOpacity={0.7}>
              <Text style={[ctx.actionLabel, ctx.destructive]}>Delete for Everyone</Text>
              <Ionicons name="trash-bin-outline" size={18} color="#ef4444" />
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const ctx = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  panel: {
    position: "absolute", backgroundColor: "#fff", borderRadius: 16, width: 270, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 24,
    elevation: 16, borderWidth: 1, borderColor: "#e8e8e8",
  },
  emojiScrollContainer: { backgroundColor: "#fafafa", flexGrow: 0 },
  emojiRow: { flexDirection: "row", paddingHorizontal: 10, paddingVertical: 14, alignItems: "center", gap: 4 },
  emojiBtn: { padding: 5, borderRadius: 20 },
  emojiBtnActive: { backgroundColor: "#e8eaf6" },
  emoji: { fontSize: 26 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "#ebebeb" },
  action: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 18, paddingVertical: 15,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#ebebeb", backgroundColor: "#fff",
  },
  actionLabel: { fontSize: 15, color: "#1a1a1a" },
  destructive: { color: "#ef4444" },
});

// ─── EditHistoryModal ─────────────────────────────────────────────────────────
function EditHistoryModal({ visible, history, onClose }: {
  visible: boolean; history: { text: string; editedAt: any }[]; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={eh.overlay} onPress={onClose}>
        <Pressable style={eh.panel}>
          <Text style={eh.heading}>Edit History</Text>
          <ScrollView>
            {[...history].reverse().map((entry, i) => (
              <View key={i} style={[eh.entry, i < history.length - 1 && eh.entryBorder]}>
                <Text style={eh.entryTime}>{formatMessageTime(entry.editedAt)}</Text>
                <Text style={eh.entryText}>{entry.text}</Text>
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity style={eh.closeBtn} onPress={onClose}>
            <Text style={eh.closeLabel}>Close</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const eh = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  panel: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36, maxHeight: "60%" },
  heading: { fontSize: 16, fontWeight: "700", color: "#111", marginBottom: 12 },
  entry: { paddingVertical: 10 },
  entryBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#eee" },
  entryTime: { fontSize: 11, color: "#999", marginBottom: 4 },
  entryText: { fontSize: 14, color: "#444" },
  closeBtn: { marginTop: 14, backgroundColor: "#f2f2f7", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  closeLabel: { fontSize: 15, fontWeight: "600", color: "#333" },
});

// ─── EditMessageModal — Android keyboard fix ──────────────────────────────────
function EditMessageModal({
  visible,
  initialText,
  onSave,
  onCancel,
}: {
  visible: boolean;
  initialText: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [androidKeyboardHeight, setAndroidKeyboardHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      setAndroidKeyboardHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      setAndroidKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (visible) setText(initialText);
  }, [visible, initialText]);

  const panelContent = (
    <>
      <Text style={editModal.heading}>Edit Message</Text>
      <TextInput
        style={editModal.input}
        value={text}
        onChangeText={setText}
        multiline
        autoFocus
        placeholder="Edit your message..."
        placeholderTextColor="#aaa"
      />
      <View style={editModal.row}>
        <TouchableOpacity style={editModal.cancelBtn} onPress={onCancel}>
          <Text style={editModal.cancelLabel}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[editModal.saveBtn, !text.trim() && { opacity: 0.4 }]}
          onPress={() => text.trim() && onSave(text.trim())}
          disabled={!text.trim()}
        >
          <Text style={editModal.saveLabel}>Save</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      {Platform.OS === "ios" ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior="padding"
          keyboardVerticalOffset={0}
        >
          <Pressable style={editModal.overlay} onPress={onCancel}>
            <Pressable style={editModal.panel}>{panelContent}</Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      ) : (
        <Pressable style={editModal.overlay} onPress={onCancel}>
          <Pressable
            style={[
              editModal.panel,
              androidKeyboardHeight > 0
                ? { marginBottom: androidKeyboardHeight }
                : undefined,
            ]}
          >
            {panelContent}
          </Pressable>
        </Pressable>
      )}
    </Modal>
  );
}

const editModal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  panel: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  heading: { fontSize: 16, fontWeight: "700", color: "#111", marginBottom: 12 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, backgroundColor: "#f5f5f5", minHeight: 80, color: "#111" },
  row: { flexDirection: "row", gap: 10, marginTop: 14 },
  cancelBtn: { flex: 1, backgroundColor: "#f2f2f7", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  cancelLabel: { fontSize: 15, fontWeight: "600", color: "#333" },
  saveBtn: { flex: 1, backgroundColor: NAVY, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  saveLabel: { fontSize: 15, fontWeight: "700", color: "#fff" },
});

// ─── ReplyBanner ──────────────────────────────────────────────────────────────
function ReplyBanner({ message, ownerName, onCancel }: { message: any; ownerName: string; onCancel: () => void; }) {
  const isMe = message.senderId === auth.currentUser?.uid || message.sender === "me";
  const preview =
    message.msgType === "photo" ? "📷 Photo"
    : message.msgType === "video" ? "🎬 Video"
    : message.msgType === "voice" ? "🎙️ Voice message"
    : message.text;
  return (
    <View style={rb.wrap}>
      <View style={rb.bar} />
      <View style={rb.content}>
        <Text style={rb.who}>{isMe ? "You" : ownerName}</Text>
        <Text style={rb.preview} numberOfLines={1}>{preview}</Text>
      </View>
      <TouchableOpacity onPress={onCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close" size={18} color="#666" />
      </TouchableOpacity>
    </View>
  );
}

const rb = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", backgroundColor: "#f0f0f5", paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#e0e0e0", gap: 10 },
  bar: { width: 3, borderRadius: 2, backgroundColor: NAVY, alignSelf: "stretch" },
  content: { flex: 1 },
  who: { fontSize: 12, fontWeight: "700", color: NAVY },
  preview: { fontSize: 12, color: "#555", marginTop: 1 },
});

// ─── ReactionsModal ───────────────────────────────────────────────────────────
function ReactionsModal({ visible, emoji, userIds, userInfoMap, onClose }: {
  visible: boolean; emoji: string; userIds: string[]; userInfoMap: Record<string, any>; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={reactModal.overlay} onPress={onClose}>
        <Pressable style={reactModal.panel}>
          <View style={reactModal.header}>
            <Text style={reactModal.emoji}>{emoji}</Text>
            <Pressable onPress={onClose} style={reactModal.closeBtn}>
              <Ionicons name="close" size={24} color="#333" />
            </Pressable>
          </View>
          <ScrollView style={reactModal.list}>
            {userIds.map((userId) => {
              const info = userInfoMap[userId];
              const rawName = info?.displayName || info?.username || "User";
              const name = rawName.includes("@") ? "User" : rawName;
              return (
                <View key={userId} style={reactModal.userRow}>
                  <AvatarWithFallback uri={resolveAvatar(info)} name={name} size={36} fallbackFontSize={16} />
                  <Text style={reactModal.userName}>{name}</Text>
                </View>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const reactModal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center" },
  panel: { backgroundColor: "#fff", borderRadius: 16, width: "80%", maxHeight: "60%", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  emoji: { fontSize: 32 },
  closeBtn: { padding: 8 },
  list: { maxHeight: 300 },
  userRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#eee" },
  userName: { fontSize: 14, color: "#111", fontWeight: "500" },
});

// ─── MultiSelect bars ─────────────────────────────────────────────────────────
function MultiSelectBar({ onCancel }: { count: number; onCancel: () => void; onDeleteForMe: () => void; onDeleteForEveryone: () => void; }) {
  return (
    <View style={msb.wrap}>
      <TouchableOpacity onPress={onCancel}><Text style={msb.cancelLabel}>Cancel</Text></TouchableOpacity>
      <Text style={msb.count}>Delete messages</Text>
      <View style={{ width: 60 }} />
    </View>
  );
}

function MultiSelectFooter({ count, onDeleteForMe, onDeleteForEveryone }: { count: number; onDeleteForMe: () => void; onDeleteForEveryone: () => void; }) {
  return (
    <View style={msb.footer}>
      <TouchableOpacity onPress={onDeleteForEveryone} style={msb.footerBtn}>
        <Text style={msb.footerLabel}>Delete for Everyone ({count})</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onDeleteForMe} style={[msb.footerBtn, msb.footerBtnSecondary]}>
        <Text style={[msb.footerLabel, msb.footerLabelSecondary]}>Delete for Me ({count})</Text>
      </TouchableOpacity>
    </View>
  );
}

const msb = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: NAVY, paddingHorizontal: 16, paddingVertical: 12 },
  cancelLabel: { color: "#fff", fontSize: 15 },
  count: { color: "#fff", fontWeight: "700", fontSize: 16 },
  footer: { backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#eee", paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  footerBtn: { backgroundColor: "#ef4444", borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  footerBtnSecondary: { backgroundColor: "#f2f2f7" },
  footerLabel: { fontSize: 15, fontWeight: "700", color: "#fff" },
  footerLabelSecondary: { color: "#333" },
});

// ─── VoiceRecordingBar ────────────────────────────────────────────────────────
function VoiceRecordingBar({ isRecording, duration, hasDraft, onStopRecord, onRetry, onSend, onCancel }: {
  isRecording: boolean; duration: number; hasDraft: boolean;
  onStopRecord: () => void; onRetry: () => void; onSend: () => void; onCancel: () => void;
}) {
  if (!isRecording && !hasDraft) return null;

  if (isRecording) {
    return (
      <View style={vr.bar}>
        <TouchableOpacity onPress={onCancel} style={vr.cancelBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="trash-outline" size={22} color="#ef4444" />
        </TouchableOpacity>
        <View style={vr.recordingPill}>
          <View style={vr.redDot} />
          <View style={vr.waveBars}>
            {Array.from({ length: 18 }).map((_, i) => (
              <View key={i} style={[vr.waveBar, { height: 6 + Math.sin(i * 0.8) * 6 }]} />
            ))}
          </View>
          <Text style={vr.duration}>{formatDuration(duration)}</Text>
        </View>
        <TouchableOpacity onPress={onStopRecord} style={vr.stopBtn}>
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={vr.bar}>
      <TouchableOpacity onPress={onRetry} style={vr.retryBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="refresh" size={20} color={NAVY} />
        <Text style={vr.retryLabel}>Retry</Text>
      </TouchableOpacity>
      <View style={vr.draftPill}>
        <Ionicons name="mic" size={15} color={NAVY} />
        <Text style={vr.draftLabel}>Voice message · {formatDuration(duration)}</Text>
      </View>
      <TouchableOpacity onPress={onSend} style={vr.sendBtn}>
        <Ionicons name="send" size={18} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const vr = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#eee", gap: 10 },
  cancelBtn: { padding: 4 },
  recordingPill: { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: "#f0f0f5", borderRadius: 24, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  redDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#ef4444" },
  waveBars: { flex: 1, flexDirection: "row", alignItems: "center", gap: 2 },
  waveBar: { width: 3, borderRadius: 2, backgroundColor: NAVY, opacity: 0.7 },
  duration: { fontSize: 13, fontWeight: "600", color: "#333", minWidth: 36, textAlign: "right" },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 4, padding: 4 },
  retryLabel: { fontSize: 13, color: NAVY, fontWeight: "600" },
  draftPill: { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: "#eef0fb", borderRadius: 24, paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
  draftLabel: { fontSize: 13, color: NAVY, fontWeight: "500", flexShrink: 1 },
  stopBtn: { backgroundColor: NAVY, width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center" },
  sendBtn: { backgroundColor: NAVY, width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center" },
});

// ─── PhotoBubble ──────────────────────────────────────────────────────────────
// Preserves the photo's natural aspect ratio (no longer forces a square crop),
// clamped between a min/max height so very tall or wide images stay readable.
function PhotoBubble({ uri, isMe }: { uri: string; isMe: boolean }) {
  const [fullscreen, setFullscreen] = useState(false);
  const [bubbleHeight, setBubbleHeight] = useState(MEDIA_BUBBLE_WIDTH);

  useEffect(() => {
    let cancelled = false;
    Image.getSize(
      uri,
      (w, h) => {
        if (cancelled || !w || !h) return;
        const ratio = w / h;
        const height = MEDIA_BUBBLE_WIDTH / ratio;
        setBubbleHeight(Math.min(Math.max(height, MEDIA_BUBBLE_MIN_HEIGHT), MEDIA_BUBBLE_MAX_HEIGHT));
      },
      () => { /* ignore errors, keep default square */ },
    );
    return () => { cancelled = true; };
  }, [uri]);

  return (
    <>
      <TouchableOpacity onPress={() => setFullscreen(true)} activeOpacity={0.92}
        style={[
          mediaBubble.wrap,
          isMe ? mediaBubble.wrapRight : mediaBubble.wrapLeft,
          { height: bubbleHeight },
        ]}>
        <Image source={{ uri }} style={mediaBubble.img} resizeMode="cover" />
      </TouchableOpacity>
      <Modal visible={fullscreen} transparent animationType="fade" onRequestClose={() => setFullscreen(false)}>
        <View style={mediaBubble.fullOverlay}>
          <View style={mediaBubble.fullHeader}>
            <Text style={mediaBubble.fullHeaderText}>Photo</Text>
            <TouchableOpacity onPress={() => setFullscreen(false)} style={mediaBubble.fullCloseBtn}>
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
          </View>
          <View style={mediaBubble.fullContent}>
            <Image source={{ uri }} style={mediaBubble.fullImg} resizeMode="contain" />
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─── VideoPlayerWrapper ───────────────────────────────────────────────────────
function VideoPlayerWrapper({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = false;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={mediaBubble.fullVideo}
      contentFit="contain"
      nativeControls
    />
  );
}

// ─── VideoBubble ──────────────────────────────────────────────────────────────
// Uses a non-square (portrait-leaning) default ratio for the thumbnail so video
// bubbles match the look of typical phone-recorded clips instead of a square.
function VideoBubble({ uri, isMe }: { uri: string; isMe: boolean }) {
  const [fullscreen, setFullscreen] = useState(false);
  const isBlob = uri?.startsWith("blob:");
  const bubbleHeight = MEDIA_BUBBLE_WIDTH * (4 / 3);

  return (
    <>
      <TouchableOpacity
        onPress={() => setFullscreen(true)}
        activeOpacity={0.92}
        style={[
          mediaBubble.wrap,
          isMe ? mediaBubble.wrapRight : mediaBubble.wrapLeft,
          { height: Math.min(bubbleHeight, MEDIA_BUBBLE_MAX_HEIGHT) },
        ]}
      >
        <View style={mediaBubble.videoThumb}>
          {!isBlob && Platform.OS !== "web" ? (
            <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : null}
          <View style={mediaBubble.playOverlay}>
            <View style={mediaBubble.playCircle}>
              <Ionicons name="play" size={24} color="#fff" />
            </View>
          </View>
        </View>
      </TouchableOpacity>
      <Modal visible={fullscreen} transparent animationType="fade" onRequestClose={() => setFullscreen(false)}>
        <View style={mediaBubble.fullOverlay}>
          <View style={mediaBubble.fullHeader}>
            <Text style={mediaBubble.fullHeaderText}>Video</Text>
            <TouchableOpacity onPress={() => setFullscreen(false)} style={mediaBubble.fullCloseBtn}>
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
          </View>
          <View style={mediaBubble.fullContent}>
            {fullscreen && <VideoPlayerWrapper uri={uri} />}
          </View>
          <View style={mediaBubble.fullFooter}>
            <Ionicons name="volume-medium" size={14} color="#aaa" />
            <Text style={mediaBubble.fullFooterText}>Use controls to play/pause</Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

const mediaBubble = StyleSheet.create({
  wrap: { borderRadius: 14, overflow: "hidden", width: MEDIA_BUBBLE_WIDTH },
  wrapRight: { borderBottomRightRadius: 4 },
  wrapLeft: { borderBottomLeftRadius: 4 },
  img: { width: "100%", height: "100%" },
  videoThumb: { width: "100%", height: "100%", backgroundColor: "#111", justifyContent: "center", alignItems: "center" },
  playOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.18)" },
  playCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center" },
  fullOverlay: { flex: 1, backgroundColor: "#000", justifyContent: "space-between" },
  fullHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 54, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#222" },
  fullHeaderText: { color: "white", fontSize: 16, fontWeight: "600" },
  fullCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#333", justifyContent: "center", alignItems: "center" },
  fullContent: { flex: 1, justifyContent: "center", alignItems: "center", width: "100%" },
  fullImg: { width: SCREEN_WIDTH, height: SCREEN_WIDTH * 1.2 },
  fullVideo: { width: SCREEN_WIDTH, aspectRatio: 16 / 9, backgroundColor: "#000" } as any,
  fullFooter: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 16, borderTopWidth: 1, borderTopColor: "#222" },
  fullFooterText: { color: "#aaa", fontSize: 12 },
  fullClose: { position: "absolute", top: 52, right: 20 },
});

// ─── VoiceMessageBubble ───────────────────────────────────────────────────────
function VoiceMessageBubble({ uri, duration: initialDuration, isMe }: { uri: string; duration?: number; isMe: boolean }) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(initialDuration ?? 0);

  const togglePlay = async () => {
    try {
      if (!sound) {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: false });
        const { sound: s } = await Audio.Sound.createAsync({ uri });
        s.setOnPlaybackStatusUpdate((status: any) => {
          if (status.isLoaded) {
            setPos(status.positionMillis / 1000);
            if (status.durationMillis) setDur(status.durationMillis / 1000);
            if (status.didJustFinish) { setPlaying(false); setPos(0); }
          }
        });
        setSound(s);
        await s.playAsync();
        setPlaying(true);
      } else if (playing) {
        await sound.pauseAsync();
        setPlaying(false);
      } else {
        await sound.playAsync();
        setPlaying(true);
      }
    } catch (err) {
      console.error("Voice playback error:", err);
    }
  };

  useEffect(() => () => { sound?.unloadAsync(); }, [sound]);

  const progress = dur > 0 ? Math.min(pos / dur, 1) : 0;

  return (
    <View style={[vm.wrap, isMe ? vm.wrapRight : vm.wrapLeft]}>
      <TouchableOpacity onPress={togglePlay} style={vm.playBtn} activeOpacity={0.8}>
        <Ionicons name={playing ? "pause" : "play"} size={18} color={isMe ? "#fff" : NAVY} />
      </TouchableOpacity>
      <View style={vm.trackArea}>
        <View style={vm.trackBg}>
          <View style={[vm.trackFill, { width: `${progress * 100}%`, backgroundColor: isMe ? "#fff" : NAVY }]} />
        </View>
        <Text style={[vm.timeLabel, { color: isMe ? "rgba(255,255,255,0.7)" : "#888" }]}>
          {formatDuration(playing && pos > 0 ? pos : dur)}
        </Text>
      </View>
      <Ionicons name="mic" size={13} color={isMe ? "rgba(255,255,255,0.5)" : "#bbb"} />
    </View>
  );
}

const vm = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 20, minWidth: 190, maxWidth: MEDIA_BUBBLE_WIDTH + 40 },
  wrapRight: { backgroundColor: NAVY, borderBottomRightRadius: 4 },
  wrapLeft: { backgroundColor: "#fff", borderBottomLeftRadius: 4, borderWidth: 1, borderColor: "#e5e7eb", shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  playBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.18)", justifyContent: "center", alignItems: "center" },
  trackArea: { flex: 1, gap: 4 },
  trackBg: { height: 3, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 2, overflow: "hidden" },
  trackFill: { height: "100%", borderRadius: 2 },
  timeLabel: { fontSize: 10, fontWeight: "500" },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ChatScreen() {
  const [presence, setPresence] = useState<PresenceData | null>(null);
  const router = useRouter();
  const { ownerUserId, itemId, itemTitle, itemImage } = useLocalSearchParams();
  const insets = useSafeAreaInsets();

  // ── Core state ──
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploadLabel, setUploadLabel] = useState("");
  const [ownerInfo, setOwnerInfo] = useState<any>(null);
  const [muteUntil, setMuteUntil] = useState<Date | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showSuggested, setShowSuggested] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(false);

  // ── Modals ──
  const [ctxVisible, setCtxVisible] = useState(false);
  const [ctxMessage, setCtxMessage] = useState<any>(null);
  const [ctxAnchorY, setCtxAnchorY] = useState(0);
  const [editingMessage, setEditingMessage] = useState<any>(null);
  const [editHistoryVisible, setEditHistoryVisible] = useState(false);
  const [editHistoryData, setEditHistoryData] = useState<any[]>([]);
  const [reactionsModalVisible, setReactionsModalVisible] = useState(false);
  const [reactionsModalEmoji, setReactionsModalEmoji] = useState("");
  const [reactionsModalUserIds, setReactionsModalUserIds] = useState<string[]>([]);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetOptions, setSheetOptions] = useState<SheetOption[]>([]);
  const [sheetTitle, setSheetTitle] = useState<string | undefined>();
  const [deleteConvModalVisible, setDeleteConvModalVisible] = useState(false);

  // ── Reply / multi-select ──
  const [replyTo, setReplyTo] = useState<any>(null);
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Voice recording ──
  const [isRecording, setIsRecording] = useState(false);
  const [voiceDuration, setVoiceDuration] = useState(0);
  const [voiceDraftUri, setVoiceDraftUri] = useState<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentUserId = auth.currentUser?.uid;
  const flatListRef = useRef<FlatList>(null);
  const isMuted = muteUntil !== null && new Date() < muteUntil;
  const showVoiceBar = isRecording || !!voiceDraftUri;

  const conversationId = useMemo(
    () => [currentUserId, ownerUserId as string].sort().join("_"),
    [currentUserId, ownerUserId],
  );

  // ── Resolve display name — strip emails ──
  const ownerName = useMemo(() => {
    if (ownerInfo?.firstName && ownerInfo?.lastName)
      return `${ownerInfo.firstName.trim()} ${ownerInfo.lastName.trim()}`;
    const raw =
      ownerInfo?.displayName?.trim() ||
      ownerInfo?.name?.trim() ||
      ownerInfo?.fullName?.trim() ||
      ownerInfo?.username?.trim() ||
      "";
    return raw.includes("@") ? "User" : raw || "User";
  }, [ownerInfo]);

  const presenceStatusText = presence?.isOnline
  ? "Active"
  : presence?.lastSeen
    ? formatLastSeen(presence.lastSeen)
    : "Offline";

  const presenceDotColor = presence?.isOnline ? "#4CAF50" : "#9aa";
  const ownerFirstName = useMemo(() => ownerName.split(" ")[0], [ownerName]);

  const avatarUri = resolveAvatar(ownerInfo);

  // ── Focus effect ──
  useFocusEffect(
    useCallback(() => {
      if (!currentUserId || !ownerUserId) return;
      let unsubscribe: (() => void) | null = null;

      const init = async () => {
        try {
          setLoading(true);
          const [info, convData] = await Promise.all([
            getUserInfo(ownerUserId as string).catch(() => null),
            getConversationData(conversationId).catch(() => null),
          ]);
          setOwnerInfo(info);
          const mutedTs = convData?.mutedBy?.[currentUserId!];
          if (mutedTs) {
            const until = toDate(mutedTs);
            setMuteUntil(until.getTime() > Date.now() ? until : null);
          } else {
            setMuteUntil(null);
          }
          await markConversationAsRead(conversationId, currentUserId!).catch(console.error);
          await markMessagesAsRead(conversationId, currentUserId!).catch(console.error);
        } catch (err) {
          console.error("Error loading chat metadata:", err);
        } finally {
          setLoading(false);
        }

        unsubscribe = subscribeToMessages(
          currentUserId!, ownerUserId as string,
          (newMessages) => {
            setMessages(newMessages);
            markConversationAsRead(conversationId, currentUserId!).catch(console.error);
            markMessagesAsRead(conversationId, currentUserId!).catch(console.error);
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
          },
        );
      };

      init();
      return () => { if (unsubscribe) unsubscribe(); };
    }, [currentUserId, ownerUserId, conversationId]),
  );

  useEffect(() => {
  if (!ownerUserId) return;
  const unsub = subscribeToPresence(ownerUserId as string, setPresence);
  return () => unsub();
  }, [ownerUserId]);
  // ── Keyboard listener ──
  useEffect(() => {
    if (Platform.OS === "web") return;
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // ── Build list items ──
  const listData = useMemo<ListItem[]>(() => {
    const result: ListItem[] = [];
    let lastDay: string | null = null;
    let lastClusterTime: Date | null = null;

    messages.forEach((msg) => {
      const msgDate = toDate(msg.timestamp);
      const day = dayKey(msg.timestamp);

      if (day !== lastDay && day !== "unknown") {
        result.push({ type: "dateSeparator", id: `datesep-${day}-${msg.id ?? Math.random()}`, date: formatDateLabel(msg.timestamp) });
        lastDay = day;
        lastClusterTime = null;
      }

      if (msgDate.getTime() !== 0) {
        const gapMs = lastClusterTime ? msgDate.getTime() - lastClusterTime.getTime() : Infinity;
        if (gapMs >= TIME_CLUSTER_MINUTES * 60 * 1000) {
          if (lastClusterTime !== null) {
            result.push({ type: "timeSeparator", id: `timesep-${msgDate.getTime()}-${msg.id ?? Math.random()}`, time: formatMessageTime(msg.timestamp) });
          }
          lastClusterTime = msgDate;
        }
      }
      result.push({ ...msg, type: "message" });
    });
    return result;
  }, [messages]);

  // ── Send text ──
  const sendMessageHandler = async (text: string) => {
    if (!text.trim() || !currentUserId || !ownerUserId) return;
    setInput(""); setReplyTo(null); setShowSuggested(false);
    try {
      setSending(true);
      await sendMessage(currentUserId, ownerUserId as string, text.trim(),
        itemId as string | undefined,
        replyTo ? { id: replyTo.id, text: replyTo.text, senderId: replyTo.senderId } : undefined,
      );
    } catch { Alert.alert("Error", "Failed to send message."); }
    finally { setSending(false); }
  };

  // ── Voice recording ──
  const startRecording = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) { Alert.alert("Permission required", "Microphone access is needed to record voice messages."); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setIsRecording(true);
      setVoiceDuration(0);
      recordTimerRef.current = setInterval(() => setVoiceDuration((d) => d + 1), 1000);
    } catch (err) {
      console.error("Failed to start recording", err);
      Alert.alert("Error", "Could not start recording.");
    }
  };

  const stopRecording = async () => {
    try {
      if (!recordingRef.current) return;
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      setVoiceDraftUri(uri ?? null);
      recordingRef.current = null;
    } catch (err) { console.error("Failed to stop recording", err); }
    finally {
      setIsRecording(false);
      if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    }
  };

  const cancelRecording = async () => {
    try {
      if (recordingRef.current) { await recordingRef.current.stopAndUnloadAsync(); recordingRef.current = null; }
    } catch { /* ignore */ }
    setIsRecording(false); setVoiceDuration(0); setVoiceDraftUri(null);
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
  };

  const retryRecording = () => { setVoiceDraftUri(null); setVoiceDuration(0); startRecording(); };

  const sendVoiceMessage = async () => {
    if (!voiceDraftUri || !currentUserId || !ownerUserId) return;
    const localUri = voiceDraftUri;
    const durationSnap = voiceDuration;
    setVoiceDraftUri(null); setVoiceDuration(0); setShowSuggested(false);
    try {
      setSending(true);
      setUploadLabel("Sending voice message…");

      let mediaUrl: string;

      if (Platform.OS === "web") {
        const response = await fetch(localUri);
        const blob = await response.blob();
        const formData = new FormData();
        formData.append("file", blob, "voice.webm");
        formData.append("upload_preset", "chat_media");
        formData.append("folder", "chat_media");
        const res = await fetch(
          `https://api.cloudinary.com/v1_1/dh97c25iz/video/upload`,
          { method: "POST", body: formData },
        );
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Cloudinary upload failed (${res.status}): ${errText}`);
        }
        const data = await res.json();
        mediaUrl = data.secure_url;
      } else {
        mediaUrl = await uploadToCloudinary(localUri, "video");
      }

      await sendMessage(
        currentUserId, ownerUserId as string, "",
        itemId as string | undefined,
        replyTo ? { id: replyTo.id, text: replyTo.text, senderId: replyTo.senderId } : undefined,
        { type: "voice", mediaUrl, duration: durationSnap },
      );
      setReplyTo(null);
    } catch (err) {
      console.error("Voice send error:", err);
      Alert.alert("Error", "Failed to send voice message.");
    } finally { setSending(false); setUploadLabel(""); }
  };

  // ── Media picker ──
  const handleMediaAttach = () => {
    if (Platform.OS === "web") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*,video/*";
      input.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const isVideo = file.type.startsWith("video/");
        await sendMediaMessageWeb(file, isVideo ? "video" : "photo");
      };
      input.click();
      return;
    }

    Alert.alert("Send Media", "Choose a source", [
      { text: "Camera (Photo)", onPress: () => pickMedia("camera", "photo") },
      { text: "Camera (Video)", onPress: () => pickMedia("camera", "video") },
      { text: "Photo Library", onPress: () => pickMedia("library", "photo") },
      { text: "Video Library", onPress: () => pickMedia("library", "video") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const sendMediaMessageWeb = async (file: File, mediaType: "photo" | "video") => {
    if (!currentUserId || !ownerUserId) return;
    setShowSuggested(false);
    try {
      setSending(true);
      setUploadLabel(mediaType === "photo" ? "Uploading photo…" : "Uploading video…");
      const cloudResource = mediaType === "photo" ? "image" : "video";
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", "chat_media");
      formData.append("folder", "chat_media");
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/dh97c25iz/${cloudResource}/upload`,
        { method: "POST", body: formData },
      );
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Cloudinary upload failed (${res.status}): ${errText}`);
      }
      const data = await res.json();
      const mediaUrl = data.secure_url;
      await sendMessage(
        currentUserId, ownerUserId as string, "",
        itemId as string | undefined,
        replyTo ? { id: replyTo.id, text: replyTo.text, senderId: replyTo.senderId } : undefined,
        { type: mediaType, mediaUrl },
      );
      setReplyTo(null);
    } catch (err) {
      console.error("Media send error:", err);
      Alert.alert("Error", `Failed to send ${mediaType}.`);
    } finally { setSending(false); setUploadLabel(""); }
  };

  const pickMedia = async (source: "camera" | "library", mediaType: "photo" | "video") => {
    try {
      let result: ImagePicker.ImagePickerResult;
      if (source === "camera") {
        const { granted } = await ImagePicker.requestCameraPermissionsAsync();
        if (!granted) { Alert.alert("Permission required", "Camera access is needed."); return; }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: mediaType === "photo" ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
          quality: 0.85, videoMaxDuration: 60,
        });
      } else {
        const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!granted) { Alert.alert("Permission required", "Photo library access is needed."); return; }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: mediaType === "photo" ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
          quality: 0.85, videoMaxDuration: 60,
        });
      }
      if (!result.canceled && result.assets[0]?.uri) {
        await sendMediaMessage(result.assets[0].uri, mediaType);
      }
    } catch (err) {
      console.error("Media picker error:", err);
      Alert.alert("Error", "Could not open media picker.");
    }
  };

  const sendMediaMessage = async (localUri: string, mediaType: "photo" | "video") => {
    if (!currentUserId || !ownerUserId) return;
    setShowSuggested(false);
    try {
      setSending(true);
      setUploadLabel(mediaType === "photo" ? "Uploading photo…" : "Uploading video…");
      const cloudResource = mediaType === "photo" ? "image" : "video";
      const mediaUrl = await uploadToCloudinary(localUri, cloudResource);
      await sendMessage(
        currentUserId, ownerUserId as string, "",
        itemId as string | undefined,
        replyTo ? { id: replyTo.id, text: replyTo.text, senderId: replyTo.senderId } : undefined,
        { type: mediaType, mediaUrl },
      );
      setReplyTo(null);
    } catch (err) {
      console.error("Media send error:", err);
      Alert.alert("Error", `Failed to send ${mediaType}.`);
    } finally { setSending(false); setUploadLabel(""); }
  };

  // ── Save media to device ──
  const handleSaveMedia = async (msg: any) => {
    if (Platform.OS === "web") {
      window.open(msg.mediaUrl, "_blank");
      return;
    }
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission required", "Media library access is needed to save files.");
        return;
      }
      const filename = `barterbayan_${Date.now()}.${msg.msgType === "video" ? "mp4" : "jpg"}`;
      const localUri = FileSystem.cacheDirectory + filename;
      await FileSystem.downloadAsync(msg.mediaUrl, localUri);
      await MediaLibrary.saveToLibraryAsync(localUri);
      Alert.alert("Saved!", `${msg.msgType === "video" ? "Video" : "Photo"} saved to your gallery.`);
    } catch (err) {
      console.error("Save media error:", err);
      Alert.alert("Error", "Failed to save media.");
    }
  };

  // ── Message actions ──
  const handleReact = async (msgId: string, emoji: string) => {
    try { await reactToMessage(conversationId, msgId, emoji, currentUserId!); }
    catch (err) { console.error("React error:", err); }
  };

  const handleEdit = async (msgId: string, newText: string) => {
    setEditingMessage(null);
    try { await editMessage(conversationId, msgId, newText); }
    catch { Alert.alert("Error", "Failed to edit message."); }
  };

  const handleDeleteForMe = async (msgId: string) => {
    try { await deleteMessageForMe(conversationId, msgId, currentUserId!); }
    catch { Alert.alert("Error", "Failed to delete message."); }
  };

  const handleDeleteForEveryone = async (msgId: string) => {
    try { await deleteMessageForEveryone(conversationId, msgId, currentUserId!); }
    catch { Alert.alert("Error", "Failed to delete message."); }
  };

  const handleMultiDeleteForMe = async () => {
    const ids = Array.from(selectedIds);
    setSelectedIds(new Set()); setMultiSelect(false);
    await Promise.all(ids.map((id) => deleteMessageForMe(conversationId, id, currentUserId!).catch(console.error)));
  };

  const handleMultiDeleteForEveryone = async () => {
    const ids = Array.from(selectedIds);
    setSelectedIds(new Set()); setMultiSelect(false);
    await Promise.all(ids.map((id) => deleteMessageForEveryone(conversationId, id, currentUserId!).catch(console.error)));
  };

  const toggleSelect = (msgId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId); else next.add(msgId);
      return next;
    });
  };

  const handleLongPress = (msg: any, pageY: number) => {
    if (msg.deletedForEveryone) return;
    if (multiSelect) { toggleSelect(msg.id); return; }
    setCtxAnchorY(pageY); setCtxMessage(msg); setCtxVisible(true);
  };

  const handleScrollToMessage = (msgId: string) => {
    const msgIndex = listData.findIndex((item) => item.id === msgId);
    if (msgIndex >= 0 && flatListRef.current) {
      flatListRef.current.scrollToIndex({ index: msgIndex, animated: true, viewPosition: 0.3 });
    }
  };

  const openSheet = (title: string | undefined, options: SheetOption[]) => {
    setSheetTitle(title); setSheetOptions(options); setSheetVisible(true);
  };

  // ── Menu ──
  const handleMenu = () => {
    const options: SheetOption[] = [];
    if (isMuted) {
      options.push({ label: "Unmute Notifications", icon: "notifications-outline",
        onPress: async () => {
          try { await unmuteConversation(conversationId, currentUserId!); setMuteUntil(null); }
          catch { Alert.alert("Error", "Failed to unmute."); }
        },
      });
    } else {
      options.push({ label: "Mute Notifications", icon: "notifications-off-outline", onPress: openMuteSheet });
    }
    options.push({ label: showTimestamps ? "Hide Timestamps" : "See Timestamps", icon: "time-outline", onPress: () => setShowTimestamps((v) => !v) });
    options.push({ label: "Select Messages", icon: "checkmark-circle-outline", onPress: () => setMultiSelect(true) });
    options.push({ label: "Archive", icon: "archive-outline",
      onPress: async () => {
        try { await archiveConversation(conversationId, currentUserId!); router.back(); }
        catch { Alert.alert("Error", "Failed to archive."); }
      },
    });
    options.push({ label: "Delete Conversation", icon: "trash-outline", destructive: true,
      onPress: () => setDeleteConvModalVisible(true),
    });
    openSheet(ownerName || "Options", options);
  };

  const confirmDeleteConversation = async () => {
    setDeleteConvModalVisible(false);
    try { await deleteConversation(conversationId, currentUserId!); router.back(); }
    catch { Alert.alert("Error", "Failed to delete."); }
  };

  const openMuteSheet = () => {
    const mute = async (ms: number) => {
      const until = new Date(Date.now() + ms);
      try { await muteConversation(conversationId, currentUserId!, until); setMuteUntil(until); }
      catch { Alert.alert("Error", "Failed to mute."); }
    };
    openSheet("Mute notifications for...", [
      { label: "15 minutes", icon: "time-outline", onPress: () => mute(15 * 60 * 1000) },
      { label: "1 hour", icon: "time-outline", onPress: () => mute(60 * 60 * 1000) },
      { label: "8 hours", icon: "time-outline", onPress: () => mute(8 * 60 * 60 * 1000) },
      { label: "24 hours", icon: "time-outline", onPress: () => mute(24 * 60 * 60 * 1000) },
      { label: "Until I change it", icon: "infinite-outline", onPress: () => mute(365 * 24 * 60 * 60 * 1000) },
    ]);
  };

  const handleBack = () => {
    try { router.replace("/(tabs)/inbox"); } catch { router.replace("/(tabs)"); }
  };

  // ── renderItem ──
  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === "dateSeparator") {
      return (
        <View style={styles.dateSep}>
          <View style={styles.dateSepLine} />
          <Text style={styles.dateSepText}>{item.date}</Text>
          <View style={styles.dateSepLine} />
        </View>
      );
    }
    if (item.type === "timeSeparator") {
      return <View style={styles.timeSep}><Text style={styles.timeSepText}>{item.time}</Text></View>;
    }

    const isMe = item.senderId === currentUserId || item.sender === "me";
    const timeStr = formatMessageTime(item.timestamp);
    const isSelected = selectedIds.has(item.id);
    const isDeletedForEveryone = item.deletedForEveryone === true;
    const isDeletedForMe = !isDeletedForEveryone && Array.isArray(item.deletedFor) && item.deletedFor.includes(currentUserId);
    if (isDeletedForMe) return null;

    const msgType = item.msgType ?? "text";
    const isPhoto = msgType === "photo";
    const isVideo = msgType === "video";
    const isVoice = msgType === "voice";
    const isMedia = isPhoto || isVideo || isVoice;

    return (
      <View style={styles.messageRow}>
        {multiSelect && (
          <View style={styles.checkboxCol}>
            <TouchableOpacity onPress={() => toggleSelect(item.id)}
              style={[styles.checkbox, isSelected && styles.checkboxSelected]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.bubbleArea, isMe ? styles.bubbleAreaRight : styles.bubbleAreaLeft]}>
          {!isMe && !multiSelect && (
            <View style={styles.msgAvatarWrap}>
              <AvatarWithFallback uri={avatarUri} name={ownerName} size={30} fallbackFontSize={13} />
            </View>
          )}

          <View style={isMe ? styles.myBubbleCol : styles.theirBubbleCol}>
            {item.replyTo && !isDeletedForEveryone && (
              <>
                <View style={styles.repliedToNotice}>
                  <Ionicons name="arrow-back" size={14} color="#666" />
                  <Text style={styles.repliedToText}>
                    {item.replyTo.senderId === currentUserId ? "You" : ownerFirstName} replied
                  </Text>
                </View>
                <TouchableOpacity onPress={() => item.replyTo?.id && handleScrollToMessage(item.replyTo.id)}
                  activeOpacity={0.7}
                  style={[styles.replyPreview, isMe ? styles.replyPreviewRight : styles.replyPreviewLeft]}>
                  <View style={styles.replyBar} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.replyWho} numberOfLines={1}>
                      {item.replyTo.senderId === currentUserId ? "You" : ownerFirstName}
                    </Text>
                    <Text style={styles.replyText} numberOfLines={1}>{item.replyTo.text}</Text>
                  </View>
                </TouchableOpacity>
              </>
            )}

            {isDeletedForEveryone ? (
              <View style={[styles.bubble, styles.deletedBubble]}>
                <Text style={[styles.bubbleText, styles.deletedText]}>
                  {isMe ? "You deleted a message" : `${ownerFirstName} deleted a message`}
                </Text>
              </View>
            ) : isPhoto ? (
              <Pressable onLongPress={(e) => handleLongPress(item, e.nativeEvent.pageY)}
                onPress={() => multiSelect && toggleSelect(item.id)} delayLongPress={350}>
                <PhotoBubble uri={item.mediaUrl} isMe={isMe} />
              </Pressable>
            ) : isVideo ? (
              <Pressable onLongPress={(e) => handleLongPress(item, e.nativeEvent.pageY)}
                onPress={() => multiSelect && toggleSelect(item.id)} delayLongPress={350}>
                <VideoBubble uri={item.mediaUrl} isMe={isMe} />
              </Pressable>
            ) : isVoice ? (
              <Pressable onLongPress={(e) => handleLongPress(item, e.nativeEvent.pageY)}
                onPress={() => multiSelect && toggleSelect(item.id)} delayLongPress={350}>
                <VoiceMessageBubble uri={item.mediaUrl} duration={item.duration} isMe={isMe} />
              </Pressable>
            ) : (
              <Pressable onLongPress={(e) => handleLongPress(item, e.nativeEvent.pageY)}
                onPress={() => multiSelect && toggleSelect(item.id)}
                style={[styles.bubble, isMe ? styles.myBubble : styles.theirBubble]}
                delayLongPress={350}>
                <Text style={[styles.bubbleText, isMe ? styles.myBubbleText : styles.theirBubbleText]}>
                  {item.text}
                </Text>
                {item.edited && (
                  <Text style={[styles.editedLabel, { color: isMe ? "rgba(255,255,255,0.6)" : "#aaa" }]}>
                    edited
                  </Text>
                )}
              </Pressable>
            )}

            {item.reactions && !isDeletedForEveryone && (
              <View style={[styles.reactionsRow, isMe ? styles.reactionsRight : styles.reactionsLeft]}>
                {Object.entries(item.reactions as Record<string, string[]>)
                  .filter(([, users]) => users.length > 0)
                  .map(([emoji, users]) => (
                    <TouchableOpacity key={emoji}
                      style={[styles.reactionBadge, (users as string[]).includes(currentUserId ?? "") && styles.reactionBadgeActive]}
                      onPress={() => { setReactionsModalEmoji(emoji); setReactionsModalUserIds(users as string[]); setReactionsModalVisible(true); }}
                      onLongPress={() => handleReact(item.id, emoji)}>
                      <Text style={styles.reactionEmoji}>{emoji}</Text>
                      {(users as string[]).length > 1 && <Text style={styles.reactionCount}>{(users as string[]).length}</Text>}
                    </TouchableOpacity>
                  ))}
              </View>
            )}

            {isMe && !isDeletedForEveryone && (
              <View style={styles.readIndicatorWrap}>
                <Ionicons name={item.read ? "checkmark-done" : "checkmark"} size={14} color={item.read ? NAVY : "#aaa"} />
              </View>
            )}
          </View>
        </View>

        {showTimestamps && !isDeletedForEveryone && (
          <View style={styles.timestampCol}>
            <Text style={styles.timestampText} numberOfLines={1}>{timeStr}</Text>
          </View>
        )}
      </View>
    );
  };

  // ── Loading ──
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerName}>Loading...</Text>
        </View>
        <View style={styles.centered}><ActivityIndicator size="large" color={NAVY} /></View>
      </SafeAreaView>
    );
  }

  const ctxIsMe = ctxMessage ? ctxMessage.senderId === currentUserId || ctxMessage.sender === "me" : false;

  // ── Resolve current user display name safely ──
  const myDisplayName = (() => {
    const raw = auth.currentUser?.displayName ?? "";
    return raw.includes("@") ? "You" : raw || "You";
  })();

  // ── Render ──
  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <BottomSheet visible={sheetVisible} title={sheetTitle} options={sheetOptions} onClose={() => setSheetVisible(false)} />
      <DeleteConversationModal visible={deleteConvModalVisible} onCancel={() => setDeleteConvModalVisible(false)} onConfirm={confirmDeleteConversation} />
      <UploadProgressModal visible={!!uploadLabel} label={uploadLabel} />

      <ReactionsModal
        visible={reactionsModalVisible} emoji={reactionsModalEmoji}
        userIds={reactionsModalUserIds}
        userInfoMap={{
          [currentUserId ?? ""]: { displayName: myDisplayName, photoURL: auth.currentUser?.photoURL },
          [ownerUserId as string]: ownerInfo,
        }}
        onClose={() => setReactionsModalVisible(false)}
      />

      <MessageContextMenu
        visible={ctxVisible} message={ctxMessage} isMe={ctxIsMe}
        senderName={ownerFirstName} anchorY={ctxAnchorY}
        onClose={() => setCtxVisible(false)}
        onReact={(emoji) => ctxMessage && handleReact(ctxMessage.id, emoji)}
        onReply={() => { setReplyTo(ctxMessage); setCtxMessage(null); }}
        onEdit={() => setEditingMessage(ctxMessage)}
        onCopy={() => { if (ctxMessage?.text) Clipboard.setString(ctxMessage.text); }}
        onViewEditHistory={() => { if (ctxMessage?.editHistory) { setEditHistoryData(ctxMessage.editHistory); setEditHistoryVisible(true); } }}
        onDeleteForMe={() => ctxMessage && handleDeleteForMe(ctxMessage.id)}
        onDeleteForEveryone={ctxIsMe ? () => ctxMessage && handleDeleteForEveryone(ctxMessage.id) : undefined}
        onSaveMedia={ctxMessage && ["photo", "video"].includes(ctxMessage.msgType) ? () => handleSaveMedia(ctxMessage) : undefined}
      />

      <EditHistoryModal visible={editHistoryVisible} history={editHistoryData} onClose={() => setEditHistoryVisible(false)} />
      {editingMessage && (
        <EditMessageModal visible initialText={editingMessage.text}
          onSave={(newText) => handleEdit(editingMessage.id, newText)}
          onCancel={() => setEditingMessage(null)} />
      )}

      {/* Header */}
      {multiSelect ? (
        <MultiSelectBar count={selectedIds.size}
          onCancel={() => { setMultiSelect(false); setSelectedIds(new Set()); }}
          onDeleteForMe={handleMultiDeleteForMe} onDeleteForEveryone={handleMultiDeleteForEveryone} />
      ) : (
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="white" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerContent}
            onPress={() => router.push({ pathname: "/user-profile", params: { userId: ownerUserId as string } })}
            activeOpacity={0.85}>
            <AvatarWithFallback uri={avatarUri} name={ownerName} size={40} style={styles.headerAvatar} fallbackFontSize={18} />
            <View style={styles.headerInfo}>
              <View style={styles.headerNameRow}>
                <Text style={styles.headerName} numberOfLines={1}>{ownerName}</Text>
                {isMuted && (
                  <View style={styles.mutedBadge}>
                    <Ionicons name="notifications-off" size={11} color="#fff" />
                    <Text style={styles.mutedBadgeText}>Muted</Text>
                  </View>
                )}
              </View>
              <View style={styles.headerStatusRow}>
                <View style={[styles.headerStatusDot, { backgroundColor: presenceDotColor }]} />
                <Text style={styles.headerStatus} numberOfLines={1}>
                  {presenceStatusText}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleMenu} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="ellipsis-vertical" size={20} color="white" />
          </TouchableOpacity>
        </View>
      )}

      {/* Marketplace listing card — shown when arriving from a trade offer / listing chat */}
      {itemTitle && !multiSelect && (
        <View style={styles.offerCard}>
          {itemImage ? (
            <Image source={{ uri: itemImage as string }} style={styles.offerImage} resizeMode="cover" />
          ) : null}
          <View style={styles.offerTextWrap}>
            <Text style={styles.offerLabel}>Marketplace listing</Text>
            <Text style={styles.offerTitle} numberOfLines={2}>{itemTitle as string}</Text>
          </View>
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}>

        <FlatList
          ref={flatListRef}
          data={listData}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.messagesList,
            Platform.OS === "android" && keyboardHeight > 0 ? { paddingBottom: keyboardHeight - 10 } : {},
          ]}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          onScrollToIndexFailed={(info) => {
            setTimeout(() => flatListRef.current?.scrollToIndex({ index: info.index, animated: true }), 200);
          }}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Text style={styles.emptyChatText}>No messages yet. Say hello!</Text>
            </View>
          }
        />

        {showSuggested && messages.length === 0 && !multiSelect && (
          <View style={styles.suggestedContainer}>
            <Text style={styles.suggestedTitle}>Suggested messages:</Text>
            <View style={styles.suggestedButtons}>
              {SUGGESTED_MESSAGES.map((msg, i) => (
                <TouchableOpacity key={i} style={styles.suggestedButton} onPress={() => sendMessageHandler(msg)} activeOpacity={0.7}>
                  <Text style={styles.suggestedButtonText}>{msg}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {multiSelect && selectedIds.size > 0 && (
          <MultiSelectFooter count={selectedIds.size} onDeleteForMe={handleMultiDeleteForMe} onDeleteForEveryone={handleMultiDeleteForEveryone} />
        )}

        {replyTo && !multiSelect && (
          <ReplyBanner message={replyTo} ownerName={ownerFirstName} onCancel={() => setReplyTo(null)} />
        )}

        {!multiSelect && showVoiceBar && (
          <VoiceRecordingBar
            isRecording={isRecording} duration={voiceDuration} hasDraft={!!voiceDraftUri}
            onStopRecord={stopRecording} onRetry={retryRecording}
            onSend={sendVoiceMessage} onCancel={cancelRecording}
          />
        )}

        {!multiSelect && !showVoiceBar && (
          <View style={[styles.inputBar, { paddingBottom: Math.max(10, insets.bottom) }]}>
            <TouchableOpacity onPress={handleMediaAttach} style={styles.attachBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="add-circle-outline" size={26} color={NAVY} />
            </TouchableOpacity>

            <TextInput
              style={styles.input}
              placeholder="Message"
              placeholderTextColor="#aaa"
              value={input}
              onChangeText={setInput}
              editable={!sending}
              multiline
              returnKeyType="send"
              onSubmitEditing={() => sendMessageHandler(input)}
            />

            {input.trim().length === 0 ? (
              <TouchableOpacity style={styles.sendBtn} onPress={startRecording} activeOpacity={0.8}>
                <Ionicons name="mic" size={20} color="white" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
                onPress={() => sendMessageHandler(input)} disabled={sending} activeOpacity={0.8}>
                {sending
                  ? <ActivityIndicator size="small" color="white" />
                  : <Ionicons name="send" size={18} color="white" />}
              </TouchableOpacity>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f7" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", backgroundColor: NAVY, paddingHorizontal: 14, paddingVertical: 10, paddingTop: 32, gap: 10 },
  backBtn: { padding: 2 },
  headerContent: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  headerAvatar: {},
  headerInfo: { flex: 1 },
  headerNameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "nowrap" },
  headerName: { color: "white", fontWeight: "700", fontSize: 15, flexShrink: 1 },
  headerStatus: { color: "#ccc", fontSize: 11, marginTop: 1 },
  mutedBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, gap: 3 },
  mutedBadgeText: { color: "#fff", fontSize: 10, fontWeight: "600" },
  offerCard: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#eee", gap: 10 },
  offerImage: { width: 44, height: 44, borderRadius: 8, backgroundColor: "#eee" },
  offerTextWrap: { flex: 1 },
  offerLabel: { fontSize: 11, color: "#999", marginBottom: 2 },
  offerTitle: { fontSize: 14, fontWeight: "700", color: "#111" },
  messagesList: { paddingVertical: 12, paddingHorizontal: 8, paddingBottom: 100, flexGrow: 1 },
  emptyChat: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 60 },
  emptyChatText: { color: "#aaa", fontSize: 14 },
  dateSep: { flexDirection: "row", alignItems: "center", marginVertical: 12, gap: 8 },
  dateSepLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: "#d1d5db" },
  dateSepText: { fontSize: 11, color: "#9ca3af", fontWeight: "600" },
  timeSep: { alignItems: "center", marginVertical: 8 },
  timeSepText: { fontSize: 11, color: "#9ca3af", fontWeight: "500" },
  messageRow: { flexDirection: "row", alignItems: "stretch", marginBottom: 2, paddingHorizontal: 4 },
  checkboxCol: { justifyContent: "center", alignItems: "center", width: 36, flexShrink: 0 },
  bubbleArea: { flex: 1, flexDirection: "row", alignItems: "flex-end", minWidth: 0 },
  bubbleAreaLeft: { justifyContent: "flex-start" },
  bubbleAreaRight: { justifyContent: "flex-end" },
  timestampCol: { alignItems: "flex-end", justifyContent: "flex-end", paddingLeft: 6, paddingBottom: 2, flexShrink: 0, minWidth: 44, maxWidth: 68 },
  timestampText: { fontSize: 11, color: "#999", fontWeight: "500", textAlign: "right" },
  msgAvatarWrap: { marginRight: 6, flexShrink: 0 },
  myBubbleCol: { alignItems: "flex-end", maxWidth: "85%", minWidth: 0 },
  theirBubbleCol: { alignItems: "flex-start", maxWidth: "85%", minWidth: 0 },
  replyPreview: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 3, maxWidth: "100%" },
  replyPreviewRight: { backgroundColor: "rgba(47,47,111,0.08)" },
  replyPreviewLeft: { backgroundColor: "rgba(0,0,0,0.05)" },
  replyBar: { width: 3, borderRadius: 2, backgroundColor: NAVY, alignSelf: "stretch" },
  replyWho: { fontSize: 11, fontWeight: "700", color: NAVY },
  replyText: { fontSize: 11, color: "#555", flex: 1 },
  bubble: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 18 },
  myBubble: { backgroundColor: NAVY, borderBottomRightRadius: 4 },
  theirBubble: { backgroundColor: "#fff", borderBottomLeftRadius: 4, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  deletedBubble: { backgroundColor: "#e5e5ea" },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  myBubbleText: { color: "#fff" },
  theirBubbleText: { color: "#111" },
  deletedText: { color: "#8e8e93", fontStyle: "italic" },
  editedLabel: { fontSize: 10, marginTop: 2 },
  reactionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 3 },
  reactionsRight: { justifyContent: "flex-end" },
  reactionsLeft: { justifyContent: "flex-start" },
  reactionBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: "#e5e7eb", gap: 3 },
  reactionBadgeActive: { backgroundColor: "#eef0fb", borderColor: NAVY },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 11, fontWeight: "600", color: "#555" },
  readIndicatorWrap: { marginTop: 3, alignItems: "flex-end" },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#aaa", justifyContent: "center", alignItems: "center" },
  checkboxSelected: { backgroundColor: NAVY, borderColor: NAVY },
  repliedToNotice: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  repliedToText: { fontSize: 11, color: "#888", fontWeight: "500" },
  suggestedContainer: { paddingHorizontal: 12, paddingVertical: 12, backgroundColor: "#f9fafb", borderTopWidth: 1, borderTopColor: "#e5e7eb" },
  suggestedTitle: { fontSize: 12, fontWeight: "600", color: "#6b7280", marginBottom: 8 },
  suggestedButtons: { gap: 6 },
  suggestedButton: { backgroundColor: "white", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#e5e7eb" },
  suggestedButtonText: { fontSize: 13, fontWeight: "500", color: NAVY },
  inputBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 10, backgroundColor: "white", borderTopWidth: 1, borderTopColor: "#eee", gap: 8 },
  attachBtn: { padding: 2 },
  input: { flex: 1, borderWidth: 1, borderColor: "#ddd", borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, backgroundColor: "#f5f5f5", maxHeight: 100 },
  sendBtn: { backgroundColor: NAVY, width: 42, height: 42, borderRadius: 21, justifyContent: "center", alignItems: "center" },
  sendBtnDisabled: { opacity: 0.4 },
  headerStatusRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 1 },
  headerStatusDot: { width: 7, height: 7, borderRadius: 3.5 },
});