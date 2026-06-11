/**
 * app/user-profile.tsx
 *
 * Public profile screen — view any other user's profile + listed items.
 * Navigate here from anywhere with:
 *   router.push({ pathname: "/user-profile", params: { userId: "abc123" } })
 */

import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ProductDetailModal } from "../components/ProductDetailModal";
import { auth, db } from "../firebaseConfig";

// ─── Constants ────────────────────────────────────────────────────────────────
const NAVY = "#2f2f6f";
const GOLD = "#C9A227";
const STAR_FILLED = "#F5A623";
const STAR_EMPTY = "#D8D8D8";
const MAX_RATING = 5;
const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;

const AVATAR_COLORS = [
  "#e05c5c",
  "#e07a5c",
  "#5c7ae0",
  "#5cb8e0",
  "#7a5ce0",
  "#5ce07a",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const letterAvatarColor = (name: string) =>
  AVATAR_COLORS[(name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length];

const formatTime = (timestamp: any): string => {
  if (!timestamp) return "";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
};

const useGoBack = () => {
  const router = useRouter();
  return () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/explore" as any);
    }
  };
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface PublicUserData {
  username: string;
  firstName?: string;
  lastName?: string;
  bio?: string;
  avatarUrl?: string;
  rating: number;
  ratingCount: number;
  tradesCount: number;
  exchangedCount: number;
  isVerified?: boolean;
  createdAt?: any;
  location?: string;
}

interface Review {
  id: string;
  reviewerName: string;
  reviewerAvatar?: string;
  rating: number;
  comment: string;
  createdAt: any;
}

interface ListedItem {
  id: string;
  title: string;
  description?: string;
  images?: string[];
  image?: string;
  category?: string;
  createdAt?: any;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({
  uri,
  name,
  size,
}: {
  uri?: string | null;
  name: string;
  size: number;
}) {
  const [failed, setFailed] = useState(false);
  const bg = letterAvatarColor(name);
  const style = { width: size, height: size, borderRadius: size / 2 };

  if (uri && !failed) {
    return (
      <Image source={{ uri }} style={style} onError={() => setFailed(true)} />
    );
  }
  return (
    <View
      style={[
        style,
        { backgroundColor: bg, justifyContent: "center", alignItems: "center" },
      ]}
    >
      <Text style={{ color: "#fff", fontSize: size * 0.4, fontWeight: "800" }}>
        {(name || "?")[0].toUpperCase()}
      </Text>
    </View>
  );
}

// ─── Star Row ─────────────────────────────────────────────────────────────────
function Stars({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {Array.from({ length: MAX_RATING }, (_, i) => (
        <Ionicons
          key={i}
          name={
            i + 1 <= Math.floor(rating)
              ? "star"
              : i < rating && rating % 1 >= 0.5
                ? "star-half"
                : "star-outline"
          }
          size={size}
          color={i < rating ? STAR_FILLED : STAR_EMPTY}
        />
      ))}
    </View>
  );
}

// ─── Item Card ────────────────────────────────────────────────────────────────
function ItemCard({
  item,
  onPress,
}: {
  item: ListedItem;
  onPress: () => void;
}) {
  // Validate image URLs and filter out blob URLs
  const validateImageUrl = (url: string | undefined): boolean => {
    if (!url) return false;
    if (typeof url !== "string") return false;
    if (url.startsWith("blob:")) return false;
    return true;
  };

  const imageUrl = (() => {
    if (validateImageUrl(item.images?.[0])) return item.images![0];
    if (validateImageUrl(item.image)) return item.image;
    return null;
  })();

  return (
    <TouchableOpacity style={card.wrap} onPress={onPress} activeOpacity={0.88}>
      <View style={card.imgWrap}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={card.img}
            onError={() =>
              console.warn("Failed to load user profile item image:", imageUrl)
            }
          />
        ) : (
          <View style={[card.img, card.imgPlaceholder]}>
            <Ionicons name="image-outline" size={32} color="#ccc" />
          </View>
        )}
        {item.category && (
          <View style={card.badge}>
            <Text style={card.badgeText}>{item.category}</Text>
          </View>
        )}
      </View>
      <View style={card.info}>
        <Text style={card.title} numberOfLines={2}>
          {item.title}
        </Text>
        {item.createdAt && (
          <Text style={card.time}>{formatTime(item.createdAt)}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const card = StyleSheet.create({
  wrap: {
    width: CARD_WIDTH,
    backgroundColor: "#fff",
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  imgWrap: { position: "relative" },
  img: { width: "100%", height: 130, backgroundColor: "#f0f0f5" },
  imgPlaceholder: { justifyContent: "center", alignItems: "center" },
  badge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    backgroundColor: "rgba(47,47,111,0.85)",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  info: { padding: 10 },
  title: { fontSize: 13, fontWeight: "700", color: "#1a1a2e", lineHeight: 18 },
  time: { fontSize: 11, color: "#aaa", marginTop: 4 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function UserProfileScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const currentUserId = auth.currentUser?.uid;
  const isOwnProfile = currentUserId === userId;

  const [userData, setUserData] = useState<PublicUserData | null>(null);
  const [listings, setListings] = useState<ListedItem[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"listings" | "reviews">(
    "listings",
  );
  const [selectedItem, setSelectedItem] = useState<ListedItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  // ─── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    loadAll();
  }, [userId]);

  const loadAll = async () => {
    setLoading(true);
    try {
      await Promise.all([loadUser(), loadListings(), loadReviews()]);
    } finally {
      setLoading(false);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 380,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
        }),
      ]).start();
    }
  };

  const loadUser = async () => {
    const snap = await getDoc(doc(db, "users", userId!));
    if (snap.exists()) {
      const d = snap.data();
      setUserData({
        username: d.username || d.displayName || "User",
        firstName: d.firstName,
        lastName: d.lastName,
        bio: d.bio || "",
        avatarUrl: d.avatarUrl || d.photoURL || null,
        rating:
          typeof d.rating === "number" ? d.rating : parseFloat(d.rating) || 0,
        ratingCount: d.ratingCount ?? 0,
        tradesCount: d.tradesCount ?? 0,
        exchangedCount: d.exchangedCount ?? 0,
        isVerified: d.isVerified ?? false,
        createdAt: d.createdAt,
        location: d.location || "",
      });
    }
  };

  const loadListings = async () => {
    try {
      const q = query(
        collection(db, "items"),
        where("ownerId", "==", userId),
        orderBy("createdAt", "desc"),
        limit(20),
      );
      const snap = await getDocs(q);
      setListings(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ListedItem),
      );
    } catch (err) {
      console.error("Error loading listings:", err);
    }
  };

  const loadReviews = async () => {
    try {
      const q = query(
        collection(db, "users", userId!, "reviews"),
        orderBy("createdAt", "desc"),
        limit(10),
      );
      const snap = await getDocs(q);
      setReviews(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Review));
    } catch (err) {
      console.error("Error loading reviews:", err);
    }
  };

  // ─── Message handler ────────────────────────────────────────────────────────
  const handleMessage = () => {
    if (!currentUserId || isOwnProfile) return;
    router.push({ pathname: "/chat", params: { ownerUserId: userId } });
  };

  // ─── Open listing in modal instead of navigating away ─────────────────────
  const handleListingPress = (item: ListedItem) => {
    setSelectedItem(item);
    setModalVisible(true);
  };
  // ──────────────────────────────────────────────────────────────────────────

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={NAVY} />
        </View>
      </SafeAreaView>
    );
  }

  if (!userData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}>
          <Ionicons name="person-circle-outline" size={64} color="#ddd" />
          <Text style={styles.emptyText}>User not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const hasRatings = userData.ratingCount > 0;

  // ─── UI ────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {userData.firstName && userData.lastName
            ? `${userData.firstName} ${userData.lastName}`
            : userData.username}
        </Text>
        {!isOwnProfile ? (
          <TouchableOpacity style={styles.msgBtn} onPress={handleMessage}>
            <Ionicons name="chatbubble-ellipses" size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.msgBtn}
            onPress={() => router.push("/edit-profile" as any)}
          >
            <Ionicons name="pencil" size={18} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <Animated.View
          style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
        >
          {/* ── Hero banner ── */}
          <View style={styles.heroBanner}>
            <View style={styles.heroOverlay} />
            <View style={styles.avatarRing}>
              <Avatar
                uri={userData.avatarUrl}
                name={userData.username}
                size={88}
              />
            </View>
          </View>

          {/* ── Identity ── */}
          <View style={styles.identityWrap}>
            <View style={styles.nameRow}>
              <Text style={styles.username}>
                {userData.firstName && userData.lastName
                  ? `${userData.firstName} ${userData.lastName}`
                  : userData.username}
              </Text>
              {userData.isVerified && (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark" size={10} color="#fff" />
                </View>
              )}
            </View>

            {userData.location ? (
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={13} color="#aaa" />
                <Text style={styles.locationText}>{userData.location}</Text>
              </View>
            ) : null}

            {userData.bio ? (
              <Text style={styles.bioText}>{userData.bio}</Text>
            ) : null}

            {userData.createdAt && (
              <Text style={styles.joinedText}>
                Joined {formatTime(userData.createdAt)}
              </Text>
            )}
          </View>

          {/* ── Stats ── */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{userData.tradesCount}</Text>
              <Text style={styles.statLabel}>Trades</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{userData.exchangedCount}</Text>
              <Text style={styles.statLabel}>Exchanged</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{listings.length}</Text>
              <Text style={styles.statLabel}>Listed</Text>
            </View>
          </View>

          {/* ── Rating pill ── */}
          <View style={styles.ratingPill}>
            <Stars rating={hasRatings ? userData.rating : 0} size={18} />
            {hasRatings ? (
              <Text style={styles.ratingNum}>
                {userData.rating.toFixed(1)}{" "}
                <Text style={styles.ratingCountText}>
                  ({userData.ratingCount}{" "}
                  {userData.ratingCount === 1 ? "review" : "reviews"})
                </Text>
              </Text>
            ) : (
              <Text style={styles.noRatingText}>No reviews yet</Text>
            )}
          </View>

          {/* ── Message / Trade buttons (other user only) ── */}
          {!isOwnProfile && (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleMessage}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={18}
                  color="#fff"
                />
                <Text style={styles.primaryBtnText}>Message</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() =>
                  router.push({
                    pathname: "/trade",
                    params: { targetUserId: userId },
                  } as any)
                }
                activeOpacity={0.85}
              >
                <Ionicons
                  name="swap-horizontal-outline"
                  size={18}
                  color={NAVY}
                />
                <Text style={styles.secondaryBtnText}>Offer Trade</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Tabs ── */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tab, activeTab === "listings" && styles.tabActive]}
              onPress={() => setActiveTab("listings")}
            >
              <Ionicons
                name="grid-outline"
                size={16}
                color={activeTab === "listings" ? NAVY : "#aaa"}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === "listings" && styles.tabTextActive,
                ]}
              >
                Listings ({listings.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === "reviews" && styles.tabActive]}
              onPress={() => setActiveTab("reviews")}
            >
              <Ionicons
                name="star-outline"
                size={16}
                color={activeTab === "reviews" ? NAVY : "#aaa"}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === "reviews" && styles.tabTextActive,
                ]}
              >
                Reviews ({reviews.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Listings grid ── */}
          {activeTab === "listings" && (
            <View style={styles.gridWrap}>
              {listings.length === 0 ? (
                <View style={styles.emptyTab}>
                  <Ionicons name="cube-outline" size={48} color="#ddd" />
                  <Text style={styles.emptyTabText}>No listings yet</Text>
                </View>
              ) : (
                <View style={styles.grid}>
                  {listings.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      onPress={() => handleListingPress(item)}
                    />
                  ))}
                </View>
              )}
            </View>
          )}

          {/* ── Reviews ── */}
          {activeTab === "reviews" && (
            <View style={styles.reviewsWrap}>
              {reviews.length === 0 ? (
                <View style={styles.emptyTab}>
                  <Ionicons name="star-outline" size={48} color="#ddd" />
                  <Text style={styles.emptyTabText}>No reviews yet</Text>
                </View>
              ) : (
                reviews.map((r) => (
                  <View key={r.id} style={styles.reviewCard}>
                    <View style={styles.reviewTop}>
                      <Avatar
                        uri={r.reviewerAvatar}
                        name={r.reviewerName || "?"}
                        size={38}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.reviewerName}>
                          {r.reviewerName}
                        </Text>
                        <Stars rating={r.rating} size={13} />
                      </View>
                      {r.createdAt && (
                        <Text style={styles.reviewDate}>
                          {formatTime(r.createdAt)}
                        </Text>
                      )}
                    </View>
                    {r.comment ? (
                      <Text style={styles.reviewComment}>{r.comment}</Text>
                    ) : null}
                  </View>
                ))
              )}
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {/* ── Listing detail modal ── */}
      {selectedItem && (
        <ProductDetailModal
          visible={modalVisible}
          item={selectedItem}
          onClose={() => setModalVisible(false)}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F9" },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  emptyText: { fontSize: 15, color: "#bbb", fontWeight: "600" },

  // Header
  header: {
    backgroundColor: NAVY,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 13,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "800",
    flex: 1,
    textAlign: "center",
    marginHorizontal: 8,
  },
  msgBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },

  scroll: { paddingBottom: 40 },

  // Hero
  heroBanner: {
    height: 120,
    backgroundColor: NAVY,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 0,
    position: "relative",
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  avatarRing: {
    position: "absolute",
    bottom: -44,
    alignSelf: "center",
    borderRadius: 52,
    borderWidth: 4,
    borderColor: "#fff",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },

  // Identity
  identityWrap: {
    alignItems: "center",
    marginTop: 52,
    paddingHorizontal: 24,
    marginBottom: 4,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 4,
  },
  username: { fontSize: 22, fontWeight: "900", color: "#1a1a2e" },
  verifiedBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#1877F2",
    justifyContent: "center",
    alignItems: "center",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginBottom: 6,
  },
  locationText: { fontSize: 13, color: "#aaa" },
  bioText: {
    fontSize: 14,
    color: "#555",
    textAlign: "center",
    lineHeight: 20,
    fontStyle: "italic",
    marginBottom: 6,
  },
  joinedText: { fontSize: 12, color: "#bbb", marginTop: 2 },

  // Stats
  statsRow: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginTop: 18,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statBox: { flex: 1, alignItems: "center" },
  statNum: { fontSize: 20, fontWeight: "900", color: NAVY },
  statLabel: {
    fontSize: 11,
    color: "#aaa",
    fontWeight: "600",
    marginTop: 2,
    textTransform: "uppercase",
  },
  statDivider: { width: 1, backgroundColor: "#ececec", marginVertical: 4 },

  // Rating pill
  ratingPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  ratingNum: { fontSize: 16, fontWeight: "800", color: "#1a1a2e" },
  ratingCountText: { fontSize: 12, fontWeight: "400", color: "#aaa" },
  noRatingText: { fontSize: 13, color: "#bbb", fontStyle: "italic" },

  // Action buttons
  actionRow: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginTop: 16,
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: NAVY,
    borderRadius: 14,
    paddingVertical: 13,
    shadowColor: NAVY,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  secondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "#ECEDF8",
    borderRadius: 14,
    paddingVertical: 13,
    borderWidth: 1.5,
    borderColor: "#C8CAEE",
  },
  secondaryBtnText: { color: NAVY, fontWeight: "800", fontSize: 15 },

  // Tabs
  tabBar: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 4,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 11,
  },
  tabActive: { backgroundColor: "#ECEDF8" },
  tabText: { fontSize: 13, fontWeight: "600", color: "#aaa" },
  tabTextActive: { color: NAVY, fontWeight: "800" },

  // Grid
  gridWrap: { marginHorizontal: 16, marginTop: 16 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  emptyTab: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 10,
  },
  emptyTabText: { fontSize: 14, color: "#ccc", fontWeight: "600" },

  // Reviews
  reviewsWrap: { marginHorizontal: 16, marginTop: 16, gap: 10 },
  reviewCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  reviewTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  reviewerName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1a1a2e",
    marginBottom: 2,
  },
  reviewDate: { fontSize: 11, color: "#bbb", fontWeight: "500" },
  reviewComment: {
    fontSize: 13,
    color: "#555",
    lineHeight: 19,
    marginLeft: 48,
    fontStyle: "italic",
  },
});
