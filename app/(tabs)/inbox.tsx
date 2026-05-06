import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
    ActivityIndicator,
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
import { getOtherUserInConversation, getUserConversations } from "../../services/messagingService";

const NAVY = "#2e2d7c";

const NOTIFICATIONS = [
  { id: "1", name: "Neymar Cruz", text: "offered a trade!", avatar: "https://i.imgur.com/8Km9tLL.png", status: "yellow" },
  { id: "2", name: "Ronaldo Suarez", text: "accepted your Offer!", avatar: "https://i.imgur.com/j0J7K9M.png", status: "gray" },
  { id: "3", name: "Sasha Banks", text: "sent a Message!", avatar: "https://i.imgur.com/xZ9YF6G.png", status: "gray" },
];

export default function InboxScreen() {
  const [activeTab, setActiveTab] = useState("messages");
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const currentUserId = auth.currentUser?.uid;

  useFocusEffect(
    useCallback(() => {
      if (currentUserId) {
        loadConversations();
      }
    }, [currentUserId])
  );

  const loadConversations = async () => {
    try {
      setLoading(true);
      const convs = await getUserConversations(currentUserId!);
      
      // Enrich conversations with user info
      const enrichedConvs = await Promise.all(
        convs.map(async (conv: any) => {
          try {
            const otherUserId = getOtherUserInConversation(conv.id, currentUserId!);
            const userInfo: any = await getUserInfo(otherUserId);
            return {
              ...conv,
              otherUserId,
              userName: userInfo?.username || "User",
              userAvatar: userInfo?.avatarUrl || "https://picsum.photos/50",
            };
          } catch (error) {
            console.error('Error loading user info:', error);
            return conv;
          }
        })
      );
      
      setConversations(enrichedConvs);
    } catch (error) {
      console.error("Error loading conversations:", error);
    } finally {
      setLoading(false);
    }
  };

  const statusColor = (s: string) =>
    s === "yellow" ? "#f5c518" : s === "blue" ? "#3b82f6" : "#aaa";

  const formatTime = (timestamp: any) => {
    if (!timestamp) return "";
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
  };

  const handleConversationPress = (conversation: any) => {
    router.push({
      pathname: "/chat",
      params: {
        ownerUserId: conversation.otherUserId,
      },
    });
  };

  const renderMessage = ({ item }: any) => (
    <TouchableOpacity
      style={styles.messageRow}
      onPress={() => handleConversationPress(item)}
    >
      <View style={styles.avatarWrap}>
        <Image
          source={{ uri: item.userAvatar || "https://picsum.photos/50" }}
          style={styles.avatar}
        />
        <View
          style={[
            styles.statusDot,
            { backgroundColor: "#aaa" }, // You can update this based on online status
          ]}
        />
      </View>
      <View style={styles.messageInfo}>
        <Text style={styles.messageName}>{item.userName || "User"}</Text>
        <Text style={styles.messageLast} numberOfLines={1}>
          {item.lastMessage || "No messages"} • {formatTime(item.lastMessageTime)}
        </Text>
      </View>
      <Text style={styles.dots}>···</Text>
    </TouchableOpacity>
  );

  const renderNotification = ({ item }: any) => (
    <View style={styles.messageRow}>
      <View style={styles.avatarWrap}>
        <Image source={{ uri: item.avatar }} style={styles.avatar} />
        <View
          style={[styles.statusDot, { backgroundColor: statusColor(item.status) }]}
        />
      </View>
      <View style={styles.messageInfo}>
        <Text style={styles.messageName}>
          <Text style={{ fontWeight: "700" }}>{item.name}</Text>
          <Text style={{ fontWeight: "400" }}> {item.text}</Text>
        </Text>
      </View>
      <Text style={styles.dots}>···</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        {/* Left sidebar icons */}
        <View style={styles.sidebar}>
          <TouchableOpacity
            style={[
              styles.sideIcon,
              activeTab === "messages" && styles.sideIconActive,
            ]}
            onPress={() => setActiveTab("messages")}
          >
            <Text style={styles.sideIconText}>💬</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.sideIcon,
              activeTab === "notifications" && styles.sideIconActive,
            ]}
            onPress={() => setActiveTab("notifications")}
          >
            <Text style={styles.sideIconText}>🔔</Text>
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
              {loading ? (
                <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                  <ActivityIndicator size="large" color={NAVY} />
                </View>
              ) : conversations.length === 0 ? (
                <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                  <Text style={styles.emptyText}>No conversations yet</Text>
                </View>
              ) : (
                <FlatList
                  data={conversations}
                  renderItem={renderMessage}
                  keyExtractor={(item) => item.id}
                  showsVerticalScrollIndicator={false}
                  onRefresh={loadConversations}
                  refreshing={loading}
                />
              )}
            </>
          ) : (
            <>
              <Text style={styles.heading}>Notifications</Text>
              <TouchableOpacity style={styles.markAllRow}>
                <Text style={styles.markAllText}>Mark all as Read ✉️</Text>
              </TouchableOpacity>
              <FlatList
                data={NOTIFICATIONS}
                renderItem={renderNotification}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
              />
              <TouchableOpacity style={styles.trashButton}>
                <Text style={styles.trashIcon}>🗑️</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#e8e8f0" },
  inner: { flex: 1, flexDirection: "row" },
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
  },
  sideIconActive: { backgroundColor: NAVY },
  sideIconText: { fontSize: 20 },
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
    marginBottom: 12,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 14,
    borderWidth: 0.5,
    borderColor: "#ddd",
  },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: "#333" },
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
  messageName: { fontSize: 14, fontWeight: "600", color: "#111", marginBottom: 2 },
  messageLast: { fontSize: 12, color: "#777" },
  dots: { fontSize: 18, color: "#aaa", paddingLeft: 8 },
  markAllRow: { marginBottom: 16 },
  markAllText: { fontSize: 14, fontWeight: "500", color: "#333" },
  emptyText: { fontSize: 14, color: "#999" },
  trashButton: {
    position: "absolute",
    bottom: 16,
    right: 16,
    backgroundColor: NAVY,
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  trashIcon: { fontSize: 20 },
});