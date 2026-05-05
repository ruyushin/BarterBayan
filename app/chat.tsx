import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
    FlatList,
    Image,
    KeyboardAvoidingView, Platform,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";

const NAVY = "#2e2d7c";

const INITIAL_MESSAGES = [
  { id: "1", text: "Hello! Sent you an offer:\n• Monoblock 3 pcs", sender: "them" },
  { id: "2", text: "Any issues?", sender: "them" },
];

export default function ChatScreen() {
  const router = useRouter();
  const { name, avatar } = useLocalSearchParams();
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState("");

  const sendMessage = () => {
    if (!input.trim()) return;
    setMessages([...messages, { id: Date.now().toString(), text: input, sender: "me" }]);
    setInput("");
  };

  const renderMessage = ({ item }: any) => (
    <View style={[styles.messageWrap, item.sender === "me" ? styles.myWrap : styles.theirWrap]}>
      {item.sender === "them" && (
        <Image source={{ uri: avatar as string }} style={styles.msgAvatar} />
      )}
      <View style={[styles.bubble, item.sender === "me" ? styles.myBubble : styles.theirBubble]}>
        <Text style={[styles.bubbleText, item.sender === "me" && { color: "white" }]}>
          {item.text}
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Image source={{ uri: avatar as string }} style={styles.headerAvatar} />
        <View>
          <Text style={styles.headerName}>{name}</Text>
          <Text style={styles.headerStatus}>Away</Text>
        </View>
        <TouchableOpacity style={styles.moreBtn}>
          <Text style={styles.moreDots}>⋮</Text>
        </TouchableOpacity>
      </View>

      {/* Offer Card */}
      <View style={styles.offerCard}>
        <View style={styles.offerInfo}>
          <Text style={styles.offerTitle}>Ralph Lauren Polo</Text>
          <Text style={styles.offerSub}>Monoblock 3 pcs</Text>
          <Text style={styles.offerArrows}>↕</Text>
          <View style={styles.offerButtons}>
            <TouchableOpacity style={styles.acceptBtn}>
              <Text style={styles.acceptText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.declineBtn}>
              <Text style={styles.declineText}>Decline</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Image
          source={{ uri: "https://i.imgur.com/8Km9tLL.png" }}
          style={styles.offerImage}
        />
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
        />

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.plusBtn}>
            <Text style={styles.plusText}>+</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="Message"
            placeholderTextColor="#aaa"
            value={input}
            onChangeText={setInput}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
            <Text style={styles.sendIcon}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "white" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: NAVY,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  backBtn: { marginRight: 4 },
  backArrow: { color: "white", fontSize: 22 },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#ddd" },
  headerName: { color: "white", fontWeight: "700", fontSize: 16 },
  headerStatus: { color: "#ccc", fontSize: 12 },
  moreBtn: { marginLeft: "auto" },
  moreDots: { color: "white", fontSize: 22 },
  offerCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  offerInfo: { flex: 1 },
  offerTitle: { fontSize: 13, color: "#777" },
  offerSub: { fontSize: 15, fontWeight: "700", color: "#111", marginBottom: 4 },
  offerArrows: { fontSize: 18, color: "#555", marginBottom: 8 },
  offerButtons: { flexDirection: "row", gap: 10 },
  acceptBtn: {
    backgroundColor: NAVY,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  acceptText: { color: "white", fontWeight: "600" },
  declineBtn: {
    backgroundColor: "#e0e0e0",
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  declineText: { color: "#333", fontWeight: "600" },
  offerImage: { width: 70, height: 70, borderRadius: 8, marginLeft: 12 },
  messagesList: { padding: 16, gap: 12 },
  messageWrap: { flexDirection: "row", alignItems: "flex-end", marginBottom: 10 },
  myWrap: { justifyContent: "flex-end" },
  theirWrap: { justifyContent: "flex-start" },
  msgAvatar: { width: 32, height: 32, borderRadius: 16, marginRight: 8 },
  bubble: {
    maxWidth: "75%",
    padding: 12,
    borderRadius: 16,
  },
  myBubble: { backgroundColor: NAVY, borderBottomRightRadius: 4 },
  theirBubble: { backgroundColor: "#f0f0f5", borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, color: "#111", lineHeight: 20 },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#e8e8f0",
    gap: 10,
  },
  plusBtn: {
    backgroundColor: NAVY,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  plusText: { color: "white", fontSize: 22, lineHeight: 24 },
  input: {
    flex: 1,
    backgroundColor: "white",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: "#333",
  },
  sendBtn: {
    backgroundColor: NAVY,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  sendIcon: { color: "white", fontSize: 16 },
});