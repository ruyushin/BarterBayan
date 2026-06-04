import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
    EmailAuthProvider,
    onAuthStateChanged,
    reauthenticateWithCredential,
    updatePassword,
    User
} from "firebase/auth";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { auth } from "../../firebaseConfig";

// ─── Constants ────────────────────────────────────────────────────────────────
const DARK_BLUE = "#2D2D7A";
const HEADER_BG = "#2f2f6f";
const LIGHT_BG = "#F4F5F9";
const ACCENT_RED = "#C0392B";
const GOLD = "#C9A227";
const SUCCESS_GREEN = "#065F46";
const SUCCESS_BG = "#D1FAE5";

// ─── Types ────────────────────────────────────────────────────────────────────
interface PasswordStrength {
  score: number; // 0–4
  label: string;
  color: string;
}

// ─── Password Strength ────────────────────────────────────────────────────────
function getPasswordStrength(password: string): PasswordStrength {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const map: PasswordStrength[] = [
    { score: 0, label: "", color: "#E0E0E0" },
    { score: 1, label: "Weak", color: ACCENT_RED },
    { score: 2, label: "Fair", color: GOLD },
    { score: 3, label: "Good", color: "#2196F3" },
    { score: 4, label: "Strong", color: SUCCESS_GREEN },
  ];
  return map[score] ?? map[0];
}

// ─── Strength Bar ─────────────────────────────────────────────────────────────
function StrengthBar({ password }: { password: string }) {
  if (!password) return null;
  const { score, label, color } = getPasswordStrength(password);
  return (
    <View style={strengthStyles.wrapper}>
      <View style={strengthStyles.bars}>
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[
              strengthStyles.bar,
              { backgroundColor: i <= score ? color : "#E0E0E0" },
            ]}
          />
        ))}
      </View>
      {label ? (
        <Text style={[strengthStyles.label, { color }]}>{label}</Text>
      ) : null}
    </View>
  );
}

