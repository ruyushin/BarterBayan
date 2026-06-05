
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../firebaseConfig";

// ─── Constants ────────────────────────────────────────────────────────────────
const DARK_BLUE = "#2f2f6f";
const ACCENT_RED = "#C0392B";
const GOLD = "#C9A227";
const STAR_FILLED = "#F5A623";
const STAR_EMPTY = "#D8D8D8";
const MAX_RATING = 5;

// ─── Types ────────────────────────────────────────────────────────────────────
interface UserData {
  username?: string;
  email?: string;
  phone?: string;
  bio?: string;
  rating?: number;
  ratingCount?: number;
  avatarUrl?: string;
  tradesCount?: number;
  exchangedCount?: number;
  savedCount?: number;
  isVerified?: boolean;
}

interface Review {
  id: string;
  reviewerName: string;
  reviewerAvatar?: string;
  rating: number;
  comment: string;
  createdAt: any;
}

// ─── Report Categories ────────────────────────────────────────────────────────
const REPORT_CATEGORIES: string[] = [
  "Bug",
  "App is slow",
  "Misleading listing",
  "Inappropriate content",
  "Scam or fraud",
  "Other",
];

// ─── Helper: Star Rating Display ─────────────────────────────────────────────
function StarRating({
  rating,
  ratingCount,
  size = 20,
}: {
  rating: number;
  ratingCount?: number;
  size?: number;
}) {
  // When no ratings yet, show all empty stars
  const effectiveRating = (ratingCount ?? 0) > 0 ? rating : 0;

  const stars = Array.from({ length: MAX_RATING }, (_, i) => {
    const filled = i + 1 <= Math.floor(effectiveRating);
    const half = !filled && i < effectiveRating && effectiveRating % 1 >= 0.5;
    return { filled, half, index: i };
  });

  return (
    <View style={ratingStyles.wrapper}>
      <View style={ratingStyles.starsRow}>
        {stars.map(({ filled, half, index }) => (
          <Ionicons
            key={index}
            name={filled ? "star" : half ? "star-half" : "star-outline"}
            size={size}
            color={filled || half ? STAR_FILLED : STAR_EMPTY}
            style={{ marginRight: 2 }}
          />
        ))}
      </View>
      <View style={ratingStyles.ratingInfo}>
        {/* FIX: Only show numeric rating when there are actual reviews */}
        {ratingCount && ratingCount > 0 ? (
          <>
            <Text style={ratingStyles.ratingNumber}>{rating.toFixed(1)}</Text>
            <Text style={ratingStyles.ratingCount}>
              ({ratingCount} {ratingCount === 1 ? "review" : "reviews"})
            </Text>
          </>
        ) : (
          <Text style={ratingStyles.ratingEmpty}>No ratings yet</Text>
        )}
      </View>
    </View>
  );
}

