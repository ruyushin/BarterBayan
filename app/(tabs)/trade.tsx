import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth } from "../../firebaseConfig";
import { deleteItem, getUserPostedItems } from "../../services/itemService";
import { TradeOffer, subscribeToSentOffers } from "../../services/tradeService";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const FILTER_CATEGORIES = [
  "All",
  "Electronics",
  "Fashion",
  "Living",
  "School/Office",
  "Household",
];

const NAVY = "#2e2d7c";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: "#FFF7ED", text: "#D97706" },
  accepted: { bg: "#F0FDF4", text: "#16A34A" },
  declined: { bg: "#FFF1F2", text: "#E11D48" },
  cancelled: { bg: "#F3F4F6", text: "#6B7280" },
  completed: { bg: "#E8F5E9", text: "#16A34A" },
};

const STATUS_PRIORITY: TradeOffer["status"][] = [
  "accepted",
  "pending",
  "completed",
  "declined",
  "cancelled",
];

const TRADE_SORT_CYCLE = ["none", "recent", "likes", "name"] as const;
type TradeSortType = (typeof TRADE_SORT_CYCLE)[number];

const OFFER_SORT_OPTIONS = ["Default", "Recent"] as const;
type OfferSortValue = "default" | "recent";

// Status filter tabs for "Your Offers"
const OFFER_STATUS_TABS: {
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

function dominantStatus(offers: TradeOffer[]): TradeOffer["status"] | null {
  for (const s of STATUS_PRIORITY) {
    if (offers.some((o) => o.status === s)) return s;
  }
  return offers[0]?.status ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// DeclineReasonModal
// ─────────────────────────────────────────────────────────────────────────────

const DECLINE_PRESETS = [
  "Item no longer available",
  "Not interested in the offered trade",
  "Condition mismatch",
  "Looking for a different category",
  "Other",
];

export interface DeclineReasonModalProps {
  visible: boolean;
  onConfirm: (reason: string) => void | Promise<void>;
  onCancel: () => void;
}

export function DeclineReasonModal({
  visible,
  onConfirm,
  onCancel,
}: DeclineReasonModalProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setSelected(null);
    setCustomReason("");
    setSubmitting(false);
  };

  const handleConfirm = async () => {
    const reason =
      selected === "Other"
        ? customReason.trim()
        : (selected ?? customReason.trim());
    if (!reason) {
      Alert.alert("Reason required", "Please select or enter a reason.");
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(reason);
      reset();
    } catch {
      Alert.alert("Error", "Could not decline the offer. Please try again.");
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    reset();
    onCancel();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "padding"}
        style={declineStyles.overlay}
      >
        <View style={declineStyles.sheet}>
          <View style={declineStyles.handle} />
          <Text style={declineStyles.title}>Decline Offer</Text>
          <Text style={declineStyles.subtitle}>
            Let the offerer know why you're declining (optional but helpful):
          </Text>

          {DECLINE_PRESETS.map((preset) => (
            <TouchableOpacity
              key={preset}
              style={[
                declineStyles.option,
                selected === preset && declineStyles.optionActive,
              ]}
              onPress={() => setSelected(preset)}
              activeOpacity={0.8}
              disabled={submitting}
            >
              <View
                style={[
                  declineStyles.radio,
                  selected === preset && declineStyles.radioActive,
                ]}
              />
              <Text
                style={[
                  declineStyles.optionText,
                  selected === preset && declineStyles.optionTextActive,
                ]}
              >
                {preset}
              </Text>
            </TouchableOpacity>
          ))}

          {selected === "Other" && (
            <TextInput
              style={declineStyles.input}
              placeholder="Describe your reason…"
              placeholderTextColor="#AAA"
              value={customReason}
              onChangeText={setCustomReason}
              multiline
              maxLength={200}
              editable={!submitting}
              textAlignVertical="top"
            />
          )}

          <View style={declineStyles.actions}>
            <TouchableOpacity
              style={declineStyles.cancelBtn}
              onPress={handleCancel}
              activeOpacity={0.8}
              disabled={submitting}
            >
              <Text style={declineStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[declineStyles.confirmBtn, submitting && { opacity: 0.6 }]}
              onPress={handleConfirm}
              activeOpacity={0.8}
              disabled={submitting}
            >
              <Text style={declineStyles.confirmText}>
                {submitting ? "Declining…" : "Decline Offer"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const declineStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DDD",
    alignSelf: "center",
    marginBottom: 18,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F1F1F",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: "#666",
    marginBottom: 16,
    lineHeight: 18,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    marginBottom: 8,
    backgroundColor: "#FAFAFA",
  },
  optionActive: {
    borderColor: NAVY,
    backgroundColor: "#EEF0FF",
  },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#CCC",
  },
  radioActive: {
    borderColor: NAVY,
    backgroundColor: NAVY,
  },
  optionText: { fontSize: 14, color: "#444" },
  optionTextActive: { color: NAVY, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    color: "#333",
    minHeight: 70,
    marginBottom: 16,
    marginTop: 4,
    textAlignVertical: "top",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  cancelText: { fontSize: 14, fontWeight: "600", color: "#555" },
  confirmBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#E11D48",
  },
  confirmText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});

