import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "firebase/auth";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
 
// ─── Password Strength ────────────────────────────────────────────────────────
interface PasswordStrength { score: number; label: string; color: string; }
 
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
 
function StrengthBar({ password }: { password: string }) {
  if (!password) return null;
  const { score, label, color } = getPasswordStrength(password);
  return (
    <View style={strengthStyles.wrapper}>
      <View style={strengthStyles.bars}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={[strengthStyles.bar, { backgroundColor: i <= score ? color : "#E0E0E0" }]} />
        ))}
      </View>
      {label ? <Text style={[strengthStyles.label, { color }]}>{label}</Text> : null}
    </View>
  );
}
 
// ─── Floating Label Input ─────────────────────────────────────────────────────
function FloatingInput({
  label, value, onChangeText, error, hint, secureTextEntry,
}: {
  label: string; value: string; onChangeText: (t: string) => void;
  error?: string; hint?: string; secureTextEntry?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const borderAnim = useRef(new Animated.Value(0)).current;
 
  const onFocus = () => { setFocused(true); Animated.spring(borderAnim, { toValue: 1, useNativeDriver: false, tension: 120 }).start(); };
  const onBlur  = () => { setFocused(false); Animated.spring(borderAnim, { toValue: 0, useNativeDriver: false, tension: 120 }).start(); };
 
  const borderColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [error ? ACCENT_RED : "#E0E0E0", error ? ACCENT_RED : DARK_BLUE],
  });
 
  const labelActive = focused || value.length > 0;
 
  return (
    <View style={inputStyles.wrapper}>
      <Animated.View style={[inputStyles.container, { borderColor }]}>
        <Text style={[inputStyles.label, labelActive && inputStyles.labelActive, focused && inputStyles.labelFocused, error && inputStyles.labelError]}>
          {label}
        </Text>
        <View style={inputStyles.inputRow}>
          <TextInput
            style={inputStyles.input}
            value={value}
            onChangeText={onChangeText}
            onFocus={onFocus}
            onBlur={onBlur}
            secureTextEntry={secureTextEntry && !showSecret}
            autoCapitalize="none"
            placeholder=" "
            placeholderTextColor="transparent"
          />
          {secureTextEntry && (
            <TouchableOpacity onPress={() => setShowSecret(s => !s)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name={showSecret ? "eye-off-outline" : "eye-outline"} size={18} color="#AAAAAA" />
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
 
// ─── Screen States ────────────────────────────────────────────────────────────
type ScreenState = "verifying" | "invalid" | "form" | "success";
 
// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ResetPasswordScreen() {
  const router = useRouter();
  // Expo Router gives us query params from the deep link
  const { oobCode, mode } = useLocalSearchParams<{ oobCode?: string; mode?: string }>();
 
  const [screenState, setScreenState] = useState<ScreenState>("verifying");
  const [emailForReset, setEmailForReset] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<{ new?: string; confirm?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [invalidReason, setInvalidReason] = useState("This password reset link is invalid or has expired.");
 
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
 
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80 }),
    ]).start();
  }, []);
 
  // Verify the oobCode on mount
  useEffect(() => {
    if (!oobCode || mode !== "resetPassword") {
      setInvalidReason("Missing or incorrect reset link parameters. Please request a new reset email.");
      setScreenState("invalid");
      return;
    }
    verifyPasswordResetCode(auth, oobCode)
      .then((email) => {
        setEmailForReset(email);
        setScreenState("form");
      })
      .catch((err) => {
        if (err.code === "auth/expired-action-code") {
          setInvalidReason("This reset link has expired. Links are only valid for 1 hour — please request a new one.");
        } else if (err.code === "auth/invalid-action-code") {
          setInvalidReason("This reset link has already been used or is invalid. Please request a new one.");
        } else {
          setInvalidReason("Unable to verify this reset link. Please request a new one.");
        }
        setScreenState("invalid");
      });
  }, [oobCode, mode]);
 
  const handleReset = async () => {
    const newErrors: typeof errors = {};
    if (!newPassword) {
      newErrors.new = "New password is required.";
    } else if (newPassword.length < 8) {
      newErrors.new = "Password must be at least 8 characters.";
    } else if (getPasswordStrength(newPassword).score < 2) {
      newErrors.new = "Password is too weak. Add uppercase, numbers, or symbols.";
    }
    if (!confirmPassword) {
      newErrors.confirm = "Please confirm your new password.";
    } else if (newPassword !== confirmPassword) {
      newErrors.confirm = "Passwords do not match.";
    }
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    if (!oobCode) return;
 
    setSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setScreenState("success");
    } catch (err: any) {
      if (err.code === "auth/expired-action-code") {
        setInvalidReason("This link has expired. Please request a new password reset email.");
        setScreenState("invalid");
      } else if (err.code === "auth/weak-password") {
        setErrors({ new: "Password is too weak. Choose a stronger password." });
      } else {
        setErrors({ new: err?.message ?? "Failed to reset password. Please try again." });
      }
    } finally {
      setSubmitting(false);
    }
  };
 
  const goToLogin = () => {
    router.replace("/(auth)/login");
  };
 
  const strength = getPasswordStrength(newPassword);
 
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft} />
        <Text style={styles.headerTitle}>Reset Password</Text>
        <View style={styles.headerLeft} />
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
              <Ionicons
                name={
                  screenState === "success" ? "checkmark-circle" :
                  screenState === "invalid" ? "warning" :
                  screenState === "verifying" ? "hourglass-outline" :
                  "lock-open-outline"
                }
                size={32}
                color={
                  screenState === "success" ? SUCCESS_GREEN :
                  screenState === "invalid" ? ACCENT_RED :
                  GOLD
                }
              />
            </View>
            <Text style={styles.heroTitle}>
              {screenState === "success" ? "Password Reset!" :
               screenState === "invalid" ? "Link Expired" :
               screenState === "verifying" ? "Verifying…" :
               "Set New Password"}
            </Text>
            {emailForReset && screenState === "form" && (
              <View style={styles.emailBadge}>
                <Ionicons name="mail-outline" size={13} color="rgba(255,255,255,0.7)" />
                <Text style={styles.emailBadgeText}>{emailForReset}</Text>
              </View>
            )}
          </View>
 
          {/* ── Verifying ── */}
          {screenState === "verifying" && (
            <View style={styles.card}>
              <View style={styles.centeredContent}>
                <ActivityIndicator size="large" color={DARK_BLUE} style={{ marginBottom: 16 }} />
                <Text style={styles.centeredText}>Verifying your reset link…</Text>
              </View>
            </View>
          )}
 
          {/* ── Invalid / Expired ── */}
          {screenState === "invalid" && (
            <View style={styles.card}>
              <View style={styles.centeredContent}>
                <View style={[styles.statusIconWrap, { backgroundColor: "#FEE2E2" }]}>
                  <Ionicons name="warning-outline" size={36} color={ACCENT_RED} />
                </View>
                <Text style={styles.statusTitle}>Link Invalid or Expired</Text>
                <Text style={styles.statusDesc}>{invalidReason}</Text>
                <TouchableOpacity style={styles.primaryBtn} onPress={goToLogin} activeOpacity={0.85}>
                  <Ionicons name="mail-outline" size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>Request New Reset Link</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
 
          {/* ── Success ── */}
          {screenState === "success" && (
            <View style={styles.card}>
              <View style={styles.centeredContent}>
                <View style={[styles.statusIconWrap, { backgroundColor: SUCCESS_BG }]}>
                  <Ionicons name="checkmark-circle" size={40} color={SUCCESS_GREEN} />
                </View>
                <Text style={styles.statusTitle}>Password Updated!</Text>
                <Text style={styles.statusDesc}>
                  Your password has been successfully reset. You can now log in with your new password.
                </Text>
                <TouchableOpacity style={styles.primaryBtn} onPress={goToLogin} activeOpacity={0.85}>
                  <Ionicons name="log-in-outline" size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>Go to Login</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
 
          {/* ── Form ── */}
          {screenState === "form" && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="lock-open-outline" size={16} color={DARK_BLUE} />
                <Text style={styles.cardTitle}>Create New Password</Text>
              </View>
 
              <FloatingInput
                label="New Password"
                value={newPassword}
                onChangeText={(v) => { setNewPassword(v); if (errors.new) setErrors(e => ({ ...e, new: undefined })); }}
                error={errors.new}
                hint="At least 8 characters with uppercase, numbers, or symbols."
                secureTextEntry
              />
              {newPassword.length > 0 && <StrengthBar password={newPassword} />}
 
              <FloatingInput
                label="Confirm New Password"
                value={confirmPassword}
                onChangeText={(v) => { setConfirmPassword(v); if (errors.confirm) setErrors(e => ({ ...e, confirm: undefined })); }}
                error={errors.confirm}
                secureTextEntry
              />
 
              {/* Requirements checklist */}
              <View style={styles.requirementsList}>
                {[
                  { test: newPassword.length >= 8,           label: "At least 8 characters" },
                  { test: /[A-Z]/.test(newPassword),         label: "One uppercase letter" },
                  { test: /[0-9]/.test(newPassword),         label: "One number" },
                  { test: /[^A-Za-z0-9]/.test(newPassword),  label: "One special character" },
                ].map((req) => (
                  <View key={req.label} style={styles.requirementRow}>
                    <Ionicons
                      name={req.test ? "checkmark-circle" : "ellipse-outline"}
                      size={13}
                      color={req.test ? SUCCESS_GREEN : "#CCCCCC"}
                    />
                    <Text style={[styles.requirementText, req.test && styles.requirementTextMet]}>
                      {req.label}
                    </Text>
                  </View>
                ))}
              </View>
 
              <TouchableOpacity
                style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
                onPress={handleReset}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="shield-checkmark" size={16} color="#fff" />
                    <Text style={styles.primaryBtnText}>Reset My Password</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
 
          {/* ── Security Tips ── */}
          {screenState === "form" && (
            <View style={styles.tipsCard}>
              <View style={styles.tipsHeader}>
                <Ionicons name="bulb-outline" size={14} color={GOLD} />
                <Text style={styles.tipsTitle}>Security Tips</Text>
              </View>
              {[
                "Use a unique password not used on other sites.",
                "Include a mix of letters, numbers, and symbols.",
                "Avoid personal information like your name or birthday.",
              ].map((tip) => (
                <View key={tip} style={styles.tipRow}>
                  <View style={styles.tipDot} />
                  <Text style={styles.tipText}>{tip}</Text>
                </View>
              ))}
            </View>
          )}
 
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
    paddingTop: 15,
    paddingBottom: 15,
  },
  headerLeft: { width: 40 },
  headerTitle: { color: "#fff", fontSize: 22, fontWeight: "800", letterSpacing: 0.4 },
 
  scrollContent: { paddingBottom: 56 },
 
  heroSection: {
    backgroundColor: HEADER_BG,
    alignItems: "center",
    paddingTop: 24,
    paddingBottom: 36,
    paddingHorizontal: 24,
  },
  heroIconWrap: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: "rgba(201,162,39,0.15)",
    borderWidth: 1.5,
    borderColor: "rgba(201,162,39,0.4)",
    justifyContent: "center", alignItems: "center",
    marginBottom: 14,
  },
  heroTitle: { color: "#fff", fontSize: 22, fontWeight: "800", letterSpacing: 0.3, marginBottom: 8 },
  emailBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20,
  },
  emailBadgeText: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "600" },
 
  card: {
    marginHorizontal: 16,
    marginTop: -18,
    marginBottom: 12,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  cardHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginBottom: 18, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EBEBEB",
  },
  cardTitle: { fontSize: 14, fontWeight: "800", color: DARK_BLUE, textTransform: "uppercase", letterSpacing: 0.6 },
 
  centeredContent: { alignItems: "center", paddingVertical: 16 },
  centeredText: { fontSize: 14, color: "#888", textAlign: "center" },
 
  statusIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    justifyContent: "center", alignItems: "center",
    marginBottom: 16,
  },
  statusTitle: { fontSize: 20, fontWeight: "800", color: "#1A1A2E", marginBottom: 10, textAlign: "center" },
  statusDesc: {
    fontSize: 14, color: "#666", textAlign: "center",
    lineHeight: 21, marginBottom: 24, paddingHorizontal: 8,
  },
 
  requirementsList: {
    backgroundColor: "#F8F9FD", borderRadius: 10,
    padding: 12, marginBottom: 12, gap: 7,
  },
  requirementRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  requirementText: { fontSize: 12.5, color: "#BBBBBB", fontWeight: "500" },
  requirementTextMet: { color: SUCCESS_GREEN },
 
  primaryBtn: {
    backgroundColor: DARK_BLUE,
    borderRadius: 13, paddingVertical: 14,
    flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 8, marginTop: 8,
    elevation: 3,
    shadowColor: DARK_BLUE,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 6,
    width: "100%",
  },
  primaryBtnDisabled: { opacity: 0.5, elevation: 0, shadowOpacity: 0 },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700", letterSpacing: 0.2 },
 
  tipsCard: {
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: "#FEFBF0", borderRadius: 14,
    padding: 16, borderWidth: 1,
    borderColor: "rgba(201,162,39,0.2)",
  },
  tipsHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  tipsTitle: { fontSize: 12, fontWeight: "800", color: "#B8860B", textTransform: "uppercase", letterSpacing: 0.6 },
  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 5 },
  tipDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: GOLD, marginTop: 6 },
  tipText: { fontSize: 12.5, color: "#888", lineHeight: 18, flex: 1 },
});
 
