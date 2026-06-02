import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  deleteUser,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  User,
} from "firebase/auth";
import { deleteDoc, doc } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../firebaseConfig"; // adjust path as needed

// ─── Constants ────────────────────────────────────────────────────────────────
const DARK_BLUE = "#2f2f6f";
const ACCENT_RED = "#C0392B";
const ACCENT_RED_LIGHT = "#FEE2E2";
const GOLD = "#C9A227";
const BG = "#F4F5F9";
const WHITE = "#FFFFFF";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function AppModal({
  visible,
  children,
}: {
  visible: boolean;
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

// Generates a random 6-word confirmation phrase
function generateConfirmationPhrase(): string {
  return "delete my account permanently";
}

// ─── Step Indicator ───────────────────────────────────────────────────────────
function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <View style={stepStyles.row}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            stepStyles.dot,
            i + 1 === step && stepStyles.dotActive,
            i + 1 < step && stepStyles.dotDone,
          ]}
        >
          {i + 1 < step && (
            <Ionicons name="checkmark" size={10} color={WHITE} />
          )}
        </View>
      ))}
    </View>
  );
}

const stepStyles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, justifyContent: "center", marginBottom: 20 },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E8E8F0",
    borderWidth: 2,
    borderColor: "#D0D0E0",
    alignItems: "center",
    justifyContent: "center",
  },
  dotActive: {
    backgroundColor: DARK_BLUE,
    borderColor: DARK_BLUE,
  },
  dotDone: {
    backgroundColor: "#4CAF50",
    borderColor: "#4CAF50",
  },
});

