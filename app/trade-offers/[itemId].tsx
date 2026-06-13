import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth } from "../../firebaseConfig";
import { getItemById, getUserInfo } from "../../services/itemService";
import {
  TradeOffer,
  completeTrade,
  subscribeToOffersForItem,
  updateTradeStatus
} from "../../services/tradeService";

const NAVY = "#2e2d7c";

const STATUS_COLORS: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  pending: { bg: "#FFF7ED", text: "#D97706", border: "#FDE68A" },
  accepted: { bg: "#F0FDF4", text: "#16A34A", border: "#BBF7D0" },
  declined: { bg: "#FFF1F2", text: "#E11D48", border: "#FECDD3" },
  cancelled: { bg: "#F3F4F6", text: "#6B7280", border: "#E5E7EB" },
  completed: { bg: "#E8F5E9", text: "#16A34A", border: "#BBF7D0" },
};

const FILTER_TABS: {
  key: TradeOffer["status"] | "all";
  label: string;
  icon: string;
}[] = [
  { key: "all", label: "All", icon: "layers-outline" },
  { key: "pending", label: "Pending", icon: "time-outline" },
  { key: "accepted", label: "Accepted", icon: "checkmark-circle-outline" },
  { key: "completed", label: "Completed", icon: "trophy-outline" },
  { key: "declined", label: "Declined", icon: "close-circle-outline" },
  { key: "cancelled", label: "Cancelled", icon: "ban-outline" },
];

// ── Display name resolver ─────────────────────────────────────────────────────
function resolveDisplayName(obj: any): string {
  return (
    obj?.displayName?.trim() ||
    obj?.name?.trim() ||
    obj?.fullName?.trim() ||
    obj?.userName?.trim() ||
    ""
  );
}

function buildOwnerDisplayName(info: any, fallback: string): string {
  if (info?.firstName && info?.lastName)
    return `${info.firstName.trim()} ${info.lastName.trim()}`;
  return (
    info?.displayName?.trim() ||
    info?.name?.trim() ||
    info?.fullName?.trim() ||
    info?.username?.trim() ||
    info?.userName?.trim() ||
    fallback ||
    "Unknown User"
  );
}

const PLACEHOLDER_AVATAR_HOSTS = [
  "pravatar.cc",
  "placeholder.com",
  "ui-avatars.com",
  "gravatar.com/avatar/00000000000000000000000000000000",
];

function resolveRealAvatar(...candidates: (string | null | undefined)[]): string | null {
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "string") continue;
    const url = candidate.trim();
    if (!url.startsWith("http")) continue;
    if (PLACEHOLDER_AVATAR_HOSTS.some((host) => url.includes(host))) continue;
    return url;
  }
  return null;
}

function getTabColor(key: TradeOffer["status"] | "all"): string {
  if (key === "all") return NAVY;
  return STATUS_COLORS[key]?.text ?? NAVY;
}

function getTabBg(key: TradeOffer["status"] | "all"): string {
  if (key === "all") return "#ECEDF8";
  return STATUS_COLORS[key]?.bg ?? "#F3F4F6";
}

// ── MiniAvatar ────────────────────────────────────────────────────────────────
function MiniAvatar({
  uri,
  name,
  size,
  style,
}: {
  uri?: string | null;
  name?: string;
  size: number;
  style?: any;
}) {
  const hasRealImage = !!resolveRealAvatar(uri);
  const initial = (name || "U")[0].toUpperCase();

  if (hasRealImage) {
    return (
      <Image
        source={{ uri: uri as string }}
        style={[
          { width: size, height: size, borderRadius: size / 2 },
          style,
        ]}
      />
    );
  }
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: NAVY,
          justifyContent: "center",
          alignItems: "center",
        },
        style,
      ]}
    >
      <Text style={{ color: "#fff", fontSize: size * 0.4, fontWeight: "700" }}>
        {initial}
      </Text>
    </View>
  );
}

