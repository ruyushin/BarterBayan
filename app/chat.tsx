import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { auth } from "../firebaseConfig";
import { getUserInfo } from "../services/itemService";
import { getConversationMessages, sendMessage } from "../services/messagingService";

const NAVY = "#2e2d7c";

const SUGGESTED_MESSAGES = [
    "Is this still available?",
    "Is this negotiable?",
    "When can we meet?",
];

export default function ChatScreen() {
    const router = useRouter();
    const { ownerUserId, itemId, itemTitle, fromModal } = useLocalSearchParams();
    const [messages, setMessages] = useState<any[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [ownerInfo, setOwnerInfo] = useState<any>(null);
    const [showSuggested, setShowSuggested] = useState(true);
    const currentUserId = auth.currentUser?.uid;
    const flatListRef = useRef<FlatList>(null);

    useEffect(() => {
        loadChatData();
    }, []);

    const loadChatData = async () => {
        try {
            setLoading(true);

            // Get owner info
            if (ownerUserId) {
                const info = await getUserInfo(ownerUserId as string);
                setOwnerInfo(info);
            }

            // Get messages
            if (currentUserId && ownerUserId) {
                const existingMessages = await getConversationMessages(
                    currentUserId,
                    ownerUserId as string
                );
                setMessages(existingMessages);
            }
        } catch (error) {
            console.error("Error loading chat data:", error);
        } finally {
            setLoading(false);
        }
    };

    const sendMessageHandler = async (text: string) => {
        if (!text.trim() || !currentUserId || !ownerUserId) return;

        try {
            setSending(true);

            // Add message to UI optimistically
            const newMessage = {
                id: Date.now().toString(),
                text: text.trim(),
                senderId: currentUserId,
                recipientId: ownerUserId,
                timestamp: new Date(),
                sender: "me",
            };

            setMessages([...messages, newMessage]);

            // Send to Firebase
            await sendMessage(
                currentUserId,
                ownerUserId as string,
                text.trim(),
                itemId as string
            );

            setInput("");
            setShowSuggested(false);

            // Scroll to bottom
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
        } catch (error) {
            console.error("Error sending message:", error);
            // Remove the optimistic message
            setMessages(messages.slice(0, -1));
        } finally {
            setSending(false);
        }
    };

    const handleSuggestedMessage = (suggestedText: string) => {
        sendMessageHandler(suggestedText);
    };

    const renderMessage = ({ item }: any) => {
        const isMyMessage = item.senderId === currentUserId || item.sender === "me";

        return (
            <View
                style={[
                    styles.messageWrap,
                    isMyMessage ? styles.myWrap : styles.theirWrap,
                ]}
            >
                {!isMyMessage && ownerInfo && (
                    <Image
                        source={{ uri: ownerInfo.avatarUrl }}
                        style={styles.msgAvatar}
                    />
                )}
                <View
                    style={[
                        styles.bubble,
                        isMyMessage ? styles.myBubble : styles.theirBubble,
                    ]}
                >
                    <Text
                        style={[
                            styles.bubbleText,
                            isMyMessage && { color: "white" },
                        ]}
                    >
                        {item.text}
                    </Text>
                </View>
            </View>
        );
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={() => router.back()}
                        style={styles.backBtn}
                    >
                        <Text style={styles.backArrow}>←</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerName}>Loading...</Text>
                </View>
                <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                    <ActivityIndicator size="large" color={NAVY} />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={styles.backBtn}
                >
                    <Text style={styles.backArrow}>←</Text>
                </TouchableOpacity>
                {ownerInfo && (
                    <Image
                        source={{ uri: ownerInfo.avatarUrl }}
                        style={styles.headerAvatar}
                    />
                )}
                <View>
                    <Text style={styles.headerName}>
                        {ownerInfo?.username || "User"}
                    </Text>
                    <Text style={styles.headerStatus}>Online</Text>
                </View>
                <TouchableOpacity style={styles.moreBtn}>
                    <Text style={styles.moreDots}>⋮</Text>
                </TouchableOpacity>
            </View>

            {/* Item Card */}
            {itemTitle && (
                <View style={styles.offerCard}>
                    <View style={styles.offerInfo}>
                        <Text style={styles.offerTitle}>Interested in:</Text>
                        <Text style={styles.offerSub}>{itemTitle}</Text>
                    </View>
                </View>
            )}

            {/* Messages */}
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                keyboardVerticalOffset={90}
            >
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    renderItem={renderMessage}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.messagesList}
                    showsVerticalScrollIndicator={false}
                    onContentSizeChange={() => {
                        flatListRef.current?.scrollToEnd({ animated: true });
                    }}
                />

                {/* Suggested Messages */}
                {showSuggested && messages.length === 0 && (
                    <View style={styles.suggestedContainer}>
                        <Text style={styles.suggestedTitle}>Suggested messages:</Text>
                        <View style={styles.suggestedButtons}>
                            {SUGGESTED_MESSAGES.map((msg, index) => (
                                <TouchableOpacity
                                    key={index}
                                    style={styles.suggestedButton}
                                    onPress={() => handleSuggestedMessage(msg)}
                                >
                                    <Text style={styles.suggestedButtonText}>{msg}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                )}

                {/* Input bar */}
                <View style={styles.inputBar}>
                    <TextInput
                        style={styles.input}
                        placeholder="Message"
                        placeholderTextColor="#aaa"
                        value={input}
                        onChangeText={setInput}
                        editable={!sending}
                    />
                    <TouchableOpacity
                        style={[
                            styles.sendBtn,
                            (sending || !input.trim()) && styles.sendBtnDisabled,
                        ]}
                        onPress={() => sendMessageHandler(input)}
                        disabled={sending || !input.trim()}
                    >
                        {sending ? (
                            <ActivityIndicator size="small" color="white" />
                        ) : (
                            <Text style={styles.sendIcon}>➤</Text>
                        )}
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
    headerAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "#ddd",
    },
    headerName: { color: "white", fontWeight: "700", fontSize: 16 },
    headerStatus: { color: "#ccc", fontSize: 12 },
    moreBtn: { marginLeft: "auto" },
    moreDots: { color: "white", fontSize: 22 },
    offerCard: {
        padding: 14,
        backgroundColor: "#F3F4F6",
        borderBottomWidth: 1,
        borderBottomColor: "#eee",
    },
    offerInfo: { flex: 1 },
    offerTitle: { fontSize: 12, color: "#777", marginBottom: 4 },
    offerSub: { fontSize: 15, fontWeight: "700", color: "#111" },
    messagesList: {
        paddingVertical: 12,
        paddingHorizontal: 12,
    },
    messageWrap: {
        flexDirection: "row",
        marginBottom: 12,
        alignItems: "flex-end",
    },
    myWrap: {
        justifyContent: "flex-end",
    },
    theirWrap: {
        justifyContent: "flex-start",
    },
    msgAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        marginRight: 8,
        backgroundColor: "#ddd",
    },
    bubble: {
        maxWidth: "70%",
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 16,
    },
    myBubble: {
        backgroundColor: NAVY,
    },
    theirBubble: {
        backgroundColor: "#E5E7EB",
    },
    bubbleText: {
        fontSize: 14,
        color: "#111",
        lineHeight: 20,
    },
    suggestedContainer: {
        paddingHorizontal: 12,
        paddingVertical: 12,
        backgroundColor: "#F9FAFB",
        borderTopWidth: 1,
        borderTopColor: "#E5E7EB",
    },
    suggestedTitle: {
        fontSize: 12,
        fontWeight: "600",
        color: "#6B7280",
        marginBottom: 8,
    },
    suggestedButtons: {
        gap: 6,
    },
    suggestedButton: {
        backgroundColor: "white",
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#E5E7EB",
    },
    suggestedButtonText: {
        fontSize: 13,
        fontWeight: "500",
        color: NAVY,
    },
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
    },
    sendBtn: {
        backgroundColor: NAVY,
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: "center",
        alignItems: "center",
    },
    sendBtnDisabled: {
        opacity: 0.5,
    },
    sendIcon: { color: "white", fontSize: 18, fontWeight: "700" },
});