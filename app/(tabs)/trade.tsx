import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth } from "../../firebaseConfig";
import { getUserPostedItems } from "../../services/itemService";
import { TradeOffer, subscribeToSentOffers } from "../../services/tradeService";

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

// Status priority for the summary pill shown on each offered-item card
const STATUS_PRIORITY: TradeOffer["status"][] = [
  "accepted",
  "pending",
  "completed",
  "declined",
  "cancelled",
];

/** Returns the highest-priority status among a group of offers */
function dominantStatus(offers: TradeOffer[]): TradeOffer["status"] | null {
  for (const s of STATUS_PRIORITY) {
    if (offers.some((o) => o.status === s)) return s;
  }
  return offers[0]?.status ?? null;
}

export default function TradeScreen() {
  const [activeTab, setActiveTab] = useState<"trades" | "offers">("trades");
  const [search, setSearch] = useState("");
  const [sortType, setSortType] = useState("none");
  const [filterCategory, setFilterCategory] = useState("All");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [userItems, setUserItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Your Offers tab ──────────────────────────────────────────────────────
  const [sentOffers, setSentOffers] = useState<TradeOffer[]>([]);

  const { openTradeId } = useLocalSearchParams<{ openTradeId?: string }>();

  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const addButtonScale = useRef(new Animated.Value(1)).current;

  useFocusEffect(
    useCallback(() => {
      fetchUserItems();
    }, []),
  );

  const fetchUserItems = async () => {
    try {
      setLoading(true);
      const currentUserId = auth.currentUser?.uid;
      if (!currentUserId) return;
      const myItems = await getUserPostedItems(currentUserId);
      setUserItems(myItems);
    } catch (error) {
      console.error("Error fetching items:", error);
    } finally {
      setLoading(false);
    }
  };

  // Subscribe to sent offers (Your Offers tab)
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    return subscribeToSentOffers(uid, setSentOffers);
  }, []);

  const handleSort = () =>
    setSortType((prev) =>
      prev === "none" ? "likes" : prev === "likes" ? "name" : "none",
    );
  const handleFilterToggle = () => setIsFilterOpen((prev) => !prev);
  const handleCategorySelect = (category: string) => {
    setFilterCategory(category);
    setIsFilterOpen(false);
  };

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

  // ── Your Trades ───────────────────────────────────────────────────────────
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
      if (sortType === "likes") return (b.likes || 0) - (a.likes || 0);
      if (sortType === "name")
        return (a.title || "").localeCompare(b.title || "");
      return 0;
    });

  // ── Your Offers — group by offeredItemId ─────────────────────────────────
  const offeredItemGroups = (() => {
    const map = new Map<
      string,
      { itemId: string; title: string; image: string; offers: TradeOffer[] }
    >();

    sentOffers.forEach((offer) => {
      const key = offer.offeredItemId ?? offer.offeredItemTitle ?? "unknown";
      if (!map.has(key)) {
        map.set(key, {
          itemId: offer.offeredItemId ?? key,
          title: offer.offeredItemTitle ?? "Unknown Item",
          image: offer.offeredItemImage ?? "",
          offers: [],
        });
      }
      map.get(key)!.offers.push(offer);
    });

    return Array.from(map.values()).filter((g) => {
      if (search.length === 0) return true;
      return g.title.toLowerCase().includes(search.toLowerCase());
    });
  })();

  const pendingCount = sentOffers.filter((o) => o.status === "pending").length;

  // ── Trade item card — taps navigate to /trade-offers/[itemId] ────────────
  const renderTradeItem = ({ item }: any) => {
    const imageUrl =
      Array.isArray(item?.images) && item.images.length > 0
        ? item.images[0]
        : item?.image || "https://via.placeholder.com/200";

    return (
      <TouchableOpacity
        style={styles.tradeItemWrapper}
        onPress={() => router.push(`/trade-offers/${item.id}`)}
        activeOpacity={0.85}
      >
        <View style={styles.card}>
          <Image source={{ uri: imageUrl }} style={styles.image} />
          <Text style={styles.itemName} numberOfLines={2}>
            {item.title || item.name}
          </Text>
          <View style={styles.offerButton}>
            <Text style={styles.offerText}>See Offers</Text>
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

  // ── Offered-item card (Your Offers tab) ───────────────────────────────────
  const renderOfferedItem = ({
    item: group,
  }: {
    item: (typeof offeredItemGroups)[number];
  }) => {
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
            pathname: `/sent-offers/${group.itemId}`,
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

          <Text style={styles.itemName} numberOfLines={2}>
            {group.title}
          </Text>

          {/* Offer count + dominant status badge */}
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

          {/* ── Changed: was offer count, now "See Status" ── */}
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

  return (
    <SafeAreaView style={styles.container}>
      {/* ── Search ── */}
      <View style={styles.searchWrapper}>
        <View style={styles.searchContainer}>
          <Ionicons
            name="search-outline"
            size={20}
            color="#5B5B7B"
            style={styles.searchIcon}
          />
          <TextInput
            placeholder="Search for items..."
            placeholderTextColor="#888"
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")} activeOpacity={0.7}>
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
            Your Trades
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

      {/* Sort / Filter — only on Trades tab */}
      {activeTab === "trades" && (
        <>
          <View style={styles.row}>
            <TouchableOpacity style={styles.smallButton} onPress={handleSort}>
              <Ionicons name="swap-vertical" size={14} color="#333" />
              <Text style={styles.smallText}>Sort ({sortType})</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.smallButton}
              onPress={handleFilterToggle}
            >
              <Ionicons name="funnel" size={14} color="#333" />
              <Text style={styles.smallText}>Filter ({filterCategory})</Text>
            </TouchableOpacity>
          </View>
          {isFilterOpen && (
            <View style={styles.filterDropdown}>
              {FILTER_CATEGORIES.map((category) => (
                <TouchableOpacity
                  key={category}
                  onPress={() => handleCategorySelect(category)}
                  style={styles.dropdownItem}
                >
                  <Text
                    style={[
                      styles.dropdownText,
                      filterCategory === category && styles.dropdownTextActive,
                    ]}
                  >
                    {category}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      )}

      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        {activeTab === "trades" ? (
          /* ── Your Trades grid ── */
          <FlatList
            data={filteredItems}
            renderItem={renderTradeItem}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 100 }}
            onRefresh={fetchUserItems}
            refreshing={loading}
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
          /* ── Your Offers grid ── */
          <FlatList
            data={offeredItemGroups}
            renderItem={renderOfferedItem}
            keyExtractor={(g) => g.itemId}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 100 }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons
                  name="swap-horizontal-outline"
                  size={48}
                  color="#ccc"
                />
                <Text style={styles.emptyText}>No trade offers sent yet</Text>
              </View>
            }
          />
        )}
      </Animated.View>

      <Animated.View style={{ transform: [{ scale: addButtonScale }] }}>
        <TouchableOpacity style={styles.addButton} onPress={handleAddItemPress}>
          <Ionicons name="add" size={20} color="white" />
          <Text style={styles.addText}>Add Item</Text>
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },

  // ── Search ──────────────────────────────────────────────────────────────
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

  // ── Tabs ────────────────────────────────────────────────────────────────
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

  // ── Sort / Filter ────────────────────────────────────────────────────────
  row: { flexDirection: "row", marginBottom: 12, marginHorizontal: 16 },
  smallButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#d0d0d0",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    marginRight: 8,
  },
  smallText: { fontSize: 13, color: "#444", marginLeft: 6 },
  filterDropdown: {
    marginHorizontal: 16,
    backgroundColor: "white",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DDD",
    overflow: "hidden",
    marginBottom: 10,
  },
  dropdownItem: { paddingVertical: 12, paddingHorizontal: 15 },
  dropdownText: { fontSize: 13, color: "#333" },
  dropdownTextActive: { fontWeight: "700", color: "#5E3EA1" },

  // ── Trade / Offered item card ────────────────────────────────────────────
  tradeItemWrapper: { marginHorizontal: 16, marginBottom: 10 },
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
  image: { width: 55, height: 55, borderRadius: 8 },
  imageFallback: {
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  itemName: { flex: 1, fontWeight: "600", color: "#222", fontSize: 14 },

  // meta row inside offered-item card
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

  // ── Empty state ──────────────────────────────────────────────────────────
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyText: { color: "#999", fontSize: 16 },

  // ── Add button ───────────────────────────────────────────────────────────
  addButton: {
    position: "absolute",
    bottom: 20,
    right: 16,
    backgroundColor: NAVY,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
  },
  addText: { color: "white", fontWeight: "700", marginLeft: 6 },
});
