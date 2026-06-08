import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
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
import {
    TradeMessage,
    TradeOffer,
    TradeReview,
    sendTradeMessage,
    submitTradeReview,
    subscribeToTrade,
    subscribeToTradeMessages,
    updateTradeStatus,
} from "../services/tradeService";

const NAVY = "#2f2f6f";
const GREEN = "#27AE60";
const RED = "#C0392B";
const GOLD = "#C9A227";
const COMPLETE_GREEN = "#16A34A";

function formatTime(ts: any): string {
  if (!ts) return "";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(ts: any): string {
  if (!ts) return "";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function StatusPill({ status }: { status: TradeOffer["status"] }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    pending: { label: "Pending", bg: "#FFF4E0", color: GOLD },
    accepted: { label: "Accepted", bg: "#E8F8EF", color: GREEN },
    declined: { label: "Declined", bg: "#FDEDED", color: RED },
    cancelled: { label: "Cancelled", bg: "#F0F0F0", color: "#888" },
    completed: { label: "Completed", bg: "#E8F5E9", color: COMPLETE_GREEN },
  };
  const s = map[status] ?? map.pending;
  return (
    <View style={[styles.pill, { backgroundColor: s.bg }]}>
      <Text style={[styles.pillText, { color: s.color }]}>{s.label}</Text>
    </View>
  );
}

function StarRating({
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

interface TradeChatModalProps {
  visible: boolean;
  trade: TradeOffer | null;
  isOwner: boolean;
  onClose: () => void;
  onStatusChange?: (
    tradeId: string,
    newStatus: "accepted" | "declined",
  ) => void;
}

export const TradeChatModal: React.FC<TradeChatModalProps> = ({
  visible,
  trade,
  isOwner,
  onClose,
  onStatusChange,
}) => {
  const router = useRouter();
  const currentUser = auth.currentUser;

  const [messages, setMessages] = useState<TradeMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [actioning, setActioning] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const flatRef = useRef<FlatList>(null);

  // Live trade doc keeps status, completedBy, reviews up to date
  const [liveTrade, setLiveTrade] = useState<TradeOffer | null>(trade);

  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  // Sync liveTrade when trade prop changes
  useEffect(() => {
    setLiveTrade(trade);
  }, [trade?.id]);

  // Live subscription to the trade document
  useEffect(() => {
    if (!visible || !trade?.id) return;
    return subscribeToTrade(trade.id, (updated) => {
      if (updated) setLiveTrade(updated);
    });
  }, [visible, trade?.id]);

  // Live messages
  useEffect(() => {
    if (!visible || !trade) return;
    setLoadingMsgs(true);
    const unsub = subscribeToTradeMessages(trade.id, (msgs) => {
      setMessages(msgs);
      setLoadingMsgs(false);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
    });
    return unsub;
  }, [visible, trade?.id]);

  useEffect(() => {
    if (visible) setText("");
  }, [visible]);

  // ── Derived ──────────────────────────────────────────────────────────────

  const myUid = currentUser?.uid ?? "";

  // BUG FIX: derive other participant from participants array, not hardcoded role
  const otherParticipantUid =
    liveTrade?.participants?.find((p) => p !== myUid) ??
    (isOwner ? (liveTrade?.offererId ?? "") : (liveTrade?.ownerId ?? ""));

  const otherUserName = isOwner
    ? (liveTrade?.offererName ?? "Trader")
    : "Item Owner";
  const otherUserAvatar = isOwner ? (liveTrade?.offererAvatar ?? "") : "";

  // Reviews keyed by reviewer's uid
  const reviews: Record<string, TradeReview> = liveTrade?.reviews ?? {};
  const myReview: TradeReview | undefined = reviews[myUid];
  // BUG FIX: use derived otherParticipantUid, not targetUserId which could be wrong
  const theirReview: TradeReview | undefined = reviews[otherParticipantUid];
  const hasReviewed = !!myReview;
  const bothReviewed = !!myReview && !!theirReview;

  const isAccepted = liveTrade?.status === "accepted";
  const isCompleted = liveTrade?.status === "completed";
  const canAction = isOwner && liveTrade?.status === "pending";
  const isClosed =
    liveTrade?.status === "declined" || liveTrade?.status === "cancelled";

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSend = async () => {
    if (!text.trim() || !trade || !currentUser) return;
    setSending(true);
    try {
      await sendTradeMessage(
        trade.id,
        {
          uid: currentUser.uid,
          displayName: currentUser.displayName,
          photoURL: currentUser.photoURL,
        },
        text,
        otherParticipantUid,
      );
      setText("");
    } finally {
      setSending(false);
    }
  };

  const handleStatus = async (newStatus: "accepted" | "declined") => {
    if (!trade) return;
    setActioning(true);
    try {
      await updateTradeStatus(trade.id, newStatus);
      onStatusChange?.(trade.id, newStatus);
    } finally {
      setActioning(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!liveTrade || !currentUser || reviewRating === 0) return;
    setSubmittingReview(true);
    try {
      // BUG FIX: target is the other participant, derived correctly
      const bothDone = await submitTradeReview(
        liveTrade.id,
        currentUser.uid,
        otherParticipantUid,
        reviewRating,
        reviewComment.trim(),
      );
      setShowReviewModal(false);
      setReviewRating(0);
      setReviewComment("");
      if (bothDone) {
        Alert.alert(
          "Reviews Published! 🎉",
          "Both reviews are now live on your profiles.",
        );
      } else {
        Alert.alert(
          "Review Submitted!",
          "Waiting for the other person — both reviews reveal together.",
        );
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to submit review");
    } finally {
      setSubmittingReview(false);
    }
  };

  const goToProfile = (userId: string) => {
    if (!userId) return;
    onClose();
    setTimeout(() => {
      router.push({ pathname: "/user-profile", params: { userId } });
    }, 300);
  };

  if (!trade) return null;

  const grouped: (
    | { type: "date"; label: string }
    | { type: "msg"; msg: TradeMessage }
  )[] = [];
  let lastDate = "";
  for (const msg of messages) {
    const d = formatDate(msg.createdAt);
    if (d !== lastDate) {
      grouped.push({ type: "date", label: d });
      lastDate = d;
    }
    grouped.push({ type: "msg", msg });
  }

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.sheet}>
            <View style={styles.handle} />

            {/* Header — tappable to view other user's profile */}
            <View style={styles.header}>
              <TouchableOpacity onPress={onClose} style={styles.backBtn}>
                <Ionicons name="chevron-back" size={22} color={NAVY} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.headerCenter}
                onPress={() => goToProfile(otherParticipantUid)}
                activeOpacity={0.7}
              >
                {otherUserAvatar ? (
                  <Image
                    source={{ uri: otherUserAvatar }}
                    style={styles.headerAvatar}
                  />
                ) : (
                  <View
                    style={[styles.headerAvatar, styles.headerAvatarFallback]}
                  >
                    <Text style={styles.headerAvatarInitial}>
                      {otherUserName?.[0]?.toUpperCase() ?? "?"}
                    </Text>
                  </View>
                )}
                <View style={styles.headerNameBlock}>
                  <Text style={styles.headerTitle} numberOfLines={1}>
                    {otherUserName}
                  </Text>
                  <StatusPill status={liveTrade?.status ?? "pending"} />
                </View>
                <Ionicons name="chevron-forward" size={14} color="#AAAAAA" />
              </TouchableOpacity>

              <View style={{ width: 34 }} />
            </View>

            {/* Trade summary card */}
            <View style={styles.tradeCard}>
              <View style={styles.tradeCardSide}>
                {liveTrade?.offeredItemImage ? (
                  <Image
                    source={{ uri: liveTrade.offeredItemImage }}
                    style={styles.tradeCardImg}
                  />
                ) : (
                  <View style={[styles.tradeCardImg, styles.tradeCardImgEmpty]}>
                    <Ionicons name="cube-outline" size={18} color="#CCC" />
                  </View>
                )}
                <Text style={styles.tradeCardLabel} numberOfLines={2}>
                  {liveTrade?.offeredItemTitle}
                </Text>
                <Text style={styles.tradeCardSub}>Offered</Text>
              </View>
              <View style={styles.tradeCardArrow}>
                <Ionicons name="swap-horizontal" size={20} color={NAVY} />
              </View>
              <View style={styles.tradeCardSide}>
                {liveTrade?.requestedItemImage ? (
                  <Image
                    source={{ uri: liveTrade.requestedItemImage }}
                    style={styles.tradeCardImg}
                  />
                ) : (
                  <View style={[styles.tradeCardImg, styles.tradeCardImgEmpty]}>
                    <Ionicons name="cube-outline" size={18} color="#CCC" />
                  </View>
                )}
                <Text style={styles.tradeCardLabel} numberOfLines={2}>
                  {liveTrade?.requestedItemTitle}
                </Text>
                <Text style={styles.tradeCardSub}>Requested</Text>
              </View>
            </View>

            {/* ── Accepted: coordination banner (mark as finished in parent modals) ── */}
            {isAccepted && (
              <View style={styles.acceptedBanner}>
                <Ionicons name="checkmark-circle" size={16} color={GREEN} />
                <Text style={styles.acceptedBannerText}>
                  Trade accepted — coordinate your meetup below!
                </Text>
              </View>
            )}

            {/* ── Completed: review section ── */}
            {isCompleted && (
              <View style={styles.completedSection}>
                <View style={styles.completedBanner}>
                  <Ionicons name="trophy" size={16} color={COMPLETE_GREEN} />
                  <Text style={styles.completedBannerText}>
                    Trade Completed!
                  </Text>
                </View>

                {!hasReviewed ? (
                  <TouchableOpacity
                    style={styles.reviewPromptBtn}
                    onPress={() => setShowReviewModal(true)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="star-outline" size={16} color="#fff" />
                    <Text style={styles.reviewPromptBtnText}>
                      Rate Your Trade Partner
                    </Text>
                  </TouchableOpacity>
                ) : !bothReviewed ? (
                  <View style={styles.reviewWaiting}>
                    <Ionicons name="time-outline" size={14} color="#D97706" />
                    <Text style={styles.reviewWaitingText}>
                      Your review is in — waiting for theirs
                    </Text>
                  </View>
                ) : null}

                {/* Show their review only after both have submitted */}
                {bothReviewed && theirReview && (
                  <View style={styles.receivedReviewCard}>
                    <Text style={styles.receivedReviewHeader}>
                      Review from {otherUserName}
                    </Text>
                    <StarRating
                      rating={theirReview.rating}
                      size={20}
                      readonly
                    />
                    {theirReview.comment ? (
                      <Text style={styles.receivedReviewComment}>
                        "{theirReview.comment}"
                      </Text>
                    ) : null}
                  </View>
                )}
              </View>
            )}

            {/* Owner accept / decline */}
            {canAction && (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.declineBtn]}
                  onPress={() => handleStatus("declined")}
                  disabled={actioning}
                >
                  {actioning ? (
                    <ActivityIndicator size="small" color={RED} />
                  ) : (
                    <>
                      <Ionicons
                        name="close-circle-outline"
                        size={16}
                        color={RED}
                      />
                      <Text style={[styles.actionBtnText, { color: RED }]}>
                        Decline
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.acceptBtn]}
                  onPress={() => handleStatus("accepted")}
                  disabled={actioning}
                >
                  {actioning ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={16}
                        color="#fff"
                      />
                      <Text style={[styles.actionBtnText, { color: "#fff" }]}>
                        Accept
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Messages */}
            {loadingMsgs ? (
              <View style={styles.loaderBox}>
                <ActivityIndicator color={NAVY} />
              </View>
            ) : (
              <FlatList
                ref={flatRef}
                data={grouped}
                keyExtractor={(_, i) => String(i)}
                contentContainerStyle={styles.msgList}
                onContentSizeChange={() =>
                  flatRef.current?.scrollToEnd({ animated: false })
                }
                ListEmptyComponent={
                  <View style={styles.emptyChat}>
                    <Ionicons
                      name="chatbubbles-outline"
                      size={32}
                      color="#CCC"
                    />
                    <Text style={styles.emptyChatText}>
                      No messages yet.{"\n"}Say hi to kick off the trade!
                    </Text>
                  </View>
                }
                renderItem={({ item }) => {
                  if (item.type === "date") {
                    return (
                      <View style={styles.dateSep}>
                        <View style={styles.dateLine} />
                        <Text style={styles.dateLabel}>{item.label}</Text>
                        <View style={styles.dateLine} />
                      </View>
                    );
                  }
                  const { msg } = item;
                  const isMe = msg.senderId === myUid;
                  return (
                    <View
                      style={[
                        styles.bubbleRow,
                        isMe ? styles.bubbleRowMe : styles.bubbleRowThem,
                      ]}
                    >
                      {!isMe && (
                        <TouchableOpacity
                          onPress={() => goToProfile(otherParticipantUid)}
                          activeOpacity={0.8}
                        >
                          {msg.senderAvatar ? (
                            <Image
                              source={{ uri: msg.senderAvatar }}
                              style={styles.avatar}
                            />
                          ) : (
                            <View
                              style={[styles.avatar, styles.avatarFallback]}
                            >
                              <Text style={styles.avatarInitial}>
                                {msg.senderName?.[0]?.toUpperCase() ?? "?"}
                              </Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      )}
                      <View style={styles.bubbleWrap}>
                        {!isMe && (
                          <TouchableOpacity
                            onPress={() => goToProfile(otherParticipantUid)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.bubbleSender}>
                              {msg.senderName}
                            </Text>
                          </TouchableOpacity>
                        )}
                        <View
                          style={[
                            styles.bubble,
                            isMe ? styles.bubbleMe : styles.bubbleThem,
                          ]}
                        >
                          <Text
                            style={[
                              styles.bubbleText,
                              isMe
                                ? styles.bubbleTextMe
                                : styles.bubbleTextThem,
                            ]}
                          >
                            {msg.text}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.bubbleTime,
                            isMe ? styles.bubbleTimeMe : styles.bubbleTimeThem,
                          ]}
                        >
                          {formatTime(msg.createdAt)}
                        </Text>
                      </View>
                    </View>
                  );
                }}
              />
            )}

            {/* Input */}
            {!isClosed ? (
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  placeholder="Type a message…"
                  placeholderTextColor="#AAAAAA"
                  value={text}
                  onChangeText={setText}
                  multiline
                  maxLength={500}
                  editable={!sending}
                />
                <TouchableOpacity
                  style={[
                    styles.sendBtn,
                    (!text.trim() || sending) && styles.sendBtnDisabled,
                  ]}
                  onPress={handleSend}
                  disabled={!text.trim() || sending}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="send" size={18} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.closedBar}>
                <Text style={styles.closedBarText}>
                  This trade has been {liveTrade?.status}. Chat is read-only.
                </Text>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Review bottom sheet ── */}
      <Modal
        visible={showReviewModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowReviewModal(false)}
      >
        <View style={styles.reviewOverlay}>
          <View style={styles.reviewSheet}>
            <View style={styles.handle} />
            <Text style={styles.reviewTitle}>Rate your trade</Text>
            <Text style={styles.reviewSubtitle}>
              How was trading with {otherUserName}?
            </Text>
            <StarRating
              rating={reviewRating}
              onRate={setReviewRating}
              size={42}
            />
            <TextInput
              style={styles.reviewInput}
              placeholder="Share your experience (optional)…"
              placeholderTextColor="#AAAAAA"
              value={reviewComment}
              onChangeText={setReviewComment}
              multiline
              maxLength={300}
              textAlignVertical="top"
            />
            <Text style={styles.reviewDisclaimer}>
              Your review is hidden until the other person also submits — both
              reveal at the same time.
            </Text>
            <TouchableOpacity
              style={[
                styles.reviewSubmitBtn,
                (reviewRating === 0 || submittingReview) &&
                  styles.reviewSubmitBtnDisabled,
              ]}
              onPress={handleSubmitReview}
              disabled={reviewRating === 0 || submittingReview}
              activeOpacity={0.85}
            >
              {submittingReview ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.reviewSubmitBtnText}>Submit Review</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.reviewCancelBtn}
              onPress={() => setShowReviewModal(false)}
            >
              <Text style={styles.reviewCancelText}>Maybe Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 10,
    maxHeight: "94%",
    flex: 1,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DDD",
    alignSelf: "center",
    marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F0F0F0",
    justifyContent: "center",
    alignItems: "center",
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F7F8FC",
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E8E8E8",
  },
  headerAvatarFallback: {
    backgroundColor: NAVY,
    justifyContent: "center",
    alignItems: "center",
  },
  headerAvatarInitial: { fontSize: 13, fontWeight: "700", color: "#fff" },
  headerNameBlock: { flex: 1, gap: 2 },
  headerTitle: { fontSize: 14, fontWeight: "800", color: "#1A1A2E" },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  pillText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tradeCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    backgroundColor: "#F7F8FC",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#ECECEC",
  },
  tradeCardSide: { flex: 1, alignItems: "center", gap: 5 },
  tradeCardImg: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: "#E8E8E8",
  },
  tradeCardImgEmpty: { justifyContent: "center", alignItems: "center" },
  tradeCardLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1A1A2E",
    textAlign: "center",
    maxWidth: 90,
  },
  tradeCardSub: {
    fontSize: 10,
    color: "#AAAAAA",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  tradeCardArrow: {
    paddingHorizontal: 8,
    backgroundColor: "#ECEDF8",
    borderRadius: 16,
    padding: 6,
  },
  acceptedBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F8EF",
    marginHorizontal: 16,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
    marginBottom: 8,
  },
  acceptedBannerText: {
    fontSize: 12,
    color: GREEN,
    fontWeight: "600",
    flex: 1,
  },
  completedSection: { marginHorizontal: 16, marginBottom: 10, gap: 8 },
  completedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#E8F5E9",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  completedBannerText: {
    fontSize: 14,
    fontWeight: "700",
    color: COMPLETE_GREEN,
  },
  reviewPromptBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFB800",
    borderRadius: 12,
    paddingVertical: 11,
  },
  reviewPromptBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  reviewWaiting: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFF7ED",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  reviewWaitingText: { fontSize: 13, color: "#D97706", fontWeight: "600" },
  receivedReviewCard: {
    backgroundColor: "#F7F8FC",
    borderRadius: 12,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: "#ECECEC",
    alignItems: "center",
  },
  receivedReviewHeader: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 4,
  },
  receivedReviewComment: {
    fontSize: 13,
    color: "#555",
    fontStyle: "italic",
    textAlign: "center",
    lineHeight: 18,
    marginTop: 4,
  },
  actionRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    gap: 10,
    marginBottom: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
  },
  declineBtn: {
    backgroundColor: "#FDEDED",
    borderWidth: 1.5,
    borderColor: RED,
  },
  acceptBtn: { backgroundColor: NAVY },
  actionBtnText: { fontSize: 14, fontWeight: "700" },
  loaderBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 32,
  },
  msgList: { paddingHorizontal: 16, paddingVertical: 8, flexGrow: 1 },
  emptyChat: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyChatText: {
    fontSize: 13,
    color: "#AAAAAA",
    textAlign: "center",
    lineHeight: 20,
  },
  dateSep: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 10,
    gap: 8,
  },
  dateLine: { flex: 1, height: 1, backgroundColor: "#ECECEC" },
  dateLabel: { fontSize: 11, color: "#AAAAAA", fontWeight: "600" },
  bubbleRow: {
    flexDirection: "row",
    marginBottom: 10,
    alignItems: "flex-end",
    gap: 6,
  },
  bubbleRowMe: { justifyContent: "flex-end" },
  bubbleRowThem: { justifyContent: "flex-start" },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E8E8E8",
  },
  avatarFallback: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: NAVY,
  },
  avatarInitial: { fontSize: 12, fontWeight: "700", color: "#fff" },
  bubbleWrap: { maxWidth: "72%" },
  bubbleSender: {
    fontSize: 11,
    color: "#888",
    marginBottom: 3,
    marginLeft: 4,
    fontWeight: "600",
  },
  bubble: { borderRadius: 18, paddingVertical: 9, paddingHorizontal: 14 },
  bubbleMe: { backgroundColor: NAVY, borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: "#F0F1F8", borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextMe: { color: "#fff" },
  bubbleTextThem: { color: "#1A1A2E" },
  bubbleTime: { fontSize: 10, color: "#BBBBBB", marginTop: 3 },
  bubbleTimeMe: { textAlign: "right", marginRight: 4 },
  bubbleTimeThem: { textAlign: "left", marginLeft: 4 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
    gap: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: "#1A1A2E",
    maxHeight: 100,
    backgroundColor: "#FAFAFA",
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: NAVY,
    justifyContent: "center",
    alignItems: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
  closedBar: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
    alignItems: "center",
  },
  closedBarText: { fontSize: 12, color: "#AAAAAA", fontStyle: "italic" },
  reviewOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  reviewSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
    gap: 14,
  },
  reviewTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1A1A2E",
    textAlign: "center",
  },
  reviewSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginTop: -6,
  },
  reviewInput: {
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
  reviewDisclaimer: {
    fontSize: 11,
    color: "#AAAAAA",
    textAlign: "center",
    lineHeight: 16,
    marginTop: -4,
  },
  reviewSubmitBtn: {
    backgroundColor: NAVY,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  reviewSubmitBtnDisabled: { opacity: 0.4 },
  reviewSubmitBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  reviewCancelBtn: { alignItems: "center", paddingVertical: 4 },
  reviewCancelText: { fontSize: 14, color: "#AAAAAA", fontWeight: "600" },
});
