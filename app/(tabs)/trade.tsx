import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { TradeChatModal } from "../../components/TradeChatModal";
import { TradeOffersModal } from "../../components/TradeOffersModal";
import { auth } from "../../firebaseConfig";
import { deleteItem, getAllItems } from "../../services/itemService";
import {
  TradeOffer,
  cancelTradeOffer,
  subscribeToSentOffers,
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
  const [searchPopupVisible, setSearchPopupVisible] = useState(false);

  const [sentOffers, setSentOffers] = useState<TradeOffer[]>([]);
  const [cancellingOfferId, setCancellingOfferId] = useState<string | null>(
    null,
  );
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  const [offersModalVisible, setOffersModalVisible] = useState(false);
  const [selectedItemForOffers, setSelectedItemForOffers] = useState<any>(null);

  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<TradeOffer | null>(null);

  const [chatModalVisible, setChatModalVisible] = useState(false);

  // ── Delete state ─────────────────────────────────────────────────────────
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<any>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  // ─────────────────────────────────────────────────────────────────────────

  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const addButtonScale = useRef(new Animated.Value(1)).current;

  // ── Deep-link: open trade chat directly from a notification ─────────────
  const { openTradeId } = useLocalSearchParams<{ openTradeId?: string }>();

  useEffect(() => {
    if (!openTradeId || sentOffers.length === 0) return;
    const target = sentOffers.find((o) => o.id === openTradeId);
    if (target) {
      setSelectedOffer(target);
      setStatusModalVisible(true);
      setChatModalVisible(true);
    }
  }, [openTradeId, sentOffers]);
  // ─────────────────────────────────────────────────────────────────────────

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

  useEffect(() => {
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) return;

    const unsubscribe = subscribeToSentOffers(currentUserId, (offers) => {
      setSentOffers(offers);
      setSelectedOffer((prev) => {
        if (!prev) return prev;
        const updated = offers.find((o) => o.id === prev.id);
        return updated ?? prev;
      });
    });

    return unsubscribe;
  }, []);

  const handleSeeOffers = (item: any) => {
    setSelectedItemForOffers(item);
    setOffersModalVisible(true);
  };

  const handleDeletePress = (item: any) => {
    setItemToDelete(item);
    setDeleteModalVisible(true);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setDeletingItemId(itemToDelete.id);
    setDeleteModalVisible(false);
    try {
      await deleteItem(itemToDelete.id);
      setUserItems((prev) => prev.filter((i) => i.id !== itemToDelete.id));
    } catch (err: any) {
      console.error("deleteItem failed:", err);
      Alert.alert(
        "Error",
        err?.message ?? "Failed to delete the item. Please try again.",
      );
    } finally {
      setDeletingItemId(null);
      setItemToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setDeleteModalVisible(false);
    setItemToDelete(null);
  };

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

  const filteredSentOffers = sentOffers.filter(
    (offer) =>
      search.length === 0 ||
      offer.offeredItemTitle.toLowerCase().includes(search.toLowerCase()) ||
      offer.requestedItemTitle.toLowerCase().includes(search.toLowerCase()),
  );

  const pendingCount = sentOffers.filter((o) => o.status === "pending").length;

  const renderTradeItem = ({ item }: any) => {
    // Validate image URLs and filter out blob URLs
    const validateImageUrl = (url: string | undefined): boolean => {
      if (!url) return false;
      if (typeof url !== "string") return false;
      if (url.startsWith("blob:")) return false;
      return true;
    };

    const imageUrl = (() => {
      if (validateImageUrl(item?.images?.[0])) return item.images[0];
      if (validateImageUrl(item?.image)) return item.image;
      return "https://via.placeholder.com/200";
    })();

    const isDeleting = deletingItemId === item.id;

    return (
      <View style={[styles.card, isDeleting && styles.cardDeleting]}>
        <Image
          source={{ uri: imageUrl }}
          style={styles.image}
          onError={() => console.warn("Failed to load trade item image:", imageUrl)}
        />
        <Text style={styles.itemName} numberOfLines={2}>
          {item.title || item.name}
        </Text>
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.offerButton}
            onPress={() => handleSeeOffers(item)}
            disabled={isDeleting}
          >
            <Text style={styles.offerText}>See Offers</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDeletePress(item)}
            disabled={isDeleting}
            activeOpacity={0.7}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color="#E11D48" />
            ) : (
              <Ionicons name="trash-outline" size={16} color="#E11D48" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderOfferItem = ({ item: offer }: { item: TradeOffer }) => {
    const statusStyle = STATUS_COLORS[offer.status] || STATUS_COLORS.pending;
    const isCancelling = cancellingOfferId === offer.id;
    const isPending = offer.status === "pending";

    return (
      <View style={styles.offerCard}>
        <TouchableOpacity
          onPress={() => {
            setSelectedOffer(offer);
            setStatusModalVisible(true);
          }}
          activeOpacity={0.8}
        >
          <View
            style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}
          >
            <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>
              {offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
            </Text>
          </View>

          <View style={styles.offerItemsRow}>
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
            <View style={styles.offerArrow}>
              <Ionicons name="swap-horizontal" size={22} color={NAVY} />
            </View>
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

        {isPending &&
          (isCancelling ? (
            <View style={styles.cancelOfferBtn}>
              <ActivityIndicator size="small" color="#E11D48" />
              <Text style={styles.cancelOfferBtnText}>Cancelling…</Text>
            </View>
          ) : confirmCancelId === offer.id ? (
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
            onChangeText={(text) => {
              setSearch(text);
              setSearchPopupVisible(text.length > 0);
            }}
            onSubmitEditing={() => setSearchPopupVisible(false)}
          />
        </View>

        {searchPopupVisible && search.trim().length > 0 && (
          <View style={styles.searchPopup}>
            <Text style={styles.popupTitle}>
              {userItems.filter(
                (item) =>
                  item.title.toLowerCase().includes(search.toLowerCase()) ||
                  item.category.toLowerCase().includes(search.toLowerCase())
              ).length > 0
                ? `Found ${userItems.filter(
                    (item) =>
                      item.title.toLowerCase().includes(search.toLowerCase()) ||
                      item.category.toLowerCase().includes(search.toLowerCase())
                  ).length} related posts`
                : "No related posts found"}
            </Text>
            {userItems
              .filter(
                (item) =>
                  item.title.toLowerCase().includes(search.toLowerCase()) ||
                  item.category.toLowerCase().includes(search.toLowerCase())
              )
              .slice(0, 5).length > 0 ? (
              userItems
                .filter(
                  (item) =>
                    item.title.toLowerCase().includes(search.toLowerCase()) ||
                    item.category.toLowerCase().includes(search.toLowerCase())
                )
                .slice(0, 5)
                .map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.searchResultLink}
                    onPress={() => {
                      setSearch(item.title);
                      setSearchPopupVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.searchResultItem}>
                      <Text style={styles.searchResultText}>
                        {item.title}
                      </Text>
                      <Text style={styles.searchResultCategory}>
                        {item.category}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
            ) : (
              <Text style={styles.noResultsText}>
                Try a different keyword or category.
              </Text>
            )}
          </View>
        )}
      </View>

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

      {/* Incoming offers modal */}
      <TradeOffersModal
        visible={offersModalVisible}
        itemId={selectedItemForOffers?.id ?? null}
        itemTitle={selectedItemForOffers?.title ?? ""}
        onClose={() => {
          setOffersModalVisible(false);
          setSelectedItemForOffers(null);
        }}
      />

      {/* Delete confirmation modal */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCancelDelete}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.deleteModalSheet}>
            <View style={styles.deleteIconWrapper}>
              <Ionicons name="trash" size={32} color="#E11D48" />
            </View>
            <Text style={styles.deleteModalTitle}>Delete Item?</Text>
            <Text style={styles.deleteModalBody}>
              Are you sure you want to delete{" "}
              <Text style={styles.deleteModalItemName}>
                "{itemToDelete?.title || itemToDelete?.name}"
              </Text>
              ? This action cannot be undone.
            </Text>
            <View style={styles.deleteModalActions}>
              <TouchableOpacity
                style={styles.deleteModalCancelBtn}
                onPress={handleCancelDelete}
                activeOpacity={0.8}
              >
                <Text style={styles.deleteModalCancelText}>Keep Item</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteModalConfirmBtn}
                onPress={handleConfirmDelete}
                activeOpacity={0.8}
              >
                <Ionicons name="trash-outline" size={15} color="#fff" />
                <Text style={styles.deleteModalConfirmText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Status detail modal */}
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
                const canChat =
                  selectedOffer.status === "pending" ||
                  selectedOffer.status === "accepted";

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
                          "✅ Trade accepted! Message the owner to coordinate."}
                        {selectedOffer.status === "declined" &&
                          "❌ Offer was declined"}
                        {selectedOffer.status === "cancelled" &&
                          "🚫 You cancelled this offer"}
                      </Text>
                    </View>

                    {canChat && (
                      <TouchableOpacity
                        style={styles.chatBtn}
                        onPress={() => setChatModalVisible(true)}
                        activeOpacity={0.85}
                      >
                        <Ionicons
                          name="chatbubble-ellipses-outline"
                          size={16}
                          color="#fff"
                        />
                        <Text style={styles.chatBtnText}>
                          {selectedOffer.status === "accepted"
                            ? "Message to Coordinate"
                            : "Message Owner"}
                        </Text>
                      </TouchableOpacity>
                    )}

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

      {/* Trade chat modal */}
      <TradeChatModal
        visible={chatModalVisible}
        trade={selectedOffer}
        isOwner={false}
        onClose={() => setChatModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#efeff4" },
  searchWrapper: {
    marginHorizontal: 16,
    marginTop: 30,
    marginBottom: 4,
    position: "relative",
    overflow: "visible",
    zIndex: 9999,
  },
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
  searchPopup: {
    position: "absolute",
    top: 52,
    left: 0,
    right: 0,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E7EB",
    borderWidth: 1,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 30,
    zIndex: 10000,
  },
  popupTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 10,
  },
  searchResultLink: { width: "100%" },
  searchResultItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  searchResultText: { fontSize: 14, fontWeight: "600", color: "#111827" },
  searchResultCategory: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  noResultsText: { color: "#6B7280", fontSize: 13, lineHeight: 20 },
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
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e6e6ea",
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    marginHorizontal: 16,
  },
  cardDeleting: {
    opacity: 0.5,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  deleteButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#FFF1F2",
    borderWidth: 1.5,
    borderColor: "#FECDD3",
    alignItems: "center",
    justifyContent: "center",
  },
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
    marginTop: 28,
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
  cancelOfferBtnText: { fontSize: 12, fontWeight: "600", color: "#E11D48" },
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
  cancelConfirmNoText: { fontSize: 12, fontWeight: "600", color: "#374151" },
  cancelConfirmYes: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#FFF1F2",
    borderWidth: 1.5,
    borderColor: "#FECDD3",
  },
  cancelConfirmYesText: { fontSize: 12, fontWeight: "700", color: "#E11D48" },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyText: { color: "#999", fontSize: 16 },
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  // ── Delete modal styles ──────────────────────────────────────────────────
  deleteModalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 40,
    alignItems: "center",
  },
  deleteIconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FFF1F2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  deleteModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 10,
  },
  deleteModalBody: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
  },
  deleteModalItemName: {
    fontWeight: "700",
    color: "#374151",
  },
  deleteModalActions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  deleteModalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteModalCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
  },
  deleteModalConfirmBtn: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#E11D48",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  deleteModalConfirmText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  // ────────────────────────────────────────────────────────────────────────
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
    marginBottom: 12,
  },
  statusDetailBadgeText: {
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  chatBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: NAVY,
    paddingVertical: 13,
    borderRadius: 12,
    marginBottom: 10,
  },
  chatBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
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
  modalCloseBtn: {
    marginTop: 4,
    backgroundColor: "#F3F4F6",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  modalCloseBtnText: { fontSize: 15, fontWeight: "600", color: "#374151" },
});