const inputStyles = StyleSheet.create({
  wrapper: { marginVertical: 8 },
  container: {
    borderWidth: 1.5, borderRadius: 12,
    paddingHorizontal: 14, paddingTop: 20, paddingBottom: 10,
    backgroundColor: "#FAFAFA",
  },
  inputRow: { flexDirection: "row", alignItems: "center" },
  label: {
    position: "absolute", left: 14, top: 15,
    fontSize: 14, color: "#AAAAAA", fontWeight: "500", zIndex: 1,
  },
  labelActive: {
    top: 4, fontSize: 11, fontWeight: "700",
    textTransform: "uppercase", letterSpacing: 0.6, color: "#888",
  },
  labelFocused: { color: DARK_BLUE },
  labelError: { color: ACCENT_RED },
  input: { flex: 1, fontSize: 15, color: "#1A1A2E", fontWeight: "500", paddingTop: 2, minHeight: 28 },
  errorContainer: { flexDirection: "row", alignItems: "center", marginTop: 6, marginLeft: 4, gap: 4 },
  errorText: { fontSize: 12, color: ACCENT_RED, fontWeight: "500" },
  hintText: { fontSize: 11.5, color: "#BBBBBB", marginTop: 4, marginLeft: 4, fontStyle: "italic" },
});
 
const strengthStyles = StyleSheet.create({
  wrapper: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: -4, marginBottom: 8, marginLeft: 2 },
  bars: { flexDirection: "row", gap: 4, flex: 1 },
  bar: { flex: 1, height: 4, borderRadius: 2 },
  label: { fontSize: 12, fontWeight: "700", minWidth: 44 },
});