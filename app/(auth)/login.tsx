import FontAwesome from "@expo/vector-icons/FontAwesome";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { makeRedirectUri } from "expo-auth-session";

import * as Google from "expo-auth-session/providers/google";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  sendEmailVerification,
  setPersistence,
  signInWithCredential,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../firebaseConfig";
import { welcomeState } from "./welcomeState";

const PRIMARY = "#2F2F6F";
const BG = "#FFFFFF";
const MUTED = "#666666";
const BORDER = "#E0E0E0";
const DANGER = "#D9534F";

WebBrowser.maybeCompleteAuthSession();

// ── Validation helpers ─────────────────────────────────────────────
const validateEmail = (email: string) =>
  /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(
    email.trim().toLowerCase(),
  );

const sanitizeEmail = (email: string) => email.trim().toLowerCase();

export default function LoginScreen() {
  // ── FIX: guard useProxy exactly like signup.tsx ──────────────────
  const useProxy = Platform.OS !== "web" && Constants.appOwnership === "expo";
  const redirectUri = makeRedirectUri({
    scheme: "barterbayanv10",
    ...(useProxy ? { useProxy: true } : {}),
  } as any);

  const [request, response, promptAsync] = Google.useAuthRequest({
  androidClientId: "1081232685961-gkth525m4vagv916gs9h1om0o41bbora.apps.googleusercontent.com",
  webClientId: "1081232685961-gkth525m4vagv916gs9h1om0o41bbora.apps.googleusercontent.com",
  redirectUri,
  responseType: "id_token",
  scopes: ["profile", "email"],
  });
  
  const decodeJWT = (token: string) => {
    try {
      const base64Url = token.split(".")[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join(""),
      );
      return JSON.parse(jsonPayload);
    } catch {
      return null;
    }
  };

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [keepLoggedIn, setKeepLoggedIn] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    general?: string;
  }>({});

  const router = useRouter();

  const setKeepLoggedInStorage = (value: boolean) => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    if (value) window.localStorage.setItem("keepLoggedIn", "1");
    else window.localStorage.removeItem("keepLoggedIn");
  };

  const getRememberedFlag = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      return window.localStorage.getItem("keepLoggedIn") === "1";
    }
    return keepLoggedIn;
  };

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    setKeepLoggedIn(window.localStorage.getItem("keepLoggedIn") === "1");
  }, []);

  useEffect(() => {
    if (response?.type === "success") {
      handleGoogleSignIn((response.params as any).id_token);
    } else if (response?.type === "error") {
      console.warn("Google auth error", response.error);
    }
  }, [response]);

  const signalWelcomeIfReturning = async (uid: string, displayName: string) => {
    try {
      const userDoc = await getDoc(doc(db, "users", uid));
      const data = userDoc.data();
      if (data?.termsAccepted && data?.profileComplete) {
        welcomeState.set(displayName, "login");
      }
    } catch {
      /* auth guard still routes correctly */
    }
  };

  // ── Google sign-in ─────────────────────────────────────────────────
  const handleGoogleSignIn = async (idToken: string) => {
    setIsSubmitting(true);
    setErrors({});
    try {
      const remember = getRememberedFlag();
      if (Platform.OS === "web") {
        await setPersistence(
          auth,
          remember ? browserLocalPersistence : browserSessionPersistence,
        );
      }
      const decoded = decodeJWT(idToken);
      if (!decoded?.email) {
        setErrors({ general: "Invalid Google credentials." });
        return;
      }
      const credential = GoogleAuthProvider.credential(idToken);
      const { user } = await signInWithCredential(auth, credential);
      try {
        const ref = doc(db, "users", user.uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(ref, {
            email: user.email,
            username: user.email?.split("@")[0],
            createdAt: new Date().toISOString(),
            rating: 5.0,
            tradeCount: 0,
            emailVerified: user.emailVerified,
            termsAccepted: false,
            profileComplete: false,
          });
        }
      } catch (e) {
        console.warn("Firestore doc error:", e);
      }
      await signalWelcomeIfReturning(
        user.uid,
        decoded.given_name ||
          decoded.name ||
          decoded.email?.split("@")[0] ||
          "",
      );
    } catch (err: any) {
      const msg =
        err.code === "auth/popup-closed-by-user"
          ? "Sign-in was cancelled."
          : "Google sign-in failed. Please try again.";
      setErrors({ general: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Email/password login ───────────────────────────────────────────
  const handleLogin = async () => {
    const nextErrors: typeof errors = {};

    if (!email.trim()) {
      nextErrors.email = "Email is required.";
    } else if (!validateEmail(email)) {
      nextErrors.email = "Please enter a valid email address.";
    }

    if (!password) {
      nextErrors.password = "Password is required.";
    } else if (password.length < 6) {
      nextErrors.password = "Password must be at least 6 characters.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      setKeepLoggedInStorage(keepLoggedIn);
      if (Platform.OS === "web") {
        const remember = getRememberedFlag();
        await setPersistence(
          auth,
          remember ? browserLocalPersistence : browserSessionPersistence,
        );
      }

      const { user } = await signInWithEmailAndPassword(
        auth,
        sanitizeEmail(email),
        password,
      );
      await user.reload();

      if (!user.emailVerified) {
        Alert.alert(
          "Email Not Verified",
          "Please verify your email before logging in. Check your inbox for the verification link.",
          [
            {
              text: "Resend Email",
              onPress: async () => {
                try {
                  await sendEmailVerification(user);
                  Alert.alert(
                    "Sent",
                    "Verification email resent. Please check your inbox.",
                  );
                } catch {
                  Alert.alert(
                    "Error",
                    "Could not resend email. Try again later.",
                  );
                }
              },
            },
            { text: "OK", onPress: () => router.push("/(auth)/verify") },
          ],
        );
        return;
      }

      try {
        const ref = doc(db, "users", user.uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(ref, {
            email: user.email,
            username: user.email?.split("@")[0],
            createdAt: new Date().toISOString(),
            rating: 5.0,
            tradeCount: 0,
            emailVerified: user.emailVerified,
            termsAccepted: false,
            profileComplete: false,
          });
        }
      } catch (e) {
        console.warn("Firestore doc error:", e);
      }

      await signalWelcomeIfReturning(
        user.uid,
        user.displayName?.split(" ")[0] || user.email?.split("@")[0] || "",
      );
    } catch (err: any) {
      switch (err.code) {
        case "auth/user-not-found":
        case "auth/invalid-credential":
          setErrors({ email: "No account found with this email." });
          break;
        case "auth/wrong-password":
          setErrors({ password: "Incorrect password. Please try again." });
          break;
        case "auth/invalid-email":
          setErrors({ email: "Please enter a valid email address." });
          break;
        case "auth/too-many-requests":
          setErrors({
            general:
              "Too many failed attempts. Please wait a moment and try again.",
          });
          break;
        case "auth/user-disabled":
          setErrors({
            general: "This account has been disabled. Please contact support.",
          });
          break;
        case "auth/network-request-failed":
          setErrors({
            general: "Network error. Please check your connection.",
          });
          break;
        default:
          setErrors({
            general:
              "Login failed. Please check your credentials and try again.",
          });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: BG }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerText}>Welcome</Text>
          <Text style={styles.headerText}>Back!</Text>
        </View>

        {/* Email */}
        <View
          style={[styles.inputContainer, errors.email && styles.inputError]}
        >
          <MaterialIcons
            name="email"
            size={20}
            color="#ADADAD"
            style={styles.inputIcon}
          />
          <TextInput
            style={styles.input}
            placeholder="Email Address"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            placeholderTextColor="#999999"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              setErrors((e) => ({
                ...e,
                email: undefined,
                general: undefined,
              }));
            }}
          />
        </View>
        {errors.email ? (
          <Text style={styles.errorText}>{errors.email}</Text>
        ) : null}

        {/* Password */}
        <View
          style={[styles.inputContainer, errors.password && styles.inputError]}
        >
          <MaterialIcons
            name="lock"
            size={20}
            color="#ADADAD"
            style={styles.inputIcon}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#999999"
            secureTextEntry={!showPassword}
            autoComplete="password"
            textContentType="password"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setErrors((e) => ({
                ...e,
                password: undefined,
                general: undefined,
              }));
            }}
          />
          <TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
            <MaterialIcons
              name={showPassword ? "visibility" : "visibility-off"}
              size={20}
              color="#ADADAD"
            />
          </TouchableOpacity>
        </View>
        {errors.password ? (
          <Text style={styles.errorText}>{errors.password}</Text>
        ) : null}

        {/* General error */}
        {errors.general ? (
          <Text style={styles.errorText}>{errors.general}</Text>
        ) : null}

        {/* Keep logged in + Forgot password */}
        <View style={styles.optionsRow}>
          <TouchableOpacity
            style={styles.keepRow}
            onPress={() => {
              const v = !keepLoggedIn;
              setKeepLoggedIn(v);
              setKeepLoggedInStorage(v);
            }}
          >
            <MaterialIcons
              name={keepLoggedIn ? "check-box" : "check-box-outline-blank"}
              size={22}
              color={PRIMARY}
            />
            <Text style={styles.keepText}>Keep me logged in</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push("/forgot-password")}>
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </TouchableOpacity>
        </View>

        {/* Login button */}
        <Pressable
          disabled={isSubmitting}
          onPress={handleLogin}
          style={({ pressed }) => [
            styles.loginBtn,
            pressed && { opacity: 0.8 },
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.loginBtnText}>Log In</Text>
          )}
        </Pressable>

        {/* Divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR Login with</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Social buttons */}
        <View style={styles.socialRow}>
          <TouchableOpacity
            style={styles.socialBtn}
            activeOpacity={0.7}
            onPress={() => {
              setKeepLoggedInStorage(keepLoggedIn);
              // ── FIX: pass useProxy consistently ──────────────────
              promptAsync({ useProxy } as any).catch((err: any) =>
                Alert.alert(
                  "Google Error",
                  err?.message || "Failed to open Google login",
                ),
              );
            }}
          >
            <FontAwesome name="google" size={24} color={PRIMARY} />
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => router.push("/signup")}>
            <Text style={styles.footerLink}>Sign Up</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 40,
  },

  header: { marginBottom: 40 },
  headerText: {
    fontSize: 48,
    fontWeight: "bold",
    textAlign: "left",
    lineHeight: 42,
    color: "#000000",
  },

  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    borderRadius: 12,
    marginBottom: 16,
    height: 55,
    backgroundColor: "#F0F0F0",
  },
  inputError: {
    borderWidth: 1.5,
    borderColor: DANGER,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, color: "#000000" },

  errorText: {
    color: DANGER,
    fontSize: 13,
    marginBottom: 8,
    marginLeft: 4,
    marginTop: -10,
  },

  optionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  keepRow: { flexDirection: "row", alignItems: "center", flex: 1 },
  keepText: { marginLeft: 8, fontSize: 14, color: "#000000", flexShrink: 1 },
  forgotText: { fontSize: 14, fontWeight: "700", color: PRIMARY },

  loginBtn: {
    backgroundColor: PRIMARY,
    height: 55,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
    marginBottom: 30,
  },
  loginBtnText: { color: "#FFFFFF", fontSize: 18, fontWeight: "600" },

  divider: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: BORDER },
  dividerText: { marginHorizontal: 10, color: MUTED, fontSize: 14 },

  socialRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 24,
  },
  socialBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#F0F0F0",
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 12,
  },

  footer: { flexDirection: "row", justifyContent: "center" },
  footerText: { fontSize: 15, color: "#000000" },
  footerLink: { color: PRIMARY, fontSize: 15, fontWeight: "bold" },
});
