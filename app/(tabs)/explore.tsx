import { FontAwesome, Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  getFirestore,
  serverTimestamp,
} from "firebase/firestore";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { ProposeTradeModal } from "../../components/ProposeTradeModal";
import { auth } from "../../firebaseConfig";
import {
  addComment,
  addCommentReply,
  deleteComment,
  deleteItem,
  getAllItems,
  getUserInfo,
  getUserSavedItems,
  updateCommentLike,
  updateItemLikes,
  updateItemSave,
} from "../../services/itemService";
import { getLikeState, setLikeState } from "../../services/likeCache";
import {
  getPersonalizedSuggestions,
  getTrendingItems,
} from "../../services/trendingService";

const NAVY = "#2f2f6f";
const GOLD = "#C9A227";
const PLACEHOLDER = "https://via.placeholder.com/400x200?text=No+Image";
const db = getFirestore();

const FILTER_CATEGORIES = [
  "All",
  "Electronics",
  "Fashion",
  "Living",
  "School/Office",
  "Household",
];

const REPORT_REASONS = [
  "Spam or misleading",
  "Inappropriate content",
  "Counterfeit or fake item",
  "Prohibited item",
  "Scam or fraud",
  "Other",
];

// ── URI guard ─────────────────────────────────────────────────────────────────
function safeUri(uri: any): string {
  if (!uri || typeof uri !== "string") return PLACEHOLDER;
  if (
    uri.startsWith("blob:") ||
    uri.startsWith("file:") ||
    uri.startsWith("data:")
  )
    return PLACEHOLDER;
  if (!uri.startsWith("http")) return PLACEHOLDER;
  return uri;
}

function safeUriList(images: any): string[] {
  const raw = Array.isArray(images) ? images : [];
  return raw.map(safeUri).filter((u) => u !== PLACEHOLDER);
}

// ── MiniAvatar — letter fallback instead of random pravatar ──────────────────
function MiniAvatar({
  uri,
  name,
  size,
  style,
}: {
  uri?: string | null;
  name?: string;
  size: number;
  style?: any;
}) {
  const hasImage =
    uri && typeof uri === "string" && uri.startsWith("http");
  const initial = (name || "U")[0].toUpperCase();
  if (hasImage) {
    return (
      <Image
        source={{ uri }}
        style={[
          { width: size, height: size, borderRadius: size / 2 },
          style,
        ]}
      />
    );
  }
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: NAVY,
          justifyContent: "center",
          alignItems: "center",
        },
        style,
      ]}
    >
      <Text
        style={{ color: "#fff", fontSize: size * 0.4, fontWeight: "700" }}
      >
        {initial}
      </Text>
    </View>
  );
}

// ── Display name resolver ─────────────────────────────────────────────────────
function resolveDisplayName(obj: any): string {
  return (
    obj?.displayName?.trim() ||
    obj?.name?.trim() ||
    obj?.fullName?.trim() ||
    obj?.userName?.trim() ||
    ""
  );
}

function buildOwnerDisplayName(info: any, fallback: string): string {
  if (info?.firstName && info?.lastName)
    return `${info.firstName.trim()} ${info.lastName.trim()}`;
  return (
    info?.displayName?.trim() ||
    info?.name?.trim() ||
    info?.fullName?.trim() ||
    info?.username?.trim() ||
    info?.userName?.trim() ||
    fallback ||
    "Unknown User"
  );
}

