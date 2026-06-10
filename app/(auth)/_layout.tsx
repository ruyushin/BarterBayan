import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack, useRouter, useSegments } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../firebaseConfig";
import { welcomeState } from "./welcomeState";

const PRIMARY = "#2F2F6F";

// ─── Welcome Modal ─────────────────────────────────────────────────────────────
function WelcomeModal({
  visible,
  name,
  type,
  onDone,
}: {
  visible: boolean;
  name: string;
  type: "login" | "signup";
  onDone: () => void;
}) {
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scale.setValue(0.85);
      opacity.setValue(0);
      iconScale.setValue(0);
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 65,
          friction: 8,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start(() => {
        Animated.spring(iconScale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 80,
          friction: 6,
        }).start();
      });
    }
  }, [visible]);

  const isSignup = type === "signup";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onDone}
    >
      <View style={wm.overlay}>
        <Animated.View style={[wm.card, { opacity, transform: [{ scale }] }]}>
          <Animated.View
            style={[wm.iconRing, { transform: [{ scale: iconScale }] }]}
          >
            <Ionicons
              name={isSignup ? "person-add" : "checkmark"}
              size={isSignup ? 30 : 36}
              color="#fff"
            />
          </Animated.View>

          <Text style={wm.eyebrow}>
            {isSignup ? "Account created" : "Welcome back"}
          </Text>

          <Text style={wm.name}>{name || "Trader"}</Text>

          <View style={wm.divider} />

          <Text style={wm.tagline}>
            {isSignup ? (
              <>
                {`You've joined `}
                <Text style={wm.brand}>BarterBayan</Text>
              </>
            ) : (
              <>
                {`You're signed in to\n`}
                <Text style={wm.brand}>BarterBayan</Text>
              </>
            )}
          </Text>

          <Text style={wm.sub}>
            {isSignup
              ? "Your profile is ready. Start trading, connect with your community, and make every barter count."
              : "Ready to trade, connect, and grow your community."}
          </Text>

          <TouchableOpacity
            style={wm.btn}
            onPress={onDone}
            activeOpacity={0.85}
          >
            {isSignup && (
              <Ionicons
                name="rocket"
                size={16}
                color="#fff"
                style={{ marginRight: 8 }}
              />
            )}
            <Text style={wm.btnText}>
              {isSignup ? "Start Exploring" : "Let's Go"}
            </Text>
            {!isSignup && (
              <Ionicons
                name="arrow-forward"
                size={18}
                color="#fff"
                style={{ marginLeft: 6 }}
              />
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const wm = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(10,10,30,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 24,
    width: "100%",
    alignItems: "center",
    paddingTop: 36,
    paddingBottom: 32,
    overflow: "hidden",
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 16,
  },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: PRIMARY,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  eyebrow: {
    fontSize: 14,
    fontWeight: "600",
    color: "#888",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  name: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1A1A1A",
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  divider: {
    width: 40,
    height: 3,
    backgroundColor: PRIMARY,
    borderRadius: 2,
    marginBottom: 16,
    opacity: 0.4,
  },
  tagline: {
    fontSize: 16,
    color: "#444",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 6,
  },
  brand: { color: PRIMARY, fontWeight: "800" },
  sub: {
    fontSize: 13,
    color: "#999",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 28,
    paddingHorizontal: 16,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: PRIMARY,
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 14,
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  btnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});

// ─── Auth Layout ───────────────────────────────────────────────────────────────
export default function AuthLayout() {
  const router = useRouter();
  const segments = useSegments();
  const navigationInProgressRef = useRef(false);

  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const [welcomeName, setWelcomeName] = useState("");
  const [welcomeType, setWelcomeType] = useState<"login" | "signup">("login");
  const pendingRouteRef = useRef<string | null>(null);

  const showWelcomeThen = (
    name: string,
    type: "login" | "signup",
    route: string,
  ) => {
    setWelcomeName(name);
    setWelcomeType(type);
    pendingRouteRef.current = route;
    setWelcomeVisible(true);
  };

  const handleWelcomeDone = () => {
    setWelcomeVisible(false);
    const route = pendingRouteRef.current;
    pendingRouteRef.current = null;
    if (route) {
      router.replace(route as any);
    }
  };

  useEffect(() => {
    // ── cancelled lives outside the Firebase callback so the cleanup
    // function returned by useEffect can actually set it to true ──────
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigationInProgressRef.current = false;
        return;
      }

      const currentRoute = segments[segments.length - 1];

      // ── STEP 1: Email not verified ──────────────────────────────────
      if (!user.emailVerified) {
        const safeRoutes = ["verify", "login", "signup"];
        if (!safeRoutes.includes(currentRoute)) {
          router.replace("/(auth)/verify");
        }
        navigationInProgressRef.current = false;
        return;
      }

      // ── STEP 2: Check Firestore onboarding state ────────────────────
      try {
        await new Promise((resolve) => setTimeout(resolve, 300));
        if (cancelled) return;

        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        if (cancelled) return;

        if (!userDoc.exists()) {
          router.replace("/(auth)/verify");
          navigationInProgressRef.current = false;
          return;
        }

        let data = userDoc.data();

        // Backfill missing fields
        if (
          data &&
          (data.termsAccepted === undefined ||
            data.profileComplete === undefined)
        ) {
          const updates: any = {};
          if (data.termsAccepted === undefined) updates.termsAccepted = false;
          if (data.profileComplete === undefined)
            updates.profileComplete = false;
          await setDoc(userDocRef, updates, { merge: true });
          if (cancelled) return;
          data = { ...data, ...updates };
        }

        console.log("[AuthLayout] User check:", {
          uid: user.uid,
          emailVerified: user.emailVerified,
          termsAccepted: data?.termsAccepted,
          profileComplete: data?.profileComplete,
          currentRoute,
        });

        if (navigationInProgressRef.current) return;

        const pending = welcomeState.consume();
        const specialAuthRoutes = ["ChangePasswordScreen"];
        const isSpecialRoute = specialAuthRoutes.includes(currentRoute);

        // ── STEP 3: Terms not accepted → always block here ──────────
        // No currentRoute exception — if termsAccepted is false the
        // user must accept before going anywhere else.
        if (!data?.termsAccepted) {
          if (currentRoute !== "terms") {
            navigationInProgressRef.current = true;
            router.replace("/(auth)/terms");
            setTimeout(() => {
              navigationInProgressRef.current = false;
            }, 800);
          }
          return;
        }

        // ── STEP 4: Profile not complete ─────────────────────────────
        if (!data?.profileComplete) {
          if (currentRoute !== "profile-setup") {
            navigationInProgressRef.current = true;
            router.replace("/(auth)/profile-setup");
            setTimeout(() => {
              navigationInProgressRef.current = false;
            }, 800);
          }
          return;
        }

        // ── STEP 5: Fully onboarded → home ───────────────────────────
        if (!isSpecialRoute) {
          navigationInProgressRef.current = true;
          if (pending) {
            showWelcomeThen(pending.name, pending.type, "/");
          } else {
            router.replace("/");
          }
          setTimeout(() => {
            navigationInProgressRef.current = false;
          }, 800);
        }
      } catch (err) {
        console.warn("[AuthLayout] Guard error:", err);
        navigationInProgressRef.current = false;
      }
    });

    return () => {
      cancelled = true; // cancels any in-flight async work
      unsubscribe();
    };
  }, []); // empty deps — only re-runs on true auth state change, not on every navigation

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <WelcomeModal
        visible={welcomeVisible}
        name={welcomeName}
        type={welcomeType}
        onDone={handleWelcomeDone}
      />
    </>
  );
}
