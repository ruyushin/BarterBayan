import { Ionicons } from "@expo/vector-icons";
import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../firebaseConfig";
import {
  TradeOffer,
  TradeReview,
  completeTrade,
  submitTradeReview,
  subscribeToOffersForItem,
  updateTradeStatus,
} from "../services/tradeService";
import { TradeChatModal } from "./TradeChatModal";

const NAVY = "#2f2f6f";
const GREEN = "#27AE60";
const RED = "#C0392B";
const GOLD = "#C9A227";
const COMPLETE_GREEN = "#16A34A";

// ─── Section config (same order/palette as trade.tsx) ────────────────────────
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: "#FFF7ED", text: "#D97706" },
  accepted: { bg: "#F0FDF4", text: "#16A34A" },
  declined: { bg: "#FFF1F2", text: "#E11D48" },
  cancelled: { bg: "#F3F4F6", text: "#6B7280" },
  completed: { bg: "#E8F5E9", text: "#16A34A" },
};

const OFFER_SECTIONS: {
  key: TradeOffer["status"];
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "accepted", label: "Accepted", icon: "checkmark-circle" },
  { key: "pending", label: "Pending", icon: "time" },
  { key: "completed", label: "Completed", icon: "trophy" },
  { key: "declined", label: "Declined", icon: "close-circle" },
  { key: "cancelled", label: "Cancelled", icon: "ban" },
];

interface TradeOffersModalProps {
  visible: boolean;
  itemId: string | null;
  itemTitle: string;
  onClose: () => void;
}

