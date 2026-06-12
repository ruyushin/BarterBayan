import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth } from "../firebaseConfig";
import { getUserSavedItems } from "../services/itemService";

// ─── Constants ────────────────────────────────────────────────────────────────
const NAVY = "#2f2f6f";
const ACCENT_RED = "#C0392B";
const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;

const SORT_OPTIONS = ["None", "Newest", "Oldest", "Most Liked"];
const FILTER_CATEGORIES = [
  "All",
  "Electronics",
  "Fashion",
  "Living",
  "School/Office",
  "Household",
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface SavedItem {
  id: string;
  title: string;
  description?: string;
  image?: string;
  images?: string[];
  category?: string;
  ownerId: string;
  owner?: {
    username?: string;
    avatarUrl?: string;
  };
  likes?: number;
  createdAt?: any;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const safeUri = (url: string | undefined): string | null => {
  if (!url || typeof url !== "string") return null;
  if (url.startsWith("blob:")) return null;
  if (!url.startsWith("http")) return null;
  return url;
};

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

const toDate = (ts: any): Date => {
  if (!ts) return new Date(0);
  if (ts.toDate) return ts.toDate();
  return new Date(ts);
};

// ─── Item Card ────────────────────────────────────────────────────────────────
function SavedItemCard({
  item,
  onPress,
}: {
  item: SavedItem;
  onPress: () => void;
}) {
  const imageUrl =
    safeUri(item.images?.[0]) ?? safeUri(item.image) ?? null;

  return (
    <TouchableOpacity style={card.wrap} onPress={onPress} activeOpacity={0.88}>
      <View style={card.imgWrap}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={card.img}
            resizeMode="cover"
          />
        ) : (
          <View style={[card.img, card.imgPlaceholder]}>
            <Ionicons name="image-outline" size={32} color="#ccc" />
          </View>
        )}
        {item.category ? (
          <View style={card.badge}>
            <Text style={card.badgeText}>{item.category}</Text>
          </View>
        ) : null}
        <View style={card.savedBadge}>
          <Ionicons name="bookmark" size={12} color="#fff" />
        </View>
      </View>
      <View style={card.info}>
        <Text style={card.title} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={card.footer}>
          {item.createdAt ? (
            <Text style={card.time}>{formatTime(item.createdAt)}</Text>
          ) : null}
          {item.likes !== undefined && item.likes > 0 ? (
            <View style={card.likesRow}>
              <Ionicons name="heart" size={11} color={ACCENT_RED} />
              <Text style={card.likesText}>{item.likes}</Text>
            </View>
          ) : null}
        </View>
        {item.owner?.username ? (
          <View style={card.ownerRow}>
            {item.owner.avatarUrl ? (
              <Image
                source={{ uri: item.owner.avatarUrl }}
                style={card.ownerAvatar}
              />
            ) : (
              <View style={card.ownerAvatarFallback}>
                <Text style={card.ownerInitial}>
                  {(item.owner.username[0] ?? "?").toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={card.ownerName} numberOfLines={1}>
              {item.owner.username}
            </Text>
          </View>
        ) : null}
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
  savedBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(47,47,111,0.85)",
    borderRadius: 6,
    padding: 4,
  },
  info: { padding: 10 },
  title: { fontSize: 13, fontWeight: "700", color: "#1a1a2e", lineHeight: 18, marginBottom: 4 },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  time: { fontSize: 11, color: "#aaa" },
  likesRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  likesText: { fontSize: 11, color: ACCENT_RED, fontWeight: "600" },
  ownerRow: { flexDirection: "row", alignItems: "center", gap: 5, borderTopWidth: 1, borderTopColor: "#f0f0f0", paddingTop: 7 },
  ownerAvatar: { width: 18, height: 18, borderRadius: 9 },
  ownerAvatarFallback: { width: 18, height: 18, borderRadius: 9, backgroundColor: NAVY, justifyContent: "center", alignItems: "center" },
  ownerInitial: { color: "#fff", fontSize: 9, fontWeight: "700" },
  ownerName: { fontSize: 11, fontWeight: "600", color: "#555", flex: 1 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function SavedPostsScreen() {
  const router = useRouter();
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Filter / Sort state ──
  const [sortType, setSortType] = useState("None");
  const [filterCategory, setFilterCategory] = useState("All");
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/(auth)/login" as any);
        return;
      }
      setUserId(user.uid);
      fetchSavedItems(user.uid, false);
    });
    return () => unsubscribe();
  }, []);

  const fetchSavedItems = async (uid: string, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const items = await getUserSavedItems(uid);
      setSavedItems(items);
    } catch (err) {
      console.error("Error fetching saved items:", err);
      setError("Failed to load saved items.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/profile" as any);
  };

  const handleRefresh = () => {
    if (userId) fetchSavedItems(userId, true);
  };

  const navigateToItem = (savedItem: SavedItem) => {
    router.push({
      pathname: "/product-details",
      params: { itemId: savedItem.id, item: JSON.stringify(savedItem) },
    } as any);
  };

  // ── Shared header ──
  const Header = () => (
    <View style={styles.header}>
      <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
        <Ionicons name="chevron-back" size={24} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Saved Listings</Text>
      <View style={{ width: 38 }} />
    </View>
  );

  // ── Loading ──
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Header />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={NAVY} />
          <Text style={styles.loadingText}>Loading saved items…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <Header />
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={52} color="#ddd" />
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={handleRefresh}>
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Empty ──
  if (savedItems.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <Header />
        <View style={styles.centered}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="bookmark-outline" size={40} color={NAVY} />
          </View>
          <Text style={styles.emptyTitle}>No saved items yet</Text>
          <Text style={styles.emptyMessage}>
            Explore listings and tap the bookmark icon to save them here.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.replace("/(tabs)/explore" as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="search-outline" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>Browse Listings</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Filter + Sort (only computed when items exist) ──
  const filteredItems = savedItems
    .filter((item) =>
      filterCategory === "All" || item.category === filterCategory
    )
    .sort((a, b) => {
      if (sortType === "Newest")
        return toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime();
      if (sortType === "Oldest")
        return toDate(a.createdAt).getTime() - toDate(b.createdAt).getTime();
      if (sortType === "Most Liked") return (b.likes ?? 0) - (a.likes ?? 0);
      return 0;
    });

  const rows: [SavedItem, SavedItem | null][] = [];
  for (let i = 0; i < filteredItems.length; i += 2) {
    rows.push([filteredItems[i], filteredItems[i + 1] ?? null]);
  }

  const renderRow = ({ item }: { item: [SavedItem, SavedItem | null] }) => (
    <View style={styles.row}>
      <SavedItemCard item={item[0]} onPress={() => navigateToItem(item[0])} />
      {item[1] ? (
        <SavedItemCard item={item[1]} onPress={() => navigateToItem(item[1]!)} />
      ) : (
        <View style={{ width: CARD_WIDTH }} />
      )}
    </View>
  );

  // ── List ──
  return (
    <SafeAreaView style={styles.container}>
      <Header />

      {/* ── Sort / Filter bar ── */}
      <View style={styles.controlRow}>
        {/* Sort dropdown */}
        <View style={styles.dropdownWrapper}>
          <TouchableOpacity
            style={styles.smallButton}
            onPress={() => {
              setIsSortOpen((p) => !p);
              setIsFilterOpen(false);
            }}
          >
            <Ionicons name="swap-vertical" size={14} color="#333" />
            <Text style={styles.smallText}>Sort ({sortType})</Text>
            <Ionicons
              name={isSortOpen ? "chevron-up" : "chevron-down"}
              size={12}
              color="#555"
            />
          </TouchableOpacity>
          {isSortOpen && (
            <View style={styles.dropdown}>
              {SORT_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={styles.dropdownItem}
                  onPress={() => {
                    setSortType(opt);
                    setIsSortOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dropdownText,
                      sortType === opt && styles.dropdownTextActive,
                    ]}
                  >
                    {opt}
                  </Text>
                  {sortType === opt && (
                    <Ionicons name="checkmark" size={13} color="#5E3EA1" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Filter dropdown */}
        <View style={styles.dropdownWrapper}>
          <TouchableOpacity
            style={styles.smallButton}
            onPress={() => {
              setIsFilterOpen((p) => !p);
              setIsSortOpen(false);
            }}
          >
            <Ionicons name="funnel" size={14} color="#333" />
            <Text style={styles.smallText}>Filter ({filterCategory})</Text>
            <Ionicons
              name={isFilterOpen ? "chevron-up" : "chevron-down"}
              size={12}
              color="#555"
            />
          </TouchableOpacity>
          {isFilterOpen && (
            <View style={styles.dropdown}>
              {FILTER_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={styles.dropdownItem}
                  onPress={() => {
                    setFilterCategory(cat);
                    setIsFilterOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dropdownText,
                      filterCategory === cat && styles.dropdownTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                  {filterCategory === cat && (
                    <Ionicons name="checkmark" size={13} color="#5E3EA1" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(_, i) => `row-${i}`}
        renderItem={renderRow}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        ListHeaderComponent={
          <Text style={styles.countLabel}>
            {filteredItems.length} saved{" "}
            {filteredItems.length === 1 ? "item" : "items"}
          </Text>
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Ionicons name="search-outline" size={40} color="#ccc" />
            <Text style={styles.emptyTitle}>No matches</Text>
            <Text style={styles.emptyMessage}>
              Try a different filter or sort option.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F9" },

  header: {
    backgroundColor: NAVY,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 32,
    paddingBottom: 14,
    marginTop: 16,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },

  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 10,
  },
  loadingText: { color: "#888", fontSize: 14, marginTop: 4 },

  errorTitle: { fontSize: 17, fontWeight: "700", color: "#1A1A2E", marginTop: 4 },
  errorMessage: { fontSize: 13, color: "#888", textAlign: "center", lineHeight: 19 },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: NAVY,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 10,
    marginTop: 8,
  },
  retryText: { color: "#fff", fontWeight: "600", fontSize: 14 },

  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#ECEDF8",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: "#1A1A2E", textAlign: "center" },
  emptyMessage: { fontSize: 14, color: "#888", textAlign: "center", lineHeight: 21 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: NAVY,
    paddingVertical: 13,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginTop: 6,
    shadowColor: NAVY,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  // ── Sort / Filter bar ──
  controlRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
    zIndex: 20,
  },
  dropdownWrapper: {
    position: "relative",
    zIndex: 20,
  },
  smallButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#d0d0d0",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 5,
  },
  smallText: { fontSize: 13, color: "#444" },
  dropdown: {
    position: "absolute",
    top: 38,
    left: 0,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DDD",
    overflow: "hidden",
    minWidth: 160,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 10,
    zIndex: 999,
  },
  dropdownItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  dropdownText: { fontSize: 13, color: "#333" },
  dropdownTextActive: { fontWeight: "700", color: "#2f2f6f" },

  listContent: { padding: 16, paddingBottom: 100 },
  countLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#aaa",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 0,
  },
});