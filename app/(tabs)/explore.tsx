import { FontAwesome, Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth } from "../../firebaseConfig";
import {
  addComment,
  addCommentReply,
  deleteComment,
  getAllItems,
  getUserSavedItems,
  updateCommentLike,
  updateItemLikes,
  updateItemSave,
} from "../../services/itemService";
import { sendMessage } from "../../services/messagingService";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

/* ---------------- DATA ---------------- */

const FILTER_CATEGORIES = [
  "All",
  "Electronics",
  "Fashion",
  "Living",
  "School/Office",
  "Household",
];

/* ---------------- COMPONENT ---------------- */

export default function Screen() {
  const params = useLocalSearchParams<{ filter?: string; search?: string }>();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sortType, setSortType] = useState("none");
  const [filter, setFilter] = useState("All");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Setup auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch items from Firebase on component mount
  useEffect(() => {
    const fetchItems = async () => {
      try {
        setLoading(true);
        const items = await getAllItems();
        setAllItems(items);
      } catch (error) {
        console.error("Error fetching items:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, [refreshKey, userId]);

  // Handle search from params (passed from home screen)
  useEffect(() => {
    if (
      typeof params.filter === "string" &&
      FILTER_CATEGORIES.includes(params.filter)
    ) {
      setFilter(params.filter);
    } else {
      setFilter("All");
    }

    if (typeof params.search === "string") {
      setSearch(params.search);
    }
  }, [params.filter, params.search]);

  /* ---------- LOGIC ---------- */

  const filteredItems = allItems
    .filter((item) => {
      const matchSearch =
        search.length === 0 ||
        (item.title &&
          item.title.toLowerCase().includes(search.toLowerCase())) ||
        (item.description &&
          item.description.toLowerCase().includes(search.toLowerCase()));

      const matchFilter = filter === "All" || item.category === filter;

      return matchSearch && matchFilter;
    })
    .sort((a, b) => {
      if (sortType === "likes") return (b.likes || 0) - (a.likes || 0);
      if (sortType === "name")
        return (a.title || "").localeCompare(b.title || "");
      return 0;
    });

  /* ---------- BUTTON ACTIONS ---------- */

  const handleSort = () => {
    setSortType((prev) =>
      prev === "none" ? "likes" : prev === "likes" ? "name" : "none",
    );
  };

  const handleFilterToggle = () => {
    setIsFilterOpen((prev) => !prev);
  };

  const handleCategorySelect = (category: string) => {
    setFilter(category);
    setIsFilterOpen(false);
  };

  /* ---------- UI ---------- */

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#5D5FEF" />
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
            onCommentAdded={() => setRefreshKey((prev) => prev + 1)}
          />
        )}
        ListHeaderComponent={
          <>
            {/* SEARCH */}
            <View style={styles.searchContainer}>
              <Ionicons
                name="search-outline"
                size={20}
                color="#5B5B7B"
                style={styles.searchIcon}
              />
              <TextInput
                placeholder="Search for items..."
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
              />
            </View>

            {/* FILTER BUTTONS */}
            <View style={styles.filterRow}>
              <Pressable style={styles.filterBtn} onPress={handleSort}>
                <Text style={styles.filterText}>Sort ({sortType})</Text>
                <Ionicons name="swap-vertical" size={14} />
              </Pressable>

              <Pressable style={styles.filterBtn} onPress={handleFilterToggle}>
                <Text style={styles.filterText}>Filter ({filter})</Text>
                <Ionicons
                  name={isFilterOpen ? "chevron-up" : "chevron-down"}
                  size={14}
                />
              </Pressable>
            </View>
            {isFilterOpen && (
              <View style={styles.filterDropdown}>
                {FILTER_CATEGORIES.map((category) => (
                  <Pressable
                    key={category}
                    onPress={() => handleCategorySelect(category)}
                    style={styles.dropdownItem}
                  >
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
            <Text style={styles.emptyText}>
              No items found. Try adjusting your search or filters.
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

/* ---------------- CARD ---------------- */

function ItemCard({ item, onCommentAdded }: any) {
  const [isLiked, setIsLiked] = useState(false);
  const [likes, setLikes] = useState(item.likes || 0);
  const [isSaved, setIsSaved] = useState(false);
  const [comments, setComments] = useState<any[]>(item.comments || []);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [loading, setLoading] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [showImageGallery, setShowImageGallery] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(
    null,
  );
  const [replyText, setReplyText] = useState("");
  const [deleteToastVisible, setDeleteToastVisible] = useState(false);
  const [deletedCommentData, setDeletedCommentData] = useState<any>(null);
  const deleteTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentUser = auth.currentUser?.uid;
  const currentUserName = auth.currentUser?.displayName || "Anonymous";
  const currentUserPhotoURL =
    auth.currentUser?.photoURL || "https://i.pravatar.cc/150?img=1";

  // Get images array
  const imagesList =
    Array.isArray(item?.images) && item.images.length > 0
      ? item.images
      : [item?.image || "https://via.placeholder.com/400x200"];

  const imageUrl = imagesList[0];

  useEffect(() => {
    if (currentUser && item?.likedBy?.includes(currentUser)) {
      setIsLiked(true);
    }
    checkIfSaved();
  }, [item, currentUser]);

  const checkIfSaved = async () => {
    if (!currentUser) return;
    try {
      const saved = await getUserSavedItems(currentUser);
      setIsSaved(saved.some((s) => s.id === item.id));
    } catch (error) {
      console.error("Error checking saved items:", error);
    }
  };

  const handleLike = async () => {
    if (!currentUser) {
      Alert.alert("Please log in", "You must be logged in to like items");
      return;
    }

    try {
      setLoading(true);
      await updateItemLikes(item.id, currentUser, !isLiked);
      setIsLiked(!isLiked);
      setLikes(isLiked ? likes - 1 : likes + 1);
    } catch (error) {
      Alert.alert("Error", "Failed to update like status");
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!currentUser) {
      Alert.alert("Please log in", "You must be logged in to save items");
      return;
    }

    try {
      setCommentsLoading(true);
      await updateItemSave(item.id, currentUser, !isSaved);
      setIsSaved(!isSaved);
      Alert.alert(
        "Success",
        isSaved ? "Item removed from saved" : "Item saved successfully",
      );
    } catch (error) {
      Alert.alert("Error", "Failed to save item");
      console.error("Error:", error);
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!currentUser) {
      Alert.alert("Please log in", "You must be logged in to send messages");
      return;
    }

    if (currentUser === item.ownerId) {
      Alert.alert("Cannot message", "You cannot message yourself");
      return;
    }

    try {
      setCommentsLoading(true);
      await sendMessage(
        currentUser,
        item.ownerId,
        `Hi, I'm interested in your ${item.title}`,
        item.id,
      );
      Alert.alert("Message sent", "Your message has been sent successfully");
      router.push("/inbox");
    } catch (error) {
      Alert.alert("Error", "Failed to send message");
      console.error("Error:", error);
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleSaveImage = async () => {
    try {
      const currentImage = imagesList[currentImageIndex];
      await Share.share({
        url: currentImage,
        message: `Check out this image from ${item.title}`,
        title: item.title,
      });
    } catch (error) {
      Alert.alert("Error", "Failed to save image");
      console.error("Error:", error);
    }
  };

  const handleAddComment = async () => {
    if (!currentUser || !commentText.trim()) {
      if (!currentUser)
        Alert.alert("Please log in", "You must be logged in to comment");
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
      onCommentAdded();
    } catch (error) {
      Alert.alert("Error", "Failed to add comment");
      console.error("Error:", error);
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleAddReply = async (commentId: string) => {
    if (!currentUser || !replyText.trim()) {
      if (!currentUser)
        Alert.alert("Please log in", "You must be logged in to reply");
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
      const updatedComments = comments.map((c) => {
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
      });
      setComments(updatedComments);
      setReplyText("");
      setReplyingToCommentId(null);
      onCommentAdded();
    } catch (error) {
      Alert.alert("Error", "Failed to add reply");
      console.error("Error:", error);
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleCommentLike = async (
    commentId: string,
    commentLiked: boolean,
  ) => {
    if (!currentUser) {
      Alert.alert("Please log in", "You must be logged in to like comments");
      return;
    }

    try {
      await updateCommentLike(item.id, commentId, currentUser, !commentLiked);
      const updatedComments = comments.map((c) => {
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
      });
      setComments(updatedComments);
    } catch (error) {
      Alert.alert("Error", "Failed to update comment like");
      console.error("Error:", error);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      const commentToDeleteObj = comments.find((c) => c.id === commentId);
      await deleteComment(item.id, commentId);
      setComments(comments.filter((c) => c.id !== commentId));
      
      // Show delete toast with undo option
      setDeletedCommentData(commentToDeleteObj);
      setDeleteToastVisible(true);
      
      // Auto-dismiss after 5 seconds
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = setTimeout(() => {
        setDeleteToastVisible(false);
      }, 5000);
    } catch (error) {
      Alert.alert("Error", "Failed to delete comment");
      console.error("Error:", error);
    }
  };

  const handleUndoDelete = async () => {
    if (!deletedCommentData) return;
    try {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      setDeleteToastVisible(false);
      
      // Re-add the comment
      setComments([...comments, deletedCommentData]);
      setDeletedCommentData(null);
      
      // Re-upload to Firebase
      await addComment(
        item.id,
        deletedCommentData.userId,
        deletedCommentData.text,
        deletedCommentData.userName,
        deletedCommentData.userAvatar,
      );
    } catch (error) {
      Alert.alert("Error", "Failed to undo delete");
      console.error("Error:", error);
    }
  };

  const getTopLevelCommentCount = () => {
    // Count all comments + all replies
    return comments.reduce((count, c) => {
      return count + 1 + (c.replies?.length || 0);
    }, 0);
  };

  return (
    <View style={styles.card}>
      {/* HEADER */}
      <View style={styles.cardHeader}>
        <View style={styles.userInfo}>
          <Image
            source={{
              uri: item.userAvatar || "https://i.pravatar.cc/150?img=1",
            }}
            style={styles.avatar}
          />
          <View style={styles.userDetails}>
            <Text style={styles.username}>
              {item.userName || "Unknown User"}
            </Text>
            <Text style={styles.date}>
              {item.date || new Date().toLocaleDateString()}
            </Text>
          </View>
        </View>
        <View style={styles.badgeContainer}>
          <Ionicons name="ribbon" size={18} color="#FFC107" />
        </View>
      </View>

      {/* IMAGE - TOUCHABLE FOR GALLERY */}
      <TouchableOpacity
        style={styles.cardImageContainer}
        onPress={() => setShowImageGallery(true)}
      >
        <Image source={{ uri: imageUrl }} style={styles.cardImage} />
        {imagesList.length > 1 && (
          <View style={styles.imageCountBadge}>
            <Text style={styles.imageCountText}>{imagesList.length}</Text>
            <Ionicons name="image" size={12} color="white" />
          </View>
        )}
      </TouchableOpacity>

      {/* IMAGE GALLERY MODAL */}
      <Modal
        visible={showImageGallery}
        transparent
        statusBarTranslucent
        onRequestClose={() => setShowImageGallery(false)}
      >
        <View style={styles.galleryContainer}>
          <ScrollView
            horizontal
            pagingEnabled
            onMomentumScrollEnd={(e) => {
              const contentOffsetX = e.nativeEvent.contentOffset.x;
              const currentIndex = Math.round(contentOffsetX / screenWidth);
              setCurrentImageIndex(currentIndex);
            }}
            style={styles.imageScroller}
          >
            {imagesList.map((img, idx) => (
              <Image
                key={idx}
                source={{ uri: img }}
                style={{
                  width: screenWidth,
                  height: screenHeight,
                  resizeMode: "contain",
                }}
              />
            ))}
          </ScrollView>

          {/* GALLERY CONTROLS */}
          <View style={styles.galleryControls}>
            <TouchableOpacity
              style={styles.galleryBtn}
              onPress={handleSaveImage}
            >
              <Ionicons name="download" size={24} color="white" />
            </TouchableOpacity>
            <Text style={styles.imageCounter}>
              {currentImageIndex + 1} / {imagesList.length}
            </Text>
            <TouchableOpacity
              style={styles.galleryBtn}
              onPress={() => setShowImageGallery(false)}
            >
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* TITLE & DESCRIPTION */}
      <View style={styles.cardContent}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.description}>{item.description}</Text>
      </View>

      {/* ACTION BUTTONS */}
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handleSendMessage}
          disabled={commentsLoading}
        >
          <Ionicons name="send" size={14} color="#5D5FEF" />
          <Text style={styles.actionBtnText}>Message</Text>
        </TouchableOpacity>
      </View>

      {/* FOOTER STATS */}
      <View style={styles.cardFooter}>
        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Pressable onPress={handleLike} disabled={loading}>
              <Ionicons
                name={isLiked ? "heart" : "heart-outline"}
                size={18}
                color={isLiked ? "#FF4444" : "#666"}
              />
            </Pressable>
            <Text style={styles.statText}>{likes}</Text>
          </View>

          <Pressable
            style={styles.stat}
            onPress={() => setShowComments(!showComments)}
          >
            <Ionicons name="chatbubble-outline" size={18} color="#666" />
            <Text style={styles.statText}>{getTopLevelCommentCount()}</Text>
          </Pressable>

          <Pressable
            style={styles.stat}
            onPress={handleSave}
            disabled={commentsLoading}
          >
            <FontAwesome
              name={isSaved ? "bookmark" : "bookmark-o"}
              size={16}
              color={isSaved ? "#5D5FEF" : "#666"}
            />
            <Text style={styles.statText}>{isSaved ? "Saved" : "Save"}</Text>
          </Pressable>
        </View>
      </View>

      {/* COMMENTS SECTION */}
      {showComments && (
        <View style={styles.commentsSection}>
          <Text style={styles.commentsTitle}>Comments ({getTopLevelCommentCount()})</Text>

          {/* COMMENT INPUT */}
          <View style={styles.commentInputContainer}>
            <TextInput
              style={styles.commentInput}
              placeholder="Add a comment..."
              value={commentText}
              onChangeText={setCommentText}
              multiline
            />
            <TouchableOpacity
              style={styles.commentSendBtn}
              onPress={handleAddComment}
              disabled={commentsLoading || !commentText.trim()}
            >
              <Ionicons name="send" size={16} color="#5D5FEF" />
            </TouchableOpacity>
          </View>

          {/* COMMENTS LIST */}
          <FlatList
            data={comments}
            keyExtractor={(c) => c.id}
            scrollEnabled={false}
            renderItem={({ item: comment }) => {
              const isCommentLiked = (comment.likedBy || []).includes(
                currentUser,
              );
              return (
                <View style={styles.commentItem}>
                  <Image
                    source={{
                      uri:
                        comment.userAvatar || "https://i.pravatar.cc/150?img=1",
                    }}
                    style={styles.commentAvatar}
                  />
                  <View style={styles.commentContent}>
                    <Text style={styles.commentUserName}>
                      {comment.userName}
                    </Text>
                    <Text style={styles.commentText}>{comment.text}</Text>
                    <View style={styles.commentActions}>
                      <Pressable
                        onPress={() =>
                          handleCommentLike(comment.id, isCommentLiked)
                        }
                        style={styles.commentLikeBtn}
                      >
                        <Ionicons
                          name={isCommentLiked ? "heart" : "heart-outline"}
                          size={14}
                          color={isCommentLiked ? "#FF4444" : "#999"}
                        />
                        <Text style={styles.commentLikeText}>
                          {comment.likes || 0}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          setReplyingToCommentId(
                            replyingToCommentId === comment.id
                              ? null
                              : comment.id,
                          )
                        }
                        style={styles.commentReplyBtn}
                      >
                        <Ionicons name="arrow-redo" size={14} color="#5D5FEF" />
                        <Text style={styles.commentReplyText}>Reply</Text>
                      </Pressable>
                      {currentUser === comment.userId && (
                        <Pressable
                          onPress={() => handleDeleteComment(comment.id)}
                          style={styles.commentDeleteBtn}
                        >
                          <Ionicons name="trash" size={14} color="#FF6B6B" />
                        </Pressable>
                      )}
                    </View>

                    {/* REPLIES */}
                    {comment.replies && comment.replies.length > 0 && (
                      <View style={styles.repliesContainer}>
                        {comment.replies.map((reply: any) => (
                          <View key={reply.id} style={styles.replyItem}>
                            <Image
                              source={{
                                uri:
                                  reply.userAvatar ||
                                  "https://i.pravatar.cc/150?img=1",
                              }}
                              style={styles.replyAvatar}
                            />
                            <View style={styles.replyContent}>
                              <Text style={styles.replyUserName}>
                                {reply.userName}
                              </Text>
                              <Text style={styles.replyText}>{reply.text}</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* REPLY INPUT */}
                    {replyingToCommentId === comment.id && (
                      <View style={styles.replyInputContainer}>
                        <TextInput
                          style={styles.replyInput}
                          placeholder="Write a reply..."
                          value={replyText}
                          onChangeText={setReplyText}
                          multiline
                        />
                        <TouchableOpacity
                          style={styles.replySendBtn}
                          onPress={() => handleAddReply(comment.id)}
                          disabled={commentsLoading || !replyText.trim()}
                        >
                          <Ionicons name="send" size={14} color="#5D5FEF" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              );
            }}
          />
        </View>
      )}

      {/* DELETE COMMENT MODAL - REMOVED */}
      {/* Toast notification is shown instead of modal */}

      {/* DELETE TOAST NOTIFICATION */}
      {deleteToastVisible && (
        <View style={styles.deleteToast}>
          <Text style={styles.deleteToastText}>1 comment deleted. Tap to undo.</Text>
          <TouchableOpacity onPress={handleUndoDelete}>
            <Text style={styles.deleteToastUndo}>Undo</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

/* ... existing code ... */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ECECEC" },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: 14,
    height: 48,
    borderWidth: 1,
    borderColor: "#E9E9E9",
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 16,
  },

  searchIcon: {
    marginRight: 10,
  },

  searchInput: {
    flex: 1,
    color: "#242424",
    fontSize: 15,
    paddingVertical: 8,
  },

  filterRow: {
    flexDirection: "row",
    marginHorizontal: 15,
    marginBottom: 10,
  },

  filterBtn: {
    flexDirection: "row",
    backgroundColor: "#D9D9D9",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginRight: 10,
    alignItems: "center",
  },

  filterText: { marginRight: 5, fontSize: 13 },

  filterDropdown: {
    marginHorizontal: 15,
    backgroundColor: "white",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DDD",
    overflow: "hidden",
    marginBottom: 10,
  },

  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 15,
  },

  dropdownText: {
    fontSize: 13,
    color: "#333",
  },

  dropdownTextActive: {
    fontWeight: "700",
    color: "#5E3EA1",
  },

  card: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 12,
    marginBottom: 16,
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },

  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },

  userDetails: {
    flex: 1,
  },

  username: {
    fontWeight: "700",
    fontSize: 14,
    color: "#1F1F1F",
  },

  date: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },

  badgeContainer: {
    padding: 6,
  },

  cardImage: {
    width: "100%",
    height: 220,
    backgroundColor: "#F5F5F5",
  },

  cardImageContainer: {
    position: "relative",
    width: "100%",
    height: 220,
    backgroundColor: "#F5F5F5",
  },

  imageCountBadge: {
    position: "absolute",
    bottom: 10,
    right: 10,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  imageCountText: {
    color: "white",
    fontSize: 12,
    fontWeight: "700",
  },

  galleryContainer: {
    flex: 1,
    backgroundColor: "#000",
  },

  imageScroller: {
    flex: 1,
  },

  galleryControls: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
  },

  galleryBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },

  imageCounter: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    flex: 1,
  },

  cardContent: {
    padding: 14,
  },

  title: {
    fontWeight: "700",
    fontSize: 16,
    color: "#1F1F1F",
    marginBottom: 6,
  },

  description: {
    fontSize: 13,
    color: "#666",
    lineHeight: 18,
  },

  actionButtons: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },

  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EFF1FF",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: "flex-start",
  },

  actionBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#5D5FEF",
    marginLeft: 6,
  },

  cardFooter: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },

  statRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },

  stat: {
    alignItems: "center",
    paddingHorizontal: 12,
  },

  statText: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },

  commentsSection: {
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
    padding: 14,
    backgroundColor: "#FAFAFA",
  },

  commentsTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1F1F1F",
    marginBottom: 12,
  },

  commentInputContainer: {
    flexDirection: "row",
    marginBottom: 14,
    gap: 8,
  },

  commentInput: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    maxHeight: 80,
  },

  commentSendBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#EFF1FF",
    alignItems: "center",
    justifyContent: "center",
  },

  commentItem: {
    flexDirection: "row",
    marginBottom: 12,
  },

  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
  },

  commentContent: {
    flex: 1,
  },

  commentUserName: {
    fontWeight: "700",
    fontSize: 13,
    color: "#1F1F1F",
  },

  commentText: {
    fontSize: 12,
    color: "#555",
    marginTop: 4,
    lineHeight: 16,
  },

  commentActions: {
    flexDirection: "row",
    marginTop: 6,
    gap: 12,
  },

  commentLikeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  commentLikeText: {
    fontSize: 11,
    color: "#999",
  },

  commentDeleteBtn: {
    padding: 4,
  },

  commentReplyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  commentReplyText: {
    fontSize: 11,
    color: "#5D5FEF",
    fontWeight: "600",
  },

  repliesContainer: {
    marginTop: 10,
    marginLeft: 10,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: "#E0E0E0",
  },

  replyItem: {
    flexDirection: "row",
    marginBottom: 10,
  },

  replyAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
  },

  replyContent: {
    flex: 1,
  },

  replyUserName: {
    fontWeight: "600",
    fontSize: 12,
    color: "#1F1F1F",
  },

  replyText: {
    fontSize: 11,
    color: "#555",
    marginTop: 2,
    lineHeight: 14,
  },

  replyInputContainer: {
    flexDirection: "row",
    marginTop: 10,
    gap: 6,
  },

  replyInput: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    maxHeight: 60,
  },

  replySendBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#EFF1FF",
    alignItems: "center",
    justifyContent: "center",
  },

  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: "#777",
  },

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 50,
  },

  emptyText: {
    fontSize: 14,
    color: "#777",
    textAlign: "center",
  },

  nav: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: "#DDD",
    backgroundColor: "white",
    paddingVertical: 8,
  },

  navItem: { flex: 1, alignItems: "center" },
  navText: { fontSize: 10, color: "#777" },

  deleteModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },

  deleteModalContent: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 24,
    width: "80%",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },

  deleteModalHeader: {
    marginBottom: 16,
  },

  deleteModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F1F1F",
    marginBottom: 8,
  },

  deleteModalText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 20,
  },

  deleteModalButtons: {
    flexDirection: "row",
    width: "100%",
    gap: 12,
  },

  deleteModalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  deleteModalBtnCancel: {
    backgroundColor: "#F0F0F0",
  },

  deleteModalBtnDelete: {
    backgroundColor: "#FF6B6B",
  },

  deleteModalBtnTextCancel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },

  deleteModalBtnTextDelete: {
    fontSize: 14,
    fontWeight: "600",
    color: "white",
  },

  deleteToast: {
    position: "absolute",
    top: 20,
    left: 12,
    right: 12,
    backgroundColor: "#2C2C2C",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
    zIndex: 1000,
  },

  deleteToastText: {
    fontSize: 14,
    color: "white",
    fontWeight: "500",
    flex: 1,
  },

  deleteToastUndo: {
    fontSize: 14,
    fontWeight: "600",
    color: "#5D5FEF",
    marginLeft: 12,
  },
});

