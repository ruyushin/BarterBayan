//edit-profile.tsx
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  User,
} from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../firebaseConfig";

// ─── Cloudinary Config ────────────────────────────────────────────────────────
// Make sure these are set in your .env file:
//   EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name
//   EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET=barterbayan_avatars
const CLOUDINARY_CLOUD_NAME =
  process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";
const CLOUDINARY_UPLOAD_PRESET =
  process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "";
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

// ─── Constants ────────────────────────────────────────────────────────────────
const DARK_BLUE = "#2D2D7A";
const HEADER_BG = "#2f2f6f";
const LIGHT_BG = "#F4F5F9";
const ACCENT_RED = "#C0392B";
const GOLD = "#C9A227";
const SUCCESS_GREEN = "#065F46";

// ─── Types ────────────────────────────────────────────────────────────────────
interface FormState {
  username: string;
  phone: string;
  bio: string;
  location: string;
}

interface FormErrors {
  username?: string;
  phone?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function validateForm(values: FormState): FormErrors {
  const errors: FormErrors = {};

  if (!values.username.trim()) {
    errors.username = "Username is required.";
  } else if (values.username.trim().length < 3) {
    errors.username = "Username must be at least 3 characters.";
  } else if (values.username.trim().length > 30) {
    errors.username = "Username must be 30 characters or fewer.";
  } else if (!/^[a-zA-Z0-9_. ]+$/.test(values.username.trim())) {
    errors.username = "Only letters, numbers, spaces, underscores, and dots.";
  }

  if (
    values.phone.trim() &&
    !/^\+?[0-9\s\-().]{7,20}$/.test(values.phone.trim())
  ) {
    errors.phone = "Please enter a valid phone number.";
  }

  return errors;
}

// ─── Upload avatar to Cloudinary ──────────────────────────────────────────────
async function uploadAvatarToCloudinary(
  localUri: string,
  onProgress: (pct: number) => void,
): Promise<string> {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    throw new Error(
      "Cloudinary is not configured. Set EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME and EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET in your .env file.",
    );
  }

  // Read the file as a blob via XHR (reliable in React Native)
  const blob: Blob = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => resolve(xhr.response as Blob);
    xhr.onerror = () => reject(new TypeError("Failed to read local file."));
    xhr.responseType = "blob";
    xhr.open("GET", localUri, true);
    xhr.send(null);
  });

  // Build the multipart form body
  const formData = new FormData();
  formData.append("file", blob as any);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("folder", "avatars");

  // Upload with progress tracking via XHR
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          // Use secure_url — the permanent HTTPS URL Cloudinary gives us
          resolve(response.secure_url as string);
        } catch {
          reject(new Error("Invalid response from Cloudinary."));
        }
      } else {
        reject(
          new Error(
            `Upload failed with status ${xhr.status}: ${xhr.responseText}`,
          ),
        );
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload."));

    xhr.open("POST", CLOUDINARY_UPLOAD_URL, true);
    xhr.send(formData);
  });
}

