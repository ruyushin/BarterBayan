import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  ImageStyle,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { LongPressGestureHandler, State } from "react-native-gesture-handler";
import { auth } from "../firebaseConfig";
import {
  getUserInfo,
  getUserPostedItems,
  updateItemLikes,
} from "../services/itemService";
import { proposeTrade } from "../services/tradeService";
import { trackItemView, trackUserActivity } from "../services/trendingService";

const SCREEN_WIDTH = Dimensions.get("window").width;

interface ProductDetailParams {
  itemId: string;
  item: string;
}

export default function ProductDetailsScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [item, setItem] = useState<any>(null);
  const [ownerInfo, setOwnerInfo] = useState<any>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [currentUser] = useState(auth.currentUser?.uid);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  // ── Trade offer state ─────────────────────────────────────────────────────
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [myItems, setMyItems] = useState<any[]>([]);
  const [selectedOfferItem, setSelectedOfferItem] = useState<any>(null);
  const [loadingMyItems, setLoadingMyItems] = useState(false);
  const [tradeSubmitting, setTradeSubmitting] = useState(false);
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (params.item && typeof params.item === "string") {
      try {
        const itemData = JSON.parse(params.item);
        setItem(itemData);
        setLikeCount(itemData.likes || 0);
        loadOwnerInfo(itemData.ownerId);
        checkIfLiked(itemData);

        if (currentUser) {
          trackItemView(itemData.id, currentUser).catch((error) =>
            console.error("Error tracking item view:", error),
          );
        }
      } catch (error) {
        console.error("Error parsing item:", error);
      }
    }
    setLoading(false);
  }, [params.item, currentUser]);

  const loadOwnerInfo = async (ownerId: string) => {
    try {
      if (!ownerId) return;
      const info = await getUserInfo(ownerId);
      setOwnerInfo(info);
    } catch (error) {
      console.error("Error loading owner info:", error);
    }
  };

  const checkIfLiked = (itemData: any) => {
    if (currentUser && itemData?.likedBy?.includes(currentUser)) {
      setIsLiked(true);
    } else {
      setIsLiked(false);
    }
  };

  const handleBackPress = () => {
    try {
      if (router.canGoBack?.()) {
        router.back();
      } else {
        router.replace("/(tabs)");
      }
    } catch {
      router.replace("/(tabs)");
    }
  };

  const handleLike = async () => {
    if (!currentUser) {
      Alert.alert("Please log in", "You must be logged in to like items");
      return;
    }
    try {
      const nowLiked = !isLiked;
      await updateItemLikes(item.id, currentUser, nowLiked);
      setIsLiked(nowLiked);
      setLikeCount((prev) => (nowLiked ? prev + 1 : Math.max(0, prev - 1)));

      if (nowLiked) {
        await trackUserActivity(currentUser, "like", item.id, item.category);
      }
    } catch (error) {
      Alert.alert("Error", "Failed to update like status");
      console.error("Error:", error);
    }
  };

  const handleSaveImage = async () => {
    try {
      if (!item?.images || item.images.length === 0) return;
      const currentImage = item.images[currentImageIndex];
      if (!currentImage) return;

      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission denied", "Camera roll permission is required");
        return;
      }

      const filename = `BarterBayan_${Date.now()}.jpg`;
      const fileDir = (FileSystem as any).documentDirectory || "";
      const result = await FileSystem.downloadAsync(
        currentImage,
        fileDir + filename,
      );

      await MediaLibrary.saveToLibraryAsync(result.uri);
      Alert.alert("Success", "Image saved to your gallery");
    } catch (error) {
      Alert.alert("Error", "Failed to save image");
      console.error("Error saving image:", error);
    }
  };

  const handleSendMessage = () => {
    router.push({
      pathname: "/chat",
      params: {
        ownerUserId: item.ownerId,
        itemId: item.id,
        itemTitle: item.title,
        fromModal: "true",
      },
    });
  };

  // ── Trade offer handlers ──────────────────────────────────────────────────
  const handleOpenTradeModal = async () => {
    if (!currentUser) {
      Alert.alert("Please log in", "You must be logged in to offer a trade");
      return;
    }
    if (currentUser === item.ownerId) {
      Alert.alert("Cannot trade", "You cannot offer a trade on your own item");
      return;
    }
    try {
      setLoadingMyItems(true);
      setShowTradeModal(true);
      const items = await getUserPostedItems(currentUser);
      setMyItems(items);
    } catch {
      Alert.alert("Error", "Failed to load your items");
    } finally {
      setLoadingMyItems(false);
    }
  };

  const handleSubmitTradeOffer = async () => {
    if (!selectedOfferItem) {
      Alert.alert("Select an item", "Please select one of your items to offer");
      return;
    }
    try {
      setTradeSubmitting(true);

      await proposeTrade(
        selectedOfferItem,
        {
          ...item,
          ownerId: item.ownerId,
        },
        {
          uid: currentUser!,
          displayName: auth.currentUser?.displayName || "Anonymous",
          photoURL: auth.currentUser?.photoURL || "",
        },
      );

      setShowTradeModal(false);
      setSelectedOfferItem(null);
      Alert.alert(
        "Trade Offered!",
        "Your trade offer has been sent to the owner.",
      );
    } catch {
      Alert.alert("Error", "Failed to send trade offer");
    } finally {
      setTradeSubmitting(false);
    }
  };
  // ─────────────────────────────────────────────────────────────────────────

  const handleImageLongPress = (nativeEvent: any) => {
    if (nativeEvent.state === State.ACTIVE || nativeEvent.state === 4) {
      handleSaveImage();
    }
  };

  const validateImageUrl = (url: string | undefined): boolean => {
    if (!url) return false;
    if (typeof url !== "string") return false;
    if (url.startsWith("blob:")) return false;
    return true;
  };

  const images = (() => {
    const imgs = (Array.isArray(item?.images) ? item.images : []).filter(
      (img: string) => validateImageUrl(img),
    );
    if (imgs.length > 0) return imgs;
    if (validateImageUrl(item?.image)) return [item.image];
    return [];
  })();

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2f2f6f" />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.closeButton} onPress={handleBackPress}>
          <Ionicons name="arrow-back" size={28} color="#2f2f6f" />
        </TouchableOpacity>
        <Text style={styles.errorText}>Product not found</Text>
      </View>
    );
  }

  // FIX: Pre-compute owner display name to avoid inline logic inside View
  const ownerDisplayName =
    ownerInfo?.firstName && ownerInfo?.lastName
      ? `${ownerInfo.firstName} ${ownerInfo.lastName}`
      : ownerInfo?.username || "Unknown User";

  // FIX: Pre-compute rating label to avoid inline expressions inside View
  const ratingLabel = ownerInfo?.rating?.toFixed(1) ?? "N/A";
  const tradeCountLabel = `(${ownerInfo?.tradeCount ?? 0} trades)`;

  // FIX: Pre-compute trade modal subtitle to avoid nested Text with whitespace
  const tradeModalSubtitleText = `You want: ${item?.title ?? ""}`;

  return (
    <SafeAreaView style={styles.safeContainer}>
      <View style={styles.container}>
        {/* Sticky Header */}
        <View style={styles.stickyHeader}>
          <TouchableOpacity
            style={styles.stickyBackButton}
            onPress={handleBackPress}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.stickyHeaderTitle}>{"Product Details"}</Text>
          <View style={styles.stickyHeaderSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Image Carousel */}
          <View style={styles.carouselContainer}>
            <FlatList
              horizontal
              pagingEnabled
              scrollEnabled={images.length > 1}
              showsHorizontalScrollIndicator={false}
              data={images}
              keyExtractor={(_: any, index: number) => `image-${index}`}
              renderItem={({ item: imageUrl }: { item: string }) => (
                <LongPressGestureHandler
                  onHandlerStateChange={({ nativeEvent }) =>
                    handleImageLongPress(nativeEvent)
                  }
                  minDurationMs={500}
                >
                  <View style={styles.imageWrapper}>
                    <Image
                      source={{
                        uri: imageUrl?.startsWith("blob:")
                          ? "https://via.placeholder.com/400x200"
                          : imageUrl,
                      }}
                      style={styles.carouselImage}
                      resizeMode="contain"
                      onError={() =>
                        console.warn("Failed to load image:", imageUrl)
                      }
                    />
                  </View>
                </LongPressGestureHandler>
              )}
              onMomentumScrollEnd={(event) => {
                const index = Math.round(
                  event.nativeEvent.contentOffset.x /
                    event.nativeEvent.layoutMeasurement.width,
                );
                setCurrentImageIndex(index);
              }}
            />
            {images.length > 1 && (
              <View style={styles.pagination}>
                {images.map((_: string, index: number) => (
                  <View
                    key={index}
                    style={[
                      styles.paginationDot,
                      index === currentImageIndex && styles.paginationDotActive,
                    ]}
                  />
                ))}
                <Text style={styles.paginationText}>
                  {`${currentImageIndex + 1} / ${images.length}`}
                </Text>
              </View>
            )}
            <View style={styles.holdToSaveContainer}>
              <Text style={styles.holdToSaveText}>{"Hold image to save"}</Text>
            </View>
          </View>

          {/* Content below carousel */}
          <View style={styles.content}>
            {/* Product Info */}
            <View style={styles.productInfo}>
              <Text style={styles.title}>{item?.title}</Text>
            </View>

            {/* Details Section */}
            <View style={styles.detailsSection}>
              <Text style={styles.detailsHeader}>{"Details"}</Text>

              {!!item?.description && (
                <View style={styles.descriptionContainer}>
                  <Text style={styles.descriptionText}>
                    {descriptionExpanded
                      ? item.description
                      : item.description.length > 1000
                        ? item.description.substring(0, 1000) + "..."
                        : item.description}
                  </Text>
                  {item.description.length > 1000 && (
                    <TouchableOpacity
                      onPress={() =>
                        setDescriptionExpanded(!descriptionExpanded)
                      }
                      style={styles.seeMoreButton}
                    >
                      <Text style={styles.seeMoreText}>
                        {descriptionExpanded ? "See less" : "See more"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {!!item?.condition && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{"Condition"}</Text>
                  <Text style={styles.detailValue}>{item.condition}</Text>
                </View>
              )}

              {!!item?.category && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{"Category"}</Text>
                  <Text style={styles.detailValue}>{item.category}</Text>
                </View>
              )}
            </View>

            {/* Owner Info */}
            {!!ownerInfo && (
              <View style={styles.ownerCard}>
                <View style={styles.ownerHeader}>
                  <Image
                    source={{ uri: ownerInfo.avatarUrl }}
                    style={styles.ownerAvatar}
                  />
                  {/* FIX: ownerDetails is a View — all children must be View or Text components, no bare strings */}
                  <View style={styles.ownerDetails}>
                    <Text style={styles.ownerName}>{ownerDisplayName}</Text>
                    {/* FIX: ratingContainer — removed all whitespace between tags, all text in <Text> */}
                    <View style={styles.ratingContainer}>
                      <Ionicons name="star" size={14} color="#FFB800" />
                      <Text style={styles.rating}>{ratingLabel}</Text>
                      <Text style={styles.tradeCount}>{tradeCountLabel}</Text>
                    </View>
                  </View>
                </View>
                {/* FIX: use !! to prevent the string "" from rendering as a text node */}
                {!!ownerInfo.bio && (
                  <Text style={styles.bio}>{ownerInfo.bio}</Text>
                )}
              </View>
            )}

            {/* Like Button */}
            <TouchableOpacity
              style={[styles.likeButton, isLiked && styles.likeButtonActive]}
              onPress={handleLike}
              disabled={loading}
            >
              <Ionicons
                name={isLiked ? "heart" : "heart-outline"}
                size={20}
                color={isLiked ? "#fff" : "#2f2f6f"}
              />
              <Text
                style={[
                  styles.likeButtonText,
                  isLiked && styles.likeButtonTextActive,
                ]}
              >
                {`${likeCount} ${likeCount === 1 ? "Like" : "Likes"}`}
              </Text>
            </TouchableOpacity>

            {/* Action Buttons Row */}
            {currentUser !== item.ownerId && (
              <View style={styles.actionButtonsRow}>
                <TouchableOpacity
                  style={styles.messageButton}
                  onPress={handleSendMessage}
                >
                  <Ionicons name="send" size={18} color="#fff" />
                  <Text style={styles.messageButtonText}>{"Message"}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.tradeButton}
                  onPress={handleOpenTradeModal}
                >
                  <Ionicons name="swap-horizontal" size={18} color="#fff" />
                  <Text style={styles.tradeButtonText}>{"Propose Trade"}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>

        {/* ── Trade Offer Modal ───────────────────────────────────────────── */}
        <Modal
          visible={showTradeModal}
          transparent
          animationType="slide"
          onRequestClose={() => {
            setShowTradeModal(false);
            setSelectedOfferItem(null);
          }}
        >
          <View style={styles.tradeModalOverlay}>
            <View style={styles.tradeModalSheet}>
              <View style={styles.sheetHandle} />

              <Text style={styles.tradeModalTitle}>{"Offer a Trade"}</Text>
              {/* FIX: Use a single Text with pre-computed string instead of nested Text with whitespace */}
              <Text style={styles.tradeModalSubtitle}>
                {tradeModalSubtitleText}
              </Text>
              <Text style={styles.tradeModalPickLabel}>
                {"Pick one of your items to offer:"}
              </Text>

              {loadingMyItems ? (
                <View style={styles.tradeModalLoader}>
                  <ActivityIndicator size="large" color="#2f2f6f" />
                  <Text style={styles.tradeModalLoaderText}>
                    {"Loading your items..."}
                  </Text>
                </View>
              ) : myItems.length === 0 ? (
                <View style={styles.tradeModalEmpty}>
                  {/* FIX: Ionicons directly in View is fine — the issue was whitespace text nodes between siblings */}
                  <Ionicons name="cube-outline" size={48} color="#ccc" />
                  <Text style={styles.tradeModalEmptyText}>
                    {"You have no listed items to offer."}
                  </Text>
                  <TouchableOpacity
                    style={styles.tradeModalAddBtn}
                    onPress={() => {
                      setShowTradeModal(false);
                      router.push("/add-item");
                    }}
                  >
                    <Text style={styles.tradeModalAddBtnText}>
                      {"Add an Item First"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <FlatList
                  data={myItems}
                  keyExtractor={(i) => i.id}
                  numColumns={2}
                  columnWrapperStyle={{ gap: 10 }}
                  contentContainerStyle={styles.tradeItemGrid}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item: myItem }) => {
                    const img =
                      Array.isArray(myItem.images) && myItem.images.length > 0
                        ? myItem.images[0]
                        : myItem.image || "https://via.placeholder.com/120";
                    const isSelected = selectedOfferItem?.id === myItem.id;
                    return (
                      <TouchableOpacity
                        style={[
                          styles.tradeItemCard,
                          isSelected && styles.tradeItemCardSelected,
                        ]}
                        onPress={() => setSelectedOfferItem(myItem)}
                        activeOpacity={0.8}
                      >
                        {isSelected && (
                          <View style={styles.tradeItemCheckBadge}>
                            <Ionicons
                              name="checkmark-circle"
                              size={22}
                              color="#2f2f6f"
                            />
                          </View>
                        )}
                        <Image
                          source={{
                            uri: img?.startsWith("blob:")
                              ? "https://via.placeholder.com/120"
                              : img,
                          }}
                          style={styles.tradeItemImage}
                          onError={() =>
                            console.warn(
                              "Failed to load trade item image:",
                              img,
                            )
                          }
                        />
                        <Text style={styles.tradeItemTitle} numberOfLines={2}>
                          {myItem.title}
                        </Text>
                      </TouchableOpacity>
                    );
                  }}
                />
              )}

              <View style={styles.tradeModalFooter}>
                <TouchableOpacity
                  style={styles.tradeModalCancelBtn}
                  onPress={() => {
                    setShowTradeModal(false);
                    setSelectedOfferItem(null);
                  }}
                >
                  <Text style={styles.tradeModalCancelText}>{"Cancel"}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.tradeModalSubmitBtn,
                    (!selectedOfferItem || tradeSubmitting) &&
                      styles.tradeModalSubmitBtnDisabled,
                  ]}
                  onPress={handleSubmitTradeOffer}
                  disabled={!selectedOfferItem || tradeSubmitting}
                >
                  {tradeSubmitting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.tradeModalSubmitText}>
                      {"Send Offer"}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: "#2f2f6f",
  } as ViewStyle,
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    paddingTop: 0,
  } as ViewStyle,
  stickyHeader: {
    backgroundColor: "#2f2f6f",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 13,
  } as ViewStyle,
  stickyBackButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  } as ViewStyle,
  stickyHeaderTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
    flex: 1,
    marginHorizontal: 8,
  } as TextStyle,
  stickyHeaderSpacer: {
    width: 38,
    height: 38,
  } as ViewStyle,
  scrollContent: {
    paddingBottom: 120,
  } as ViewStyle,
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  } as ViewStyle,
  closeButton: {
    position: "absolute",
    top: 16,
    left: 16,
    zIndex: 10,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    padding: 8,
    borderRadius: 8,
  } as ViewStyle,
  errorText: {
    fontSize: 16,
    color: "#2f2f6f",
    textAlign: "center",
    marginTop: 20,
  } as TextStyle,
  carouselContainer: {
    height: 400,
    backgroundColor: "#F3F4F6",
    position: "relative",
  } as ViewStyle,
  imageWrapper: {
    width: SCREEN_WIDTH,
    height: 400,
    justifyContent: "center",
    alignItems: "center",
  } as ViewStyle,
  carouselImage: {
    width: "100%",
    height: "100%",
  } as ImageStyle,
  pagination: {
    position: "absolute",
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  } as ViewStyle,
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.5)",
  } as ViewStyle,
  paginationDotActive: {
    backgroundColor: "#fff",
    width: 24,
  } as ViewStyle,
  paginationText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 8,
  } as TextStyle,
  holdToSaveContainer: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  } as ViewStyle,
  holdToSaveText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  } as TextStyle,
  content: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 16,
  } as ViewStyle,
  productInfo: {
    gap: 8,
  } as ViewStyle,
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
  } as TextStyle,
  detailsSection: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginVertical: 8,
  } as ViewStyle,
  detailsHeader: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  } as TextStyle,
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  } as ViewStyle,
  detailLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  } as TextStyle,
  detailValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
  } as TextStyle,
  descriptionContainer: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    gap: 8,
  } as ViewStyle,
  descriptionText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
    lineHeight: 20,
  } as TextStyle,
  seeMoreButton: {
    paddingVertical: 4,
  } as ViewStyle,
  seeMoreText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2f2f6f",
  } as TextStyle,
  ownerCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 16,
    gap: 12,
  } as ViewStyle,
  ownerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  } as ViewStyle,
  ownerAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  } as ImageStyle,
  ownerDetails: {
    flex: 1,
  } as ViewStyle,
  ownerName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  } as TextStyle,
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  } as ViewStyle,
  rating: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFB800",
  } as TextStyle,
  tradeCount: {
    fontSize: 13,
    color: "#6B7280",
  } as TextStyle,
  bio: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  } as TextStyle,
  likeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#2f2f6f",
    backgroundColor: "#fff",
  } as ViewStyle,
  likeButtonActive: {
    backgroundColor: "#2f2f6f",
  } as ViewStyle,
  likeButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2f2f6f",
  } as TextStyle,
  likeButtonTextActive: {
    color: "#fff",
  } as TextStyle,
  tradeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "#C9A227",
    borderRadius: 12,
  } as ViewStyle,
  tradeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
     backgroundColor: "#C9A227",
  } as TextStyle,
  actionButtonsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  } as ViewStyle,
  messageButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "#2f2f6f",
    borderRadius: 12,
  } as ViewStyle,
  messageButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  } as TextStyle,

  // ── Trade modal ────────────────────────────────────────────────────────────
  tradeModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  } as ViewStyle,
  tradeModalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 34,
    paddingTop: 12,
    maxHeight: "85%",
  } as ViewStyle,
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DDD",
    alignSelf: "center",
    marginBottom: 16,
  } as ViewStyle,
  tradeModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 6,
  } as TextStyle,
  tradeModalSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 4,
  } as TextStyle,
  tradeModalPickLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginTop: 12,
    marginBottom: 12,
  } as TextStyle,
  tradeModalLoader: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  } as ViewStyle,
  tradeModalLoaderText: {
    fontSize: 14,
    color: "#6B7280",
  } as TextStyle,
  tradeModalEmpty: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 12,
  } as ViewStyle,
  tradeModalEmptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  } as TextStyle,
  tradeModalAddBtn: {
    backgroundColor: "#2f2f6f",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
  } as ViewStyle,
  tradeModalAddBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  } as TextStyle,
  tradeItemGrid: {
    paddingBottom: 16,
  } as ViewStyle,
  tradeItemCard: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 10,
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    position: "relative",
  } as ViewStyle,
  tradeItemCardSelected: {
    borderColor: "#2f2f6f",
    backgroundColor: "#EEF0FF",
  } as ViewStyle,
  tradeItemCheckBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    zIndex: 1,
  } as ViewStyle,
  tradeItemImage: {
    width: "100%",
    height: 100,
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
    marginBottom: 8,
  } as ImageStyle,
  tradeItemTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#111827",
    textAlign: "center",
  } as TextStyle,
  tradeModalFooter: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  } as ViewStyle,
  tradeModalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
  } as ViewStyle,
  tradeModalCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
  } as TextStyle,
  tradeModalSubmitBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#2f2f6f",
    alignItems: "center",
  } as ViewStyle,
  tradeModalSubmitBtnDisabled: {
    backgroundColor: "#9CA3AF",
  } as ViewStyle,
  tradeModalSubmitText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  } as TextStyle,
});