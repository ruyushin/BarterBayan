import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { TradeChatModal } from "../../components/TradeChatModal";
import { auth } from "../../firebaseConfig";
import { getUserPostedItems } from "../../services/itemService";
import {
  TradeOffer,
  cancelTradeOffer,
  completeTrade,
  submitTradeReview,
  subscribeToOffersForItem,
  subscribeToSentOffers,
  subscribeToTrade,
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
  completed: { bg: "#E8F5E9", text: "#16A34A" },
};

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

export default function TradeScreen() {
  const [activeTab, setActiveTab] = useState<"trades" | "offers">("trades");
  const [search, setSearch] = useState("");
  const [sortType, setSortType] = useState("none");
  const [filterCategory, setFilterCategory] = useState("All");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [userItems, setUserItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [sentOffers, setSentOffers] = useState<TradeOffer[]>([]);
  const [cancellingOfferId, setCancellingOfferId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [completingOfferId, setCompletingOfferId] = useState<string | null>(null);

  const [chatTrade, setChatTrade] = useState<TradeOffer | null>(null);
  const [chatIsOwner, setChatIsOwner] = useState(false);

  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);

  const [offersModalVisible, setOffersModalVisible] = useState(false);
  const [selectedItemForOffers, setSelectedItemForOffers] = useState<any>(null);
  const [incomingOffers, setIncomingOffers] = useState<TradeOffer[]>([]);
  const [updatingOfferId, setUpdatingOfferId] = useState<string | null>(null);

  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<TradeOffer | null>(null);

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

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    return subscribeToSentOffers(uid, setSentOffers);
  }, []);

  useEffect(() => {
    if (!openTradeId || sentOffers.length === 0) return;
    const target = sentOffers.find((o) => o.id === openTradeId);
    if (target) {
      setSelectedOffer(target);
      setStatusModalVisible(true);
      openChat(target, false);
    }
  }, [openTradeId, sentOffers]);

  useEffect(() => {
    if (!statusModalVisible || !selectedOffer?.id) return;
    return subscribeToTrade(selectedOffer.id, (updated) => {
      if (updated) setSelectedOffer(updated);
    });
  }, [statusModalVisible, selectedOffer?.id]);

  useEffect(() => {
    if (!offersModalVisible || !selectedItemForOffers?.id) return;
    return subscribeToOffersForItem(selectedItemForOffers.id, setIncomingOffers);
  }, [offersModalVisible, selectedItemForOffers?.id]);

  const handleSeeOffers = (item: any) => {
    setIncomingOffers([]);
    setSelectedItemForOffers(item);
    setOffersModalVisible(true);
  };

  const handleRespondToOffer = async (
    offerId: string,
    response: "accepted" | "declined",
  ) => {
    setUpdatingOfferId(offerId);
    try {
      await updateTradeStatus(offerId, response);
      if (response === "accepted") {
        const acceptedOffer = incomingOffers.find((o) => o.id === offerId);
        if (acceptedOffer) {
          setTimeout(() => {
            setOffersModalVisible(false);
            setSelectedOffer({ ...acceptedOffer, status: "accepted" });
            setStatusModalVisible(true);
          }, 500);
        }
      }
    } catch {
      /* noop */
    } finally {
      setUpdatingOfferId(null);
    }
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
      Alert.alert("Error", err?.message ?? "Failed to cancel the offer.");
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

  const handleCompleteTrade = async (offer: TradeOffer) => {
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

  const handleSubmitReview = async (offer: TradeOffer) => {
    const currentUser = auth.currentUser;
    if (!currentUser || reviewRating === 0) return;
    setSubmittingReview(true);
    const myUid = currentUser.uid;
    const targetUserId =
      offer.participants?.find((p) => p !== myUid) ?? offer.ownerId;
    try {
      const bothDone = await submitTradeReview(
        offer.id,
        myUid,
        targetUserId,
        reviewRating,
        reviewComment.trim(),
      );
      setShowReviewForm(false);
      setReviewRating(0);
      setReviewComment("");
      if (bothDone) {
        Alert.alert("Reviews Published!", "Both reviews are now live on your profiles.");
      } else {
        Alert.alert("Review Submitted!", "Waiting for the other person — both reviews reveal together.");
      }
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Failed to submit review.");
    } finally {
      setSubmittingReview(false);
    }
  };

  const closeStatusModal = () => {
    setStatusModalVisible(false);
    setShowReviewForm(false);
    setReviewRating(0);
    setReviewComment("");
  };

  const openChat = (trade: TradeOffer, asOwner: boolean) => {
    setChatTrade(trade);
    setChatIsOwner(asOwner);
  };

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
    setConfirmCancelId(null);
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
    setActiveTab(tab);
  };

  const handleAddItemPress = () => {
    Animated.sequence([
      Animated.timing(addButtonScale, { toValue: 0.95, duration: 100, useNativeDriver: true }),
      Animated.timing(addButtonScale, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start(() => router.push("/add-item"));
  };

  const filteredItems = userItems
    .filter((item) => {
      const matchSearch =
        search.length === 0 ||
        item.title?.toLowerCase().includes(search.toLowerCase()) ||
        item.description?.toLowerCase().includes(search.toLowerCase());
      return matchSearch && (filterCategory === "All" || item.category === filterCategory);
    })
    .sort((a, b) => {
      if (sortType === "likes") return (b.likes || 0) - (a.likes || 0);
      if (sortType === "name") return (a.title || "").localeCompare(b.title || "");
      return 0;
    });

  const filteredSentOffers = sentOffers.filter((offer) => {
    if (offer.status === "declined" || offer.status === "cancelled") return false;
    return (
      search.length === 0 ||
      offer.offeredItemTitle.toLowerCase().includes(search.toLowerCase()) ||
      offer.requestedItemTitle.toLowerCase().includes(search.toLowerCase())
    );
  });

  const pendingCount = sentOffers.filter((o) => o.status === "pending").length;

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
        <TouchableOpacity style={styles.offerButton} onPress={() => handleSeeOffers(item)}>
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
      <View style={styles.offerCard}>
        <TouchableOpacity
          onPress={() => { setSelectedOffer(offer); setStatusModalVisible(true); }}
          activeOpacity={0.8}
        >
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>
              {offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
            </Text>
          </View>
          <View style={styles.offerItemsRow}>
            <View style={styles.offerSide}>
              <Image
                source={{ uri: offer.offeredItemImage || "https://via.placeholder.com/80" }}
                style={styles.offerItemImage}
              />
              <Text style={styles.offerItemLabel} numberOfLines={2}>{offer.offeredItemTitle}</Text>
            </View>
            <View style={styles.offerArrow}>
              <Ionicons name="swap-horizontal" size={22} color={NAVY} />
            </View>
            <View style={styles.offerSide}>
              <Image
                source={{ uri: offer.requestedItemImage || "https://via.placeholder.com/80" }}
                style={styles.offerItemImage}
              />
              <Text style={styles.offerItemLabel} numberOfLines={2}>{offer.requestedItemTitle}</Text>
            </View>
          </View>
        </TouchableOpacity>

        {isPending &&
          (isCancelling ? (
            <View style={styles.cancelOfferBtn}>
              <ActivityIndicator size="small" color="#E11D48" />
              <Text style={styles.cancelOfferBtnText}>Cancelling...</Text>
            </View>
          ) : confirmCancelId === offer.id ? (
            <View style={styles.cancelConfirmRow}>
              <Text style={styles.cancelConfirmText}>Cancel this offer?</Text>
              <TouchableOpacity style={styles.cancelConfirmNo} onPress={() => setConfirmCancelId(null)}>
                <Text style={styles.cancelConfirmNoText}>Keep</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelConfirmYes} onPress={() => executeCancelOffer(offer.id)}>
                <Text style={styles.cancelConfirmYesText}>Yes, cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.cancelOfferBtn} onPress={() => setConfirmCancelId(offer.id)} activeOpacity={0.7}>
              <Ionicons name="close-circle-outline" size={14} color="#E11D48" />
              <Text style={styles.cancelOfferBtnText}>Cancel Offer</Text>
            </TouchableOpacity>
          ))}
      </View>
    );
  };

  const getStatusIcon = (
    isPending: boolean,
    isAccepted: boolean,
    isCompleted: boolean,
    isDeclined: boolean,
  ): keyof typeof Ionicons.glyphMap => {
    if (isPending) return "time-outline";
    if (isAccepted) return "checkmark-circle-outline";
    if (isCompleted) return "trophy-outline";
    if (isDeclined) return "close-circle-outline";
    return "ban-outline";
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* ── Search (matches home page style) ── */}
      <View style={styles.searchWrapper}>
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={20} color="#5B5B7B" style={styles.searchIcon} />
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
          <Text style={activeTab === "trades" ? styles.activeText : styles.inactiveText}>
            Your Trades
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={activeTab === "offers" ? styles.activeTab : styles.inactiveTab}
          onPress={() => switchTab("offers")}
        >
          <Text style={activeTab === "offers" ? styles.activeText : styles.inactiveText}>
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
            <TouchableOpacity style={styles.smallButton} onPress={handleFilterToggle}>
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
                  <Text style={[styles.dropdownText, filterCategory === category && styles.dropdownTextActive]}>
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
          <FlatList
            data={filteredSentOffers}
            renderItem={renderOfferItem}
            keyExtractor={(offer) => offer.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 16 }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="swap-horizontal-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>No active trade offers</Text>
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

      {/* ── See Offers Modal ── */}
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

            {incomingOffers.length === 0 ? (
              <View style={styles.modalEmpty}>
                <Ionicons name="mail-unread-outline" size={48} color="#ccc" />
                <Text style={styles.modalEmptyText}>No offers yet</Text>
              </View>
            ) : (
              <FlatList
                data={incomingOffers}
                keyExtractor={(o) => o.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 16 }}
                renderItem={({ item: offer }) => {
                  const statusStyle = STATUS_COLORS[offer.status] || STATUS_COLORS.pending;
                  const isUpdating = updatingOfferId === offer.id;
                  const isAccepted = offer.status === "accepted";
                  const isCompleted = offer.status === "completed";
                  return (
                    <View style={styles.incomingOfferCard}>
                      <View style={styles.incomingOffererRow}>
                        <Image
                          source={{ uri: offer.offererAvatar || "https://i.pravatar.cc/150?img=1" }}
                          style={styles.incomingOffererAvatar}
                        />
                        <Text style={styles.incomingOffererName}>{offer.offererName}</Text>
                        <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                          <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>
                            {offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.incomingItemRow}>
                        <Image
                          source={{ uri: offer.offeredItemImage || "https://via.placeholder.com/80" }}
                          style={styles.incomingItemImage}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.incomingItemLabel}>They're offering:</Text>
                          <Text style={styles.incomingItemTitle}>{offer.offeredItemTitle}</Text>
                        </View>
                      </View>

                      {offer.status === "pending" && (
                        <View style={styles.incomingActions}>
                          <TouchableOpacity
                            style={styles.declineBtn}
                            onPress={() => handleRespondToOffer(offer.id, "declined")}
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
                            onPress={() => handleRespondToOffer(offer.id, "accepted")}
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
                      {(isAccepted || isCompleted) && (
                        <TouchableOpacity
                          style={styles.msgCoordinateBtn}
                          onPress={() => {
                            setOffersModalVisible(false);
                            setTimeout(() => {
                              setSelectedOffer(offer);
                              setStatusModalVisible(true);
                            }, 200);
                          }}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="chatbubble-ellipses-outline" size={16} color={NAVY} />
                          <Text style={styles.msgCoordinateBtnText}>
                            {isCompleted ? "View Trade Details" : "Open Trade"}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                }}
              />
            )}

            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setOffersModalVisible(false)}>
              <Text style={styles.modalCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Status Detail Modal ── */}
      <Modal
        visible={statusModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeStatusModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: 34 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>Trade Offer Status</Text>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {selectedOffer &&
                (() => {
                  const statusStyle = STATUS_COLORS[selectedOffer.status] || STATUS_COLORS.pending;
                  const isPending = selectedOffer.status === "pending";
                  const isAccepted = selectedOffer.status === "accepted";
                  const isCompleted = selectedOffer.status === "completed";
                  const isDeclined = selectedOffer.status === "declined";
                  const isCancelled = selectedOffer.status === "cancelled";
                  const isCancelling = cancellingOfferId === selectedOffer.id;
                  const isCompleting = completingOfferId === selectedOffer.id;

                  const myUid = auth.currentUser?.uid ?? "";
                  const completedBy: string[] = selectedOffer.completedBy ?? [];
                  const iHaveConfirmed = completedBy.includes(myUid);
                  const otherParticipantUid =
                    selectedOffer.participants?.find((p) => p !== myUid) ?? selectedOffer.ownerId;
                  const otherHasConfirmed = completedBy.includes(otherParticipantUid) && !iHaveConfirmed;

                  const reviews = selectedOffer.reviews ?? {};
                  const myReview = reviews[myUid];
                  const theirReview = reviews[otherParticipantUid];
                  const bothReviewed = !!myReview && !!theirReview;

                  const statusLabel = isPending
                    ? "Waiting for owner's response"
                    : isAccepted
                    ? "Trade accepted! Coordinate your meetup."
                    : isCompleted
                    ? "Trade completed!"
                    : isDeclined
                    ? "Offer was declined"
                    : isCancelled
                    ? "You cancelled this offer"
                    : selectedOffer.status;

                  const statusIcon = getStatusIcon(isPending, isAccepted, isCompleted, isDeclined);

                  return (
                    <>
                      <View style={styles.statusDetailRow}>
                        <View style={styles.statusDetailSide}>
                          <Text style={styles.statusDetailLabel}>You offered</Text>
                          <Image
                            source={{ uri: selectedOffer.offeredItemImage || "https://via.placeholder.com/100" }}
                            style={styles.statusDetailImage}
                          />
                          <Text style={styles.statusDetailTitle} numberOfLines={2}>
                            {selectedOffer.offeredItemTitle}
                          </Text>
                        </View>
                        <Ionicons name="swap-horizontal" size={28} color={NAVY} />
                        <View style={styles.statusDetailSide}>
                          <Text style={styles.statusDetailLabel}>For</Text>
                          <Image
                            source={{ uri: selectedOffer.requestedItemImage || "https://via.placeholder.com/100" }}
                            style={styles.statusDetailImage}
                          />
                          <Text style={styles.statusDetailTitle} numberOfLines={2}>
                            {selectedOffer.requestedItemTitle}
                          </Text>
                        </View>
                      </View>

                      <View style={[styles.statusDetailBadge, { backgroundColor: statusStyle.bg }]}>
                        <Ionicons name={statusIcon} size={18} color={statusStyle.text} style={{ marginBottom: 4 }} />
                        <Text style={[styles.statusDetailBadgeText, { color: statusStyle.text }]}>
                          {statusLabel}
                        </Text>
                      </View>

                      {/* Accepted: Mark as Finished */}
                      {isAccepted && (
                        <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
                          <TouchableOpacity
                            style={[styles.completeBtn, otherHasConfirmed && styles.completeBtnHighlight]}
                            onPress={() => handleCompleteTrade(selectedOffer)}
                            disabled={isCompleting || iHaveConfirmed}
                            activeOpacity={0.85}
                          >
                            {isCompleting ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : iHaveConfirmed ? (
                              <>
                                <Ionicons name="time-outline" size={18} color="#fff" />
                                <Text style={styles.completeBtnText}>Waiting for other party...</Text>
                              </>
                            ) : (
                              <>
                                <Ionicons name="checkmark-done-circle" size={18} color="#fff" />
                                <Text style={styles.completeBtnText}>
                                  {otherHasConfirmed ? "They confirmed — tap to complete!" : "Mark Trade as Finished"}
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>
                        </View>
                      )}

                      {/* Message button */}
                      {(isAccepted || isCompleted) && (
                        <TouchableOpacity
                          style={styles.msgCoordinateBtn}
                          onPress={() => { closeStatusModal(); openChat(selectedOffer, false); }}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="chatbubble-ellipses-outline" size={16} color={NAVY} />
                          <Text style={styles.msgCoordinateBtnText}>
                            {isCompleted ? "View Trade Chat" : "Message to Coordinate"}
                          </Text>
                        </TouchableOpacity>
                      )}

                      {/* Cancel */}
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
                              <Ionicons name="close-circle-outline" size={16} color="#E11D48" />
                              <Text style={styles.cancelOfferBtnModalText}>Cancel This Offer</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      )}

                      {/* Completed: review section */}
                      {isCompleted &&
                        (bothReviewed ? (
                          <View style={styles.receivedReview}>
                            <Text style={styles.receivedReviewHeader}>Their review of you</Text>
                            <StarRating rating={theirReview.rating} size={18} readonly />
                            {theirReview.comment ? (
                              <Text style={styles.receivedReviewComment}>"{theirReview.comment}"</Text>
                            ) : null}
                          </View>
                        ) : myReview ? (
                          <View style={styles.reviewWaiting}>
                            <Ionicons name="time-outline" size={13} color="#D97706" />
                            <Text style={styles.reviewWaitingText}>
                              Your review is in — waiting for theirs
                            </Text>
                          </View>
                        ) : showReviewForm ? (
                          <View style={styles.reviewForm}>
                            <Text style={styles.reviewFormTitle}>Rate your trade partner</Text>
                            <StarRating rating={reviewRating} onRate={setReviewRating} size={36} />
                            <TextInput
                              style={styles.reviewInput}
                              placeholder="Share your experience (optional)..."
                              placeholderTextColor="#AAAAAA"
                              value={reviewComment}
                              onChangeText={setReviewComment}
                              multiline
                              maxLength={300}
                              textAlignVertical="top"
                            />
                            <Text style={styles.reviewDisclaimer}>
                              Reviews are hidden until both sides submit — then revealed simultaneously.
                            </Text>
                            <View style={styles.reviewFormActions}>
                              <TouchableOpacity
                                style={styles.reviewCancelBtn}
                                onPress={() => setShowReviewForm(false)}
                                disabled={submittingReview}
                              >
                                <Text style={styles.reviewCancelText}>Back</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[
                                  styles.reviewSubmitBtn,
                                  (reviewRating === 0 || submittingReview) && styles.reviewSubmitBtnDisabled,
                                ]}
                                onPress={() => handleSubmitReview(selectedOffer)}
                                disabled={reviewRating === 0 || submittingReview}
                                activeOpacity={0.85}
                              >
                                {submittingReview ? (
                                  <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                  <Text style={styles.reviewSubmitText}>Submit Review</Text>
                                )}
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.rateOwnerBtn}
                            onPress={() => setShowReviewForm(true)}
                            activeOpacity={0.85}
                          >
                            <Ionicons name="star-outline" size={16} color="#fff" />
                            <Text style={styles.rateOwnerBtnText}>Rate Your Trade Partner</Text>
                          </TouchableOpacity>
                        ))}
                    </>
                  );
                })()}
            </ScrollView>

            <TouchableOpacity style={styles.modalCloseBtn} onPress={closeStatusModal}>
              <Text style={styles.modalCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Chat modal ── */}
      <TradeChatModal
        visible={!!chatTrade}
        trade={chatTrade}
        isOwner={chatIsOwner}
        onClose={() => { setChatTrade(null); setChatIsOwner(false); }}
        onStatusChange={(tradeId, newStatus) => {
          setSentOffers((prev) =>
            prev.map((o) => o.id === tradeId ? { ...o, status: newStatus as any } : o),
          );
          setIncomingOffers((prev) =>
            prev.map((o) => o.id === tradeId ? { ...o, status: newStatus as any } : o),
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },

  // ── Search (copied from home page) ──────────────────────────────────────
  searchWrapper: {
    marginHorizontal: 16,
    paddingTop: 32,
    marginBottom: 16,
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
  searchInput: {
    flex: 1,
    color: "#242424",
    fontSize: 15,
    paddingVertical: 8,
  },

  // ── Tabs ────────────────────────────────────────────────────────────────
  tabs: {
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

  // ── Sort / Filter row ────────────────────────────────────────────────────
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

  // ── Trade item card ──────────────────────────────────────────────────────
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F7FF",
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: "#E8EEF9",
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

  // ── Offer card ───────────────────────────────────────────────────────────
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
  offerItemsRow: { flexDirection: "row", alignItems: "center", marginTop: 28 },
  offerSide: { flex: 1, alignItems: "center", gap: 6 },
  offerArrow: { paddingHorizontal: 8 },
  offerItemImage: { width: 70, height: 70, borderRadius: 10, backgroundColor: "#F3F4F6" },
  offerItemLabel: { fontSize: 12, color: "#374151", fontWeight: "600", textAlign: "center" },
  statusBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusBadgeText: { fontSize: 11, fontWeight: "700" },

  // ── Cancel controls ──────────────────────────────────────────────────────
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
  cancelConfirmRow: { flexDirection: "row", alignItems: "center", marginTop: 10, gap: 8 },
  cancelConfirmText: { flex: 1, fontSize: 12, fontWeight: "600", color: "#374151" },
  cancelConfirmNo: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: "#F3F4F6" },
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
  cancelOfferBtnModalText: { fontSize: 14, fontWeight: "700", color: "#E11D48" },

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

  // ── Modals ───────────────────────────────────────────────────────────────
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
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 4 },
  modalItemName: { fontSize: 15, fontWeight: "600", color: NAVY, marginBottom: 16 },
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

  // ── Incoming offer card ──────────────────────────────────────────────────
  incomingOfferCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  incomingOffererRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  incomingOffererAvatar: { width: 32, height: 32, borderRadius: 16 },
  incomingOffererName: { flex: 1, fontSize: 14, fontWeight: "700", color: "#111827" },
  incomingItemRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  incomingItemImage: { width: 60, height: 60, borderRadius: 8, backgroundColor: "#E5E7EB" },
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
  acceptBtn: { flex: 2, paddingVertical: 10, borderRadius: 8, backgroundColor: "#16A34A", alignItems: "center" },
  acceptBtnText: { fontSize: 13, fontWeight: "600", color: "#fff" },

  // ── Status detail modal ──────────────────────────────────────────────────
  statusDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 20,
  },
  statusDetailSide: { flex: 1, alignItems: "center", gap: 8 },
  statusDetailLabel: { fontSize: 12, color: "#6B7280", fontWeight: "600" },
  statusDetailImage: { width: 80, height: 80, borderRadius: 10, backgroundColor: "#F3F4F6" },
  statusDetailTitle: { fontSize: 12, fontWeight: "600", color: "#111827", textAlign: "center" },
  statusDetailBadge: {
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginBottom: 8,
  },
  statusDetailBadgeText: { fontSize: 15, fontWeight: "700", textAlign: "center" },

  // ── Complete button ──────────────────────────────────────────────────────
  completeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#16A34A",
    borderRadius: 14,
    paddingVertical: 14,
    marginHorizontal: 20,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#16A34A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  completeBtnHighlight: { backgroundColor: "#0F9D58" },
  completeBtnText: { fontSize: 14, fontWeight: "800", color: "#fff" },

  // ── Message / coordinate button ──────────────────────────────────────────
  msgCoordinateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: NAVY,
    backgroundColor: "#ECEDF8",
    marginBottom: 10,
  },
  msgCoordinateBtnText: { fontSize: 14, fontWeight: "700", color: NAVY },

  // ── Review section ───────────────────────────────────────────────────────
  rateOwnerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "#FFB800",
    borderRadius: 14,
    paddingVertical: 13,
    marginBottom: 10,
  },
  rateOwnerBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  reviewForm: {
    backgroundColor: "#F7F8FC",
    borderRadius: 14,
    padding: 14,
    gap: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#ECECEC",
  },
  reviewFormTitle: { fontSize: 15, fontWeight: "700", color: "#1A1A2E", textAlign: "center" },
  reviewInput: {
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    color: "#1A1A2E",
    minHeight: 64,
    backgroundColor: "#fff",
  },
  reviewDisclaimer: { fontSize: 11, color: "#AAAAAA", textAlign: "center", lineHeight: 15 },
  reviewFormActions: { flexDirection: "row", gap: 8 },
  reviewCancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
  },
  reviewCancelText: { fontSize: 13, fontWeight: "600", color: "#374151" },
  reviewSubmitBtn: {
    flex: 2,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: NAVY,
    alignItems: "center",
  },
  reviewSubmitBtnDisabled: { opacity: 0.4 },
  reviewSubmitText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  reviewWaiting: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFF7ED",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  reviewWaitingText: { fontSize: 12, color: "#D97706", fontWeight: "600" },
  receivedReview: {
    backgroundColor: "#F7F8FC",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ECECEC",
    gap: 4,
  },
  receivedReviewHeader: { fontSize: 13, fontWeight: "700", color: "#1A1A2E", marginBottom: 4 },
  receivedReviewComment: {
    fontSize: 12,
    color: "#555",
    fontStyle: "italic",
    textAlign: "center",
    lineHeight: 18,
    marginTop: 4,
  },
});