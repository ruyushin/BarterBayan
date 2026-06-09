import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import {
  onAuthStateChanged,
  updateProfile,
  User
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
import { DeleteAccountModal } from "../components/DeleteAccountModal";
import { auth, db } from "../firebaseConfig";

// ─── Cloudinary Config ────────────────────────────────────────────────────────
const CLOUDINARY_CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";
const CLOUDINARY_UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "";
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
  firstName: string;
  middleName: string;
  lastName: string;
  phone: string;
  bio: string;
}

interface FormErrors {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function validateForm(values: FormState): FormErrors {
  const errors: FormErrors = {};

  if (!values.firstName.trim()) {
    errors.firstName = "First name is required.";
  } else if (values.firstName.trim().length < 2) {
    errors.firstName = "First name must be at least 2 characters.";
  } else if (!/^[a-zA-ZÀ-ÖØ-öø-ÿÑñ\s\-'.]+$/.test(values.firstName.trim())) {
    errors.firstName = "Only letters, spaces, hyphens, and apostrophes.";
  }

  if (!values.lastName.trim()) {
    errors.lastName = "Last name is required.";
  } else if (values.lastName.trim().length < 2) {
    errors.lastName = "Last name must be at least 2 characters.";
  } else if (!/^[a-zA-ZÀ-ÖØ-öø-ÿÑñ\s\-'.]+$/.test(values.lastName.trim())) {
    errors.lastName = "Only letters, spaces, hyphens, and apostrophes.";
  }

  if (values.phone.trim()) {
    let digits = values.phone.trim().replace(/\D/g, "");
    if (digits.startsWith("63")) digits = digits.slice(2);
    else if (digits.startsWith("0")) digits = digits.slice(1);
    if (digits.length !== 10) {
      errors.phone = "Enter a valid 10-digit Philippine mobile number.";
    }
  }

  return errors;
}

// ─── Upload to Cloudinary ─────────────────────────────────────────────────────
async function uploadAvatarToCloudinary(
  localUri: string,
  onProgress: (pct: number) => void,
): Promise<string> {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    throw new Error(
      "Cloudinary is not configured.\n\n" +
      "Environment variables missing:\n" +
      (CLOUDINARY_CLOUD_NAME ? "" : "- EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME\n") +
      (CLOUDINARY_UPLOAD_PRESET ? "" : "- EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET\n") +
      "\nMake sure these are set in your .env file.\n" +
      "If you recently added them, restart your Expo dev server with:\n" +
      "1. Press Ctrl+C in terminal\n" +
      "2. Run: npx expo start -c (to clear cache)\n" +
      "3. Restart the app",
    );
  }

  const blob: Blob = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => resolve(xhr.response as Blob);
    xhr.onerror = () => reject(new TypeError("Failed to read local file."));
    xhr.responseType = "blob";
    xhr.open("GET", localUri, true);
    xhr.send(null);
  });

  const formData = new FormData();
  formData.append("file", blob as any);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("folder", "avatars");

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
          resolve(response.secure_url as string);
        } catch {
          reject(new Error("Invalid response from Cloudinary."));
        }
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
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
    Animated.spring(borderAnim, { toValue: 1, useNativeDriver: false, tension: 120 }).start();
  };
  const onBlur = () => {
    setFocused(false);
    Animated.spring(borderAnim, { toValue: 0, useNativeDriver: false, tension: 120 }).start();
  };

  const borderColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [error ? ACCENT_RED : "#E0E0E0", error ? ACCENT_RED : DARK_BLUE],
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
        {maxLength && focused && !multiline && (
          <Text style={inputStyles.counter}>{value.length}/{maxLength}</Text>
        )}
      </Animated.View>

      {error ? (
        <View style={inputStyles.errorContainer}>
          <Ionicons name="alert-circle" size={14} color={ACCENT_RED} style={{ marginTop: 1 }} />
          <Text style={inputStyles.errorText}>{error}</Text>
        </View>
      ) : hint ? (
        <Text style={inputStyles.hintText}>{hint}</Text>
      ) : null}
    </View>
  );
}

