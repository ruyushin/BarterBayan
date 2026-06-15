import { Ionicons } from "@expo/vector-icons";
import { ResizeMode, Video } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
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
import { ItemDetailsCard } from "../components/ItemDetailsCard";
import { auth } from "../firebaseConfig.ts";
import {
  getUserInfo,
  getUserPostedItems,
  updateItemLikes,
} from "../services/itemService.ts";
import { getLikeState, setLikeState } from "../services/likeCache";
import { proposeTrade } from "../services/tradeService.ts";
import {
  trackItemView,
  trackUserActivity,
} from "../services/trendingService.ts";

const SCREEN_WIDTH = Dimensions.get("window").width;
const NAVY = "#2f2f6f";
const GOLD = "#C9A227";

// ── Media helpers ─────────────────────────────────────────────────────────────
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

// ── Cross-platform save (FIXED) ───────────────────────────────────────────────
async function saveImageCrossPlatform(url: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `barterbayan-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      Alert.alert("Download failed", "Could not download the image. Please try again.");
    }
    return;
  }

  let localUri: string | null = null;

  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission required",
        "Please allow access to your photo library in Settings to save images.",
      );
      return;
    }

    // documentDirectory can be null on some Android builds — always fall back to cacheDirectory
    const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
    if (!baseDir) {
      Alert.alert("Error", "Could not find a writable directory on this device.");
      return;
    }

    const filename = `BarterBayan_${Date.now()}.jpg`;
    const tempPath = baseDir + filename;

    const downloadResult = await FileSystem.downloadAsync(url, tempPath);

    if (downloadResult.status !== 200) {
      throw new Error(`Download returned status ${downloadResult.status}`);
    }

    localUri = downloadResult.uri;
    await MediaLibrary.saveToLibraryAsync(localUri);
    Alert.alert("Saved!", "Image saved to your gallery.");
  } catch (err: any) {
    console.error("saveImageCrossPlatform error:", err);
    Alert.alert(
      "Download failed",
      "Could not save the image. Make sure you have enough storage space and try again.",
    );
  } finally {
    // Clean up temp file from cache
    if (localUri && FileSystem.cacheDirectory && localUri.startsWith(FileSystem.cacheDirectory)) {
      FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});
    }
  }
}

// ── MediaItem component ───────────────────────────────────────────────────────
function MediaItem({ uri }: { uri: string }) {
  const [imgError, setImgError] = useState(false);
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
    <View style={media.wrapper}>
      <Image
        source={{ uri }}
        style={media.image}
        resizeMode="contain"
        onError={() => setImgError(true)}
      />
    </View>
  );
}

const media = StyleSheet.create({
  wrapper: {
    width: SCREEN_WIDTH,
    height: 320,
    backgroundColor: "#1a1a2e",
    justifyContent: "center",
    alignItems: "center",
  } as ViewStyle,
  image: { width: "100%", height: "100%" } as ImageStyle,
  video: { width: "100%", height: "100%" } as ViewStyle,
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
  errorBox: { backgroundColor: "#f5f5f5", gap: 8 } as ViewStyle,
  errorText: { color: "#aaa", fontSize: 13 } as TextStyle,
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

  // Trade offer state
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
        const cached = getLikeState(itemData.id);
        if (cached) {
          setIsLiked(cached.isLiked);
          setLikeCount(cached.likeCount);
        } else {
          const liked = !!(
            currentUser && itemData?.likedBy?.includes(currentUser)
          );
          const count = itemData.likes || 0;
          setIsLiked(liked);
          setLikeCount(count);
          setLikeState(itemData.id, liked, count);
        }
        loadOwnerInfo(itemData.ownerId);
        if (currentUser) {
          trackItemView(itemData.id, currentUser).catch(console.error);
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

  const handleBackPress = () => {
    try {
      if (router.canGoBack?.()) router.back();
      else router.replace("/(tabs)");
    } catch {
      router.replace("/(tabs)");
    }
  };

  const handleLike = async () => {
    if (!currentUser) {
      Alert.alert("Please log in", "You must be logged in to like items.");
      return;
    }
    try {
      const nowLiked = !isLiked;
      await updateItemLikes(item.id, currentUser, nowLiked);
      const newCount = nowLiked ? likeCount + 1 : Math.max(0, likeCount - 1);
      setIsLiked(nowLiked);
      setLikeCount(newCount);
      setLikeState(item.id, nowLiked, newCount);
      if (nowLiked) {
        await trackUserActivity(currentUser, "like", item.id, item.category);
      }
    } catch {
      Alert.alert("Error", "Failed to update like status.");
    }
  };

  const handleSaveCurrentImage = async () => {
    if (!mediaItems || mediaItems.length === 0) {
      Alert.alert("No media", "There is no image to save.");
      return;
    }
    const current = mediaItems[currentMediaIndex];
    if (!current) {
      Alert.alert("No media", "Could not find the current image.");
      return;
    }
    if (isVideoUrl(current)) {
      Alert.alert("Cannot save", "Videos cannot be saved this way.");
      return;
    }
    await saveImageCrossPlatform(current);
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
      Alert.alert("Please log in", "You must be logged in to offer a trade.");
      return;
    }
    if (currentUser === item.ownerId) {
      Alert.alert("Cannot trade", "You cannot offer a trade on your own item.");
      return;
    }
    try {
      setLoadingMyItems(true);
      setShowTradeModal(true);
      const items = await getUserPostedItems(currentUser);
      setMyItems(items);
    } catch {
      Alert.alert("Error", "Failed to load your items.");
    } finally {
      setLoadingMyItems(false);
    }
  };

  const handleSubmitTradeOffer = async () => {
    if (!selectedOfferItem) {
      Alert.alert(
        "Select an item",
        "Please select one of your items to offer.",
      );
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
      Alert.alert(
        "Trade Offered!",
        "Your trade offer has been sent to the owner.",
      );
    } catch {
      Alert.alert("Error", "Failed to send trade offer.");
    } finally {
      setTradeSubmitting(false);
    }
  };

  // Build media list
  const mediaItems = (() => {
    const all: string[] = [];
    if (Array.isArray(item?.images))
      item.images.forEach((url: string) => {
        if (isValidMediaUrl(url)) all.push(url);
      });
    if (Array.isArray(item?.videos))
      item.videos.forEach((url: string) => {
        if (isValidMediaUrl(url)) all.push(url);
      });
    if (all.length === 0) {
      if (isValidMediaUrl(item?.image)) all.push(item.image);
      if (isValidMediaUrl(item?.video)) all.push(item.video);
    }
    return all;
  })();

  const ownerDisplayName =
    ownerInfo?.firstName && ownerInfo?.lastName
      ? `${ownerInfo.firstName} ${ownerInfo.lastName}`
      : ownerInfo?.username || "Unknown User";

  if (loading) {
    return (
      <View style={styles.loaderBox}>
        <ActivityIndicator size="large" color={NAVY} />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.loaderBox}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBackPress}>
          <Ionicons name="arrow-back" size={28} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.errorText}>Product not found.</Text>
      </View>
    );
  }

  const hasMultiple = mediaItems.length > 1;

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
          <Text style={styles.stickyHeaderTitle}>Product Details</Text>
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
                  <MediaItem uri={mediaUrl} />
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

            {/* Save button */}
            {mediaItems.length > 0 &&
              mediaItems[currentMediaIndex] &&
              !isVideoUrl(mediaItems[currentMediaIndex]) && (
                <TouchableOpacity
                  style={styles.saveImageBtn}
                  onPress={handleSaveCurrentImage}
                  activeOpacity={0.8}
                >
                  <Ionicons name="download-outline" size={18} color="#fff" />
                </TouchableOpacity>
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
          </View>

          {/* ── Content ── */}
          <View style={styles.content}>
            <Text style={styles.title}>{item?.title}</Text>

            <ItemDetailsCard
              description={item?.description}
              additionalDescription={item?.additionalDescription}
              condition={item?.condition}
              category={item?.category}
              estimatedWeight={item?.estimatedWeight}
              quantity={item?.quantity}
              compact={false}
              descriptionExpanded={descriptionExpanded}
              onToggleDescription={() => setDescriptionExpanded((p) => !p)}
            />

            {/* Owner card */}
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
                    />
                  ) : (
                    <View style={[styles.ownerAvatar, styles.avatarFallback]}>
                      <Text style={styles.avatarInitial}>
                        {(ownerDisplayName || "?")[0].toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.ownerDetails}>
                    <View style={styles.ownerNameRow}>
                      <Text style={styles.ownerName}>{ownerDisplayName}</Text>
                      <Ionicons name="chevron-forward" size={16} color="#aaa" />
                    </View>
                    <View style={styles.ratingContainer}>
                      <Ionicons name="star" size={14} color="#FFB800" />
                      <Text style={styles.rating}>
                        {ownerInfo.rating?.toFixed(1) ?? "N/A"}
                      </Text>
                      <Text style={styles.tradeCount}>
                        {`(${ownerInfo.tradeCount ?? 0} trades)`}
                      </Text>
                    </View>
                  </View>
                </View>
                {!!ownerInfo.bio && (
                  <Text style={styles.bio}>{ownerInfo.bio}</Text>
                )}
                <View style={styles.viewProfileRow}>
                  <Text style={styles.viewProfileText}>View full profile</Text>
                  <Ionicons name="arrow-forward" size={14} color={NAVY} />
                </View>
              </TouchableOpacity>
            )}

            {/* Like button */}
            <TouchableOpacity
              style={[styles.likeButton, isLiked && styles.likeButtonActive]}
              onPress={handleLike}
            >
              <Ionicons
                name={isLiked ? "heart" : "heart-outline"}
                size={20}
                color={isLiked ? "#fff" : NAVY}
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

            {/* Action buttons */}
            {currentUser !== item.ownerId ? (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.messageButton}
                  onPress={handleSendMessage}
                >
                  <Ionicons name="send" size={18} color="#fff" />
                  <Text style={styles.messageButtonText}>Message</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.tradeButton}
                  onPress={handleOpenTradeModal}
                >
                  <Ionicons name="swap-horizontal" size={18} color="#fff" />
                  <Text style={styles.tradeButtonText}>Propose Trade</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.ownItemBanner}>
                <Ionicons
                  name="information-circle-outline"
                  size={16}
                  color="#888"
                />
                <Text style={styles.ownItemText}>This is your listing.</Text>
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
                  <Text style={styles.tradeModalTitle}>Propose a Trade</Text>
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

              {/* Preview */}
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
                          <Image
                            source={{ uri }}
                            style={styles.tradePreviewImage}
                          />
                        ) : (
                          <Ionicons
                            name="cube-outline"
                            size={28}
                            color="#CCCCCC"
                          />
                        );
                      })()
                    ) : (
                      <Ionicons name="cube-outline" size={28} color="#CCCCCC" />
                    )}
                  </View>
                  <Text style={styles.tradePreviewLabel} numberOfLines={2}>
                    {selectedOfferItem
                      ? selectedOfferItem.title
                      : "Select below ↓"}
                  </Text>
                </View>
                <View style={styles.tradePreviewArrow}>
                  <Ionicons name="swap-horizontal" size={26} color={NAVY} />
                </View>
                <View style={styles.tradePreviewSide}>
                  <View style={styles.tradePreviewImageBox}>
                    {item
                      ? (() => {
                          const uri =
                            Array.isArray(item.images) && item.images.length > 0
                              ? item.images[0]
                              : item.image;
                          return uri ? (
                            <Image
                              source={{ uri }}
                              style={styles.tradePreviewImage}
                            />
                          ) : (
                            <Ionicons
                              name="cube-outline"
                              size={28}
                              color="#CCCCCC"
                            />
                          );
                        })()
                      : null}
                  </View>
                  <Text style={styles.tradePreviewLabel} numberOfLines={2}>
                    {item?.title ?? ""}
                  </Text>
                </View>
              </View>

              <Text style={styles.tradeModalSectionLabel}>
                Choose your item to offer
              </Text>

              {loadingMyItems ? (
                <View style={styles.tradeModalLoader}>
                  <ActivityIndicator size="small" color={NAVY} />
                  <Text style={styles.tradeModalLoaderText}>
                    Loading your items…
                  </Text>
                </View>
              ) : myItems.length === 0 ? (
                <View style={styles.tradeModalEmpty}>
                  <Ionicons name="cube-outline" size={36} color="#CCCCCC" />
                  <Text style={styles.tradeModalEmptyTitle}>
                    No items listed
                  </Text>
                  <Text style={styles.tradeModalEmptyText}>
                    Add items in the Trade tab before proposing a trade.
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
                          styles.tradeItemCard,
                          isSelected && styles.tradeItemCardSelected,
                        ]}
                        onPress={() => setSelectedOfferItem(myItem)}
                        activeOpacity={0.8}
                      >
                        <View style={styles.tradeItemImageBox}>
                          {img && !img.startsWith("blob:") ? (
                            <Image
                              source={{ uri: img }}
                              style={styles.tradeItemImage}
                            />
                          ) : (
                            <View style={styles.tradeItemImagePlaceholder}>
                              <Ionicons
                                name="image-outline"
                                size={22}
                                color="#CCC"
                              />
                            </View>
                          )}
                          {isSelected && (
                            <View style={styles.tradeItemSelectedOverlay}>
                              <Ionicons
                                name="checkmark-circle"
                                size={24}
                                color="#fff"
                              />
                            </View>
                          )}
                        </View>
                        <Text
                          style={[
                            styles.tradeItemTitle,
                            isSelected && styles.tradeItemTitleSelected,
                          ]}
                          numberOfLines={2}
                        >
                          {myItem.title}
                        </Text>
                        {myItem.category ? (
                          <Text
                            style={styles.tradeItemCategory}
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
                  <Text style={styles.tradeModalCancelText}>Cancel</Text>
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
                      <Text style={styles.tradeModalSubmitText}>
                        Send Trade Offer
                      </Text>
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
    backgroundColor: NAVY,
    paddingTop: 32,
  } as ViewStyle,
  loaderBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
  } as ViewStyle,
  backBtn: {
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
    color: NAVY,
    textAlign: "center",
    marginTop: 20,
  } as TextStyle,
  container: { flex: 1, backgroundColor: "#F3F4F6" } as ViewStyle,
  stickyHeader: {
    backgroundColor: NAVY,
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
  stickyHeaderSpacer: { width: 38, height: 38 } as ViewStyle,
  scrollContent: { paddingBottom: 40 } as ViewStyle,
  carouselContainer: {
    height: 320,
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
  noMediaText: { color: "#aaa", fontSize: 14 } as TextStyle,
  saveImageBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
  } as ViewStyle,
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
  paginationDotActive: { backgroundColor: "#fff", width: 22 } as ViewStyle,
  paginationDotVideo: { backgroundColor: "rgba(201,162,39,0.7)" } as ViewStyle,
  paginationText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 6,
  } as TextStyle,
  content: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
  } as ViewStyle,
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    lineHeight: 28,
  } as TextStyle,
  ownerCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 14,
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
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#E5E7EB",
  } as ImageStyle,
  avatarFallback: {
    backgroundColor: NAVY,
    justifyContent: "center",
    alignItems: "center",
  } as ViewStyle,
  avatarInitial: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
  } as TextStyle,
  ownerDetails: { flex: 1 } as ViewStyle,
  ownerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  } as ViewStyle,
  ownerName: {
    fontSize: 15,
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
  rating: { fontSize: 13, fontWeight: "600", color: "#FFB800" } as TextStyle,
  tradeCount: { fontSize: 12, color: "#6B7280" } as TextStyle,
  bio: { fontSize: 13, color: "#6B7280", lineHeight: 18 } as TextStyle,
  viewProfileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  } as ViewStyle,
  viewProfileText: {
    fontSize: 13,
    fontWeight: "700",
    color: NAVY,
  } as TextStyle,
  likeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: NAVY,
    backgroundColor: "#fff",
  } as ViewStyle,
  likeButtonActive: { backgroundColor: NAVY, borderColor: NAVY } as ViewStyle,
  likeButtonText: { fontSize: 16, fontWeight: "600", color: NAVY } as TextStyle,
  likeButtonTextActive: { color: "#fff" } as TextStyle,
  actionRow: { flexDirection: "row", gap: 12, marginBottom: 8 } as ViewStyle,
  messageButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    backgroundColor: NAVY,
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
    backgroundColor: GOLD,
    borderRadius: 12,
  } as ViewStyle,
  tradeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  } as TextStyle,
  ownItemBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
  } as ViewStyle,
  ownItemText: { fontSize: 13, color: "#888", fontWeight: "500" } as TextStyle,
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
  tradeModalTargetTitle: { fontWeight: "700", color: NAVY } as TextStyle,
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
  tradePreviewSide: { flex: 1, alignItems: "center", gap: 8 } as ViewStyle,
  tradePreviewImageBox: {
    width: 72,
    height: 72,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#E8E8E8",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: NAVY,
  } as ViewStyle,
  tradePreviewImageBoxEmpty: {
    borderColor: "#D0D0D0",
    borderStyle: "dashed",
  } as ViewStyle,
  tradePreviewImage: { width: "100%", height: "100%" } as ImageStyle,
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
  tradeModalLoaderText: { fontSize: 13, color: "#888" } as TextStyle,
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
  tradeItemCard: {
    width: 100,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#E0E0E0",
    backgroundColor: "#FAFAFA",
    padding: 6,
    alignItems: "center",
    gap: 5,
  } as ViewStyle,
  tradeItemCardSelected: {
    borderColor: NAVY,
    backgroundColor: "#ECEDF8",
  } as ViewStyle,
  tradeItemImageBox: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#E8E8E8",
    position: "relative",
  } as ViewStyle,
  tradeItemImage: { width: "100%", height: "100%" } as ImageStyle,
  tradeItemImagePlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F0F0F0",
  } as ViewStyle,
  tradeItemSelectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(47,47,111,0.55)",
    justifyContent: "center",
    alignItems: "center",
  } as ViewStyle,
  tradeItemTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
  } as TextStyle,
  tradeItemTitleSelected: { color: NAVY } as TextStyle,
  tradeItemCategory: {
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
    backgroundColor: NAVY,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 14,
    elevation: 3,
    shadowColor: NAVY,
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