// ─── Floating Label Input ─────────────────────────────────────────────────────
function FloatingInput({
  label,
  value,
  onChangeText,
  error,
  hint,
  secureTextEntry,
  autoCapitalize = "none",
  keyboardType,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  hint?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words";
  keyboardType?: "default" | "email-address";
  editable?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
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
        <View style={inputStyles.inputRow}>
          <TextInput
            style={[inputStyles.input, !editable && inputStyles.inputDisabled]}
            value={value}
            onChangeText={onChangeText}
            onFocus={onFocus}
            onBlur={onBlur}
            secureTextEntry={secureTextEntry && !showSecret}
            autoCapitalize={autoCapitalize}
            keyboardType={keyboardType ?? "default"}
            editable={editable}
            placeholder=" "
            placeholderTextColor="transparent"
          />
          {secureTextEntry && (
            <TouchableOpacity
              onPress={() => setShowSecret((s) => !s)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={showSecret ? "eye-off-outline" : "eye-outline"}
                size={18}
                color="#AAAAAA"
              />
            </TouchableOpacity>
          )}
        </View>
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

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ChangePasswordScreen() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Change password fields
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [cpErrors, setCpErrors] = useState<{ current?: string; new?: string; confirm?: string }>({});

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const contentFade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80 }),
    ]).start();
  }, []);

  const handleBackPress = () => {
    if (router.canGoBack?.()) router.back();
    else router.replace("/(tabs)/profile");
  };

  // ── Change Password ──
  const handleChangePassword = async () => {
    const errors: typeof cpErrors = {};
    if (!currentPassword) errors.current = "Current password is required.";
    if (!newPassword) {
      errors.new = "New password is required.";
    } else if (newPassword.length < 8) {
      errors.new = "Password must be at least 8 characters.";
    } else if (getPasswordStrength(newPassword).score < 2) {
      errors.new = "Password is too weak. Add uppercase, numbers, or symbols.";
    }
    if (!confirmPassword) {
      errors.confirm = "Please confirm your new password.";
    } else if (newPassword !== confirmPassword) {
      errors.confirm = "Passwords do not match.";
    }
    if (Object.keys(errors).length > 0) { setCpErrors(errors); return; }
    if (!currentUser?.email) {
      Alert.alert("Error", "No user session found. Please log in again.");
      return;
    }

    setSubmitting(true);
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => {
        setSuccess(false);
        handleBackPress();
      }, 2000);
    } catch (err: any) {
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setCpErrors({ current: "Current password is incorrect." });
      } else if (err.code === "auth/requires-recent-login") {
        Alert.alert(
          "Session Expired",
          "For security, please log out and log back in before changing your password.",
          [{ text: "OK" }],
        );
      } else {
        Alert.alert("Error", err?.message ?? "Failed to update password. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const strength = getPasswordStrength(newPassword);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBackPress}
          activeOpacity={0.75}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Password</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* ── Hero ── */}
          <View style={styles.heroSection}>
            <View style={styles.heroIconWrap}>
              <Ionicons name="shield-checkmark" size={32} color={GOLD} />
            </View>
            <Text style={styles.heroTitle}>Account Security</Text>
            <Text style={styles.heroSub}>
              Keep your account safe with a strong, unique password.
            </Text>
          </View>

          {/* ── Content ── */}
          <Animated.View style={{ opacity: contentFade }}>
            {/* ── Change Password Form ── */}
            <View style={styles.card}>
                {success ? (
                  <View style={styles.successBox}>
                    <View style={styles.successIconWrap}>
                      <Ionicons name="checkmark-circle" size={40} color={SUCCESS_GREEN} />
                    </View>
                    <Text style={styles.successTitle}>Password Updated!</Text>
                    <Text style={styles.successSub}>
                      Your password has been changed successfully. Redirecting…
                    </Text>
                  </View>
                ) : (
                  <>
                    <View style={styles.cardHeader}>
                      <Ionicons name="lock-closed-outline" size={16} color={DARK_BLUE} />
                      <Text style={styles.cardTitle}>Change Password</Text>
                    </View>

                    <FloatingInput
                      label="Current Password"
                      value={currentPassword}
                      onChangeText={(v) => {
                        setCurrentPassword(v);
                        if (cpErrors.current) setCpErrors((e) => ({ ...e, current: undefined }));
                      }}
                      error={cpErrors.current}
                      secureTextEntry
                    />
                    <FloatingInput
                      label="New Password"
                      value={newPassword}
                      onChangeText={(v) => {
                        setNewPassword(v);
                        if (cpErrors.new) setCpErrors((e) => ({ ...e, new: undefined }));
                      }}
                      error={cpErrors.new}
                      hint="At least 8 characters with uppercase, numbers, or symbols."
                      secureTextEntry
                    />
                    {newPassword.length > 0 && <StrengthBar password={newPassword} />}
                    <FloatingInput
                      label="Confirm New Password"
                      value={confirmPassword}
                      onChangeText={(v) => {
                        setConfirmPassword(v);
                        if (cpErrors.confirm) setCpErrors((e) => ({ ...e, confirm: undefined }));
                      }}
                      error={cpErrors.confirm}
                      secureTextEntry
                    />

                    {/* Requirements checklist */}
                    <View style={styles.requirementsList}>
                      {[
                        { test: newPassword.length >= 8, label: "At least 8 characters" },
                        { test: /[A-Z]/.test(newPassword), label: "One uppercase letter" },
                        { test: /[0-9]/.test(newPassword), label: "One number" },
                        { test: /[^A-Za-z0-9]/.test(newPassword), label: "One special character" },
                      ].map((req) => (
                        <View key={req.label} style={styles.requirementRow}>
                          <Ionicons
                            name={req.test ? "checkmark-circle" : "ellipse-outline"}
                            size={13}
                            color={req.test ? SUCCESS_GREEN : "#CCCCCC"}
                          />
                          <Text
                            style={[
                              styles.requirementText,
                              req.test && styles.requirementTextMet,
                            ]}
                          >
                            {req.label}
                          </Text>
                        </View>
                      ))}
                    </View>

                    <TouchableOpacity
                      style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
                      onPress={handleChangePassword}
                      disabled={submitting}
                      activeOpacity={0.85}
                    >
                      {submitting ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <Ionicons name="lock-closed" size={16} color="#fff" />
                          <Text style={styles.primaryBtnText}>Update Password</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.switchModeLink}
                      onPress={() => router.navigate("/(auth)/login")}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.switchModeLinkText}>
                        Forgot password? Tap here to reset
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
            </View>
          </Animated.View>

          {/* ── Security Tips ── */}
          <View style={styles.tipsCard}>
            <View style={styles.tipsHeader}>
              <Ionicons name="bulb-outline" size={14} color={GOLD} />
              <Text style={styles.tipsTitle}>Security Tips</Text>
            </View>
            {[
              "Use a unique password not used on other sites.",
              "Include a mix of letters, numbers, and symbols.",
              "Avoid using personal information like your name or birthday.",
            ].map((tip) => (
              <View key={tip} style={styles.tipRow}>
                <View style={styles.tipDot} />
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>

        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LIGHT_BG },
  header: {
    backgroundColor: HEADER_BG,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 32,
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
  headerSpacer: { width: 40 },

  scrollContent: { paddingBottom: 56 },

  heroSection: {
    backgroundColor: HEADER_BG,
    alignItems: "center",
    paddingTop: 24,
    paddingBottom: 36,
    paddingHorizontal: 24,
  },
  heroIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(201,162,39,0.15)",
    borderWidth: 1.5,
    borderColor: "rgba(201,162,39,0.4)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  heroTitle: { color: "#fff", fontSize: 22, fontWeight: "800", letterSpacing: 0.3, marginBottom: 6 },
  heroSub: { color: "rgba(255,255,255,0.65)", fontSize: 13, textAlign: "center", lineHeight: 19 },

  toggleWrapper: {
    marginHorizontal: 16,
    marginTop: -18,
    marginBottom: 16,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },

  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EBEBEB",
  },
  cardTitle: { fontSize: 14, fontWeight: "800", color: DARK_BLUE, textTransform: "uppercase", letterSpacing: 0.6 },

  forgotDesc: {
    fontSize: 13.5,
    color: "#777",
    lineHeight: 20,
    marginBottom: 18,
  },

  requirementsList: {
    backgroundColor: "#F8F9FD",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    gap: 7,
  },
  requirementRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  requirementText: { fontSize: 12.5, color: "#BBBBBB", fontWeight: "500" },
  requirementTextMet: { color: SUCCESS_GREEN },

  primaryBtn: {
    backgroundColor: DARK_BLUE,
    borderRadius: 13,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
    elevation: 3,
    shadowColor: DARK_BLUE,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  primaryBtnDisabled: { opacity: 0.5, elevation: 0, shadowOpacity: 0 },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700", letterSpacing: 0.2 },

  switchModeLink: { alignItems: "center", marginTop: 16, paddingVertical: 4 },
  switchModeLinkText: { fontSize: 13, color: DARK_BLUE, fontWeight: "600", textDecorationLine: "underline" },

  successBox: { alignItems: "center", paddingVertical: 12 },
  successIconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: SUCCESS_BG,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  successTitle: { fontSize: 20, fontWeight: "800", color: "#1A1A2E", marginBottom: 8 },
  successSub: { fontSize: 14, color: "#666", textAlign: "center", lineHeight: 21, paddingHorizontal: 8 },
  resendRow: { flexDirection: "row", alignItems: "center", marginTop: 16 },
  resendLabel: { fontSize: 13, color: "#888" },
  resendLink: { fontSize: 13, fontWeight: "700", color: DARK_BLUE, textDecorationLine: "underline" },

  tipsCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "#FEFBF0",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(201,162,39,0.2)",
  },
  tipsHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  tipsTitle: { fontSize: 12, fontWeight: "800", color: "#B8860B", textTransform: "uppercase", letterSpacing: 0.6 },
  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 5 },
  tipDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: GOLD, marginTop: 6 },
  tipText: { fontSize: 12.5, color: "#888", lineHeight: 18, flex: 1 },
});