// ─── Helper: Stat Card ───────────────────────────────────────────────────────
function StatCard({
  iconName,
  label,
  count,
  onPress,
}: {
  iconName: string;
  label: string;
  count: number | string;
  onPress?: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () =>
    Animated.spring(scale, { toValue: 0.94, useNativeDriver: true }).start();
  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();

  const inner = (
    <View style={styles.statCard}>
      <Text style={styles.statTopLabel}>{label}</Text>
      <Ionicons name={iconName as any} size={26} color="#2e2d7c" style={{ marginVertical: 2 }} />
      <Text style={styles.statCountNum}>{count}</Text>
      <Text style={styles.statCountLabel}>{label}</Text>
      {/* FIX: Show chevron hint when tappable */}
      {onPress && <Text style={styles.statTapHint}>tap to view</Text>}
    </View>
  );

  if (!onPress) return inner;

  return (
    <Animated.View style={[{ flex: 1 }, { transform: [{ scale }] }]}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        {inner}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Helper: Settings Row ────────────────────────────────────────────────────
function SettingsRow({
  label,
  subtitle,
  danger,
  onPress,
}: {
  label: string;
  subtitle?: string;
  danger?: boolean;
  onPress?: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () =>
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start();
  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={styles.settingsRow}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.7}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.settingsRowLabel, danger && { color: ACCENT_RED }]}
          >
            {label}
          </Text>
          {subtitle ? (
            <Text style={styles.settingsRowSubtitle}>{subtitle}</Text>
          ) : null}
        </View>
        <Text
          style={[styles.settingsRowChevron, danger && { color: ACCENT_RED }]}
        >
          ›
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Overview Modal ───────────────────────────────────────────────────────────
// FIX: Shows real recent reviews pulled from Firestore subcollection
function OverviewModal({
  visible,
  userId,
  userData,
  onClose,
}: {
  visible: boolean;
  userId: string | null;
  userData: UserData | null;
  onClose: () => void;
}) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);

  useEffect(() => {
    if (!visible || !userId) return;

    const fetchReviews = async () => {
      setLoadingReviews(true);
      try {
        const reviewsRef = collection(db, "users", userId, "reviews");
        const q = query(reviewsRef, orderBy("createdAt", "desc"), limit(10));
        const snap = await getDocs(q);
        const fetched: Review[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Review, "id">),
        }));
        setReviews(fetched);
      } catch (err) {
        console.error("Failed to fetch reviews:", err);
      } finally {
        setLoadingReviews(false);
      }
    };

    fetchReviews();
  }, [visible, userId]);

  const ratingValue =
    typeof userData?.rating === "number" ? userData.rating : 0;
  const ratingCount = userData?.ratingCount ?? 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={modalStyles.overlay}>
        <View style={[modalStyles.sheet, { paddingBottom: 32 }]}>
          <Text style={modalStyles.title}>Account Overview</Text>

          {/* Summary */}
          <View style={overviewStyles.summaryRow}>
            <View style={overviewStyles.summaryCard}>
              <Text style={overviewStyles.summaryNum}>
                {ratingCount > 0 ? ratingValue.toFixed(1) : "—"}
              </Text>
              <Text style={overviewStyles.summaryLabel}>Avg. Rating</Text>
            </View>
            <View style={overviewStyles.summaryCard}>
              <Text style={overviewStyles.summaryNum}>{ratingCount}</Text>
              <Text style={overviewStyles.summaryLabel}>Reviews</Text>
            </View>
            <View style={overviewStyles.summaryCard}>
              <Text style={overviewStyles.summaryNum}>
                {userData?.tradesCount ?? 0}
              </Text>
              <Text style={overviewStyles.summaryLabel}>Trades</Text>
            </View>
          </View>

          <Text style={overviewStyles.sectionTitle}>Recent Reviews</Text>

          {loadingReviews ? (
            <ActivityIndicator
              color={DARK_BLUE}
              style={{ marginVertical: 20 }}
            />
          ) : reviews.length === 0 ? (
            <View style={overviewStyles.emptyBox}>
              <Ionicons name="chatbubble-outline" size={36} color="#D8D8D8" style={{ marginBottom: 8 }} />
              <Text style={overviewStyles.emptyText}>
                No reviews yet. Complete trades to earn ratings from other
                traders.
              </Text>
            </View>
          ) : (
            <ScrollView
              style={{ maxHeight: 340 }}
              showsVerticalScrollIndicator={false}
            >
              {reviews.map((r) => (
                <View key={r.id} style={overviewStyles.reviewCard}>
                  <View style={overviewStyles.reviewHeader}>
                    {r.reviewerAvatar ? (
                      <Image
                        source={{ uri: r.reviewerAvatar }}
                        style={overviewStyles.reviewAvatar}
                      />
                    ) : (
                      <View
                        style={[
                          overviewStyles.reviewAvatar,
                          overviewStyles.reviewAvatarPlaceholder,
                        ]}
                      >
                        <Text style={overviewStyles.reviewAvatarInitial}>
                          {(r.reviewerName ?? "?")[0].toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={overviewStyles.reviewerName}>
                        {r.reviewerName}
                      </Text>
                      <View style={overviewStyles.reviewStars}>
                        {Array.from({ length: MAX_RATING }, (_, i) => (
                          <Text
                            key={i}
                            style={{
                              fontSize: 13,
                              color:
                                i + 1 <= r.rating ? STAR_FILLED : STAR_EMPTY,
                            }}
                          >
                            ★
                          </Text>
                        ))}
                      </View>
                    </View>
                    {r.createdAt?.toDate && (
                      <Text style={overviewStyles.reviewDate}>
                        {r.createdAt.toDate().toLocaleDateString("en-PH", {
                          month: "short",
                          day: "numeric",
                        })}
                      </Text>
                    )}
                  </View>
                  {r.comment ? (
                    <Text style={overviewStyles.reviewComment}>
                      {r.comment}
                    </Text>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          )}

          <TouchableOpacity style={modalStyles.cancelBtn} onPress={onClose}>
            <Text style={modalStyles.cancelText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Feedback Modal ───────────────────────────────────────────────────────────
function FeedbackModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [feedback, setFeedback] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!feedback.trim()) {
      Alert.alert(
        "Empty feedback",
        "Please write something before submitting.",
      );
      return;
    }
    // TODO: send feedback to your backend / Firestore
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setFeedback("");
      onClose();
    }, 1500);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={modalStyles.overlay}>
        <View style={modalStyles.sheet}>
          <Text style={modalStyles.title}>Send Feedback</Text>
          <Text style={modalStyles.subtitle}>
            Your thoughts help us improve the app for everyone.
          </Text>
          {submitted ? (
            <View style={modalStyles.successBox}>
              <Text style={modalStyles.successText}>
                Thanks for your feedback!
              </Text>
            </View>
          ) : (
            <>
              <TextInput
                style={modalStyles.input}
                placeholder="Tell us what you think..."
                placeholderTextColor="#AAAAAA"
                multiline
                numberOfLines={5}
                value={feedback}
                onChangeText={setFeedback}
                textAlignVertical="top"
              />
              <TouchableOpacity
                style={modalStyles.submitBtn}
                onPress={handleSubmit}
              >
                <Text style={modalStyles.submitText}>Submit</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity style={modalStyles.cancelBtn} onPress={onClose}>
            <Text style={modalStyles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Report Modal ─────────────────────────────────────────────────────────────
function ReportModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const reset = () => {
    setSelectedCategory(null);
    setDetails("");
    setPhotos([]);
    setSubmitted(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handlePickPhoto = async () => {
    if (photos.length >= 3) {
      Alert.alert("Limit reached", "You can attach up to 3 photos.");
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission required",
        "Please allow access to your photo library in Settings to attach photos.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      quality: 0.7,
    });

    if (!result.canceled && result.assets.length > 0) {
      setPhotos((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!selectedCategory) {
      Alert.alert(
        "No category selected",
        "Please select a category before submitting.",
      );
      return;
    }
    // TODO: upload photos and send report to your backend / Firestore
    setSubmitted(true);
    setTimeout(() => {
      reset();
      onClose();
    }, 1500);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={modalStyles.overlay}>
        <ScrollView
          contentContainerStyle={modalStyles.scrollSheet}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={modalStyles.sheet}>
            <Text style={modalStyles.title}>Report an Issue</Text>
            <Text style={modalStyles.subtitle}>
              Select a category and optionally add details or photos.
            </Text>

            {submitted ? (
              <View style={modalStyles.successBox}>
                <Text style={modalStyles.successText}>
                  Report submitted. Thank you!
                </Text>
              </View>
            ) : (
              <>
                <View style={reportStyles.categoryGrid}>
                  {REPORT_CATEGORIES.map((label) => {
                    const isSelected = selectedCategory === label;
                    return (
                      <TouchableOpacity
                        key={label}
                        style={[
                          reportStyles.categoryPill,
                          isSelected && reportStyles.categoryPillSelected,
                        ]}
                        onPress={() => setSelectedCategory(label)}
                        activeOpacity={0.75}
                      >
                        <Text
                          style={[
                            reportStyles.categoryLabel,
                            isSelected && reportStyles.categoryLabelSelected,
                          ]}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TextInput
                  style={modalStyles.input}
                  placeholder="Add more details (optional)..."
                  placeholderTextColor="#AAAAAA"
                  multiline
                  numberOfLines={4}
                  value={details}
                  onChangeText={setDetails}
                  textAlignVertical="top"
                />

                <Text style={reportStyles.photoLabel}>
                  Attach Photos{" "}
                  <Text style={reportStyles.photoLabelHint}>
                    ({photos.length}/3)
                  </Text>
                </Text>

                <View style={reportStyles.photoRow}>
                  {photos.map((uri, index) => (
                    <View key={uri} style={reportStyles.photoThumbWrapper}>
                      <Image source={{ uri }} style={reportStyles.photoThumb} />
                      <TouchableOpacity
                        style={reportStyles.photoRemoveBtn}
                        onPress={() => handleRemovePhoto(index)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons name="close" size={16} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}

                  {photos.length < 3 && (
                    <TouchableOpacity
                      style={reportStyles.photoAddBtn}
                      onPress={handlePickPhoto}
                      activeOpacity={0.7}
                    >
                      <Text style={reportStyles.photoAddIcon}>+</Text>
                      <Text style={reportStyles.photoAddLabel}>Photo</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity
                  style={modalStyles.submitBtnR}
                  onPress={handleSubmit}
                >
                  <Text style={modalStyles.submitText}>Submit Report</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={modalStyles.cancelBtn}
              onPress={handleClose}
            >
              <Text style={modalStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [overviewVisible, setOverviewVisible] = useState(false);
  const router = useRouter();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  const fetchProfile = useCallback(
    async (currentUser: User) => {
      setLoading(true);
      try {
        const docRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          // Calculate saved count from savedItems array
          const savedItems = data.savedItems || [];
          const savedCount = Array.isArray(savedItems) ? savedItems.length : 0;
          
          setUserData({
            ...data,
            // FIX: ensure rating is always a proper number
            rating:
              typeof data.rating === "number"
                ? data.rating
                : parseFloat(data.rating) || 0,
            ratingCount:
              typeof data.ratingCount === "number" ? data.ratingCount : 0,
            // FIX: calculate saved count from savedItems array
            savedCount: savedCount,
          } as UserData);
          setError(null);
        } else {
          setError("Profile not found in database.");
          setUserData({
            email: currentUser.email ?? undefined,
            username: currentUser.displayName ?? "Unknown User",
            rating: 0,
            ratingCount: 0,
            tradesCount: 0,
            exchangedCount: 0,
            savedCount: 0,
          });
        }
      } catch (err: any) {
        const isOffline =
          err?.code === "unavailable" ||
          /client is offline/i.test(err?.message ?? "");
        setError(
          isOffline
            ? "You appear to be offline. Showing cached data."
            : "Failed to load profile.",
        );
        setUserData({
          email: currentUser.email ?? undefined,
          username: currentUser.displayName ?? "Offline User",
          rating: 0,
          ratingCount: 0,
          tradesCount: 0,
          exchangedCount: 0,
          savedCount: 0,
        });
      } finally {
        setLoading(false);
        // Animate in
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }),
        ]).start();
      }
    },
    [fadeAnim, slideAnim],
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (currentUser: User | null) => {
        setAuthInitialized(true);
        if (!currentUser) {
          router.replace("/login");
          return;
        }
        setUserId(currentUser.uid);
        await fetchProfile(currentUser);
      },
    );
    return () => unsubscribe();
  }, [router, fetchProfile]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace("/login");
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const handleRetry = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      router.replace("/login");
      return;
    }
    setError(null);
    await fetchProfile(currentUser);
  };

  const handleHelpCenter = () => {
    router.push("/Faq" as any);
  };

  // FIX: Navigate to saved posts screen
  const handleSavedPress = () => {
    router.push("/saved-posts" as any);
  };

  if (!authInitialized || loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={DARK_BLUE} />
        <Text style={styles.loadingText}>Loading profile…</Text>
      </View>
    );
  }

  if (error && !userData) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={48} color={ACCENT_RED} style={{ marginBottom: 12 }} />
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.goLoginButton}
          onPress={() => router.replace("/login")}
        >
          <Text style={styles.goLoginText}>Go to Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const ratingValue =
    typeof userData?.rating === "number" ? userData.rating : 0;
  const ratingCount = userData?.ratingCount ?? 0;

  return (
    <View style={styles.container}>
      <FeedbackModal
        visible={feedbackVisible}
        onClose={() => setFeedbackVisible(false)}
      />
      <ReportModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
      />
      {/* FIX: Overview modal now shows real reviews */}
      <OverviewModal
        visible={overviewVisible}
        userId={userId}
        userData={userData}
        onClose={() => setOverviewVisible(false)}
      />

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => router.push("/edit-profile" as any)}
          activeOpacity={0.75}
        >
          <Ionicons name="pencil" size={18} color="#FF6B6B" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
        >
          {error && (
            <TouchableOpacity style={styles.errorBanner} onPress={handleRetry}>
              <Text style={styles.errorBannerText}>
                ⚠️ {error} Tap to retry.
              </Text>
            </TouchableOpacity>
          )}

          {/* ── Avatar + Identity ── */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarWrapper}>
              {userData?.avatarUrl ? (
                <Image
                  source={{ uri: userData.avatarUrl }}
                  style={styles.avatar}
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitial}>
                    {(userData?.username ?? "U")[0].toUpperCase()}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.nameRow}>
              <Text style={styles.username}>{userData?.username ?? "N/A"}</Text>
              {userData?.isVerified && (
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedText}>✔</Text>
                </View>
              )}
            </View>

            <Text style={styles.contactLine}>
              {userData?.phone ?? userData?.email ?? ""}
            </Text>

            {/* FIX: Bio displayed on profile */}
            {userData?.bio ? (
              <Text style={styles.bioText}>{userData.bio}</Text>
            ) : null}

            {/* ── Rating Card ── */}
            <View style={styles.ratingSection}>
              <Text style={styles.ratingTitle}>Trader Rating</Text>
              {/* FIX: Pass ratingCount so StarRating shows correct empty/filled state */}
              <StarRating
                rating={ratingValue}
                ratingCount={ratingCount}
                size={24}
              />
              {ratingCount === 0 && (
                <Text style={styles.ratingNoData}>
                  Complete trades to start earning ratings.
                </Text>
              )}
            </View>

            {/* ── Overview Badge ── */}
            {/* FIX: Opens the Overview modal instead of routing */}
            <TouchableOpacity
              style={styles.overviewBadge}
              onPress={() => setOverviewVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.overviewText}>Overview</Text>
              <Ionicons name="star" size={18} color="#FFB800" />
            </TouchableOpacity>
          </View>

          {/* ── Stats ── */}
          <View style={styles.statsRow}>
            <StatCard
              iconName="swap-horizontal"
              label="Trades"
              count={userData?.tradesCount ?? 0}
            />
            <View style={styles.statDivider} />
            <StatCard
              iconName="arrow-forward"
              label="Exchanged"
              count={userData?.exchangedCount ?? 0}
            />
            <View style={styles.statDivider} />
            {/* FIX: Saved stat card is now tappable → navigates to saved posts */}
            <StatCard
              iconName="bookmark"
              label="Saved"
              count={userData?.savedCount ?? 0}
              onPress={handleSavedPress}
            />
          </View>

          {/* ── Settings ── */}
          <Text style={styles.sectionTitle}>Settings</Text>
          <View style={styles.sectionCard}>
            <SettingsRow
              label="FAQs"
              subtitle="Frequently Asked Questions"
              onPress={handleHelpCenter}
            />
            <SettingsRow
              label="Report an Issue"
              subtitle="Bugs, problems, or violations"
              onPress={() => setReportVisible(true)}
            />
            <SettingsRow
              label="Send Feedback"
              subtitle="Share your thoughts with us"
              onPress={() => setFeedbackVisible(true)}
            />
          </View>

          {/* ── Trust & Safety ── */}
          <View style={styles.sectionCard}>
            <SettingsRow
              label="Trade History"
              subtitle="View all past trades"
              onPress={() => router.push("/trade-history" as any)}
            />
            <SettingsRow label="Log Out" danger onPress={handleLogout} />
          </View>

          {/* ── Account Info Footer ── */}
          <View style={styles.footerCard}>
            <Text style={styles.footerLabel}>Account Email</Text>
            <Text style={styles.footerValue}>{userData?.email ?? "—"}</Text>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4F5F9",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F4F5F9",
  },
  loadingText: {
    color: "#888",
    fontSize: 14,
    marginTop: 12,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: "#F4F5F9",
  },
  errorIcon: { fontSize: 48, marginBottom: 12 },
  errorTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1A1A2E",
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: DARK_BLUE,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 12,
    marginBottom: 12,
  },
  retryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  goLoginButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: DARK_BLUE,
  },
  goLoginText: { color: DARK_BLUE, fontWeight: "700", fontSize: 15 },
  header: {
    backgroundColor: "#2f2f6f",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 15,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  editButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  editButtonText: { fontSize: 16 },
  scrollContent: {
    paddingBottom: 40,
  },
  errorBanner: {
    backgroundColor: "#FFF3CD",
    padding: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: "#F5A623",
  },
  errorBannerText: {
    color: "#856404",
    fontSize: 13,
    fontWeight: "500",
  },
  avatarSection: {
    alignItems: "center",
    marginTop: 44,
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  avatarWrapper: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 4,
    borderColor: "#fff",
    overflow: "hidden",
    backgroundColor: "#ddd",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  avatar: { width: "100%", height: "100%" },
  avatarPlaceholder: {
    flex: 1,
    backgroundColor: DARK_BLUE,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: { color: "#fff", fontSize: 34, fontWeight: "800" },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 7,
  },
  username: {
    fontSize: 21,
    fontWeight: "800",
    color: "#1A1A2E",
    letterSpacing: 0.2,
  },
  verifiedBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#1877F2",
    justifyContent: "center",
    alignItems: "center",
  },
  verifiedText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  contactLine: {
    color: "#888",
    fontSize: 13.5,
    marginTop: 3,
  },
  // FIX: Bio text style
  bioText: {
    color: "#555",
    fontSize: 13.5,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 19,
    paddingHorizontal: 12,
    fontStyle: "italic",
  },
  ratingSection: {
    alignItems: "center",
    marginTop: 16,
    marginBottom: 4,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 24,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    width: "100%",
  },
  ratingTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  ratingNoData: {
    fontSize: 12,
    color: "#AAAAAA",
    marginTop: 8,
    fontStyle: "italic",
    textAlign: "center",
  },
  overviewBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GOLD,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 20,
    marginTop: 14,
    gap: 6,
    elevation: 4,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
  },
  overviewText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
    letterSpacing: 0.3,
  },
  overviewStar: { fontSize: 14 },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: 16,
    marginVertical: 18,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 8,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  statDivider: {
    width: 1,
    height: 50,
    backgroundColor: "#ECECEC",
  },
  statTopLabel: {
    fontSize: 11,
    color: "#999",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statEmoji: { fontSize: 26, marginVertical: 2 },
  statCountNum: {
    fontSize: 17,
    fontWeight: "800",
    color: DARK_BLUE,
  },
  statCountLabel: {
    fontSize: 11,
    color: "#999",
    fontWeight: "500",
  },
  // FIX: "tap to view" hint on tappable stat cards
  statTapHint: {
    fontSize: 9,
    color: GOLD,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1A1A2E",
    marginHorizontal: 20,
    marginBottom: 8,
    marginTop: 2,
  },
  sectionCard: {
    marginHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: 14,
    marginBottom: 20,
    overflow: "hidden",
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  settingsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ECECEC",
  },
  settingsRowLabel: {
    fontSize: 15,
    color: "#1A1A2E",
    fontWeight: "600",
  },
  settingsRowSubtitle: {
    fontSize: 12,
    color: "#AAAAAA",
    marginTop: 2,
  },
  settingsRowChevron: {
    fontSize: 22,
    color: "#CCCCCC",
  },
  footerCard: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 18,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  footerLabel: {
    fontSize: 11,
    color: "#AAAAAA",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  footerValue: {
    fontSize: 14,
    color: "#333",
    fontWeight: "500",
  },
});

// ─── Rating Sub-Styles ────────────────────────────────────────────────────────
const ratingStyles = StyleSheet.create({
  wrapper: { alignItems: "center", gap: 6 },
  starsRow: { flexDirection: "row", gap: 3 },
  star: { lineHeight: 30 },
  ratingInfo: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  ratingNumber: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1A1A2E",
  },
  ratingCount: {
    fontSize: 12,
    color: "#AAAAAA",
    fontWeight: "500",
  },
  // FIX: Style for the empty rating state
  ratingEmpty: {
    fontSize: 14,
    color: "#CCCCCC",
    fontWeight: "500",
    fontStyle: "italic",
  },
});

// ─── Modal Styles ─────────────────────────────────────────────────────────────
const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  scrollSheet: {
    justifyContent: "flex-end",
    flexGrow: 1,
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 28,
    paddingBottom: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1A1A2E",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: "#888",
    marginBottom: 16,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: "#1A1A2E",
    height: 100,
    backgroundColor: "#FAFAFA",
    marginBottom: 16,
  },
  submitBtn: {
    backgroundColor: DARK_BLUE,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  submitBtnR: {
    backgroundColor: "#7c0303",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  submitText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  cancelBtn: { paddingVertical: 12, alignItems: "center" },
  cancelText: { color: "#888", fontWeight: "600", fontSize: 14 },
  successBox: {
    paddingVertical: 32,
    alignItems: "center",
  },
  successText: { fontSize: 18, fontWeight: "700", color: "#1A1A2E" },
});

// ─── Report-specific Styles ───────────────────────────────────────────────────
const reportStyles = StyleSheet.create({
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  categoryPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    backgroundColor: "#FAFAFA",
  },
  categoryPillSelected: {
    borderColor: DARK_BLUE,
    backgroundColor: "#ECEDF8",
  },
  categoryLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#555",
  },
  categoryLabelSelected: {
    color: DARK_BLUE,
  },
  photoLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 10,
  },
  photoLabelHint: {
    fontWeight: "500",
    color: "#AAAAAA",
  },
  photoRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  photoThumbWrapper: {
    position: "relative",
    width: 72,
    height: 72,
  },
  photoThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: "#E0E0E0",
  },
  photoRemoveBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: ACCENT_RED,
    justifyContent: "center",
    alignItems: "center",
    elevation: 3,
  },
  photoRemoveText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 12,
  },
  photoAddBtn: {
    width: 72,
    height: 72,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#D0D0D0",
    borderStyle: "dashed",
    backgroundColor: "#FAFAFA",
    justifyContent: "center",
    alignItems: "center",
    gap: 2,
  },
  photoAddIcon: {
    fontSize: 22,
    color: "#AAAAAA",
    lineHeight: 26,
  },
  photoAddLabel: {
    fontSize: 11,
    color: "#AAAAAA",
    fontWeight: "600",
  },
});

// ─── Overview Modal Styles ────────────────────────────────────────────────────
const overviewStyles = StyleSheet.create({
  summaryRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
    marginTop: 4,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#F4F5F9",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  summaryNum: {
    fontSize: 22,
    fontWeight: "800",
    color: DARK_BLUE,
  },
  summaryLabel: {
    fontSize: 11,
    color: "#888",
    fontWeight: "600",
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  emptyBox: {
    alignItems: "center",
    paddingVertical: 28,
    gap: 8,
  },
  emptyEmoji: { fontSize: 36 },
  emptyText: {
    fontSize: 13,
    color: "#AAAAAA",
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 16,
    fontStyle: "italic",
  },
  reviewCard: {
    backgroundColor: "#F9F9FB",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  reviewAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#ddd",
  },
  reviewAvatarPlaceholder: {
    backgroundColor: DARK_BLUE,
    justifyContent: "center",
    alignItems: "center",
  },
  reviewAvatarInitial: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  reviewerName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1A1A2E",
  },
  reviewStars: {
    flexDirection: "row",
    gap: 1,
    marginTop: 2,
  },
  reviewDate: {
    fontSize: 11,
    color: "#AAAAAA",
    fontWeight: "500",
  },
  reviewComment: {
    fontSize: 13,
    color: "#555",
    lineHeight: 18,
    marginLeft: 46,
  },
});
