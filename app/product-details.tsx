import { Ionicons } from "@expo/vector-icons";
import { ResizeMode, Video } from "expo-av";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  ImageStyle,
  KeyboardAvoidingView,
  Modal,
  Platform,
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

// ── Media type helpers ────────────────────────────────────────────────────────
const isVideoUrl = (url: string): boolean => {
  if (!url || typeof url !== "string") return false;
  const lower = url.toLowerCase();
  return (
    lower.includes(".mp4") ||
    lower.includes(".mov") ||
    lower.includes(".avi") ||
    lower.includes(".webm") ||
    lower.includes("video") ||
    lower.includes("videos%2F")
  );
};

const isValidMediaUrl = (url: string | undefined): boolean => {
  if (!url || typeof url !== "string") return false;
  if (url.startsWith("blob:")) return false;
  if (url.trim() === "") return false;
  return true;
};

// ── MediaItem component (handles image + video) ───────────────────────────────
function MediaItem({
  uri,
  onLongPress,
}: {
  uri: string;
  onLongPress: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const [videoStatus, setVideoStatus] = useState<any>({});
  const videoRef = useRef<any>(null);
  const isVideo = isVideoUrl(uri);

  if (isVideo) {
    return (
      <View style={media.wrapper}>
        <Video
          ref={videoRef}
          source={{ uri }}
          style={media.video}
          resizeMode={ResizeMode.CONTAIN}
          useNativeControls
          isLooping={false}
          onPlaybackStatusUpdate={(status) => setVideoStatus(status)}
          onError={() => console.warn("Video failed to load:", uri)}
        />
        <View style={media.videoBadge}>
          <Ionicons name="videocam" size={12} color="#fff" />
          <Text style={media.videoBadgeText}>Video</Text>
        </View>
      </View>
    );
  }

  if (imgError) {
    return (
      <View style={[media.wrapper, media.errorBox]}>
        <Ionicons name="image-outline" size={40} color="#ccc" />
        <Text style={media.errorText}>Image unavailable</Text>
      </View>
    );
  }

  return (
    <LongPressGestureHandler
      onHandlerStateChange={({ nativeEvent }) => {
        if (nativeEvent.state === State.ACTIVE) {
          onLongPress();
        }
      }}
      minDurationMs={500}
    >
      <View style={media.wrapper}>
        <Image
          source={{ uri }}
          style={media.image}
          resizeMode="contain"
          onError={() => setImgError(true)}
        />
      </View>
    </LongPressGestureHandler>
  );
}

const media = StyleSheet.create({
  wrapper: {
    width: SCREEN_WIDTH,
    height: 380,
    backgroundColor: "#1a1a2e",
    justifyContent: "center",
    alignItems: "center",
  } as ViewStyle,
  image: {
    width: "100%",
    height: "100%",
  } as ImageStyle,
  video: {
    width: "100%",
    height: "100%",
  } as ViewStyle,
  videoBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: "rgba(0,0,0,0.65)",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  } as ViewStyle,
  videoBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  } as TextStyle,
  errorBox: {
    backgroundColor: "#f5f5f5",
    gap: 8,
  } as ViewStyle,
  errorText: {
    color: "#aaa",
    fontSize: 13,
  } as TextStyle,
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function ProductDetailsScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
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

  // ── Called by ProductDetailModal via onLikeChange so both stay in sync ──
  const handleLikeChange = (liked: boolean, newCount: number) => {
    setIsLiked(liked);
    setLikeCount(newCount);
    // Also patch the item object so re-opens of the modal see fresh data
    setItem((prev: any) =>
      prev
        ? {
            ...prev,
            likes: newCount,
            likedBy: liked
              ? [...(prev.likedBy ?? []), currentUser]
              : (prev.likedBy ?? []).filter((id: string) => id !== currentUser),
          }
        : prev,
    );
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
      const newCount = nowLiked
        ? likeCount + 1
        : Math.max(0, likeCount - 1);
      handleLikeChange(nowLiked, newCount);
      if (nowLiked) {
        await trackUserActivity(currentUser, "like", item.id, item.category);
      }
    } catch (error) {
      Alert.alert("Error", "Failed to update like status");
    }
  };

  const handleSaveImage = async () => {
    try {
      if (!mediaItems || mediaItems.length === 0) return;
      const current = mediaItems[currentMediaIndex];
      if (!current || isVideoUrl(current)) return;

      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission denied", "Camera roll permission is required");
        return;
      }

      const filename = `BarterBayan_${Date.now()}.jpg`;
      const fileDir = (FileSystem as any).documentDirectory || "";
      const result = await FileSystem.downloadAsync(current, fileDir + filename);
      await MediaLibrary.saveToLibraryAsync(result.uri);
      Alert.alert("Success", "Image saved to your gallery");
    } catch (error) {
      Alert.alert("Error", "Failed to save image");
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

  const handleOwnerPress = () => {
    if (item?.ownerId) {
      router.push({
        pathname: "/user-profile",
        params: { userId: item.ownerId },
      });
    }
  };

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
        { ...item, ownerId: item.ownerId },
        {
          uid: currentUser!,
          displayName: auth.currentUser?.displayName || "Anonymous",
          photoURL: auth.currentUser?.photoURL || "",
        },
      );
      setShowTradeModal(false);
      setSelectedOfferItem(null);
      Alert.alert("Trade Offered!", "Your trade offer has been sent to the owner.");
    } catch {
      Alert.alert("Error", "Failed to send trade offer");
    } finally {
      setTradeSubmitting(false);
    }
  };

  // ── Build media list ──────────────────────────────────────────────────────
  const mediaItems = (() => {
    const allMedia: string[] = [];
    if (Array.isArray(item?.images)) {
      item.images.forEach((url: string) => {
        if (isValidMediaUrl(url)) allMedia.push(url);
      });
    }
    if (Array.isArray(item?.videos)) {
      item.videos.forEach((url: string) => {
        if (isValidMediaUrl(url)) allMedia.push(url);
      });
    }
    if (allMedia.length === 0) {
      if (isValidMediaUrl(item?.image)) allMedia.push(item.image);
      if (isValidMediaUrl(item?.video)) allMedia.push(item.video);
    }
    return allMedia;
  })();

  const ownerDisplayName =
    ownerInfo?.firstName && ownerInfo?.lastName
      ? `${ownerInfo.firstName} ${ownerInfo.lastName}`
      : ownerInfo?.username || "Unknown User";

  const ratingLabel = ownerInfo?.rating?.toFixed(1) ?? "N/A";
  const tradeCountLabel = `(${ownerInfo?.tradeCount ?? 0} trades)`;

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

  const hasMultiple = mediaItems.length > 1;

  return (
    <SafeAreaView style={styles.safeContainer}>
      <View style={styles.container}>
        {/* Sticky Header */}
        <View style={styles.stickyHeader}>
          <TouchableOpacity style={styles.stickyBackButton} onPress={handleBackPress}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.stickyHeaderTitle}>{"Product Details"}</Text>
          <View style={styles.stickyHeaderSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Media Carousel ── */}
          <View style={styles.carouselContainer}>
            {mediaItems.length === 0 ? (
              <View style={styles.noMediaBox}>
                <Ionicons name="image-outline" size={48} color="#ccc" />
                <Text style={styles.noMediaText}>No media available</Text>
              </View>
            ) : (
              <FlatList
                horizontal
                pagingEnabled
                scrollEnabled={hasMultiple}
                showsHorizontalScrollIndicator={false}
                data={mediaItems}
                keyExtractor={(_, index) => `media-${index}`}
                renderItem={({ item: mediaUrl }) => (
                  <MediaItem uri={mediaUrl} onLongPress={handleSaveImage} />
                )}
                onMomentumScrollEnd={(event) => {
                  const index = Math.round(
                    event.nativeEvent.contentOffset.x /
                      event.nativeEvent.layoutMeasurement.width,
                  );
                  setCurrentMediaIndex(index);
                }}
              />
            )}

            {hasMultiple && (
              <View style={styles.pagination}>
                {mediaItems.map((url, index) => (
                  <View
                    key={index}
                    style={[
                      styles.paginationDot,
                      index === currentMediaIndex && styles.paginationDotActive,
                      isVideoUrl(url) && styles.paginationDotVideo,
                    ]}
                  />
                ))}
                <Text style={styles.paginationText}>
                  {`${currentMediaIndex + 1} / ${mediaItems.length}`}
                </Text>
              </View>
            )}

            {mediaItems.length > 0 && !isVideoUrl(mediaItems[currentMediaIndex]) && (
              <View style={styles.holdToSaveContainer}>
                <Text style={styles.holdToSaveText}>{"Hold to save"}</Text>
              </View>
            )}
          </View>

          {/* ── Content ── */}
          <View style={styles.content}>
            <View style={styles.productInfo}>
              <Text style={styles.title}>{item?.title}</Text>
            </View>

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
                      onPress={() => setDescriptionExpanded(!descriptionExpanded)}
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
                  <View style={styles.conditionBadge}>
                    <Text style={styles.conditionBadgeText}>{item.condition}</Text>
                  </View>
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
              <TouchableOpacity
                style={styles.ownerCard}
                onPress={handleOwnerPress}
                activeOpacity={0.85}
              >
                <View style={styles.ownerHeader}>
                  {ownerInfo.avatarUrl ? (
                    <Image
                      source={{ uri: ownerInfo.avatarUrl }}
                      style={styles.ownerAvatar}
                      onError={() => {}}
                    />
                  ) : (
                    <View style={[styles.ownerAvatar, styles.avatarFallback]}>
                      <Ionicons name="person" size={28} color="#aaa" />
                    </View>
                  )}
                  <View style={styles.ownerDetails}>
                    <View style={styles.ownerNameRow}>
                      <Text style={styles.ownerName}>{ownerDisplayName}</Text>
                      <Ionicons name="chevron-forward" size={16} color="#aaa" />
                    </View>
                    <View style={styles.ratingContainer}>
                      <Ionicons name="star" size={14} color="#FFB800" />
                      <Text style={styles.rating}>{ratingLabel}</Text>
                      <Text style={styles.tradeCount}>{tradeCountLabel}</Text>
                    </View>
                  </View>
                </View>
                {!!ownerInfo.bio && (
                  <Text style={styles.bio}>{ownerInfo.bio}</Text>
                )}
                <View style={styles.viewProfileRow}>
                  <Text style={styles.viewProfileText}>View full profile</Text>
                  <Ionicons name="arrow-forward" size={14} color="#2f2f6f" />
                </View>
              </TouchableOpacity>
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

            {/* Action Buttons */}
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

        {/* ── Trade Offer Modal ── */}
        <Modal
          visible={showTradeModal}
          transparent
          animationType="slide"
          onRequestClose={() => {
            setShowTradeModal(false);
            setSelectedOfferItem(null);
          }}
        >
          <KeyboardAvoidingView
            style={styles.tradeModalOverlay}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <View style={styles.tradeModalSheet}>
              <View style={styles.sheetHandle} />

              <View style={styles.tradeModalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tradeModalTitle}>{"Propose a Trade"}</Text>
                  <Text style={styles.tradeModalSubtitle} numberOfLines={1}>
                    {"For: "}
                    <Text style={styles.tradeModalTargetTitle}>
                      {item?.title ?? ""}
                    </Text>
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setShowTradeModal(false);
                    setSelectedOfferItem(null);
                  }}
                  style={styles.tradeModalCloseBtn}
                >
                  <Ionicons name="close" size={22} color="#555" />
                </TouchableOpacity>
              </View>

              {/* Trade Preview */}
              <View style={styles.tradeModalPreview}>
                <View style={styles.tradePreviewSide}>
                  <View
                    style={[
                      styles.tradePreviewImageBox,
                      !selectedOfferItem && styles.tradePreviewImageBoxEmpty,
                    ]}
                  >
                    {selectedOfferItem ? (
                      (() => {
                        const uri =
                          Array.isArray(selectedOfferItem.images) &&
                          selectedOfferItem.images.length > 0
                            ? selectedOfferItem.images[0]
                            : selectedOfferItem.image;
                        return uri ? (
                          <Image source={{ uri }} style={styles.tradePreviewImage} />
                        ) : (
                          <Ionicons name="cube-outline" size={28} color="#CCCCCC" />
                        );
                      })()
                    ) : (
                      <Ionicons name="cube-outline" size={28} color="#CCCCCC" />
                    )}
                  </View>
                  <Text style={styles.tradePreviewLabel} numberOfLines={2}>
                    {selectedOfferItem ? selectedOfferItem.title : "Select below ↓"}
                  </Text>
                </View>

                <View style={styles.tradePreviewArrow}>
                  <Ionicons name="swap-horizontal" size={26} color="#2f2f6f" />
                </View>

                <View style={styles.tradePreviewSide}>
                  <View style={styles.tradePreviewImageBox}>
                    {item ? (
                      (() => {
                        const uri =
                          Array.isArray(item.images) && item.images.length > 0
                            ? item.images[0]
                            : item.image;
                        return uri ? (
                          <Image source={{ uri }} style={styles.tradePreviewImage} />
                        ) : (
                          <Ionicons name="cube-outline" size={28} color="#CCCCCC" />
                        );
                      })()
                    ) : (
                      <View style={styles.tradePreviewImageBoxEmpty} />
                    )}
                  </View>
                  <Text style={styles.tradePreviewLabel} numberOfLines={2}>
                    {item?.title ?? ""}
                  </Text>
                </View>
              </View>

              <Text style={styles.tradeModalSectionLabel}>
                {"Choose your item to offer"}
              </Text>

              {loadingMyItems ? (
                <View style={styles.tradeModalLoader}>
                  <ActivityIndicator size="small" color="#2f2f6f" />
                  <Text style={styles.tradeModalLoaderText}>{"Loading your items…"}</Text>
                </View>
              ) : myItems.length === 0 ? (
                <View style={styles.tradeModalEmpty}>
                  <Ionicons name="cube-outline" size={36} color="#CCCCCC" />
                  <Text style={styles.tradeModalEmptyTitle}>{"No items listed"}</Text>
                  <Text style={styles.tradeModalEmptyText}>
                    {"Add items in the Trade tab first before you can propose a trade."}
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={myItems}
                  keyExtractor={(i) => i.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.tradeItemListContainer}
                  renderItem={({ item: myItem }) => {
                    const img =
                      Array.isArray(myItem.images) && myItem.images.length > 0
                        ? myItem.images[0]
                        : myItem.image;
                    const isSelected = selectedOfferItem?.id === myItem.id;
                    return (
                      <TouchableOpacity
                        style={[
                          styles.tradeItemCardHorizontal,
                          isSelected && styles.tradeItemCardHorizontalSelected,
                        ]}
                        onPress={() => setSelectedOfferItem(myItem)}
                        activeOpacity={0.8}
                      >
                        <View style={styles.tradeItemImageBoxHorizontal}>
                          {img && !img.startsWith("blob:") ? (
                            <Image
                              source={{ uri: img }}
                              style={styles.tradeItemImageHorizontal}
                              onError={() =>
                                console.warn("Failed to load trade item image:", img)
                              }
                            />
                          ) : (
                            <View style={styles.tradeItemImagePlaceholder}>
                              <Ionicons name="image-outline" size={22} color="#CCC" />
                            </View>
                          )}
                          {isSelected && (
                            <View style={styles.tradeItemSelectedOverlayHorizontal}>
                              <Ionicons name="checkmark-circle" size={24} color="#fff" />
                            </View>
                          )}
                        </View>
                        <Text
                          style={[
                            styles.tradeItemTitleHorizontal,
                            isSelected && styles.tradeItemTitleHorizontalSelected,
                          ]}
                          numberOfLines={2}
                        >
                          {myItem.title}
                        </Text>
                        {myItem.category ? (
                          <Text
                            style={styles.tradeItemCategoryHorizontal}
                            numberOfLines={1}
                          >
                            {myItem.category}
                          </Text>
                        ) : null}
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
                    <>
                      <Ionicons name="swap-horizontal" size={18} color="#fff" />
                      <Text style={styles.tradeModalSubmitText}>{"Send Trade Offer"}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: "#2f2f6f",
    paddingTop: 32,
    paddingBottom: 0,
  } as ViewStyle,
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
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
    paddingBottom: 40,
  } as ViewStyle,
  closeButton: {
    position: "absolute",
    top: 16,
    left: 16,
    zIndex: 10,
    backgroundColor: "rgba(0,0,0,0.5)",
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
    height: 380,
    backgroundColor: "#1a1a2e",
    position: "relative",
  } as ViewStyle,
  noMediaBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f5f5f5",
  } as ViewStyle,
  noMediaText: {
    color: "#aaa",
    fontSize: 14,
  } as TextStyle,
  pagination: {
    position: "absolute",
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  } as ViewStyle,
  paginationDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.4)",
  } as ViewStyle,
  paginationDotActive: {
    backgroundColor: "#fff",
    width: 22,
  } as ViewStyle,
  paginationDotVideo: {
    backgroundColor: "rgba(201,162,39,0.7)",
  } as ViewStyle,
  paginationText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 6,
  } as TextStyle,
  holdToSaveContainer: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  } as ViewStyle,
  holdToSaveText: {
    color: "#fff",
    fontSize: 11,
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
    gap: 4,
    marginVertical: 4,
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
    paddingVertical: 10,
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
  conditionBadge: {
    backgroundColor: "#EEF0FF",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#C8CAEE",
  } as ViewStyle,
  conditionBadgeText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2f2f6f",
  } as TextStyle,
  descriptionContainer: {
    paddingVertical: 10,
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
    gap: 10,
    borderWidth: 1,
    borderColor: "#E8EEF9",
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
    backgroundColor: "#E5E7EB",
  } as ImageStyle,
  avatarFallback: {
    justifyContent: "center",
    alignItems: "center",
  } as ViewStyle,
  ownerDetails: {
    flex: 1,
  } as ViewStyle,
  ownerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  } as ViewStyle,
  ownerName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
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
  viewProfileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  } as ViewStyle,
  viewProfileText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2f2f6f",
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
  actionButtonsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 8,
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
  } as TextStyle,
  tradeModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  } as ViewStyle,
  tradeModalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 36,
    maxHeight: "92%",
  } as ViewStyle,
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DDD",
    alignSelf: "center",
    marginBottom: 14,
  } as ViewStyle,
  tradeModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 18,
    gap: 10,
  } as ViewStyle,
  tradeModalTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#1A1A2E",
  } as TextStyle,
  tradeModalSubtitle: {
    fontSize: 13,
    color: "#888",
    marginTop: 2,
  } as TextStyle,
  tradeModalTargetTitle: {
    fontWeight: "700",
    color: "#2f2f6f",
  } as TextStyle,
  tradeModalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F0F0F0",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  } as ViewStyle,
  tradeModalPreview: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F7F8FC",
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#ECECEC",
  } as ViewStyle,
  tradePreviewSide: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  } as ViewStyle,
  tradePreviewImageBox: {
    width: 72,
    height: 72,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#E8E8E8",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#2f2f6f",
  } as ViewStyle,
  tradePreviewImageBoxEmpty: {
    borderColor: "#D0D0D0",
    borderStyle: "dashed",
  } as ViewStyle,
  tradePreviewImage: {
    width: "100%",
    height: "100%",
  } as ImageStyle,
  tradePreviewLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
    maxWidth: 90,
  } as TextStyle,
  tradePreviewArrow: {
    paddingHorizontal: 10,
    backgroundColor: "#ECEDF8",
    borderRadius: 20,
    padding: 8,
  } as ViewStyle,
  tradeModalSectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  } as TextStyle,
  tradeModalLoader: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
    marginBottom: 16,
  } as ViewStyle,
  tradeModalLoaderText: {
    fontSize: 13,
    color: "#888",
  } as TextStyle,
  tradeModalEmpty: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 16,
    gap: 6,
    marginBottom: 16,
    backgroundColor: "#F7F8FC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ECECEC",
  } as ViewStyle,
  tradeModalEmptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
  } as TextStyle,
  tradeModalEmptyText: {
    fontSize: 12,
    color: "#AAAAAA",
    textAlign: "center",
    lineHeight: 18,
  } as TextStyle,
  tradeItemListContainer: {
    paddingBottom: 4,
    gap: 10,
    marginBottom: 18,
  } as ViewStyle,
  tradeItemCardHorizontal: {
    width: 100,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#E0E0E0",
    backgroundColor: "#FAFAFA",
    padding: 6,
    alignItems: "center",
    gap: 5,
  } as ViewStyle,
  tradeItemCardHorizontalSelected: {
    borderColor: "#2f2f6f",
    backgroundColor: "#ECEDF8",
  } as ViewStyle,
  tradeItemImageBoxHorizontal: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#E8E8E8",
    position: "relative",
  } as ViewStyle,
  tradeItemImageHorizontal: {
    width: "100%",
    height: "100%",
  } as ImageStyle,
  tradeItemImagePlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F0F0F0",
  } as ViewStyle,
  tradeItemSelectedOverlayHorizontal: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(47,47,111,0.55)",
    justifyContent: "center",
    alignItems: "center",
  } as ViewStyle,
  tradeItemTitleHorizontal: {
    fontSize: 11,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
  } as TextStyle,
  tradeItemTitleHorizontalSelected: {
    color: "#2f2f6f",
  } as TextStyle,
  tradeItemCategoryHorizontal: {
    fontSize: 10,
    color: "#AAAAAA",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  } as TextStyle,
  tradeModalFooter: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  } as ViewStyle,
  tradeModalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  } as ViewStyle,
  tradeModalCancelText: {
    color: "#888",
    fontWeight: "600",
    fontSize: 14,
  } as TextStyle,
  tradeModalSubmitBtn: {
    backgroundColor: "#2f2f6f",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 14,
    marginBottom: 10,
    elevation: 3,
    shadowColor: "#2f2f6f",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    flex: 1,
  } as ViewStyle,
  tradeModalSubmitBtnDisabled: {
    opacity: 0.45,
    elevation: 0,
    shadowOpacity: 0,
  } as ViewStyle,
  tradeModalSubmitText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
    letterSpacing: 0.3,
  } as TextStyle,
});