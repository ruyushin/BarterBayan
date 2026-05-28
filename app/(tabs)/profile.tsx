import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
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
  firstName?: string;
  middleName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  bio?: string;
  rating?: number;
  ratingCount?: number;
  photo?: string;
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

// ─── Cross-platform Modal ─────────────────────────────────────────────────────
// React Native's <Modal> is not supported on Expo Web; this renders an
// absolutely-positioned overlay that works on web + iOS + Android.
function AppModal({
  visible,
  onRequestClose,
  children,
}: {
  visible: boolean;
  onRequestClose?: () => void;
  children: React.ReactNode;
}) {
  if (!visible) return null;
  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        elevation: 99,
      }}
    >
      {children}
    </View>
  );
}

// ─── Helper: Get display name ─────────────────────────────────────────────────
function getDisplayName(userData: UserData | null): string {
  if (!userData) return "N/A";
  const parts = [
    userData.firstName,
    userData.middleName,
    userData.lastName,
  ].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return userData.username ?? "N/A";
}

// ─── Helper: Get avatar initials ──────────────────────────────────────────────
function getInitials(userData: UserData | null): string {
  if (!userData) return "?";
  const first = userData.firstName?.[0] ?? "";
  const last = userData.lastName?.[0] ?? "";
  if (first || last) return (first + last).toUpperCase();
  return (userData.username?.[0] ?? "U").toUpperCase();
}