// ─── Phone Input ──────────────────────────────────────────────────────────────
function PhoneInput({
  value,
  onChangeText,
  error,
  editable = true,
}: {
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  editable?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const borderAnim = useRef(new Animated.Value(0)).current;

  const onFocus = () => {
    setFocused(true);
    Animated.spring(borderAnim, { toValue: 1, useNativeDriver: false, tension: 120 }).start();
  };
  const onBlur = () => {
    setFocused(false);
    Animated.spring(borderAnim, { toValue: 0, useNativeDriver: false, tension: 120 }).start();
  };

  const borderColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [error ? ACCENT_RED : "#E0E0E0", error ? ACCENT_RED : DARK_BLUE],
  });

  let displayValue = value.replace(/^\+63/, "").replace(/\D/g, "");
  if (displayValue.startsWith("0")) displayValue = displayValue.slice(1);

  const hasValue = displayValue.length > 0;
  const labelActive = focused || hasValue;

  return (
    <View style={inputStyles.wrapper}>
      <Animated.View
        style={[
          inputStyles.container,
          inputStyles.cleanPhoneContainer,
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
          Mobile Number
        </Text>
        <View style={inputStyles.phonePrefixInputRow}>
          <View style={inputStyles.phonePrefixBox}>
            <Ionicons name="phone-portrait-outline" size={14} color={DARK_BLUE} />
            <Text style={inputStyles.phonePrefix}>+63</Text>
          </View>
          <View style={inputStyles.phoneDivider} />
          <TextInput
            style={[inputStyles.phoneTextInput, !editable && inputStyles.inputDisabled]}
            value={displayValue}
            onChangeText={(text) => {
              const digits = text.replace(/\D/g, "").slice(0, 10);
              onChangeText(digits ? `+63${digits}` : "");
            }}
            onFocus={onFocus}
            onBlur={onBlur}
            keyboardType="number-pad"
            maxLength={10}
            editable={editable}
            placeholder="9XXXXXXXXX"
            placeholderTextColor="#CCCCCC"
          />
          <Text style={inputStyles.phoneCounter}>{displayValue.length}/10</Text>
        </View>
      </Animated.View>

      {error ? (
        <View style={inputStyles.errorContainer}>
          <Ionicons name="alert-circle" size={14} color={ACCENT_RED} style={{ marginTop: 1 }} />
          <Text style={inputStyles.errorText}>{error}</Text>
        </View>
      ) : (
        <Text style={inputStyles.hintText}>Philippine mobile number starting with 9</Text>
      )}
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
        style={[saveStyles.btn, { backgroundColor: bgColor }, disabled && saveStyles.btnDisabled]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.85}
        disabled={disabled || saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : saved ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="checkmark-circle" size={18} color={textColor} />
            <Text style={[saveStyles.text, { color: textColor }]}>Saved!</Text>
          </View>
        ) : (
          <Text style={[saveStyles.text, { color: textColor }]}>Save Changes</Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Upload Progress Bar ──────────────────────────────────────────────────────
function UploadProgress({ progress }: { progress: number }) {
  const widthAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(widthAnim, { toValue: progress, duration: 200, useNativeDriver: false }).start();
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

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [form, setForm] = useState<FormState>({
    firstName: "",
    middleName: "",
    lastName: "",
    phone: "",
    bio: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [originalForm, setOriginalForm] = useState<FormState | null>(null);

  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [originalAvatarUri, setOriginalAvatarUri] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploading, setUploading] = useState(false);

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  const animateIn = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80 }),
    ]).start();
  };

  const handleBackPress = () => {
    if (router.canGoBack?.()) {
      router.back();
    } else {
      router.replace("/(tabs)/profile");
    }
  };

  // ── Load user data ──
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthReady(true);
      if (!user) { router.replace("/login"); return; }
      setCurrentUser(user);
      setEmail(user.email ?? "");

      try {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();

          let firstName = data.firstName ?? "";
          let middleName = data.middleName ?? "";
          let lastName = data.lastName ?? "";

          if (!firstName && !lastName && data.username) {
            const parts = data.username.trim().split(" ");
            firstName = parts[0] ?? "";
            lastName = parts.slice(1).join(" ") ?? "";
          }
          if (!firstName && !lastName && user.displayName) {
            const parts = user.displayName.trim().split(" ");
            firstName = parts[0] ?? "";
            lastName = parts.slice(1).join(" ") ?? "";
          }

          const loaded: FormState = {
            firstName,
            middleName,
            lastName,
            phone: data.phone ?? "",
            bio: data.bio ?? "",
          };
          setForm(loaded);
          setOriginalForm(loaded);
          const av: string | null = data.avatarUrl ?? data.photo ?? null;
          setAvatarUri(av);
          setOriginalAvatarUri(av);
        }
      } catch (err) {
        console.error("Failed to load profile:", err);
        Alert.alert("Load Error", "Failed to load your profile. Please try again.");
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
      Alert.alert("Permission required", "Please allow access to your photo library.", [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => Linking.openSettings() },
      ]);
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
      "Remove Photo",
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
      setShowSaveModal(false);
      return;
    }
    if (!currentUser) return;
    setSaving(true);
    setShowSaveModal(false);

    try {
      let finalAvatarUrl: string | null = originalAvatarUri;

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
        finalAvatarUrl = null;
      }

      const nameParts = [
        form.firstName.trim(),
        form.middleName.trim(),
        form.lastName.trim(),
      ].filter(Boolean);
      const fullName = nameParts.join(" ");

      const docRef = doc(db, "users", currentUser.uid);
      await updateDoc(docRef, {
        firstName: form.firstName.trim(),
        middleName: form.middleName.trim() || null,
        lastName: form.lastName.trim(),
        username: fullName,
        phone: form.phone.trim(),
        bio: form.bio.trim(),
        avatarUrl: finalAvatarUrl ?? "",
        photo: finalAvatarUrl ?? "",
        updatedAt: new Date(),
      });

      await updateProfile(currentUser, {
        displayName: fullName,
        photoURL: finalAvatarUrl ?? "",
      });

      const committed: FormState = {
        firstName: form.firstName.trim(),
        middleName: form.middleName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        bio: form.bio.trim(),
      };
      setOriginalForm(committed);
      setOriginalAvatarUri(finalAvatarUrl);
      setAvatarUri(finalAvatarUrl);
      setForm(committed);

      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        setTimeout(() => handleBackPress(), 500);
      }, 1500);
    } catch (err: any) {
      console.error("Save error:", err);
      Alert.alert("Save failed", err?.message ?? "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ── Discard ──
  const confirmDiscard = () => {
    setShowDiscardModal(false);
    if (originalForm) setForm(originalForm);
    setAvatarUri(originalAvatarUri);
    setErrors({});
    setSaved(false);
    setTimeout(() => handleBackPress(), 150);
  };

  if (!authReady || loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
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

  const initial = (form.firstName?.trim()[0] ?? form.lastName?.trim()[0] ?? "U").toUpperCase();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      {/* ── Discard Changes Modal ── */}
      <AppModal visible={showDiscardModal} onRequestClose={() => setShowDiscardModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconRow}>
              <View style={styles.modalIconBox}>
                <Ionicons name="arrow-undo-outline" size={22} color={ACCENT_RED} />
              </View>
            </View>
            <Text style={styles.modalTitle}>Discard Changes?</Text>
            <Text style={styles.modalMessage}>
              All unsaved changes will be lost. This cannot be undone.
            </Text>
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setShowDiscardModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalBtnCancelText}>Keep Editing</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnDelete]}
                onPress={confirmDiscard}
                activeOpacity={0.7}
              >
                <Text style={styles.modalBtnDeleteText}>Discard</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </AppModal>

      {/* ── Save Changes Modal ── */}
      <AppModal visible={showSaveModal} onRequestClose={() => setShowSaveModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconRow}>
              <View style={[styles.modalIconBox, { backgroundColor: "#EEF0FB" }]}>
                <Ionicons name="checkmark-done-outline" size={22} color={DARK_BLUE} />
              </View>
            </View>
            <Text style={styles.modalTitle}>Save Changes?</Text>
            <Text style={styles.modalMessage}>
              Your profile will be updated with the new information.
            </Text>
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setShowSaveModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnSave]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.7}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalBtnSaveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </AppModal>

      {/* ── Delete Account Modal ── */}
      <DeleteAccountModal
        visible={deleteModalVisible}
        onClose={() => setDeleteModalVisible(false)}
        currentUser={currentUser}
        router={router}
      />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (isDirty) {
              setShowDiscardModal(true);
            } else {
              handleBackPress();
            }
          }}
          activeOpacity={0.75}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Edit Profile</Text>

        {isDirty ? (
          <TouchableOpacity
            onPress={() => setShowDiscardModal(true)}
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
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

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
              <TouchableOpacity style={styles.cameraBadge} onPress={handlePickAvatar} activeOpacity={0.8}>
                <Ionicons name="camera" size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            {uploading && (
              <View style={styles.uploadProgressWrapper}>
                <UploadProgress progress={uploadProgress} />
                <Text style={styles.uploadProgressText}>
                  Uploading… {Math.round(uploadProgress)}%
                </Text>
              </View>
            )}

            <View style={styles.avatarActions}>
              <TouchableOpacity style={styles.avatarActionBtn} onPress={handlePickAvatar} activeOpacity={0.75}>
                <Ionicons name="image-outline" size={14} color={DARK_BLUE} />
                <Text style={styles.avatarActionText}>Change Photo</Text>
              </TouchableOpacity>
              {avatarUri && (
                <TouchableOpacity
                  style={[styles.avatarActionBtn, styles.avatarActionBtnDanger]}
                  onPress={handleRemoveAvatar}
                  activeOpacity={0.75}
                >
                  <Ionicons name="trash-outline" size={14} color={ACCENT_RED} />
                  <Text style={[styles.avatarActionText, styles.avatarActionTextDanger]}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ── Name ── */}
          <SectionHeader title="Your Name" />
          <View style={styles.card}>
            <FloatingInput
              label="First Name *"
              value={form.firstName}
              onChangeText={setField("firstName")}
              error={errors.firstName}
              maxLength={40}
              autoCapitalize="words"
            />
            <FloatingInput
              label="Middle Name (Optional)"
              value={form.middleName}
              onChangeText={setField("middleName")}
              maxLength={40}
              autoCapitalize="words"
              hint="Leave blank if not applicable."
            />
            <FloatingInput
              label="Last Name *"
              value={form.lastName}
              onChangeText={setField("lastName")}
              error={errors.lastName}
              maxLength={40}
              autoCapitalize="words"
            />

            {(form.firstName || form.lastName) && (
              <View style={styles.namePreview}>
                <Ionicons name="person-outline" size={13} color={DARK_BLUE} />
                <Text style={styles.namePreviewLabel}>Displays as: </Text>
                <Text style={styles.namePreviewValue}>
                  {[form.firstName.trim(), form.middleName.trim(), form.lastName.trim()]
                    .filter(Boolean)
                    .join(" ")}
                </Text>
              </View>
            )}
          </View>

          {/* ── About You ── */}
          <SectionHeader title="About You" />
          <View style={styles.card}>
            <FloatingInput
              label="Bio"
              value={form.bio}
              onChangeText={setField("bio")}
              hint="Tell traders a little about yourself."
              maxLength={160}
              multiline
              numberOfLines={3}
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
            <PhoneInput
              value={form.phone}
              onChangeText={setField("phone")}
              error={errors.phone}
            />
          </View>

          {/* ── Account / Danger Zone ── */}
          <SectionHeader title="Account" />
          <View style={[styles.card, styles.dangerCard]}>
            <TouchableOpacity
              style={styles.dangerRow}
              activeOpacity={0.7}
              onPress={() => router.push("/(auth)/ChangePasswordScreen")}
            >
              <View style={styles.dangerRowLeft}>
                <View style={styles.dangerIconBox}>
                  <Ionicons name="lock-closed-outline" size={18} color={DARK_BLUE} />
                </View>
                <View>
                  <Text style={styles.dangerRowLabel}>Change Password</Text>
                  <Text style={styles.dangerRowSub}>Send a reset link to your email</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#CCCCCC" />
            </TouchableOpacity>

            <View style={styles.dangerDivider} />

            <TouchableOpacity
              style={styles.dangerRow}
              activeOpacity={0.7}
              onPress={() => setDeleteModalVisible(true)}
            >
              <View style={styles.dangerRowLeft}>
                <View style={[styles.dangerIconBox, { backgroundColor: "#FEE2E2" }]}>
                  <Ionicons name="trash-outline" size={18} color={ACCENT_RED} />
                </View>
                <View>
                  <Text style={[styles.dangerRowLabel, { color: ACCENT_RED }]}>Delete Account</Text>
                  <Text style={styles.dangerRowSub}>Permanently erase all your data</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={ACCENT_RED} />
            </TouchableOpacity>
          </View>

          {/* ── Save Button ── */}
          <View style={styles.saveWrapper}>
            <SaveButton
              onPress={() => {
                const validationErrors = validateForm(form);
                if (Object.keys(validationErrors).length > 0) {
                  setErrors(validationErrors);
                  return;
                }
                setShowSaveModal(true);
              }}
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
    paddingTop: 0,
    paddingBottom: 0,
  },
  header: {
    backgroundColor: HEADER_BG,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 30,
    paddingBottom: 15,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { color: "#fff", fontSize: 22, fontWeight: "800", letterSpacing: 0.4 },
  headerSpacer: { width: 60, minWidth: 60 },
  discardText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    fontWeight: "700",
    paddingHorizontal: 12,
    paddingVertical: 6,
    textAlign: "right",
  },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, fontSize: 14, color: "#888" },
  scrollContent: { paddingBottom: 100, flexGrow: 1 },

  avatarSection: {
    alignItems: "center",
    paddingVertical: 32,
    backgroundColor: "#fff",
    marginBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ECECEC",
  },
  avatarOuter: { position: "relative", width: 100, height: 100, marginBottom: 14 },
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: "#ddd" },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: DARK_BLUE,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: { color: "#fff", fontSize: 38, fontWeight: "800" },
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
  uploadProgressWrapper: { width: "60%", alignItems: "center", gap: 6, marginBottom: 8 },
  uploadProgressText: { fontSize: 12, color: "#888", fontWeight: "500" },
  avatarActions: { flexDirection: "row", gap: 10 },
  avatarActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: DARK_BLUE,
    backgroundColor: "#ECEDF8",
  },
  avatarActionBtnDanger: { borderColor: ACCENT_RED, backgroundColor: "#FEE2E2" },
  avatarActionText: { fontSize: 13, fontWeight: "700", color: DARK_BLUE },
  avatarActionTextDanger: { color: ACCENT_RED },

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
  dangerCard: { paddingHorizontal: 0, paddingVertical: 0, overflow: "hidden" },
  dangerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  dangerRowLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  dangerIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#EEF0FB",
    justifyContent: "center",
    alignItems: "center",
  },
  dangerRowLabel: { fontSize: 15, fontWeight: "600", color: "#1A1A2E" },
  dangerRowSub: { fontSize: 12, color: "#AAAAAA", marginTop: 2 },
  dangerDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "#ECECEC", marginHorizontal: 16 },

  namePreview: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F1FB",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 4,
    marginBottom: 8,
    gap: 6,
  },
  namePreviewLabel: { fontSize: 12, color: "#888", fontWeight: "600" },
  namePreviewValue: { fontSize: 14, color: DARK_BLUE, fontWeight: "700", flex: 1 },

  saveWrapper: { marginHorizontal: 16, marginTop: 24, alignItems: "center", gap: 10 },
  noChangesText: { fontSize: 12, color: "#BBBBBB", fontWeight: "500" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
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
  modalIconRow: { marginBottom: 14 },
  modalIconBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FEE2E2",
    justifyContent: "center",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1A1A2E",
    marginBottom: 8,
    textAlign: "center",
  },
  modalMessage: {
    fontSize: 14,
    color: "#666",
    marginBottom: 24,
    lineHeight: 20,
    textAlign: "center",
  },
  modalButtonsRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 44,
  },
  modalBtnCancel: {
    backgroundColor: "#F0F0F0",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  modalBtnCancelText: { fontSize: 14, fontWeight: "600", color: "#555" },
  modalBtnDelete: { backgroundColor: ACCENT_RED },
  modalBtnDeleteText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  modalBtnSave: { backgroundColor: DARK_BLUE },
  modalBtnSaveText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});