// ─── Countdown Button ─────────────────────────────────────────────────────────
function CountdownButton({
  onPress,
  loading,
}: {
  onPress: () => void;
  loading: boolean;
}) {
  const WAIT = 15;
  const [seconds, setSeconds] = useState(WAIT);
  const ready = seconds === 0;

  useEffect(() => {
    if (ready) return;
    const t = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [ready]);

  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: WAIT * 1000,
      useNativeDriver: false,
    }).start();
  }, []);

  const barWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={countdownStyles.wrapper}>
      {/* Progress track */}
      <View style={countdownStyles.track}>
        <Animated.View style={[countdownStyles.fill, { width: barWidth }]} />
      </View>

      <TouchableOpacity
        style={[
          countdownStyles.btn,
          ready && !loading ? countdownStyles.btnReady : countdownStyles.btnWaiting,
        ]}
        onPress={onPress}
        disabled={!ready || loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color={WHITE} size="small" />
        ) : ready ? (
          <View style={countdownStyles.btnInner}>
            <Ionicons name="trash-outline" size={18} color={WHITE} />
            <Text style={countdownStyles.btnText}>Yes, Delete My Account</Text>
          </View>
        ) : (
          <View style={countdownStyles.btnInner}>
            <Ionicons name="time-outline" size={16} color="rgba(255,255,255,0.7)" />
            <Text style={countdownStyles.btnTextWaiting}>
              Please wait {seconds}s…
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const countdownStyles = StyleSheet.create({
  wrapper: { gap: 10 },
  track: {
    height: 3,
    backgroundColor: "#E0E0E0",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 2,
  },
  fill: {
    height: "100%",
    backgroundColor: ACCENT_RED,
    borderRadius: 2,
  },
  btn: {
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  btnReady: {
    backgroundColor: ACCENT_RED,
    elevation: 4,
    shadowColor: ACCENT_RED,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  btnWaiting: {
    backgroundColor: "#CCCCCC",
  },
  btnInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  btnText: { color: WHITE, fontWeight: "700", fontSize: 15, letterSpacing: 0.2 },
  btnTextWaiting: { color: "rgba(255,255,255,0.8)", fontWeight: "600", fontSize: 14 },
});

// ─── Main Delete Account Modal ────────────────────────────────────────────────
interface DeleteAccountModalProps {
  visible: boolean;
  onClose: () => void;
}

export function DeleteAccountModal({ visible, onClose }: DeleteAccountModalProps) {
  const router = useRouter();

  // step: 1 = warning, 2 = type phrase, 3 = enter password, 4 = final confirm
  const [step, setStep] = useState(1);
  const [typedPhrase, setTypedPhrase] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const PHRASE = generateConfirmationPhrase();
  const phraseMatches = typedPhrase.trim().toLowerCase() === PHRASE.toLowerCase();

  // Entrance animation
  const sheetAnim = useRef(new Animated.Value(60)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 80 }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, step]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setCurrentUser(user));
    return () => unsub();
  }, []);

  const reset = () => {
    setStep(1);
    setTypedPhrase("");
    setPassword("");
    setPasswordError(null);
    setPasswordVisible(false);
    sheetAnim.setValue(60);
    fadeAnim.setValue(0);
  };

  const handleClose = () => { reset(); onClose(); };

  const goNext = () => {
    sheetAnim.setValue(30);
    fadeAnim.setValue(0);
    setStep((s) => s + 1);
    Animated.parallel([
      Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 80 }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  };

  // Step 3: verify password before proceeding
  const handleVerifyPassword = async () => {
    if (!password.trim()) {
      setPasswordError("Please enter your current password.");
      return;
    }
    if (!currentUser?.email) {
      setPasswordError("Unable to identify your account. Please log out and try again.");
      return;
    }
    setVerifyingPassword(true);
    setPasswordError(null);
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, password);
      await reauthenticateWithCredential(currentUser, credential);
      goNext();
    } catch (err: any) {
      const code = err?.code ?? "";
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setPasswordError("Incorrect password. Please try again.");
      } else if (code === "auth/too-many-requests") {
        setPasswordError("Too many attempts. Please wait a moment and try again.");
      } else {
        setPasswordError("Verification failed. Please check your password and try again.");
      }
    } finally {
      setVerifyingPassword(false);
    }
  };

  // Step 4: execute deletion
  const handleDeleteAccount = async () => {
    if (!currentUser) return;
    setDeleting(true);
    try {
      try {
        await deleteDoc(doc(db, "users", currentUser.uid));
      } catch (dbErr) {
        console.warn("[DeleteAccount] Firestore delete failed:", dbErr);
      }
      await deleteUser(currentUser);
      reset();
      onClose();
      router.replace("/(auth)/login");
    } catch (err: any) {
      console.error("[DeleteAccount] Error:", err);
      if (err?.code === "auth/requires-recent-login") {
        setStep(3);
        setPasswordError("Session expired. Please re-enter your password.");
      }
    } finally {
      setDeleting(false);
    }
  };

  if (!visible) return null;

  return (
    <AppModal visible={visible}>
      <Animated.View style={[modalStyles.overlay, { opacity: fadeAnim }]}>
        <ScrollView
          contentContainerStyle={modalStyles.scrollContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[
              modalStyles.sheet,
              { transform: [{ translateY: sheetAnim }] },
            ]}
          >
            {/* ── Close Button ── */}
            <TouchableOpacity
              style={modalStyles.closeBtn}
              onPress={handleClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={20} color="#AAAAAA" />
            </TouchableOpacity>

            {/* ── Step Indicator ── */}
            <StepDots step={step} total={4} />

            {/* ══════════════════════════════════════════ */}
            {/* STEP 1 — Warning & Consequences            */}
            {/* ══════════════════════════════════════════ */}
            {step === 1 && (
              <>
                <View style={modalStyles.iconRing}>
                  <View style={[modalStyles.iconBox, { backgroundColor: ACCENT_RED_LIGHT }]}>
                    <Ionicons name="warning-outline" size={30} color={ACCENT_RED} />
                  </View>
                </View>

                <Text style={modalStyles.title}>Delete Account</Text>
                <Text style={modalStyles.subtitle}>
                  This action is permanent and cannot be reversed. Please read the following carefully.
                </Text>

                <View style={step1Styles.consequenceList}>
                  {[
                    { icon: "person-remove-outline", text: "Your profile and personal information will be permanently erased." },
                    { icon: "swap-horizontal-outline", text: "All active and past trade listings will be removed." },
                    { icon: "chatbubbles-outline", text: "Your messages and trade history will be deleted." },
                    { icon: "star-outline", text: "Your ratings, reviews, and reputation will be lost." },
                    { icon: "shield-checkmark-outline", text: "You will be immediately signed out and cannot recover this account." },
                  ].map((item, i) => (
                    <View key={i} style={step1Styles.consequenceRow}>
                      <View style={step1Styles.iconWrap}>
                        <Ionicons name={item.icon as any} size={16} color={ACCENT_RED} />
                      </View>
                      <Text style={step1Styles.consequenceText}>{item.text}</Text>
                    </View>
                  ))}
                </View>

                <View style={step1Styles.warningBadge}>
                  <Ionicons name="alert-circle" size={14} color="#92400E" />
                  <Text style={step1Styles.warningText}>
                    Once deleted, your data cannot be recovered by anyone, including our support team.
                  </Text>
                </View>

                <TouchableOpacity
                  style={[modalStyles.primaryBtn, { backgroundColor: ACCENT_RED }]}
                  onPress={goNext}
                  activeOpacity={0.8}
                >
                  <View style={modalStyles.primaryBtnInner}>
                    <Text style={modalStyles.primaryBtnText}>I Understand, Continue</Text>
                    <Ionicons name="arrow-forward" size={16} color={WHITE} />
                  </View>
                </TouchableOpacity>

                <TouchableOpacity style={modalStyles.cancelBtn} onPress={handleClose}>
                  <Text style={modalStyles.cancelBtnText}>Cancel — Keep My Account</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ══════════════════════════════════════════ */}
            {/* STEP 2 — Type Confirmation Phrase          */}
            {/* ══════════════════════════════════════════ */}
            {step === 2 && (
              <>
                <View style={modalStyles.iconRing}>
                  <View style={[modalStyles.iconBox, { backgroundColor: "#FFF7E0" }]}>
                    <Ionicons name="create-outline" size={28} color={GOLD} />
                  </View>
                </View>

                <Text style={modalStyles.title}>Confirm Your Intent</Text>
                <Text style={modalStyles.subtitle}>
                  To proceed, type the following phrase exactly as shown below.
                </Text>

                <View style={step2Styles.phraseBox}>
                  <Text style={step2Styles.phraseLabel}>Type this phrase:</Text>
                  <Text style={step2Styles.phrase}>{PHRASE}</Text>
                </View>

                <View style={[
                  step2Styles.inputBox,
                  typedPhrase.length > 0 && !phraseMatches && step2Styles.inputBoxError,
                  phraseMatches && step2Styles.inputBoxMatch,
                ]}>
                  <TextInput
                    style={step2Styles.input}
                    value={typedPhrase}
                    onChangeText={setTypedPhrase}
                    placeholder="Type the phrase here…"
                    placeholderTextColor="#CCCCCC"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {phraseMatches && (
                    <Ionicons name="checkmark-circle" size={20} color="#22C55E" style={{ marginRight: 2 }} />
                  )}
                </View>

                {typedPhrase.length > 0 && !phraseMatches && (
                  <View style={step2Styles.mismatchRow}>
                    <Ionicons name="close-circle" size={14} color={ACCENT_RED} />
                    <Text style={step2Styles.mismatchText}>Phrase does not match. Check for typos.</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[
                    modalStyles.primaryBtn,
                    { backgroundColor: phraseMatches ? ACCENT_RED : "#CCCCCC" },
                    !phraseMatches && { elevation: 0, shadowOpacity: 0 },
                  ]}
                  onPress={goNext}
                  disabled={!phraseMatches}
                  activeOpacity={0.8}
                >
                  <View style={modalStyles.primaryBtnInner}>
                    <Text style={modalStyles.primaryBtnText}>Continue</Text>
                    <Ionicons name="arrow-forward" size={16} color={WHITE} />
                  </View>
                </TouchableOpacity>

                <TouchableOpacity style={modalStyles.cancelBtn} onPress={handleClose}>
                  <Text style={modalStyles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ══════════════════════════════════════════ */}
            {/* STEP 3 — Password Verification             */}
            {/* ══════════════════════════════════════════ */}
            {step === 3 && (
              <>
                <View style={modalStyles.iconRing}>
                  <View style={[modalStyles.iconBox, { backgroundColor: "#EEF0FB" }]}>
                    <Ionicons name="lock-closed-outline" size={28} color={DARK_BLUE} />
                  </View>
                </View>

                <Text style={modalStyles.title}>Verify Your Identity</Text>
                <Text style={modalStyles.subtitle}>
                  For your security, please enter your current password to authorize this request.
                </Text>

                <View style={[
                  step3Styles.inputBox,
                  passwordError != null && step3Styles.inputBoxError,
                ]}>
                  <Ionicons name="key-outline" size={18} color={passwordError ? ACCENT_RED : "#AAAAAA"} />
                  <TextInput
                    style={step3Styles.input}
                    value={password}
                    onChangeText={(t) => { setPassword(t); setPasswordError(null); }}
                    placeholder="Enter your password"
                    placeholderTextColor="#CCCCCC"
                    secureTextEntry={!passwordVisible}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    onPress={() => setPasswordVisible((v) => !v)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={passwordVisible ? "eye-off-outline" : "eye-outline"}
                      size={18}
                      color="#AAAAAA"
                    />
                  </TouchableOpacity>
                </View>

                {passwordError && (
                  <View style={step3Styles.errorRow}>
                    <Ionicons name="alert-circle" size={14} color={ACCENT_RED} />
                    <Text style={step3Styles.errorText}>{passwordError}</Text>
                  </View>
                )}

                {/* FIX: replaced <> fragment with <View> to prevent web text node error */}
                <TouchableOpacity
                  style={[
                    modalStyles.primaryBtn,
                    { backgroundColor: DARK_BLUE },
                    verifyingPassword && { opacity: 0.7 },
                  ]}
                  onPress={handleVerifyPassword}
                  disabled={verifyingPassword}
                  activeOpacity={0.8}
                >
                  {verifyingPassword ? (
                    <ActivityIndicator color={WHITE} size="small" />
                  ) : (
                    <View style={modalStyles.primaryBtnInner}>
                      <Text style={modalStyles.primaryBtnText}>Verify & Continue</Text>
                      <Ionicons name="arrow-forward" size={16} color={WHITE} />
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={modalStyles.cancelBtn} onPress={handleClose}>
                  <Text style={modalStyles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ══════════════════════════════════════════ */}
            {/* STEP 4 — Final Confirmation + 15s Cooldown */}
            {/* ══════════════════════════════════════════ */}
            {step === 4 && (
              <>
                <View style={modalStyles.iconRing}>
                  <View style={[modalStyles.iconBox, { backgroundColor: ACCENT_RED_LIGHT }]}>
                    <Ionicons name="trash-outline" size={30} color={ACCENT_RED} />
                  </View>
                </View>

                <Text style={modalStyles.title}>Final Confirmation</Text>
                <Text style={modalStyles.subtitle}>
                  You are about to permanently delete your account. This step cannot be undone.
                </Text>

                <View style={step4Styles.summaryBox}>
                  <View style={step4Styles.summaryRow}>
                    <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                    <Text style={step4Styles.summaryText}>Confirmation phrase verified</Text>
                  </View>
                  <View style={step4Styles.summaryRow}>
                    <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                    <Text style={step4Styles.summaryText}>Identity verified</Text>
                  </View>
                  <View style={step4Styles.summaryRow}>
                    <Ionicons name="alert-circle" size={16} color={ACCENT_RED} />
                    <Text style={[step4Styles.summaryText, { color: ACCENT_RED, fontWeight: "700" }]}>
                      Deletion is irreversible
                    </Text>
                  </View>
                </View>

                <Text style={step4Styles.cooldownNote}>
                  The delete button will be enabled after the countdown completes. This delay is to prevent accidental deletion.
                </Text>

                {/* Countdown button renders fresh each time step 4 mounts */}
                <CountdownButton
                  key={`countdown-${step}`}
                  onPress={handleDeleteAccount}
                  loading={deleting}
                />

                <TouchableOpacity style={modalStyles.cancelBtn} onPress={handleClose}>
                  <Text style={modalStyles.cancelBtnText}>Cancel — Keep My Account</Text>
                </TouchableOpacity>
              </>
            )}
          </Animated.View>
        </ScrollView>
      </Animated.View>
    </AppModal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(10,10,30,0.6)",
    justifyContent: "flex-end",
  },
  scrollContainer: {
    justifyContent: "flex-end",
    flexGrow: 1,
  },
  sheet: {
    backgroundColor: WHITE,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 28,
    paddingHorizontal: 24,
    paddingBottom: 44,
  },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F0F0F5",
    justifyContent: "center",
    alignItems: "center",
  },
  iconRing: {
    alignItems: "center",
    marginBottom: 16,
  },
  iconBox: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1A1A2E",
    textAlign: "center",
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 22,
    paddingHorizontal: 8,
  },
  primaryBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderRadius: 14,
    elevation: 3,
    shadowColor: ACCENT_RED,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    marginBottom: 12,
  },
  // FIX: extracted row layout into a dedicated inner View style
  // instead of relying on flexDirection on the button itself with a fragment child
  primaryBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  primaryBtnText: {
    color: WHITE,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  cancelBtn: {
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelBtnText: {
    color: "#888",
    fontSize: 14,
    fontWeight: "600",
  },
});

const step1Styles = StyleSheet.create({
  consequenceList: {
    backgroundColor: "#FEF9F9",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FADADD",
    padding: 16,
    gap: 12,
    marginBottom: 16,
  },
  consequenceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ACCENT_RED_LIGHT,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 1,
  },
  consequenceText: {
    flex: 1,
    fontSize: 13.5,
    color: "#444",
    lineHeight: 19,
    fontWeight: "500",
  },
  warningBadge: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FFFBEB",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FDE68A",
    padding: 12,
    gap: 8,
    marginBottom: 20,
  },
  warningText: {
    flex: 1,
    fontSize: 12.5,
    color: "#92400E",
    lineHeight: 17,
    fontWeight: "500",
  },
});

const step2Styles = StyleSheet.create({
  phraseBox: {
    backgroundColor: "#F4F5F9",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: "#E0E0F0",
    borderStyle: "dashed",
  },
  phraseLabel: {
    fontSize: 11,
    color: "#888",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  phrase: {
    fontSize: 16,
    fontWeight: "800",
    color: DARK_BLUE,
    letterSpacing: 0.3,
    textAlign: "center",
  },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#FAFAFA",
    gap: 8,
    marginBottom: 6,
  },
  inputBoxError: { borderColor: ACCENT_RED },
  inputBoxMatch: { borderColor: "#22C55E", backgroundColor: "#F0FDF4" },
  input: {
    flex: 1,
    fontSize: 14,
    color: "#1A1A2E",
    fontWeight: "500",
  },
  mismatchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
    marginLeft: 2,
  },
  mismatchText: {
    fontSize: 12,
    color: ACCENT_RED,
    fontWeight: "500",
  },
});

const step3Styles = StyleSheet.create({
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: "#FAFAFA",
    gap: 10,
    marginBottom: 6,
  },
  inputBoxError: { borderColor: ACCENT_RED },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#1A1A2E",
    fontWeight: "500",
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
    marginLeft: 2,
  },
  errorText: {
    fontSize: 12,
    color: ACCENT_RED,
    fontWeight: "500",
    flex: 1,
  },
});

const step4Styles = StyleSheet.create({
  summaryBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E8E8F0",
    padding: 14,
    gap: 10,
    marginBottom: 14,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  summaryText: {
    fontSize: 13.5,
    color: "#444",
    fontWeight: "500",
  },
  cooldownNote: {
    fontSize: 12,
    color: "#AAAAAA",
    textAlign: "center",
    lineHeight: 17,
    marginBottom: 16,
    fontStyle: "italic",
    paddingHorizontal: 4,
  },
});