// ─── Helper: Get avatar URI ───────────────────────────────────────────────────
function getAvatarUri(userData: UserData | null): string | null {
  if (!userData) return null;
  const uri = userData.avatarUrl || userData.photo || null;
  if (!uri || uri.trim() === "") return null;
  return uri;
}

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
  iconName: keyof typeof Ionicons.glyphMap;
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
      <Ionicons name={iconName} size={26} color={DARK_BLUE} style={{ marginBottom: 4 }} />
      <Text style={styles.statCountNum}>{count}</Text>
      <Text style={styles.statCountLabel}>{label}</Text>
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
  iconName,
  label,
  subtitle,
  danger,
  onPress,
}: {
  iconName: keyof typeof Ionicons.glyphMap;
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
        <View style={styles.settingsRowLeft}>
          <View style={[styles.settingsIconBox, danger && { backgroundColor: "#FEE2E2" }]}>
            <Ionicons name={iconName} size={18} color={danger ? ACCENT_RED : DARK_BLUE} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.settingsRowLabel, danger && { color: ACCENT_RED }]}>
              {label}
            </Text>
            {subtitle ? (
              <Text style={styles.settingsRowSubtitle}>{subtitle}</Text>
            ) : null}
          </View>
        </View>
        <Ionicons
          name="chevron-forward"
          size={16}
          color={danger ? ACCENT_RED : "#CCCCCC"}
        />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Overview Modal ───────────────────────────────────────────────────────────
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
    <AppModal visible={visible} onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={[modalStyles.sheet, { paddingBottom: 32 }]}>
          <Text style={modalStyles.title}>Account Overview</Text>

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
            <ActivityIndicator color={DARK_BLUE} style={{ marginVertical: 20 }} />
          ) : reviews.length === 0 ? (
            <View style={overviewStyles.emptyBox}>
              <Ionicons name="chatbubble-outline" size={36} color="#D8D8D8" style={{ marginBottom: 8 }} />
              <Text style={overviewStyles.emptyText}>
                No reviews yet. Complete trades to earn ratings from other traders.
              </Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
              {reviews.map((r) => (
                <View key={r.id} style={overviewStyles.reviewCard}>
                  <View style={overviewStyles.reviewHeader}>
                    {r.reviewerAvatar ? (
                      <Image source={{ uri: r.reviewerAvatar }} style={overviewStyles.reviewAvatar} />
                    ) : (
                      <View style={[overviewStyles.reviewAvatar, overviewStyles.reviewAvatarPlaceholder]}>
                        <Text style={overviewStyles.reviewAvatarInitial}>
                          {(r.reviewerName ?? "?")[0].toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={overviewStyles.reviewerName}>{r.reviewerName}</Text>
                      <View style={overviewStyles.reviewStars}>
                        {Array.from({ length: MAX_RATING }, (_, i) => (
                          <Ionicons
                            key={i}
                            name={i + 1 <= r.rating ? "star" : "star-outline"}
                            size={13}
                            color={i + 1 <= r.rating ? STAR_FILLED : STAR_EMPTY}
                          />
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
                    <Text style={overviewStyles.reviewComment}>{r.comment}</Text>
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
    </AppModal>
  );
}

// ─── Feedback Modal ───────────────────────────────────────────────────────────
function FeedbackModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [feedback, setFeedback] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!feedback.trim()) {
      Alert.alert("Empty feedback", "Please write something before submitting.");
      return;
    }
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setFeedback("");
      onClose();
    }, 1500);
  };

  return (
    <AppModal visible={visible} onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.sheet}>
          <Text style={modalStyles.title}>Send Feedback</Text>
          <Text style={modalStyles.subtitle}>
            Your thoughts help us improve the app for everyone.
          </Text>
          {submitted ? (
            <View style={modalStyles.successBox}>
              <Ionicons name="checkmark-circle" size={40} color="#22C55E" style={{ marginBottom: 8 }} />
              <Text style={modalStyles.successText}>Thanks for your feedback!</Text>
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
              <TouchableOpacity style={modalStyles.submitBtn} onPress={handleSubmit}>
                <Text style={modalStyles.submitText}>Submit</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity style={modalStyles.cancelBtn} onPress={onClose}>
            <Text style={modalStyles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </AppModal>
  );
}

// ─── Report Modal ─────────────────────────────────────────────────────────────
function ReportModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
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

  const handleClose = () => { reset(); onClose(); };

  const handlePickPhoto = async () => {
    if (photos.length >= 3) {
      Alert.alert("Limit reached", "You can attach up to 3 photos.");
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Please allow access to your photo library.", [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => Linking.openSettings() },
      ]);
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

  const handleSubmit = () => {
    if (!selectedCategory) {
      Alert.alert("No category selected", "Please select a category before submitting.");
      return;
    }
    setSubmitted(true);
    setTimeout(() => { reset(); onClose(); }, 1500);
  };

  return (
    <AppModal visible={visible} onRequestClose={handleClose}>
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
                <Ionicons name="checkmark-circle" size={40} color="#22C55E" style={{ marginBottom: 8 }} />
                <Text style={modalStyles.successText}>Report submitted. Thank you!</Text>
              </View>
            ) : (
              <>
                <View style={reportStyles.categoryGrid}>
                  {REPORT_CATEGORIES.map((label) => {
                    const isSelected = selectedCategory === label;
                    return (
                      <TouchableOpacity
                        key={label}
                        style={[reportStyles.categoryPill, isSelected && reportStyles.categoryPillSelected]}
                        onPress={() => setSelectedCategory(label)}
                        activeOpacity={0.75}
                      >
                        <Text style={[reportStyles.categoryLabel, isSelected && reportStyles.categoryLabelSelected]}>
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
                  <Text style={reportStyles.photoLabelHint}>({photos.length}/3)</Text>
                </Text>

                <View style={reportStyles.photoRow}>
                  {photos.map((uri, index) => (
                    <View key={uri} style={reportStyles.photoThumbWrapper}>
                      <Image source={{ uri }} style={reportStyles.photoThumb} />
                      <TouchableOpacity
                        style={reportStyles.photoRemoveBtn}
                        onPress={() => setPhotos((prev) => prev.filter((_, i) => i !== index))}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons name="close" size={14} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {photos.length < 3 && (
                    <TouchableOpacity style={reportStyles.photoAddBtn} onPress={handlePickPhoto} activeOpacity={0.7}>
                      <Ionicons name="add" size={24} color="#AAAAAA" />
                      <Text style={reportStyles.photoAddLabel}>Photo</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity style={modalStyles.submitBtnR} onPress={handleSubmit}>
                  <Text style={modalStyles.submitText}>Submit Report</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={modalStyles.cancelBtn} onPress={handleClose}>
              <Text style={modalStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </AppModal>
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
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const router = useRouter();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const initialFetchDone = useRef(false);

  const fetchProfile = useCallback(
    async (currentUser: User) => {
      setLoading(true);
      setAvatarLoadError(false);
      try {
        const docRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          const savedItems = data.savedItems || [];
          const savedCount = Array.isArray(savedItems) ? savedItems.length : 0;

          setUserData({
            ...data,
            rating: typeof data.rating === "number" ? data.rating : parseFloat(data.rating) || 0,
            ratingCount: typeof data.ratingCount === "number" ? data.ratingCount : 0,
            savedCount,
          } as UserData);
          setError(null);
        } else {
          console.warn("[Profile] No Firestore doc found for user:", currentUser.uid);
          setError("Profile not set up yet.");
          setUserData({
            email: currentUser.email ?? undefined,
            firstName: currentUser.displayName?.split(" ")[0] ?? undefined,
            lastName: currentUser.displayName?.split(" ").slice(1).join(" ") ?? undefined,
            avatarUrl: currentUser.photoURL ?? undefined,
            rating: 0,
            ratingCount: 0,
            tradesCount: 0,
            exchangedCount: 0,
            savedCount: 0,
          });
        }
      } catch (err: any) {
        const isOffline =
          err?.code === "unavailable" || /client is offline/i.test(err?.message ?? "");
        setError(
          isOffline
            ? "You appear to be offline. Showing cached data."
            : `Failed to load profile: ${err?.message ?? "Unknown error"}`,
        );
        console.error("[Profile] fetchProfile error:", err);
        setUserData({
          email: currentUser.email ?? undefined,
          firstName: currentUser.displayName ?? undefined,
          avatarUrl: currentUser.photoURL ?? undefined,
          rating: 0,
          ratingCount: 0,
          tradesCount: 0,
          exchangedCount: 0,
          savedCount: 0,
        });
      } finally {
        setLoading(false);
        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }),
        ]).start();
      }
    },
    [fadeAnim, slideAnim],
  );

  // ── Auth listener (initial load + redirect guard) ──
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser: User | null) => {
      setAuthInitialized(true);
      if (!currentUser) {
        router.replace("/login");
        return;
      }
      setUserId(currentUser.uid);
      await fetchProfile(currentUser);
      initialFetchDone.current = true;
    });
    return () => unsubscribe();
  }, [router, fetchProfile]);

  // ── Re-fetch whenever the screen comes back into focus ──
  useFocusEffect(
    useCallback(() => {
      if (!initialFetchDone.current) return;
      const currentUser = auth.currentUser;
      if (currentUser) {
        fetchProfile(currentUser);
      }
    }, [fetchProfile]),
  );

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
    if (!currentUser) { router.replace("/login"); return; }
    setError(null);
    await fetchProfile(currentUser);
  };

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

  const ratingValue = typeof userData?.rating === "number" ? userData.rating : 0;
  const ratingCount = userData?.ratingCount ?? 0;
  const displayName = getDisplayName(userData);
  const initials = getInitials(userData);
  const avatarUri = getAvatarUri(userData);
  const showAvatar = avatarUri && !avatarLoadError;

  return (
    <View style={styles.container}>
      <FeedbackModal visible={feedbackVisible} onClose={() => setFeedbackVisible(false)} />
      <ReportModal visible={reportVisible} onClose={() => setReportVisible(false)} />
      <OverviewModal
        visible={overviewVisible}
        userId={userId}
        userData={userData}
        onClose={() => setOverviewVisible(false)}
      />

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Profile</Text>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => router.push("/edit-profile" as any)}
          activeOpacity={0.75}
        >
          <Ionicons name="create-outline" size={18} color="#FF6B6B" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* ── Error Banner ── */}
          {error && (
            <TouchableOpacity style={styles.errorBanner} onPress={handleRetry}>
              <Ionicons name="alert-circle" size={16} color="#856404" />
              <Text style={styles.errorBannerText}>{error} Tap to retry.</Text>
            </TouchableOpacity>
          )}

          {/* ── Profile Card ── */}
          <View style={styles.profileCard}>
            {/* Avatar */}
            <View style={styles.avatarWrapper}>
              {showAvatar ? (
                <Image
                  source={{ uri: avatarUri! }}
                  style={styles.avatar}
                  onError={() => setAvatarLoadError(true)}
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitial}>{initials}</Text>
                </View>
              )}
              {userData?.isVerified && (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark" size={10} color="#fff" />
                </View>
              )}
            </View>

            {/* Name */}
            <Text style={styles.username}>{displayName}</Text>

            {/* Contact */}
            <Text style={styles.contactLine}>
              {userData?.phone ?? userData?.email ?? ""}
            </Text>

            {/* ── Bio Card ── */}
            {userData?.bio ? (
              <View style={styles.bioCard}>
                <View style={styles.bioHeader}>
                  <Ionicons name="person-outline" size={14} color={DARK_BLUE} />
                  <Text style={styles.bioLabel}>About me</Text>
                </View>
                <Text style={styles.bioText}>{userData.bio}</Text>
              </View>
            ) : null}

            {/* ── Rating Card ── */}
            <View style={styles.ratingSection}>
              <View style={styles.ratingHeader}>
                <Ionicons name="star" size={14} color={STAR_FILLED} />
                <Text style={styles.ratingTitle}>Trader Rating</Text>
              </View>
              <StarRating rating={ratingValue} ratingCount={ratingCount} size={24} />
              {ratingCount === 0 && (
                <Text style={styles.ratingNoData}>
                  Complete trades to start earning ratings.
                </Text>
              )}
            </View>

            {/* ── Overview Badge ── */}
            <TouchableOpacity
              style={styles.overviewBadge}
              onPress={() => setOverviewVisible(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="bar-chart-outline" size={16} color="#fff" />
              <Text style={styles.overviewText}>View Overview</Text>
              <Ionicons name="star" size={14} color="#FFE066" />
            </TouchableOpacity>
          </View>

          {/* ── Stats ── */}
          <View style={styles.statsRow}>
            <StatCard iconName="swap-horizontal" label="Trades" count={userData?.tradesCount ?? 0} />
            <View style={styles.statDivider} />
            <StatCard iconName="arrow-forward-circle-outline" label="Exchanged" count={userData?.exchangedCount ?? 0} />
            <View style={styles.statDivider} />
            <StatCard
              iconName="bookmark"
              label="Saved"
              count={userData?.savedCount ?? 0}
              onPress={handleSavedPress}
            />
          </View>

          {/* ── Settings ── */}
          <Text style={styles.sectionTitle}>Support</Text>
          <View style={styles.sectionCard}>
            <SettingsRow
              iconName="help-circle-outline"
              label="FAQs"
              subtitle="Frequently Asked Questions"
              onPress={() => router.push("/Faq" as any)}
            />
            <SettingsRow
              iconName="flag-outline"
              label="Report an Issue"
              subtitle="Bugs, problems, or violations"
              onPress={() => setReportVisible(true)}
            />
            <SettingsRow
              iconName="chatbubble-ellipses-outline"
              label="Send Feedback"
              subtitle="Share your thoughts with us"
              onPress={() => setFeedbackVisible(true)}
            />
          </View>

          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.sectionCard}>
            <SettingsRow
              iconName="time-outline"
              label="Trade History"
              subtitle="View all past trades"
              onPress={() => router.push("/trade-history" as any)}
            />
            <SettingsRow
              iconName="log-out-outline"
              label="Log Out"
              danger
              onPress={handleLogout}
            />
          </View>

          {/* ── Account Info Footer ── */}
          <View style={styles.footerCard}>
            <Ionicons name="mail-outline" size={14} color="#AAAAAA" />
            <View style={{ marginLeft: 8 }}>
              <Text style={styles.footerLabel}>Account Email</Text>
              <Text style={styles.footerValue}>{userData?.email ?? "—"}</Text>
            </View>
          </View>

        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F9" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F4F5F9" },
  loadingText: { color: "#888", fontSize: 14, marginTop: 12 },

  header: {
    backgroundColor: DARK_BLUE,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 15,
  },
  headerTitle: { color: "#fff", fontSize: 22, fontWeight: "800", letterSpacing: 0.4 },
  editButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },

  scrollContent: { paddingBottom: 40 },

  errorBanner: {
    backgroundColor: "#FFF3CD",
    padding: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: "#F5A623",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  errorBannerText: { color: "#856404", fontSize: 13, fontWeight: "500", flex: 1 },

  profileCard: {
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 16,
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 20,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },

  avatarWrapper: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: DARK_BLUE,
    overflow: "visible",
    marginBottom: 14,
    position: "relative",
  },
  avatar: { width: 90, height: 90, borderRadius: 45 },
  avatarPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: DARK_BLUE,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: { color: "#fff", fontSize: 34, fontWeight: "800" },
  verifiedBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#1877F2",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },

  username: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1A1A2E",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  contactLine: {
    color: "#888",
    fontSize: 13.5,
    marginTop: 4,
    marginBottom: 4,
    textAlign: "center",
  },

  bioCard: {
    width: "100%",
    backgroundColor: "#F8F9FF",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#DDE0F5",
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 14,
    marginBottom: 4,
  },
  bioHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  bioLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: DARK_BLUE,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  bioText: { color: "#444", fontSize: 14, lineHeight: 20, fontWeight: "400" },

  ratingSection: {
    alignItems: "center",
    marginTop: 16,
    width: "100%",
    backgroundColor: "#FAFBFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ECECF8",
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  ratingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  ratingTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 1,
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
    paddingVertical: 9,
    paddingHorizontal: 20,
    marginTop: 16,
    gap: 7,
    elevation: 4,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
  },
  overviewText: { color: "#fff", fontWeight: "700", fontSize: 14, letterSpacing: 0.3 },

  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 20,
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
  statCard: { flex: 1, alignItems: "center", gap: 2 },
  statDivider: { width: 1, height: 50, backgroundColor: "#ECECEC" },
  statCountNum: { fontSize: 17, fontWeight: "800", color: DARK_BLUE },
  statCountLabel: { fontSize: 11, color: "#999", fontWeight: "500" },
  statTapHint: {
    fontSize: 9,
    color: GOLD,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 1,
  },

  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginHorizontal: 20,
    marginBottom: 8,
    marginTop: 4,
  },
  sectionCard: {
    marginHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: 14,
    marginBottom: 16,
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
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ECECEC",
  },
  settingsRowLeft: { flexDirection: "row", alignItems: "center", flex: 1, gap: 12 },
  settingsIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#EEF0FB",
    justifyContent: "center",
    alignItems: "center",
  },
  settingsRowLabel: { fontSize: 15, color: "#1A1A2E", fontWeight: "600" },
  settingsRowSubtitle: { fontSize: 12, color: "#AAAAAA", marginTop: 2 },

  footerCard: {
    marginHorizontal: 16,
    marginBottom: 24,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  footerLabel: { fontSize: 11, color: "#AAAAAA", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8 },
  footerValue: { fontSize: 14, color: "#333", fontWeight: "500", marginTop: 2 },
});