// ─────────────────────────────────────────────────────────────────────────────
// TradeScreen
// ─────────────────────────────────────────────────────────────────────────────

export default function TradeScreen() {
  const [activeTab, setActiveTab] = useState<"trades" | "offers">("trades");

  // ── Your Trades ───────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [sortType, setSortType] = useState<TradeSortType>("none");
  const [filterCategory, setFilterCategory] = useState("All");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [userItems, setUserItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Select / delete mode ──────────────────────────────────────────────────
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedCount, setSelectedCount] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);

  // ── Your Offers ───────────────────────────────────────────────────────────
  const [sentOffers, setSentOffers] = useState<TradeOffer[]>([]);
  const [offerSearch, setOfferSearch] = useState("");
  const [offerCategoryFilter, setOfferCategoryFilter] = useState("All");
  const [offerSortValue, setOfferSortValue] = useState<OfferSortValue>("default");
  const [offerStatusFilter, setOfferStatusFilter] = useState<TradeOffer["status"] | "all">("all");
  const [isOfferSortOpen, setIsOfferSortOpen] = useState(false);
  const [isOfferFilterOpen, setIsOfferFilterOpen] = useState(false);

  const { openTradeId } = useLocalSearchParams<{ openTradeId?: string }>();
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const addButtonScale = useRef(new Animated.Value(1)).current;

  // ─────────────────────────────────────────────────────────────────────────
  // Data fetching
  // ─────────────────────────────────────────────────────────────────────────

  useFocusEffect(
    useCallback(() => {
      fetchUserItems();
      return () => {
        if (!deletingRef.current) {
          setIsSelectMode(false);
          setSelectedItemIds(new Set());
          setSelectedCount(0);
        }
      };
    }, []),
  );

  const fetchUserItems = async () => {
    try {
      setLoading(true);
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const items = await getUserPostedItems(uid);
      setUserItems(items);
    } catch (err) {
      console.error("Error fetching items:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    return subscribeToSentOffers(uid, setSentOffers);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Tab / animation helpers
  // ─────────────────────────────────────────────────────────────────────────

  const switchTab = (tab: "trades" | "offers") => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
    setActiveTab(tab);
    setIsSelectMode(false);
    setSelectedItemIds(new Set());
    setSelectedCount(0);
    setIsOfferSortOpen(false);
    setIsOfferFilterOpen(false);
    setIsFilterOpen(false);
    setIsSortOpen(false);
    setOfferStatusFilter("all");
  };

  const handleAddItemPress = () => {
    Animated.sequence([
      Animated.timing(addButtonScale, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(addButtonScale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(() => router.push("/add-item"));
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Your Trades — filtered + sorted
  // ─────────────────────────────────────────────────────────────────────────

  const SORT_OPTIONS: { value: TradeSortType; label: string }[] = [
    { value: "none", label: "Default" },
    { value: "recent", label: "Recent" },
    { value: "likes", label: "Likes" },
    { value: "name", label: "A-Z" },
  ];

  const SORT_LABEL: Record<TradeSortType, string> = {
    none: "Default",
    recent: "Recent",
    likes: "Likes",
    name: "A–Z",
  };


  const filteredItems = userItems
    .filter((item) => {
      const matchSearch =
        search.length === 0 ||
        item.title?.toLowerCase().includes(search.toLowerCase()) ||
        item.description?.toLowerCase().includes(search.toLowerCase());
      return (
        matchSearch &&
        (filterCategory === "All" || item.category === filterCategory)
      );
    })
    .sort((a, b) => {
      if (sortType === "recent") {
        const aT =
          a.createdAt?.toMillis?.() ??
          (a.createdAt instanceof Date ? a.createdAt.getTime() : 0);
        const bT =
          b.createdAt?.toMillis?.() ??
          (b.createdAt instanceof Date ? b.createdAt.getTime() : 0);
        return bT - aT;
      }
      if (sortType === "likes") return (b.likes || 0) - (a.likes || 0);
      if (sortType === "name")
        return (a.title || "").localeCompare(b.title || "");
      return 0;
    });

  // ─────────────────────────────────────────────────────────────────────────
  // Select / delete handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleLongPress = (itemId: string) => {
    if (!isSelectMode) {
      setIsSelectMode(true);
      setSelectedItemIds(new Set([itemId]));
      setSelectedCount(1);
    }
  };

  const handleSelectToggle = (itemId: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      setSelectedCount(next.size);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedCount === filteredItems.length) {
      setSelectedItemIds(new Set());
      setSelectedCount(0);
    } else {
      setSelectedItemIds(new Set(filteredItems.map((i) => i.id)));
      setSelectedCount(filteredItems.length);
    }
  };

  const handleCancelSelect = () => {
    setIsSelectMode(false);
    setSelectedItemIds(new Set());
    setSelectedCount(0);
  };

  const handleDeleteSelected = () => {
    if (selectedCount === 0) return;
    const idsToDelete = new Set(selectedItemIds);
    const count = idsToDelete.size;

    const doDelete = async () => {
      deletingRef.current = true;
      setDeleting(true);
      try {
        const uid = auth.currentUser?.uid ?? "";
        await Promise.all([...idsToDelete].map((id) => deleteItem(id, uid)));
        setUserItems((prev) => prev.filter((i) => !idsToDelete.has(i.id)));
        setSelectedItemIds(new Set());
        setSelectedCount(0);
        setIsSelectMode(false);
      } catch (err) {
        console.error("Delete failed:", err);
        Alert.alert("Error", "Failed to delete some items. Please try again.");
      } finally {
        deletingRef.current = false;
        setDeleting(false);
      }
    };

    if (Platform.OS === "web") {
      const confirmed = window.confirm(
        `Delete ${count} item${count > 1 ? "s" : ""}? This also removes them from Home and Explore.`,
      );
      if (confirmed) doDelete();
    } else {
      deletingRef.current = true;
      Alert.alert(
        "Delete Items",
        `Delete ${count} item${count > 1 ? "s" : ""}? This also removes them from Home and Explore.`,
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => {
              deletingRef.current = false;
            },
          },
          {
            text: "Delete",
            style: "destructive",
            onPress: doDelete,
          },
        ],
      );
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Your Offers — grouped by offeredItemId, filtered + sorted
  // ─────────────────────────────────────────────────────────────────────────

  type OfferGroup = {
    itemId: string;
    title: string;
    image: string;
    displayCategory: string;
    categorySet: Set<string>;
    offers: TradeOffer[];
    latestAt: number;
  };

  // IDs of posts you currently still have. Used to detect offers that point
  // at a post you've since deleted, so they can be dropped from "Your Offers".
  const myItemIds = new Set(userItems.map((i) => i.id));

  const offeredItemGroups: OfferGroup[] = (() => {
    const map = new Map<string, OfferGroup>();

    sentOffers.forEach((offer) => {
      const key = offer.offeredItemId ?? offer.offeredItemTitle ?? "unknown";
      if (!map.has(key)) {
        map.set(key, {
          itemId: offer.offeredItemId ?? key,
          title: offer.offeredItemTitle ?? "Unknown Item",
          image: offer.offeredItemImage ?? "",
          displayCategory: "",
          categorySet: new Set<string>(),
          offers: [],
          latestAt: 0,
        });
      }
      const entry = map.get(key)!;
      entry.offers.push(offer);

      if (offer.offeredItemCategory) {
        entry.categorySet.add(offer.offeredItemCategory);
        if (!entry.displayCategory)
          entry.displayCategory = offer.offeredItemCategory;
      }
      if (offer.requestedItemCategory) {
        entry.categorySet.add(offer.requestedItemCategory);
        if (!entry.displayCategory)
          entry.displayCategory = offer.requestedItemCategory;
      }

      const t = offer.createdAt?.toMillis?.() ?? 0;
      if (t > entry.latestAt) entry.latestAt = t;
    });

    return Array.from(map.values())
      .filter((g) => {
        // If the post this offer was made with has been deleted, drop it
        // from "Your Offers". Skip this check while userItems is still
        // loading so groups don't briefly disappear on first render.
        if (!loading && g.itemId && !myItemIds.has(g.itemId)) return false;

        const matchSearch =
          offerSearch.length === 0 ||
          g.title.toLowerCase().includes(offerSearch.toLowerCase());
        const matchCat =
          offerCategoryFilter === "All" ||
          g.categorySet.has(offerCategoryFilter);
        const matchStatus =
          offerStatusFilter === "all" ||
          g.offers.some((o) => o.status === offerStatusFilter);
        return matchSearch && matchCat && matchStatus;
      })
      .sort((a, b) => (offerSortValue === "recent" ? b.latestAt - a.latestAt : 0));
  })();

  // Offers tied to posts that still exist — used for the status tab counts
  // so the numbers match what "Your Offers" actually shows.
  const activeSentOffers = sentOffers.filter(
    (o) => loading || !o.offeredItemId || myItemIds.has(o.offeredItemId),
  );

  const pendingCount = activeSentOffers.filter(
    (o) => o.status === "pending",
  ).length;

  const countOffersForStatus = (key: TradeOffer["status"] | "all") =>
    key === "all"
      ? activeSentOffers.length
      : activeSentOffers.filter((o) => o.status === key).length;

  // ─────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────

  const renderTradeItem = ({ item }: any) => {
    const imageUrl =
      Array.isArray(item?.images) && item.images.length > 0
        ? item.images[0]
        : item?.image || "https://via.placeholder.com/200";
    const isSelected = selectedItemIds.has(item.id);
    const isTraded = !!item.isTraded;
    const isInTrade = !!item.inTrade && !isTraded;

    return (
      <TouchableOpacity
        style={[
          styles.tradeItemWrapper,
          isSelected && styles.tradeItemWrapperSelected,
        ]}
        onPress={() => {
          if (isSelectMode) {
            handleSelectToggle(item.id);
          } else {
            router.push(`/trade-offers/${item.id}`);
          }
        }}
        onLongPress={() => handleLongPress(item.id)}
        activeOpacity={0.85}
      >
        <View style={[styles.card, isSelected && styles.cardSelected]}>
          {isSelectMode && (
            <View style={styles.checkboxWrapper}>
              <View
                style={[styles.checkbox, isSelected && styles.checkboxChecked]}
              >
                {isSelected && (
                  <Ionicons name="checkmark" size={12} color="#fff" />
                )}
              </View>
            </View>
          )}

          <View style={styles.imageWrapper}>
            <Image source={{ uri: imageUrl }} style={styles.image} />
            {(isTraded || isInTrade) && (
              <View
                style={[
                  styles.imageBadge,
                  isTraded ? styles.imageBadgeTraded : styles.imageBadgeInTrade,
                ]}
              >
                <Text style={styles.imageBadgeText}>
                  {isTraded ? "Traded" : "In Trade"}
                </Text>
              </View>
            )}
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.itemName} numberOfLines={2}>
              {item.title || item.name}
            </Text>
            {item.category ? (
              <Text style={styles.itemCategory}>{item.category}</Text>
            ) : null}
          </View>

          {!isSelectMode && (
            <TouchableOpacity
              style={styles.offerButton}
              onPress={() => router.push(`/trade-offers/${item.id}`)}
              activeOpacity={0.8}
            >
              <Text style={styles.offerText}>See Offers</Text>
              <Ionicons
                name="chevron-forward"
                size={13}
                color="#fff"
                style={{ marginLeft: 3 }}
              />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderOfferedItem = ({ item: group }: { item: OfferGroup }) => {
    const dominant = dominantStatus(group.offers);
    const statusStyle = dominant
      ? (STATUS_COLORS[dominant] ?? STATUS_COLORS.pending)
      : null;
    const pendingInGroup = group.offers.filter(
      (o) => o.status === "pending",
    ).length;

    return (
      <TouchableOpacity
        style={styles.tradeItemWrapper}
        onPress={() =>
          router.push({
            pathname: `/sent-offers/${group.itemId}` as any,
            params: {
              offeredItemId: group.itemId,
              offeredItemTitle: encodeURIComponent(group.title),
              offeredItemImage: encodeURIComponent(group.image),
            },
          })
        }
        activeOpacity={0.85}
      >
        <View style={styles.card}>
          {group.image ? (
            <Image source={{ uri: group.image }} style={styles.image} />
          ) : (
            <View style={[styles.image, styles.imageFallback]}>
              <Ionicons name="image-outline" size={22} color="#CCC" />
            </View>
          )}

          <View style={{ flex: 1 }}>
            <Text style={styles.itemName} numberOfLines={2}>
              {group.title}
            </Text>
            {group.displayCategory ? (
              <Text style={styles.itemCategory}>{group.displayCategory}</Text>
            ) : null}
          </View>

          <View style={styles.offeredItemMeta}>
            {statusStyle && dominant && (
              <View
                style={[styles.statusPill, { backgroundColor: statusStyle.bg }]}
              >
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: statusStyle.text },
                  ]}
                />
                <Text
                  style={[styles.statusPillText, { color: statusStyle.text }]}
                >
                  {dominant.charAt(0).toUpperCase() + dominant.slice(1)}
                </Text>
              </View>
            )}
            {pendingInGroup > 0 && (
              <View style={styles.pendingBubble}>
                <Text style={styles.pendingBubbleText}>
                  {pendingInGroup} pending
                </Text>
              </View>
            )}
          </View>

          <View style={styles.offerButton}>
            <Text style={styles.offerText}>See Status</Text>
            <Ionicons
              name="chevron-forward"
              size={13}
              color="#fff"
              style={{ marginLeft: 3 }}
            />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // JSX
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      {/* ── Shared Search Bar ── */}
      <View style={styles.searchWrapper}>
        <View style={styles.searchContainer}>
          <Ionicons
            name="search-outline"
            size={20}
            color="#5B5B7B"
            style={styles.searchIcon}
          />
          <TextInput
            placeholder="Search for items…"
            placeholderTextColor="#888"
            style={styles.searchInput}
            value={activeTab === "trades" ? search : offerSearch}
            onChangeText={activeTab === "trades" ? setSearch : setOfferSearch}
            returnKeyType="search"
          />
          {(activeTab === "trades" ? search : offerSearch).length > 0 && (
            <TouchableOpacity
              onPress={() =>
                activeTab === "trades" ? setSearch("") : setOfferSearch("")
              }
              activeOpacity={0.7}
            >
              <Ionicons name="close-circle" size={18} color="#AAAAAA" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Tabs ── */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={activeTab === "trades" ? styles.activeTab : styles.inactiveTab}
          onPress={() => switchTab("trades")}
        >
          <Text
            style={
              activeTab === "trades" ? styles.activeText : styles.inactiveText
            }
          >
            Your Posts
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={activeTab === "offers" ? styles.activeTab : styles.inactiveTab}
          onPress={() => switchTab("offers")}
        >
          <Text
            style={
              activeTab === "offers" ? styles.activeText : styles.inactiveText
            }
          >
            Your Offers
          </Text>
          {pendingCount > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{pendingCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Trades toolbar ── */}
      {activeTab === "trades" && (
        <>
          {isSelectMode ? (
            <View style={styles.selectToolbar}>
              <TouchableOpacity
                style={styles.selectBtn}
                onPress={handleSelectAll}
              >
                <Ionicons
                  name={
                    selectedCount > 0 && selectedCount === filteredItems.length
                      ? "checkbox"
                      : "square-outline"
                  }
                  size={18}
                  color={NAVY}
                />
                <Text style={styles.selectBtnText}>
                  {selectedCount > 0 && selectedCount === filteredItems.length
                    ? "Deselect All"
                    : "Select All"}
                </Text>
              </TouchableOpacity>

              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  style={[
                    styles.selectBtn,
                    styles.deleteBtnWrapper,
                    (selectedCount === 0 || deleting) &&
                      styles.deleteBtnDisabled,
                  ]}
                  onPress={handleDeleteSelected}
                  disabled={selectedCount === 0 || deleting}
                >
                  <Ionicons
                    name="trash"
                    size={16}
                    color={selectedCount > 0 ? "#E11D48" : "#CCC"}
                  />
                  <Text
                    style={[
                      styles.deleteText,
                      selectedCount === 0 && styles.deleteTextDisabled,
                    ]}
                  >
                    {deleting ? "Deleting…" : `Delete (${selectedCount})`}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.selectBtn}
                  onPress={handleCancelSelect}
                >
                  <Ionicons name="close" size={18} color="#666" />
                  <Text style={styles.selectBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.filterRow}>
              {/* Sort dropdown */}
              <Pressable
                style={[
                  styles.filterBtn,
                  sortType !== "none" && styles.filterBtnActive,
                ]}
                onPress={() => {
                  setIsSortOpen((p) => !p);
                  setIsFilterOpen(false);
                }}
              >
                <Ionicons
                  name="swap-vertical"
                  size={13}
                  color={sortType !== "none" ? "#fff" : NAVY}
                />
                <Text
                  style={[
                    styles.filterText,
                    sortType !== "none" && styles.filterTextActive,
                  ]}
                >
                  {SORT_LABEL[sortType]}
                </Text>
                <Ionicons
                  name={isSortOpen ? "chevron-up" : "chevron-down"}
                  size={13}
                  color={sortType !== "none" ? "#fff" : NAVY}
                />
              </Pressable>

              {/* Category dropdown */}
              <Pressable
                style={[
                  styles.filterBtn,
                  filterCategory !== "All" && styles.filterBtnActive,
                ]}
                onPress={() => {
                  setIsFilterOpen((p) => !p);
                  setIsSortOpen(false);
                }}
              >
                <Ionicons
                  name="options-outline"
                  size={13}
                  color={filterCategory !== "All" ? "#fff" : NAVY}
                />
                <Text
                  style={[
                    styles.filterText,
                    filterCategory !== "All" && styles.filterTextActive,
                  ]}
                >
                  {filterCategory}
                </Text>
                <Ionicons
                  name={isFilterOpen ? "chevron-up" : "chevron-down"}
                  size={13}
                  color={filterCategory !== "All" ? "#fff" : NAVY}
                />
              </Pressable>
            </View>
          )}

          {/* Sort dropdown list */}
          {isSortOpen && !isSelectMode && (
            <View style={styles.filterDropdown}>
              {SORT_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    setSortType(option.value);
                    setIsSortOpen(false);
                  }}
                  style={[
                    styles.dropdownItem,
                    sortType === option.value && styles.dropdownItemActive,
                  ]}
                >
                  {sortType === option.value && (
                    <Ionicons
                      name="checkmark"
                      size={14}
                      color={NAVY}
                      style={{ marginRight: 6 }}
                    />
                  )}
                  <Text
                    style={[
                      styles.dropdownText,
                      sortType === option.value && styles.dropdownTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Category dropdown list */}
          {isFilterOpen && !isSelectMode && (
            <View style={styles.filterDropdown}>
              {FILTER_CATEGORIES.map((cat) => (
                <Pressable
                  key={cat}
                  onPress={() => {
                    setFilterCategory(cat);
                    setIsFilterOpen(false);
                  }}
                  style={[
                    styles.dropdownItem,
                    filterCategory === cat && styles.dropdownItemActive,
                  ]}
                >
                  {filterCategory === cat && (
                    <Ionicons
                      name="checkmark"
                      size={14}
                      color={NAVY}
                      style={{ marginRight: 6 }}
                    />
                  )}
                  <Text
                    style={[
                      styles.dropdownText,
                      filterCategory === cat && styles.dropdownTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}

      {/* ── Offers toolbar ── */}
      {activeTab === "offers" && (
        <>
          {/* Status filter tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.offerStatusBar}
            contentContainerStyle={styles.offerStatusBarContent}
          >
            {OFFER_STATUS_TABS.map((tab) => {
              const count = countOffersForStatus(tab.key);
              if (count === 0 && tab.key !== "all") return null;
              const isActive = offerStatusFilter === tab.key;
              const color =
                tab.key === "all"
                  ? NAVY
                  : (STATUS_COLORS[tab.key]?.text ?? NAVY);
              const bg =
                tab.key === "all"
                  ? "#ECEDF8"
                  : (STATUS_COLORS[tab.key]?.bg ?? "#F3F4F6");
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[
                    styles.offerStatusTab,
                    isActive && {
                      backgroundColor: tab.key === "all" ? NAVY : color,
                      borderColor: color,
                    },
                  ]}
                  onPress={() => setOfferStatusFilter(tab.key)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={tab.icon as any}
                    size={13}
                    color={isActive ? "#fff" : color}
                  />
                  <Text
                    style={[
                      styles.offerStatusTabText,
                      { color: isActive ? "#fff" : color },
                    ]}
                  >
                    {tab.label}
                  </Text>
                  {count > 0 && (
                    <View
                      style={[
                        styles.offerStatusBadge,
                        {
                          backgroundColor: isActive
                            ? "rgba(255,255,255,0.25)"
                            : bg,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.offerStatusBadgeText,
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

          <View style={styles.filterRow}>
            {/* Sort dropdown */}
            <Pressable
              style={[
                styles.filterBtn,
                offerSortValue !== "default" && styles.filterBtnActive,
              ]}
              onPress={() => {
                setIsOfferSortOpen((p) => !p);
                setIsOfferFilterOpen(false);
              }}
            >
              <Ionicons
                name="swap-vertical"
                size={13}
                color={offerSortValue !== "default" ? "#fff" : NAVY}
              />
              <Text
                style={[
                  styles.filterText,
                  offerSortValue !== "default" && styles.filterTextActive,
                ]}
              >
                {offerSortValue === "recent" ? "Recent" : "Default"}
              </Text>
              <Ionicons
                name={isOfferSortOpen ? "chevron-up" : "chevron-down"}
                size={13}
                color={offerSortValue !== "default" ? "#fff" : NAVY}
              />
            </Pressable>

            {/* Category dropdown */}
            <Pressable
              style={[
                styles.filterBtn,
                offerCategoryFilter !== "All" && styles.filterBtnActive,
              ]}
              onPress={() => {
                setIsOfferFilterOpen((p) => !p);
                setIsOfferSortOpen(false);
              }}
            >
              <Ionicons
                name="options-outline"
                size={13}
                color={offerCategoryFilter !== "All" ? "#fff" : NAVY}
              />
              <Text
                style={[
                  styles.filterText,
                  offerCategoryFilter !== "All" && styles.filterTextActive,
                ]}
              >
                {offerCategoryFilter}
              </Text>
              <Ionicons
                name={isOfferFilterOpen ? "chevron-up" : "chevron-down"}
                size={13}
                color={offerCategoryFilter !== "All" ? "#fff" : NAVY}
              />
            </Pressable>
          </View>

          {/* Sort dropdown list */}
          {isOfferSortOpen && (
            <View style={styles.filterDropdown}>
              {OFFER_SORT_OPTIONS.map((opt) => {
                const val = opt.toLowerCase() as OfferSortValue;
                return (
                  <Pressable
                    key={opt}
                    onPress={() => {
                      setOfferSortValue(val);
                      setIsOfferSortOpen(false);
                    }}
                    style={[
                      styles.dropdownItem,
                      offerSortValue === val && styles.dropdownItemActive,
                    ]}
                  >
                    {offerSortValue === val && (
                      <Ionicons
                        name="checkmark"
                        size={14}
                        color={NAVY}
                        style={{ marginRight: 6 }}
                      />
                    )}
                    <Text
                      style={[
                        styles.dropdownText,
                        offerSortValue === val && styles.dropdownTextActive,
                      ]}
                    >
                      {opt}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Category dropdown list */}
          {isOfferFilterOpen && (
            <View style={styles.filterDropdown}>
              {FILTER_CATEGORIES.map((cat) => (
                <Pressable
                  key={cat}
                  onPress={() => {
                    setOfferCategoryFilter(cat);
                    setIsOfferFilterOpen(false);
                  }}
                  style={[
                    styles.dropdownItem,
                    offerCategoryFilter === cat && styles.dropdownItemActive,
                  ]}
                >
                  {offerCategoryFilter === cat && (
                    <Ionicons
                      name="checkmark"
                      size={14}
                      color={NAVY}
                      style={{ marginRight: 6 }}
                    />
                  )}
                  <Text
                    style={[
                      styles.dropdownText,
                      offerCategoryFilter === cat && styles.dropdownTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}

      {/* ── List content ── */}
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        {activeTab === "trades" ? (
          <FlatList
            data={filteredItems}
            renderItem={renderTradeItem}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 120 }}
            onRefresh={fetchUserItems}
            refreshing={loading}
            ListHeaderComponent={
              !isSelectMode ? (
                <Text style={styles.longPressHint}>
                  Long-press an item to select and delete
                </Text>
              ) : null
            }
            ListEmptyComponent={
              !loading ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="cube-outline" size={48} color="#ccc" />
                  <Text style={styles.emptyText}>No items listed yet</Text>
                </View>
              ) : null
            }
          />
        ) : (
          <FlatList
            data={offeredItemGroups}
            renderItem={renderOfferedItem}
            keyExtractor={(g) => g.itemId}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 120 }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons
                  name="swap-horizontal-outline"
                  size={48}
                  color="#ccc"
                />
                <Text style={styles.emptyText}>
                  {offerStatusFilter === "all" &&
                  offerCategoryFilter === "All" &&
                  offerSearch.length === 0
                    ? "No trade offers sent yet"
                    : "No offers match your filters"}
                </Text>
              </View>
            }
          />
        )}
      </Animated.View>

      {/* ── FAB (hidden during select mode) ── */}
      {!isSelectMode && (
        <Animated.View
          style={[
            styles.fabWrapper,
            { transform: [{ scale: addButtonScale }] },
          ]}
        >
          <TouchableOpacity
            style={styles.addButton}
            onPress={handleAddItemPress}
          >
            <Ionicons name="add" size={20} color="white" />
            <Text style={styles.addText}>Add Item</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },

  searchWrapper: { marginHorizontal: 16, paddingTop: 32, marginBottom: 16 },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: 14,
    height: 48,
    borderWidth: 1,
    borderColor: "#E9E9E9",
    paddingHorizontal: 14,
  },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, color: "#242424", fontSize: 15, paddingVertical: 8 },

  tabs: { flexDirection: "row", marginBottom: 12, marginHorizontal: 16 },
  activeTab: {
    backgroundColor: NAVY,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    marginRight: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  inactiveTab: {
    backgroundColor: "#bfbfbf",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    marginRight: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  activeText: { color: "white", fontWeight: "600" },
  inactiveText: { color: "#555" },
  tabBadge: {
    backgroundColor: "#EF4444",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  tabBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },

  // ── Offers status filter tabs ──
  offerStatusBar: { maxHeight: 44, marginHorizontal: 16, marginBottom: 10 },
  offerStatusBarContent: { gap: 6, alignItems: "center" },
  offerStatusTab: {
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
  offerStatusTabText: { fontSize: 11, fontWeight: "700" },
  offerStatusBadge: {
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  offerStatusBadgeText: { fontSize: 9, fontWeight: "800" },

  // ── Explore-style filter row/buttons/dropdown ──
  filterRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 10,
    gap: 8,
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 5,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  filterBtnActive: { backgroundColor: NAVY, borderColor: NAVY },
  filterText: { fontSize: 13, fontWeight: "600", color: NAVY },
  filterTextActive: { color: "#fff" },
  filterDropdown: {
    marginHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  dropdownItem: {
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    flexDirection: "row",
    alignItems: "center",
  },
  dropdownItemActive: { backgroundColor: "#F0F0FF" },
  dropdownText: { fontSize: 14, color: "#333" },
  dropdownTextActive: { fontWeight: "700", color: NAVY },

  selectToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#F0F2FF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D0D4FF",
  },
  selectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  selectBtnText: { fontSize: 13, color: NAVY, fontWeight: "600" },
  deleteBtnWrapper: { borderColor: "#FFD0D9" },
  deleteBtnDisabled: { opacity: 0.5 },
  deleteText: { fontSize: 13, color: "#E11D48", fontWeight: "600" },
  deleteTextDisabled: { color: "#CCC" },
  longPressHint: {
    textAlign: "center",
    fontSize: 11,
    color: "#BBB",
    marginTop: 4,
    marginBottom: 6,
    marginHorizontal: 16,
  },

  tradeItemWrapper: { marginHorizontal: 16, marginBottom: 10 },
  tradeItemWrapperSelected: {
    borderRadius: 14,
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F7FF",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E8EEF9",
    gap: 10,
  },
  cardSelected: {
    backgroundColor: "#EEF0FF",
    borderColor: NAVY,
    borderWidth: 2,
  },

  imageWrapper: { position: "relative" },
  image: { width: 55, height: 55, borderRadius: 8 },
  imageFallback: {
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  imageBadge: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 2,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    alignItems: "center",
  },
  imageBadgeTraded: { backgroundColor: "rgba(22,163,74,0.82)" },
  imageBadgeInTrade: { backgroundColor: "rgba(46,45,124,0.82)" },
  imageBadgeText: { fontSize: 9, fontWeight: "700", color: "#fff" },

  itemName: { fontWeight: "600", color: "#222", fontSize: 14 },
  itemCategory: { fontSize: 11, color: "#888", marginTop: 2 },

  checkboxWrapper: { marginRight: 4 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#C0C0D0",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: NAVY, borderColor: NAVY },

  offeredItemMeta: { flexDirection: "column", alignItems: "flex-end", gap: 4 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusPillText: { fontSize: 10, fontWeight: "700" },
  pendingBubble: {
    backgroundColor: "#FFF7ED",
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  pendingBubbleText: { fontSize: 10, fontWeight: "700", color: "#D97706" },

  offerButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: NAVY,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
  },
  offerText: { fontSize: 12, color: "#fff", fontWeight: "600" },

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    color: "#999",
    fontSize: 16,
    textAlign: "center",
    paddingHorizontal: 24,
  },

  fabWrapper: { position: "absolute", bottom: 20, right: 16 },
  addButton: {
    backgroundColor: NAVY,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  addText: { color: "white", fontWeight: "700", marginLeft: 6 },
});