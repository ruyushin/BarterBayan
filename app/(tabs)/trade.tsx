import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth } from "../../firebaseConfig";
import { getAllItems } from "../../services/itemService";
import {
  TradeOffer,
  cancelTradeOffer,
  getOffersForItem,
  subscribeToSentOffers,
  updateTradeStatus,
} from "../../services/tradeService";

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
};

export default function TradeScreen() {
  const [activeTab, setActiveTab] = useState("trades");
  const [search, setSearch] = useState("");
  const [sortType, setSortType] = useState("none");
  const [filterCategory, setFilterCategory] = useState("All");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [userItems, setUserItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Trade offer state ────────────────────────────────────────────────────
  const [sentOffers, setSentOffers] = useState<TradeOffer[]>([]);
  const [cancellingOfferId, setCancellingOfferId] = useState<string | null>(
    null,
  );
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  // See Offers modal (incoming offers on YOUR item)
  const [offersModalVisible, setOffersModalVisible] = useState(false);
  const [selectedItemForOffers, setSelectedItemForOffers] = useState<any>(null);
  const [incomingOffers, setIncomingOffers] = useState<TradeOffer[]>([]);
  const [loadingIncoming, setLoadingIncoming] = useState(false);
  const [updatingOfferId, setUpdatingOfferId] = useState<string | null>(null);

  // See Status modal (detail view for a single sent offer)
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<TradeOffer | null>(null);
  // ─────────────────────────────────────────────────────────────────────────

  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const addButtonScale = useRef(new Animated.Value(1)).current;

  // ── Fetch user's own items (one-time, pull-to-refresh only) ──────────────
  useEffect(() => {
    fetchUserItems();
  }, []);

  const fetchUserItems = async () => {
    try {
      setLoading(true);
      const currentUserId = auth.currentUser?.uid;
      if (!currentUserId) return;
      const allItems = await getAllItems();
      setUserItems(
        allItems.filter((item: any) => item.ownerId === currentUserId),
      );
    } catch (error) {
      console.error("Error fetching items:", error);
    } finally {
      setLoading(false);
    }
  };

  // ── Real-time listener for sent offers ───────────────────────────────────
  useEffect(() => {
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) return;

    const unsubscribe = subscribeToSentOffers(currentUserId, (offers) => {
      setSentOffers(offers);
      // Keep the status modal in sync if it's open
      setSelectedOffer((prev) => {
        if (!prev) return prev;
        const updated = offers.find((o) => o.id === prev.id);
        return updated ?? prev;
      });
    });

    return unsubscribe; // Cleans up the listener when the component unmounts
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSeeOffers = async (item: any) => {
    setSelectedItemForOffers(item);
    setOffersModalVisible(true);
    setLoadingIncoming(true);
    try {
      const offers = await getOffersForItem(item.id);
      setIncomingOffers(offers);
    } catch {
      setIncomingOffers([]);
    } finally {
      setLoadingIncoming(false);
    }
  };

  const handleRespondToOffer = async (
    offerId: string,
    response: "accepted" | "declined",
  ) => {
    setUpdatingOfferId(offerId);
    try {
      await updateTradeStatus(offerId, response);
      setIncomingOffers((prev) =>
        prev.map((o) => (o.id === offerId ? { ...o, status: response } : o)),
      );
    } catch {
      /* noop */
    } finally {
      setUpdatingOfferId(null);
    }
  };

  // Pure action — called directly from the inline card confirmation
  const executeCancelOffer = async (offerId: string) => {
    setConfirmCancelId(null);
    setCancellingOfferId(offerId);
    try {
      await cancelTradeOffer(offerId);
      if (selectedOffer?.id === offerId) {
        setStatusModalVisible(false);
        setSelectedOffer(null);
      }
    } catch (err: any) {
      console.error("cancelTradeOffer failed:", err);
      Alert.alert(
        "Error",
        err?.message ?? "Failed to cancel the offer. Please try again.",
      );
    } finally {
      setCancellingOfferId(null);
    }
  };

  // Alert-based confirmation — used only from the status detail modal
  const handleCancelFromModal = (offer: TradeOffer) => {
    Alert.alert(
      "Cancel Trade Offer",
      `Cancel your offer for "${offer.requestedItemTitle}"?`,
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Cancel Offer",
          style: "destructive",
          onPress: () => executeCancelOffer(offer.id),
        },
      ],
    );
  };

  const handleSort = () => {
    setSortType((prev) =>
      prev === "none" ? "likes" : prev === "likes" ? "name" : "none",
    );
  };

  const handleFilterToggle = () => setIsFilterOpen((prev) => !prev);

  const handleCategorySelect = (category: string) => {
    setFilterCategory(category);
    setIsFilterOpen(false);
  };

  const switchTab = (tab: string) => {
    setConfirmCancelId(null);
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

  // ── Derived data ─────────────────────────────────────────────────────────
  const filteredItems = userItems
    .filter((item) => {
      const matchSearch =
        search.length === 0 ||
        (item.title &&
          item.title.toLowerCase().includes(search.toLowerCase())) ||
        (item.description &&
          item.description.toLowerCase().includes(search.toLowerCase()));
      const matchFilter =
        filterCategory === "All" || item.category === filterCategory;
      return matchSearch && matchFilter;
    })
    .sort((a, b) => {
      if (sortType === "likes") return (b.likes || 0) - (a.likes || 0);
      if (sortType === "name")
        return (a.title || "").localeCompare(b.title || "");
      return 0;
    });

  const filteredSentOffers = sentOffers.filter((offer) => {
    return (
      search.length === 0 ||
      offer.offeredItemTitle.toLowerCase().includes(search.toLowerCase()) ||
      offer.requestedItemTitle.toLowerCase().includes(search.toLowerCase())
    );
  });

  // Pending count excludes cancelled offers
  const pendingCount = sentOffers.filter((o) => o.status === "pending").length;

  // ── Renderers ─────────────────────────────────────────────────────────────
  const renderTradeItem = ({ item }: any) => {
    const imageUrl =
      Array.isArray(item?.images) && item.images.length > 0
        ? item.images[0]
        : item?.image || "https://via.placeholder.com/200";
    return (
      <View style={styles.card}>
        <Image source={{ uri: imageUrl }} style={styles.image} />
        <Text style={styles.itemName} numberOfLines={2}>
          {item.title || item.name}
        </Text>
        <TouchableOpacity
          style={styles.offerButton}
          onPress={() => handleSeeOffers(item)}
        >
          <Text style={styles.offerText}>See Offers</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderOfferItem = ({ item: offer }: { item: TradeOffer }) => {
    const statusStyle = STATUS_COLORS[offer.status] || STATUS_COLORS.pending;
    const isCancelling = cancellingOfferId === offer.id;
    const isPending = offer.status === "pending";

    return (
      // Outer View — not touchable, so the cancel button gets its own responder
      <View style={styles.offerCard}>
        {/* Tappable area: badge + items → opens status modal */}
        <TouchableOpacity
          onPress={() => {
            setSelectedOffer(offer);
            setStatusModalVisible(true);
          }}
          activeOpacity={0.8}
        >
          {/* Status badge */}
          <View
            style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}
          >
            <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>
              {offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
            </Text>
          </View>

          {/* Items row */}
          <View style={styles.offerItemsRow}>
            {/* Your offered item */}
            <View style={styles.offerSide}>
              <Image
                source={{
                  uri:
                    offer.offeredItemImage || "https://via.placeholder.com/80",
                }}
                style={styles.offerItemImage}
              />
              <Text style={styles.offerItemLabel} numberOfLines={2}>
                {offer.offeredItemTitle}
              </Text>
            </View>

            {/* Arrow */}
            <View style={styles.offerArrow}>
              <Ionicons name="swap-horizontal" size={22} color={NAVY} />
            </View>

            {/* Requested item */}
            <View style={styles.offerSide}>
              <Image
                source={{
                  uri:
                    offer.requestedItemImage ||
                    "https://via.placeholder.com/80",
                }}
                style={styles.offerItemImage}
              />
              <Text style={styles.offerItemLabel} numberOfLines={2}>
                {offer.requestedItemTitle}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Cancel / inline confirm — no Alert, works reliably in FlatList */}
        {isPending &&
          (isCancelling ? (
            <View style={styles.cancelOfferBtn}>
              <ActivityIndicator size="small" color="#E11D48" />
              <Text style={styles.cancelOfferBtnText}>Cancelling…</Text>
            </View>
          ) : confirmCancelId === offer.id ? (
            // Step 2: inline confirmation row
            <View style={styles.cancelConfirmRow}>
              <Text style={styles.cancelConfirmText}>Cancel this offer?</Text>
              <TouchableOpacity
                style={styles.cancelConfirmNo}
                onPress={() => setConfirmCancelId(null)}
              >
                <Text style={styles.cancelConfirmNoText}>Keep</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelConfirmYes}
                onPress={() => executeCancelOffer(offer.id)}
              >
                <Text style={styles.cancelConfirmYesText}>Yes, cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            // Step 1: tap to reveal confirm row
            <TouchableOpacity
              style={styles.cancelOfferBtn}
              onPress={() => setConfirmCancelId(offer.id)}
              activeOpacity={0.7}
            >
              <Ionicons name="close-circle-outline" size={14} color="#E11D48" />
              <Text style={styles.cancelOfferBtnText}>Cancel Offer</Text>
            </TouchableOpacity>
          ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons
          name="search-outline"
          size={20}
          color="#5B5B7B"
          style={styles.searchIcon}
        />
        <TextInput
          placeholder="Search for items..."
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Tabs */}
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
          {/* Live badge — updates instantly via onSnapshot */}
          {pendingCount > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{pendingCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Sort + Filter (only on trades tab) */}
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

      {/* List */}
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        {activeTab === "trades" ? (
          <FlatList
            data={filteredItems}
            renderItem={renderTradeItem}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 80 }}
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
          <FlatList
            data={filteredSentOffers}
            renderItem={renderOfferItem}
            keyExtractor={(offer) => offer.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 80, paddingHorizontal: 16 }}
            // No onRefresh needed — updates are real-time via onSnapshot
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

      {/* Add Item FAB */}
      <Animated.View style={{ transform: [{ scale: addButtonScale }] }}>
        <TouchableOpacity style={styles.addButton} onPress={handleAddItemPress}>
          <Ionicons name="add" size={20} color="white" />
          <Text style={styles.addText}>Add Item</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* ── See Offers Modal (incoming offers on your item) ───────────────── */}
      <Modal
        visible={offersModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setOffersModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>Offers on</Text>
            <Text style={styles.modalItemName} numberOfLines={1}>
              {selectedItemForOffers?.title}
            </Text>

            {loadingIncoming ? (
              <View style={styles.modalLoader}>
                <ActivityIndicator size="large" color={NAVY} />
              </View>
            ) : incomingOffers.length === 0 ? (
              <View style={styles.modalEmpty}>
                <Ionicons name="inbox-outline" size={48} color="#ccc" />
                <Text style={styles.modalEmptyText}>No offers yet</Text>
              </View>
            ) : (
              <FlatList
                data={incomingOffers}
                keyExtractor={(o) => o.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 16 }}
                renderItem={({ item: offer }) => {
                  const statusStyle =
                    STATUS_COLORS[offer.status] || STATUS_COLORS.pending;
                  const isUpdating = updatingOfferId === offer.id;
                  return (
                    <View style={styles.incomingOfferCard}>
                      <View style={styles.incomingOffererRow}>
                        <Image
                          source={{
                            uri:
                              offer.offererAvatar ||
                              "https://i.pravatar.cc/150?img=1",
                          }}
                          style={styles.incomingOffererAvatar}
                        />
                        <Text style={styles.incomingOffererName}>
                          {offer.offererName}
                        </Text>
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: statusStyle.bg },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              { color: statusStyle.text },
                            ]}
                          >
                            {offer.status.charAt(0).toUpperCase() +
                              offer.status.slice(1)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.incomingItemRow}>
                        <Image
                          source={{
                            uri:
                              offer.offeredItemImage ||
                              "https://via.placeholder.com/80",
                          }}
                          style={styles.incomingItemImage}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.incomingItemLabel}>
                            They're offering:
                          </Text>
                          <Text style={styles.incomingItemTitle}>
                            {offer.offeredItemTitle}
                          </Text>
                        </View>
                      </View>

                      {offer.status === "pending" && (
                        <View style={styles.incomingActions}>
                          <TouchableOpacity
                            style={styles.declineBtn}
                            onPress={() =>
                              handleRespondToOffer(offer.id, "declined")
                            }
                            disabled={isUpdating}
                          >
                            {isUpdating ? (
                              <ActivityIndicator size="small" color="#E11D48" />
                            ) : (
                              <Text style={styles.declineBtnText}>Decline</Text>
                            )}
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.acceptBtn}
                            onPress={() =>
                              handleRespondToOffer(offer.id, "accepted")
                            }
                            disabled={isUpdating}
                          >
                            {isUpdating ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <Text style={styles.acceptBtnText}>Accept</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                }}
              />
            )}

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setOffersModalVisible(false)}
            >
              <Text style={styles.modalCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Status Detail Modal (for a single sent offer) ────────────────── */}
      <Modal
        visible={statusModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setStatusModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: 34 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>Trade Offer Status</Text>

            {selectedOffer &&
              (() => {
                const statusStyle =
                  STATUS_COLORS[selectedOffer.status] || STATUS_COLORS.pending;
                const isPending = selectedOffer.status === "pending";
                const isCancelling = cancellingOfferId === selectedOffer.id;

                return (
                  <>
                    <View style={styles.statusDetailRow}>
                      <View style={styles.statusDetailSide}>
                        <Text style={styles.statusDetailLabel}>
                          You offered
                        </Text>
                        <Image
                          source={{
                            uri:
                              selectedOffer.offeredItemImage ||
                              "https://via.placeholder.com/100",
                          }}
                          style={styles.statusDetailImage}
                        />
                        <Text
                          style={styles.statusDetailTitle}
                          numberOfLines={2}
                        >
                          {selectedOffer.offeredItemTitle}
                        </Text>
                      </View>
                      <Ionicons name="swap-horizontal" size={28} color={NAVY} />
                      <View style={styles.statusDetailSide}>
                        <Text style={styles.statusDetailLabel}>For</Text>
                        <Image
                          source={{
                            uri:
                              selectedOffer.requestedItemImage ||
                              "https://via.placeholder.com/100",
                          }}
                          style={styles.statusDetailImage}
                        />
                        <Text
                          style={styles.statusDetailTitle}
                          numberOfLines={2}
                        >
                          {selectedOffer.requestedItemTitle}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.statusDetailBadge,
                        { backgroundColor: statusStyle.bg },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusDetailBadgeText,
                          { color: statusStyle.text },
                        ]}
                      >
                        {selectedOffer.status === "pending" &&
                          "⏳ Waiting for owner's response"}
                        {selectedOffer.status === "accepted" &&
                          "✅ Trade accepted! Contact the owner."}
                        {selectedOffer.status === "declined" &&
                          "❌ Offer was declined"}
                        {selectedOffer.status === "cancelled" &&
                          "🚫 You cancelled this offer"}
                      </Text>
                    </View>

                    {/* Cancel button — only visible when pending */}
                    {isPending && (
                      <TouchableOpacity
                        style={styles.cancelOfferBtnModal}
                        onPress={() => handleCancelFromModal(selectedOffer)}
                        disabled={isCancelling}
                        activeOpacity={0.8}
                      >
                        {isCancelling ? (
                          <ActivityIndicator size="small" color="#E11D48" />
                        ) : (
                          <>
                            <Ionicons
                              name="close-circle-outline"
                              size={16}
                              color="#E11D48"
                            />
                            <Text style={styles.cancelOfferBtnModalText}>
                              Cancel This Offer
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </>
                );
              })()}

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setStatusModalVisible(false)}
            >
              <Text style={styles.modalCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#efeff4" },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: 14,
    height: 48,
    borderWidth: 1,
    borderColor: "#E9E9E9",
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 16,
  },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, color: "#242424", fontSize: 15, paddingVertical: 8 },
  tabs: {
    marginTop: 10,
    flexDirection: "row",
    marginBottom: 12,
    marginHorizontal: 16,
  },
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

  // Your Trades card
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e6e6ea",
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    marginHorizontal: 16,
  },
  image: { width: 55, height: 55, borderRadius: 8, marginRight: 10 },
  itemName: { flex: 1, fontWeight: "600", color: "#222" },
  offerButton: {
    backgroundColor: NAVY,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 7,
  },
  offerText: { fontSize: 12, color: "#fff", fontWeight: "600" },

  // Your Offers card
  offerCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  offerItemsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 28, // space for the absolute-positioned status badge
  },
  offerSide: { flex: 1, alignItems: "center", gap: 6 },
  offerArrow: { paddingHorizontal: 8 },
  offerItemImage: {
    width: 70,
    height: 70,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
  },
  offerItemLabel: {
    fontSize: 12,
    color: "#374151",
    fontWeight: "600",
    textAlign: "center",
  },
  statusBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusBadgeText: { fontSize: 11, fontWeight: "700" },

  // Cancel offer button (inline in list card)
  cancelOfferBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginTop: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#FECDD3",
    backgroundColor: "#FFF1F2",
  },
  cancelOfferBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#E11D48",
  },

  // Inline cancel confirmation row
  cancelConfirmRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    gap: 8,
  },
  cancelConfirmText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
  cancelConfirmNo: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
  },
  cancelConfirmNoText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
  cancelConfirmYes: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#FFF1F2",
    borderWidth: 1.5,
    borderColor: "#FECDD3",
  },
  cancelConfirmYesText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#E11D48",
  },

  // Cancel offer button (inside status modal)
  cancelOfferBtnModal: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#FECDD3",
    backgroundColor: "#FFF1F2",
    marginBottom: 10,
  },
  cancelOfferBtnModalText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#E11D48",
  },

  // Empty states
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyText: { color: "#999", fontSize: 16 },

  // Add button
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

  // Shared modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    maxHeight: "85%",
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DDD",
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  modalItemName: {
    fontSize: 15,
    fontWeight: "600",
    color: NAVY,
    marginBottom: 16,
  },
  modalLoader: { alignItems: "center", paddingVertical: 40 },
  modalEmpty: { alignItems: "center", paddingVertical: 40, gap: 12 },
  modalEmptyText: { fontSize: 14, color: "#6B7280" },
  modalCloseBtn: {
    marginTop: 16,
    backgroundColor: "#F3F4F6",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  modalCloseBtnText: { fontSize: 15, fontWeight: "600", color: "#374151" },

  // Incoming offer cards
  incomingOfferCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  incomingOffererRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  incomingOffererAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  incomingOffererName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  incomingItemRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  incomingItemImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
  },
  incomingItemLabel: { fontSize: 11, color: "#6B7280", marginBottom: 2 },
  incomingItemTitle: { fontSize: 13, fontWeight: "600", color: "#111827" },
  incomingActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  declineBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#E11D48",
    alignItems: "center",
  },
  declineBtnText: { fontSize: 13, fontWeight: "600", color: "#E11D48" },
  acceptBtn: {
    flex: 2,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#16A34A",
    alignItems: "center",
  },
  acceptBtnText: { fontSize: 13, fontWeight: "600", color: "#fff" },

  // Status detail modal
  statusDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 20,
  },
  statusDetailSide: { flex: 1, alignItems: "center", gap: 8 },
  statusDetailLabel: { fontSize: 12, color: "#6B7280", fontWeight: "600" },
  statusDetailImage: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
  },
  statusDetailTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#111827",
    textAlign: "center",
  },
  statusDetailBadge: {
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginBottom: 8,
  },
  statusDetailBadgeText: {
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
});
