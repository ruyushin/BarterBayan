import { Ionicons } from "@expo/vector-icons";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { useRouter } from "expo-router";
import {
  deleteUser,
  EmailAuthProvider,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  User,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../firebaseConfig";

// ─── Constants ────────────────────────────────────────────────────────────────
const DARK_BLUE = "#2f2f6f";
const ACCENT_RED = "#C0392B";
const ACCENT_RED_LIGHT = "#FEE2E2";
const GOLD = "#C9A227";
const WHITE = "#FFFFFF";

const CONFIRMATION_PHRASE = "delete my account permanently";
const REASON_MAX_LENGTH = 300;

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

/** Returns true if the user signed in via Google (no password). */
function isGoogleUser(user: User | null): boolean {
  return (
    user?.providerData?.some((p) => p.providerId === "google.com") ?? false
  );
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
  row: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginBottom: 20,
  },
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
  dotActive: { backgroundColor: DARK_BLUE, borderColor: DARK_BLUE },
  dotDone: { backgroundColor: "#4CAF50", borderColor: "#4CAF50" },
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
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (ready) return;
    const t = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [ready]);

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
    <View style={cdStyles.wrapper}>
      <View style={cdStyles.track}>
        <Animated.View style={[cdStyles.fill, { width: barWidth }]} />
      </View>
      <TouchableOpacity
        style={[
          cdStyles.btn,
          ready && !loading ? cdStyles.btnReady : cdStyles.btnWaiting,
        ]}
        onPress={onPress}
        disabled={!ready || loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color={WHITE} size="small" />
        ) : ready ? (
          <View style={cdStyles.inner}>
            <Ionicons name="trash-outline" size={18} color={WHITE} />
            <Text style={cdStyles.btnText}>Yes, Delete My Account</Text>
          </View>
        ) : (
          <View style={cdStyles.inner}>
            <Ionicons
              name="time-outline"
              size={16}
              color="rgba(255,255,255,0.7)"
            />
            <Text style={cdStyles.btnTextWaiting}>Please wait {seconds}s…</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const cdStyles = StyleSheet.create({
  wrapper: { gap: 10 },
  track: {
    height: 3,
    backgroundColor: "#E0E0E0",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 2,
  },
  fill: { height: "100%", backgroundColor: ACCENT_RED, borderRadius: 2 },
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
  btnWaiting: { backgroundColor: "#CCCCCC" },
  inner: { flexDirection: "row", alignItems: "center", gap: 8 },
  btnText: {
    color: WHITE,
    fontWeight: "700",
    fontSize: 15,
    letterSpacing: 0.2,
  },
  btnTextWaiting: {
    color: "rgba(255,255,255,0.8)",
    fontWeight: "600",
    fontSize: 14,
  },
});

// ─── Success Overlay ──────────────────────────────────────────────────────────
function SuccessOverlay({ onDone }: { onDone: () => void }) {
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 70,
        friction: 7,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View style={successStyles.overlay}>
      <Animated.View
        style={[successStyles.card, { opacity, transform: [{ scale }] }]}
      >
        <View style={successStyles.iconRing}>
          <Ionicons name="checkmark-circle" size={56} color="#22C55E" />
        </View>
        <Text style={successStyles.title}>Account Deleted</Text>
        <Text style={successStyles.body}>
          Your account and all associated data have been permanently erased. We
          hope to see you again someday.
        </Text>
        <TouchableOpacity
          style={successStyles.btn}
          onPress={onDone}
          activeOpacity={0.85}
        >
          <Text style={successStyles.btnText}>Back to Login</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const successStyles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(10,10,30,0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 99999,
    elevation: 100,
    padding: 24,
  },
  card: {
    backgroundColor: WHITE,
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    width: "100%",
    maxWidth: 360,
  },
  iconRing: { marginBottom: 16 },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1A1A2E",
    marginBottom: 10,
    textAlign: "center",
  },
  body: {
    fontSize: 14,
    color: "#666",
    lineHeight: 21,
    textAlign: "center",
    marginBottom: 24,
  },
  btn: {
    backgroundColor: DARK_BLUE,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 40,
  },
  btnText: { color: WHITE, fontWeight: "700", fontSize: 15 },
});

