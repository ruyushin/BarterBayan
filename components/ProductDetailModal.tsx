import { Ionicons } from "@expo/vector-icons";
import { ResizeMode, Video } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  ImageStyle,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { auth } from "../firebaseConfig";
import { getUserInfo, updateItemLikes } from "../services/itemService";
import { getLikeState, setLikeState } from "../services/likeCache";
import { trackItemView, trackUserActivity } from "../services/trendingService";
import { ItemDetailsCard } from "./ItemDetailsCard";
import { ProposeTradeModal } from "./ProposeTradeModal";

const SCREEN_WIDTH = Dimensions.get("window").width;
const NAVY = "#2f2f6f";
const GOLD = "#C9A227";

interface ProductDetailModalProps {
  visible: boolean;
  item: any;
  onClose: () => void;
  onLikeChange?: (liked: boolean, count: number) => void;
}

const isVideoUrl = (url: string): boolean => {
  if (!url || typeof url !== "string") return false;
  const lower = url.toLowerCase();
  return (
    lower.includes(".mp4") ||
    lower.includes(".mov") ||
    lower.includes(".avi") ||
    lower.includes(".webm") ||
    lower.includes("videos%2F") ||
    lower.includes("/video/upload/") ||
    lower.includes("video")
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

function MediaSlide({ uri }: { uri: string }) {
  const [imgError, setImgError] = useState(false);
  const isVideo = isVideoUrl(uri);

  if (isVideo) {
    return (
      <View style={slide.wrapper}>
        <Video
          source={{ uri }}
          style={slide.media}
          resizeMode={ResizeMode.CONTAIN}
          useNativeControls
          isLooping={false}
          onError={() => console.warn("Video failed:", uri)}
        />
        <View style={slide.videoBadge}>
          <Ionicons name="videocam" size={11} color="#fff" />
          <Text style={slide.videoBadgeText}>Video</Text>
        </View>
      </View>
    );
  }

  if (imgError) {
    return (
      <View style={[slide.wrapper, slide.errorBox]}>
        <Ionicons name="image-outline" size={36} color="#ccc" />
        <Text style={slide.errorText}>Image unavailable</Text>
      </View>
    );
  }

  return (
    <View style={slide.wrapper}>
      <Image
        source={{ uri }}
        style={slide.media}
        resizeMode="contain"
        onError={() => setImgError(true)}
      />
    </View>
  );
}

const slide = StyleSheet.create({
  wrapper: {
    width: SCREEN_WIDTH,
    height: 300,
    backgroundColor: "#1a1a2e",
    justifyContent: "center",
    alignItems: "center",
  } as ViewStyle,
  media: { width: "100%", height: "100%" } as ImageStyle,
  videoBadge: {
    position: "absolute",
    top: 10,
    left: 10,
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

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  visible,
  item,
  onClose,
  onLikeChange,
}) => {
  const router = useRouter();
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [ownerInfo, setOwnerInfo] = useState<any>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [currentUser] = useState(auth.currentUser?.uid);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [fullScreenIndex, setFullScreenIndex] = useState<number | null>(null);
  const [tradeModalVisible, setTradeModalVisible] = useState(false);

  const isOwnItem = !!currentUser && currentUser === item?.ownerId;

  const mediaItems = useMemo<string[]>(() => {
    const all: string[] = [];
    if (Array.isArray(item?.images))
      item.images.forEach((u: string) => {
        if (isValidMediaUrl(u)) all.push(u);
      });
    if (Array.isArray(item?.videos))
      item.videos.forEach((u: string) => {
        if (isValidMediaUrl(u)) all.push(u);
      });
    if (all.length === 0) {
      if (isValidMediaUrl(item?.image)) all.push(item.image);
      if (isValidMediaUrl(item?.video)) all.push(item.video);
    }
    return all;
  }, [item?.images, item?.videos, item?.image, item?.video]);

  const imageOnlyItems = useMemo(
    () => mediaItems.filter((u) => !isVideoUrl(u)),
    [mediaItems],
  );

  useEffect(() => {
    if (visible && item) {
      setCurrentMediaIndex(0);
      setDescriptionExpanded(false);
      loadOwnerInfo();
      if (currentUser) trackItemView(item.id, currentUser).catch(console.error);

      const cached = getLikeState(item.id);
      if (cached) {
        setIsLiked(cached.isLiked);
        setLikeCount(cached.likeCount);
      } else {
        const liked = !!(currentUser && item?.likedBy?.includes(currentUser));
        const count = item.likes || 0;
        setIsLiked(liked);
        setLikeCount(count);
        setLikeState(item.id, liked, count);
      }
    }
  }, [visible, item?.id]);

  const loadOwnerInfo = async () => {
    try {
      if (!item?.ownerId) return;
      const info = await getUserInfo(item.ownerId);
      setOwnerInfo(info);
    } catch {
      setOwnerInfo(null);
    }
  };

  const handleLike = async () => {
    if (!currentUser) {
      Alert.alert("Please log in", "You must be logged in to like items.");
      return;
    }
    try {
      setLoading(true);
      const nowLiked = !isLiked;
      await updateItemLikes(item.id, currentUser, nowLiked);
      const newCount = nowLiked ? likeCount + 1 : Math.max(0, likeCount - 1);
      setIsLiked(nowLiked);
      setLikeCount(newCount);
      setLikeState(item.id, nowLiked, newCount);
      onLikeChange?.(nowLiked, newCount);
      if (nowLiked) {
        await trackUserActivity(currentUser, "like", item.id, item.category);
      }
    } catch {
      Alert.alert("Error", "Failed to update like status.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCurrentImage = async () => {
    if (mediaItems.length === 0) {
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
    onClose();
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

  const handleSeePost = () => {
    onClose();
    const updatedLikedBy: string[] = (() => {
      const base: string[] = Array.isArray(item?.likedBy)
        ? [...item.likedBy]
        : [];
      if (isLiked && currentUser && !base.includes(currentUser)) {
        base.push(currentUser);
      } else if (!isLiked && currentUser) {
        return base.filter((id: string) => id !== currentUser);
      }
      return base;
    })();
    router.push({
      pathname: "/product-details",
      params: {
        itemId: item.id,
        item: JSON.stringify({
          ...item,
          likes: likeCount,
          likedBy: updatedLikedBy,
        }),
      },
    });
  };

  const handleOwnerPress = () => {
    if (!item?.ownerId) return;
    onClose();
    router.push({
      pathname: "/user-profile",
      params: { userId: item.ownerId },
    });
  };

  const ownerDisplayName =
    ownerInfo?.firstName && ownerInfo?.lastName
      ? `${ownerInfo.firstName} ${ownerInfo.lastName}`
      : ownerInfo?.username ||
        ownerInfo?.displayName ||
        item?.userName ||
        "Unknown User";

  const renderFullScreen = () => {
    if (fullScreenIndex === null) return null;
    const url = imageOnlyItems[fullScreenIndex];
    if (!url) return null;
    return (
      <Modal
        visible
        transparent
        animationType="fade"
        onRequestClose={() => setFullScreenIndex(null)}
      >
        <View style={styles.fullScreenContainer}>
          <TouchableOpacity
            style={styles.fullScreenCloseButton}
            onPress={() => setFullScreenIndex(null)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.fullScreenSaveButton}
            onPress={() => saveImageCrossPlatform(url)}
          >
            <Ionicons name="download-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <Image
            source={{ uri: url }}
            style={styles.fullScreenImage}
            resizeMode="contain"
          />
          {imageOnlyItems.length > 1 && (
            <View style={styles.fullScreenControls}>
              <TouchableOpacity
                onPress={() =>
                  setFullScreenIndex((p) =>
                    p! > 0 ? p! - 1 : imageOnlyItems.length - 1,
                  )
                }
              >
                <Ionicons name="chevron-back" size={32} color="#fff" />
              </TouchableOpacity>
              <Text
                style={styles.fullScreenCounter}
              >{`${fullScreenIndex + 1} / ${imageOnlyItems.length}`}</Text>
              <TouchableOpacity
                onPress={() =>
                  setFullScreenIndex((p) =>
                    p! < imageOnlyItems.length - 1 ? p! + 1 : 0,
                  )
                }
              >
                <Ionicons name="chevron-forward" size={32} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    );
  };

  const renderCarousel = () => (
    <View style={styles.carouselContainer}>
      {mediaItems.length === 0 ? (
        <View style={styles.noMediaBox}>
          <Ionicons name="image-outline" size={40} color="#ccc" />
          <Text style={styles.noMediaText}>No media</Text>
        </View>
      ) : (
        <>
          <FlatList
            horizontal
            pagingEnabled
            scrollEnabled={mediaItems.length > 1}
            showsHorizontalScrollIndicator={false}
            data={mediaItems}
            keyExtractor={(_, i) => `media-${i}`}
            renderItem={({ item: uri }) => (
              <TouchableOpacity
                activeOpacity={0.95}
                onPress={() => {
                  if (!isVideoUrl(uri)) {
                    const idx = imageOnlyItems.indexOf(uri);
                    if (idx >= 0) setFullScreenIndex(idx);
                  }
                }}
              >
                <MediaSlide uri={uri} />
              </TouchableOpacity>
            )}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(
                e.nativeEvent.contentOffset.x /
                  e.nativeEvent.layoutMeasurement.width,
              );
              setCurrentMediaIndex(idx);
            }}
          />
          {mediaItems[currentMediaIndex] &&
            !isVideoUrl(mediaItems[currentMediaIndex]) && (
              <TouchableOpacity
                style={styles.saveImageBtn}
                onPress={handleSaveCurrentImage}
                activeOpacity={0.8}
              >
                <Ionicons name="download-outline" size={18} color="#fff" />
              </TouchableOpacity>
            )}
          {mediaItems.length > 1 && (
            <View style={styles.pagination}>
              {mediaItems.map((u, i) => (
                <View
                  key={i}
                  style={[
                    styles.paginationDot,
                    i === currentMediaIndex && styles.paginationDotActive,
                    isVideoUrl(u) && styles.paginationDotVideo,
                  ]}
                />
              ))}
              <Text
                style={styles.paginationText}
              >{`${currentMediaIndex + 1} / ${mediaItems.length}`}</Text>
            </View>
          )}
        </>
      )}
    </View>
  );

  return (
    <>
      {renderFullScreen()}

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.container}>
            {/* ── Header ── */}
            <View style={styles.header}>
              <TouchableOpacity onPress={onClose} style={styles.headerSideSlot}>
                <Ionicons name="close" size={26} color={NAVY} />
              </TouchableOpacity>

              <Text style={styles.headerTitle}>Product Details</Text>

              <TouchableOpacity
                onPress={handleSeePost}
                style={styles.seePostBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.seePostText}>See post</Text>
                <Ionicons name="arrow-forward" size={13} color={NAVY} />
              </TouchableOpacity>
            </View>

            {renderCarousel()}

            <ScrollView
              style={styles.content}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.title}>{item?.title}</Text>

              <ItemDetailsCard
                description={item?.description}
                additionalDescription={item?.additionalDescription}
                condition={item?.condition || item?.itemCondition}
                category={item?.category}
                estimatedWeight={item?.estimatedWeight}
                quantity={item?.quantity}
                compact={true}
                descriptionExpanded={descriptionExpanded}
                onToggleDescription={() => setDescriptionExpanded((p) => !p)}
              />

              {!!ownerInfo && (
                <TouchableOpacity
                  style={styles.ownerCard}
                  onPress={handleOwnerPress}
                  activeOpacity={0.85}
                >
                  <View style={styles.ownerHeader}>
                    {ownerInfo?.avatarUrl ? (
                      <Image
                        source={{ uri: ownerInfo.avatarUrl }}
                        style={styles.ownerAvatar}
                      />
                    ) : (
                      <View
                        style={[styles.ownerAvatar, styles.ownerAvatarFallback]}
                      >
                        <Text style={styles.ownerAvatarInitial}>
                          {(ownerDisplayName || "?")[0].toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={styles.ownerDetails}>
                      <View style={styles.ownerNameRow}>
                        <Text style={styles.ownerName}>{ownerDisplayName}</Text>
                        <Ionicons
                          name="chevron-forward"
                          size={14}
                          color="#aaa"
                        />
                      </View>
                      <View style={styles.ratingContainer}>
                        <Ionicons name="star" size={13} color="#FFB800" />
                        <Text style={styles.rating}>
                          {ownerInfo.rating?.toFixed(1) || "N/A"}
                        </Text>
                        <Text
                          style={styles.tradeCount}
                        >{`(${ownerInfo.tradeCount || 0} trades)`}</Text>
                      </View>
                    </View>
                  </View>
                  {!!ownerInfo.bio && (
                    <Text style={styles.bio}>{ownerInfo.bio}</Text>
                  )}
                  <View style={styles.viewProfileRow}>
                    <Text style={styles.viewProfileText}>View full profile</Text>
                    <Ionicons name="arrow-forward" size={13} color={NAVY} />
                  </View>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.likeButton, isLiked && styles.likeButtonActive]}
                onPress={handleLike}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={isLiked ? "#fff" : NAVY} />
                ) : (
                  <>
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
                  </>
                )}
              </TouchableOpacity>

              {!isOwnItem ? (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.messageButton}
                    onPress={handleSendMessage}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="send" size={18} color="#fff" />
                    <Text style={styles.messageButtonText}>Message</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.tradeButton}
                    onPress={() => setTradeModalVisible(true)}
                    activeOpacity={0.85}
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
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ProposeTradeModal
        visible={tradeModalVisible}
        targetItem={item}
        onClose={() => setTradeModalVisible(false)}
        onSuccess={() => setTradeModalVisible(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" } as ViewStyle,
  container: {
    flex: 1,
    backgroundColor: "#fff",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: 50,
    overflow: "hidden",
  } as ViewStyle,
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  } as ViewStyle,
  headerSideSlot: {
    width: 38,
    alignItems: "flex-start",
    padding: 4,
  } as ViewStyle,
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: NAVY,
    textAlign: "center",
  } as TextStyle,
  seePostBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EEF0FF",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  } as ViewStyle,
  seePostText: { fontSize: 12, fontWeight: "700", color: NAVY } as TextStyle,
  carouselContainer: {
    height: 300,
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
  noMediaText: { color: "#aaa", fontSize: 13 } as TextStyle,
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
    bottom: 12,
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
  paginationDotActive: { backgroundColor: "#fff", width: 20 } as ViewStyle,
  paginationDotVideo: { backgroundColor: "rgba(201,162,39,0.8)" } as ViewStyle,
  paginationText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
    marginLeft: 6,
  } as TextStyle,
  fullScreenContainer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  } as ViewStyle,
  fullScreenCloseButton: {
    position: "absolute",
    top: 44,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  } as ViewStyle,
  fullScreenSaveButton: {
    position: "absolute",
    top: 44,
    left: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  } as ViewStyle,
  fullScreenImage: { width: "100%", height: "75%" } as ImageStyle,
  fullScreenControls: {
    position: "absolute",
    bottom: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 24,
  } as ViewStyle,
  fullScreenCounter: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  } as TextStyle,
  content: { flex: 1 } as ViewStyle,
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 14,
  } as ViewStyle,
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    lineHeight: 26,
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
  ownerAvatarFallback: {
    backgroundColor: NAVY,
    justifyContent: "center",
    alignItems: "center",
  } as ViewStyle,
  ownerAvatarInitial: {
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
    marginTop: 3,
  } as ViewStyle,
  rating: { fontSize: 13, fontWeight: "600", color: "#FFB800" } as TextStyle,
  tradeCount: { fontSize: 12, color: "#6B7280" } as TextStyle,
  bio: { fontSize: 13, color: "#4B5563", lineHeight: 18 } as TextStyle,
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
  actionRow: { flexDirection: "row", gap: 10, marginBottom: 8 } as ViewStyle,
  messageButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: NAVY,
    borderRadius: 12,
    paddingVertical: 14,
    gap: 6,
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
    backgroundColor: GOLD,
    borderRadius: 12,
    paddingVertical: 14,
    gap: 6,
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
    marginBottom: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
  } as ViewStyle,
  ownItemText: { fontSize: 13, color: "#888", fontWeight: "500" } as TextStyle,
});