// ─── Input Styles ─────────────────────────────────────────────────────────────
const inputStyles = StyleSheet.create({
  wrapper: { marginVertical: 10 },
  container: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 20,
    paddingBottom: 10,
    backgroundColor: "#FAFAFA",
    position: "relative",
  },
  containerDisabled: { backgroundColor: "#F0F0F0" },
  cleanPhoneContainer: { flexDirection: "column", paddingTop: 20, paddingBottom: 10 },
  phonePrefixInputRow: { flexDirection: "row", alignItems: "center", gap: 0, marginTop: 8 },
  phonePrefixBox: { flexDirection: "row", alignItems: "center", gap: 6 },
  phonePrefix: { fontSize: 15, fontWeight: "700", color: "#1A1A2E" },
  phoneDivider: { width: 1, height: 28, backgroundColor: "#E0E0E0", marginHorizontal: 12 },
  phoneTextInput: {
    flex: 1,
    fontSize: 15,
    color: "#1A1A2E",
    fontWeight: "500",
    padding: 0,
    minHeight: 28,
    backgroundColor: "#FAFAFA",
  },
  phoneCounter: { fontSize: 10, color: "#CCCCCC", fontWeight: "600", paddingLeft: 8 },
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
    top: 4,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "#888",
  },
  labelFocused: { color: DARK_BLUE },
  labelError: { color: ACCENT_RED },
  input: {
    fontSize: 15,
    color: "#1A1A2E",
    fontWeight: "500",
    paddingTop: 2,
    paddingBottom: 0,
    minHeight: 28,
    backgroundColor: "#FAFAFA",
  },
  inputMultiline: { minHeight: 64, paddingTop: 4 },
  inputDisabled: { color: "#AAAAAA" },
  counter: { position: "absolute", right: 12, bottom: 8, fontSize: 10, color: "#CCCCCC", fontWeight: "600" },
  errorText: { fontSize: 12, color: ACCENT_RED, fontWeight: "500", marginLeft: 4 },
  errorContainer: { flexDirection: "row", alignItems: "center", marginTop: 6, marginLeft: 4, gap: 6 },
  hintText: { fontSize: 11.5, color: "#BBBBBB", marginTop: 4, marginLeft: 4, fontStyle: "italic" },
  phoneInputWrapper: { flexDirection: "row", alignItems: "center", gap: 6 },
  phoneInput: { flex: 1 },
});

// ─── Save Button Styles ───────────────────────────────────────────────────────
const saveStyles = StyleSheet.create({
  btn: {
    width: "100%",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: DARK_BLUE,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  btnDisabled: { opacity: 0.45, elevation: 0, shadowOpacity: 0 },
  text: { fontSize: 15, fontWeight: "600", letterSpacing: 0.2 },
});

// ─── Upload Progress Styles ───────────────────────────────────────────────────
const uploadStyles = StyleSheet.create({
  track: { width: "100%", height: 4, backgroundColor: "#E0E0E0", borderRadius: 2, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: DARK_BLUE, borderRadius: 2 },
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