import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    Image,
    ImageStyle,
    Modal,
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
import { getUserInfo, updateItemLikes } from "../services/itemService";
import { trackItemView, trackUserActivity } from "../services/trendingService";
import { ProposeTradeModal } from "./ProposeTradeModal";

const SCREEN_WIDTH = Dimensions.get("window").width;
const NAVY = "#2f2f6f";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ProductDetailModalProps {
  visible: boolean;
  item: any;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  visible,
  item,
  onClose,
}) => {
  const router = useRouter();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [ownerInfo, setOwnerInfo] = useState<any>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [currentUser] = useState(auth.currentUser?.uid);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [fullScreenImageIndex, setFullScreenImageIndex] = useState<
    number | null
  >(null);

  // ── Trade proposal state ──────────────────────────────────────────────────
  const [tradeModalVisible, setTradeModalVisible] = useState(false);
  // ─────────────────────────────────────────────────────────────────────────

  // Validate image URLs and filter out blob URLs
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

  // Is this item owned by the current user?
  const isOwnItem = !!currentUser && currentUser === item?.ownerId;

  useEffect(() => {
    if (visible && item) {
      setLikeCount(item.likes || 0);
      loadOwnerInfo();
      checkIfLiked();

      if (currentUser) {
        trackItemView(item.id, currentUser).catch((error) =>
          console.error("Error tracking item view:", error),
        );
      }
    }
  }, [visible, item, currentUser]);

  const loadOwnerInfo = async () => {
    try {
      if (!item?.ownerId) return;
      const info = await getUserInfo(item.ownerId);
      setOwnerInfo(info);
    } catch (error) {
      console.error("Error loading owner info:", error);
      setOwnerInfo(null);
    }
  };

  const checkIfLiked = () => {
    if (currentUser && item?.likedBy?.includes(currentUser)) {
      setIsLiked(true);
    } else {
      setIsLiked(false);
    }
  };

  const handleLike = async () => {
    if (!currentUser) {
      Alert.alert("Please log in", "You must be logged in to like items");
      return;
    }
    try {
      setLoading(true);
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
    } finally {
      setLoading(false);
    }
  };

  const handleSaveImage = async () => {
    try {
      const currentImage = images[currentImageIndex];
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
    onClose();
  };

  const handleEnlargePress = () => {
    router.push({
      pathname: "/product-details",
      params: { itemId: item.id, item: JSON.stringify(item) },
    });
    onClose();
  };

  const handleImageLongPress = (nativeEvent: any) => {
    if (nativeEvent.state === State.ACTIVE || nativeEvent.state === 4) {
      handleSaveImage();
    }
  };

  // ── Full-screen image viewer ───────────────────────────────────────────────
  const renderFullScreenImage = () => {
    if (fullScreenImageIndex === null) return null;
    const image = images[fullScreenImageIndex];
    return (
      <Modal
        visible={true}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setFullScreenImageIndex(null)}
      >
        <View style={styles.fullScreenContainer}>
          <TouchableOpacity
            style={styles.fullScreenCloseButton}
            onPress={() => setFullScreenImageIndex(null)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <Image
            source={{ 
              uri: image?.startsWith("blob:") ? "https://via.placeholder.com/400x200" : (image || "https://via.placeholder.com/400x200")
            }}
            style={styles.fullScreenImage}
            resizeMode="contain"
            onError={() => console.warn("Failed to load full-screen image:", image)}
          />
          <View style={styles.fullScreenControls}>
            <TouchableOpacity
              onPress={() => {
                setCurrentImageIndex((prev) =>
                  prev > 0 ? prev - 1 : images.length - 1,
                );
                setFullScreenImageIndex((prev) =>
                  prev! > 0 ? prev! - 1 : images.length - 1,
                );
              }}
            >
              <Ionicons name="chevron-back" size={32} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.fullScreenCounter}>
              {`${fullScreenImageIndex + 1} / ${images.length}`}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setCurrentImageIndex((prev) =>
                  prev < images.length - 1 ? prev + 1 : 0,
                );
                setFullScreenImageIndex((prev) =>
                  prev! < images.length - 1 ? prev! + 1 : 0,
                );
              }}
            >
              <Ionicons name="chevron-forward" size={32} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  // ── Image carousel ────────────────────────────────────────────────────────
  const renderImageCarousel = () => (
    <View style={styles.carouselContainer}>
      {images.length > 0 ? (
        <>
          <FlatList
            horizontal
            pagingEnabled
            scrollEnabled={images.length > 1}
            showsHorizontalScrollIndicator={false}
            data={images}
            keyExtractor={(_, index: number) => `image-${index}`}
            renderItem={({ item: imageUrl }) => (
              <LongPressGestureHandler
                onHandlerStateChange={({ nativeEvent }) =>
                  handleImageLongPress(nativeEvent)
                }
                minDurationMs={500}
              >
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={styles.imageWrapper}
                  onPress={() => setFullScreenImageIndex(currentImageIndex)}
                >
                  <Image
                    source={{ 
                      uri: imageUrl?.startsWith("blob:") ? "https://via.placeholder.com/400x200" : (imageUrl || "https://via.placeholder.com/400x200")
                    }}
                    style={styles.carouselImage}
                    resizeMode="contain"
                    onError={() => console.warn("Failed to load carousel image:", imageUrl)}
                  />
                </TouchableOpacity>
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
          {images.length > 1 ? (
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
          ) : null}
          <View style={styles.holdToSaveContainer}>
            <Text style={styles.holdToSaveText}>Hold image to save</Text>
          </View>
        </>
      ) : (
        <View style={{ flex: 1, backgroundColor: "#F3F4F6" }} />
      )}
    </View>
  );

  // ── Main modal content ────────────────────────────────────────────────────
  const modalContent = (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={28} color="#2e2d7c" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Product Details</Text>
        <TouchableOpacity
          onPress={handleEnlargePress}
          style={styles.expandButton}
        >
          <Ionicons name="expand" size={24} color="#2e2d7c" />
        </TouchableOpacity>
      </View>

      {renderImageCarousel()}

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Title */}
        <View style={styles.productInfo}>
          <Text style={styles.title}>{item?.title}</Text>
        </View>

        {/* Details card */}
        <View style={styles.detailsSection}>
          <Text style={styles.detailsHeader}>Details</Text>

          {item?.description ? (
            <View style={styles.descriptionContainer}>
              <Text style={styles.descriptionText}>
                {descriptionExpanded
                  ? item.description
                  : item.description.length > 1000
                    ? item.description.substring(0, 1000) + "..."
                    : item.description}
              </Text>
              {item.description.length > 1000 ? (
                <TouchableOpacity
                  onPress={() => setDescriptionExpanded(!descriptionExpanded)}
                  style={styles.seeMoreButton}
                >
                  <Text style={styles.seeMoreText}>
                    {descriptionExpanded ? "See less" : "See more"}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {item?.condition ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Condition</Text>
              <Text style={styles.detailValue}>{item.condition}</Text>
            </View>
          ) : null}

          {item?.category ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Category</Text>
              <Text style={styles.detailValue}>{item.category}</Text>
            </View>
          ) : null}
        </View>

        {/* Owner card */}
        {ownerInfo ? (
          <View style={styles.ownerCard}>
            <View style={styles.ownerHeader}>
              <Image
                source={{ uri: ownerInfo.avatarUrl }}
                style={styles.ownerAvatar}
              />
              <View style={styles.ownerDetails}>
                <Text style={styles.ownerName}>
                  {ownerInfo.firstName && ownerInfo.lastName
                    ? `${ownerInfo.firstName} ${ownerInfo.lastName}`
                    : ownerInfo.username || "Unknown User"}
                </Text>
                <View style={styles.ratingContainer}>
                  <Ionicons name="star" size={14} color="#FFB800" />
                  <Text style={styles.rating}>
                    {ownerInfo.rating?.toFixed(1) || "N/A"}
                  </Text>
                  <Text style={styles.tradeCount}>
                    {`(${ownerInfo.tradeCount || 0} trades)`}
                  </Text>
                </View>
              </View>
            </View>
            {ownerInfo.bio ? (
              <Text style={styles.bio}>{ownerInfo.bio}</Text>
            ) : null}
          </View>
        ) : null}

        {/* Like button */}
        <TouchableOpacity
          style={[styles.likeButton, isLiked && styles.likeButtonActive]}
          onPress={handleLike}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={isLiked ? "#fff" : "#2e2d7c"} />
          ) : (
            <>
              <Ionicons
                name={isLiked ? "heart" : "heart-outline"}
                size={20}
                color={isLiked ? "#fff" : "#2e2d7c"}
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

        {/* ── Action buttons — only shown for items you DON'T own ── */}
        {!isOwnItem ? (
          <View style={styles.actionRow}>
            {/* Message button */}
            <TouchableOpacity
              style={styles.messageButton}
              onPress={handleSendMessage}
              activeOpacity={0.85}
            >
              <Ionicons name="send" size={18} color="#fff" />
              <Text style={styles.messageButtonText}>Message</Text>
            </TouchableOpacity>

            {/* Propose Trade button */}
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
          /* Own item — show an "Edit / View" hint instead */
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
  );

  return (
    <>
      {renderFullScreenImage()}

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={styles.modalOverlay}>{modalContent}</View>
      </Modal>

      {/* ── ProposeTradeModal AFTER the parent Modal so it layers on top ── */}
      <ProposeTradeModal
        visible={tradeModalVisible}
        targetItem={item}
        onClose={() => setTradeModalVisible(false)}
        onSuccess={() => {
          setTradeModalVisible(false);
          // optionally also close the product modal so user lands on Trade tab:
          // onClose();
        }}
      />
    </>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  } as ViewStyle,
  container: {
    flex: 1,
    backgroundColor: "#fff",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: 50,
  } as ViewStyle,
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  } as ViewStyle,
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2e2d7c",
  } as TextStyle,
  closeButton: { padding: 8 } as ViewStyle,
  expandButton: { padding: 8 } as ViewStyle,

  // Carousel
  carouselContainer: {
    height: 300,
    backgroundColor: "#F3F4F6",
    position: "relative",
    marginHorizontal: 0,
  } as ViewStyle,
  imageWrapper: {
    width: SCREEN_WIDTH,
    height: 300,
  } as ViewStyle,
  carouselImage: {
    width: SCREEN_WIDTH,
    height: 300,
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

  // Full-screen viewer
  fullScreenContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  } as ViewStyle,
  fullScreenCloseButton: {
    position: "absolute",
    top: 40,
    right: 20,
    zIndex: 10,
  } as ViewStyle,
  fullScreenImage: {
    width: "100%",
    height: "75%",
  } as ImageStyle,
  fullScreenControls: {
    position: "absolute",
    bottom: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 20,
  } as ViewStyle,
  fullScreenCounter: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
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

  // Content
  content: { flex: 1 } as ViewStyle,
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 16,
  } as ViewStyle,
  productInfo: { gap: 8 } as ViewStyle,
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
  } as TextStyle,

  // Details card
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
  seeMoreButton: { paddingVertical: 4 } as ViewStyle,
  seeMoreText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2e2d7c",
  } as TextStyle,

  // Owner card
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
  ownerDetails: { flex: 1 } as ViewStyle,
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
    color: "#4B5563",
    lineHeight: 18,
  } as TextStyle,

  // Like button
  likeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
  } as ViewStyle,
  likeButtonActive: { backgroundColor: "#2e2d7c" } as ViewStyle,
  likeButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2e2d7c",
  } as TextStyle,
  likeButtonTextActive: { color: "#fff" } as TextStyle,

  // ── Action row (Message + Propose Trade side by side) ──
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  } as ViewStyle,
  messageButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2e2d7c",
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
    backgroundColor: "#C9A227",
    borderRadius: 12,
    paddingVertical: 14,
    gap: 6,
  } as ViewStyle,
  tradeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  } as TextStyle,

  // Own item banner
  ownItemBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    marginBottom: 20,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
  } as ViewStyle,
  ownItemText: {
    fontSize: 13,
    color: "#888",
    fontWeight: "500",
  } as TextStyle,
});
