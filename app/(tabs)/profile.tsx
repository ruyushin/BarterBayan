// profile.tsx — patched: added follower/following counts + navigation to followers screen
// All original functionality preserved. Follow counts are real-time via onSnapshot.

import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
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

const CLOUDINARY_CLOUD_NAME = "dh97c25iz";
const CLOUDINARY_UPLOAD_PRESET = "reports";

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
  followerCount?: number;
  followingCount?: number;
}

interface Review {
  id: string;
  reviewerName: string;
  reviewerAvatar?: string;
  rating: number;
  comment: string;
  createdAt: any;
}

const REPORT_CATEGORIES: string[] = [
  "Bug",
  "App is slow",
  "Misleading listing",
  "Inappropriate content",
  "Scam or fraud",
  "Other",
];

// ─── Star Rating ──────────────────────────────────────────────────────────────
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
  return (
    <View style={ratingStyles.wrapper}>
      <View style={ratingStyles.starsRow}>
        {Array.from({ length: MAX_RATING }, (_, i) => {
          const filled = i + 1 <= Math.floor(effectiveRating);
          const half =
            !filled && i < effectiveRating && effectiveRating % 1 >= 0.5;
          return (
            <Ionicons
              key={i}
              name={filled ? "star" : half ? "star-half" : "star-outline"}
              size={size}
              color={filled || half ? STAR_FILLED : STAR_EMPTY}
              style={{ marginRight: 1 }}
            />
          );
        })}
      </View>
    </View>
  );
}