// ─── Main Modal ───────────────────────────────────────────────────────────────
interface DeleteAccountModalProps {
  visible: boolean;
  onClose: () => void;
}

export function DeleteAccountModal({
  visible,
  onClose,
}: DeleteAccountModalProps) {
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [typedPhrase, setTypedPhrase] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [credential, setCredential] = useState("");
  const [credentialVisible, setCredentialVisible] = useState(false);
  const [credentialError, setCredentialError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // ── Android keyboard fix (same technique as TradeChatModal) ──────────────
  // KeyboardAvoidingView inside a non-standard Modal wrapper on Android
  // miscalculates its own Y-offset and causes the sheet to jump. Instead,
  // we listen to keyboard events and apply marginBottom directly to the sheet.
  const [androidKeyboardHeight, setAndroidKeyboardHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      setAndroidKeyboardHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      setAndroidKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const googleUser = isGoogleUser(currentUser);
  const phraseMatches =
    typedPhrase.trim().toLowerCase() === CONFIRMATION_PHRASE.toLowerCase();

  const sheetAnim = useRef(new Animated.Value(60)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(sheetAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, step]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setCurrentUser(u));
    return () => unsub();
  }, []);

  const reset = () => {
    setStep(1);
    setTypedPhrase("");
    setDeleteReason("");
    setReasonError(null);
    setCredential("");
    setCredentialError(null);
    setCredentialVisible(false);
    setShowSuccess(false);
    setAndroidKeyboardHeight(0);
    sheetAnim.setValue(60);
    fadeAnim.setValue(0);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const goNext = () => {
    sheetAnim.setValue(30);
    fadeAnim.setValue(0);
    setStep((s) => s + 1);
    Animated.parallel([
      Animated.spring(sheetAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // ── Step 3: submit reason for deletion ───────────────────────────────────
  const handleReasonContinue = async () => {
    const trimmed = deleteReason.trim();
    if (!trimmed) {
      setReasonError("Please tell us why you're leaving.");
      return;
    }
    if (trimmed.length > REASON_MAX_LENGTH) {
      setReasonError(`Please limit your reason to ${REASON_MAX_LENGTH} characters.`);
      return;
    }

    if (currentUser) {
      try {
        await setDoc(
          doc(db, "accountDeletionFeedback", currentUser.uid),
          {
            uid: currentUser.uid,
            email: currentUser.email ?? null,
            reason: trimmed,
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err) {
        console.warn("[DeleteAccount] Failed to save deletion reason:", err);
      }
    }

    setReasonError(null);
    goNext();
  };

  // ── Step 4: verify identity ──────────────────────────────────────────────
  const handleVerify = async () => {
    if (!currentUser?.email) {
      setCredentialError(
        "Unable to identify your account. Please log out and try again."
      );
      return;
    }

    if (googleUser) {
      setVerifying(true);
      setCredentialError(null);
      try {
        await GoogleSignin.hasPlayServices();
        const signInResult = await GoogleSignin.signIn();
        const idToken =
          signInResult.data?.idToken ?? (signInResult as any).idToken;

        if (!idToken) {
          setCredentialError("Google sign-in failed. Please try again.");
          return;
        }

        const googleCredential = GoogleAuthProvider.credential(idToken);
        await reauthenticateWithCredential(currentUser, googleCredential);
        goNext();
      } catch (err: any) {
        const code = err?.code ?? "";
        if (code === "SIGN_IN_CANCELLED" || code === "-5") {
          setCredentialError("Sign-in was cancelled. Please try again.");
        } else {
          setCredentialError("Google verification failed. Please try again.");
        }
      } finally {
        setVerifying(false);
      }
      return;
    }

    if (!credential.trim()) {
      setCredentialError("Please enter your password.");
      return;
    }

    setVerifying(true);
    setCredentialError(null);
    try {
      const cred = EmailAuthProvider.credential(currentUser.email, credential);
      await reauthenticateWithCredential(currentUser, cred);
      goNext();
    } catch (err: any) {
      const code = err?.code ?? "";
      if (
        code === "auth/wrong-password" ||
        code === "auth/invalid-credential"
      ) {
        setCredentialError("Incorrect password. Please try again.");
      } else if (code === "auth/too-many-requests") {
        setCredentialError(
          "Too many attempts. Please wait a moment and try again."
        );
      } else {
        setCredentialError(
          "Verification failed. Please check your credentials and try again."
        );
      }
    } finally {
      setVerifying(false);
    }
  };

  // ── Step 5: execute deletion ─────────────────────────────────────────────
  const handleDeleteAccount = async () => {
    if (!currentUser) return;
    setDeleting(true);
    try {
      const firestoreDb = getFirestore();
      const uid = currentUser.uid;

      // ── 1. Delete all items/posts created by this user ──────────────────
      // These appear in the Explore and Home (trending/suggested) tabs.
      try {
        const itemsQuery = query(
          collection(firestoreDb, "items"),
          where("ownerId", "==", uid)
        );
        const itemsSnap = await getDocs(itemsQuery);
        await Promise.all(itemsSnap.docs.map((d) => deleteDoc(d.ref)));
      } catch (err) {
        console.warn("[DeleteAccount] Failed to delete user items:", err);
      }

      // ── 2. Delete all trade offers where user is offerer or owner ────────
      try {
        const asOfferer = query(
          collection(firestoreDb, "tradeOffers"),
          where("offererId", "==", uid)
        );
        const asOwner = query(
          collection(firestoreDb, "tradeOffers"),
          where("ownerId", "==", uid)
        );
        const [offererSnap, ownerSnap] = await Promise.all([
          getDocs(asOfferer),
          getDocs(asOwner),
        ]);
        // Deduplicate by doc ID in case a doc appears in both queries
        const tradeDocMap = new Map<string, any>();
        [...offererSnap.docs, ...ownerSnap.docs].forEach((d) =>
          tradeDocMap.set(d.id, d.ref)
        );
        await Promise.all([...tradeDocMap.values()].map((ref) => deleteDoc(ref)));
      } catch (err) {
        console.warn("[DeleteAccount] Failed to delete trade offers:", err);
      }

      // ── 3. Delete the user Firestore profile doc ─────────────────────────
      try {
        await deleteDoc(doc(firestoreDb, "users", uid));
      } catch (err) {
        console.warn("[DeleteAccount] Failed to delete user profile doc:", err);
      }

      // ── 4. Delete the Firebase Auth account ─────────────────────────────
      await deleteUser(currentUser);

      setDeleting(false);
      setShowSuccess(true);
    } catch (err: any) {
      console.error("[DeleteAccount] Error:", err);
      setDeleting(false);
      if (err?.code === "auth/requires-recent-login") {
        setStep(4);
        setCredential("");
        setCredentialError("Session expired. Please re-verify your identity.");
      }
    }
  };

  const handleSuccessDone = () => {
    reset();
    onClose();
    router.replace("/(auth)/login");
  };

  if (!visible) return null;

  return (
    <AppModal visible={visible}>
      {showSuccess && <SuccessOverlay onDone={handleSuccessDone} />}

      {/*
       * PATCH: Same keyboard fix as TradeChatModal.
       *
       * On iOS: KeyboardAvoidingView behavior="padding" works correctly because
       *   the AppModal wrapper starts at (0,0).
       * On Android: KeyboardAvoidingView miscalculates offset inside custom
       *   modal wrappers and causes the sheet to jump. We skip it entirely and
       *   drive the sheet offset via androidKeyboardHeight + marginBottom below.
       */}
      {Platform.OS === "ios" ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior="padding"
          keyboardVerticalOffset={0}
        >
          <SheetContent
            step={step}
            fadeAnim={fadeAnim}
            sheetAnim={sheetAnim}
            androidKeyboardHeight={0}
            onClose={handleClose}
            goNext={goNext}
            typedPhrase={typedPhrase}
            setTypedPhrase={setTypedPhrase}
            phraseMatches={phraseMatches}
            deleteReason={deleteReason}
            setDeleteReason={setDeleteReason}
            reasonError={reasonError}
            handleReasonContinue={handleReasonContinue}
            googleUser={googleUser}
            credential={credential}
            setCredential={setCredential}
            credentialVisible={credentialVisible}
            setCredentialVisible={setCredentialVisible}
            credentialError={credentialError}
            setCredentialError={setCredentialError}
            verifying={verifying}
            handleVerify={handleVerify}
            deleting={deleting}
            handleDeleteAccount={handleDeleteAccount}
          />
        </KeyboardAvoidingView>
      ) : (
        <View style={{ flex: 1 }}>
          <SheetContent
            step={step}
            fadeAnim={fadeAnim}
            sheetAnim={sheetAnim}
            androidKeyboardHeight={androidKeyboardHeight}
            onClose={handleClose}
            goNext={goNext}
            typedPhrase={typedPhrase}
            setTypedPhrase={setTypedPhrase}
            phraseMatches={phraseMatches}
            deleteReason={deleteReason}
            setDeleteReason={setDeleteReason}
            reasonError={reasonError}
            handleReasonContinue={handleReasonContinue}
            googleUser={googleUser}
            credential={credential}
            setCredential={setCredential}
            credentialVisible={credentialVisible}
            setCredentialVisible={setCredentialVisible}
            credentialError={credentialError}
            setCredentialError={setCredentialError}
            verifying={verifying}
            handleVerify={handleVerify}
            deleting={deleting}
            handleDeleteAccount={handleDeleteAccount}
          />
        </View>
      )}
    </AppModal>
  );
}

// ─── SheetContent (extracted so both iOS/Android branches share the same JSX) ─
interface SheetContentProps {
  step: number;
  fadeAnim: Animated.Value;
  sheetAnim: Animated.Value;
  androidKeyboardHeight: number;
  onClose: () => void;
  goNext: () => void;
  typedPhrase: string;
  setTypedPhrase: (v: string) => void;
  phraseMatches: boolean;
  deleteReason: string;
  setDeleteReason: (v: string) => void;
  reasonError: string | null;
  handleReasonContinue: () => void;
  googleUser: boolean;
  credential: string;
  setCredential: (v: string) => void;
  credentialVisible: boolean;
  setCredentialVisible: (v: boolean) => void;
  credentialError: string | null;
  setCredentialError: (v: string | null) => void;
  verifying: boolean;
  handleVerify: () => void;
  deleting: boolean;
  handleDeleteAccount: () => void;
}

function SheetContent({
  step,
  fadeAnim,
  sheetAnim,
  androidKeyboardHeight,
  onClose,
  goNext,
  typedPhrase,
  setTypedPhrase,
  phraseMatches,
  deleteReason,
  setDeleteReason,
  reasonError,
  handleReasonContinue,
  googleUser,
  credential,
  setCredential,
  credentialVisible,
  setCredentialVisible,
  credentialError,
  setCredentialError,
  verifying,
  handleVerify,
  deleting,
  handleDeleteAccount,
}: SheetContentProps) {
  return (
    <Animated.View style={[modalStyles.overlay, { opacity: fadeAnim }]}>
      <ScrollView
        contentContainerStyle={[
          modalStyles.scrollContainer,
          // Android: push the sheet up by the exact keyboard height
          Platform.OS === "android" && androidKeyboardHeight > 0
            ? { paddingBottom: androidKeyboardHeight }
            : {},
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Animated.View
          style={[
            modalStyles.sheet,
            { transform: [{ translateY: sheetAnim }] },
          ]}
        >
          {/* Close */}
          <TouchableOpacity
            style={modalStyles.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={20} color="#AAAAAA" />
          </TouchableOpacity>

          <StepDots step={step} total={5} />

          {/* ══ STEP 1 — Warning & Consequences ══ */}
          {step === 1 && (
            <>
              <View style={modalStyles.iconRing}>
                <View
                  style={[
                    modalStyles.iconBox,
                    { backgroundColor: ACCENT_RED_LIGHT },
                  ]}
                >
                  <Ionicons
                    name="warning-outline"
                    size={30}
                    color={ACCENT_RED}
                  />
                </View>
              </View>

              <Text style={modalStyles.title}>Delete Account</Text>
              <Text style={modalStyles.subtitle}>
                This action is permanent and cannot be reversed. Please read
                the following carefully.
              </Text>

              <View style={s1.list}>
                {[
                  {
                    icon: "person-remove-outline",
                    text: "Your profile and personal information will be permanently erased.",
                  },
                  {
                    icon: "swap-horizontal-outline",
                    text: "All active and past trade listings will be removed.",
                  },
                  {
                    icon: "grid-outline",
                    text: "All your posts will be removed from Explore and Home.",
                  },
                  {
                    icon: "chatbubbles-outline",
                    text: "Your messages and trade history will be deleted.",
                  },
                  {
                    icon: "star-outline",
                    text: "Your ratings, reviews, and reputation will be lost.",
                  },
                  {
                    icon: "shield-checkmark-outline",
                    text: "You will be immediately signed out and cannot recover this account.",
                  },
                ].map((item, i) => (
                  <View key={i} style={s1.row}>
                    <View style={s1.iconWrap}>
                      <Ionicons
                        name={item.icon as any}
                        size={16}
                        color={ACCENT_RED}
                      />
                    </View>
                    <Text style={s1.text}>{item.text}</Text>
                  </View>
                ))}
              </View>

              <View style={s1.badge}>
                <Ionicons name="alert-circle" size={14} color="#92400E" />
                <Text style={s1.badgeText}>
                  Once deleted, your data cannot be recovered by anyone,
                  including our support team.
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  modalStyles.primaryBtn,
                  { backgroundColor: ACCENT_RED },
                ]}
                onPress={goNext}
                activeOpacity={0.8}
              >
                <View style={modalStyles.primaryBtnInner}>
                  <Text style={modalStyles.primaryBtnText}>
                    I Understand, Continue
                  </Text>
                  <Ionicons name="arrow-forward" size={16} color={WHITE} />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={modalStyles.cancelBtn}
                onPress={onClose}
              >
                <Text style={modalStyles.cancelBtnText}>
                  Cancel — Keep My Account
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* ══ STEP 2 — Type Confirmation Phrase ══ */}
          {step === 2 && (
            <>
              <View style={modalStyles.iconRing}>
                <View
                  style={[
                    modalStyles.iconBox,
                    { backgroundColor: "#FFF7E0" },
                  ]}
                >
                  <Ionicons
                    name="create-outline"
                    size={28}
                    color={GOLD}
                  />
                </View>
              </View>

              <Text style={modalStyles.title}>Confirm Your Intent</Text>
              <Text style={modalStyles.subtitle}>
                To proceed, type the following phrase exactly as shown below.
              </Text>

              <View style={s2.phraseBox}>
                <Text style={s2.phraseLabel}>Type this phrase:</Text>
                <Text style={s2.phrase}>{CONFIRMATION_PHRASE}</Text>
              </View>

              <View
                style={[
                  s2.inputBox,
                  typedPhrase.length > 0 &&
                    !phraseMatches &&
                    s2.inputBoxError,
                  phraseMatches && s2.inputBoxMatch,
                ]}
              >
                <TextInput
                  style={s2.input}
                  value={typedPhrase}
                  onChangeText={setTypedPhrase}
                  placeholder="Type the phrase here…"
                  placeholderTextColor="#CCCCCC"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                />
                {phraseMatches && (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color="#22C55E"
                    style={{ marginRight: 2 }}
                  />
                )}
              </View>

              {typedPhrase.length > 0 && !phraseMatches && (
                <View style={s2.mismatchRow}>
                  <Ionicons
                    name="close-circle"
                    size={14}
                    color={ACCENT_RED}
                  />
                  <Text style={s2.mismatchText}>
                    Phrase does not match. Check for typos.
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[
                  modalStyles.primaryBtn,
                  {
                    backgroundColor: phraseMatches ? ACCENT_RED : "#CCCCCC",
                  },
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

              <TouchableOpacity
                style={modalStyles.cancelBtn}
                onPress={onClose}
              >
                <Text style={modalStyles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ══ STEP 3 — Reason for Deletion ══ */}
          {step === 3 && (
            <>
              <View style={modalStyles.iconRing}>
                <View
                  style={[
                    modalStyles.iconBox,
                    { backgroundColor: "#EEF0FB" },
                  ]}
                >
                  <Ionicons
                    name="chatbox-ellipses-outline"
                    size={28}
                    color={DARK_BLUE}
                  />
                </View>
              </View>

              <Text style={modalStyles.title}>Help Us Improve</Text>
              <Text style={modalStyles.subtitle}>
                Before you go, please share why you're deleting your
                account. This is required and helps us improve the app.
              </Text>

              <View
                style={[
                  s5.textAreaBox,
                  reasonError != null && s5.textAreaBoxError,
                ]}
              >
                <TextInput
                  style={s5.textArea}
                  value={deleteReason}
                  onChangeText={(t) => {
                    if (t.length <= REASON_MAX_LENGTH) {
                      setDeleteReason(t);
                    }
                  }}
                  placeholder="Tell us why you're leaving…"
                  placeholderTextColor="#CCCCCC"
                  multiline
                  numberOfLines={5}
                  maxLength={REASON_MAX_LENGTH}
                  textAlignVertical="top"
                />
              </View>

              <View style={s5.counterRow}>
                {reasonError ? (
                  <View style={s5.errorRow}>
                    <Ionicons
                      name="alert-circle"
                      size={14}
                      color={ACCENT_RED}
                    />
                    <Text style={s5.errorText}>{reasonError}</Text>
                  </View>
                ) : (
                  <View />
                )}
                <Text
                  style={[
                    s5.counterText,
                    deleteReason.length >= REASON_MAX_LENGTH &&
                      s5.counterTextLimit,
                  ]}
                >
                  {deleteReason.length}/{REASON_MAX_LENGTH}
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  modalStyles.primaryBtn,
                  { backgroundColor: DARK_BLUE },
                ]}
                onPress={handleReasonContinue}
                activeOpacity={0.8}
              >
                <View style={modalStyles.primaryBtnInner}>
                  <Text style={modalStyles.primaryBtnText}>Continue</Text>
                  <Ionicons name="arrow-forward" size={16} color={WHITE} />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={modalStyles.cancelBtn}
                onPress={onClose}
              >
                <Text style={modalStyles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ══ STEP 4 — Verify Identity ══ */}
          {step === 4 && (
            <>
              <View style={modalStyles.iconRing}>
                <View
                  style={[
                    modalStyles.iconBox,
                    {
                      backgroundColor: googleUser ? "#E8F0FE" : "#EEF0FB",
                    },
                  ]}
                >
                  <Ionicons
                    name={googleUser ? "logo-google" : "lock-closed-outline"}
                    size={28}
                    color={googleUser ? "#4285F4" : DARK_BLUE}
                  />
                </View>
              </View>

              <Text style={modalStyles.title}>Verify Your Identity</Text>
              <Text style={modalStyles.subtitle}>
                {googleUser
                  ? "Tap the button below to verify your Google account before proceeding."
                  : "For your security, please enter your current password to authorize this request."}
              </Text>

              {credentialError && (
                <View style={s3.errorRow}>
                  <Ionicons
                    name="alert-circle"
                    size={14}
                    color={ACCENT_RED}
                  />
                  <Text style={s3.errorText}>{credentialError}</Text>
                </View>
              )}

              {googleUser ? (
                <TouchableOpacity
                  style={[
                    modalStyles.primaryBtn,
                    { backgroundColor: "#4285F4" },
                    verifying && { opacity: 0.7 },
                  ]}
                  onPress={handleVerify}
                  disabled={verifying}
                  activeOpacity={0.8}
                >
                  {verifying ? (
                    <ActivityIndicator color={WHITE} size="small" />
                  ) : (
                    <View style={modalStyles.primaryBtnInner}>
                      <Ionicons name="logo-google" size={18} color={WHITE} />
                      <Text style={modalStyles.primaryBtnText}>
                        Verify with Google
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              ) : (
                <>
                  <View
                    style={[
                      s3.inputBox,
                      credentialError != null && s3.inputBoxError,
                    ]}
                  >
                    <Ionicons
                      name="key-outline"
                      size={18}
                      color={credentialError ? ACCENT_RED : "#AAAAAA"}
                    />
                    <TextInput
                      style={s3.input}
                      value={credential}
                      onChangeText={(t) => {
                        setCredential(t);
                        setCredentialError(null);
                      }}
                      placeholder="Enter your password"
                      placeholderTextColor="#CCCCCC"
                      secureTextEntry={!credentialVisible}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={handleVerify}
                    />
                    <TouchableOpacity
                      onPress={() => setCredentialVisible(!credentialVisible)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name={
                          credentialVisible
                            ? "eye-off-outline"
                            : "eye-outline"
                        }
                        size={18}
                        color="#AAAAAA"
                      />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={[
                      modalStyles.primaryBtn,
                      { backgroundColor: DARK_BLUE },
                      verifying && { opacity: 0.7 },
                    ]}
                    onPress={handleVerify}
                    disabled={verifying}
                    activeOpacity={0.8}
                  >
                    {verifying ? (
                      <ActivityIndicator color={WHITE} size="small" />
                    ) : (
                      <View style={modalStyles.primaryBtnInner}>
                        <Text style={modalStyles.primaryBtnText}>
                          Verify & Continue
                        </Text>
                        <Ionicons
                          name="arrow-forward"
                          size={16}
                          color={WHITE}
                        />
                      </View>
                    )}
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity
                style={modalStyles.cancelBtn}
                onPress={onClose}
              >
                <Text style={modalStyles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ══ STEP 5 — Final Confirm + 15s Cooldown ══ */}
          {step === 5 && (
            <>
              <View style={modalStyles.iconRing}>
                <View
                  style={[
                    modalStyles.iconBox,
                    { backgroundColor: ACCENT_RED_LIGHT },
                  ]}
                >
                  <Ionicons
                    name="trash-outline"
                    size={30}
                    color={ACCENT_RED}
                  />
                </View>
              </View>

              <Text style={modalStyles.title}>Final Confirmation</Text>
              <Text style={modalStyles.subtitle}>
                You are about to permanently delete your account. This step
                cannot be undone.
              </Text>

              <View style={s4.summaryBox}>
                {[
                  {
                    icon: "checkmark-circle",
                    color: "#22C55E",
                    label: "Confirmation phrase verified",
                    bold: false,
                  },
                  {
                    icon: "checkmark-circle",
                    color: "#22C55E",
                    label: "Identity verified",
                    bold: false,
                  },
                  {
                    icon: "checkmark-circle",
                    color: "#22C55E",
                    label: "All posts & trade items will be deleted",
                    bold: false,
                  },
                  {
                    icon: "alert-circle",
                    color: ACCENT_RED,
                    label: "Deletion is irreversible",
                    bold: true,
                  },
                ].map((item, i) => (
                  <View key={i} style={s4.summaryRow}>
                    <Ionicons
                      name={item.icon as any}
                      size={16}
                      color={item.color}
                    />
                    <Text
                      style={[
                        s4.summaryText,
                        item.bold && {
                          color: ACCENT_RED,
                          fontWeight: "700",
                        },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </View>
                ))}
              </View>

              <Text style={s4.cooldownNote}>
                The delete button will activate after the countdown. This
                delay is to prevent accidental deletion.
              </Text>

              <CountdownButton
                key={`countdown-${step}`}
                onPress={handleDeleteAccount}
                loading={deleting}
              />

              <TouchableOpacity
                style={modalStyles.cancelBtn}
                onPress={onClose}
              >
                <Text style={modalStyles.cancelBtnText}>
                  Cancel — Keep My Account
                </Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      </ScrollView>
    </Animated.View>
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
    paddingBottom: Platform.OS === "ios" ? 44 : 24,
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
  iconRing: { alignItems: "center", marginBottom: 16 },
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
  cancelBtn: { paddingVertical: 12, alignItems: "center" },
  cancelBtnText: { color: "#888", fontSize: 14, fontWeight: "600" },
});

const s1 = StyleSheet.create({
  list: {
    backgroundColor: "#FEF9F9",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FADADD",
    padding: 16,
    gap: 12,
    marginBottom: 16,
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ACCENT_RED_LIGHT,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 1,
  },
  text: {
    flex: 1,
    fontSize: 13.5,
    color: "#444",
    lineHeight: 19,
    fontWeight: "500",
  },
  badge: {
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
  badgeText: {
    flex: 1,
    fontSize: 12.5,
    color: "#92400E",
    lineHeight: 17,
    fontWeight: "500",
  },
});

const s2 = StyleSheet.create({
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
  input: { flex: 1, fontSize: 14, color: "#1A1A2E", fontWeight: "500" },
  mismatchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
    marginLeft: 2,
  },
  mismatchText: { fontSize: 12, color: ACCENT_RED, fontWeight: "500" },
});

const s3 = StyleSheet.create({
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
    marginBottom: 12,
  },
  inputBoxError: { borderColor: ACCENT_RED },
  input: { flex: 1, fontSize: 15, color: "#1A1A2E", fontWeight: "500" },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
    marginLeft: 2,
  },
  errorText: { fontSize: 12, color: ACCENT_RED, fontWeight: "500", flex: 1 },
});

const s4 = StyleSheet.create({
  summaryBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E8E8F0",
    padding: 14,
    gap: 10,
    marginBottom: 14,
  },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  summaryText: { fontSize: 13.5, color: "#444", fontWeight: "500" },
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

const s5 = StyleSheet.create({
  textAreaBox: {
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderRadius: 12,
    backgroundColor: "#FAFAFA",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 6,
    minHeight: 120,
  },
  textAreaBoxError: { borderColor: ACCENT_RED },
  textArea: {
    fontSize: 14,
    color: "#1A1A2E",
    fontWeight: "500",
    minHeight: 96,
    textAlignVertical: "top",
  },
  counterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    marginLeft: 2,
    marginRight: 2,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  errorText: { fontSize: 12, color: ACCENT_RED, fontWeight: "500" },
  counterText: { fontSize: 12, color: "#AAAAAA", fontWeight: "500" },
  counterTextLimit: { color: ACCENT_RED, fontWeight: "700" },
});