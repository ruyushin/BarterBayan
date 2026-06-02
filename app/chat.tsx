
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
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
  unmuteConversation
} from "../services/messagingService";

const NAVY = "#2e2d7c";
const EDIT_WINDOW_MS = 10 * 60 * 1000;
const DELETE_WINDOW_MS = 15 * 60 * 1000;

const SUGGESTED_MESSAGES = [
  "Is this still available?",
  "Is this negotiable?",
  "When can we meet?",
];

const AVATAR_COLORS = [
  "#e05c5c",
  "#e07a5c",
  "#5c7ae0",
  "#5cb8e0",
  "#7a5ce0",
  "#5ce07a",
];

const QUICK_EMOJIS = ["❤️", "😆", "😮", "😢", "😡", "👍"];

interface SheetOption {
  label: string;
  icon: string;
  destructive?: boolean;
  onPress: () => void;
}

type ListItem =
  | { type: "separator"; id: string; date: string }
  | { type: "message"; id: string; [key: string]: any };

const toDate = (timestamp: any): Date => {
  if (!timestamp) return new Date(0);
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp.toDate === "function") return timestamp.toDate();
  if (typeof timestamp.seconds === "number")
    return new Date(timestamp.seconds * 1000);
  const parsed = new Date(timestamp);
  return isNaN(parsed.getTime()) ? new Date(0) : parsed;
};