// ─── Rating Sub-Styles ────────────────────────────────────────────────────────
const ratingStyles = StyleSheet.create({
  wrapper: { alignItems: "center", gap: 6 },
  starsRow: { flexDirection: "row", gap: 3 },
  ratingInfo: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  ratingNumber: { fontSize: 20, fontWeight: "800", color: "#1A1A2E" },
  ratingCount: { fontSize: 12, color: "#AAAAAA", fontWeight: "500" },
  ratingEmpty: { fontSize: 14, color: "#CCCCCC", fontWeight: "500", fontStyle: "italic" },
});

// ─── Modal Styles ─────────────────────────────────────────────────────────────
const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  scrollSheet: { justifyContent: "flex-end", flexGrow: 1 },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 28,
    paddingBottom: 40,
  },
  title: { fontSize: 20, fontWeight: "800", color: "#1A1A2E", marginBottom: 6 },
  subtitle: { fontSize: 13, color: "#888", marginBottom: 16, lineHeight: 18 },
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
  submitBtn: { backgroundColor: DARK_BLUE, paddingVertical: 14, borderRadius: 12, alignItems: "center", marginBottom: 10 },
  submitBtnR: { backgroundColor: "#7c0303", paddingVertical: 14, borderRadius: 12, alignItems: "center", marginBottom: 10 },
  submitText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  cancelBtn: { paddingVertical: 12, alignItems: "center" },
  cancelText: { color: "#888", fontWeight: "600", fontSize: 14 },
  successBox: { paddingVertical: 32, alignItems: "center" },
  successText: { fontSize: 18, fontWeight: "700", color: "#1A1A2E" },
});