export default function TradeOffersScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const router = useRouter();

  const [item, setItem] = useState<any>(null);
  const [itemLoading, setItemLoading] = useState(true);
  const [offers, setOffers] = useState<TradeOffer[]>([]);
  const [offersLoading, setOffersLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<
    TradeOffer["status"] | "all"
  >("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [completingOfferId, setCompletingOfferId] = useState<string | null>(
    null,
  );

  const unsubRef = useRef<(() => void) | null>(null);

  // Load the item details
  useEffect(() => {
    if (!itemId) return;
    (async () => {
      try {
        const data = await getItemById(itemId);
        setItem(data);
      } catch {
        /* noop */
      } finally {
        setItemLoading(false);
      }
    })();
  }, [itemId]);

  // Live-subscribe to offers for this item
  useEffect(() => {
    if (!itemId) return;
    setOffersLoading(true);
    const unsub = subscribeToOffersForItem(itemId, (incoming) => {
      setOffers(incoming);
      setOffersLoading(false);
    });
    unsubRef.current = unsub;
    return () => {
      unsub();
      unsubRef.current = null;
    };
  }, [itemId]);

  const handleRespond = async (
    offer: TradeOffer,
    response: "accepted" | "declined",
  ) => {
    setUpdatingId(offer.id);
    try {
      await updateTradeStatus(offer.id, response);
    } catch {
      Alert.alert("Error", "Could not update offer status.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleComplete = async (offer: TradeOffer) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    setCompletingOfferId(offer.id);
    try {
      await completeTrade(offer.id, currentUser.uid);
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Failed to confirm the trade.");
    } finally {
      setCompletingOfferId(null);
    }
  };

  const filteredOffers =
    activeFilter === "all"
      ? offers
      : offers.filter((o) => o.status === activeFilter);

  const countFor = (key: string) =>
    key === "all"
      ? offers.length
      : offers.filter((o) => o.status === key).length;

  const imageUrl =
    item && Array.isArray(item.images) && item.images.length > 0
      ? item.images[0]
      : item?.image || "https://via.placeholder.com/200";

  return (
    <SafeAreaView style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={22} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trade Offers</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* ── Item Hero ── */}
      {itemLoading ? (
        <View style={styles.itemHeroSkeleton}>
          <ActivityIndicator color={NAVY} />
        </View>
      ) : item ? (
        <View style={styles.itemHero}>
          <Image source={{ uri: imageUrl }} style={styles.itemHeroImage} />
          <View style={styles.itemHeroInfo}>
            <Text style={styles.itemHeroLabel}>Item up for trade</Text>
            <Text style={styles.itemHeroName} numberOfLines={2}>
              {item.title || item.name}
            </Text>
            {item.category ? (
              <View style={styles.itemHeroCategoryPill}>
                <Text style={styles.itemHeroCategoryText}>{item.category}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.itemHeroStats}>
            <Text style={styles.itemHeroStatNum}>{offers.length}</Text>
            <Text style={styles.itemHeroStatLabel}>Offers</Text>
          </View>
        </View>
      ) : null}

      {/* ── Filter tabs ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterBarContent}
      >
        {FILTER_TABS.map((tab) => {
          const count = countFor(tab.key);
          if (count === 0 && tab.key !== "all") return null;
          const isActive = activeFilter === tab.key;
          const color = getTabColor(tab.key);
          const bg = getTabBg(tab.key);
          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.filterTab,
                isActive && {
                  backgroundColor: tab.key === "all" ? NAVY : color,
                  borderColor: color,
                },
              ]}
              onPress={() => setActiveFilter(tab.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={tab.icon as any}
                size={13}
                color={isActive ? "#fff" : color}
              />
              <Text
                style={[
                  styles.filterTabText,
                  { color: isActive ? "#fff" : color },
                ]}
              >
                {tab.label}
              </Text>
              {count > 0 && (
                <View
                  style={[
                    styles.filterBadge,
                    {
                      backgroundColor: isActive ? "rgba(255,255,255,0.25)" : bg,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterBadgeText,
                      { color: isActive ? "#fff" : color },
                    ]}
                  >
                    {count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Offers list ── */}
      {offersLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={NAVY} />
          <Text style={styles.loadingText}>Loading offers…</Text>
        </View>
      ) : filteredOffers.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="mail-unread-outline" size={52} color="#DDD" />
          <Text style={styles.emptyTitle}>
            {activeFilter === "all"
              ? "No offers yet"
              : `No ${activeFilter} offers`}
          </Text>
          <Text style={styles.emptySubtitle}>
            {activeFilter === "all"
              ? "When someone makes an offer on this item, it'll appear here."
              : `Switch to All to see other offers.`}
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        >
          {filteredOffers.map((offer) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              updatingId={updatingId}
              completingOfferId={completingOfferId}
              onAccept={() => handleRespond(offer, "accepted")}
              onDecline={() => handleRespond(offer, "declined")}
              onMessage={() => {
                router.push({
                  pathname: "/chat",
                  params: {
                    ownerUserId: offer.offererId,
                    itemId: offer.requestedItemId ?? offer.offeredItemId,
                    itemTitle: offer.requestedItemTitle ?? offer.offeredItemTitle,
                  },
                });
              }}
              onComplete={() => handleComplete(offer)}
              onPressUser={() =>
                offer.offererId &&
                router.push({
                  pathname: "/user-profile",
                  params: { userId: offer.offererId },
                })
              }
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ── Individual offer card ─────────────────────────────────────────────────────
function OfferCard({
  offer,
  updatingId,
  completingOfferId,
  onAccept,
  onDecline,
  onMessage,
  onComplete,
  onPressUser,
}: {
  offer: TradeOffer;
  updatingId: string | null;
  completingOfferId: string | null;
  onAccept: () => void;
  onDecline: () => void;
  onMessage: () => void;
  onComplete: () => void;
  onPressUser: () => void;
}) {
  const isUpdating = updatingId === offer.id;
  const isCompleting = completingOfferId === offer.id;
  const isPending = offer.status === "pending";
  const isAccepted = offer.status === "accepted";
  const isCompleted = offer.status === "completed";
  const statusStyle = STATUS_COLORS[offer.status] ?? STATUS_COLORS.pending;

  const myUid = auth.currentUser?.uid ?? "";
  const completedBy: string[] = (offer as any).completedBy ?? [];
  const iHaveConfirmed = completedBy.includes(myUid);
  const otherParticipantUid =
    (offer as any).participants?.find((p: string) => p !== myUid) ??
    (offer as any).ownerId ??
    "";
  const otherHasConfirmed =
    completedBy.includes(otherParticipantUid) && !iHaveConfirmed;

  const [offererName, setOffererName] = useState<string>(
    offer.offererName?.trim() || "Trader",
  );
  const [offererAvatar, setOffererAvatar] = useState<string | null>(
    resolveRealAvatar(offer.offererAvatar),
  );

  useEffect(() => {
    if (!offer.offererId) return;
    let cancelled = false;
    getUserInfo(offer.offererId)
      .then((info) => {
        if (cancelled || !info) return;
        setOffererName(
          buildOwnerDisplayName(info, resolveDisplayName(offer) || "Trader"),
        );
        const realAvatar = resolveRealAvatar(
          (info as any)?.avatarUrl,
          (info as any)?.photoURL,
          offer.offererAvatar,
        );
        setOffererAvatar(realAvatar);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [offer.offererId]);

  return (
    <View style={[styles.card, { borderColor: statusStyle.border }]}>
      {/* Status pill */}
      <View
        style={[styles.cardStatusPill, { backgroundColor: statusStyle.bg }]}
      >
        <View
          style={[styles.cardStatusDot, { backgroundColor: statusStyle.text }]}
        />
        <Text style={[styles.cardStatusText, { color: statusStyle.text }]}>
          {offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
        </Text>
      </View>

      {/* Offerer row */}
      <TouchableOpacity
        style={styles.offererRow}
        onPress={onPressUser}
        activeOpacity={0.8}
      >
        <MiniAvatar
          uri={offererAvatar}
          name={offererName}
          size={36}
          style={styles.offererAvatar}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.offererName} numberOfLines={1}>
            {offererName}
          </Text>
          {offer.createdAt?.toDate && (
            <Text style={styles.offerDate}>
              {offer.createdAt.toDate().toLocaleDateString([], {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </Text>
          )}
        </View>
      </TouchableOpacity>

      {/* Offered item */}
      <View style={styles.offeredItemRow}>
        <Image
          source={{
            uri: offer.offeredItemImage || "https://via.placeholder.com/60",
          }}
          style={styles.offeredItemImage}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.offeredItemMeta}>They're offering</Text>
          <Text style={styles.offeredItemTitle} numberOfLines={2}>
            {offer.offeredItemTitle}
          </Text>
        </View>
        <Ionicons name="swap-horizontal" size={18} color="#AAAAAA" />
        <View style={styles.offeredForSide}>
          <Text style={styles.offeredItemMeta}>For your item</Text>
          <Text style={styles.offeredItemTitle} numberOfLines={2}>
            {offer.requestedItemTitle}
          </Text>
        </View>
      </View>

      {/* Optional message */}
      {!!offer.message && (
        <View style={styles.messageBox}>
          <Ionicons name="chatbubble-ellipses-outline" size={12} color="#888" />
          <Text style={styles.messageText} numberOfLines={3}>
            "{offer.message}"
          </Text>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        {isPending && (
          <>
            <TouchableOpacity
              style={styles.declineBtn}
              onPress={onDecline}
              disabled={isUpdating}
              activeOpacity={0.8}
            >
              {isUpdating ? (
                <ActivityIndicator size="small" color="#E11D48" />
              ) : (
                <Text style={styles.declineBtnText}>Decline</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.acceptBtn}
              onPress={onAccept}
              disabled={isUpdating}
              activeOpacity={0.8}
            >
              {isUpdating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={15} color="#fff" />
                  <Text style={styles.acceptBtnText}>Accept Offer</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}

        {(isAccepted || isCompleted) && (
          <TouchableOpacity
            style={styles.messageBtn}
            onPress={onMessage}
            activeOpacity={0.8}
          >
            <Ionicons name="chatbubble-outline" size={14} color={NAVY} />
            <Text style={styles.messageBtnText}>Message</Text>
          </TouchableOpacity>
        )}

        {isAccepted && (
          <TouchableOpacity
            style={[
              styles.completeBtn,
              (iHaveConfirmed || isCompleting) && styles.completeBtnWaiting,
              otherHasConfirmed && styles.completeBtnHighlight,
            ]}
            onPress={onComplete}
            disabled={isCompleting || iHaveConfirmed}
            activeOpacity={0.85}
          >
            {isCompleting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : iHaveConfirmed ? (
              <>
                <Ionicons name="time-outline" size={14} color="#fff" />
                <Text style={styles.completeBtnText}>
                  Waiting for other party...
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="checkmark-done-circle" size={14} color="#fff" />
                <Text style={styles.completeBtnText}>
                  {otherHasConfirmed
                    ? "They confirmed — tap to finish!"
                    : "Mark Trade as Finished"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {isCompleted && (
          <View style={[styles.acceptedBadge, { backgroundColor: "#E8F5E9" }]}>
            <Ionicons name="trophy" size={14} color="#16A34A" />
            <Text style={styles.acceptedBadgeText}>Completed</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FF" },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#EFEFEF",
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },

  // ── Item hero ─────────────────────────────────────────────────────────────
  itemHeroSkeleton: {
    height: 90,
    margin: 16,
    borderRadius: 16,
    backgroundColor: "#EEF0F8",
    alignItems: "center",
    justifyContent: "center",
  },
  itemHero: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    marginBottom: 8,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E8EEF9",
    shadowColor: "#2e2d7c",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    gap: 12,
  },
  itemHeroImage: {
    width: 62,
    height: 62,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
  },
  itemHeroInfo: { flex: 1, gap: 4 },
  itemHeroLabel: {
    fontSize: 11,
    color: "#9CA3AF",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  itemHeroName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    lineHeight: 20,
  },
  itemHeroCategoryPill: {
    alignSelf: "flex-start",
    backgroundColor: "#ECEDF8",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  itemHeroCategoryText: { fontSize: 11, color: NAVY, fontWeight: "600" },
  itemHeroStats: { alignItems: "center", minWidth: 42 },
  itemHeroStatNum: { fontSize: 22, fontWeight: "800", color: NAVY },
  itemHeroStatLabel: {
    fontSize: 10,
    color: "#9CA3AF",
    fontWeight: "600",
    textTransform: "uppercase",
  },

  // ── Filter bar ────────────────────────────────────────────────────────────
  filterBar: { maxHeight: 48, marginBottom: 4 },
  filterBarContent: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  filterTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
  },
  filterTabText: { fontSize: 12, fontWeight: "700" },
  filterBadge: {
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  filterBadgeText: { fontSize: 10, fontWeight: "800" },

  // ── List ──────────────────────────────────────────────────────────────────
  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 100 },

  // ── Card ──────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1.5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
    gap: 10,
  },
  cardStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  cardStatusDot: { width: 6, height: 6, borderRadius: 3 },
  cardStatusText: { fontSize: 11, fontWeight: "700" },

  // ── Offerer row ───────────────────────────────────────────────────────────
  offererRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  offererAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E5E7EB",
  },
  offererName: { fontSize: 14, fontWeight: "700", color: "#111827" },
  offerDate: { fontSize: 11, color: "#AAAAAA", marginTop: 1 },

  // ── Offered item row ──────────────────────────────────────────────────────
  offeredItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F8F9FF",
    borderRadius: 10,
    padding: 10,
  },
  offeredItemImage: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
  },
  offeredItemMeta: {
    fontSize: 10,
    color: "#9CA3AF",
    marginBottom: 2,
    fontWeight: "600",
  },
  offeredItemTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1A1A2E",
    lineHeight: 17,
  },
  offeredForSide: { flex: 1 },

  // ── Message box ───────────────────────────────────────────────────────────
  messageBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "#F7F7F7",
    borderRadius: 8,
    padding: 9,
  },
  messageText: {
    fontSize: 12,
    color: "#555",
    fontStyle: "italic",
    flex: 1,
    lineHeight: 17,
  },

  // ── Actions ───────────────────────────────────────────────────────────────
  actions: { flexDirection: "row", gap: 8, alignItems: "center" },
  declineBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#FECDD3",
    backgroundColor: "#FFF1F2",
  },
  declineBtnText: { fontSize: 13, fontWeight: "700", color: "#E11D48" },
  acceptBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#16A34A",
  },
  acceptBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  messageBtn: {
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
  messageBtnText: { fontSize: 12, fontWeight: "700", color: NAVY },
  acceptedBadge: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#F0FDF4",
  },
  acceptedBadgeText: { fontSize: 12, fontWeight: "700", color: "#16A34A" },

  // ── Complete button ───────────────────────────────────────────────────────
  completeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#16A34A",
  },
  completeBtnWaiting: { backgroundColor: "#6B7280" },
  completeBtnHighlight: { backgroundColor: "#0F9D58" },
  completeBtnText: { fontSize: 12, fontWeight: "700", color: "#fff" },

  // ── States ────────────────────────────────────────────────────────────────
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
  },
  loadingText: { fontSize: 14, color: "#9CA3AF" },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#374151",
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 19,
  },
});