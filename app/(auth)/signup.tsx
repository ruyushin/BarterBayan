import FontAwesome from "@expo/vector-icons/FontAwesome";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { useRouter } from "expo-router";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  signInWithCredential,
  signOut,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import React, { useRef, useState } from "react";
import {
  Alert,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../firebaseConfig";

export default function SignUpScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwStrength, setPwStrength] = useState({
    score: 0,
    label: "Very Weak",
    color: "#D9534F",
  });
  const strengthOpacity = useRef(new Animated.Value(0)).current;
  const strengthTimer = useRef<any>(null);
  const AnimatedAny: any = Animated;
  const [isTyping, setIsTyping] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    confirm?: string;
  }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [successRoute, setSuccessRoute] = useState<"login" | "verify">("login");

  const router = useRouter();

  const textColor = "#000000";
  const inputBgColor = "#f0f0f0";
  const iconColor = "#ADADAD";

  const showSuccessAndReset = (
    message: string,
    route: "login" | "verify" = "login",
  ) => {
    setSuccessMessage(message);
    setSuccessRoute(route);
    setShowSuccessModal(true);
    setEmail("");
    setPassword("");
    setConfirm("");
    setErrors({});
  };

  function SocialButton({
    name,
    onPress,
  }: {
    name: any;
    onPress?: () => void;
  }) {
    return (
      <TouchableOpacity
        style={styles.socialButton}
        activeOpacity={0.7}
        onPress={onPress}
      >
        <FontAwesome name={name} size={24} color="#2F2F6F" />
      </TouchableOpacity>
    );
  }

  const validateEmailFormat = (email: string) => {
    return /^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(email.toLowerCase());
  };

  function evaluatePassword(pw: string) {
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    const labels = ["Very Weak", "Weak", "Medium", "Strong", "Very Strong"];
    const colors = ["#D9534F", "#D9534F", "#F0AD4E", "#F7C948", "#5CB85C"];
    return { score, label: labels[score], color: colors[score] };
  }

  function handlePasswordChange(text: string) {
    setPassword(text);
    setErrors((e) => ({ ...e, password: undefined }));
    setPwStrength(evaluatePassword(text));
    setIsTyping(true);
    Animated.timing(strengthOpacity, {
      toValue: 1,
      duration: 120,
      useNativeDriver: true,
    }).start();
    if (strengthTimer.current) clearTimeout(strengthTimer.current);
    strengthTimer.current = setTimeout(() => {
      Animated.timing(strengthOpacity, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }).start(() => setIsTyping(false));
    }, 1200);
  }

  // ── Google sign-up (native) ────────────────────────────────────────
  const handleGoogleSignUp = async () => {
    setIsSubmitting(true);
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken;
      if (!idToken) throw new Error("No ID token returned");

      const credential = GoogleAuthProvider.credential(idToken);
      const userCredential = await signInWithCredential(auth, credential);
      const user = userCredential.user;

      const profileData = {
        email: user.email,
        username: user.email?.split("@")[0],
        createdAt: new Date().toISOString(),
        rating: 5.0,
        tradeCount: 0,
        emailVerified: user.emailVerified,
      };

      try {
        await sendEmailVerification(user);
      } catch (error: any) {
        console.error("Google verification email error:", error);
        Alert.alert(
          "Verification Email Failed",
          error?.message ||
            "Unable to send a verification email. Please try again.",
        );
      }

      showSuccessAndReset(
        "Account created successfully with Google! We sent a verification link to your Gmail. Please verify your email before continuing.",
        "verify",
      );

      setDoc(doc(db, "users", user.uid), profileData).catch((err) =>
        console.warn("Firestore setDoc error", err),
      );
      if (user.emailVerified) {
        signOut(auth).catch((err) => console.warn("Google signOut error", err));
      }
    } catch (err: any) {
      if (err.code !== "SIGN_IN_CANCELLED") {
        Alert.alert("Google Signup Error", err?.message || String(err));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUp = async () => {
    const nextErrors: any = {};

    if (!email.trim()) {
      nextErrors.email = "Email is required";
    } else if (!validateEmailFormat(email)) {
      nextErrors.email = "Please enter a valid @gmail.com address";
    }

    if (!password) {
      nextErrors.password = "Password is required";
    } else if (password.length < 6) {
      nextErrors.password = "Password must be at least 6 characters";
    }

    if (password !== confirm) {
      nextErrors.confirm = "Passwords do not match";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setIsSubmitting(true);
    await createEmailAccount(email.trim(), password);
  };

  const createEmailAccount = async (email: string, password: string) => {
    setIsSubmitting(true);
    let user;

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );
      user = userCredential.user;
    } catch (error: any) {
      if (error?.code === "auth/email-already-in-use") {
        setErrors({ email: "This Gmail is already registered." });
      } else if (error?.code === "auth/invalid-email") {
        setErrors({ email: "This email is not valid or does not exist." });
      } else {
        Alert.alert("Signup Error", error?.message || String(error));
      }
      setIsSubmitting(false);
      return;
    }

    if (!user) {
      setIsSubmitting(false);
      return;
    }

    try {
      await sendEmailVerification(user);
    } catch (error: any) {
      console.error("Email verification send error:", error);
      Alert.alert(
        "Verification Email Failed",
        error?.message ||
          "Unable to send a verification email. Please try again.",
      );
    }

    showSuccessAndReset(
      "Account created successfully! We've sent a verification link to your Gmail. Please verify your email before logging in.",
      "verify",
    );
    setIsSubmitting(false);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={[styles.container, { backgroundColor: "#ffffff" }]}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={[styles.headerGradient, { color: textColor }]}>
              Create an
            </Text>
            <Text style={[styles.headerGradient, { color: textColor }]}>
              Account...
            </Text>
          </View>

          {/* Email Input */}
          <View
            style={[styles.inputContainer, { backgroundColor: inputBgColor }]}
          >
            <MaterialIcons
              name="email"
              size={20}
              color={iconColor}
              style={styles.inputIcon}
            />
            <TextInput
              style={[styles.input, { color: textColor }]}
              placeholder="Gmail Address"
              autoCapitalize="none"
              keyboardType="email-address"
              placeholderTextColor="#999999"
              value={email}
              onChangeText={setEmail}
            />
          </View>
          {errors.email ? (
            <Text style={styles.errorText}>{errors.email}</Text>
          ) : null}

          {/* Password Input */}
          <View
            style={[styles.inputContainer, { backgroundColor: inputBgColor }]}
          >
            <MaterialIcons
              name="lock"
              size={20}
              color={iconColor}
              style={styles.inputIcon}
            />
            <TextInput
              style={[styles.input, { color: textColor }]}
              placeholder="Password"
              placeholderTextColor="#999999"
              value={password}
              onChangeText={handlePasswordChange}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <MaterialIcons
                name={showPassword ? "visibility" : "visibility-off"}
                size={20}
                color={iconColor}
              />
            </TouchableOpacity>
          </View>
          {errors.password ? (
            <Text style={styles.errorText}>{errors.password}</Text>
          ) : null}

          {/* Password Strength Indicator */}
          {isTyping && (
            <AnimatedAny.View
              style={[styles.strengthContainer, { opacity: strengthOpacity }]}
            >
              <Text style={[styles.strengthText, { color: pwStrength.color }]}>
                Password Strength: {pwStrength.label}
              </Text>
              <View style={styles.strengthBar}>
                <View
                  style={[
                    styles.strengthFill,
                    {
                      width: `${(pwStrength.score / 4) * 100}%`,
                      backgroundColor: pwStrength.color,
                    },
                  ]}
                />
              </View>
            </AnimatedAny.View>
          )}

          {/* Confirm Password Input */}
          <View
            style={[styles.inputContainer, { backgroundColor: inputBgColor }]}
          >
            <MaterialIcons
              name="lock"
              size={20}
              color={iconColor}
              style={styles.inputIcon}
            />
            <TextInput
              style={[styles.input, { color: textColor }]}
              placeholder="Confirm Password"
              placeholderTextColor="#999999"
              value={confirm}
              onChangeText={(text) => {
                setConfirm(text);
                setErrors((e) => ({ ...e, confirm: undefined }));
              }}
              secureTextEntry={!showPassword}
            />
          </View>
          {errors.confirm ? (
            <Text style={styles.errorText}>{errors.confirm}</Text>
          ) : null}

          {/* Sign Up Button */}
          <Pressable
            disabled={isSubmitting}
            onPress={handleSignUp}
            style={({ pressed }) => [
              styles.signupButton,
              pressed && styles.signupButtonPressed,
            ]}
          >
            <Text style={styles.signupButtonText}>
              {isSubmitting ? "Creating Account..." : "Sign Up"}
            </Text>
          </Pressable>

          {/* Divider */}
          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR Sign up with</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social Buttons */}
          <View style={styles.socialContainer}>
            <SocialButton name="google" onPress={handleGoogleSignUp} />
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: textColor }]}>
              Already have an account?{" "}
            </Text>
            <TouchableOpacity onPress={() => router.push("/login")}>
              <Text style={styles.footerLink}>Log In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Success Modal */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>SIGNUP SUCCESSFULLY</Text>
            <Text style={styles.modalMessage}>{successMessage}</Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => {
                setShowSuccessModal(false);
                setEmail("");
                setPassword("");
                setConfirm("");
                if (successRoute === "verify") {
                  router.replace("/verify");
                } else {
                  router.replace("/login");
                }
              }}
            >
              <Text style={styles.modalButtonText}>
                {successRoute === "verify"
                  ? "Go to Verification"
                  : "Go to Login"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: 60 },
  header: { marginBottom: 40 },
  headerGradient: {
    fontSize: 36,
    fontWeight: "bold",
    textAlign: "center",
    lineHeight: 42,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    borderRadius: 12,
    marginBottom: 16,
    height: 55,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16 },
  errorText: {
    color: "#D9534F",
    fontSize: 14,
    marginBottom: 8,
    marginLeft: 15,
  },
  strengthContainer: { marginBottom: 16, marginLeft: 15 },
  strengthText: { fontSize: 14, fontWeight: "600", marginBottom: 4 },
  strengthBar: {
    height: 4,
    backgroundColor: "#E0E0E0",
    borderRadius: 2,
    overflow: "hidden",
  },
  strengthFill: { height: "100%" },
  signupButton: {
    backgroundColor: "#2F2F6F",
    height: 55,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 30,
  },
  signupButtonPressed: { opacity: 0.8 },
  signupButtonText: { color: "#FFFFFF", fontSize: 18, fontWeight: "600" },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#E0E0E0" },
  dividerText: { marginHorizontal: 10, color: "#666", fontSize: 14 },
  socialContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 30,
  },
  socialButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#F0F0F0",
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 12,
  },
  footer: { flexDirection: "row", justifyContent: "center", paddingBottom: 20 },
  footerText: { fontSize: 15 },
  footerLink: { color: "#2F2F6F", fontSize: 15, fontWeight: "bold" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    width: "80%",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#000000",
    marginBottom: 10,
  },
  modalMessage: {
    fontSize: 16,
    color: "#000000",
    textAlign: "center",
    marginBottom: 20,
  },
  modalButton: {
    backgroundColor: "#2F2F6F",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  modalButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
});
