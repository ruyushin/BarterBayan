import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
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
    getOtherUserInConversation,
    getUserConversations,
} from "../../services/messagingService";
import {
    deleteNotifications,
    getNotifications,
    markAllNotificationsRead,
    markNotificationRead,
} from "../../services/notificationService";

// ─── Constants ────────────────────────────────────────────────────────────────
const NAVY = "#2e2d7c";
const ACCENT = "#f5c518";
const PAGE_SIZE = 10;

// ─── Types ────────────────────────────────────────────────────────────────────
type NotifType = "trade_offer" | "trade_accepted" | "message" | "generic";

interface Notification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  avatar?: string;
  read: boolean;
  createdAt: any; // Firestore Timestamp
  // Navigation payload
  tradeId?: string;
  conversationId?: string;
  otherUserId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatTime = (timestamp: any): string => {
  if (!timestamp) return "";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
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

const notifIcon = (type: NotifType): string => {
  switch (type) {
    case "trade_offer":
      return "swap-horizontal";
    case "trade_accepted":
      return "checkmark-circle";
    case "message":
      return "mail";
    default:
      return "notifications";
  }
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function InboxScreen() {
  const [activeTab, setActiveTab] = useState<"messages" | "notifications">(
    "messages",
  );

  // ── Messages state ──
  const [conversations, setConversations] = useState<any[]>([]);
  const [convLoading, setConvLoading] = useState(false);

  // ── Notifications state ──
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [notifLoading, setNotifLoading] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);

  // ── Selection mode ──
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const router = useRouter();
  const currentUserId = auth.currentUser?.uid;

  // ─── Data Loaders ─────────────────────────────────────────────────────────
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
      const enriched = await Promise.all(
        convs.map(async (conv: any) => {
          try {
            const otherUserId = getOtherUserInConversation(
              conv.id,
              currentUserId!,
            );
            const userInfo: any = await getUserInfo(otherUserId);
            return {
              ...conv,
              otherUserId,
              userName: userInfo?.username || "User",
              userAvatar: userInfo?.avatarUrl || "https://picsum.photos/50",
            };
          } catch {
            return conv;
          }
        }),
      );
      setConversations(enriched);
    } catch (err) {
      console.error("Error loading conversations:", err);
    } finally {
      setConvLoading(false);
    }
  };

  const loadNotifications = async () => {
    try {
      setNotifLoading(true);
      // getNotifications should return Notification[] sorted by createdAt desc
      const data = await getNotifications(currentUserId!);
      setNotifications(data);
    } catch (err) {
      console.error("Error loading notifications:", err);
    } finally {
      setNotifLoading(false);
    }
  };

  // ─── Mark All Read ────────────────────────────────────────────────────────
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

  // ─── Tap notification → navigate ─────────────────────────────────────────
  const handleNotifPress = async (item: Notification) => {
    if (selectionMode) {
      toggleSelect(item.id);
      return;
    }

    // Mark individual as read
    if (!item.read) {
      markNotificationRead(item.id).catch(console.error);
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)),
      );
    }

    // Route based on type
    switch (item.type) {
      case "trade_offer":
      case "trade_accepted":
        router.push({ pathname: "/trade", params: { tradeId: item.tradeId } });
        break;
      case "message":
        router.push({
          pathname: "/chat",
          params: { ownerUserId: item.otherUserId },
        });
        break;
      default:
        break;
    }
  };

  // ─── Long press → enter selection mode ───────────────────────────────────
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

  // ─── Delete selected ──────────────────────────────────────────────────────
  const handleDeleteSelected = () => {
    Alert.alert(
      "Delete Notifications",
      `Remove ${selectedIds.size} notification${selectedIds.size > 1 ? "s" : ""}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteNotifications([...selectedIds]);
              setNotifications((prev) =>
                prev.filter((n) => !selectedIds.has(n.id)),
              );
              cancelSelection();
            } catch (err) {
              console.error("Error deleting notifications:", err);
            }
          },
        },
      ],
    );
  };

  // ─── Pagination ───────────────────────────────────────────────────────────
  const visibleNotifs = notifications.slice(0, visibleCount);
  const hasMore = notifications.length > visibleCount;
  const loadMore = () => setVisibleCount((c) => c + PAGE_SIZE);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // ─── Renders ──────────────────────────────────────────────────────────────
  const renderMessage = ({ item }: any) => (
    <TouchableOpacity
      style={styles.messageRow}
      onPress={() =>
        router.push({
          pathname: "/chat",
          params: { ownerUserId: item.otherUserId },
        })
      }
      activeOpacity={0.75}
    >
      <View style={styles.avatarWrap}>
        <Image
          source={{ uri: item.userAvatar || "https://picsum.photos/50" }}
          style={styles.avatar}
        />
        <View style={[styles.statusDot, { backgroundColor: "#aaa" }]} />
      </View>
      <View style={styles.messageInfo}>
        <Text style={styles.messageName}>{item.userName || "User"}</Text>
        <Text style={styles.messageLast} numberOfLines={1}>
          {item.lastMessage || "No messages"} ·{" "}
          {formatTime(item.lastMessageTime)}
        </Text>
      </View>
      <Text style={styles.dots}>···</Text>
    </TouchableOpacity>
  );

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
        {/* Selection checkbox */}
        {selectionMode && (
          <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
            {isSelected && <Ionicons name="checkmark" size={16} color="#2e2d7c" />}
          </View>
        )}

        {/* Icon badge */}
        <View style={styles.notifIconWrap}>
          {item.avatar ? (
            <Image source={{ uri: item.avatar }} style={styles.notifAvatar} />
          ) : (
            <View
              style={[
                styles.notifIconCircle,
                { backgroundColor: letterAvatarColor(item.title) },
              ]}
            >
              <Ionicons name={notifIcon(item.type)} size={20} color="#fff" />
            </View>
          )}
          {!item.read && <View style={styles.unreadBadge} />}
        </View>

        {/* Content */}
        <View style={styles.notifContent}>
          <Text style={styles.notifTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.notifBody} numberOfLines={2}>
            {item.body}
          </Text>
          <Text style={styles.notifTime}>{formatTime(item.createdAt)}</Text>
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

  // ─── UI ───────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        {/* Sidebar */}
        <View style={styles.sidebar}>
          <TouchableOpacity
            style={[
              styles.sideIcon,
              activeTab === "messages" && styles.sideIconActive,
            ]}
            onPress={() => setActiveTab("messages")}
          >
            <Ionicons name="mail" size={24} color={activeTab === "messages" ? "#fff" : "#999"} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.sideIcon,
              activeTab === "notifications" && styles.sideIconActive,
            ]}
            onPress={() => setActiveTab("notifications")}
          >
            <Ionicons name="notifications" size={24} color={activeTab === "notifications" ? "#fff" : "#999"} />
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
          {activeTab === "messages" ? (
            <>
              <Text style={styles.heading}>Messages</Text>
              <View style={styles.searchBar}>
                <Text style={styles.searchIcon}>🔍</Text>
                <TextInput
                  placeholder="Search Messages..."
                  placeholderTextColor="#aaa"
                  style={styles.searchInput}
                />
              </View>
              {convLoading ? (
                <View style={styles.centered}>
                  <ActivityIndicator size="large" color={NAVY} />
                </View>
              ) : conversations.length === 0 ? (
                <View style={styles.centered}>
                  <Text style={styles.emptyIcon}>💬</Text>
                  <Text style={styles.emptyText}>No conversations yet</Text>
                </View>
              ) : (
                <FlatList
                  data={conversations}
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
              {/* ── Notifications Header ── */}
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
                          <Text style={styles.markReadIcon}>✉️</Text>
                          <Text style={styles.markReadText}>Mark all read</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* ── Hint for long-press ── */}
              {!selectionMode && notifications.length > 0 && (
                <Text style={styles.hintText}>Hold to select &amp; delete</Text>
              )}

              {/* ── List ── */}
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
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#e8e8f0" },
  inner: { flex: 1, flexDirection: "row" },

  // Sidebar
  sidebar: {
    width: 60,
    paddingTop: 16,
    alignItems: "center",
    gap: 10,
  },
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
  sideIconText: { fontSize: 20 },
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

  // Content panel
  content: {
    flex: 1,
    backgroundColor: "#f0f0f5",
    borderRadius: 16,
    margin: 8,
    padding: 16,
  },
  heading: {
    fontSize: 24,
    fontWeight: "700",
    color: NAVY,
  },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  emptyIcon: { fontSize: 36 },
  emptyText: { fontSize: 14, color: "#999" },

  // Search
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginVertical: 12,
    borderWidth: 0.5,
    borderColor: "#ddd",
  },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: "#333" },

  // Messages
  messageRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },
  avatarWrap: { position: "relative", marginRight: 12 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: "#ddd" },
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
  messageName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111",
    marginBottom: 2,
  },
  messageLast: { fontSize: 12, color: "#777" },
  dots: { fontSize: 18, color: "#aaa", paddingLeft: 8 },

  // Notification header row
  notifHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },

  // Mark all read pill button
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
  markReadIcon: { fontSize: 13 },
  markReadText: { color: "#fff", fontSize: 12, fontWeight: "600" },

  // Selection mode header
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

  // Hint text
  hintText: {
    fontSize: 11,
    color: "#aaa",
    marginBottom: 10,
    marginTop: 2,
  },

  // Notification row
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

  // Checkbox (selection mode)
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
  checkmark: { color: "#fff", fontSize: 12, fontWeight: "700" },

  // Notif icon / avatar
  notifIconWrap: {
    position: "relative",
    marginRight: 12,
  },

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
    backgroundColor: "#e8e8f0",
    justifyContent: "center",
    alignItems: "center",
  },
  notifIconEmoji: { fontSize: 22 },
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

  // Notif content
  notifContent: { flex: 1 },
  notifTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111",
    marginBottom: 2,
  },
  notifBody: { fontSize: 12, color: "#555", lineHeight: 17 },
  notifTime: { fontSize: 11, color: "#aaa", marginTop: 4 },

  //Avatar Fallback Text
  letterAvatarText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },

  // Load more
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
