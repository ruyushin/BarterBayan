import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { TradeChatModal } from "../../components/TradeChatModal";
import { auth } from "../../firebaseConfig";
import { getUserInfo } from "../../services/itemService";
import {
  TradeOffer,
  cancelTradeOffer,
  completeTrade,
  subscribeToSentOffers,
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

const STATUS_FILTER_TABS: {
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

// ─── Owner info resolved from Firestore ───────────────────────────────────────
interface OwnerInfo {
  name: string;
  avatar: string | null;
}

// A value that looks like an email shouldn't be shown as a display name
function isEmailLike(value?: string | null): boolean {
  return !!value && /\S+@\S+\.\S+/.test(value);
}

// Resolve the best display name + avatar out of a raw Firestore user doc.
// Falls back gracefully so the UI is never blank, and never shows an email
// address as the "display name" (e.g. when username/displayName was seeded
// with the user's gmail).
function resolveOwnerInfo(raw: any): OwnerInfo {
  const fullName =
    raw?.firstName?.trim() && raw?.lastName?.trim()
      ? `${raw.firstName.trim()} ${raw.lastName.trim()}`
      : null;

  const candidates = [
    fullName,
    raw?.displayName,
    raw?.name,
    raw?.fullName,
    raw?.username,
    raw?.userName,
  ];

  const name =
    candidates
      .map((c) => (typeof c === "string" ? c.trim() : ""))
      .find((c) => c.length > 0 && !isEmailLike(c)) || "Item Owner";

  const avatarUrl =
    raw?.avatarUrl ||
    raw?.photoURL ||
    raw?.profileImage ||
    raw?.avatar ||
    raw?.profilePicture ||
    raw?.photo ||
    raw?.picture ||
    null;
  const avatar =
    avatarUrl && typeof avatarUrl === "string" && avatarUrl.startsWith("http")
      ? avatarUrl
      : null;
  return { name, avatar };
}

// ── Offer Detail Bottom Sheet ─────────────────────────────────────────────────
function OfferDetailSheet({
  offer,
  ownerInfo,
  visible,
  onClose,
  onMessage,
  onViewProfile,
  onComplete,
  onCancel,
  completingId,
  cancellingId,
}: {
  offer: TradeOffer | null;
  ownerInfo: OwnerInfo;
  visible: boolean;
  onClose: () => void;
  onMessage: () => void;
  onViewProfile: () => void;
  onComplete: () => void;
  onCancel: () => void;
  completingId: string | null;
  cancellingId: string | null;
}) {
  const slideAnim = useRef(new Animated.Value(500)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 200,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 500,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  if (!offer) return null;

  const myUid = auth.currentUser?.uid ?? "";
  const completedBy: string[] = (offer as any).completedBy ?? [];
  const iHaveConfirmed = completedBy.includes(myUid);
  const otherUid =
    (offer as any).participants?.find((p: string) => p !== myUid) ??
    (offer as any).ownerId ??
    "";
  const otherHasConfirmed = completedBy.includes(otherUid) && !iHaveConfirmed;

  const statusStyle = STATUS_COLORS[offer.status] ?? STATUS_COLORS.pending;
  const isPending = offer.status === "pending";
  const isAccepted = offer.status === "accepted";
  const isCompleted = offer.status === "completed";
  const isCompleting = completingId === offer.id;
  const isCancelling = cancellingId === offer.id;

  // Prefer live-fetched owner info; fall back to whatever was stored on the
  // offer, but never show an email address as the name.
  const offerOwnerName = (offer as any).ownerName as string | undefined;
  const offerOwnerAvatar = (offer as any).ownerAvatar as string | undefined;
  const fallbackOfferName =
    offerOwnerName && !isEmailLike(offerOwnerName)
      ? offerOwnerName
      : "Item Owner";
  const displayName =
    ownerInfo.name !== "Item Owner" ? ownerInfo.name : fallbackOfferName;
  const displayAvatar =
    ownerInfo.avatar ??
    (offerOwnerAvatar || null);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View
          style={[sheetStyles.backdrop, { opacity: backdropAnim }]}
        />
      </TouchableWithoutFeedback>

      <Animated.View
        style={[sheetStyles.sheet, { transform: [{ translateY: slideAnim }] }]}
      >
        <View style={sheetStyles.handle} />

        <TouchableOpacity
          style={sheetStyles.closeBtn}
          onPress={onClose}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={18} color="#6B7280" />
        </TouchableOpacity>

        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          {/* Status row */}
          <View style={sheetStyles.statusRow}>
            <View
              style={[
                sheetStyles.statusPill,
                {
                  backgroundColor: statusStyle.bg,
                  borderColor: statusStyle.border,
                },
              ]}
            >
              <View
                style={[
                  sheetStyles.statusDot,
                  { backgroundColor: statusStyle.text },
                ]}
              />
              <Text
                style={[sheetStyles.statusText, { color: statusStyle.text }]}
              >
                {offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
              </Text>
            </View>
            {offer.createdAt?.toDate && (
              <Text style={sheetStyles.dateText}>
                {offer.createdAt.toDate().toLocaleDateString([], {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </Text>
            )}
          </View>

          {/* Category badges */}
          {(offer.offeredItemCategory || offer.requestedItemCategory) && (
            <View style={sheetStyles.categoryRow}>
              {offer.offeredItemCategory && (
                <View style={sheetStyles.categoryPill}>
                  <Ionicons name="pricetag-outline" size={11} color={NAVY} />
                  <Text style={sheetStyles.categoryPillText}>
                    {offer.offeredItemCategory}
                  </Text>
                </View>
              )}
              {offer.requestedItemCategory &&
                offer.requestedItemCategory !== offer.offeredItemCategory && (
                  <View style={sheetStyles.categoryPill}>
                    <Ionicons name="pricetag-outline" size={11} color={NAVY} />
                    <Text style={sheetStyles.categoryPillText}>
                      {offer.requestedItemCategory}
                    </Text>
                  </View>
                )}
            </View>
          )}

          {/* Item swap visual */}
          <View style={sheetStyles.swapSection}>
            <View style={sheetStyles.swapItem}>
              <Image
                source={{
                  uri:
                    offer.offeredItemImage || "https://via.placeholder.com/100",
                }}
                style={sheetStyles.swapItemImage}
              />
              <View style={sheetStyles.swapItemLabel}>
                <Text style={sheetStyles.swapItemRole}>You offered</Text>
                <Text style={sheetStyles.swapItemTitle} numberOfLines={2}>
                  {offer.offeredItemTitle}
                </Text>
              </View>
            </View>

            <View style={sheetStyles.swapArrow}>
              <Ionicons name="swap-horizontal" size={22} color={NAVY} />
            </View>

            <View style={sheetStyles.swapItem}>
              <Image
                source={{
                  uri:
                    (offer as any).requestedItemImage ||
                    "https://via.placeholder.com/100",
                }}
                style={sheetStyles.swapItemImage}
              />
              <View style={sheetStyles.swapItemLabel}>
                <Text style={sheetStyles.swapItemRole}>For their item</Text>
                <Text style={sheetStyles.swapItemTitle} numberOfLines={2}>
                  {offer.requestedItemTitle}
                </Text>
              </View>
            </View>
          </View>

          {/* ── Owner profile card — wired to live Firestore data ── */}
          <TouchableOpacity
            style={sheetStyles.ownerCard}
            onPress={onViewProfile}
            activeOpacity={0.8}
          >
            {displayAvatar ? (
              <Image
                source={{ uri: displayAvatar }}
                style={sheetStyles.ownerAvatar}
              />
            ) : (
              // Letter-avatar fallback when no photo is available
              <View
                style={[
                  sheetStyles.ownerAvatar,
                  sheetStyles.ownerAvatarFallback,
                ]}
              >
                <Text style={sheetStyles.ownerAvatarInitial}>
                  {displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={sheetStyles.ownerName} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={sheetStyles.ownerSub}>Tap to view profile</Text>
            </View>
            <View style={sheetStyles.profileChevron}>
              <Ionicons name="chevron-forward" size={16} color={NAVY} />
            </View>
          </TouchableOpacity>

          {/* Message preview */}
          {!!offer.message && (
            <View style={sheetStyles.messageBox}>
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={13}
                color="#888"
              />
              <Text style={sheetStyles.messageText} numberOfLines={4}>
                "{offer.message}"
              </Text>
            </View>
          )}

          {/* Decline reason */}
          {offer.status === "declined" && (offer as any).declineReason && (
            <View style={sheetStyles.declineReasonBox}>
              <Ionicons
                name="information-circle-outline"
                size={14}
                color="#E11D48"
              />
              <Text style={sheetStyles.declineReasonText}>
                Reason: {(offer as any).declineReason}
              </Text>
            </View>
          )}

          {/* Confirmation progress (accepted only) */}
          {isAccepted && (
            <View style={sheetStyles.confirmProgress}>
              <View style={sheetStyles.confirmStep}>
                <View
                  style={[
                    sheetStyles.confirmDot,
                    { backgroundColor: iHaveConfirmed ? "#16A34A" : "#E5E7EB" },
                  ]}
                >
                  <Ionicons name="checkmark" size={10} color="#fff" />
                </View>
                <Text
                  style={[
                    sheetStyles.confirmLabel,
                    iHaveConfirmed && { color: "#16A34A" },
                  ]}
                >
                  You confirmed
                </Text>
              </View>
              <View
                style={[
                  sheetStyles.confirmLine,
                  {
                    backgroundColor:
                      iHaveConfirmed && otherHasConfirmed
                        ? "#16A34A"
                        : "#E5E7EB",
                  },
                ]}
              />
              <View style={sheetStyles.confirmStep}>
                <View
                  style={[
                    sheetStyles.confirmDot,
                    {
                      backgroundColor: otherHasConfirmed
                        ? "#16A34A"
                        : "#E5E7EB",
                    },
                  ]}
                >
                  <Ionicons name="checkmark" size={10} color="#fff" />
                </View>
                <Text
                  style={[
                    sheetStyles.confirmLabel,
                    otherHasConfirmed && { color: "#16A34A" },
                  ]}
                >
                  They confirmed
                </Text>
              </View>
            </View>
          )}

          {/* Actions */}
          <View style={sheetStyles.actions}>
            {(isAccepted || isCompleted) && (
              <TouchableOpacity
                style={sheetStyles.messageBtn}
                onPress={onMessage}
                activeOpacity={0.8}
              >
                <Ionicons name="chatbubble-outline" size={15} color={NAVY} />
                <Text style={sheetStyles.messageBtnText}>Message Owner</Text>
              </TouchableOpacity>
            )}

            {isAccepted && (
              <TouchableOpacity
                style={[
                  sheetStyles.completeBtn,
                  iHaveConfirmed && sheetStyles.completeBtnWaiting,
                  otherHasConfirmed && sheetStyles.completeBtnHighlight,
                ]}
                onPress={onComplete}
                disabled={isCompleting || iHaveConfirmed}
                activeOpacity={0.85}
              >
                {isCompleting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : iHaveConfirmed ? (
                  <>
                    <Ionicons name="time-outline" size={15} color="#fff" />
                    <Text style={sheetStyles.completeBtnText}>
                      Waiting for other party…
                    </Text>
                  </>
                ) : (
                  <>
                    <Ionicons
                      name="checkmark-done-circle"
                      size={15}
                      color="#fff"
                    />
                    <Text style={sheetStyles.completeBtnText}>
                      {otherHasConfirmed
                        ? "They confirmed — tap to finish!"
                        : "Mark Trade as Finished"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {isPending && (
              <TouchableOpacity
                style={[
                  sheetStyles.cancelBtn,
                  isCancelling && { opacity: 0.6 },
                ]}
                onPress={onCancel}
                disabled={isCancelling}
                activeOpacity={0.8}
              >
                {isCancelling ? (
                  <ActivityIndicator size="small" color="#E11D48" />
                ) : (
                  <>
                    <Ionicons
                      name="close-circle-outline"
                      size={15}
                      color="#E11D48"
                    />
                    <Text style={sheetStyles.cancelBtnText}>Cancel Offer</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {isCompleted && (
              <View style={sheetStyles.completedBadge}>
                <Ionicons name="trophy" size={15} color="#16A34A" />
                <Text style={sheetStyles.completedBadgeText}>
                  Trade Completed
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function SentOffersScreen() {
  const { offeredItemId, offeredItemTitle, offeredItemImage } =
    useLocalSearchParams<{
      offeredItemId: string;
      offeredItemTitle?: string;
      offeredItemImage?: string;
    }>();
  const router = useRouter();

  const [allOffers, setAllOffers] = useState<TradeOffer[]>([]);
  const [offersLoading, setOffersLoading] = useState(true);

  // ── Live owner info map ─────────────────────────────────────────────────
  // Keyed by ownerId. Populated once allOffers loads; refreshed whenever
  // the set of unique ownerIds changes (e.g. new offer arrives).
  const [ownerInfoMap, setOwnerInfoMap] = useState<Record<string, OwnerInfo>>(
    {},
  );
  const [ownerInfoLoading, setOwnerInfoLoading] = useState(false);

  const [statusFilter, setStatusFilter] = useState<
    TradeOffer["status"] | "all"
  >("all");
  const [categoryFilter, setCategoryFilter] = useState("All");

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [chatTrade, setChatTrade] = useState<TradeOffer | null>(null);

  const [selectedOffer, setSelectedOffer] = useState<TradeOffer | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  const unsubRef = useRef<(() => void) | null>(null);

  // ── Subscribe to sent offers ────────────────────────────────────────────
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || !offeredItemId) return;

    setOffersLoading(true);
    const unsub = subscribeToSentOffers(uid, (incoming) => {
      const filtered = incoming.filter(
        (o) => o.offeredItemId === offeredItemId,
      );
      setAllOffers(filtered);
      setOffersLoading(false);
    });
    unsubRef.current = unsub;
    return () => {
      unsub();
      unsubRef.current = null;
    };
  }, [offeredItemId]);

  // ── Fetch live owner info for every unique ownerId in the offer list ────
  // Runs whenever allOffers changes. Only fetches IDs not yet in the map
  // to avoid redundant network calls.
  useEffect(() => {
    if (allOffers.length === 0) return;

    const missingIds = [
      ...new Set(
        allOffers
          .map((o) => (o as any).ownerId as string | undefined)
          .filter((id): id is string => !!id && !ownerInfoMap[id]),
      ),
    ];

    if (missingIds.length === 0) return;

    setOwnerInfoLoading(true);
    Promise.all(
      missingIds.map(async (id) => {
        try {
          const raw = await getUserInfo(id);
          return [id, resolveOwnerInfo(raw)] as [string, OwnerInfo];
        } catch {
          // getUserInfo failed — keep whatever was on the offer doc
          return [id, { name: "Item Owner", avatar: null }] as [
            string,
            OwnerInfo,
          ];
        }
      }),
    ).then((entries) => {
      setOwnerInfoMap((prev) => ({
        ...prev,
        ...Object.fromEntries(entries),
      }));
      setOwnerInfoLoading(false);
    });
  }, [allOffers]);

  // ── Category chips derived from live data ───────────────────────────────
  const availableCategories = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const o of allOffers) {
      if (o.offeredItemCategory) set.add(o.offeredItemCategory);
      if (o.requestedItemCategory) set.add(o.requestedItemCategory);
    }
    return Array.from(set).sort();
  }, [allOffers]);

  useEffect(() => {
    if (
      categoryFilter !== "All" &&
      !availableCategories.includes(categoryFilter)
    ) {
      setCategoryFilter("All");
    }
  }, [availableCategories]);

  // ── Helper: get resolved owner info for an offer ────────────────────────
  const getOwnerInfo = (offer: TradeOffer): OwnerInfo => {
    const id = (offer as any).ownerId as string | undefined;
    if (id && ownerInfoMap[id]) return ownerInfoMap[id];
    // Fallback to data embedded in the offer doc (may be stale but better
    // than blank). Never show an email address as a "name".
    const offerOwnerName = (offer as any).ownerName as string | undefined;
    const offerOwnerAvatar = (offer as any).ownerAvatar as string | undefined;
    const fallbackName =
      offerOwnerName && !isEmailLike(offerOwnerName)
        ? offerOwnerName
        : "Item Owner";
    return {
      name: fallbackName,
      avatar:
        offerOwnerAvatar &&
        typeof offerOwnerAvatar === "string" &&
        offerOwnerAvatar.startsWith("http")
          ? offerOwnerAvatar
          : null,
    };
  };

  // ── Detail sheet ────────────────────────────────────────────────────────
  const openDetail = (offer: TradeOffer) => {
    setSelectedOffer(offer);
    setSheetVisible(true);
  };

  const closeDetail = () => {
    setSheetVisible(false);
    setTimeout(() => setSelectedOffer(null), 300);
  };

  // ── Actions ─────────────────────────────────────────────────────────────
  const handleCancel = async (offer: TradeOffer) => {
    if (cancellingId != null) return;
    setCancellingId(offer.id);
    try {
      await cancelTradeOffer(offer.id);
      closeDetail();
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Failed to cancel offer.");
    } finally {
      setCancellingId(null);
    }
  };

  const handleComplete = async (offer: TradeOffer) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setCompletingId(offer.id);
    try {
      await completeTrade(offer.id, uid);
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Failed to confirm trade.");
    } finally {
      setCompletingId(null);
    }
  };

  // FIX: was pushing to `/profile/${ownerId}` which doesn't exist.
  // All other screens in the codebase use /user-profile + userId param.
  const handleViewProfile = (offer: TradeOffer) => {
    const ownerId = (offer as any).ownerId as string | undefined;
    if (!ownerId) return;
    closeDetail();
    setTimeout(() => {
      router.push({ pathname: "/user-profile", params: { userId: ownerId } });
    }, 250);
  };

  // ── Filtering ────────────────────────────────────────────────────────────
  const filteredOffers = useMemo(() => {
    return allOffers.filter((o) => {
      const matchStatus = statusFilter === "all" || o.status === statusFilter;
      const matchCategory =
        categoryFilter === "All" ||
        o.offeredItemCategory === categoryFilter ||
        o.requestedItemCategory === categoryFilter;
      return matchStatus && matchCategory;
    });
  }, [allOffers, statusFilter, categoryFilter]);

  const countForStatus = (key: string) =>
    key === "all"
      ? allOffers.length
      : allOffers.filter((o) => o.status === key).length;

  const decodedTitle = offeredItemTitle
    ? decodeURIComponent(offeredItemTitle)
    : "Offered Item";
  const decodedImage = offeredItemImage
    ? decodeURIComponent(offeredItemImage)
    : null;

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
        <Text style={styles.headerTitle}>Sent Offers</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* ── Offered Item Hero ── */}
      <View style={styles.itemHero}>
        {decodedImage ? (
          <Image source={{ uri: decodedImage }} style={styles.itemHeroImage} />
        ) : (
          <View style={[styles.itemHeroImage, styles.itemHeroImageEmpty]}>
            <Ionicons name="image-outline" size={24} color="#CCC" />
          </View>
        )}
        <View style={styles.itemHeroInfo}>
          <Text style={styles.itemHeroLabel}>You offered</Text>
          <Text style={styles.itemHeroName} numberOfLines={2}>
            {decodedTitle}
          </Text>
        </View>
        <View style={styles.itemHeroStats}>
          <Text style={styles.itemHeroStatNum}>{allOffers.length}</Text>
          <Text style={styles.itemHeroStatLabel}>Offers</Text>
        </View>
      </View>

      {/* ── Status Filter Tabs ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterBarContent}
      >
        {STATUS_FILTER_TABS.map((tab) => {
          const count = countForStatus(tab.key);
          if (count === 0 && tab.key !== "all") return null;
          const isActive = statusFilter === tab.key;
          const color =
            tab.key === "all" ? NAVY : (STATUS_COLORS[tab.key]?.text ?? NAVY);
          const bg =
            tab.key === "all"
              ? "#ECEDF8"
              : (STATUS_COLORS[tab.key]?.bg ?? "#F3F4F6");
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
              onPress={() => setStatusFilter(tab.key)}
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

      {/* ── Category Filter Chips ── */}
      {availableCategories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryBar}
          contentContainerStyle={styles.categoryBarContent}
        >
          {["All", ...availableCategories].map((cat) => {
            const isActive = categoryFilter === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryChip,
                  isActive && styles.categoryChipActive,
                ]}
                onPress={() => setCategoryFilter(cat)}
                activeOpacity={0.7}
              >
                {isActive && (
                  <Ionicons name="pricetag" size={11} color="#fff" />
                )}
                <Text
                  style={[
                    styles.categoryChipText,
                    isActive && styles.categoryChipTextActive,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* ── Offers List ── */}
      {offersLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={NAVY} />
          <Text style={styles.loadingText}>Loading offers…</Text>
        </View>
      ) : filteredOffers.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="swap-horizontal-outline" size={52} color="#DDD" />
          <Text style={styles.emptyTitle}>
            {statusFilter === "all" && categoryFilter === "All"
              ? "No offers sent for this item"
              : "No matching offers"}
          </Text>
          <Text style={styles.emptySubtitle}>
            {statusFilter !== "all" || categoryFilter !== "All"
              ? "Try clearing a filter to see more offers."
              : "Offers you send using this item will appear here."}
          </Text>
          {(statusFilter !== "all" || categoryFilter !== "All") && (
            <TouchableOpacity
              style={styles.clearFiltersBtn}
              onPress={() => {
                setStatusFilter("all");
                setCategoryFilter("All");
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="close-circle-outline" size={14} color={NAVY} />
              <Text style={styles.clearFiltersBtnText}>Clear Filters</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        >
          {filteredOffers.map((offer) => (
            <SentOfferCard
              key={offer.id}
              offer={offer}
              ownerInfo={getOwnerInfo(offer)}
              cancellingId={cancellingId}
              completingId={completingId}
              onCancel={() => handleCancel(offer)}
              onComplete={() => handleComplete(offer)}
              onMessage={() => setChatTrade(offer)}
              onPress={() => openDetail(offer)}
              onViewProfile={() => handleViewProfile(offer)}
            />
          ))}
        </ScrollView>
      )}

      {/* ── Detail Bottom Sheet ── */}
      <OfferDetailSheet
        offer={selectedOffer}
        ownerInfo={selectedOffer ? getOwnerInfo(selectedOffer) : { name: "Item Owner", avatar: null }}
        visible={sheetVisible}
        onClose={closeDetail}
        onMessage={() => {
          closeDetail();
          setTimeout(() => setChatTrade(selectedOffer), 300);
        }}
        onViewProfile={() => selectedOffer && handleViewProfile(selectedOffer)}
        onComplete={() => selectedOffer && handleComplete(selectedOffer)}
        onCancel={() => selectedOffer && handleCancel(selectedOffer)}
        completingId={completingId}
        cancellingId={cancellingId}
      />

      {/* ── Chat Modal ── */}
      <TradeChatModal
        visible={!!chatTrade}
        trade={chatTrade}
        isOwner={false}
        onClose={() => setChatTrade(null)}
        onStatusChange={() => {}}
      />
    </SafeAreaView>
  );
}

// ── Individual sent-offer card ─────────────────────────────────────────────────
function SentOfferCard({
  offer,
  ownerInfo,
  cancellingId,
  completingId,
  onCancel,
  onComplete,
  onMessage,
  onPress,
  onViewProfile,
}: {
  offer: TradeOffer;
  ownerInfo: OwnerInfo;
  cancellingId: string | null;
  completingId: string | null;
  onCancel: () => void;
  onComplete: () => void;
  onMessage: () => void;
  onPress: () => void;
  onViewProfile: () => void;
}) {
  const isCancelling = cancellingId === offer.id;
  const isCompleting = completingId === offer.id;
  const isPending = offer.status === "pending";
  const isAccepted = offer.status === "accepted";
  const isCompleted = offer.status === "completed";
  const statusStyle = STATUS_COLORS[offer.status] ?? STATUS_COLORS.pending;

  const myUid = auth.currentUser?.uid ?? "";
  const completedBy: string[] = (offer as any).completedBy ?? [];
  const iHaveConfirmed = completedBy.includes(myUid);
  const otherUid =
    (offer as any).participants?.find((p: string) => p !== myUid) ??
    (offer as any).ownerId ??
    "";
  const otherHasConfirmed = completedBy.includes(otherUid) && !iHaveConfirmed;

  return (
    <TouchableOpacity
      style={[styles.card, { borderColor: statusStyle.border }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Status pill + category badge */}
      <View style={styles.cardTopRow}>
        <View
          style={[styles.cardStatusPill, { backgroundColor: statusStyle.bg }]}
        >
          <View
            style={[
              styles.cardStatusDot,
              { backgroundColor: statusStyle.text },
            ]}
          />
          <Text style={[styles.cardStatusText, { color: statusStyle.text }]}>
            {offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
          </Text>
        </View>

        {(offer.offeredItemCategory || offer.requestedItemCategory) && (
          <View style={styles.cardCategoryPill}>
            <Ionicons name="pricetag-outline" size={10} color={NAVY} />
            <Text style={styles.cardCategoryText} numberOfLines={1}>
              {offer.requestedItemCategory ?? offer.offeredItemCategory}
            </Text>
          </View>
        )}
      </View>

      {/* ── Owner row — tappable, wired to live owner info ── */}
      <TouchableOpacity
        style={styles.ownerRow}
        onPress={onViewProfile}
        activeOpacity={0.75}
      >
        {ownerInfo.avatar ? (
          <Image
            source={{ uri: ownerInfo.avatar }}
            style={styles.ownerAvatar}
          />
        ) : (
          <View style={[styles.ownerAvatar, styles.ownerAvatarFallback]}>
            <Text style={styles.ownerAvatarInitial}>
              {ownerInfo.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.ownerName} numberOfLines={1}>
            {ownerInfo.name}
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
        <View style={styles.detailHint}>
          <Text style={styles.detailHintText}>Profile</Text>
          <Ionicons name="chevron-forward" size={12} color={NAVY} />
        </View>
      </TouchableOpacity>

      {/* Items swap row */}
      <View style={styles.swapRow}>
        <Image
          source={{
            uri: offer.offeredItemImage || "https://via.placeholder.com/60",
          }}
          style={styles.swapImage}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.swapMeta}>You offered</Text>
          <Text style={styles.swapTitle} numberOfLines={2}>
            {offer.offeredItemTitle}
          </Text>
        </View>
        <Ionicons name="swap-horizontal" size={18} color="#AAAAAA" />
        <View style={styles.swapRightSide}>
          <Text style={styles.swapMeta}>For their item</Text>
          <Text style={styles.swapTitle} numberOfLines={2}>
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

      {/* Decline reason */}
      {offer.status === "declined" && (offer as any).declineReason && (
        <View style={styles.declineReasonBox}>
          <Ionicons
            name="information-circle-outline"
            size={12}
            color="#E11D48"
          />
          <Text style={styles.declineReasonText} numberOfLines={2}>
            Reason: {(offer as any).declineReason}
          </Text>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        {isPending && (
          <TouchableOpacity
            style={[styles.cancelBtn, isCancelling && { opacity: 0.6 }]}
            onPress={onCancel}
            disabled={isCancelling}
            activeOpacity={0.8}
          >
            {isCancelling ? (
              <ActivityIndicator size="small" color="#E11D48" />
            ) : (
              <>
                <Ionicons
                  name="close-circle-outline"
                  size={14}
                  color="#E11D48"
                />
                <Text style={styles.cancelBtnText}>Cancel Offer</Text>
              </>
            )}
          </TouchableOpacity>
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
              iHaveConfirmed && styles.completeBtnWaiting,
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
                  Waiting for other party…
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
          <View style={styles.completedBadge}>
            <Ionicons name="trophy" size={14} color="#16A34A" />
            <Text style={styles.completedBadgeText}>Completed</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ── Sheet styles ───────────────────────────────────────────────────────────────
const sheetStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
    maxHeight: "88%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    alignSelf: "center",
    marginBottom: 16,
  },
  closeBtn: {
    position: "absolute",
    top: 14,
    right: 18,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: "700" },
  dateText: { fontSize: 12, color: "#9CA3AF" },
  categoryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  categoryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ECEDF8",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  categoryPillText: { fontSize: 11, fontWeight: "600", color: NAVY },
  declineReasonBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    backgroundColor: "#FFF1F2",
    borderRadius: 10,
    padding: 11,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#FECDD3",
  },
  declineReasonText: {
    fontSize: 13,
    color: "#E11D48",
    flex: 1,
    lineHeight: 18,
    fontWeight: "500",
  },
  swapSection: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8F9FF",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E8EEF9",
    gap: 8,
  },
  swapItem: { flex: 1, alignItems: "center", gap: 8 },
  swapItemImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: "#E5E7EB",
  },
  swapItemLabel: { alignItems: "center", gap: 2 },
  swapItemRole: {
    fontSize: 10,
    color: "#9CA3AF",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  swapItemTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    lineHeight: 18,
  },
  swapArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#ECEDF8",
    alignItems: "center",
    justifyContent: "center",
  },
  ownerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#F8F9FF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E8EEF9",
  },
  ownerAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#E5E7EB",
  },
  ownerAvatarFallback: {
    backgroundColor: NAVY,
    justifyContent: "center",
    alignItems: "center",
  },
  ownerAvatarInitial: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  ownerName: { fontSize: 15, fontWeight: "700", color: "#111827" },
  ownerSub: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  profileChevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ECEDF8",
    alignItems: "center",
    justifyContent: "center",
  },
  messageBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#F7F7F7",
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  messageText: {
    fontSize: 13,
    color: "#555",
    fontStyle: "italic",
    flex: 1,
    lineHeight: 19,
  },
  confirmProgress: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8F9FF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E8EEF9",
  },
  confirmStep: { flex: 1, alignItems: "center", gap: 6 },
  confirmDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmLine: { flex: 1, height: 2, marginHorizontal: 6, borderRadius: 1 },
  confirmLabel: { fontSize: 11, fontWeight: "600", color: "#9CA3AF" },
  actions: { gap: 10 },
  messageBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: NAVY,
    backgroundColor: "#ECEDF8",
  },
  messageBtnText: { fontSize: 14, fontWeight: "700", color: NAVY },
  completeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#16A34A",
  },
  completeBtnWaiting: { backgroundColor: "#6B7280" },
  completeBtnHighlight: { backgroundColor: "#0F9D58" },
  completeBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#FECDD3",
    backgroundColor: "#FFF1F2",
  },
  cancelBtnText: { fontSize: 14, fontWeight: "700", color: "#E11D48" },
  completedBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#F0FDF4",
  },
  completedBadgeText: { fontSize: 14, fontWeight: "700", color: "#16A34A" },
});

// ── Main screen styles ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FF" },
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
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#111827" },
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
  itemHeroImageEmpty: { justifyContent: "center", alignItems: "center" },
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
  itemHeroStats: { alignItems: "center", minWidth: 42 },
  itemHeroStatNum: { fontSize: 22, fontWeight: "800", color: NAVY },
  itemHeroStatLabel: {
    fontSize: 10,
    color: "#9CA3AF",
    fontWeight: "600",
    textTransform: "uppercase",
  },
  filterBar: { maxHeight: 52, marginBottom: 4 },
  filterBarContent: { paddingHorizontal: 16, gap: 6, alignItems: "center" },
  filterTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
    flexShrink: 0,
  },
  filterTabText: { fontSize: 11, fontWeight: "700" },
  filterBadge: {
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  filterBadgeText: { fontSize: 9, fontWeight: "800" },
  categoryBar: { maxHeight: 44, marginBottom: 4 },
  categoryBarContent: {
    paddingHorizontal: 16,
    gap: 6,
    alignItems: "center",
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#D0D4FF",
    backgroundColor: "#fff",
    flexShrink: 0,
  },
  categoryChipActive: { backgroundColor: NAVY, borderColor: NAVY },
  categoryChipText: { fontSize: 11, fontWeight: "700", color: NAVY },
  categoryChipTextActive: { color: "#fff" },
  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 100 },
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
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
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
  cardCategoryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ECEDF8",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  cardCategoryText: { fontSize: 10, fontWeight: "600", color: NAVY },
  ownerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F8F9FF",
    borderRadius: 10,
    padding: 8,
  },
  ownerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E5E7EB",
  },
  ownerAvatarFallback: {
    backgroundColor: NAVY,
    justifyContent: "center",
    alignItems: "center",
  },
  ownerAvatarInitial: { color: "#fff", fontSize: 14, fontWeight: "700" },
  ownerName: { fontSize: 14, fontWeight: "700", color: "#111827" },
  offerDate: { fontSize: 11, color: "#AAAAAA", marginTop: 1 },
  detailHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "#ECEDF8",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  detailHintText: { fontSize: 11, fontWeight: "600", color: NAVY },
  swapRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F8F9FF",
    borderRadius: 10,
    padding: 10,
  },
  swapImage: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
  },
  swapMeta: {
    fontSize: 10,
    color: "#9CA3AF",
    marginBottom: 2,
    fontWeight: "600",
  },
  swapTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1A1A2E",
    lineHeight: 17,
  },
  swapRightSide: { flex: 1 },
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
  declineReasonBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "#FFF1F2",
    borderRadius: 8,
    padding: 9,
    borderWidth: 1,
    borderColor: "#FECDD3",
  },
  declineReasonText: {
    fontSize: 11,
    color: "#E11D48",
    flex: 1,
    lineHeight: 16,
    fontWeight: "500",
  },
  actions: { flexDirection: "row", gap: 8, alignItems: "center" },
  cancelBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#FECDD3",
    backgroundColor: "#FFF1F2",
  },
  cancelBtnText: { fontSize: 13, fontWeight: "700", color: "#E11D48" },
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
  completedBadge: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#F0FDF4",
  },
  completedBadgeText: { fontSize: 12, fontWeight: "700", color: "#16A34A" },
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
  clearFiltersBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ECEDF8",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 4,
  },
  clearFiltersBtnText: { fontSize: 13, fontWeight: "700", color: NAVY },
});