// ─── Offerer name cache ───────────────────────────────────────────────────────
const offererNameCache: Record<string, string> = {};
async function fetchOffererName(uid: string): Promise<string> {
  if (offererNameCache[uid]) return offererNameCache[uid];
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      const name =
        snap.data().username || snap.data().displayName || "Unknown User";
      offererNameCache[uid] = name;
      return name;
    }
  } catch {}
  offererNameCache[uid] = "Unknown User";
  return "Unknown User";
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function StarRating({
  rating,
  onRate,
  size = 32,
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

// ─── Section header (matches trade.tsx style) ─────────────────────────────────
function SectionHeader({
  sectionKey,
  label,
  icon,
  count,
}: {
  sectionKey: TradeOffer["status"];
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  count: number;
}) {
  const colors = STATUS_COLORS[sectionKey] || STATUS_COLORS.pending;
  return (
    <View style={[s2.sectionHeader, { borderLeftColor: colors.text }]}>
      <View style={[s2.sectionHeaderIconWrap, { backgroundColor: colors.bg }]}>
        <Ionicons name={icon} size={15} color={colors.text} />
      </View>
      <Text style={[s2.sectionHeaderText, { color: colors.text }]}>
        {label}
      </Text>
      <View style={[s2.sectionHeaderBadge, { backgroundColor: colors.bg }]}>
        <Text style={[s2.sectionHeaderBadgeText, { color: colors.text }]}>
          {count}
        </Text>
      </View>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export const TradeOffersModal: React.FC<TradeOffersModalProps> = ({
  visible,
  itemId,
  itemTitle,
  onClose,
}) => {
  const [offers, setOffers] = useState<TradeOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [chatTrade, setChatTrade] = useState<TradeOffer | null>(null);
  const [offererNames, setOffererNames] = useState<Record<string, string>>({});

  const [markingId, setMarkingId] = useState<string | null>(null);
  const [optimisticMarked, setOptimisticMarked] = useState<Set<string>>(
    new Set(),
  );

  const [reviewOffer, setReviewOffer] = useState<TradeOffer | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  const currentUser = auth.currentUser;
  const myUid = currentUser?.uid ?? "";

  useEffect(() => {
    if (!visible || !itemId) return;
    setLoading(true);
    const unsub = subscribeToOffersForItem(itemId, (incoming) => {
      setOffers(incoming);
      setLoading(false);
      incoming.forEach((offer) => {
        const uid = offer.offererId ?? "";
        if (!uid || offererNames[uid]) return;
        fetchOffererName(uid).then((name) =>
          setOffererNames((prev) => ({ ...prev, [uid]: name })),
        );
      });
    });
    return unsub;
  }, [visible, itemId]);

  useEffect(() => {
    if (!visible) {
      setOffers([]);
      setChatTrade(null);
      setOptimisticMarked(new Set());
    }
  }, [visible]);

  const handleStatus = async (
    offer: TradeOffer,
    newStatus: "accepted" | "declined",
  ) => {
    setActioning(offer.id);
    try {
      await updateTradeStatus(offer.id, newStatus);
    } finally {
      setActioning(null);
    }
  };

  const handleMarkFinished = async (offer: TradeOffer) => {
    if (!currentUser) return;
    setOptimisticMarked((prev) => new Set([...prev, offer.id]));
    setMarkingId(offer.id);
    try {
      await completeTrade(offer.id, currentUser.uid);
    } catch {
      setOptimisticMarked((prev) => {
        const next = new Set(prev);
        next.delete(offer.id);
        return next;
      });
    } finally {
      setMarkingId(null);
    }
  };

  const handleSubmitReview = async () => {
    if (!reviewOffer || !currentUser || reviewRating === 0) return;
    setSubmittingReview(true);
    try {
      await submitTradeReview(
        reviewOffer.id,
        currentUser.uid,
        reviewOffer.offererId,
        reviewRating,
        reviewComment.trim(),
      );
      setReviewOffer(null);
      setReviewRating(0);
      setReviewComment("");
    } catch {
      // silently fail — user can retry
    } finally {
      setSubmittingReview(false);
    }
  };

  // Build sections — only include non-empty groups
  const offerSections = OFFER_SECTIONS.map((section) => ({
    ...section,
    data: offers.filter((o) => o.status === section.key),
  })).filter((section) => section.data.length > 0);

  const totalVisible = offers.length;

  // ─── Render a single offer row with all interactive controls ───────────────
  const renderOfferItem = ({
    item: offer,
    section,
  }: {
    item: TradeOffer;
    section: (typeof offerSections)[number];
  }) => {
    const uid = offer.offererId ?? "";
    const offererDisplayName =
      offererNames[uid] || offer.offererName || "Loading…";
    const isActioning = actioning === offer.id;
    const isPending = offer.status === "pending";
    const isAccepted = offer.status === "accepted";
    const isCompleted = offer.status === "completed";

    const hasMarked =
      optimisticMarked.has(offer.id) ||
      (offer.completedBy?.includes(myUid) ?? false);
    const otherMarked =
      (offer.completedBy?.length ?? 0) > 0 &&
      !(offer.completedBy?.includes(myUid) ?? false);

    const myReview: TradeReview | undefined = offer.reviews?.[myUid];
    const theirReview: TradeReview | undefined =
      offer.reviews?.[offer.offererId];
    const bothReviewed = !!myReview && !!theirReview;

    return (
      <View style={s2.card}>
        {/* ── Offerer header ── */}
        <View style={s2.cardHeader}>
          {offer.offererAvatar ? (
            <Image
              source={{ uri: offer.offererAvatar }}
              style={s2.cardAvatar}
            />
          ) : (
            <View style={[s2.cardAvatar, s2.cardAvatarFallback]}>
              <Text style={s2.cardAvatarInitial}>
                {offererDisplayName?.[0]?.toUpperCase() ?? "?"}
              </Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={s2.cardName} numberOfLines={1}>
              {offererDisplayName}
            </Text>
            <Text style={s2.cardDate}>
              {offer.createdAt?.toDate
                ? offer.createdAt
                    .toDate()
                    .toLocaleDateString([], { month: "short", day: "numeric" })
                : ""}
            </Text>
          </View>
        </View>

        {/* ── Offered item ── */}
        <View style={s2.cardItem}>
          {offer.offeredItemImage ? (
            <Image
              source={{ uri: offer.offeredItemImage }}
              style={s2.cardItemImg}
            />
          ) : (
            <View style={[s2.cardItemImg, s2.cardItemImgEmpty]}>
              <Ionicons name="image-outline" size={18} color="#CCC" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={s2.cardItemMeta}>They're offering:</Text>
            <Text style={s2.cardItemTitle} numberOfLines={2}>
              {offer.offeredItemTitle}
            </Text>
          </View>
        </View>

        {/* ── Optional message ── */}
        {offer.message ? (
          <View style={s2.cardMessage}>
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={12}
              color="#888"
            />
            <Text style={s2.cardMessageText} numberOfLines={3}>
              "{offer.message}"
            </Text>
          </View>
        ) : null}

        {/* ── Actions row ── */}
        <View style={s2.cardActions}>
          <TouchableOpacity
            style={s2.msgBtn}
            onPress={() => setChatTrade(offer)}
            activeOpacity={0.8}
          >
            <Ionicons name="chatbubble-outline" size={15} color={NAVY} />
            <Text style={s2.msgBtnText}>Message</Text>
          </TouchableOpacity>

          {isPending && (
            <>
              <TouchableOpacity
                style={[s2.actionBtn, s2.declineBtn]}
                onPress={() => handleStatus(offer, "declined")}
                disabled={isActioning}
                activeOpacity={0.8}
              >
                {isActioning ? (
                  <ActivityIndicator size="small" color={RED} />
                ) : (
                  <Text style={[s2.actionBtnText, { color: RED }]}>
                    Decline
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[s2.actionBtn, s2.acceptBtn]}
                onPress={() => handleStatus(offer, "accepted")}
                disabled={isActioning}
                activeOpacity={0.8}
              >
                {isActioning ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[s2.actionBtnText, { color: "#fff" }]}>
                    Accept
                  </Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── Mark as Finished (accepted only) ── */}
        {isAccepted &&
          (hasMarked ? (
            <View style={s2.waitingBanner}>
              <Ionicons name="time-outline" size={15} color="#D97706" />
              <View style={{ flex: 1 }}>
                <Text style={s2.waitingTitle}>
                  Waiting for {offererDisplayName} to confirm
                </Text>
                <Text style={s2.waitingSubtitle}>
                  They'll be notified to confirm their side. Trade completes
                  once both confirm.
                </Text>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={[s2.markBtn, otherMarked && s2.markBtnHighlight]}
              onPress={() => handleMarkFinished(offer)}
              disabled={markingId === offer.id}
              activeOpacity={0.85}
            >
              {markingId === offer.id ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons
                    name="checkmark-done-circle"
                    size={17}
                    color="#fff"
                  />
                  <Text style={s2.markBtnText}>
                    {otherMarked
                      ? `${offererDisplayName} confirmed — tap to complete!`
                      : "Mark Trade as Finished"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          ))}

        {/* ── Completed banner ── */}
        {isCompleted && (
          <View style={s2.completedBanner}>
            <Ionicons name="trophy" size={15} color={COMPLETE_GREEN} />
            <Text style={s2.completedText}>Trade Completed!</Text>
          </View>
        )}

        {/* ── Review section (completed only) ── */}
        {isCompleted && !myReview && (
          <TouchableOpacity
            style={s2.reviewBtn}
            onPress={() => {
              setReviewOffer(offer);
              setReviewRating(0);
              setReviewComment("");
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="star-outline" size={15} color="#fff" />
            <Text style={s2.reviewBtnText}>Rate {offererDisplayName}</Text>
          </TouchableOpacity>
        )}

        {isCompleted && myReview && !bothReviewed && (
          <View style={s2.reviewWaiting}>
            <Ionicons name="time-outline" size={13} color="#D97706" />
            <Text style={s2.reviewWaitingText}>
              Your review is in — waiting for theirs
            </Text>
          </View>
        )}

        {bothReviewed && theirReview && (
          <View style={s2.receivedReview}>
            <Text style={s2.receivedReviewHeader}>
              Review from {offererDisplayName}
            </Text>
            <StarRating rating={theirReview.rating} size={16} readonly />
            {theirReview.comment ? (
              <Text style={s2.receivedReviewComment}>
                "{theirReview.comment}"
              </Text>
            ) : null}
          </View>
        )}
      </View>
    );
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={s2.overlay}>
          <View style={s2.sheet}>
            <View style={s2.handle} />

            <View style={s2.header}>
              <View style={{ flex: 1 }}>
                <Text style={s2.title}>Offers on</Text>
                <Text style={s2.itemName} numberOfLines={1}>
                  {itemTitle}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={s2.closeBtn}>
                <Ionicons name="close" size={20} color="#555" />
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={s2.loaderBox}>
                <ActivityIndicator color={NAVY} />
                <Text style={s2.loaderText}>Loading offers…</Text>
              </View>
            ) : totalVisible === 0 ? (
              <View style={s2.emptyBox}>
                <Ionicons name="cube-outline" size={40} color="#CCC" />
                <Text style={s2.emptyTitle}>No offers yet</Text>
                <Text style={s2.emptyText}>
                  When someone proposes a trade for this item, it'll appear
                  here.
                </Text>
              </View>
            ) : (
              <SectionList
                sections={offerSections}
                keyExtractor={(offer) => offer.id}
                renderItem={renderOfferItem}
                renderSectionHeader={({ section }) => (
                  <SectionHeader
                    sectionKey={section.key}
                    label={section.label}
                    icon={section.icon}
                    count={section.data.length}
                  />
                )}
                stickySectionHeadersEnabled={false}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={s2.list}
                SectionSeparatorComponent={() => <View style={{ height: 6 }} />}
              />
            )}

            <TouchableOpacity style={s2.closeBarBtn} onPress={onClose}>
              <Text style={s2.closeBarText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Chat modal ── */}
      <TradeChatModal
        visible={!!chatTrade}
        trade={chatTrade}
        isOwner={currentUser?.uid === chatTrade?.ownerId}
        onClose={() => setChatTrade(null)}
        onStatusChange={(tradeId, newStatus) => {
          setOffers((prev) =>
            prev.map((o) =>
              o.id === tradeId ? { ...o, status: newStatus } : o,
            ),
          );
        }}
      />

      {/* ── Review modal ── */}
      <Modal
        visible={!!reviewOffer}
        transparent
        animationType="slide"
        onRequestClose={() => setReviewOffer(null)}
      >
        <View style={s2.reviewOverlay}>
          <View style={s2.reviewSheet}>
            <View style={s2.handle} />
            <Text style={s2.reviewTitle}>Rate your trade</Text>
            <Text style={s2.reviewSubtitle}>
              How was trading with{" "}
              {offererNameCache[reviewOffer?.offererId ?? ""] || "your partner"}
              ?
            </Text>
            <StarRating
              rating={reviewRating}
              onRate={setReviewRating}
              size={40}
            />
            <TextInput
              style={s2.reviewInput}
              placeholder="Share your experience (optional)…"
              placeholderTextColor="#AAAAAA"
              value={reviewComment}
              onChangeText={setReviewComment}
              multiline
              maxLength={300}
              textAlignVertical="top"
            />
            <Text style={s2.reviewDisclaimer}>
              Your review is hidden until the other person also submits — then
              both are revealed simultaneously.
            </Text>
            <TouchableOpacity
              style={[
                s2.reviewSubmitBtn,
                (reviewRating === 0 || submittingReview) &&
                  s2.reviewSubmitBtnDisabled,
              ]}
              onPress={handleSubmitReview}
              disabled={reviewRating === 0 || submittingReview}
              activeOpacity={0.85}
            >
              {submittingReview ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={s2.reviewSubmitText}>Submit Review</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={s2.reviewCancelBtn}
              onPress={() => setReviewOffer(null)}
            >
              <Text style={s2.reviewCancelText}>Maybe Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const s2 = StyleSheet.create({
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
    maxHeight: "92%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DDD",
    alignSelf: "center",
    marginBottom: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 10,
  },
  title: { fontSize: 13, color: "#888", fontWeight: "600" },
  itemName: { fontSize: 20, fontWeight: "800", color: NAVY },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F0F0F0",
    justifyContent: "center",
    alignItems: "center",
  },
  loaderBox: { alignItems: "center", paddingVertical: 40, gap: 10 },
  loaderText: { fontSize: 13, color: "#888" },
  emptyBox: {
    alignItems: "center",
    paddingVertical: 36,
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#333" },
  emptyText: {
    fontSize: 13,
    color: "#AAAAAA",
    textAlign: "center",
    lineHeight: 20,
  },
  list: { paddingHorizontal: 20, paddingBottom: 8 },

  // ── Section header (matches trade.tsx) ──────────────────────────────────
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    marginBottom: 10,
    paddingLeft: 10,
    borderLeftWidth: 3,
    borderRadius: 2,
  },
  sectionHeaderIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeaderText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  sectionHeaderBadge: {
    borderRadius: 10,
    minWidth: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  sectionHeaderBadgeText: { fontSize: 12, fontWeight: "700" },

  // ── Offer card ───────────────────────────────────────────────────────────
  card: {
    backgroundColor: "#FAFAFA",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ECECEC",
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  cardAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E8E8E8",
  },
  cardAvatarFallback: {
    backgroundColor: NAVY,
    justifyContent: "center",
    alignItems: "center",
  },
  cardAvatarInitial: { fontSize: 16, fontWeight: "700", color: "#fff" },
  cardName: { fontSize: 14, fontWeight: "700", color: "#1A1A2E" },
  cardDate: { fontSize: 11, color: "#AAAAAA", marginTop: 1 },
  cardItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F0F1F8",
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  cardItemImg: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: "#E0E0E0",
  },
  cardItemImgEmpty: { justifyContent: "center", alignItems: "center" },
  cardItemMeta: { fontSize: 11, color: "#888", marginBottom: 2 },
  cardItemTitle: { fontSize: 13, fontWeight: "700", color: "#1A1A2E" },
  cardMessage: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "#F7F7F7",
    borderRadius: 8,
    padding: 9,
    marginBottom: 10,
  },
  cardMessageText: {
    fontSize: 12,
    color: "#555",
    fontStyle: "italic",
    flex: 1,
    lineHeight: 18,
  },
  cardActions: { flexDirection: "row", gap: 8, alignItems: "center" },
  msgBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: NAVY,
    backgroundColor: "#ECEDF8",
  },
  msgBtnText: { fontSize: 13, fontWeight: "700", color: NAVY },
  actionBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    borderRadius: 10,
  },
  declineBtn: {
    backgroundColor: "#FDEDED",
    borderWidth: 1.5,
    borderColor: RED,
  },
  acceptBtn: { backgroundColor: NAVY },
  actionBtnText: { fontSize: 13, fontWeight: "700" },

  // ── Mark as finished ─────────────────────────────────────────────────────
  markBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COMPLETE_GREEN,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 10,
    marginBottom: 4,
  },
  markBtnHighlight: { backgroundColor: "#0F9D58" },
  markBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
    flex: 1,
    textAlign: "center",
  },

  // ── Waiting banner ───────────────────────────────────────────────────────
  waitingBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FFF7ED",
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginTop: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  waitingTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#D97706",
    marginBottom: 2,
  },
  waitingSubtitle: { fontSize: 12, color: "#92400E", lineHeight: 16 },

  // ── Completed ────────────────────────────────────────────────────────────
  completedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#E8F5E9",
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    marginTop: 10,
    marginBottom: 4,
  },
  completedText: { fontSize: 13, fontWeight: "700", color: COMPLETE_GREEN },

  // ── Review ───────────────────────────────────────────────────────────────
  reviewBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "#FFB800",
    borderRadius: 12,
    paddingVertical: 11,
    marginTop: 6,
    marginBottom: 2,
  },
  reviewBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  reviewWaiting: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFF7ED",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 6,
    marginBottom: 2,
  },
  reviewWaitingText: { fontSize: 12, color: "#D97706", fontWeight: "600" },
  receivedReview: {
    backgroundColor: "#F7F8FC",
    borderRadius: 12,
    padding: 12,
    marginTop: 6,
    marginBottom: 2,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ECECEC",
  },
  receivedReviewHeader: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 6,
  },
  receivedReviewComment: {
    fontSize: 12,
    color: "#555",
    fontStyle: "italic",
    textAlign: "center",
    lineHeight: 18,
    marginTop: 4,
  },

  closeBarBtn: {
    paddingVertical: 16,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  closeBarText: { fontSize: 15, fontWeight: "600", color: "#888" },

  // ── Review modal ─────────────────────────────────────────────────────────
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
  reviewSubmitText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  reviewCancelBtn: { alignItems: "center", paddingVertical: 4 },
  reviewCancelText: { fontSize: 14, color: "#AAAAAA", fontWeight: "600" },
});
