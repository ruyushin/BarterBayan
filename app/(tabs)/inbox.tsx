import { useRouter } from "expo-router";
import { useState } from "react";
import {
  FlatList,
  Image, SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

const NAVY = "#2e2d7c";

const MESSAGES = [
  { id: "1", name: "Neymar Cruz", last: "Sent 2 photos", time: "18m", avatar: "https://i.imgur.com/8Km9tLL.png", status: "yellow" },
  { id: "2", name: "Ronaldo Suarez", last: "Hello! Sent you an offer...", time: "1 hr", avatar: "https://i.imgur.com/j0J7K9M.png", status: "gray" },
  { id: "3", name: "Sasha Banks", last: "Any items you're interested?", time: "2 hrs", avatar: "https://i.imgur.com/xZ9YF6G.png", status: "gray" },
  { id: "4", name: "Jelo Mercado", last: "I'll be at Greenfield Marker...", time: "3 hrs", avatar: "https://i.imgur.com/2nCt3Sbl.png", status: "blue" },
  { id: "5", name: "Kaye Villanueva", last: "I'll send the booking detail...", time: "5 hrs", avatar: "https://i.imgur.com/6oK4B8M.png", status: "gray" },
  { id: "6", name: "Renzo Dela Cruz", last: "Got the sneakers in size 10", time: "1 day", avatar: "https://i.imgur.com/8Km9tLL.png", status: "gray" },
  { id: "7", name: "Bea Santiago", last: "Lamp's packed safely. Ca...", time: "5 mins", avatar: "https://i.imgur.com/j0J7K9M.png", status: "yellow" },
  { id: "8", name: "Anton Reyes", last: "I'll be at Robinsons Galleria...", time: "2 hrs", avatar: "https://i.imgur.com/xZ9YF6G.png", status: "yellow" },
];

const NOTIFICATIONS = [
  { id: "1", name: "Neymar Cruz", text: "offered a trade!", avatar: "https://i.imgur.com/8Km9tLL.png", status: "yellow" },
  { id: "2", name: "Ronaldo Suarez", text: "accepted your Offer!", avatar: "https://i.imgur.com/j0J7K9M.png", status: "gray" },
  { id: "3", name: "Sasha Banks", text: "sent a Message!", avatar: "https://i.imgur.com/xZ9YF6G.png", status: "gray" },
];

export default function InboxScreen() {
  const [activeTab, setActiveTab] = useState("messages");
  const router = useRouter();

  const statusColor = (s: string) =>
    s === "yellow" ? "#f5c518" : s === "blue" ? "#3b82f6" : "#aaa";

  const renderMessage = ({ item }: any) => (
    <TouchableOpacity
      style={styles.messageRow}
onPress={() => router.push({ pathname: "/chat" as any, params: { name: item.name, avatar: item.avatar } })}    >
      <View style={styles.avatarWrap}>
        <Image source={{ uri: item.avatar }} style={styles.avatar} />
        <View style={[styles.statusDot, { backgroundColor: statusColor(item.status) }]} />
      </View>
      <View style={styles.messageInfo}>
        <Text style={styles.messageName}>{item.name}</Text>
        <Text style={styles.messageLast}>{item.last} • {item.time}</Text>
      </View>
      <Text style={styles.dots}>···</Text>
    </TouchableOpacity>
  );

  const renderNotification = ({ item }: any) => (
    <View style={styles.messageRow}>
      <View style={styles.avatarWrap}>
        <Image source={{ uri: item.avatar }} style={styles.avatar} />
        <View style={[styles.statusDot, { backgroundColor: statusColor(item.status) }]} />
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
            style={[styles.sideIcon, activeTab === "messages" && styles.sideIconActive]}
            onPress={() => setActiveTab("messages")}
          >
            <Text style={styles.sideIconText}>💬</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sideIcon, activeTab === "notifications" && styles.sideIconActive]}
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
              <FlatList
                data={MESSAGES}
                renderItem={renderMessage}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
              />
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