// ─── Report Styles ────────────────────────────────────────────────────────────
const reportStyles = StyleSheet.create({
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  categoryPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    backgroundColor: "#FAFAFA",
  },
  categoryPillSelected: { borderColor: DARK_BLUE, backgroundColor: "#ECEDF8" },
  categoryLabel: { fontSize: 13, fontWeight: "600", color: "#555" },
  categoryLabelSelected: { color: DARK_BLUE },
  photoLabel: { fontSize: 13, fontWeight: "700", color: "#1A1A2E", marginBottom: 10 },
  photoLabelHint: { fontWeight: "500", color: "#AAAAAA" },
  photoRow: { flexDirection: "row", gap: 10, marginBottom: 20, flexWrap: "wrap" },
  photoThumbWrapper: { position: "relative", width: 72, height: 72 },
  photoThumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: "#E0E0E0" },
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
  },
  photoAddLabel: { fontSize: 11, color: "#AAAAAA", fontWeight: "600" },
});

// ─── Overview Modal Styles ────────────────────────────────────────────────────
const overviewStyles = StyleSheet.create({
  summaryRow: { flexDirection: "row", gap: 10, marginBottom: 20, marginTop: 4 },
  summaryCard: { flex: 1, backgroundColor: "#F4F5F9", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  summaryNum: { fontSize: 22, fontWeight: "800", color: DARK_BLUE },
  summaryLabel: { fontSize: 11, color: "#888", fontWeight: "600", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: "#888", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 },
  emptyBox: { alignItems: "center", paddingVertical: 28 },
  emptyText: { fontSize: 13, color: "#AAAAAA", textAlign: "center", lineHeight: 18, paddingHorizontal: 16, fontStyle: "italic", marginTop: 8 },
  reviewCard: { backgroundColor: "#F9F9FB", borderRadius: 12, padding: 12, marginBottom: 10 },
  reviewHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  reviewAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#ddd" },
  reviewAvatarPlaceholder: { backgroundColor: DARK_BLUE, justifyContent: "center", alignItems: "center" },
  reviewAvatarInitial: { color: "#fff", fontSize: 15, fontWeight: "800" },
  reviewerName: { fontSize: 13, fontWeight: "700", color: "#1A1A2E" },
  reviewStars: { flexDirection: "row", gap: 1, marginTop: 2 },
  reviewDate: { fontSize: 11, color: "#AAAAAA", fontWeight: "500" },
  reviewComment: { fontSize: 13, color: "#555", lineHeight: 18, marginLeft: 46 },
});