// ─── Rating Hero Card ─────────────────────────────────────────────────────────
function RatingHeroCard({
  rating,
  ratingCount,
  distribution,
}: {
  rating: number;
  ratingCount: number;
  distribution: number[];
}) {
  const hasRatings = ratingCount > 0;
  const displayRating = hasRatings ? rating : 0;
  const safeDistribution =
    Array.isArray(distribution) && distribution.length === 5
      ? distribution
      : [0, 0, 0, 0, 0];
  const maxCount = Math.max(...safeDistribution, 1);

  const barAnims = useRef(
    Array.from({ length: MAX_RATING }, () => new Animated.Value(0)),
  ).current;

  useEffect(() => {
    if (!hasRatings) return;
    Animated.stagger(
      60,
      barAnims.map((anim, i) =>
        Animated.timing(anim, {
          toValue: distribution[i] / maxCount,
          duration: 500,
          useNativeDriver: false,
        }),
      ),
    ).start();
  }, [hasRatings, distribution.join(",")]);

  return (
    <View style={heroStyles.card}>
      <View style={heroStyles.left}>
        <Text style={heroStyles.bigNumber}>
          {hasRatings ? displayRating.toFixed(1) : "—"}
        </Text>
        <View style={heroStyles.starsRow}>
          {Array.from({ length: MAX_RATING }, (_, i) => {
            const filled = i + 1 <= Math.floor(displayRating);
            const half =
              !filled && i < displayRating && displayRating % 1 >= 0.5;
            return (
              <Ionicons
                key={i}
                name={filled ? "star" : half ? "star-half" : "star-outline"}
                size={15}
                color={filled || half ? STAR_FILLED : "#E0E0E0"}
              />
            );
          })}
        </View>
        <Text style={heroStyles.countLabel}>
          {hasRatings
            ? `${ratingCount} ${ratingCount === 1 ? "review" : "reviews"}`
            : "No ratings yet"}
        </Text>
      </View>
      <View style={heroStyles.divider} />
      <View style={heroStyles.bars}>
        {[5, 4, 3, 2, 1].map((star) => {
          const count = distribution[star - 1];
          const pct =
            ratingCount > 0 ? Math.round((count / ratingCount) * 100) : 0;
          return (
            <View key={star} style={heroStyles.barRow}>
              <Text style={heroStyles.barLabel}>{star}</Text>
              <Ionicons
                name="star"
                size={9}
                color={STAR_FILLED}
                style={{ marginRight: 5 }}
              />
              <View style={heroStyles.barTrack}>
                <Animated.View
                  style={[
                    heroStyles.barFill,
                    {
                      width: barAnims[star - 1].interpolate({
                        inputRange: [0, 1],
                        outputRange: ["0%", "100%"],
                      }),
                      backgroundColor:
                        star >= 4 ? "#27AE60" : star === 3 ? GOLD : "#E67E22",
                    },
                  ]}
                />
              </View>
              <Text style={heroStyles.barPct}>
                {hasRatings ? `${pct}%` : ""}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
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
      <Ionicons
        name={iconName as any}
        size={26}
        color="#2e2d7c"
        style={{ marginVertical: 2 }}
      />
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

// ─── Settings Row ─────────────────────────────────────────────────────────────
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
  const [filter, setFilter] = useState<number | null>(null);

  useEffect(() => {
    if (!visible || !userId) return;
    setLoadingReviews(true);
    getDocs(
      query(
        collection(db, "users", userId, "reviews"),
        orderBy("createdAt", "desc"),
        limit(20),
      ),
    )
      .then((snap) =>
        setReviews(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Review, "id">),
          })),
        ),
      )
      .catch((e) => console.error("OverviewModal fetch error:", e))
      .finally(() => setLoadingReviews(false));
  }, [visible, userId]);

  const ratingValue =
    typeof userData?.rating === "number" ? userData.rating : 0;
  const ratingCount = userData?.ratingCount ?? 0;

  const distribution = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    reviews.forEach((r) => {
      const idx = Math.round(r.rating) - 1;
      if (idx >= 0 && idx < 5) counts[idx]++;
    });
    return counts;
  }, [reviews]);

  const maxCount = Math.max(...distribution, 1);
  const filtered =
    filter === null
      ? reviews
      : reviews.filter((r) => Math.round(r.rating) === filter);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={ovStyles.overlay}>
        <View style={ovStyles.sheet}>
          <View style={ovStyles.handle} />
          <View style={ovStyles.hero}>
            <View style={ovStyles.heroLeft}>
              <Text style={ovStyles.heroNumber}>
                {ratingCount > 0 ? ratingValue.toFixed(1) : "—"}
              </Text>
              <View style={ovStyles.heroStars}>
                {Array.from({ length: MAX_RATING }, (_, i) => {
                  const filled = i + 1 <= Math.floor(ratingValue);
                  const half =
                    !filled && i < ratingValue && ratingValue % 1 >= 0.5;
                  return (
                    <Ionicons
                      key={i}
                      name={
                        filled ? "star" : half ? "star-half" : "star-outline"
                      }
                      size={18}
                      color={filled || half ? STAR_FILLED : "#E0E0E0"}
                    />
                  );
                })}
              </View>
              <Text style={ovStyles.heroCount}>
                {ratingCount} {ratingCount === 1 ? "review" : "reviews"}
              </Text>
            </View>
            <View style={ovStyles.heroDivider} />
            <View style={ovStyles.heroBars}>
              {[5, 4, 3, 2, 1].map((star) => {
                const count = distribution[star - 1];
                const pct = ratingCount > 0 ? count / maxCount : 0;
                return (
                  <TouchableOpacity
                    key={star}
                    style={ovStyles.heroBarRow}
                    onPress={() => setFilter(filter === star ? null : star)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        ovStyles.heroBarLabel,
                        filter === star && ovStyles.heroBarLabelActive,
                      ]}
                    >
                      {star}
                    </Text>
                    <Ionicons
                      name="star"
                      size={9}
                      color={filter === star ? STAR_FILLED : "#CCC"}
                      style={{ marginRight: 5 }}
                    />
                    <View style={ovStyles.heroBarTrack}>
                      <View
                        style={[
                          ovStyles.heroBarFill,
                          {
                            width: `${pct * 100}%`,
                            backgroundColor:
                              star >= 4
                                ? "#27AE60"
                                : star === 3
                                  ? GOLD
                                  : "#E67E22",
                          },
                        ]}
                      />
                    </View>
                    <Text style={ovStyles.heroBarCount}>{count}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {reviews.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={ovStyles.filterRow}
            >
              <TouchableOpacity
                style={[
                  ovStyles.filterPill,
                  filter === null && ovStyles.filterPillActive,
                ]}
                onPress={() => setFilter(null)}
              >
                <Text
                  style={[
                    ovStyles.filterPillText,
                    filter === null && ovStyles.filterPillTextActive,
                  ]}
                >
                  All
                </Text>
              </TouchableOpacity>
              {[5, 4, 3, 2, 1].map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[
                    ovStyles.filterPill,
                    filter === s && ovStyles.filterPillActive,
                  ]}
                  onPress={() => setFilter(filter === s ? null : s)}
                >
                  <Ionicons
                    name="star"
                    size={11}
                    color={filter === s ? "#fff" : STAR_FILLED}
                    style={{ marginRight: 3 }}
                  />
                  <Text
                    style={[
                      ovStyles.filterPillText,
                      filter === s && ovStyles.filterPillTextActive,
                    ]}
                  >
                    {s}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {loadingReviews ? (
            <ActivityIndicator
              color={DARK_BLUE}
              style={{ marginVertical: 24 }}
            />
          ) : filtered.length === 0 ? (
            <View style={ovStyles.empty}>
              <Ionicons name="chatbubble-outline" size={36} color="#D8D8D8" />
              <Text style={ovStyles.emptyText}>
                {filter !== null
                  ? `No ${filter}-star reviews yet`
                  : "No reviews yet. Complete trades to earn ratings."}
              </Text>
            </View>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 20 }}
            >
              {filtered.map((r) => (
                <View key={r.id} style={ovStyles.reviewCard}>
                  <View style={ovStyles.reviewTop}>
                    {r.reviewerAvatar ? (
                      <Image
                        source={{ uri: r.reviewerAvatar }}
                        style={ovStyles.avatar}
                      />
                    ) : (
                      <View style={[ovStyles.avatar, ovStyles.avatarFallback]}>
                        <Text style={ovStyles.avatarInitial}>
                          {(r.reviewerName ?? "?")[0].toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={ovStyles.reviewerName}>
                        {r.reviewerName}
                      </Text>
                      <View style={ovStyles.reviewStars}>
                        {Array.from({ length: MAX_RATING }, (_, i) => (
                          <Ionicons
                            key={i}
                            name={i + 1 <= r.rating ? "star" : "star-outline"}
                            size={13}
                            color={i + 1 <= r.rating ? STAR_FILLED : STAR_EMPTY}
                          />
                        ))}
                        <Text style={ovStyles.reviewRatingNum}>
                          {r.rating.toFixed(1)}
                        </Text>
                      </View>
                    </View>
                    {r.createdAt?.toDate && (
                      <Text style={ovStyles.reviewDate}>
                        {r.createdAt
                          .toDate()
                          .toLocaleDateString("en-PH", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                      </Text>
                    )}
                  </View>
                  {r.comment ? (
                    <View style={ovStyles.commentBox}>
                      <Text style={ovStyles.commentQuote}>"</Text>
                      <Text style={ovStyles.comment}>{r.comment}</Text>
                    </View>
                  ) : (
                    <Text style={ovStyles.noComment}>No written review</Text>
                  )}
                </View>
              ))}
            </ScrollView>
          )}

          <TouchableOpacity style={ovStyles.closeBtn} onPress={onClose}>
            <Text style={ovStyles.closeBtnText}>Close</Text>
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
  const [submitting, setSubmitting] = useState(false);

  const MAX_FEEDBACK_CHARS = 300;

  const reset = () => {
    setFeedback("");
    setSubmitted(false);
    setSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!feedback.trim()) {
      Alert.alert("Empty feedback", "Please write something before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const currentUser = auth.currentUser;
      const now = new Date();
      await addDoc(collection(db, "feedback"), {
        userId: currentUser?.uid ?? null,
        userEmail: currentUser?.email ?? null,
        username: currentUser?.displayName ?? null,
        message: feedback.trim(),
        createdAt: serverTimestamp(),
        createdAtReadable: `${now.toLocaleDateString("en-PH", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })} · ${now.toLocaleTimeString("en-PH", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })}`,
      });
      setSubmitted(true);
      setTimeout(() => {
        reset();
        onClose();
      }, 1500);
    } catch (err) {
      console.error("Feedback submission error:", err);
      Alert.alert("Error", "Failed to submit feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.sheet}>
            <Text style={modalStyles.title}>Send Feedback</Text>
            <Text style={modalStyles.subtitle}>
              Your thoughts help us improve the app for everyone.
            </Text>
            {submitted ? (
              <View style={modalStyles.successBox}>
                <Ionicons name="checkmark-circle" size={48} color="#27AE60" style={{ marginBottom: 8 }} />
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
                  onChangeText={(text) => {
                    if (text.length <= MAX_FEEDBACK_CHARS) setFeedback(text);
                  }}
                  textAlignVertical="top"
                  maxLength={MAX_FEEDBACK_CHARS}
                />
                <Text
                  style={[
                    reportStyles.charCount,
                    feedback.length >= MAX_FEEDBACK_CHARS && reportStyles.charCountLimit,
                  ]}
                >
                  {feedback.length}/{MAX_FEEDBACK_CHARS}
                </Text>
                <TouchableOpacity
                  style={[modalStyles.submitBtn, submitting && { opacity: 0.6 }]}
                  onPress={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <ActivityIndicator color="#fff" size="small" />
                      <Text style={modalStyles.submitText}>Submitting…</Text>
                    </View>
                  ) : (
                    <Text style={modalStyles.submitText}>Submit</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity
              style={modalStyles.cancelBtn}
              onPress={handleClose}
              disabled={submitting}
            >
              <Text style={[modalStyles.cancelText, submitting && { opacity: 0.4 }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
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
  const [uploading, setUploading] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  // Stores size-type fingerprints for duplicate detection (works on web + native)
  const photoFingerprints = useRef<string[]>([]);

  const MAX_CHARS = 300;
  const MAX_PHOTOS = 5;

  const reset = () => {
    setSelectedCategory(null);
    setDetails("");
    setPhotos([]);
    setSubmitted(false);
    setUploading(false);
    setShowValidation(false);
    photoFingerprints.current = [];
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handlePickPhoto = async () => {
    if (photos.length >= MAX_PHOTOS) {
      Alert.alert("Limit reached", `You can attach up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission required",
        "Please allow access to your photo library in Settings.",
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
      const newUri = result.assets[0].uri;
      try {
        // Fetch as blob and fingerprint by size+type — works on both web and native
        const blob = await fetch(newUri).then((r) => r.blob());
        const fingerprint = `${blob.size}-${blob.type}`;
        if (photoFingerprints.current.includes(fingerprint)) {
          Alert.alert("Duplicate photo", "This photo has already been added.");
          return;
        }
        photoFingerprints.current.push(fingerprint);
        setPhotos((prev) => [...prev, newUri]);
      } catch {
        // Fallback: add without duplicate check if blob fetch fails
        setPhotos((prev) => [...prev, newUri]);
      }
    }
  };

  const uploadToCloudinary = async (uri: string): Promise<string> => {
    const formData = new FormData();

    // Web needs a real Blob; native uses the { uri, type, name } object
    if (typeof document !== "undefined") {
      const blob = await fetch(uri).then((r) => r.blob());
      formData.append("file", blob, "photo.jpg");
    } else {
      formData.append("file", {
        uri,
        type: "image/jpeg",
        name: uri.split("/").pop() ?? "photo.jpg",
      } as any);
    }

    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    // Folder is configured inside the Cloudinary preset, not sent here

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: "POST", body: formData },
    );
    const data = await res.json();
    console.log("Cloudinary response:", JSON.stringify(data, null, 2));
    if (!data.secure_url) {
      throw new Error(data?.error?.message ?? "Cloudinary upload failed");
    }
    return data.secure_url;
  };

  const handleSubmit = async () => {
    if (!selectedCategory) {
      setShowValidation(true);
      return;
    }
    setShowValidation(false);
    setUploading(true);
    try {
      // Upload all photos to Cloudinary
      const uploadedUrls: string[] = [];
      for (const uri of photos) {
        const url = await uploadToCloudinary(uri);
        uploadedUrls.push(url);
      }

      // Build a human-readable timestamp: "June 12, 2026 · 3:45 PM"
      const now = new Date();
      const readableDate = now.toLocaleDateString("en-PH", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      const readableTime = now.toLocaleTimeString("en-PH", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      const readableCreatedAt = `${readableDate} · ${readableTime}`;

      // Save report to Firestore
      const currentUser = auth.currentUser;
      await addDoc(collection(db, "reports"), {
        userId: currentUser?.uid ?? null,
        userEmail: currentUser?.email ?? null,
        username: currentUser?.displayName ?? null,
        category: selectedCategory,
        details: details.trim(),
        photoUrls: uploadedUrls,
        createdAt: serverTimestamp(),       // Firestore Timestamp for queries/ordering
        createdAtReadable: readableCreatedAt, // Human-readable string e.g. "June 12, 2026 · 3:45 PM"
        status: "open",
      });

      setSubmitted(true);
      setTimeout(() => {
        reset();
        onClose();
      }, 1500);
    } catch (err) {
      console.error("Report submission error:", err);
      Alert.alert("Error", "Failed to submit report. Please try again.");
    } finally {
      setUploading(false);
    }
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
                <Ionicons name="checkmark-circle" size={48} color="#27AE60" style={{ marginBottom: 8 }} />
                <Text style={modalStyles.successText}>
                  Report submitted. Thank you!
                </Text>
              </View>
            ) : (
              <>
                {/* Category section label */}
                <Text
                  style={[
                    reportStyles.sectionLabel,
                    showValidation && !selectedCategory && reportStyles.sectionLabelError,
                  ]}
                >
                  Reason <Text style={{ color: ACCENT_RED }}>*</Text>
                </Text>

                {/* Category Pills */}
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
                        onPress={() => {
                          setSelectedCategory(label);
                          setShowValidation(false);
                        }}
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

                {/* Inline validation message */}
                {showValidation && !selectedCategory && (
                  <View style={reportStyles.validationRow}>
                    <Ionicons name="alert-circle" size={14} color={ACCENT_RED} />
                    <Text style={reportStyles.validationText}>
                      Please select a reason before submitting.
                    </Text>
                  </View>
                )}

                {/* Details input with 300 char limit */}
                <TextInput
                  style={modalStyles.input}
                  placeholder="Add more details (optional)..."
                  placeholderTextColor="#AAAAAA"
                  multiline
                  numberOfLines={4}
                  value={details}
                  onChangeText={(text) => {
                    if (text.length <= MAX_CHARS) setDetails(text);
                  }}
                  textAlignVertical="top"
                  maxLength={MAX_CHARS}
                />
                <Text
                  style={[
                    reportStyles.charCount,
                    details.length >= MAX_CHARS && reportStyles.charCountLimit,
                  ]}
                >
                  {details.length}/{MAX_CHARS}
                </Text>

                {/* Photo attachment */}
                <Text style={reportStyles.photoLabel}>
                  Attach Photos{" "}
                  <Text style={reportStyles.photoLabelHint}>
                    ({photos.length}/{MAX_PHOTOS})
                  </Text>
                </Text>
                <View style={reportStyles.photoRow}>
                  {photos.map((uri, index) => (
                    <View key={`${uri}-${index}`} style={reportStyles.photoThumbWrapper}>
                      <Image source={{ uri }} style={reportStyles.photoThumb} />
                      <TouchableOpacity
                        style={reportStyles.photoRemoveBtn}
                        onPress={() =>
                          setPhotos((prev) => prev.filter((_, i) => i !== index))
                        }
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons name="close" size={16} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {photos.length < MAX_PHOTOS && (
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

                {/* Submit button */}
                <TouchableOpacity
                  style={[modalStyles.submitBtnR, uploading && { opacity: 0.6 }]}
                  onPress={handleSubmit}
                  disabled={uploading}
                >
                  {uploading ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <ActivityIndicator color="#fff" size="small" />
                      <Text style={modalStyles.submitText}>
                        {photos.length > 0 ? "Uploading photos…" : "Submitting…"}
                      </Text>
                    </View>
                  ) : (
                    <Text style={modalStyles.submitText}>Submit Report</Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={modalStyles.cancelBtn}
              onPress={handleClose}
              disabled={uploading}
            >
              <Text style={[modalStyles.cancelText, uploading && { opacity: 0.4 }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Recent Reviews Section ───────────────────────────────────────────────────
function RecentReviewsSection({
  userId,
  ratingCount,
  onSeeAll,
}: {
  userId: string | null;
  ratingCount: number;
  onSeeAll: () => void;
}) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    getDocs(
      query(
        collection(db, "users", userId, "reviews"),
        orderBy("createdAt", "desc"),
        limit(3),
      ),
    )
      .then((snap) =>
        setReviews(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Review, "id">),
          })),
        ),
      )
      .catch((e) => console.error("RecentReviewsSection fetch error:", e))
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    <View style={reviewSectionStyles.wrapper}>
      <View style={reviewSectionStyles.header}>
        <Text style={reviewSectionStyles.title}>Ratings & Reviews</Text>
        {ratingCount > 0 && (
          <View style={reviewSectionStyles.countPill}>
            <Text style={reviewSectionStyles.countPillText}>{ratingCount}</Text>
          </View>
        )}
      </View>
      {loading ? (
        <ActivityIndicator
          color={DARK_BLUE}
          style={{ marginVertical: 16 }}
          size="small"
        />
      ) : reviews.length === 0 ? (
        <View style={reviewSectionStyles.emptyBox}>
          <Ionicons name="star-outline" size={28} color="#D8D8D8" />
          <Text style={reviewSectionStyles.emptyText}>
            No reviews yet. Complete trades to earn ratings.
          </Text>
        </View>
      ) : (
        <>
          {reviews.map((r) => (
            <View key={r.id} style={reviewSectionStyles.reviewRow}>
              {r.reviewerAvatar ? (
                <Image
                  source={{ uri: r.reviewerAvatar }}
                  style={reviewSectionStyles.avatar}
                />
              ) : (
                <View
                  style={[
                    reviewSectionStyles.avatar,
                    reviewSectionStyles.avatarPlaceholder,
                  ]}
                >
                  <Text style={reviewSectionStyles.avatarInitial}>
                    {(r.reviewerName ?? "?")[0].toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={reviewSectionStyles.reviewBody}>
                <View style={reviewSectionStyles.reviewMeta}>
                  <Text style={reviewSectionStyles.reviewerName}>
                    {r.reviewerName}
                  </Text>
                  <View style={reviewSectionStyles.starsRow}>
                    {Array.from({ length: MAX_RATING }, (_, i) => (
                      <Ionicons
                        key={i}
                        name={i + 1 <= r.rating ? "star" : "star-outline"}
                        size={12}
                        color={i + 1 <= r.rating ? STAR_FILLED : STAR_EMPTY}
                      />
                    ))}
                  </View>
                  {r.createdAt?.toDate && (
                    <Text style={reviewSectionStyles.date}>
                      {r.createdAt
                        .toDate()
                        .toLocaleDateString("en-PH", {
                          month: "short",
                          day: "numeric",
                        })}
                    </Text>
                  )}
                </View>
                {r.comment ? (
                  <Text style={reviewSectionStyles.comment} numberOfLines={2}>
                    {r.comment}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
          {ratingCount > 3 && (
            <TouchableOpacity
              style={reviewSectionStyles.seeAllBtn}
              onPress={onSeeAll}
              activeOpacity={0.7}
            >
              <Text style={reviewSectionStyles.seeAllText}>
                See all {ratingCount} reviews
              </Text>
              <Ionicons name="chevron-forward" size={14} color={DARK_BLUE} />
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
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
  const [recentReviews, setRecentReviews] = useState<Review[]>([]);
  const [reviewDistribution, setReviewDistribution] = useState<number[]>([
    0, 0, 0, 0, 0,
  ]);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const hasAnimated = useRef(false);

  const animateIn = useCallback(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (currentUser: User | null) => {
      setAuthInitialized(true);
      if (!currentUser) {
        router.replace("/login");
        return;
      }
      setUserId(currentUser.uid);
      const userRef = doc(db, "users", currentUser.uid);
      const unsubDoc = onSnapshot(
        userRef,
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            const savedItems = data.savedItems ?? [];
            setUserData({
              ...data,
              rating:
                typeof data.rating === "number"
                  ? data.rating
                  : parseFloat(data.rating) || 0,
              ratingCount:
                typeof data.ratingCount === "number" ? data.ratingCount : 0,
              tradesCount:
                typeof data.tradesCount === "number" ? data.tradesCount : 0,
              exchangedCount:
                typeof data.exchangedCount === "number"
                  ? data.exchangedCount
                  : 0,
              savedCount: Array.isArray(savedItems) ? savedItems.length : 0,
              followerCount:
                typeof data.followerCount === "number" ? data.followerCount : 0,
              followingCount:
                typeof data.followingCount === "number"
                  ? data.followingCount
                  : 0,
            } as UserData);
            setError(null);
          } else {
            setUserData({
              email: currentUser.email ?? undefined,
              username: currentUser.displayName ?? "Unknown User",
              rating: 0,
              ratingCount: 0,
              tradesCount: 0,
              exchangedCount: 0,
              savedCount: 0,
              followerCount: 0,
              followingCount: 0,
            });
          }
          setLoading(false);
          animateIn();
        },
        (err) => {
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
            followerCount: 0,
            followingCount: 0,
          });
          setLoading(false);
          animateIn();
        },
      );
      return unsubDoc;
    });
    return () => unsubAuth();
  }, [router, animateIn]);

  useEffect(() => {
    if (!userId) return;
    getDocs(
      query(
        collection(db, "users", userId, "reviews"),
        orderBy("createdAt", "desc"),
        limit(50),
      ),
    ).then((snap) => {
      const fetched = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Review, "id">),
      }));
      setRecentReviews(fetched);
      const counts = [0, 0, 0, 0, 0];
      fetched.forEach((r) => {
        const idx = Math.round(r.rating) - 1;
        if (idx >= 0 && idx < 5) counts[idx]++;
      });
      setReviewDistribution(counts);
    });
  }, [userId]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut(auth);
      router.replace("/login");
    } catch (err) {
      console.error("Logout error:", err);
      Alert.alert("Error", "Failed to log out. Please try again.");
    } finally {
      setLoggingOut(false);
      setShowLogoutModal(false);
    }
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
        <Ionicons
          name="alert-circle"
          size={48}
          color={ACCENT_RED}
          style={{ marginBottom: 12 }}
        />
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorMessage}>{error}</Text>
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
  const followerCount = userData?.followerCount ?? 0;
  const followingCount = userData?.followingCount ?? 0;

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
      <OverviewModal
        visible={overviewVisible}
        userId={userId}
        userData={userData}
        onClose={() => setOverviewVisible(false)}
      />

      {/* ── Logout Confirmation Modal ── */}
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View style={logoutModalStyles.overlay}>
          <View style={logoutModalStyles.content}>
            <View style={logoutModalStyles.iconBox}>
              <Ionicons name="log-out-outline" size={22} color="#C0392B" />
            </View>
            <Text style={logoutModalStyles.title}>Log Out?</Text>
            <Text style={logoutModalStyles.message}>
              You will be signed out of your account.
            </Text>
            <View style={logoutModalStyles.buttonsRow}>
              <TouchableOpacity
                style={[logoutModalStyles.btn, logoutModalStyles.btnCancel]}
                onPress={() => setShowLogoutModal(false)}
                activeOpacity={0.7}
                disabled={loggingOut}
              >
                <Text style={logoutModalStyles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  logoutModalStyles.btn,
                  logoutModalStyles.btnLogout,
                  loggingOut && { opacity: 0.6 },
                ]}
                onPress={handleLogout}
                activeOpacity={0.7}
                disabled={loggingOut}
              >
                {loggingOut ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={logoutModalStyles.btnLogoutText}>Log Out</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Header */}
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
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>⚠️ {error}</Text>
            </View>
          )}

          {/* Avatar + Identity */}
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
            {userData?.bio ? (
              <Text style={styles.bioText}>{userData.bio}</Text>
            ) : null}

            {/* ── Follower / Following counts ── */}
            <View style={styles.followCountsRow}>
              <TouchableOpacity
                style={styles.followCountItem}
                activeOpacity={0.75}
                onPress={() =>
                  router.push({
                    pathname: "/followers-screen",
                    params: {
                      userId,
                      tab: "followers",
                      username: userData?.username ?? "",
                    },
                  } as any)
                }
              >
                <Text style={styles.followCountNum}>{followerCount}</Text>
                <Text style={styles.followCountLabel}>Followers</Text>
              </TouchableOpacity>

              <View style={styles.followCountDivider} />

              <TouchableOpacity
                style={styles.followCountItem}
                activeOpacity={0.75}
                onPress={() =>
                  router.push({
                    pathname: "/followers-screen",
                    params: {
                      userId,
                      tab: "following",
                      username: userData?.username ?? "",
                    },
                  } as any)
                }
              >
                <Text style={styles.followCountNum}>{followingCount}</Text>
                <Text style={styles.followCountLabel}>Following</Text>
              </TouchableOpacity>
            </View>

            <RatingHeroCard
              rating={ratingValue}
              ratingCount={ratingCount}
              distribution={reviewDistribution}
            />

            <TouchableOpacity
              style={styles.overviewBadge}
              onPress={() => setOverviewVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.overviewText}>View All Reviews</Text>
              <Ionicons name="star" size={18} color="#FFB800" />
            </TouchableOpacity>
          </View>

          {/* Stats */}
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
            <StatCard
              iconName="bookmark"
              label="Saved"
              count={userData?.savedCount ?? 0}
              onPress={() => router.push("/saved-posts" as any)}
            />
          </View>

          {/* Recent Reviews */}
          <RecentReviewsSection
            userId={userId}
            ratingCount={ratingCount}
            onSeeAll={() => setOverviewVisible(true)}
          />

          {/* Settings */}
          <Text style={styles.sectionTitle}>Settings</Text>
          <View style={styles.sectionCard}>
            <SettingsRow
              label="FAQs"
              subtitle="Frequently Asked Questions"
              onPress={() => router.push("/Faq" as any)}
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

          <View style={styles.sectionCard}>
            <SettingsRow
              label="Trade History"
              subtitle="View all past trades"
              onPress={() => router.push("/trade-history" as any)}
            />
            <SettingsRow
              label="Log Out"
              danger
              onPress={() => setShowLogoutModal(true)}
            />
          </View>


        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F9" },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F4F5F9",
  },
  loadingText: { color: "#888", fontSize: 14, marginTop: 12 },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: "#F4F5F9",
  },
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
  scrollContent: { paddingBottom: 40 },
  errorBanner: {
    backgroundColor: "#FFF3CD",
    padding: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: "#F5A623",
  },
  errorBannerText: { color: "#856404", fontSize: 13, fontWeight: "500" },
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
  contactLine: { color: "#888", fontSize: 13.5, marginTop: 3 },
  bioText: {
    color: "#555",
    fontSize: 13.5,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 19,
    paddingHorizontal: 12,
    fontStyle: "italic",
  },

  // ── Follower / Following counts ──
  followCountsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 4,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 32,
    gap: 0,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    width: "100%",
  },
  followCountItem: { flex: 1, alignItems: "center" },
  followCountNum: { fontSize: 22, fontWeight: "900", color: DARK_BLUE },
  followCountLabel: {
    fontSize: 11,
    color: "#aaa",
    fontWeight: "600",
    marginTop: 2,
    textTransform: "uppercase",
  },
  followCountDivider: { width: 1, height: 36, backgroundColor: "#ececec" },

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
  statCard: { flex: 1, alignItems: "center", gap: 3 },
  statDivider: { width: 1, height: 50, backgroundColor: "#ECECEC" },
  statTopLabel: {
    fontSize: 11,
    color: "#999",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
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
  settingsRowLabel: { fontSize: 15, color: "#1A1A2E", fontWeight: "600" },
  settingsRowSubtitle: { fontSize: 12, color: "#AAAAAA", marginTop: 2 },
  settingsRowChevron: { fontSize: 22, color: "#CCCCCC" },
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
  footerValue: { fontSize: 14, color: "#333", fontWeight: "500" },
});

const ratingStyles = StyleSheet.create({
  wrapper: { alignItems: "center" },
  starsRow: { flexDirection: "row" },
});

const heroStyles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 4,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    width: "100%",
  },
  left: { alignItems: "center", width: 90, gap: 4 },
  bigNumber: {
    fontSize: 42,
    fontWeight: "800",
    color: "#1A1A2E",
    lineHeight: 46,
    letterSpacing: -1,
  },
  starsRow: { flexDirection: "row", gap: 2 },
  countLabel: {
    fontSize: 11,
    color: "#AAAAAA",
    fontWeight: "500",
    textAlign: "center",
    marginTop: 2,
  },
  divider: {
    width: 1,
    height: 70,
    backgroundColor: "#ECECEC",
    marginHorizontal: 16,
  },
  bars: { flex: 1, gap: 5 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  barLabel: {
    fontSize: 11,
    color: "#888",
    fontWeight: "600",
    width: 10,
    textAlign: "right",
    marginRight: 2,
  },
  barTrack: {
    flex: 1,
    height: 6,
    backgroundColor: "#F0F0F0",
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 3 },
  barPct: { fontSize: 10, color: "#AAAAAA", width: 30, textAlign: "right" },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
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
    marginBottom: 4,
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
    justifyContent: "center",
    marginBottom: 10,
  },
  submitText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  cancelBtn: { paddingVertical: 12, alignItems: "center" },
  cancelText: { color: "#888", fontWeight: "600", fontSize: 14 },
  successBox: { paddingVertical: 32, alignItems: "center", gap: 4 },
  successText: { fontSize: 18, fontWeight: "700", color: "#1A1A2E" },
});

const reportStyles = StyleSheet.create({
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 10,
  },
  sectionLabelError: {
    color: ACCENT_RED,
  },
  validationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: -10,
    marginBottom: 12,
  },
  validationText: {
    fontSize: 12,
    color: ACCENT_RED,
    fontWeight: "600",
  },
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
  categoryPillSelected: { borderColor: DARK_BLUE, backgroundColor: "#ECEDF8" },
  categoryLabel: { fontSize: 13, fontWeight: "600", color: "#555" },
  categoryLabelSelected: { color: DARK_BLUE },
  charCount: {
    fontSize: 11,
    color: "#AAAAAA",
    textAlign: "right",
    marginBottom: 16,
    marginTop: 2,
  },
  charCountLimit: {
    color: ACCENT_RED,
    fontWeight: "700",
  },
  photoLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 10,
  },
  photoLabelHint: { fontWeight: "500", color: "#AAAAAA" },
  photoRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  photoThumbWrapper: { position: "relative", width: 72, height: 72 },
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
  photoAddIcon: { fontSize: 22, color: "#AAAAAA", lineHeight: 26 },
  photoAddLabel: { fontSize: 11, color: "#AAAAAA", fontWeight: "600" },
});

const ovStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: 12,
    maxHeight: "88%",
    flex: 1,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DDD",
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 20,
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F7F8FC",
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
  },
  heroLeft: { alignItems: "center", width: 88, gap: 4 },
  heroNumber: {
    fontSize: 46,
    fontWeight: "800",
    color: "#1A1A2E",
    lineHeight: 50,
    letterSpacing: -1,
  },
  heroStars: { flexDirection: "row", gap: 2 },
  heroCount: {
    fontSize: 11,
    color: "#AAAAAA",
    fontWeight: "500",
    marginTop: 2,
    textAlign: "center",
  },
  heroDivider: {
    width: 1,
    height: 72,
    backgroundColor: "#E0E0E0",
    marginHorizontal: 16,
  },
  heroBars: { flex: 1, gap: 6 },
  heroBarRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  heroBarLabel: {
    fontSize: 11,
    color: "#AAAAAA",
    fontWeight: "600",
    width: 10,
    textAlign: "right",
    marginRight: 2,
  },
  heroBarLabelActive: { color: "#1A1A2E" },
  heroBarTrack: {
    flex: 1,
    height: 7,
    backgroundColor: "#E8E8E8",
    borderRadius: 4,
    overflow: "hidden",
  },
  heroBarFill: { height: "100%", borderRadius: 4 },
  heroBarCount: {
    fontSize: 10,
    color: "#AAAAAA",
    width: 18,
    textAlign: "right",
  },
  filterRow: { flexDirection: "row", gap: 8, paddingBottom: 14 },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#F0F0F0",
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  filterPillActive: { backgroundColor: DARK_BLUE, borderColor: DARK_BLUE },
  filterPillText: { fontSize: 13, fontWeight: "600", color: "#555" },
  filterPillTextActive: { color: "#fff" },
  reviewCard: {
    backgroundColor: "#F9F9FB",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  reviewTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 8,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#E8E8E8",
  },
  avatarFallback: {
    backgroundColor: DARK_BLUE,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: { color: "#fff", fontSize: 15, fontWeight: "800" },
  reviewerName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 3,
  },
  reviewStars: { flexDirection: "row", alignItems: "center", gap: 2 },
  reviewRatingNum: {
    fontSize: 11,
    color: "#888",
    fontWeight: "600",
    marginLeft: 4,
  },
  reviewDate: {
    fontSize: 11,
    color: "#AAAAAA",
    fontWeight: "500",
    marginLeft: "auto",
    flexShrink: 0,
  },
  commentBox: { flexDirection: "row", gap: 4, paddingLeft: 48 },
  commentQuote: {
    fontSize: 24,
    color: "#E0E0E0",
    fontWeight: "800",
    lineHeight: 22,
    marginTop: -4,
  },
  comment: {
    flex: 1,
    fontSize: 13,
    color: "#555",
    lineHeight: 19,
    fontStyle: "italic",
  },
  noComment: {
    fontSize: 12,
    color: "#CCCCCC",
    paddingLeft: 48,
    fontStyle: "italic",
  },
  empty: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyText: {
    fontSize: 13,
    color: "#AAAAAA",
    textAlign: "center",
    lineHeight: 19,
    paddingHorizontal: 24,
    fontStyle: "italic",
  },
  closeBtn: {
    paddingVertical: 14,
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ECECEC",
    marginTop: 4,
  },
  closeBtnText: { fontSize: 15, fontWeight: "700", color: "#888" },
});

const reviewSectionStyles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1A1A2E",
    letterSpacing: 0.2,
  },
  countPill: {
    backgroundColor: DARK_BLUE,
    borderRadius: 10,
    minWidth: 22,
    height: 22,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  countPillText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  emptyBox: { alignItems: "center", paddingVertical: 20, gap: 8 },
  emptyText: {
    fontSize: 13,
    color: "#AAAAAA",
    textAlign: "center",
    lineHeight: 18,
    fontStyle: "italic",
    paddingHorizontal: 8,
  },
  reviewRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ECECEC",
    alignItems: "flex-start",
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#E8E8E8",
  },
  avatarPlaceholder: {
    backgroundColor: DARK_BLUE,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: { color: "#fff", fontSize: 14, fontWeight: "800" },
  reviewBody: { flex: 1, gap: 3 },
  reviewMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  reviewerName: { fontSize: 13, fontWeight: "700", color: "#1A1A2E" },
  starsRow: { flexDirection: "row", gap: 1 },
  date: {
    fontSize: 11,
    color: "#AAAAAA",
    fontWeight: "500",
    marginLeft: "auto",
  },
  comment: { fontSize: 13, color: "#555", lineHeight: 18 },
  seeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingTop: 12,
    marginTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ECECEC",
  },
  seeAllText: { fontSize: 13, fontWeight: "700", color: DARK_BLUE },
});

const logoutModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    width: "82%",
    maxWidth: 340,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    alignItems: "center",
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FEF3C7",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1A1A2E",
    marginBottom: 8,
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    color: "#666",
    marginBottom: 24,
    lineHeight: 20,
    textAlign: "center",
  },
  buttonsRow: { flexDirection: "row", gap: 10, width: "100%" },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 44,
  },
  btnCancel: { backgroundColor: "#F0F0F0", borderWidth: 1, borderColor: "#E0E0E0" },
  btnCancelText: { fontSize: 14, fontWeight: "600", color: "#555" },
  btnLogout: { backgroundColor: "#C0392B" },
  btnLogoutText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});