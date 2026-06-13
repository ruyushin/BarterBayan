import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth } from "../firebaseConfig";
import { submitTradeReview, TradeOffer } from "../services/tradeService";

const NAVY = "#2f2f6f";

// ─────────────────────────────────────────────────────────────────────────────
// StarRating
// ─────────────────────────────────────────────────────────────────────────────
export function StarRating({
  rating,
  onRate,
  size = 36,
  readonly = false,
}: {
  rating: number;
  onRate?: (r: number) => void;
  size?: number;
  readonly?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 6, justifyContent: "center" }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity
          key={star}
          onPress={() => !readonly && onRate?.(star)}
          disabled={readonly}
          activeOpacity={readonly ? 1 : 0.7}
        >
          <Ionicons
            name={star <= rating ? "star" : "star-outline"}
            size={size}
            color={star <= rating ? "#FFB800" : "#DDD"}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ReviewSuccessModal — defined FIRST so RatingModal can reference it safely
//
// Two variants:
//   bothPublished=true  → both parties reviewed → reviews are now live
//   bothPublished=false → only one side done    → waiting for the other person
// ─────────────────────────────────────────────────────────────────────────────
interface ReviewSuccessModalProps {
  visible: boolean;
  bothPublished: boolean;
  submittedRating: number;
  onClose: () => void;
}

export function ReviewSuccessModal({
  visible,
  bothPublished,
  submittedRating,
  onClose,
}: ReviewSuccessModalProps) {
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scaleAnim.setValue(0.7);
      opacityAnim.setValue(0);
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          damping: 14,
          stiffness: 180,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={successStyles.overlay}>
        <Animated.View
          style={[
            successStyles.card,
            { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
          ]}
        >
          {/* Icon circle */}
          <View
            style={[
              successStyles.iconCircle,
              bothPublished
                ? successStyles.iconCircleGreen
                : successStyles.iconCircleNavy,
            ]}
          >
            <Ionicons
              name={bothPublished ? "trophy" : "time"}
              size={38}
              color="#fff"
            />
          </View>

          {/* Headline */}
          <Text style={successStyles.title}>
            {bothPublished ? "Reviews Published! 🎉" : "Review Submitted!"}
          </Text>

          {/* Body */}
          <Text style={successStyles.body}>
            {bothPublished
              ? "Both reviews are now live on your profiles. Your trade partner can see your feedback!"
              : "Your review is locked in. We're waiting for the other person to submit theirs — both will reveal at the same time."}
          </Text>

          {/* Star recap */}
          <View style={successStyles.starsRow}>
            {[1, 2, 3, 4, 5].map((s) => (
              <Ionicons
                key={s}
                name={s <= submittedRating ? "star" : "star-outline"}
                size={28}
                color={s <= submittedRating ? "#FFB800" : "#DDD"}
              />
            ))}
          </View>

          {/* Status pill */}
          <View
            style={[
              successStyles.statusPill,
              bothPublished
                ? successStyles.statusPillGreen
                : successStyles.statusPillNavy,
            ]}
          >
            <Ionicons
              name={bothPublished ? "checkmark-circle" : "lock-closed"}
              size={13}
              color={bothPublished ? "#16A34A" : NAVY}
            />
            <Text
              style={[
                successStyles.statusPillText,
                bothPublished
                  ? successStyles.statusPillTextGreen
                  : successStyles.statusPillTextNavy,
              ]}
            >
              {bothPublished ? "Both reviews are live" : "Waiting for other party"}
            </Text>
          </View>

          {/* Done button */}
          <TouchableOpacity
            style={[
              successStyles.doneBtn,
              bothPublished
                ? successStyles.doneBtnGreen
                : successStyles.doneBtnNavy,
            ]}
            onPress={onClose}
            activeOpacity={0.85}
          >
            <Text style={successStyles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RatingModal
// ─────────────────────────────────────────────────────────────────────────────
interface RatingModalProps {
  visible: boolean;
  tradeId: string;
  currentUserUid: string;
  otherUserUid: string;
  otherUserName: string;
  onClose: () => void;
  onSubmitted?: (bothDone: boolean) => void;
}

export const RatingModal: React.FC<RatingModalProps> = ({
  visible,
  tradeId,
  currentUserUid,
  otherUserUid,
  otherUserName,
  onClose,
  onSubmitted,
}) => {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [androidKbHeight, setAndroidKbHeight] = useState(0);
  const [successVisible, setSuccessVisible] = useState(false);
  const [bothPublished, setBothPublished] = useState(false);

  const MAX_CHARS = 300;

  // Android-only keyboard offset (KeyboardAvoidingView misbehaves in Modals on Android)
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      setAndroidKbHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      setAndroidKbHeight(0);
    });
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    if (visible) {
      setRating(0);
      setComment("");
      setSuccessVisible(false);
      setBothPublished(false);
    }
  }, [visible, tradeId]);

  const handleSubmit = async () => {
    if (rating === 0 || !tradeId || !currentUserUid) return;
    setSubmitting(true);
    try {
      const bothDone = await submitTradeReview(
        tradeId,
        currentUserUid,
        otherUserUid,
        rating,
        comment.trim(),
      );
      onSubmitted?.(bothDone);
      onClose();
      setBothPublished(bothDone);
      setSuccessVisible(true);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  };

  const charsLeft = MAX_CHARS - comment.length;

  const sheet = (
    <View
      style={[
        ratingStyles.sheet,
        Platform.OS === "android" && androidKbHeight > 0
          ? { marginBottom: androidKbHeight }
          : undefined,
      ]}
    >
      <View style={ratingStyles.handle} />
      <Text style={ratingStyles.title}>Rate your trade</Text>
      <Text style={ratingStyles.subtitle}>
        How was trading with {otherUserName}?
      </Text>

      <StarRating rating={rating} onRate={setRating} size={42} />

      <View>
        <TextInput
          style={ratingStyles.input}
          placeholder="Share your experience (optional)…"
          placeholderTextColor="#AAAAAA"
          value={comment}
          onChangeText={(t) => setComment(t.slice(0, MAX_CHARS))}
          multiline
          maxLength={MAX_CHARS}
          textAlignVertical="top"
          editable={!submitting}
        />
        <Text
          style={[
            ratingStyles.charCount,
            charsLeft <= 20 && ratingStyles.charCountWarn,
          ]}
        >
          {charsLeft}/{MAX_CHARS}
        </Text>
      </View>

      <Text style={ratingStyles.disclaimer}>
        Your review is hidden until the other person also submits — both
        reveal at the same time.
      </Text>

      <TouchableOpacity
        style={[
          ratingStyles.submitBtn,
          (rating === 0 || submitting) && ratingStyles.submitBtnDisabled,
        ]}
        onPress={handleSubmit}
        disabled={rating === 0 || submitting}
        activeOpacity={0.85}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={ratingStyles.submitBtnText}>Submit Review</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={ratingStyles.cancelBtn}
        onPress={onClose}
        disabled={submitting}
      >
        <Text style={ratingStyles.cancelText}>Maybe Later</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        {Platform.OS === "ios" ? (
          <KeyboardAvoidingView style={ratingStyles.overlay} behavior="padding">
            {sheet}
          </KeyboardAvoidingView>
        ) : (
          <View style={ratingStyles.overlay}>{sheet}</View>
        )}
      </Modal>

      {/* Success modal lives outside the rating Modal so it's never clipped */}
      <ReviewSuccessModal
        visible={successVisible}
        bothPublished={bothPublished}
        submittedRating={rating}
        onClose={() => setSuccessVisible(false)}
      />
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TradeChatModal
// ─────────────────────────────────────────────────────────────────────────────
interface ChatMessage {
  id: string;
  senderUid: string;
  text: string;
  createdAt: Date;
}

interface TradeChatModalProps {
  visible: boolean;
  trade: TradeOffer | null;
  isOwner: boolean;
  onClose: () => void;
  onStatusChange: (newStatus: TradeOffer["status"]) => void;
}

export const TradeChatModal: React.FC<TradeChatModalProps> = ({
  visible,
  trade,
  isOwner,
  onClose,
  onStatusChange,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [androidKbHeight, setAndroidKbHeight] = useState(0);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  const MAX_CHARS = 300;
  const myUid = auth.currentUser?.uid ?? "";

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      setAndroidKbHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      setAndroidKbHeight(0);
    });
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    if (!visible || !trade?.id) {
      setMessages([]);
      return;
    }
    let unsub: (() => void) | null = null;
    try {
      const { subscribeToTradeMessages } = require("../services/tradeService");
      unsub = subscribeToTradeMessages(
        trade.id,
        (msgs: ChatMessage[]) => setMessages(msgs),
      );
    } catch {
      // not yet implemented — show empty state
    }
    return () => unsub?.();
  }, [visible, trade?.id]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !trade?.id || sending) return;
    setSending(true);
    setInputText("");
    try {
      const { sendTradeMessage } = require("../services/tradeService");
      await sendTradeMessage(trade.id, myUid, text);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to send message.");
      setInputText(text);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (d: Date) =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMine = item.senderUid === myUid;
    return (
      <View
        style={[
          chatStyles.bubble,
          isMine ? chatStyles.bubbleMine : chatStyles.bubbleTheirs,
        ]}
      >
        <Text
          style={[
            chatStyles.bubbleText,
            isMine ? chatStyles.bubbleTextMine : chatStyles.bubbleTextTheirs,
          ]}
        >
          {item.text}
        </Text>
        <Text
          style={[
            chatStyles.bubbleTime,
            isMine ? chatStyles.bubbleTimeMine : chatStyles.bubbleTimeTheirs,
          ]}
        >
          {formatTime(item.createdAt)}
        </Text>
      </View>
    );
  };

  const charsLeft = MAX_CHARS - inputText.length;

  const sheet = (
    <View
      style={[
        chatStyles.sheet,
        Platform.OS === "android" && androidKbHeight > 0
          ? { marginBottom: androidKbHeight }
          : undefined,
      ]}
    >
      <View style={chatStyles.handle} />

      {/* Header */}
      <View style={chatStyles.header}>
        <View style={{ flex: 1 }}>
          <Text style={chatStyles.headerTitle} numberOfLines={1}>
            {trade
              ? `${trade.offeredItemTitle} ↔ ${trade.requestedItemTitle}`
              : "Trade Chat"}
          </Text>
          <Text style={chatStyles.headerSub}>
            {isOwner ? "You're the item owner" : "You sent this offer"}
          </Text>
        </View>
        <TouchableOpacity
          style={chatStyles.closeBtn}
          onPress={onClose}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={18} color="#6B7280" />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      {messages.length === 0 ? (
        <View style={chatStyles.emptyState}>
          <Ionicons name="chatbubbles-outline" size={44} color="#DDD" />
          <Text style={chatStyles.emptyText}>No messages yet</Text>
          <Text style={chatStyles.emptySubText}>
            Start the conversation about this trade.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          contentContainerStyle={chatStyles.messageList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: false })
          }
        />
      )}

      {/* Input bar */}
      <View style={chatStyles.inputRow}>
        <View style={{ flex: 1 }}>
          <TextInput
            style={chatStyles.input}
            placeholder="Type a message…"
            placeholderTextColor="#AAAAAA"
            value={inputText}
            onChangeText={(t) => setInputText(t.slice(0, MAX_CHARS))}
            multiline
            maxLength={MAX_CHARS}
            textAlignVertical="top"
            editable={!sending}
            returnKeyType="default"
          />
          {inputText.length > MAX_CHARS * 0.8 && (
            <Text
              style={[
                chatStyles.charCount,
                charsLeft <= 20 && chatStyles.charCountWarn,
              ]}
            >
              {charsLeft}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={[
            chatStyles.sendBtn,
            (!inputText.trim() || sending) && chatStyles.sendBtnDisabled,
          ]}
          onPress={handleSend}
          disabled={!inputText.trim() || sending}
          activeOpacity={0.8}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={17} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {Platform.OS === "ios" ? (
        <KeyboardAvoidingView style={chatStyles.overlay} behavior="padding">
          {sheet}
        </KeyboardAvoidingView>
      ) : (
        <View style={chatStyles.overlay}>{sheet}</View>
      )}
    </Modal>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const successStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  card: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 28,
    paddingHorizontal: 28,
    paddingTop: 36,
    paddingBottom: 28,
    alignItems: "center",
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 20,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  iconCircleGreen: { backgroundColor: "#16A34A" },
  iconCircleNavy: { backgroundColor: NAVY },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1A1A2E",
    textAlign: "center",
  },
  body: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 21,
  },
  starsRow: {
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    marginVertical: 2,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  statusPillGreen: { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" },
  statusPillNavy: { backgroundColor: "#ECEDF8", borderColor: "#C7C9F0" },
  statusPillText: { fontSize: 12, fontWeight: "700" },
  statusPillTextGreen: { color: "#16A34A" },
  statusPillTextNavy: { color: NAVY },
  doneBtn: {
    width: "100%",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 4,
  },
  doneBtnGreen: { backgroundColor: "#16A34A" },
  doneBtnNavy: { backgroundColor: NAVY },
  doneBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});

const ratingStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
    gap: 14,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DDD",
    alignSelf: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1A1A2E",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginTop: -6,
  },
  input: {
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: "#1A1A2E",
    height: 90,
    backgroundColor: "#FAFAFA",
  },
  charCount: {
    fontSize: 11,
    color: "#AAAAAA",
    textAlign: "right",
    marginTop: 4,
    marginRight: 2,
  },
  charCountWarn: { color: "#E11D48" },
  disclaimer: {
    fontSize: 11,
    color: "#AAAAAA",
    textAlign: "center",
    lineHeight: 16,
    marginTop: -4,
  },
  submitBtn: {
    backgroundColor: NAVY,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  cancelBtn: { alignItems: "center", paddingVertical: 4 },
  cancelText: { fontSize: 14, color: "#AAAAAA", fontWeight: "600" },
});

const chatStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingBottom: 16,
    maxHeight: "85%",
    minHeight: "55%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    alignSelf: "center",
    marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
    gap: 10,
  },
  headerTitle: { fontSize: 14, fontWeight: "700", color: "#111827" },
  headerSub: { fontSize: 11, color: "#9CA3AF", marginTop: 1 },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 40,
  },
  emptyText: { fontSize: 15, fontWeight: "700", color: "#9CA3AF" },
  emptySubText: {
    fontSize: 12,
    color: "#C4C4C4",
    textAlign: "center",
    paddingHorizontal: 32,
  },
  messageList: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 6,
    flexGrow: 1,
  },
  bubble: {
    maxWidth: "78%",
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 9,
    marginBottom: 4,
  },
  bubbleMine: {
    backgroundColor: NAVY,
    alignSelf: "flex-end",
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: "#F3F4F6",
    alignSelf: "flex-start",
    borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 14, lineHeight: 19 },
  bubbleTextMine: { color: "#fff" },
  bubbleTextTheirs: { color: "#111827" },
  bubbleTime: { fontSize: 10, marginTop: 3 },
  bubbleTimeMine: { color: "rgba(255,255,255,0.55)", textAlign: "right" },
  bubbleTimeTheirs: { color: "#9CA3AF" },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    fontSize: 14,
    color: "#1A1A2E",
    maxHeight: 100,
    backgroundColor: "#FAFAFA",
  },
  charCount: {
    fontSize: 10,
    color: "#AAAAAA",
    textAlign: "right",
    marginTop: 2,
    marginRight: 4,
  },
  charCountWarn: { color: "#E11D48" },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: NAVY,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },
  sendBtnDisabled: { opacity: 0.35 },
});