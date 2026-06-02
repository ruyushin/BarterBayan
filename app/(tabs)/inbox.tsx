import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth } from "../../firebaseConfig";
import { getUserInfo } from "../../services/itemService";
import {
  archiveConversation,
  deleteConversation,
  getOtherUserInConversation,
  getUserConversations,
  markConversationAsRead,
  markConversationAsUnread,
  muteConversation,
  unarchiveConversation,
  unmuteConversation,
} from "../../services/messagingService";
import {
  deleteNotifications,
  getNotifications,
  markAllNotificationsRead,
} from "../../services/notificationService";
// ── NEW: needed to fetch the trade and open TradeChatModal ──
import { TradeChatModal } from "../../components/TradeChatModal";
import { TradeOffer, getTradeOffer } from "../../services/tradeService";

// ─── Constants
const NAVY = "#2e2d7c";
const ACCENT = "#f5c518";
const PAGE_SIZE = 10;

// ─── Types
// CHANGED: added "trade_message" so inbox knows how to route it
type NotifType =
  | "trade_offer"
  | "trade_accepted"
  | "trade_message"
  | "message"
  | "generic";

interface Notification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  avatar?: string;
  read: boolean;
  createdAt: any;
  tradeId?: string;
  conversationId?: string;
  otherUserId?: string;
}

interface SheetOption {
  label: string;
  icon: string;
  destructive?: boolean;
  onPress: () => void;
}

// ─── Helpers

const tsToDate = (timestamp: any): Date => {
  if (!timestamp) return new Date(0);
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp.toDate === "function") return timestamp.toDate();
  if (typeof timestamp.seconds === "number")
    return new Date(timestamp.seconds * 1000);
  const parsed = new Date(timestamp);
  return isNaN(parsed.getTime()) ? new Date(0) : parsed;
};

const formatTime = (timestamp: any): string => {
  try {
    const date = tsToDate(timestamp);
    if (date.getTime() === 0) return "";
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return "now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return "";
  }
};

const AVATAR_COLORS = [
  "#e05c5c",
  "#e07a5c",
  "#5c7ae0",
  "#5cb8e0",
  "#7a5ce0",
  "#5ce07a",
];

