import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
    confirmPasswordReset,
    verifyPasswordResetCode,
} from "firebase/auth";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { auth } from "../firebaseConfig";

// ─── Constants ────────────────────────────────────────────────────────────────
const DARK_BLUE = "#2D2D7A";
const HEADER_BG = "#2f2f6f";
const LIGHT_BG = "#F4F5F9";
const ACCENT_RED = "#C0392B";
const SUCCESS_GREEN = "#065F46";
const SUCCESS_BG = "#D1FAE5";

// ─── Password Strength ────────────────────────────────────────────────────────
function getPasswordStrength(password: string) {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const map = [
    { score: 0, label: "", color: "#E0E0E0" },
    { score: 1, label: "Weak", color: ACCENT_RED },
    { score: 2, label: "Fair", color: "#C9A227" },
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
  secureTextEntry,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  secureTextEntry?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  return (
    <View style={inputStyles.wrapper}>
      <View
        style={[
          inputStyles.container,
          {
            borderColor: error ? ACCENT_RED : focused ? DARK_BLUE : "#E0E0E0",
          },
        ]}
      >
        <Text
          style={[
            inputStyles.label,
            (focused || value) && inputStyles.labelActive,
            focused && inputStyles.labelFocused,
            error && inputStyles.labelError,
          ]}
        >
          {label}
        </Text>
        <View style={inputStyles.inputRow}>
          <TextInput
            style={inputStyles.input}
            value={value}
            onChangeText={onChangeText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            secureTextEntry={secureTextEntry && !showSecret}
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
      </View>
      {error ? (
        <View style={inputStyles.errorContainer}>
          <Ionicons name="alert-circle" size={14} color={ACCENT_RED} />
          <Text style={inputStyles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [oobCode, setOobCode] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<{
    new?: string;
    confirm?: string;
  }>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [invalidCode, setInvalidCode] = useState(false);

  const strength = getPasswordStrength(newPassword);

  // ── Verify code on mount ──
  useEffect(() => {
    const verifyCode = async () => {
      try {
        // Extract oob code from query params
        const code = Array.isArray(params.oobCode)
          ? params.oobCode[0]
          : params.oobCode;

        if (!code) {
          setInvalidCode(true);
          setVerifying(false);
          return;
        }

        // Verify the code is valid
        const recoveryEmail = await verifyPasswordResetCode(auth, code);
        setOobCode(code);
        setEmail(recoveryEmail);
        setVerifying(false);
      } catch (err: any) {
        console.error("Invalid reset code:", err);
        setInvalidCode(true);
        setVerifying(false);
      }
    };

    verifyCode();
  }, [params.oobCode]);

  const handleResetPassword = async () => {
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
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setSuccess(true);
      setTimeout(() => {
        router.replace("/(auth)/login");
      }, 2500);
    } catch (err: any) {
      Alert.alert(
        "Error",
        err?.message ?? "Failed to reset password. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading state ──
  if (verifying) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={DARK_BLUE} />
          <Text style={styles.loadingText}>Verifying reset link…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Invalid code state ──
  if (invalidCode) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.replace("/(auth)/login")}
          >
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Reset Password</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centerContainer}>
          <View style={styles.errorIconWrap}>
            <Ionicons name="alert-circle" size={48} color={ACCENT_RED} />
          </View>
          <Text style={styles.errorTitle}>Invalid or Expired Link</Text>
          <Text style={styles.errorText}>
            This password reset link is invalid or has expired. Please request
            a new one.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.replace("/(auth)/forgot-password")}
          >
            <Text style={styles.primaryBtnText}>Request New Link</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Success state ──
  if (success) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <Text style={styles.headerTitle}>Reset Password</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centerContainer}>
          <View style={styles.successIconWrap}>
            <Ionicons name="checkmark-circle" size={56} color={SUCCESS_GREEN} />
          </View>
          <Text style={styles.successTitle}>Password Reset Successfully!</Text>
          <Text style={styles.successText}>
            Your password has been updated. You can now log in with your new
            password. Redirecting…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Reset form ──
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.replace("/(auth)/login")}
        >
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reset Password</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroSection}>
          <View style={styles.heroIconWrap}>
            <Ionicons name="shield-checkmark" size={32} color="#C9A227" />
          </View>
          <Text style={styles.heroTitle}>Create New Password</Text>
          <Text style={styles.heroSub}>
            Enter a strong, unique password for your account.
          </Text>
          {email && (
            <Text style={styles.emailDisplay}>
              Reset link sent to: <Text style={{ fontWeight: "700" }}>{email}</Text>
            </Text>
          )}
        </View>

        <View style={styles.card}>
          <FloatingInput
            label="New Password"
            value={newPassword}
            onChangeText={(v) => {
              setNewPassword(v);
              if (errors.new) setErrors((e) => ({ ...e, new: undefined }));
            }}
            error={errors.new}
            secureTextEntry
          />
          {newPassword.length > 0 && <StrengthBar password={newPassword} />}
          <FloatingInput
            label="Confirm Password"
            value={confirmPassword}
            onChangeText={(v) => {
              setConfirmPassword(v);
              if (errors.confirm)
                setErrors((e) => ({ ...e, confirm: undefined }));
            }}
            error={errors.confirm}
            secureTextEntry
          />

          {/* Requirements checklist */}
          <View style={styles.requirementsList}>
            {[
              { test: newPassword.length >= 8, label: "At least 8 characters" },
              { test: /[A-Z]/.test(newPassword), label: "One uppercase letter" },
              { test: /[0-9]/.test(newPassword), label: "One number" },
              {
                test: /[^A-Za-z0-9]/.test(newPassword),
                label: "One special character",
              },
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
            onPress={handleResetPassword}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="lock-closed" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>Reset Password</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backLink}
            onPress={() => router.replace("/(auth)/login")}
          >
            <Text style={styles.backLinkText}>Back to Login</Text>
          </TouchableOpacity>
        </View>
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { color: "#fff", fontSize: 22, fontWeight: "800" },
  headerSpacer: { width: 40 },

  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  loadingText: { fontSize: 14, color: "#666", marginTop: 12 },

  errorIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#FFE4E4",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  errorTitle: { fontSize: 18, fontWeight: "700", color: "#1A1A2E", marginBottom: 8 },
  errorText: { fontSize: 14, color: "#666", textAlign: "center", lineHeight: 21, marginBottom: 24 },

  successIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: SUCCESS_BG,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  successTitle: { fontSize: 20, fontWeight: "800", color: "#1A1A2E", marginBottom: 8 },
  successText: { fontSize: 14, color: "#666", textAlign: "center", lineHeight: 21 },

  scrollContent: { paddingBottom: 40 },

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
  heroTitle: { color: "#fff", fontSize: 22, fontWeight: "800", marginBottom: 6 },
  heroSub: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 12,
  },
  emailDisplay: {
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
    marginTop: 8,
    fontStyle: "italic",
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
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  backLink: { alignItems: "center", marginTop: 16, paddingVertical: 4 },
  backLinkText: { fontSize: 13, color: DARK_BLUE, fontWeight: "600", textDecorationLine: "underline" },
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
  errorContainer: { flexDirection: "row", alignItems: "center", marginTop: 6, marginLeft: 4, gap: 4 },
  errorText: { fontSize: 12, color: ACCENT_RED, fontWeight: "500" },
});

// ─── Strength Bar Styles ──────────────────────────────────────────────────────
const strengthStyles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: -4,
    marginBottom: 8,
    marginLeft: 2,
  },
  bars: { flexDirection: "row", gap: 4, flex: 1 },
  bar: { flex: 1, height: 4, borderRadius: 2 },
  label: { fontSize: 12, fontWeight: "700", minWidth: 44 },
});