// ── Date formatter ────────────────────────────────────────────────────────────
function formatPostDate(timestamp: any): string {
  if (!timestamp) return "";
  let date: Date;
  try {
    if (timestamp?.toDate) date = timestamp.toDate();
    else if (timestamp instanceof Date) date = timestamp;
    else if (typeof timestamp === "number") date = new Date(timestamp);
    else date = new Date(timestamp);
    if (isNaN(date.getTime())) return "";
  } catch {
    return "";
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return (
    date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " · " +
    date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function Screen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sortType, setSortType] = useState<"none" | "likes" | "name" | "recent">("none");
  const [filter, setFilter] = useState("All");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [typeFilter, setTypeFilter] = useState<"all" | "trending" | "personalized">("all");
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [searchPopupVisible, setSearchPopupVisible] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) setUserId(user.uid);
    });
    return () => unsubscribe();
  }, []);

  useFocusEffect(
    useCallback(() => {
      setRefreshKey((k) => k + 1);
    }, []),
  );

  const fetchItems = useCallback(
    async (silent = false) => {
      try {
        if (!silent && isInitialLoad) setLoading(true);
        const allEnriched = await getAllItems();
        const enrichMap = Object.fromEntries(
          allEnriched.map((i: any) => [i.id, i]),
        );
        let items: any[];
        if (typeFilter === "trending") {
          const trending = await getTrendingItems(50);
          items = trending.map((item: any) => ({
            ...enrichMap[item.id],
            ...item,
            userName:
              resolveDisplayName(enrichMap[item.id]) ||
              resolveDisplayName(item) ||
              "Unknown User",
            userAvatar:
              enrichMap[item.id]?.userAvatar || item.userAvatar || "",
          }));
        } else if (typeFilter === "personalized") {
          const personalized = userId
            ? await getPersonalizedSuggestions(userId, 50)
            : allEnriched;
          items = personalized.map((item: any) => ({
            ...enrichMap[item.id],
            ...item,
            userName:
              resolveDisplayName(enrichMap[item.id]) ||
              resolveDisplayName(item) ||
              "Unknown User",
            userAvatar:
              enrichMap[item.id]?.userAvatar || item.userAvatar || "",
          }));
        } else {
          items = allEnriched;
        }
        setAllItems(items);
        setIsInitialLoad(false);
      } catch (error) {
        console.error("Error fetching items:", error);
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [typeFilter, userId, isInitialLoad],
  );

  useEffect(() => {
    fetchItems();
  }, [refreshKey, typeFilter]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchItems(true);
  };

  const handleItemDeleted = (itemId: string) => {
    setAllItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  const SORT_OPTIONS: { value: "none" | "likes" | "name" | "recent"; label: string }[] = [
    { value: "none", label: "Default" },
    { value: "recent", label: "Recent" },
    { value: "likes", label: "Likes" },
    { value: "name", label: "A-Z" },
  ];

  const filteredItems = allItems
    .filter((item) => {
      const matchSearch =
        !search.length ||
        item.title?.toLowerCase().includes(search.toLowerCase()) ||
        item.description?.toLowerCase().includes(search.toLowerCase());
      const matchFilter = filter === "All" || item.category === filter;
      return matchSearch && matchFilter;
    })
    .sort((a, b) => {
      if (sortType === "likes") return (b.likes || 0) - (a.likes || 0);
      if (sortType === "name")
        return (a.title || "").localeCompare(b.title || "");
      if (sortType === "recent") {
        const getTime = (item: any) => {
          const ts = item.createdAt;
          if (!ts) return 0;
          if (ts?.toMillis) return ts.toMillis();
          if (ts instanceof Date) return ts.getTime();
          return new Date(ts).getTime() || 0;
        };
        return getTime(b) - getTime(a);
      }
      return 0;
    });



  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={NAVY} />
          <Text style={styles.loadingText}>Loading items...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ItemCard
            item={item}
            onCommentAdded={() => setRefreshKey((p) => p + 1)}
            onDelete={handleItemDeleted}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[NAVY]}
            tintColor={NAVY}
          />
        }
        ListHeaderComponent={
          <>
            {/* Search Bar */}
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
                {search.length > 0 && (
                  <TouchableOpacity
                    onPress={() => {
                      setSearch("");
                      setSearchPopupVisible(false);
                    }}
                  >
                    <Ionicons name="close-circle" size={18} color="#aaa" />
                  </TouchableOpacity>
                )}
              </View>

              {searchPopupVisible && search.trim().length > 0 && (
                <View style={styles.searchPopup}>
                  {(() => {
                    const results = allItems
                      .filter(
                        (item) =>
                          item.title
                            ?.toLowerCase()
                            .includes(search.toLowerCase()) ||
                          item.category
                            ?.toLowerCase()
                            .includes(search.toLowerCase()),
                      )
                      .slice(0, 5);
                    return (
                      <>
                        <Text style={styles.popupTitle}>
                          {results.length > 0
                            ? `${results.length} results`
                            : "No results found"}
                        </Text>
                        {results.length > 0 ? (
                          results.map((item) => (
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
                            Try a different keyword.
                          </Text>
                        )}
                      </>
                    );
                  })()}
                </View>
              )}
            </View>

            {/* Type filter pills */}
            <View style={styles.typeFilterRow}>
              {(["all", "trending", "personalized"] as const).map((type) => {
                const icons = {
                  all: "grid",
                  trending: "flame",
                  personalized: "sparkles",
                } as const;
                const labels = {
                  all: "All",
                  trending: "Trending",
                  personalized: "Suggested",
                };
                const isActive = typeFilter === type;
                return (
                  <Pressable
                    key={type}
                    style={[
                      styles.typeFilterBtn,
                      isActive && styles.typeFilterBtnActive,
                    ]}
                    onPress={() => setTypeFilter(type)}
                  >
                    <Ionicons
                      name={icons[type]}
                      size={15}
                      color={isActive ? "#fff" : NAVY}
                    />
                    <Text
                      style={[
                        styles.typeFilterText,
                        isActive && styles.typeFilterTextActive,
                      ]}
                    >
                      {labels[type]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Sort / Filter row */}
            <View style={styles.filterRow}>
              <Pressable
                style={[
                  styles.filterBtn,
                  sortType !== "none" && styles.filterBtnActive,
                ]}
                onPress={() => {
                  setIsSortOpen((p) => !p);
                  setIsFilterOpen(false);
                }}
              >
                <Ionicons
                  name="swap-vertical"
                  size={13}
                  color={sortType !== "none" ? "#fff" : NAVY}
                />
                <Text
                  style={[
                    styles.filterText,
                    sortType !== "none" && styles.filterTextActive,
                  ]}
                >
                  {SORT_OPTIONS.find((o) => o.value === sortType)?.label ?? "Default"}
                </Text>
                <Ionicons
                  name={isSortOpen ? "chevron-up" : "chevron-down"}
                  size={13}
                  color={sortType !== "none" ? "#fff" : NAVY}
                />
              </Pressable>
              <Pressable
                style={[
                  styles.filterBtn,
                  filter !== "All" && styles.filterBtnActive,
                ]}
                onPress={() => {
                  setIsFilterOpen((p) => !p);
                  setIsSortOpen(false);
                }}
              >
                <Ionicons
                  name="options-outline"
                  size={13}
                  color={filter !== "All" ? "#fff" : NAVY}
                />
                <Text
                  style={[
                    styles.filterText,
                    filter !== "All" && styles.filterTextActive,
                  ]}
                >
                  {filter}
                </Text>
                <Ionicons
                  name={isFilterOpen ? "chevron-up" : "chevron-down"}
                  size={13}
                  color={filter !== "All" ? "#fff" : NAVY}
                />
              </Pressable>
            </View>

            {isSortOpen && (
              <View style={styles.filterDropdown}>
                {SORT_OPTIONS.map((option) => (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      setSortType(option.value);
                      setIsSortOpen(false);
                    }}
                    style={[
                      styles.dropdownItem,
                      sortType === option.value && styles.dropdownItemActive,
                    ]}
                  >
                    {sortType === option.value && (
                      <Ionicons
                        name="checkmark"
                        size={14}
                        color={NAVY}
                        style={{ marginRight: 6 }}
                      />
                    )}
                    <Text
                      style={[
                        styles.dropdownText,
                        sortType === option.value && styles.dropdownTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {isFilterOpen && (
              <View style={styles.filterDropdown}>
                {FILTER_CATEGORIES.map((category) => (
                  <Pressable
                    key={category}
                    onPress={() => {
                      setFilter(category);
                      setIsFilterOpen(false);
                    }}
                    style={[
                      styles.dropdownItem,
                      filter === category && styles.dropdownItemActive,
                    ]}
                  >
                    {filter === category && (
                      <Ionicons
                        name="checkmark"
                        size={14}
                        color={NAVY}
                        style={{ marginRight: 6 }}
                      />
                    )}
                    <Text
                      style={[
                        styles.dropdownText,
                        filter === category && styles.dropdownTextActive,
                      ]}
                    >
                      {category}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="search-outline" size={40} color="#ccc" />
            <Text style={styles.emptyTitle}>No items found</Text>
            <Text style={styles.emptyText}>
              Try adjusting your search or filters.
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      />
    </SafeAreaView>
  );
}

// ─── ItemCard ─────────────────────────────────────────────────────────────────
function ItemCard({ item, onCommentAdded, onDelete }: any) {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const imageHeight = screenWidth * 0.62;

  const currentUser = auth.currentUser?.uid;
  const currentUserName =
    auth.currentUser?.displayName?.trim() ||
    (auth.currentUser?.email
      ? auth.currentUser.email.split("@")[0]
      : `User_${auth.currentUser?.uid?.slice(0, 5) ?? ""}`);
  const currentUserPhotoURL = auth.currentUser?.photoURL || "";
  const isOwnItem = !!currentUser && currentUser === item?.ownerId;

  const [ownerDisplayName, setOwnerDisplayName] = useState<string>(
    resolveDisplayName(item) || "Unknown User",
  );

  useEffect(() => {
    if (!item?.ownerId) return;
    let cancelled = false;
    getUserInfo(item.ownerId)
      .then((info) => {
        if (cancelled || !info) return;
        setOwnerDisplayName(
          buildOwnerDisplayName(info, resolveDisplayName(item)),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [item?.ownerId]);

  const _cached = getLikeState(item.id);
  const [isLiked, setIsLiked] = useState(
    _cached
      ? _cached.isLiked
      : !!(currentUser && item?.likedBy?.includes(currentUser)),
  );
  const [likes, setLikes] = useState(
    _cached ? _cached.likeCount : item.likes || 0,
  );

  const [isSaved, setIsSaved] = useState(false);
  const [comments, setComments] = useState<any[]>(item.comments || []);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [likeLoading, setLikeLoading] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(
    null,
  );
  const [replyText, setReplyText] = useState("");
  const [deleteToastVisible, setDeleteToastVisible] = useState(false);
  const [deletedCommentData, setDeletedCommentData] = useState<any>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tradeModalVisible, setTradeModalVisible] = useState(false);

  const [showOptions, setShowOptions] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportTarget, setReportTarget] = useState<"post" | "user">("post");
  const [selectedReason, setSelectedReason] = useState("");
  const [otherText, setOtherText] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const imagesList = (() => {
    const safe = safeUriList(item?.images);
    if (safe.length > 0) return safe;
    const single = safeUri(item?.image);
    if (single !== PLACEHOLDER) return [single];
    return [PLACEHOLDER];
  })();

  const imageUrl = imagesList[0];
  const resolvedAvatar = safeUri(item?.userAvatar);
  const hasAvatar = resolvedAvatar !== PLACEHOLDER;
  const postDate = formatPostDate(item?.createdAt || item?.date);

  useEffect(() => {
    const entry = getLikeState(item.id);
    if (entry) {
      setIsLiked(entry.isLiked);
      setLikes(entry.likeCount);
    } else {
      setLikes(item.likes || 0);
      setIsLiked(!!(currentUser && item?.likedBy?.includes(currentUser)));
    }
  }, [item.likes, item.likedBy, item.id, currentUser]);

  useEffect(() => {
    checkIfSaved();
  }, [item, currentUser]);

  const checkIfSaved = async () => {
    if (!currentUser) return;
    try {
      const saved = await getUserSavedItems(currentUser);
      setIsSaved(saved.some((s: any) => s.id === item.id));
    } catch {}
  };

  const handleLike = async () => {
    if (!currentUser) {
      Alert.alert("Please log in", "You must be logged in to like items.");
      return;
    }
    try {
      setLikeLoading(true);
      const nowLiked = !isLiked;
      const newCount = nowLiked ? likes + 1 : Math.max(0, likes - 1);
      await updateItemLikes(item.id, currentUser, nowLiked);
      setIsLiked(nowLiked);
      setLikes(newCount);
      setLikeState(item.id, nowLiked, newCount);
    } catch {
      Alert.alert("Error", "Failed to update like.");
    } finally {
      setLikeLoading(false);
    }
  };

  const handleSave = async () => {
    if (!currentUser) {
      Alert.alert("Please log in", "You must be logged in to save items.");
      return;
    }
    try {
      await updateItemSave(item.id, currentUser, !isSaved);
      setIsSaved(!isSaved);
    } catch {
      Alert.alert("Error", "Failed to save item.");
    }
  };

  const handleSendMessage = () => {
    if (!currentUser) {
      Alert.alert("Please log in", "You must be logged in to send messages.");
      return;
    }
    if (isOwnItem) {
      Alert.alert("Cannot message", "You cannot message yourself.");
      return;
    }
    router.push({
      pathname: "/chat",
      params: {
        ownerUserId: item.ownerId,
        itemId: item.id,
        itemTitle: item.title,
      },
    });
  };

  const handleAddComment = async () => {
    if (!currentUser || !commentText.trim()) {
      if (!currentUser)
        Alert.alert("Please log in", "You must be logged in to comment.");
      return;
    }
    try {
      setCommentsLoading(true);
      const newComment = await addComment(
        item.id,
        currentUser,
        commentText.trim(),
        currentUserName,
        currentUserPhotoURL,
      );
      setComments([...comments, newComment]);
      setCommentText("");
      onCommentAdded?.();
    } catch {
      Alert.alert("Error", "Failed to add comment.");
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleAddReply = async (commentId: string) => {
    if (!currentUser || !replyText.trim()) {
      if (!currentUser)
        Alert.alert("Please log in", "You must be logged in to reply.");
      return;
    }
    try {
      setCommentsLoading(true);
      await addCommentReply(
        item.id,
        commentId,
        currentUser,
        replyText.trim(),
        currentUserName,
        currentUserPhotoURL,
      );
      setComments(
        comments.map((c) => {
          if (c.id === commentId) {
            return {
              ...c,
              replies: [
                ...(c.replies || []),
                {
                  id: Date.now().toString(),
                  userId: currentUser,
                  userName: currentUserName,
                  userAvatar: currentUserPhotoURL,
                  text: replyText.trim(),
                  createdAt: new Date(),
                },
              ],
            };
          }
          return c;
        }),
      );
      setReplyText("");
      setReplyingToCommentId(null);
    } catch {
      Alert.alert("Error", "Failed to add reply.");
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleCommentLike = async (
    commentId: string,
    commentLiked: boolean,
  ) => {
    if (!currentUser) {
      Alert.alert("Please log in", "You must be logged in to like comments.");
      return;
    }
    try {
      await updateCommentLike(item.id, commentId, currentUser, !commentLiked);
      setComments(
        comments.map((c) => {
          if (c.id === commentId) {
            const likedByArray = c.likedBy || [];
            return {
              ...c,
              likedBy: !commentLiked
                ? [...likedByArray, currentUser]
                : likedByArray.filter((id: string) => id !== currentUser),
              likes: !commentLiked
                ? (c.likes || 0) + 1
                : Math.max((c.likes || 0) - 1, 0),
            };
          }
          return c;
        }),
      );
    } catch {
      Alert.alert("Error", "Failed to update comment like.");
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      const toDelete = comments.find((c) => c.id === commentId);
      await deleteComment(item.id, commentId);
      setComments(comments.filter((c) => c.id !== commentId));
      setDeletedCommentData(toDelete);
      setDeleteToastVisible(true);
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = setTimeout(
        () => setDeleteToastVisible(false),
        5000,
      );
    } catch {
      Alert.alert("Error", "Failed to delete comment.");
    }
  };

  const handleUndoDelete = async () => {
    if (!deletedCommentData) return;
    try {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      setDeleteToastVisible(false);
      setComments([...comments, deletedCommentData]);
      setDeletedCommentData(null);
      await addComment(
        item.id,
        deletedCommentData.userId,
        deletedCommentData.text,
        deletedCommentData.userName,
        deletedCommentData.userAvatar,
      );
    } catch {
      Alert.alert("Error", "Failed to undo delete.");
    }
  };

  const handleDeletePost = () => {
    setShowOptions(false);
    Alert.alert(
      "Delete Post",
      "This will permanently remove your listing from the explore feed and the trade tab. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteItem(item.id);
              onDelete?.(item.id);
            } catch {
              Alert.alert("Error", "Failed to delete post. Please try again.");
            }
          },
        },
      ],
    );
  };

  const handleOpenReport = (target: "post" | "user") => {
    setShowOptions(false);
    setReportTarget(target);
    setSelectedReason("");
    setOtherText("");
    setShowReportModal(true);
  };

  const handleSubmitReport = async () => {
    if (!selectedReason) {
      Alert.alert("Select a reason", "Please choose a reason for your report.");
      return;
    }
    if (selectedReason === "Other" && !otherText.trim()) {
      Alert.alert("Details required", "Please describe your reason in the text box.");
      return;
    }
    if (!currentUser) {
      Alert.alert("Please log in", "You must be logged in to report content.");
      return;
    }
    try {
      setReportSubmitting(true);
      await addDoc(collection(db, "reports"), {
        type: reportTarget,
        targetId: reportTarget === "post" ? item.id : item.ownerId,
        itemId: item.id,
        reportedBy: currentUser,
        reason: selectedReason === "Other" ? `Other: ${otherText.trim()}` : selectedReason,
        createdAt: serverTimestamp(),
      });
      setShowReportModal(false);
      Alert.alert(
        "Report submitted",
        "Thank you. Our team will review this shortly.",
      );
    } catch {
      Alert.alert("Error", "Failed to submit report. Please try again.");
    } finally {
      setReportSubmitting(false);
    }
  };

  const getCommentCount = () =>
    comments.reduce((count, c) => count + 1 + (c.replies?.length || 0), 0);

  const navigateToDetails = () =>
    router.push({
      pathname: "/product-details",
      params: { itemId: item.id, item: JSON.stringify(item) },
    });

  const resolveCommentName = (comment: any): string => {
    if (comment?.firstName && comment?.lastName)
      return `${comment.firstName.trim()} ${comment.lastName.trim()}`;
    return (
      comment?.displayName?.trim() ||
      comment?.name?.trim() ||
      comment?.userName?.trim() ||
      comment?.username?.trim() ||
      "User"
    );
  };

  return (
    <View style={styles.card}>
      <ProposeTradeModal
        visible={tradeModalVisible}
        targetItem={item}
        onClose={() => setTradeModalVisible(false)}
      />

      {/* ── HEADER ── */}
      <View style={styles.cardHeader}>
        <TouchableOpacity
          style={styles.userInfo}
          onPress={() =>
            item.ownerId &&
            router.push({
              pathname: "/user-profile",
              params: { userId: item.ownerId },
            })
          }
          activeOpacity={0.8}
        >
          {hasAvatar ? (
            <Image source={{ uri: resolvedAvatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>
                {(ownerDisplayName || "?")[0].toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.userDetails}>
            <Text style={styles.username}>{ownerDisplayName}</Text>
            {!!postDate && <Text style={styles.date}>{postDate}</Text>}
          </View>
        </TouchableOpacity>

        {!!item?.category && (
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>{item.category}</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.optionsBtn}
          onPress={() => setShowOptions(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color="#999" />
        </TouchableOpacity>
      </View>

      {/* ── IMAGE ── */}
      <TouchableOpacity
        activeOpacity={0.95}
        onPress={navigateToDetails}
        style={[styles.cardImageContainer, { height: imageHeight }]}
      >
        <Image
          source={{ uri: imageUrl }}
          style={[styles.cardImage, { height: imageHeight }]}
          resizeMode="cover"
          onError={() => console.warn("Failed to load image:", imageUrl)}
        />
        {imagesList.length > 1 && (
          <View style={styles.imageCountBadge}>
            <Ionicons name="images-outline" size={13} color="white" />
            <Text style={styles.imageCountText}>{imagesList.length}</Text>
          </View>
        )}
        {!!item?.condition && (
          <View style={styles.conditionOverlay}>
            <Text style={styles.conditionOverlayText}>{item.condition}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* ── TITLE & DESCRIPTION ── */}
      <TouchableOpacity
        onPress={navigateToDetails}
        activeOpacity={0.85}
        style={styles.cardContent}
      >
        <Text style={styles.title}>{item.title}</Text>
        {!!item?.description && (
          <Text style={styles.description} numberOfLines={2}>
            {item.description}
          </Text>
        )}
      </TouchableOpacity>

      {/* ── ACTION BUTTONS ── */}
      {isOwnItem ? (
        <View style={styles.ownItemBanner}>
          <Ionicons name="person-outline" size={13} color="#AAAAAA" />
          <Text style={styles.ownItemText}>Your listing</Text>
        </View>
      ) : (
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleSendMessage}
            activeOpacity={0.8}
          >
            <Ionicons name="chatbubble-outline" size={15} color={NAVY} />
            <Text style={styles.actionBtnText}>Message</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnTrade]}
            onPress={() => setTradeModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="swap-horizontal" size={15} color={GOLD} />
            <Text style={[styles.actionBtnText, styles.actionBtnTextTrade]}>
              Propose Trade
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── FOOTER STATS ── */}
      <View style={styles.cardFooter}>
        <TouchableOpacity
          style={styles.footerAction}
          onPress={handleLike}
          disabled={likeLoading}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.footerIconWrap,
              isLiked && styles.footerIconWrapLiked,
            ]}
          >
            <Ionicons
              name={isLiked ? "heart" : "heart-outline"}
              size={22}
              color={isLiked ? "#FF4444" : "#555"}
            />
          </View>
          <Text
            style={[styles.footerCount, isLiked && styles.footerCountLiked]}
          >
            {likes}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.footerAction}
          onPress={() => setShowComments(!showComments)}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.footerIconWrap,
              showComments && styles.footerIconWrapActive,
            ]}
          >
            <Ionicons
              name={showComments ? "chatbubble" : "chatbubble-outline"}
              size={21}
              color={showComments ? NAVY : "#555"}
            />
          </View>
          <Text
            style={[
              styles.footerCount,
              showComments && styles.footerCountActive,
            ]}
          >
            {getCommentCount()}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.footerAction}
          onPress={handleSave}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.footerIconWrap,
              isSaved && styles.footerIconWrapSaved,
            ]}
          >
            <FontAwesome
              name={isSaved ? "bookmark" : "bookmark-o"}
              size={20}
              color={isSaved ? NAVY : "#555"}
            />
          </View>
          <Text
            style={[styles.footerCount, isSaved && styles.footerCountSaved]}
          >
            {isSaved ? "Saved" : "Save"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── COMMENTS ── */}
      {showComments && (
        <View style={styles.commentsSection}>
          <Text
            style={styles.commentsTitle}
          >{`Comments (${getCommentCount()})`}</Text>

          {/* Comment input */}
          <View style={styles.commentInputRow}>
            <MiniAvatar
              uri={currentUserPhotoURL}
              name={currentUserName}
              size={36}
              style={styles.commentInputAvatar}
            />
            <View style={styles.commentInputWrap}>
              <TextInput
                style={styles.commentInput}
                placeholder="Write a comment…"
                placeholderTextColor="#aaa"
                value={commentText}
                onChangeText={setCommentText}
                multiline
              />
              <TouchableOpacity
                style={[
                  styles.commentSendBtn,
                  (!commentText.trim() || commentsLoading) &&
                    styles.commentSendBtnDisabled,
                ]}
                onPress={handleAddComment}
                disabled={commentsLoading || !commentText.trim()}
              >
                <Ionicons name="send" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Comment list */}
          {comments.map((comment) => {
            const isCommentLiked = (comment.likedBy || []).includes(
              currentUser,
            );
            const commentAuthorName = resolveCommentName(comment);
            return (
              <View key={comment.id} style={styles.commentItem}>
                <TouchableOpacity
                  onPress={() =>
                    comment.userId &&
                    router.push({
                      pathname: "/user-profile",
                      params: { userId: comment.userId },
                    })
                  }
                  activeOpacity={0.8}
                >
                  <MiniAvatar
                    uri={comment.userAvatar}
                    name={commentAuthorName}
                    size={36}
                    style={styles.commentAvatar}
                  />
                </TouchableOpacity>
                <View style={styles.commentBody}>
                  <View style={styles.commentBubble}>
                    <TouchableOpacity
                      onPress={() =>
                        comment.userId &&
                        router.push({
                          pathname: "/user-profile",
                          params: { userId: comment.userId },
                        })
                      }
                    >
                      <Text style={styles.commentUserName}>
                        {commentAuthorName}
                      </Text>
                    </TouchableOpacity>
                    <Text style={styles.commentText}>{comment.text}</Text>
                  </View>

                  <View style={styles.commentActions}>
                    <TouchableOpacity
                      style={styles.commentActionBtn}
                      onPress={() =>
                        handleCommentLike(comment.id, isCommentLiked)
                      }
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name={isCommentLiked ? "heart" : "heart-outline"}
                        size={16}
                        color={isCommentLiked ? "#FF4444" : "#999"}
                      />
                      <Text
                        style={[
                          styles.commentActionText,
                          isCommentLiked && { color: "#FF4444" },
                        ]}
                      >
                        {comment.likes || 0}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.commentActionBtn}
                      onPress={() =>
                        setReplyingToCommentId(
                          replyingToCommentId === comment.id
                            ? null
                            : comment.id,
                        )
                      }
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name="arrow-undo-outline"
                        size={15}
                        color={NAVY}
                      />
                      <Text
                        style={[styles.commentActionText, { color: NAVY }]}
                      >
                        Reply
                      </Text>
                    </TouchableOpacity>
                    {currentUser === comment.userId && (
                      <TouchableOpacity
                        style={styles.commentActionBtn}
                        onPress={() => handleDeleteComment(comment.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={15}
                          color="#FF6B6B"
                        />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Replies */}
                  {comment.replies && comment.replies.length > 0 && (
                    <View style={styles.repliesContainer}>
                      {comment.replies.map((reply: any) => {
                        const replyAuthorName =
                          reply?.firstName && reply?.lastName
                            ? `${reply.firstName.trim()} ${reply.lastName.trim()}`
                            : reply?.displayName?.trim() ||
                              reply?.name?.trim() ||
                              reply?.userName?.trim() ||
                              reply?.username?.trim() ||
                              "User";
                        return (
                          <View key={reply.id} style={styles.replyItem}>
                            <MiniAvatar
                              uri={reply.userAvatar}
                              name={replyAuthorName}
                              size={28}
                              style={styles.replyAvatar}
                            />
                            <View style={styles.replyBubble}>
                              <Text style={styles.replyUserName}>
                                {replyAuthorName}
                              </Text>
                              <Text style={styles.replyText}>{reply.text}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* Reply input */}
                  {replyingToCommentId === comment.id && (
                    <View style={styles.replyInputRow}>
                      <TextInput
                        style={styles.replyInput}
                        placeholder={`Reply to ${commentAuthorName}…`}
                        placeholderTextColor="#aaa"
                        value={replyText}
                        onChangeText={setReplyText}
                        multiline
                        autoFocus
                      />
                      <TouchableOpacity
                        style={[
                          styles.replySendBtn,
                          (!replyText.trim() || commentsLoading) &&
                            styles.commentSendBtnDisabled,
                        ]}
                        onPress={() => handleAddReply(comment.id)}
                        disabled={commentsLoading || !replyText.trim()}
                      >
                        <Ionicons name="send" size={14} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* ── DELETE TOAST ── */}
      {deleteToastVisible && (
        <View style={styles.deleteToast}>
          <Text style={styles.deleteToastText}>Comment deleted.</Text>
          <TouchableOpacity onPress={handleUndoDelete}>
            <Text style={styles.deleteToastUndo}>Undo</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── OPTIONS MODAL ── */}
      <Modal
        visible={showOptions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOptions(false)}
      >
        <TouchableOpacity
          style={styles.optionsOverlay}
          activeOpacity={1}
          onPress={() => setShowOptions(false)}
        >
          <View style={styles.optionsMenu}>
            <View style={styles.optionsHandle} />
            {isOwnItem ? (
              <TouchableOpacity
                style={styles.optionRow}
                onPress={handleDeletePost}
              >
                <View
                  style={[styles.optionIcon, { backgroundColor: "#FFF0F0" }]}
                >
                  <Ionicons name="trash-outline" size={18} color="#FF4444" />
                </View>
                <View>
                  <Text style={[styles.optionLabel, { color: "#FF4444" }]}>
                    Delete Post
                  </Text>
                  <Text style={styles.optionSub}>
                    Removes listing from explore & trade
                  </Text>
                </View>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={() => handleOpenReport("post")}
                >
                  <View
                    style={[
                      styles.optionIcon,
                      { backgroundColor: "#FFF8EC" },
                    ]}
                  >
                    <Ionicons name="flag-outline" size={18} color={GOLD} />
                  </View>
                  <View>
                    <Text style={styles.optionLabel}>Report Post</Text>
                    <Text style={styles.optionSub}>
                      Flag this listing for review
                    </Text>
                  </View>
                </TouchableOpacity>
                <View style={styles.optionDivider} />
                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={() => handleOpenReport("user")}
                >
                  <View
                    style={[
                      styles.optionIcon,
                      { backgroundColor: "#F0F0FF" },
                    ]}
                  >
                    <Ionicons
                      name="person-remove-outline"
                      size={18}
                      color={NAVY}
                    />
                  </View>
                  <View>
                    <Text style={styles.optionLabel}>Report User</Text>
                    <Text style={styles.optionSub}>
                      Report {ownerDisplayName}'s account
                    </Text>
                  </View>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── REPORT MODAL ── */}
      <Modal
        visible={showReportModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowReportModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.reportOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
        >
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setShowReportModal(false)}
          />
          <View style={styles.reportSheet}>
            <View style={styles.optionsHandle} />
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              <Text style={styles.reportTitle}>
                {reportTarget === "post" ? "Report Post" : "Report User"}
              </Text>
              <Text style={styles.reportSub}>
                {reportTarget === "post"
                  ? "Why are you reporting this listing?"
                  : `Why are you reporting ${ownerDisplayName}?`}
              </Text>
              {REPORT_REASONS.map((reason) => (
                <TouchableOpacity
                  key={reason}
                  style={[
                    styles.reportReasonRow,
                    selectedReason === reason && styles.reportReasonRowSelected,
                  ]}
                  onPress={() => setSelectedReason(reason)}
                >
                  <View
                    style={[
                      styles.reportRadio,
                      selectedReason === reason && styles.reportRadioSelected,
                    ]}
                  >
                    {selectedReason === reason && (
                      <View style={styles.reportRadioInner} />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.reportReasonText,
                      selectedReason === reason && styles.reportReasonTextSelected,
                    ]}
                  >
                    {reason}
                  </Text>
                </TouchableOpacity>
              ))}

              {selectedReason === "Other" && (
                <View style={styles.reportOtherWrapper}>
                  <TextInput
                    style={styles.reportOtherInput}
                    placeholder="Please describe your reason... (required)"
                    placeholderTextColor="#aaa"
                    value={otherText}
                    onChangeText={(t) => setOtherText(t.slice(0, 300))}
                    multiline
                    maxLength={300}
                    autoFocus
                  />
                  <Text style={styles.reportOtherCount}>
                    {otherText.length}/300
                  </Text>
                </View>
              )}

              <View style={styles.reportActions}>
                <TouchableOpacity
                  style={styles.reportCancelBtn}
                  onPress={() => setShowReportModal(false)}
                >
                  <Text style={styles.reportCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.reportSubmitBtn,
                    (!selectedReason ||
                      (selectedReason === "Other" && !otherText.trim()) ||
                      reportSubmitting) &&
                      styles.reportSubmitBtnDisabled,
                  ]}
                  onPress={handleSubmitReport}
                  disabled={
                    !selectedReason ||
                    (selectedReason === "Other" && !otherText.trim()) ||
                    reportSubmitting
                  }
                >
                  {reportSubmitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.reportSubmitText}>Submit Report</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F0F0F5" },

  searchWrapper: {
    marginHorizontal: 16,
    marginTop: 30,
    marginBottom: 4,
    position: "relative",
    zIndex: 9999,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    height: 50,
    borderWidth: 1,
    borderColor: "#E9E9E9",
    paddingHorizontal: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, color: "#242424", fontSize: 15, paddingVertical: 8 },
  searchPopup: {
    position: "absolute",
    top: 54,
    left: 0,
    right: 0,
    borderRadius: 16,
    backgroundColor: "#fff",
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
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 10,
  },
  searchResultLink: { width: "100%" },
  searchResultItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  searchResultText: { fontSize: 14, fontWeight: "600", color: "#111827" },
  searchResultCategory: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  noResultsText: { color: "#6B7280", fontSize: 13 },

  typeFilterRow: {
    flexDirection: "row",
    marginHorizontal: 12,
    marginBottom: 12,
    gap: 8,
    marginTop: 12,
  },
  typeFilterBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    gap: 6,
  },
  typeFilterBtnActive: { backgroundColor: NAVY, borderColor: NAVY },
  typeFilterText: { fontSize: 13, fontWeight: "600", color: "#555" },
  typeFilterTextActive: { color: "#fff" },

  filterRow: {
    flexDirection: "row",
    marginHorizontal: 14,
    marginBottom: 10,
    gap: 8,
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 5,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  filterBtnActive: { backgroundColor: NAVY, borderColor: NAVY },
  filterText: { fontSize: 13, fontWeight: "600", color: NAVY },
  filterTextActive: { color: "#fff" },
  filterDropdown: {
    marginHorizontal: 14,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  dropdownItem: {
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    flexDirection: "row",
    alignItems: "center",
  },
  dropdownItemActive: { backgroundColor: "#F0F0FF" },
  dropdownText: { fontSize: 14, color: "#333" },
  dropdownTextActive: { fontWeight: "700", color: NAVY },

  card: {
    backgroundColor: "#fff",
    marginHorizontal: 12,
    marginBottom: 16,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F5F5F5",
  },
  userInfo: { flexDirection: "row", alignItems: "center", flex: 1 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 10,
    backgroundColor: "#E8E8E8",
  },
  avatarFallback: {
    backgroundColor: NAVY,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: { color: "#fff", fontSize: 16, fontWeight: "800" },
  userDetails: { flex: 1 },
  username: { fontWeight: "700", fontSize: 14, color: "#1F1F1F" },
  date: { fontSize: 11, color: "#9CA3AF", marginTop: 1 },
  categoryBadge: {
    backgroundColor: "#EEF0FF",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 8,
  },
  categoryBadgeText: { fontSize: 11, fontWeight: "700", color: NAVY },
  optionsBtn: { padding: 6 },

  cardImageContainer: {
    position: "relative",
    width: "100%",
    backgroundColor: "#F5F5F5",
  },
  cardImage: { width: "100%", backgroundColor: "#F5F5F5" },
  imageCountBadge: {
    position: "absolute",
    bottom: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  imageCountText: { color: "white", fontSize: 12, fontWeight: "700" },
  conditionOverlay: {
    position: "absolute",
    bottom: 10,
    left: 10,
    backgroundColor: "rgba(47,47,111,0.85)",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  conditionOverlayText: { color: "#fff", fontSize: 11, fontWeight: "700" },

  cardContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10 },
  title: { fontWeight: "700", fontSize: 16, color: "#1F1F1F", marginBottom: 4 },
  description: { fontSize: 13, color: "#6B7280", lineHeight: 18 },

  actionButtons: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#F5F5F5",
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EFF1FF",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    gap: 6,
  },
  actionBtnTrade: {
    backgroundColor: "#FEF9EC",
    borderWidth: 1,
    borderColor: "#F0D98A",
  },
  actionBtnText: { fontSize: 13, fontWeight: "600", color: NAVY },
  actionBtnTextTrade: { color: GOLD },
  ownItemBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#F5F5F5",
    backgroundColor: "#FAFAFA",
  },
  ownItemText: { fontSize: 12, color: "#AAAAAA", fontWeight: "500" },

  cardFooter: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#F5F5F5",
    justifyContent: "space-around",
  },
  footerAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
  },
  footerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F5F5F5",
    justifyContent: "center",
    alignItems: "center",
  },
  footerIconWrapLiked: { backgroundColor: "#FFF0F0" },
  footerIconWrapActive: { backgroundColor: "#EFF1FF" },
  footerIconWrapSaved: { backgroundColor: "#EFF1FF" },
  footerCount: { fontSize: 13, color: "#666", fontWeight: "600", minWidth: 20 },
  footerCountLiked: { color: "#FF4444" },
  footerCountActive: { color: NAVY },
  footerCountSaved: { color: NAVY },

  commentsSection: {
    borderTopWidth: 1,
    borderTopColor: "#F5F5F5",
    padding: 14,
    backgroundColor: "#FAFAFA",
  },
  commentsTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1F1F1F",
    marginBottom: 14,
  },
  commentInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    marginBottom: 16,
  },
  commentInputAvatar: { width: 36, height: 36, borderRadius: 18 },
  commentInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
  },
  commentInput: {
    flex: 1,
    fontSize: 14,
    color: "#111",
    maxHeight: 80,
    paddingVertical: 2,
  },
  commentSendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: NAVY,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 6,
  },
  commentSendBtnDisabled: { opacity: 0.4 },

  commentItem: { flexDirection: "row", marginBottom: 14 },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  commentBody: { flex: 1 },
  commentBubble: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#F0F0F0",
  },
  commentUserName: {
    fontWeight: "700",
    fontSize: 13,
    color: "#1F1F1F",
    marginBottom: 2,
  },
  commentText: { fontSize: 13, color: "#444", lineHeight: 18 },
  commentActions: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 14,
    paddingLeft: 4,
  },
  commentActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  commentActionText: { fontSize: 13, color: "#999", fontWeight: "600" },

  repliesContainer: {
    marginTop: 10,
    marginLeft: 4,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: "#E5E7EB",
  },
  replyItem: { flexDirection: "row", marginBottom: 8 },
  replyAvatar: { width: 28, height: 28, borderRadius: 14, marginRight: 8 },
  replyBubble: {
    flex: 1,
    backgroundColor: "#F5F5FB",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  replyUserName: {
    fontWeight: "700",
    fontSize: 12,
    color: "#1F1F1F",
    marginBottom: 2,
  },
  replyText: { fontSize: 12, color: "#555", lineHeight: 16 },
  replyInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginTop: 8,
    gap: 8,
  },
  replyInput: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    maxHeight: 60,
  },
  replySendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: NAVY,
    justifyContent: "center",
    alignItems: "center",
  },

  deleteToast: {
    position: "absolute",
    top: 16,
    left: 12,
    right: 12,
    backgroundColor: "#1F1F1F",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 1000,
  },
  deleteToastText: { fontSize: 13, color: "#fff", fontWeight: "500", flex: 1 },
  deleteToastUndo: {
    fontSize: 13,
    fontWeight: "700",
    color: GOLD,
    marginLeft: 12,
  },

  optionsOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  optionsMenu: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 36,
  },
  optionsHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#DDD",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 14,
  },
  optionIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  optionLabel: { fontSize: 15, fontWeight: "700", color: "#111" },
  optionSub: { fontSize: 12, color: "#999", marginTop: 1 },
  optionDivider: { height: 1, backgroundColor: "#F3F4F6", marginVertical: 4 },

  reportOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  reportSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 36,
    maxHeight: "90%",
  },
  reportTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111",
    marginBottom: 4,
  },
  reportSub: { fontSize: 13, color: "#888", marginBottom: 16 },
  reportReasonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    gap: 12,
  },
  reportReasonRowSelected: { backgroundColor: "#F8F8FF" },
  reportRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#DDD",
    justifyContent: "center",
    alignItems: "center",
  },
  reportRadioSelected: { borderColor: NAVY },
  reportRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: NAVY,
  },
  reportReasonText: { fontSize: 14, color: "#333", flex: 1 },
  reportReasonTextSelected: { fontWeight: "600", color: NAVY },
  reportActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  reportCancelBtn: { flex: 1, paddingVertical: 13, alignItems: "center" },
  reportCancelText: { fontSize: 14, color: "#888", fontWeight: "600" },
  reportSubmitBtn: {
    flex: 2,
    backgroundColor: NAVY,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  reportSubmitBtnDisabled: { opacity: 0.45 },
  reportSubmitText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  reportOtherWrapper: {
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: NAVY,
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#F8F8FF",
  },
  reportOtherInput: {
    fontSize: 14,
    color: "#111",
    minHeight: 80,
    textAlignVertical: "top",
  },
  reportOtherCount: {
    fontSize: 12,
    color: "#999",
    textAlign: "right",
    marginTop: 6,
  },

  loaderContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, fontSize: 14, color: "#777" },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 60,
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#555" },
  emptyText: { fontSize: 13, color: "#999", textAlign: "center" },
});