const letterAvatarColor = (name: string): string => {
  const index = (name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
};

// CHANGED: added trade_message icon
const notifIcon = (type: NotifType): any => {
  switch (type) {
    case "trade_offer":
      return "swap-horizontal";
    case "trade_accepted":
      return "checkmark-circle";
    case "trade_message":
      return "chatbubble-ellipses";
    case "message":
      return "mail";
    default:
      return "notifications";
  }
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

function NotifAvatarWithFallback({
  uri,
  title,
  type,
}: {
  uri?: string;
  title: string;
  type: NotifType;
}) {
  const [failed, setFailed] = useState(false);

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={styles.notifAvatar}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View
      style={[
        styles.notifIconCircle,
        { backgroundColor: letterAvatarColor(title) },
      ]}
    >
      <Ionicons name={notifIcon(type)} size={20} color="#fff" />
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

// ─── Main Component
export default function InboxScreen() {
  const [activeTab, setActiveTab] = useState<
    "messages" | "archived" | "notifications"
  >("messages");

  // ── Messages state
  const [conversations, setConversations] = useState<any[]>([]);
  const [archivedConversations, setArchivedConversations] = useState<any[]>([]);
  const [convLoading, setConvLoading] = useState(false);
  const [mutedConversations, setMutedConversations] = useState<{
    [key: string]: Date;
  }>({});
  const [searchQuery, setSearchQuery] = useState<string>("");

  // ── Bottom sheet
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetOptions, setSheetOptions] = useState<SheetOption[]>([]);
  const [sheetTitle, setSheetTitle] = useState<string | undefined>();

  // ── Delete confirmation modal
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<any>(null);

  // ── Notifications state
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [notifLoading, setNotifLoading] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);

  // ── Selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── NEW: TradeChatModal state — opened when a trade_message notif is tapped
  const [tradeChatVisible, setTradeChatVisible] = useState(false);
  const [tradeChatOffer, setTradeChatOffer] = useState<TradeOffer | null>(null);
  const [tradeChatLoading, setTradeChatLoading] = useState(false);

  const router = useRouter();
  const currentUserId = auth.currentUser?.uid;

  const openSheet = (title: string | undefined, options: SheetOption[]) => {
    setSheetTitle(title);
    setSheetOptions(options);
    setSheetVisible(true);
  };

  // ─── Data loaders
  useFocusEffect(
    useCallback(() => {
      if (currentUserId) {
        loadConversations();
        loadNotifications();
      }
    }, [currentUserId]),
  );

  const loadConversations = async () => {
    try {
      setConvLoading(true);
      const convs = await getUserConversations(currentUserId!);

      if (!convs || convs.length === 0) {
        setConversations([]);
        setArchivedConversations([]);
        setMutedConversations({});
        return;
      }

      const enriched = await Promise.all(
        convs.map(async (conv: any) => {
          try {
            const otherUserId = getOtherUserInConversation(
              conv.id,
              currentUserId!,
            );
            if (!otherUserId) return conv;
            const userInfo: any = await getUserInfo(otherUserId).catch(
              () => null,
            );
            const avatarUri = resolveAvatar(userInfo);
            return {
              ...conv,
              otherUserId,
              userName: userInfo?.username || userInfo?.displayName || "User",
              userAvatar: avatarUri,
            };
          } catch {
            return { ...conv, userName: "User", userAvatar: null };
          }
        }),
      );

      const newMuted: { [key: string]: Date } = {};
      enriched.forEach((conv: any) => {
        const mutedTs = conv.mutedBy?.[currentUserId!];
        if (mutedTs) {
          const until = tsToDate(mutedTs);
          if (until.getTime() > Date.now()) {
            newMuted[conv.id] = until;
          }
        }
      });
      setMutedConversations(newMuted);

      const active = enriched.filter(
        (conv) => !conv.archivedBy || !conv.archivedBy.includes(currentUserId!),
      );
      const archived = enriched.filter(
        (conv) => conv.archivedBy && conv.archivedBy.includes(currentUserId!),
      );
      setConversations(active);
      setArchivedConversations(archived);
    } catch (err) {
      console.error("Error loading conversations:", err);
      setConversations([]);
      setArchivedConversations([]);
    } finally {
      setConvLoading(false);
    }
  };

  const loadNotifications = async () => {
    try {
      setNotifLoading(true);
      const data = await getNotifications(currentUserId!);
      setNotifications(data ?? []);
    } catch (err) {
      console.error("Error loading notifications:", err);
      setNotifications([]);
    } finally {
      setNotifLoading(false);
    }
  };

  // ─── Mark all read
  const handleMarkAllRead = async () => {
    if (markingRead) return;
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    try {
      setMarkingRead(true);
      await markAllNotificationsRead(currentUserId!);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      console.error("Error marking all read:", err);
    } finally {
      setMarkingRead(false);
    }
  };

  // ─── Notification press
  // CHANGED: trade_message opens TradeChatModal instead of the regular chat
  // ── Shared helper: fetch a trade by ID and open TradeChatModal
  const openTradeChat = async (tradeId: string) => {
    setTradeChatLoading(true);
    try {
      const trade = await getTradeOffer(tradeId);
      if (trade) {
        setTradeChatOffer(trade);
        setTradeChatVisible(true);
      } else {
        Alert.alert("Not found", "This trade could not be loaded.");
      }
    } catch (err: any) {
      console.error("openTradeChat failed:", err);
      Alert.alert("Error", err?.message ?? "Could not open trade chat.");
    } finally {
      setTradeChatLoading(false);
    }
  };

  const handleNotifPress = async (item: Notification) => {
    console.log("NOTIF TAPPED type=" + item.type + " tradeId=" + item.tradeId);

    if (selectionMode) {
      toggleSelect(item.id);
      return;
    }

    // Mark as read
    if (!item.read) {
      markAllNotificationsRead; // import already pulled in
      const { markNotificationRead } =
        await import("../../services/notificationService");
      markNotificationRead(item.id).catch(console.error);
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)),
      );
    }

    // If ANY notification carries a tradeId open trade chat —
    // covers both "trade_message" and legacy "message" typed notifications.
    if (item.tradeId) {
      await openTradeChat(item.tradeId);
      return;
    }

    switch (item.type) {
      case "trade_offer":
      case "trade_accepted":
        router.push({ pathname: "/trade", params: {} });
        break;
      case "message":
        if (item.otherUserId) {
          router.push({
            pathname: "/chat",
            params: { ownerUserId: item.otherUserId },
          });
        }
        break;
    }
  };

  const handleNotifLongPress = (id: string) => {
    setSelectionMode(true);
    setSelectedIds(new Set([id]));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  };

  const cancelSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleDeleteSelected = () => {
    setDeleteModalVisible(true);
  };

  const confirmDeleteSelected = async () => {
    try {
      await deleteNotifications([...selectedIds]);
      setNotifications((prev) => prev.filter((n) => !selectedIds.has(n.id)));
      cancelSelection();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleteModalVisible(false);
    }
  };

  // ─── Conversation menu
  const handleConversationMenu = (item: any) => {
    const isMuted = mutedConversations[item.id];
    const isMutedActive = isMuted && new Date() < isMuted;
    const isRead =
      item.readBy?.includes(currentUserId!) || item.isRead === true;

    const options: SheetOption[] = [
      {
        label: isRead ? "Mark as Unread" : "Mark as Read",
        icon: isRead ? "mail-outline" : "mail-open-outline",
        onPress: async () => {
          try {
            if (isRead) {
              await markConversationAsUnread(item.id, currentUserId!);
            } else {
              await markConversationAsRead(item.id, currentUserId!);
            }
            loadConversations();
          } catch (err) {
            console.error(err);
          }
        },
      },
    ];

    if (isMutedActive) {
      options.push({
        label: "Unmute Notifications",
        icon: "notifications-outline",
        onPress: async () => {
          try {
            await unmuteConversation(item.id, currentUserId!);
            setMutedConversations((prev) => {
              const next = { ...prev };
              delete next[item.id];
              return next;
            });
          } catch (err) {
            console.error(err);
          }
        },
      });
    } else {
      options.push({
        label: "Mute Notifications",
        icon: "notifications-off-outline",
        onPress: () => openMuteSheet(item),
      });
    }

    const isArchived =
      item.archivedBy && item.archivedBy.includes(currentUserId!);
    if (isArchived) {
      options.push({
        label: "Unarchive",
        icon: "arrow-undo-outline",
        onPress: async () => {
          try {
            await unarchiveConversation(item.id, currentUserId!);
            loadConversations();
          } catch (err) {
            console.error(err);
          }
        },
      });
    } else {
      options.push({
        label: "Archive",
        icon: "archive-outline",
        onPress: async () => {
          try {
            await archiveConversation(item.id, currentUserId!);
            loadConversations();
          } catch (err) {
            console.error(err);
          }
        },
      });
    }

    options.push({
      label: "Delete",
      icon: "trash-outline",
      destructive: true,
      onPress: () => {
        setConversationToDelete(item);
        setDeleteModalVisible(true);
      },
    });

    openSheet(item.userName, options);
  };

  const confirmDeleteConversation = async () => {
    if (!conversationToDelete) return;
    try {
      await deleteConversation(conversationToDelete.id, currentUserId!);
      await loadConversations();
    } catch (err) {
      console.error("Error deleting conversation:", err);
      Alert.alert("Error", "Failed to delete conversation. Please try again.");
    } finally {
      setDeleteModalVisible(false);
      setConversationToDelete(null);
    }
  };

  const openMuteSheet = (item: any) => {
    const mute = async (ms: number) => {
      const muteUntil = new Date(Date.now() + ms);
      try {
        await muteConversation(item.id, currentUserId!, muteUntil);
        setMutedConversations((prev) => ({ ...prev, [item.id]: muteUntil }));
      } catch (err) {
        console.error(err);
      }
    };
    openSheet("Mute notifications for...", [
      {
        label: "15 minutes",
        icon: "time-outline",
        onPress: () => mute(15 * 60 * 1000),
      },
      {
        label: "1 hour",
        icon: "time-outline",
        onPress: () => mute(60 * 60 * 1000),
      },
      {
        label: "8 hours",
        icon: "time-outline",
        onPress: () => mute(8 * 60 * 60 * 1000),
      },
      {
        label: "24 hours",
        icon: "time-outline",
        onPress: () => mute(24 * 60 * 60 * 1000),
      },
      {
        label: "Until I change it",
        icon: "infinite-outline",
        onPress: () => mute(365 * 24 * 60 * 60 * 1000),
      },
    ]);
  };

  // ─── Search filtering
  const filteredConversations = conversations.filter(
    (conv) =>
      conv.userName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const filteredArchivedConversations = archivedConversations.filter(
    (conv) =>
      conv.userName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // ─── Pagination
  const visibleNotifs = notifications.slice(0, visibleCount);
  const hasMore = notifications.length > visibleCount;
  const loadMore = () => setVisibleCount((c) => c + PAGE_SIZE);
  const unreadCount = notifications.filter((n) => !n.read).length;

  // ─── Renders
  const renderMessage = ({ item }: any) => {
    const isMuted = mutedConversations[item.id];
    const isMutedActive = isMuted && new Date() < isMuted;
    const isRead =
      item.readBy?.includes(currentUserId!) || item.isRead === true;
    const name = item.userName || "User";

    const timeStr = item.lastMessageTime
      ? formatTime(item.lastMessageTime)
      : "";
    const lastLine = timeStr
      ? `${item.lastMessage || "No messages"} · ${timeStr}`
      : item.lastMessage || "No messages";

    return (
      <View
        style={[styles.messageRowContainer, !isRead && styles.messageRowUnread]}
      >
        <View style={[styles.messageRow, !isRead && styles.messageRowBgUnread]}>
          <TouchableOpacity
            style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
            onPress={() =>
              router.push({
                pathname: "/chat",
                params: { ownerUserId: item.otherUserId },
              })
            }
            activeOpacity={0.75}
          >
            <View style={styles.avatarWrap}>
              <AvatarWithFallback
                uri={item.userAvatar}
                name={name}
                size={50}
                fallbackFontSize={20}
              />
              <View style={[styles.statusDot, { backgroundColor: "#aaa" }]} />
            </View>

            <View style={styles.messageInfo}>
              <View style={styles.messageNameRow}>
                <Text
                  style={[
                    styles.messageName,
                    !isRead && styles.messageNameUnread,
                  ]}
                >
                  {name}
                </Text>
                {isMutedActive && (
                  <Ionicons
                    name="notifications-off"
                    size={13}
                    color="#999"
                    style={{ marginLeft: 4 }}
                  />
                )}
              </View>
              <Text
                style={[
                  styles.messageLast,
                  !isRead && styles.messageLastUnread,
                ]}
                numberOfLines={1}
              >
                {lastLine}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.moreButton}
          onPress={() => handleConversationMenu(item)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name="ellipsis-vertical"
            size={18}
            color={!isRead ? "#000" : NAVY}
          />
        </TouchableOpacity>
      </View>
    );
  };

  const renderNotification = ({ item }: { item: Notification }) => {
    const isSelected = selectedIds.has(item.id);
    return (
      <TouchableOpacity
        style={[
          styles.notifRow,
          !item.read && styles.notifRowUnread,
          isSelected && styles.notifRowSelected,
        ]}
        onPress={() => handleNotifPress(item)}
        onLongPress={() => handleNotifLongPress(item.id)}
        delayLongPress={350}
        activeOpacity={0.8}
      >
        {selectionMode && (
          <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
            {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
          </View>
        )}
        <View style={styles.notifIconWrap}>
          <NotifAvatarWithFallback
            uri={item.avatar}
            title={item.title}
            type={item.type}
          />
          {!item.read && <View style={styles.unreadBadge} />}
        </View>
        <View style={styles.notifContent}>
          <Text style={styles.notifTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.notifBody} numberOfLines={2}>
            {item.body}
          </Text>
          {formatTime(item.createdAt) ? (
            <Text style={styles.notifTime}>{formatTime(item.createdAt)}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  const renderNotifFooter = () => {
    if (!hasMore) return null;
    return (
      <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMore}>
        <Text style={styles.loadMoreText}>
          Show {Math.min(PAGE_SIZE, notifications.length - visibleCount)} older
          notifications
        </Text>
      </TouchableOpacity>
    );
  };

  // ─── UI
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <BottomSheet
          visible={sheetVisible}
          title={sheetTitle}
          options={sheetOptions}
          onClose={() => setSheetVisible(false)}
        />

        <Modal
          visible={deleteModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setDeleteModalVisible(false);
            setConversationToDelete(null);
          }}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => {
              setDeleteModalVisible(false);
              setConversationToDelete(null);
            }}
          >
            <Pressable style={styles.modalPanel}>
              <View style={styles.modalIconWrap}>
                <Ionicons name="trash-outline" size={36} color="#ef4444" />
              </View>
              <Text style={styles.modalTitle}>
                {conversationToDelete
                  ? "Delete Conversation"
                  : "Delete Notifications"}
              </Text>
              <Text style={styles.modalBody}>
                {conversationToDelete
                  ? "Are you sure you want to delete this conversation? All messages will be removed."
                  : `Remove ${selectedIds.size} notification${selectedIds.size > 1 ? "s" : ""}? This action cannot be undone.`}
              </Text>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => {
                    setDeleteModalVisible(false);
                    setConversationToDelete(null);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalDeleteBtn}
                  onPress={
                    conversationToDelete
                      ? confirmDeleteConversation
                      : confirmDeleteSelected
                  }
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalDeleteText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Sidebar */}
        <View style={styles.sidebar}>
          <TouchableOpacity
            style={[
              styles.sideIcon,
              activeTab === "messages" && styles.sideIconActive,
            ]}
            onPress={() => {
              setActiveTab("messages");
              setSearchQuery("");
            }}
          >
            <Ionicons
              name="mail"
              size={24}
              color={activeTab === "messages" ? "#fff" : "#999"}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.sideIcon,
              activeTab === "archived" && styles.sideIconActive,
            ]}
            onPress={() => {
              setActiveTab("archived");
              setSearchQuery("");
            }}
          >
            <Ionicons
              name="archive"
              size={24}
              color={activeTab === "archived" ? "#fff" : "#999"}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.sideIcon,
              activeTab === "notifications" && styles.sideIconActive,
            ]}
            onPress={() => {
              setActiveTab("notifications");
              setSearchQuery("");
            }}
          >
            <Ionicons
              name="notifications"
              size={24}
              color={activeTab === "notifications" ? "#fff" : "#999"}
            />
            {unreadCount > 0 && (
              <View style={styles.badgePill}>
                <Text style={styles.badgePillText}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Main content */}
        <View style={styles.content}>
          {activeTab === "messages" || activeTab === "archived" ? (
            <>
              <Text style={styles.heading}>
                {activeTab === "archived" ? "Archived" : "Messages"}
              </Text>
              <View style={styles.searchContainer}>
                <Ionicons
                  name="search-outline"
                  size={20}
                  color="#5B5B7B"
                  style={styles.searchIcon}
                />
                <TextInput
                  placeholder={
                    activeTab === "archived"
                      ? "Search Archived..."
                      : "Search Messages..."
                  }
                  placeholderTextColor="#888"
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
              {convLoading ? (
                <View style={styles.centered}>
                  <ActivityIndicator size="large" color={NAVY} />
                </View>
              ) : activeTab === "archived" ? (
                filteredArchivedConversations.length === 0 ? (
                  <View style={styles.centered}>
                    <Ionicons name="archive-outline" size={48} color="#999" />
                    <Text style={styles.emptyText}>
                      {searchQuery
                        ? "No archived conversations match"
                        : "No archived conversations yet"}
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    data={filteredArchivedConversations}
                    renderItem={renderMessage}
                    keyExtractor={(item) => item.id}
                    showsVerticalScrollIndicator={false}
                    onRefresh={loadConversations}
                    refreshing={convLoading}
                  />
                )
              ) : filteredConversations.length === 0 ? (
                <View style={styles.centered}>
                  <Ionicons name="chatbubbles-outline" size={48} color="#999" />
                  <Text style={styles.emptyText}>
                    {searchQuery
                      ? "No conversations match"
                      : "No conversations yet"}
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={filteredConversations}
                  renderItem={renderMessage}
                  keyExtractor={(item) => item.id}
                  showsVerticalScrollIndicator={false}
                  onRefresh={loadConversations}
                  refreshing={convLoading}
                />
              )}
            </>
          ) : (
            <>
              {selectionMode ? (
                <View style={styles.selectionHeader}>
                  <TouchableOpacity
                    onPress={cancelSelection}
                    style={styles.selectionCancelBtn}
                  >
                    <Text style={styles.selectionCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={styles.selectionCount}>
                    {selectedIds.size} selected
                  </Text>
                  <TouchableOpacity
                    onPress={handleDeleteSelected}
                    style={[
                      styles.deleteBtn,
                      selectedIds.size === 0 && styles.deleteBtnDisabled,
                    ]}
                    disabled={selectedIds.size === 0}
                  >
                    <Text style={styles.deleteBtnText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.notifHeader}>
                  <Text style={styles.heading}>Notifications</Text>
                  {unreadCount > 0 && (
                    <TouchableOpacity
                      style={[
                        styles.markReadBtn,
                        markingRead && styles.markReadBtnDisabled,
                      ]}
                      onPress={handleMarkAllRead}
                      disabled={markingRead}
                      activeOpacity={0.8}
                    >
                      {markingRead ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="mail" size={16} color="#fff" />
                          <Text style={styles.markReadText}>Mark all read</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {!selectionMode && notifications.length > 0 && (
                <Text style={styles.hintText}>Hold to select &amp; delete</Text>
              )}

              {/* Loading spinner for trade chat fetch */}
              {tradeChatLoading && (
                <View style={styles.tradeChatLoader}>
                  <ActivityIndicator size="small" color={NAVY} />
                  <Text style={styles.tradeChatLoaderText}>Opening chat…</Text>
                </View>
              )}

              {notifLoading ? (
                <View style={styles.centered}>
                  <ActivityIndicator size="large" color={NAVY} />
                </View>
              ) : notifications.length === 0 ? (
                <View style={styles.centered}>
                  <Ionicons name="notifications" size={48} color={NAVY} />
                  <Text style={styles.emptyText}>You're all caught up!</Text>
                </View>
              ) : (
                <FlatList
                  data={visibleNotifs}
                  renderItem={renderNotification}
                  keyExtractor={(item) => item.id}
                  showsVerticalScrollIndicator={false}
                  onRefresh={loadNotifications}
                  refreshing={notifLoading}
                  ListFooterComponent={renderNotifFooter}
                  contentContainerStyle={{ paddingBottom: 16 }}
                />
              )}
            </>
          )}
        </View>
      </View>

      {/* NEW: TradeChatModal — opened when a trade_message notification is tapped */}
      <TradeChatModal
        visible={tradeChatVisible}
        trade={tradeChatOffer}
        isOwner={
          tradeChatOffer != null &&
          auth.currentUser?.uid === tradeChatOffer.ownerId
        }
        onClose={() => {
          setTradeChatVisible(false);
          setTradeChatOffer(null);
        }}
        onStatusChange={(tradeId, newStatus) => {
          setTradeChatOffer((prev) =>
            prev ? { ...prev, status: newStatus } : prev,
          );
        }}
      />
    </SafeAreaView>
  );
}

// ─── Styles
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#e8e8f0" },
  inner: { flex: 1, flexDirection: "row" },

  sidebar: { width: 60, paddingTop: 16, alignItems: "center", gap: 10 },
  sideIcon: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: "#ccc",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  sideIconActive: { backgroundColor: NAVY },
  badgePill: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#ef4444",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: "#e8e8f0",
  },
  badgePillText: { color: "#fff", fontSize: 10, fontWeight: "700" },

  content: {
    flex: 1,
    backgroundColor: "#f0f0f5",
    borderRadius: 16,
    margin: 8,
    padding: 16,
  },
  heading: { fontSize: 24, fontWeight: "700", color: NAVY },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  emptyText: { fontSize: 14, color: "#999" },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: 14,
    height: 48,
    borderWidth: 1,
    borderColor: "#E9E9E9",
    paddingHorizontal: 14,
    marginVertical: 12,
  },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, fontSize: 15, color: "#242424", paddingVertical: 8 },

  messageRowContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },
  messageRowUnread: {},
  messageRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    backgroundColor: "#f0f0f5",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  messageRowBgUnread: { backgroundColor: "#ffffff" },

  avatarWrap: { position: "relative", marginRight: 12 },
  statusDot: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#f0f0f5",
  },

  messageInfo: { flex: 1 },
  messageNameRow: { flexDirection: "row", alignItems: "center" },
  messageName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111",
    marginBottom: 2,
  },
  messageNameUnread: { fontWeight: "700", color: "#000" },
  messageLast: { fontSize: 12, color: "#777" },
  messageLastUnread: { color: "#333", fontWeight: "500" },
  moreButton: { padding: 8, marginLeft: 8 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalPanel: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    width: "80%",
    alignItems: "center",
  },
  modalIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#fff1f1",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111",
    marginBottom: 8,
    textAlign: "center",
  },
  modalBody: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  modalActions: { flexDirection: "row", gap: 12, width: "100%" },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#f2f2f7",
    alignItems: "center",
  },
  modalCancelText: { fontWeight: "600", color: "#333", fontSize: 15 },
  modalDeleteBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#ef4444",
    alignItems: "center",
  },
  modalDeleteText: { fontWeight: "600", color: "#fff", fontSize: 15 },

  notifHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  markReadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: NAVY,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  markReadBtnDisabled: { opacity: 0.6 },
  markReadText: { color: "#fff", fontSize: 12, fontWeight: "600" },

  selectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  selectionCancelBtn: { paddingVertical: 4, paddingRight: 8 },
  selectionCancelText: { color: NAVY, fontSize: 14, fontWeight: "600" },
  selectionCount: { fontSize: 14, fontWeight: "700", color: "#333" },
  deleteBtn: {
    backgroundColor: "#ef4444",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  deleteBtnDisabled: { opacity: 0.4 },
  deleteBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  hintText: { fontSize: 11, color: "#aaa", marginBottom: 10, marginTop: 2 },

  // NEW: small inline loader while fetching trade for chat
  tradeChatLoader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  tradeChatLoaderText: { fontSize: 12, color: "#888" },

  notifRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  notifRowUnread: {
    backgroundColor: "#eef0ff",
    borderLeftWidth: 3,
    borderLeftColor: NAVY,
  },
  notifRowSelected: {
    backgroundColor: "#dde0ff",
    borderColor: NAVY,
    borderWidth: 1.5,
  },

  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#bbb",
    marginRight: 10,
    marginTop: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: { backgroundColor: NAVY, borderColor: NAVY },

  notifIconWrap: { position: "relative", marginRight: 12 },
  notifAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#ddd",
  },
  notifIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  unreadBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: ACCENT,
    borderWidth: 1.5,
    borderColor: "#eef0ff",
  },

  notifContent: { flex: 1 },
  notifTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111",
    marginBottom: 2,
  },
  notifBody: { fontSize: 12, color: "#555", lineHeight: 17 },
  notifTime: { fontSize: 11, color: "#aaa", marginTop: 4 },

  loadMoreBtn: {
    marginTop: 4,
    marginBottom: 8,
    alignSelf: "center",
    backgroundColor: "#e0e0ee",
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  loadMoreText: { fontSize: 13, color: NAVY, fontWeight: "600" },
});
