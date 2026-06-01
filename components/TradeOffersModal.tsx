import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth } from "../firebaseConfig";
import {
  TradeOffer,
  subscribeToOffersForItem,
  updateTradeStatus,
} from "../services/tradeService";
import { TradeChatModal } from "./TradeChatModal";

// ─── Constants ────────────────────────────────────────────────────────────────
const NAVY = "#2f2f6f";
const GREEN = "#27AE60";
const RED = "#C0392B";
const GOLD = "#C9A227";

// ─── Types ────────────────────────────────────────────────────────────────────
interface TradeOffersModalProps {
  visible: boolean;
  itemId: string | null;
  itemTitle: string;
  onClose: () => void;
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: TradeOffer["status"] }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    pending: { label: "Pending", bg: "#FFF4E0", color: GOLD },
    accepted: { label: "Accepted", bg: "#E8F8EF", color: GREEN },
    declined: { label: "Declined", bg: "#FDEDED", color: RED },
    cancelled: { label: "Cancelled", bg: "#F0F0F0", color: "#888" },
  };
  const s = map[status] ?? map.pending;
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.badgeText, { color: s.color }]}>{s.label}</Text>
    </View>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export const TradeOffersModal: React.FC<TradeOffersModalProps> = ({
  visible,
  itemId,
  itemTitle,
  onClose,
}) => {
  const [offers, setOffers] = useState<TradeOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null); // tradeId being actioned
  const [chatTrade, setChatTrade] = useState<TradeOffer | null>(null);
  const currentUser = auth.currentUser;

  // Real-time subscription
  useEffect(() => {
    if (!visible || !itemId) return;
    setLoading(true);
    const unsub = subscribeToOffersForItem(itemId, (incoming) => {
      setOffers(incoming);
      setLoading(false);
    });
    return unsub;
  }, [visible, itemId]);

  // Reset on close
  useEffect(() => {
    if (!visible) {
      setOffers([]);
      setChatTrade(null);
    }
  }, [visible]);

  const handleStatus = async (
    offer: TradeOffer,
    newStatus: "accepted" | "declined",
  ) => {
    setActioning(offer.id);
    try {
      await updateTradeStatus(offer.id, newStatus);
      // The real-time subscription will update the list automatically
    } finally {
      setActioning(null);
    }
  };

  const openChat = (offer: TradeOffer) => {
    setChatTrade(offer);
  };

  const pendingOffers = offers.filter((o) => o.status === "pending");
  const otherOffers = offers.filter((o) => o.status !== "pending");

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            {/* ── Handle ── */}
            <View style={styles.handle} />

            {/* ── Header ── */}
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Offers on</Text>
                <Text style={styles.itemName} numberOfLines={1}>
                  {itemTitle}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color="#555" />
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.loaderBox}>
                <ActivityIndicator color={NAVY} />
                <Text style={styles.loaderText}>Loading offers…</Text>
              </View>
            ) : offers.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="cube-outline" size={40} color="#CCC" />
                <Text style={styles.emptyTitle}>No offers yet</Text>
                <Text style={styles.emptyText}>
                  When someone proposes a trade for this item, it'll appear
                  here.
                </Text>
              </View>
            ) : (
              <ScrollView
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
              >
                {/* ── Pending offers first ── */}
                {pendingOffers.length > 0 && (
                  <>
                    <Text style={styles.sectionLabel}>
                      Awaiting your response ({pendingOffers.length})
                    </Text>
                    {pendingOffers.map((offer) => (
                      <OfferCard
                        key={offer.id}
                        offer={offer}
                        actioning={actioning === offer.id}
                        onAccept={() => handleStatus(offer, "accepted")}
                        onDecline={() => handleStatus(offer, "declined")}
                        onMessage={() => openChat(offer)}
                      />
                    ))}
                  </>
                )}

                {/* ── Past offers ── */}
                {otherOffers.length > 0 && (
                  <>
                    <Text style={[styles.sectionLabel, { marginTop: 16 }]}>
                      Past offers
                    </Text>
                    {otherOffers.map((offer) => (
                      <OfferCard
                        key={offer.id}
                        offer={offer}
                        actioning={false}
                        onMessage={() => openChat(offer)}
                      />
                    ))}
                  </>
                )}
              </ScrollView>
            )}

            <TouchableOpacity style={styles.closeBarBtn} onPress={onClose}>
              <Text style={styles.closeBarText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Chat modal (slides over this one) ── */}
      <TradeChatModal
        visible={!!chatTrade}
        trade={chatTrade}
        isOwner={currentUser?.uid === chatTrade?.ownerId}
        onClose={() => setChatTrade(null)}
        onStatusChange={(tradeId, newStatus) => {
          // Update the local offer so the card reflects the change immediately
          setOffers((prev) =>
            prev.map((o) =>
              o.id === tradeId ? { ...o, status: newStatus } : o,
            ),
          );
        }}
      />
    </>
  );
};