// ─── Floating Label Input ─────────────────────────────────────────────────────
function FloatingInput({
  label,
  value,
  onChangeText,
  error,
  hint,
  maxLength,
  keyboardType,
  multiline,
  numberOfLines,
  autoCapitalize,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  hint?: string;
  maxLength?: number;
  keyboardType?: "default" | "phone-pad" | "email-address";
  multiline?: boolean;
  numberOfLines?: number;
  autoCapitalize?: "none" | "sentences" | "words";
  editable?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const borderAnim = useRef(new Animated.Value(0)).current;

  const onFocus = () => {
    setFocused(true);
    Animated.spring(borderAnim, {
      toValue: 1,
      useNativeDriver: false,
      tension: 120,
    }).start();
  };
  const onBlur = () => {
    setFocused(false);
    Animated.spring(borderAnim, {
      toValue: 0,
      useNativeDriver: false,
      tension: 120,
    }).start();
  };

  const borderColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [
      error ? ACCENT_RED : "#E0E0E0",
      error ? ACCENT_RED : DARK_BLUE,
    ],
  });

  const hasValue = value.length > 0;
  const labelActive = focused || hasValue;

  return (
    <View style={inputStyles.wrapper}>
      <Animated.View
        style={[
          inputStyles.container,
          { borderColor },
          !editable && inputStyles.containerDisabled,
        ]}
      >
        <Text
          style={[
            inputStyles.label,
            labelActive && inputStyles.labelActive,
            focused && inputStyles.labelFocused,
            error && inputStyles.labelError,
          ]}
        >
          {label}
        </Text>

        <TextInput
          style={[
            inputStyles.input,
            multiline && inputStyles.inputMultiline,
            !editable && inputStyles.inputDisabled,
          ]}
          value={value}
          onChangeText={onChangeText}
          onFocus={onFocus}
          onBlur={onBlur}
          maxLength={maxLength}
          keyboardType={keyboardType ?? "default"}
          multiline={multiline}
          numberOfLines={numberOfLines}
          textAlignVertical={multiline ? "top" : "center"}
          autoCapitalize={autoCapitalize ?? "sentences"}
          editable={editable}
          placeholderTextColor="transparent"
          placeholder=" "
        />

        {maxLength && focused && (
          <Text style={inputStyles.counter}>
            {value.length}/{maxLength}
          </Text>
        )}
      </Animated.View>

      {error ? (
        <Text style={inputStyles.errorText}>⚠ {error}</Text>
      ) : hint ? (
        <Text style={inputStyles.hintText}>{hint}</Text>
      ) : null}
    </View>
  );
}