const formatMessageTime = (timestamp: any): string => {
  if (!timestamp) return "";
  const date = toDate(timestamp);
  if (date.getTime() === 0) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const formatDateLabel = (timestamp: any): string => {
  const date = toDate(timestamp);
  if (date.getTime() === 0) return "";
  const now = new Date();
  const todayMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const msgMidnight = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const diffDays = Math.round(
    (todayMidnight.getTime() - msgMidnight.getTime()) / 86400000,
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString([], {
    month: "long",
    day: "numeric",
    year: diffDays > 365 ? "numeric" : undefined,
  });
};

const dayKey = (timestamp: any): string => {
  const date = toDate(timestamp);
  if (date.getTime() === 0) return "unknown";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

const letterAvatarColor = (name: string): string => {
  const index = (name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
};

const resolveAvatar = (info: any): string | null => {
  const url =
    info?.avatarUrl ||
    info?.photoURL ||
    info?.profileImage ||
    info?.avatar ||
    info?.profilePicture ||
    info?.photo ||
    info?.picture ||
    null;
  if (url && typeof url === "string" && url.startsWith("http")) return url;
  return null;
};

const withinWindow = (timestamp: any, windowMs: number): boolean => {
  const date = toDate(timestamp);
  if (date.getTime() === 0) return false;
  return Date.now() - date.getTime() < windowMs;
};

function AvatarWithFallback({
  uri,
  name,
  size,
  style,
  fallbackFontSize,
}: {
  uri: string | null;
  name: string;
  size: number;
  style?: any;
  fallbackFontSize?: number;
}) {
  const [failed, setFailed] = useState(false);
  const initials = (name || "?").charAt(0).toUpperCase();
  const bg = letterAvatarColor(name || "?");
  const baseStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: "#ddd",
  };

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[baseStyle, style]}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View
      style={[
        baseStyle,
        { backgroundColor: bg, justifyContent: "center", alignItems: "center" },
        style,
      ]}
    >
      <Text
        style={{
          color: "#fff",
          fontSize: fallbackFontSize ?? size * 0.42,
          fontWeight: "700",
        }}
      >
        {initials}
      </Text>
    </View>
  );
}

function BottomSheet({
  visible,
  title,
  options,
  onClose,
}: {
  visible: boolean;
  title?: string;
  options: SheetOption[];
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={sheet.overlay} onPress={onClose}>
        <Pressable style={sheet.panel}>
          {title ? <Text style={sheet.title}>{title}</Text> : null}
          {options.map((opt, i) => (
            <TouchableOpacity
              key={i}
              style={[
                sheet.option,
                i < options.length - 1 && sheet.optionBorder,
              ]}
              onPress={() => {
                onClose();
                setTimeout(opt.onPress, 200);
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name={opt.icon as any}
                size={20}
                color={opt.destructive ? "#ef4444" : NAVY}
                style={sheet.optionIcon}
              />
              <Text
                style={[
                  sheet.optionLabel,
                  opt.destructive && sheet.optionDestructive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={sheet.cancelBtn}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={sheet.cancelLabel}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const sheet = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  panel: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },
  title: { fontSize: 13, color: "#999", textAlign: "center", marginBottom: 8 },
  option: { flexDirection: "row", alignItems: "center", paddingVertical: 15 },
  optionBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e5e5",
  },
  optionIcon: { marginRight: 14 },
  optionLabel: { fontSize: 16, color: "#111" },
  optionDestructive: { color: "#ef4444" },
  cancelBtn: {
    marginTop: 8,
    backgroundColor: "#f2f2f7",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelLabel: { fontSize: 16, fontWeight: "600", color: "#333" },
});

function MessageContextMenu({
  visible,
  message,
  isMe,
  senderName,
  onClose,
  onReact,
  onReply,
  onEdit,
  onCopy,
  onViewEditHistory,
  onDeleteForMe,
  onDeleteForEveryone,
}: {
  visible: boolean;
  message: any;
  isMe: boolean;
  senderName: string;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onEdit?: () => void;
  onCopy: () => void;
  onViewEditHistory?: () => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone?: () => void;
}) {
  if (!message) return null;
  const canEdit = isMe && withinWindow(message.timestamp, EDIT_WINDOW_MS);
  const canDelAll = isMe && withinWindow(message.timestamp, DELETE_WINDOW_MS);
  const hasEditHistory = message.editHistory && message.editHistory.length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={ctx.overlay} onPress={onClose}>
        <Pressable style={ctx.panel}>
          <View style={ctx.emojiRow}>
            {QUICK_EMOJIS.map((emoji) => {
              const currentUserId = auth.currentUser?.uid;
              const reactions: Record<string, string[]> =
                message.reactions ?? {};
              const iActive =
                reactions[emoji]?.includes(currentUserId ?? "") ?? false;
              return (
                <TouchableOpacity
                  key={emoji}
                  style={[ctx.emojiBtn, iActive && ctx.emojiBtnActive]}
                  onPress={() => {
                    onClose();
                    onReact(emoji);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={ctx.emoji}>{emoji}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={ctx.divider} />
          {canEdit && (
            <TouchableOpacity
              style={ctx.action}
              onPress={() => {
                onClose();
                setTimeout(() => onEdit?.(), 150);
              }}
              activeOpacity={0.7}
            >
              <Text style={ctx.actionLabel}>Edit</Text>
              <Ionicons name="pencil-outline" size={18} color="#333" />
            </TouchableOpacity>
          )}
          {hasEditHistory && (
            <TouchableOpacity
              style={ctx.action}
              onPress={() => {
                onClose();
                setTimeout(() => onViewEditHistory?.(), 150);
              }}
              activeOpacity={0.7}
            >
              <Text style={ctx.actionLabel}>Edit History</Text>
              <Ionicons name="time-outline" size={18} color="#333" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={ctx.action}
            onPress={() => {
              onClose();
              setTimeout(onReply, 150);
            }}
            activeOpacity={0.7}
          >
            <Text style={ctx.actionLabel}>Reply</Text>
            <Ionicons name="arrow-undo-outline" size={18} color="#333" />
          </TouchableOpacity>
          <TouchableOpacity
            style={ctx.action}
            onPress={() => {
              onClose();
              setTimeout(onCopy, 150);
            }}
            activeOpacity={0.7}
          >
            <Text style={ctx.actionLabel}>Copy</Text>
            <Ionicons name="copy-outline" size={18} color="#333" />
          </TouchableOpacity>
          <View style={ctx.divider} />
          <TouchableOpacity
            style={ctx.action}
            onPress={() => {
              onClose();
              setTimeout(onDeleteForMe, 150);
            }}
            activeOpacity={0.7}
          >
            <Text style={[ctx.actionLabel, ctx.destructive]}>
              Delete for Me
            </Text>
            <Ionicons name="trash-outline" size={18} color="#ef4444" />
          </TouchableOpacity>
          {canDelAll && onDeleteForEveryone && (
            <TouchableOpacity
              style={ctx.action}
              onPress={() => {
                onClose();
                setTimeout(onDeleteForEveryone, 150);
              }}
              activeOpacity={0.7}
            >
              <Text style={[ctx.actionLabel, ctx.destructive]}>
                Delete for Everyone
              </Text>
              <Ionicons name="trash-bin-outline" size={18} color="#ef4444" />
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const ctx = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  panel: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    width: 270,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 16,
    borderWidth: 1,
    borderColor: "#e8e8e8",
  },
  emojiRow: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingVertical: 14,
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fafafa",
  },
  emojiBtn: { padding: 5, borderRadius: 20, backgroundColor: "transparent" },
  emojiBtnActive: { backgroundColor: "#e8eaf6" },
  emoji: { fontSize: 26 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "#ebebeb" },
  action: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ebebeb",
    backgroundColor: "#fff",
  },
  actionLabel: { fontSize: 15, color: "#1a1a1a" },
  destructive: { color: "#ef4444" },
});

function EditHistoryModal({
  visible,
  history,
  onClose,
}: {
  visible: boolean;
  history: { text: string; editedAt: any }[];
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={eh.overlay} onPress={onClose}>
        <Pressable style={eh.panel}>
          <Text style={eh.heading}>Edit History</Text>
          <ScrollView>
            {[...history].reverse().map((entry, i) => (
              <View
                key={i}
                style={[eh.entry, i < history.length - 1 && eh.entryBorder]}
              >
                <Text style={eh.entryTime}>
                  {formatMessageTime(entry.editedAt)}
                </Text>
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
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  panel: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
    maxHeight: "60%",
  },
  heading: { fontSize: 16, fontWeight: "700", color: "#111", marginBottom: 12 },
  entry: { paddingVertical: 10 },
  entryBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  entryTime: { fontSize: 11, color: "#999", marginBottom: 4 },
  entryText: { fontSize: 14, color: "#444" },
  closeBtn: {
    marginTop: 14,
    backgroundColor: "#f2f2f7",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  closeLabel: { fontSize: 15, fontWeight: "600", color: "#333" },
});

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
  useEffect(() => {
    if (visible) setText(initialText);
  }, [visible, initialText]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={editModal.overlay} onPress={onCancel}>
          <Pressable style={editModal.panel}>
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
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const editModal = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  panel: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  heading: { fontSize: 16, fontWeight: "700", color: "#111", marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: "#f5f5f5",
    minHeight: 80,
    color: "#111",
  },
  row: { flexDirection: "row", gap: 10, marginTop: 14 },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#f2f2f7",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelLabel: { fontSize: 15, fontWeight: "600", color: "#333" },
  saveBtn: {
    flex: 1,
    backgroundColor: NAVY,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  saveLabel: { fontSize: 15, fontWeight: "700", color: "#fff" },
});

function ReplyBanner({
  message,
  ownerName,
  onCancel,
}: {
  message: any;
  ownerName: string;
  onCancel: () => void;
}) {
  const isMe =
    message.senderId === auth.currentUser?.uid || message.sender === "me";
  return (
    <View style={rb.wrap}>
      <View style={rb.bar} />
      <View style={rb.content}>
        <Text style={rb.who}>{isMe ? "You" : ownerName}</Text>
        <Text style={rb.preview} numberOfLines={1}>
          {message.text}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onCancel}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="close" size={18} color="#666" />
      </TouchableOpacity>
    </View>
  );
}

const rb = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0f0f5",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
    gap: 10,
  },
  bar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: NAVY,
    alignSelf: "stretch",
  },
  content: { flex: 1 },
  who: { fontSize: 12, fontWeight: "700", color: NAVY },
  preview: { fontSize: 12, color: "#555", marginTop: 1 },
});

function ReactionsModal({
  visible,
  emoji,
  userIds,
  userInfoMap,
  onClose,
}: {
  visible: boolean;
  emoji: string;
  userIds: string[];
  userInfoMap: Record<string, any>;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={reactionsModal.overlay} onPress={onClose}>
        <Pressable style={reactionsModal.panel}>
          <View style={reactionsModal.header}>
            <Text style={reactionsModal.emoji}>{emoji}</Text>
            <Pressable onPress={onClose} style={reactionsModal.closeBtn}>
              <Ionicons name="close" size={24} color="#333" />
            </Pressable>
          </View>
          <ScrollView style={reactionsModal.list}>
            {userIds.map((userId) => {
              const info = userInfoMap[userId];
              const name = info?.displayName || info?.username || "User";
              const avatar = resolveAvatar(info);
              return (
                <View key={userId} style={reactionsModal.userRow}>
                  <AvatarWithFallback
                    uri={avatar}
                    name={name}
                    size={36}
                    fallbackFontSize={16}
                  />
                  <Text style={reactionsModal.userName}>{name}</Text>
                </View>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const reactionsModal = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  panel: {
    backgroundColor: "#fff",
    borderRadius: 16,
    width: "80%",
    maxHeight: "60%",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  emoji: { fontSize: 32 },
  closeBtn: { padding: 8 },
  list: { maxHeight: 300 },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  userName: { fontSize: 14, color: "#111", fontWeight: "500" },
});

function SwipeableMessage({
  children,
  onSwipeReply,
  isMe,
  timeStr,
  readStatus,
}: {
  children: React.ReactNode;
  onSwipeReply: () => void;
  isMe: boolean;
  timeStr?: string;
  readStatus?: boolean;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const triggered = useRef(false);
  const THRESHOLD = 60;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_: any, gs: any) =>
        Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
      onPanResponderMove: (_: any, gs: any) => {
        if (gs.dx < 0) {
          const value = Math.max(gs.dx, -(THRESHOLD + 20));
          translateX.setValue(value);
        }
      },
      onPanResponderRelease: (_: any, gs: any) => {
        if (gs.dx <= -THRESHOLD && !triggered.current) {
          triggered.current = true;
          onSwipeReply();
        }
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 10,
        }).start(() => {
          triggered.current = false;
        });
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start(() => {
          triggered.current = false;
        });
      },
    }),
  ).current;

  const opacity = translateX.interpolate({
    inputRange: [-THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  return (
    <View style={{ position: "relative" }}>
      <Animated.View
        {...panResponder.panHandlers}
        style={{ transform: [{ translateX }] }}
      >
        {children}
      </Animated.View>
      {timeStr && (
        <Animated.View
          style={[
            styles.swipeTimeOverlay,
            styles.swipeTimeRight,
            { opacity },
          ]}
        >
          <Text style={styles.swipeTimeText}>{timeStr}</Text>
          {isMe && (
            <Ionicons
              name={readStatus ? "checkmark-done" : "checkmark"}
              size={16}
              color="#999"
              style={{ marginLeft: 4 }}
            />
          )}
        </Animated.View>
      )}
    </View>
  );
}

function MultiSelectBar({
  count,
  onCancel,
  onDeleteForMe,
  onDeleteForEveryone,
}: {
  count: number;
  onCancel: () => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
}) {
  return (
    <View style={msb.wrap}>
      <TouchableOpacity onPress={onCancel} style={msb.cancelBtn}>
        <Text style={msb.cancelLabel}>Cancel</Text>
      </TouchableOpacity>
      <Text style={msb.count}>Delete messages</Text>
      <View style={{ width: 60 }} />
    </View>
  );
}

function MultiSelectFooter({
  count,
  onDeleteForMe,
  onDeleteForEveryone,
}: {
  count: number;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
}) {
  return (
    <View style={msb.footer}>
      <TouchableOpacity onPress={onDeleteForEveryone} style={msb.footerBtn}>
        <Text style={msb.footerLabel}>Delete for Everyone ({count})</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onDeleteForMe}
        style={[msb.footerBtn, msb.footerBtnSecondary]}
      >
        <Text style={[msb.footerLabel, msb.footerLabelSecondary]}>
          Delete for Me ({count})
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const msb = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: NAVY,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cancelBtn: {},
  cancelLabel: { color: "#fff", fontSize: 15 },
  count: { color: "#fff", fontWeight: "700", fontSize: 16 },
  footer: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#eee",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  footerBtn: {
    backgroundColor: "#ef4444",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  footerBtnSecondary: { backgroundColor: "#f2f2f7" },
  footerLabel: { fontSize: 15, fontWeight: "700", color: "#fff" },
  footerLabelSecondary: { color: "#333" },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ChatScreen() {
  const router = useRouter();
  const { ownerUserId, itemId, itemTitle } = useLocalSearchParams();

  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [ownerInfo, setOwnerInfo] = useState<any>(null);
  const [currentUserInfo, setCurrentUserInfo] = useState<any>(null);
  const [showSuggested, setShowSuggested] = useState(true);
  const [muteUntil, setMuteUntil] = useState<Date | null>(null);
  const [ctxVisible, setCtxVisible] = useState(false);
  const [ctxMessage, setCtxMessage] = useState<any>(null);
  const [replyTo, setReplyTo] = useState<any>(null);
  const [editingMessage, setEditingMessage] = useState<any>(null);
  const [editHistoryVisible, setEditHistoryVisible] = useState(false);
  const [editHistoryData, setEditHistoryData] = useState<any[]>([]);
  const [reactionsModalVisible, setReactionsModalVisible] = useState(false);
  const [reactionsModalEmoji, setReactionsModalEmoji] = useState("");
  const [reactionsModalUserIds, setReactionsModalUserIds] = useState<string[]>([]);
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetOptions, setSheetOptions] = useState<SheetOption[]>([]);
  const [sheetTitle, setSheetTitle] = useState<string | undefined>();
  const [showAllTimestamps, setShowAllTimestamps] = useState(false);

  const messageLayoutsRef = useRef<Record<string, number>>({});
  const currentUserId = auth.currentUser?.uid;
  const flatListRef = useRef<FlatList>(null);
  const isMuted = muteUntil !== null && new Date() < muteUntil;
  const conversationSwipeRef = useRef(new Animated.Value(0)).current;

  // ── FIX: timestamps only show while the gesture is actively held ──
  const conversationPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_: any, gs: any) =>
        Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5 && gs.dx < 0,
      onPanResponderMove: (_: any, gs: any) => {
        if (gs.dx < 0) {
          const value = Math.min(80, -gs.dx);
          conversationSwipeRef.setValue(value);
          setShowAllTimestamps(true);
        }
      },
      onPanResponderRelease: () => {
        // Hide timestamps immediately on release
        setShowAllTimestamps(false);
        Animated.timing(conversationSwipeRef, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        // Also hide if gesture is stolen by scroll or anything else
        setShowAllTimestamps(false);
        Animated.timing(conversationSwipeRef, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  const conversationId = useMemo(
    () => [currentUserId, ownerUserId as string].sort().join("_"),
    [currentUserId, ownerUserId],
  );

  const ownerFirstName = useMemo(() => {
    const name = ownerInfo?.displayName || ownerInfo?.username || "User";
    return name.split(" ")[0];
  }, [ownerInfo]);

  const currentUserName = useMemo(() => {
    const name = currentUserInfo?.displayName || currentUserInfo?.username || "You";
    return name.split(" ")[0];
  }, [currentUserInfo]);

  useFocusEffect(
    useCallback(() => {
      if (!currentUserId || !ownerUserId) return;
      let unsubscribe: (() => void) | null = null;

      const init = async () => {
        try {
          setLoading(true);
          const [info, convData, curUserInfo] = await Promise.all([
            getUserInfo(ownerUserId as string).catch(() => null),
            getConversationData(conversationId).catch(() => null),
            currentUserId ? getUserInfo(currentUserId).catch(() => null) : Promise.resolve(null),
          ]);
          setOwnerInfo(info);
          setCurrentUserInfo(curUserInfo);
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
          currentUserId!,
          ownerUserId as string,
          (newMessages) => {
            setMessages(newMessages);
            markConversationAsRead(conversationId, currentUserId!).catch(console.error);
            markMessagesAsRead(conversationId, currentUserId!).catch(console.error);
            setTimeout(
              () => flatListRef.current?.scrollToEnd({ animated: true }),
              100,
            );
          },
        );
      };

      init();
      return () => {
        if (unsubscribe) unsubscribe();
      };
    }, [currentUserId, ownerUserId, conversationId]),
  );

  // ── FIX: only day separators, no hourly time separators ──
  const listData = useMemo<ListItem[]>(() => {
    const result: ListItem[] = [];
    let lastDay: string | null = null;

    messages.forEach((msg) => {
      const day = dayKey(msg.timestamp);

      if (day !== lastDay && day !== "unknown") {
        result.push({
          type: "separator",
          id: `sep-${day}-${msg.id ?? Math.random()}`,
          date: formatDateLabel(msg.timestamp),
        });
        lastDay = day;
      }

      result.push({ ...msg, type: "message" });
    });
    return result;
  }, [messages]);

  const sendMessageHandler = async (text: string) => {
    if (!text.trim() || !currentUserId || !ownerUserId) return;
    setInput("");
    setReplyTo(null);
    setShowSuggested(false);
    try {
      setSending(true);
      await sendMessage(
        currentUserId,
        ownerUserId as string,
        text.trim(),
        itemId as string | undefined,
        replyTo
          ? { id: replyTo.id, text: replyTo.text, senderId: replyTo.senderId }
          : undefined,
      );
    } catch (error) {
      console.error("Error sending message:", error);
      Alert.alert("Error", "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  const handleReact = async (msgId: string, emoji: string) => {
    try {
      await reactToMessage(conversationId, msgId, emoji, currentUserId!);
    } catch (err) {
      console.error("React error:", err);
    }
  };

  const handleEdit = async (msgId: string, newText: string) => {
    setEditingMessage(null);
    try {
      await editMessage(conversationId, msgId, newText);
    } catch (err) {
      console.error("Edit error:", err);
      Alert.alert("Error", "Failed to edit message.");
    }
  };

  const handleDeleteForMe = async (msgId: string) => {
    try {
      await deleteMessageForMe(conversationId, msgId, currentUserId!);
    } catch (err) {
      console.error("Delete for me error:", err);
      Alert.alert("Error", "Failed to delete message.");
    }
  };

  const handleDeleteForEveryone = async (msgId: string) => {
    try {
      await deleteMessageForEveryone(conversationId, msgId, currentUserId!);
    } catch (err) {
      console.error("Delete for everyone error:", err);
      Alert.alert("Error", "Failed to delete message.");
    }
  };

  const handleMultiDeleteForMe = async () => {
    const ids = Array.from(selectedIds);
    setSelectedIds(new Set());
    setMultiSelect(false);
    await Promise.all(
      ids.map((id) =>
        deleteMessageForMe(conversationId, id, currentUserId!).catch(console.error),
      ),
    );
  };

  const handleMultiDeleteForEveryone = async () => {
    const ids = Array.from(selectedIds);
    setSelectedIds(new Set());
    setMultiSelect(false);
    await Promise.all(
      ids.map((id) =>
        deleteMessageForEveryone(conversationId, id, currentUserId!).catch(console.error),
      ),
    );
  };

  const toggleSelect = (msgId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  const handleLongPress = (msg: any) => {
    if (msg.deletedForEveryone) return;
    if (multiSelect) {
      toggleSelect(msg.id);
      return;
    }
    setCtxMessage(msg);
    setCtxVisible(true);
  };

  const handleScrollToMessage = (msgId: string) => {
    const msgIndex = listData.findIndex((item) => item.id === msgId);
    if (msgIndex >= 0 && flatListRef.current) {
      flatListRef.current.scrollToIndex({
        index: msgIndex,
        animated: true,
        viewPosition: 0.3,
      });
    }
  };

  const openSheet = (title: string | undefined, options: SheetOption[]) => {
    setSheetTitle(title);
    setSheetOptions(options);
    setSheetVisible(true);
  };

  const handleMenu = () => {
    const options: SheetOption[] = [];
    if (isMuted) {
      options.push({
        label: "Unmute Notifications",
        icon: "notifications-outline",
        onPress: async () => {
          try {
            await unmuteConversation(conversationId, currentUserId!);
            setMuteUntil(null);
          } catch {
            Alert.alert("Error", "Failed to unmute.");
          }
        },
      });
    } else {
      options.push({
        label: "Mute Notifications",
        icon: "notifications-off-outline",
        onPress: openMuteSheet,
      });
    }
    options.push({
      label: "Select Messages",
      icon: "checkmark-circle-outline",
      onPress: () => setMultiSelect(true),
    });
    options.push({
      label: "Archive",
      icon: "archive-outline",
      onPress: async () => {
        try {
          await archiveConversation(conversationId, currentUserId!);
          router.back();
        } catch {
          Alert.alert("Error", "Failed to archive.");
        }
      },
    });
    options.push({
      label: "Delete Conversation",
      icon: "trash-outline",
      destructive: true,
      onPress: () => {
        Alert.alert("Delete Conversation", "All messages will be removed.", [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await deleteConversation(conversationId, currentUserId!);
                router.back();
              } catch {
                Alert.alert("Error", "Failed to delete.");
              }
            },
          },
        ]);
      },
    });
    openSheet(
      ownerInfo?.username || ownerInfo?.displayName || "Options",
      options,
    );
  };

  const openMuteSheet = () => {
    const mute = async (ms: number) => {
      const until = new Date(Date.now() + ms);
      try {
        await muteConversation(conversationId, currentUserId!, until);
        setMuteUntil(until);
      } catch {
        Alert.alert("Error", "Failed to mute.");
      }
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
    try {
      router.replace("/(tabs)/inbox");
    } catch {
      router.replace("/(tabs)");
    }
  };

  const avatarUri = resolveAvatar(ownerInfo);
  const ownerName = ownerInfo?.username || ownerInfo?.displayName || "User";

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === "separator") {
      return (
        <View style={styles.dateSep}>
          <View style={styles.dateSepLine} />
          <Text style={styles.dateSepText}>{item.date}</Text>
          <View style={styles.dateSepLine} />
        </View>
      );
    }

    const isMe = item.senderId === currentUserId || item.sender === "me";
    const timeStr = formatMessageTime(item.timestamp);
    const isSelected = selectedIds.has(item.id);
    const isDeletedForEveryone = item.deletedForEveryone === true;
    const isDeletedForMe =
      !isDeletedForEveryone &&
      Array.isArray(item.deletedFor) &&
      item.deletedFor.includes(currentUserId);

    if (isDeletedForMe) return null;

    const messageContent = (
      <View
        style={[styles.messageWrap, isMe ? styles.myWrap : styles.theirWrap]}
        onLayout={(e) => {
          messageLayoutsRef.current[item.id] = e.nativeEvent.layout.y;
        }}
      >
        {multiSelect && (
          <TouchableOpacity
            onPress={() => toggleSelect(item.id)}
            style={[styles.checkbox, isSelected && styles.checkboxSelected]}
          >
            {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
          </TouchableOpacity>
        )}
        {!isMe && !multiSelect && (
          <View style={styles.msgAvatarWrap}>
            <AvatarWithFallback
              uri={avatarUri}
              name={ownerName}
              size={30}
              fallbackFontSize={13}
            />
          </View>
        )}
        <View style={isMe ? styles.myBubbleCol : styles.theirBubbleCol}>
          {item.replyTo && !isDeletedForEveryone && (
            <View style={styles.repliedToNotice}>
              <Ionicons name="arrow-back" size={14} color="#666" />
              <Text style={styles.repliedToText}>
                {item.replyTo.senderId === currentUserId
                  ? "You"
                  : ownerFirstName} replied to you
              </Text>
            </View>
          )}
          {item.replyTo && !isDeletedForEveryone && (
            <TouchableOpacity
              onPress={() =>
                item.replyTo?.id && handleScrollToMessage(item.replyTo.id)
              }
              activeOpacity={0.7}
              style={[
                styles.replyPreview,
                isMe ? styles.replyPreviewRight : styles.replyPreviewLeft,
              ]}
            >
              <View style={styles.replyBar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.replyWho} numberOfLines={1}>
                  {item.replyTo.senderId === currentUserId
                    ? "You"
                    : ownerFirstName}
                </Text>
                <Text style={styles.replyText} numberOfLines={1}>
                  {item.replyTo.text}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          <Pressable
            onLongPress={() => handleLongPress(item)}
            onPress={() => multiSelect && toggleSelect(item.id)}
            style={[
              styles.bubble,
              isMe ? styles.myBubble : styles.theirBubble,
              isDeletedForEveryone && styles.deletedBubble,
            ]}
            delayLongPress={350}
          >
            {isDeletedForEveryone ? (
              <Text style={[styles.bubbleText, styles.deletedText]}>
                {isMe
                  ? "You deleted a message"
                  : `${ownerFirstName} deleted a message`}
              </Text>
            ) : (
              <>
                <Text
                  style={[
                    styles.bubbleText,
                    isMe ? styles.myBubbleText : styles.theirBubbleText,
                  ]}
                >
                  {item.text}
                </Text>
                {item.edited && (
                  <Text
                    style={[
                      styles.editedLabel,
                      isMe
                        ? { color: "rgba(255,255,255,0.6)" }
                        : { color: "#aaa" },
                    ]}
                  >
                    edited
                  </Text>
                )}
              </>
            )}
          </Pressable>
          {item.reactions && !isDeletedForEveryone && (
            <View
              style={[
                styles.reactionsRow,
                isMe ? styles.reactionsRight : styles.reactionsLeft,
              ]}
            >
              {Object.entries(item.reactions as Record<string, string[]>)
                .filter(([, users]) => users.length > 0)
                .map(([emoji, users]) => (
                  <TouchableOpacity
                    key={emoji}
                    style={[
                      styles.reactionBadge,
                      (users as string[]).includes(currentUserId ?? "") &&
                        styles.reactionBadgeActive,
                    ]}
                    onPress={() => {
                      setReactionsModalEmoji(emoji);
                      setReactionsModalUserIds(users as string[]);
                      setReactionsModalVisible(true);
                    }}
                    onLongPress={() => handleReact(item.id, emoji)}
                  >
                    <Text style={styles.reactionEmoji}>{emoji}</Text>
                    {(users as string[]).length > 1 && (
                      <Text style={styles.reactionCount}>
                        {(users as string[]).length}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
            </View>
          )}
          {/* ── FIX: read indicator hidden while timestamps are shown ── */}
          {isMe && !isDeletedForEveryone && !showAllTimestamps && (
            <View style={styles.readIndicatorWrap}>
              <Ionicons
                name={item.read ? "checkmark-done" : "checkmark"}
                size={16}
                color="#999"
              />
            </View>
          )}
        </View>
      </View>
    );

    if (!multiSelect && !isDeletedForEveryone) {
      return (
        <View style={[styles.messageRowWithTimestamp, isMe ? styles.messageRowRight : styles.messageRowLeft]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <SwipeableMessage
              onSwipeReply={() => setReplyTo(item)}
              isMe={isMe}
              timeStr={timeStr}
              readStatus={item.read}
            >
              {messageContent}
            </SwipeableMessage>
          </View>
          {/* ── FIX: timestamp only visible while holding the whole-conversation swipe ── */}
          {showAllTimestamps && (
            <Text style={styles.messageTimestampRight}>
              {timeStr}
            </Text>
          )}
        </View>
      );
    }
    return messageContent;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerName}>Loading...</Text>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={NAVY} />
        </View>
      </SafeAreaView>
    );
  }

  const ctxIsMe = ctxMessage
    ? ctxMessage.senderId === currentUserId || ctxMessage.sender === "me"
    : false;

  return (
    <SafeAreaView style={styles.container}>
      <BottomSheet
        visible={sheetVisible}
        title={sheetTitle}
        options={sheetOptions}
        onClose={() => setSheetVisible(false)}
      />

      <ReactionsModal
        visible={reactionsModalVisible}
        emoji={reactionsModalEmoji}
        userIds={reactionsModalUserIds}
        userInfoMap={{
          [currentUserId ?? ""]: {
            displayName: auth.currentUser?.displayName || "You",
            username: auth.currentUser?.displayName?.split(" ")[0] || "You",
            photoURL: auth.currentUser?.photoURL,
          },
          [ownerUserId as string]: ownerInfo,
        }}
        onClose={() => setReactionsModalVisible(false)}
      />

      <MessageContextMenu
        visible={ctxVisible}
        message={ctxMessage}
        isMe={ctxIsMe}
        senderName={ownerFirstName}
        onClose={() => setCtxVisible(false)}
        onReact={(emoji) => ctxMessage && handleReact(ctxMessage.id, emoji)}
        onReply={() => {
          setReplyTo(ctxMessage);
          setCtxMessage(null);
        }}
        onEdit={() => setEditingMessage(ctxMessage)}
        onCopy={() => {
          if (ctxMessage?.text) Clipboard.setString(ctxMessage.text);
        }}
        onViewEditHistory={() => {
          if (ctxMessage?.editHistory) {
            setEditHistoryData(ctxMessage.editHistory);
            setEditHistoryVisible(true);
          }
        }}
        onDeleteForMe={() => ctxMessage && handleDeleteForMe(ctxMessage.id)}
        onDeleteForEveryone={
          ctxIsMe
            ? () => ctxMessage && handleDeleteForEveryone(ctxMessage.id)
            : undefined
        }
      />

      <EditHistoryModal
        visible={editHistoryVisible}
        history={editHistoryData}
        onClose={() => setEditHistoryVisible(false)}
      />
      {editingMessage && (
        <EditMessageModal
          visible={true}
          initialText={editingMessage.text}
          onSave={(newText) => handleEdit(editingMessage.id, newText)}
          onCancel={() => setEditingMessage(null)}
        />
      )}

      {/* ── Header ── */}
      {multiSelect ? (
        <MultiSelectBar
          count={selectedIds.size}
          onCancel={() => {
            setMultiSelect(false);
            setSelectedIds(new Set());
          }}
          onDeleteForMe={handleMultiDeleteForMe}
          onDeleteForEveryone={handleMultiDeleteForEveryone}
        />
      ) : (
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="white" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerContent}
            onPress={() =>
              router.push({
                pathname: "/user-profile",
                params: { userId: ownerUserId as string },
              })
            }
            activeOpacity={0.85}
          >
            <AvatarWithFallback
              uri={avatarUri}
              name={ownerName}
              size={40}
              style={styles.headerAvatar}
              fallbackFontSize={18}
            />
            <View style={styles.headerInfo}>
              <View style={styles.headerNameRow}>
                <Text style={styles.headerName} numberOfLines={1}>
                  {ownerName}
                </Text>
                {isMuted && (
                  <View style={styles.mutedBadge}>
                    <Ionicons name="notifications-off" size={11} color="#fff" />
                    <Text style={styles.mutedBadgeText}>Muted</Text>
                  </View>
                )}
              </View>
              <Text style={styles.headerStatus}>Active</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleMenu}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="ellipsis-vertical" size={20} color="white" />
          </TouchableOpacity>
        </View>
      )}

      {itemTitle && !multiSelect ? (
        <View style={styles.offerCard}>
          <Text style={styles.offerLabel}>Interested in:</Text>
          <Text style={styles.offerTitle}>{itemTitle as string}</Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        <Animated.View
          style={[
            { flex: 1 },
            { transform: [{ translateX: conversationSwipeRef }] },
          ]}
          {...conversationPanResponder.panHandlers}
        >
          <FlatList
            ref={flatListRef}
            data={listData}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: false })
            }
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                flatListRef.current?.scrollToIndex({
                  index: info.index,
                  animated: true,
                });
              }, 200);
            }}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Text style={styles.emptyChatText}>
                  No messages yet. Say hello!
                </Text>
              </View>
            }
          />
        </Animated.View>

        {showSuggested && messages.length === 0 && !multiSelect && (
          <View style={styles.suggestedContainer}>
            <Text style={styles.suggestedTitle}>Suggested messages:</Text>
            <View style={styles.suggestedButtons}>
              {SUGGESTED_MESSAGES.map((msg, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.suggestedButton}
                  onPress={() => sendMessageHandler(msg)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.suggestedButtonText}>{msg}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {multiSelect && selectedIds.size > 0 && (
          <MultiSelectFooter
            count={selectedIds.size}
            onDeleteForMe={handleMultiDeleteForMe}
            onDeleteForEveryone={handleMultiDeleteForEveryone}
          />
        )}

        {replyTo && !multiSelect && (
          <ReplyBanner
            message={replyTo}
            ownerName={ownerFirstName}
            onCancel={() => setReplyTo(null)}
          />
        )}

        {!multiSelect && (
          <View style={styles.inputBar}>
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
            <TouchableOpacity
              style={[
                styles.sendBtn,
                (sending || !input.trim()) && styles.sendBtnDisabled,
              ]}
              onPress={() => sendMessageHandler(input)}
              disabled={sending || !input.trim()}
              activeOpacity={0.8}
            >
              {sending ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Ionicons name="send" size={18} color="white" />
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f7" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: NAVY,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  backBtn: { padding: 2 },
  headerContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerAvatar: {},
  headerInfo: { flex: 1 },
  headerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "nowrap",
  },
  headerName: {
    color: "white",
    fontWeight: "700",
    fontSize: 15,
    flexShrink: 1,
  },
  headerStatus: { color: "#ccc", fontSize: 11, marginTop: 1 },
  mutedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 3,
  },
  mutedBadgeText: { color: "#fff", fontSize: 10, fontWeight: "600" },
  offerCard: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  offerLabel: { fontSize: 11, color: "#999", marginBottom: 2 },
  offerTitle: { fontSize: 14, fontWeight: "700", color: "#111" },
  messagesList: { paddingVertical: 12, paddingHorizontal: 12, flexGrow: 1 },
  emptyChat: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
  },
  emptyChatText: { color: "#aaa", fontSize: 14 },
  dateSep: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
    gap: 8,
  },
  dateSepLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#d1d5db",
  },
  dateSepText: { fontSize: 11, color: "#9ca3af", fontWeight: "600" },
  messageWrap: {
    flexDirection: "row",
    marginBottom: 4,
    alignItems: "flex-end",
  },
  myWrap: { justifyContent: "flex-end" },
  theirWrap: { justifyContent: "flex-start" },
  msgAvatarWrap: { marginRight: 6 },
  myBubbleCol: { alignItems: "flex-end", maxWidth: "75%" },
  theirBubbleCol: { alignItems: "flex-start", maxWidth: "75%" },
  replyPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.06)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 3,
    maxWidth: "100%",
  },
  replyPreviewRight: { backgroundColor: "rgba(255,255,255,0.2)" },
  replyPreviewLeft: { backgroundColor: "rgba(0,0,0,0.06)" },
  replyBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: NAVY,
    alignSelf: "stretch",
  },
  replyWho: { fontSize: 11, fontWeight: "700", color: NAVY },
  replyText: { fontSize: 11, color: "#555", flex: 1 },
  bubble: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 18 },
  myBubble: { backgroundColor: NAVY, borderBottomRightRadius: 4 },
  theirBubble: {
    backgroundColor: "#fff",
    borderBottomLeftRadius: 4,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  deletedBubble: { backgroundColor: "#e5e5ea" },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  myBubbleText: { color: "#fff" },
  theirBubbleText: { color: "#111" },
  deletedText: { color: "#8e8e93", fontStyle: "italic" },
  editedLabel: { fontSize: 10, marginTop: 2 },
  reactionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 3,
  },
  reactionsRight: { justifyContent: "flex-end" },
  reactionsLeft: { justifyContent: "flex-start" },
  reactionBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 3,
  },
  reactionBadgeActive: { backgroundColor: "#eef0fb", borderColor: NAVY },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 11, fontWeight: "600", color: "#555" },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#aaa",
    marginRight: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxSelected: { backgroundColor: NAVY, borderColor: NAVY },
  suggestedContainer: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#f9fafb",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  suggestedTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 8,
  },
  suggestedButtons: { gap: 6 },
  suggestedButton: {
    backgroundColor: "white",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  suggestedButtonText: { fontSize: 13, fontWeight: "500", color: NAVY },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "white",
    borderTopWidth: 1,
    borderTopColor: "#eee",
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: "#f5f5f5",
    maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: NAVY,
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
  swipeTimeOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  swipeTimeRight: { right: 0 },
  swipeTimeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
  },
  repliedToNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  repliedToText: {
    fontSize: 12,
    color: "#666",
    fontWeight: "500",
  },
  readIndicatorWrap: {
    marginTop: 4,
    alignItems: "flex-end",
  },
  messageRowWithTimestamp: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
    paddingHorizontal: 4,
    gap: 8,
  },
  messageRowLeft: {},
  messageRowRight: {},
  messageTimestampRight: {
    fontSize: 11,
    fontWeight: "500",
    color: "#999",
    minWidth: 45,
    textAlign: "right",
    flexShrink: 0,
  },
});