// ─── Offer Card ───────────────────────────────────────────────────────────────
interface OfferCardProps {
  offer: TradeOffer;
  actioning: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
  onMessage: () => void;
}

function OfferCard({
  offer,
  actioning,
  onAccept,
  onDecline,
  onMessage,
}: OfferCardProps) {
  const isPending = offer.status === "pending";

  return (
    <View style={styles.card}>
      {/* ── Offerer row ── */}
      <View style={styles.cardHeader}>
        {offer.offererAvatar ? (
          <Image
            source={{ uri: offer.offererAvatar }}
            style={styles.cardAvatar}
          />
        ) : (
          <View style={[styles.cardAvatar, styles.cardAvatarFallback]}>
            <Text style={styles.cardAvatarInitial}>
              {offer.offererName?.[0]?.toUpperCase() ?? "?"}
            </Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName} numberOfLines={1}>
            {offer.offererName}
          </Text>
          <Text style={styles.cardDate}>
            {offer.createdAt?.toDate
              ? offer.createdAt.toDate().toLocaleDateString([], {
                  month: "short",
                  day: "numeric",
                })
              : ""}
          </Text>
        </View>
        <StatusBadge status={offer.status} />
      </View>

      {/* ── Offered item ── */}
      <View style={styles.cardItem}>
        {offer.offeredItemImage ? (
          <Image
            source={{ uri: offer.offeredItemImage }}
            style={styles.cardItemImg}
          />
        ) : (
          <View style={[styles.cardItemImg, styles.cardItemImgEmpty]}>
            <Ionicons name="image-outline" size={18} color="#CCC" />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.cardItemMeta}>They're offering:</Text>
          <Text style={styles.cardItemTitle} numberOfLines={2}>
            {offer.offeredItemTitle}
          </Text>
        </View>
      </View>

      {/* ── Optional message ── */}
      {offer.message ? (
        <View style={styles.cardMessage}>
          <Ionicons name="chatbubble-ellipses-outline" size={12} color="#888" />
          <Text style={styles.cardMessageText} numberOfLines={3}>
            "{offer.message}"
          </Text>
        </View>
      ) : null}

      {/* ── Actions ── */}
      <View style={styles.cardActions}>
        {/* Message button — always visible */}
        <TouchableOpacity
          style={styles.msgBtn}
          onPress={onMessage}
          activeOpacity={0.8}
        >
          <Ionicons name="chatbubble-outline" size={15} color={NAVY} />
          <Text style={styles.msgBtnText}>Message</Text>
        </TouchableOpacity>

        {/* Accept / Decline — only when pending */}
        {isPending && onAccept && onDecline && (
          <>
            <TouchableOpacity
              style={[styles.actionBtn, styles.declineBtn]}
              onPress={onDecline}
              disabled={actioning}
              activeOpacity={0.8}
            >
              {actioning ? (
                <ActivityIndicator size="small" color={RED} />
              ) : (
                <Text style={[styles.actionBtnText, { color: RED }]}>
                  Decline
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.acceptBtn]}
              onPress={onAccept}
              disabled={actioning}
              activeOpacity={0.8}
            >
              {actioning ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={[styles.actionBtnText, { color: "#fff" }]}>
                  Accept
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
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
    maxHeight: "88%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DDD",
    alignSelf: "center",
    marginBottom: 14,
  },

  // ── Header ──
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

  // ── Loader / Empty ──
  loaderBox: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 10,
  },
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

  // ── Section label ──
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#AAAAAA",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },

  // ── List ──
  list: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },

  // ── Card ──
  card: {
    backgroundColor: "#FAFAFA",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ECECEC",
    padding: 14,
    marginBottom: 12,
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

  // Status badge
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  // Item row
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
  cardItemImgEmpty: {
    justifyContent: "center",
    alignItems: "center",
  },
  cardItemMeta: { fontSize: 11, color: "#888", marginBottom: 2 },
  cardItemTitle: { fontSize: 13, fontWeight: "700", color: "#1A1A2E" },

  // Proposal message
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

  // Actions row
  cardActions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
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
  acceptBtn: {
    backgroundColor: NAVY,
  },
  actionBtnText: { fontSize: 13, fontWeight: "700" },

  // ── Close bar ──
  closeBarBtn: {
    paddingVertical: 16,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  closeBarText: { fontSize: 15, fontWeight: "600", color: "#888" },
});