// ─── Input Styles ─────────────────────────────────────────────────────────────
const inputStyles = StyleSheet.create({
  wrapper: { marginVertical: 8 },
  container: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 20,
    paddingBottom: 10,
    backgroundColor: "#FAFAFA",
  },
  containerDisabled: { backgroundColor: "#F0F0F0" },
  inputRow: { flexDirection: "row", alignItems: "center" },
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
    flex: 1,
    fontSize: 15,
    color: "#1A1A2E",
    fontWeight: "500",
    paddingTop: 2,
    paddingBottom: 0,
    minHeight: 28,
  },
  inputDisabled: { color: "#AAAAAA" },
  errorContainer: { flexDirection: "row", alignItems: "center", marginTop: 6, marginLeft: 4, gap: 4 },
  errorText: { fontSize: 12, color: ACCENT_RED, fontWeight: "500" },
  hintText: { fontSize: 11.5, color: "#BBBBBB", marginTop: 4, marginLeft: 4, fontStyle: "italic" },
});

// ─── Toggle Styles ────────────────────────────────────────────────────────────
const toggleStyles = StyleSheet.create({
  track: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 4,
    position: "relative",
  },
  thumb: {
    position: "absolute",
    top: 4,
    bottom: 4,
    width: "50%",
    backgroundColor: DARK_BLUE,
    borderRadius: 9,
  },
  option: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    gap: 6,
    zIndex: 1,
  },
  label: { fontSize: 13, fontWeight: "600", color: "#888" },
  labelActive: { color: "#fff" },
});

// ─── Strength Bar Styles ──────────────────────────────────────────────────────
const strengthStyles = StyleSheet.create({
  wrapper: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: -4, marginBottom: 8, marginLeft: 2 },
  bars: { flexDirection: "row", gap: 4, flex: 1 },
  bar: { flex: 1, height: 4, borderRadius: 2 },
  label: { fontSize: 12, fontWeight: "700", minWidth: 44 },
});