// ─── Save Button ──────────────────────────────────────────────────────────────
function SaveButton({
  onPress,
  saving,
  saved,
  disabled,
}: {
  onPress: () => void;
  saving: boolean;
  saved: boolean;
  disabled: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () =>
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start();
  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();

  const bgColor = saved ? "#D1FAE5" : DARK_BLUE;
  const textColor = saved ? SUCCESS_GREEN : "#fff";

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[
          saveStyles.btn,
          { backgroundColor: bgColor },
          disabled && saveStyles.btnDisabled,
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.85}
        disabled={disabled || saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : saved ? (
          <Text style={[saveStyles.text, { color: textColor }]}>✓ Saved!</Text>
        ) : (
          <Text style={[saveStyles.text, { color: textColor }]}>
            Save Changes
          </Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Upload Progress Bar ──────────────────────────────────────────────────────
function UploadProgress({ progress }: { progress: number }) {
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: progress,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  return (
    <View style={uploadStyles.track}>
      <Animated.View
        style={[
          uploadStyles.fill,
          {
            width: widthAnim.interpolate({
              inputRange: [0, 100],
              outputRange: ["0%", "100%"],
            }),
          },
        ]}
      />
    </View>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return <Text style={sectionStyles.title}>{title}</Text>;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function EditProfileScreen() {
  const router = useRouter();

  // Auth
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Form
  const [form, setForm] = useState<FormState>({
    username: "",
    phone: "",
    bio: "",
    location: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [originalForm, setOriginalForm] = useState<FormState | null>(null);

  // Avatar
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [originalAvatarUri, setOriginalAvatarUri] = useState<string | null>(
    null,
  );
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploading, setUploading] = useState(false);

  // Email (read-only)
  const [email, setEmail] = useState("");

  // Page state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  const animateIn = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
      }),
    ]).start();
  };

  // ── Load user data ──
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthReady(true);
      if (!user) {
        router.replace("/login");
        return;
      }
      setCurrentUser(user);
      setEmail(user.email ?? "");

      try {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const loaded: FormState = {
            username: data.username ?? user.displayName ?? "",
            phone: data.phone ?? "",
            bio: data.bio ?? "",
            location: data.location ?? "",
          };
          setForm(loaded);
          setOriginalForm(loaded);
          const av: string | null = data.avatarUrl ?? null;
          setAvatarUri(av);
          setOriginalAvatarUri(av);
        }
      } catch (err) {
        console.error("Failed to load profile:", err);
      } finally {
        setLoading(false);
        animateIn();
      }
    });
    return () => unsub();
  }, []);

  // ── Derived state ──
  const isDirty =
    JSON.stringify(form) !== JSON.stringify(originalForm) ||
    avatarUri !== originalAvatarUri;

  const setField = (key: keyof FormState) => (val: string) => {
    setSaved(false);
    setForm((prev) => ({ ...prev, [key]: val }));
    if (errors[key as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  // ── Avatar picker ──
  const handlePickAvatar = async () => {
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
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.75,
    });

    if (!result.canceled && result.assets.length > 0) {
      setAvatarUri(result.assets[0].uri);
      setSaved(false);
    }
  };

  const handleRemoveAvatar = () => {
    Alert.alert(
      "Remove photo",
      "Are you sure you want to remove your profile photo?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            setAvatarUri(null);
            setSaved(false);
          },
        },
      ],
    );
  };

  // ── Save ──
  const handleSave = async () => {
    const validationErrors = validateForm(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    if (!currentUser) return;
    setSaving(true);

    try {
      let finalAvatarUrl: string | null = originalAvatarUri;

      // Upload new avatar to Cloudinary if it changed
      if (avatarUri && avatarUri !== originalAvatarUri) {
        setUploading(true);
        setUploadProgress(0);
        try {
          finalAvatarUrl = await uploadAvatarToCloudinary(avatarUri, (pct) => {
            setUploadProgress(pct);
          });
        } finally {
          setUploading(false);
          setUploadProgress(0);
        }
      } else if (!avatarUri) {
        // User removed their avatar
        finalAvatarUrl = null;
      }

      // Update Firestore document
      const docRef = doc(db, "users", currentUser.uid);
      await updateDoc(docRef, {
        username: form.username.trim(),
        phone: form.phone.trim(),
        bio: form.bio.trim(),
        location: form.location.trim(),
        avatarUrl: finalAvatarUrl ?? "",
        updatedAt: new Date(),
      });

      // Sync Firebase Auth display name & photo
      await updateProfile(currentUser, {
        displayName: form.username.trim(),
        photoURL: finalAvatarUrl ?? "",
      });

      // Commit new originals so isDirty resets to false
      const committed: FormState = {
        username: form.username.trim(),
        phone: form.phone.trim(),
        bio: form.bio.trim(),
        location: form.location.trim(),
      };
      setOriginalForm(committed);
      setOriginalAvatarUri(finalAvatarUrl);
      setAvatarUri(finalAvatarUrl);
      setForm(committed);

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      console.error("Save error:", err);
      Alert.alert(
        "Save failed",
        err?.message ?? "Something went wrong. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  // ── Discard ──
  const handleDiscard = () => {
    Alert.alert("Discard changes?", "Your unsaved changes will be lost.", [
      { text: "Keep editing", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          if (originalForm) setForm(originalForm);
          setAvatarUri(originalAvatarUri);
          setErrors({});
          setSaved(false);
        },
      },
    ]);
  };

  // ── Loading ──
  if (!authReady || loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={DARK_BLUE} />
          <Text style={styles.loadingText}>Loading profile…</Text>
        </View>
      </View>
    );
  }

  const initial = (form.username?.trim()[0] ?? "U").toUpperCase();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (isDirty) {
              Alert.alert("Discard changes?", "You have unsaved changes.", [
                { text: "Keep editing", style: "cancel" },
                {
                  text: "Leave",
                  style: "destructive",
                  onPress: () => router.back(),
                },
              ]);
            } else {
              router.back();
            }
          }}
          activeOpacity={0.75}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Edit Profile</Text>

        {isDirty ? (
          <TouchableOpacity
            onPress={handleDiscard}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.discardText}>Discard</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View
          style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
        >
          {/* ── Avatar Section ── */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarOuter}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitial}>{initial}</Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.cameraBadge}
                onPress={handlePickAvatar}
                activeOpacity={0.8}
              >
                <Text style={styles.cameraIcon}>📷</Text>
              </TouchableOpacity>
            </View>

            {/* Upload progress — shown while Cloudinary upload is in flight */}
            {uploading && (
              <View style={styles.uploadProgressWrapper}>
                <UploadProgress progress={uploadProgress} />
                <Text style={styles.uploadProgressText}>
                  Uploading… {Math.round(uploadProgress)}%
                </Text>
              </View>
            )}

            <View style={styles.avatarActions}>
              <TouchableOpacity
                style={styles.avatarActionBtn}
                onPress={handlePickAvatar}
                activeOpacity={0.75}
              >
                <Text style={styles.avatarActionText}>Change Photo</Text>
              </TouchableOpacity>

              {avatarUri && (
                <TouchableOpacity
                  style={[styles.avatarActionBtn, styles.avatarActionBtnDanger]}
                  onPress={handleRemoveAvatar}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.avatarActionText,
                      styles.avatarActionTextDanger,
                    ]}
                  >
                    Remove
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ── Public Info ── */}
          <SectionHeader title="Public Info" />
          <View style={styles.card}>
            <FloatingInput
              label="Username"
              value={form.username}
              onChangeText={setField("username")}
              error={errors.username}
              hint="This is how others will find you."
              maxLength={30}
              autoCapitalize="none"
            />
            <FloatingInput
              label="Bio"
              value={form.bio}
              onChangeText={setField("bio")}
              hint="Tell traders a little about yourself."
              maxLength={120}
              multiline
              numberOfLines={3}
            />
            <FloatingInput
              label="Location"
              value={form.location}
              onChangeText={setField("location")}
              hint="City or region — helps local traders find you."
              maxLength={60}
              autoCapitalize="words"
            />
          </View>

          {/* ── Contact Info ── */}
          <SectionHeader title="Contact Info" />
          <View style={styles.card}>
            <FloatingInput
              label="Email address"
              value={email}
              onChangeText={() => {}}
              editable={false}
              hint="Email cannot be changed here. Contact support."
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <FloatingInput
              label="Phone number"
              value={form.phone}
              onChangeText={setField("phone")}
              error={errors.phone}
              hint="Optional. Visible only to your trade partners."
              keyboardType="phone-pad"
            />
          </View>

          {/* ── Account / Danger Zone ── */}
          <SectionHeader title="Account" />
          <View style={[styles.card, styles.dangerCard]}>
            <TouchableOpacity
              style={styles.dangerRow}
              activeOpacity={0.7}
              onPress={() =>
                Alert.alert(
                  "Change Password",
                  "A password reset email will be sent to " + email,
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Send",
                      onPress: async () => {
                        try {
                          await sendPasswordResetEmail(auth, email);
                          Alert.alert(
                            "Email sent",
                            "Check your inbox to reset your password.",
                          );
                        } catch (e: any) {
                          Alert.alert(
                            "Error",
                            e?.message ?? "Failed to send reset email.",
                          );
                        }
                      },
                    },
                  ],
                )
              }
            >
              <View>
                <Text style={styles.dangerRowLabel}>Change Password</Text>
                <Text style={styles.dangerRowSub}>
                  Send a reset link to your email
                </Text>
              </View>
              <Text style={styles.dangerChevron}>›</Text>
            </TouchableOpacity>

            <View style={styles.dangerDivider} />

            <TouchableOpacity
              style={styles.dangerRow}
              activeOpacity={0.7}
              onPress={() =>
                Alert.alert(
                  "Delete Account",
                  "This is permanent. All your listings, trades, and data will be erased.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete my account",
                      style: "destructive",
                      onPress: () => {
                        Alert.alert(
                          "Contact support",
                          "Please email support@barterbayan.com to complete account deletion.",
                        );
                      },
                    },
                  ],
                )
              }
            >
              <View>
                <Text style={[styles.dangerRowLabel, { color: ACCENT_RED }]}>
                  Delete Account
                </Text>
                <Text style={styles.dangerRowSub}>
                  Permanently erase all your data
                </Text>
              </View>
              <Text style={[styles.dangerChevron, { color: ACCENT_RED }]}>
                ›
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Save Button ── */}
          <View style={styles.saveWrapper}>
            <SaveButton
              onPress={handleSave}
              saving={saving}
              saved={saved}
              disabled={!isDirty || saving}
            />
            {!isDirty && !saved && (
              <Text style={styles.noChangesText}>No unsaved changes</Text>
            )}
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LIGHT_BG,
  },
  header: {
    backgroundColor: HEADER_BG,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 15,
    paddingBottom: 15,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  backIcon: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "300",
    lineHeight: 32,
    marginTop: -2,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  headerSpacer: { width: 60 },
  discardText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    fontWeight: "600",
    width: 60,
    textAlign: "right",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#888",
  },
  scrollContent: {
    paddingBottom: 56,
  },
  avatarSection: {
    alignItems: "center",
    paddingVertical: 32,
    backgroundColor: "#fff",
    marginBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ECECEC",
  },
  avatarOuter: {
    position: "relative",
    width: 100,
    height: 100,
    marginBottom: 14,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#ddd",
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: DARK_BLUE,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: {
    color: "#fff",
    fontSize: 38,
    fontWeight: "800",
  },
  cameraBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: GOLD,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2.5,
    borderColor: "#fff",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  cameraIcon: { fontSize: 14 },
  uploadProgressWrapper: {
    width: "60%",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  uploadProgressText: {
    fontSize: 12,
    color: "#888",
    fontWeight: "500",
  },
  avatarActions: {
    flexDirection: "row",
    gap: 10,
  },
  avatarActionBtn: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: DARK_BLUE,
    backgroundColor: "#ECEDF8",
  },
  avatarActionBtnDanger: {
    borderColor: ACCENT_RED,
    backgroundColor: "#FEE2E2",
  },
  avatarActionText: {
    fontSize: 13,
    fontWeight: "700",
    color: DARK_BLUE,
  },
  avatarActionTextDanger: {
    color: ACCENT_RED,
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 6,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 16,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  dangerCard: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    overflow: "hidden",
  },
  dangerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 15,
  },
  dangerRowLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1A1A2E",
  },
  dangerRowSub: {
    fontSize: 12,
    color: "#AAAAAA",
    marginTop: 2,
  },
  dangerChevron: {
    fontSize: 22,
    color: "#CCCCCC",
  },
  dangerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#ECECEC",
    marginHorizontal: 18,
  },
  saveWrapper: {
    marginHorizontal: 16,
    marginTop: 24,
    alignItems: "center",
    gap: 10,
  },
  noChangesText: {
    fontSize: 12,
    color: "#BBBBBB",
    fontWeight: "500",
  },
});

// ─── Input Styles ─────────────────────────────────────────────────────────────
const inputStyles = StyleSheet.create({
  wrapper: {
    marginVertical: 10,
  },
  container: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 20,
    paddingBottom: 10,
    backgroundColor: "#FAFAFA",
    position: "relative",
  },
  containerDisabled: {
    backgroundColor: "#F0F0F0",
  },
  label: {
    position: "absolute",
    left: 14,
    top: 15,
    fontSize: 14,
    color: "#AAAAAA",
    fontWeight: "500",
    zIndex: 1,
  },
  labelActive: {
    top: 6,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "#888",
  },
  labelFocused: {
    color: DARK_BLUE,
  },
  labelError: {
    color: ACCENT_RED,
  },
  input: {
    fontSize: 15,
    color: "#1A1A2E",
    fontWeight: "500",
    paddingTop: 2,
    paddingBottom: 0,
    minHeight: 28,
  },
  inputMultiline: {
    minHeight: 64,
    paddingTop: 4,
  },
  inputDisabled: {
    color: "#AAAAAA",
  },
  counter: {
    position: "absolute",
    right: 12,
    bottom: 8,
    fontSize: 10,
    color: "#CCCCCC",
    fontWeight: "600",
  },
  errorText: {
    fontSize: 12,
    color: ACCENT_RED,
    fontWeight: "500",
    marginTop: 4,
    marginLeft: 4,
  },
  hintText: {
    fontSize: 11.5,
    color: "#BBBBBB",
    marginTop: 4,
    marginLeft: 4,
    fontStyle: "italic",
  },
});

// ─── Save Button Styles ───────────────────────────────────────────────────────
const saveStyles = StyleSheet.create({
  btn: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: DARK_BLUE,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  btnDisabled: {
    opacity: 0.45,
    elevation: 0,
    shadowOpacity: 0,
  },
  text: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
});

// ─── Upload Progress Styles ───────────────────────────────────────────────────
const uploadStyles = StyleSheet.create({
  track: {
    width: "100%",
    height: 4,
    backgroundColor: "#E0E0E0",
    borderRadius: 2,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    backgroundColor: DARK_BLUE,
    borderRadius: 2,
  },
});

// ─── Section Header Styles ────────────────────────────────────────────────────
const sectionStyles = StyleSheet.create({
  title: {
    fontSize: 13,
    fontWeight: "800",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginHorizontal: 20,
    marginTop: 22,
    marginBottom: 8,
  },
});
