import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { startPresenceHeartbeat } from "../../services/presenceService";

import { HapticTab } from "@/components/haptic-tab";
import { Colors } from "@/constants/theme";
import { auth, db } from "../../firebaseConfig";
import { badgeStore } from "../../services/badgeStore";

const NAVY = "#2f2f6f";
const NAVY_LIGHT = "#434399";
const INACTIVE = "#A0A0B0";

const TAB_BAR_HEIGHT = Platform.OS === "ios" ? 64 : 60;
const TAB_PT = 4;
const TAB_PB = Platform.OS === "ios" ? 6 : 10;

const styles = StyleSheet.create({
  tabIconContainer: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 2,
  },
  tabLabel: {
    fontSize: 8,
    fontWeight: "600",
    marginTop: 1,
    letterSpacing: -0.2,
    textAlign: "center",
    includeFontPadding: false,
    width: "100%",
  },
  tabLabelActive: {
    color: NAVY,
  },
  tabLabelInactive: {
    color: INACTIVE,
  },
  activePill: {
    position: "absolute",
    top: 0,
    alignSelf: "center",
    width: 44,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ECEDF8",
    zIndex: -1,
  },
  tradeBtnWrap: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    marginTop: -28,
    paddingBottom: 4,
  },
  tradeBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: NAVY_LIGHT,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  tradeBtnActive: {
    backgroundColor: NAVY,
  },
  // ─── Ban screen ───────────────────────────────────────────────────────────
  banContainer: {
    flex: 1,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 36,
  },
  banIconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#FFF1F2",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  banTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1A1A1A",
    letterSpacing: -0.5,
    textAlign: "center",
    marginBottom: 8,
  },
  banSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 4,
  },
  banReason: {
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 4,
    fontStyle: "italic",
  },
  banUntil: {
    fontSize: 13,
    fontWeight: "600",
    color: "#D97706",
    textAlign: "center",
    marginBottom: 32,
  },
  banDivider: {
    width: 40,
    height: 3,
    backgroundColor: "#E11D48",
    borderRadius: 2,
    marginBottom: 20,
    opacity: 0.4,
  },
  banBtn: {
    backgroundColor: NAVY,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 14,
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  banBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});

// ─── Ban Screen ───────────────────────────────────────────────────────────────

function BanScreen({
  type,
  reason,
  until,
  onBack,
}: {
  type: "banned" | "suspended";
  reason?: string;
  until?: Date | null;
  onBack: () => void;
}) {
  const isBanned = type === "banned";

  return (
    <View style={styles.banContainer}>
      <View style={styles.banIconRing}>
        <Ionicons
          name={isBanned ? "ban" : "time-outline"}
          size={44}
          color="#E11D48"
        />
      </View>

      <Text style={styles.banTitle}>
        {isBanned ? "Account Banned" : "Account Suspended"}
      </Text>

      <View style={styles.banDivider} />

      <Text style={styles.banSubtitle}>
        {isBanned
          ? "Your account has been permanently banned from BarterBayan."
          : "Your account has been temporarily suspended."}
      </Text>

      {!!reason && <Text style={styles.banReason}>"{reason}"</Text>}

      {!isBanned && until && (
        <Text style={styles.banUntil}>
          Suspended until{" "}
          {until.toLocaleDateString("en-PH", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </Text>
      )}

      {!reason && !until && <View style={{ height: 32 }} />}

      <TouchableOpacity
        style={styles.banBtn}
        onPress={onBack}
        activeOpacity={0.85}
      >
        <Text style={styles.banBtnText}>Back to Login</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Tab Layout ───────────────────────────────────────────────────────────────

export default function TabLayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [inboxBadge, setInboxBadge] = useState<number>(badgeStore.getCount());
  const [banInfo, setBanInfo] = useState<{
    type: "banned" | "suspended";
    reason?: string;
    until?: Date | null;
  } | null>(null);
  // Undefined = still resolving, null = no ban
  const [authReady, setAuthReady] = useState(false);

  // ─── Presence heartbeat ─────────────────────────────────────────────────
  useEffect(() => {
    let cleanup: (() => void) | null = null;
    const unsub = onAuthStateChanged(auth, (user) => {
      cleanup?.();
      cleanup = null;
      if (user) cleanup = startPresenceHeartbeat(user.uid);
    });
    return () => {
      cleanup?.();
      unsub();
    };
  }, []);

  // ─── Inbox badge ────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = badgeStore.subscribe(setInboxBadge);
    return unsub;
  }, []);

  // ─── Auth guard + real-time ban listener ────────────────────────────────
  useEffect(() => {
    let unsubSnapshot: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      // Tear down any previous snapshot listener when auth changes
      unsubSnapshot?.();
      unsubSnapshot = null;

      if (!user) {
        // Don't clear banInfo here — let the ban screen show until user taps back
        setAuthReady(true);
        if (!banInfo) router.replace("/login");
        return;
      }

      if (!user.emailVerified) {
        setAuthReady(true);
        router.replace("/verify");
        return;
      }

      // Watch the user's Firestore doc in real time for ban/suspension changes
      unsubSnapshot = onSnapshot(
        doc(db, "users", user.uid),
        (snap) => {
          setAuthReady(true);
          const data = snap.data();
          if (!data) return;

          const isBanned = data.banned === true;
          const suspendedUntil = data.suspendedUntil?.toDate?.() ?? null;
          const isSuspended = suspendedUntil && suspendedUntil > new Date();

          if (isBanned || isSuspended) {
            // Set ban info BEFORE signing out so the screen renders while
            // the sign-out fires, not after (which would wipe it)
            setBanInfo({
              type: isBanned ? "banned" : "suspended",
              reason: isBanned ? data.banReason : data.suspendReason,
              until: suspendedUntil,
            });
            signOut(auth);
          } else {
            setBanInfo(null);
          }
        },
        (err) => {
          // Surface Firestore rule errors — most common cause of silent failures
          console.warn("[TabLayout] onSnapshot error:", err.message);
          setAuthReady(true);
        },
      );
    });

    return () => {
      unsubAuth();
      unsubSnapshot?.();
    };
  }, [router]);

  // ─── Render: loading ────────────────────────────────────────────────────
  if (!authReady) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#fff",
        }}
      >
        <ActivityIndicator size="large" color={NAVY} />
      </View>
    );
  }

  // ─── Render: ban screen ─────────────────────────────────────────────────
  if (banInfo) {
    return (
      <BanScreen
        type={banInfo.type}
        reason={banInfo.reason}
        until={banInfo.until}
        onBack={() => {
          setBanInfo(null);
          router.replace("/login");
        }}
      />
    );
  }

  // ─── Tab icon helper ────────────────────────────────────────────────────
  const TabIcon = ({
    iconName,
    label,
    focused,
  }: {
    iconName: string;
    label: string;
    focused: boolean;
  }) => (
    <View style={styles.tabIconContainer}>
      {focused && <View style={styles.activePill} />}
      <Ionicons
        name={iconName as any}
        size={24}
        color={focused ? NAVY : INACTIVE}
      />
      <Text
        style={[
          styles.tabLabel,
          focused ? styles.tabLabelActive : styles.tabLabelInactive,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.65}
        allowFontScaling={false}
      >
        {label}
      </Text>
    </View>
  );

  // ─── Render: tabs ───────────────────────────────────────────────────────
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors["light"].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopWidth: 0.5,
          borderTopColor: "#E8E8EE",
          height: TAB_BAR_HEIGHT + insets.bottom,
          paddingTop: TAB_PT,
          paddingBottom: TAB_PB + insets.bottom,
          flexDirection: "row",
          overflow: "visible",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 12,
          elevation: 12,
          ...Platform.select({
            ios: { position: "absolute" },
            default: {},
          }),
        },
        tabBarItemStyle: {
          flex: 1,
          width: 0,
          minWidth: 0,
          maxWidth: undefined,
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          overflow: "visible",
          paddingHorizontal: 0,
          marginHorizontal: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => (
            <TabIcon
              iconName={focused ? "home" : "home-outline"}
              label="Home"
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
          tabBarIcon: ({ focused }) => (
            <TabIcon
              iconName={focused ? "compass" : "compass-outline"}
              label="Explore"
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="trade"
        options={{
          title: "Trade",
          tabBarLabel: () => null,
          tabBarIcon: ({ focused }) => (
            <View style={styles.tradeBtnWrap}>
              <View style={[styles.tradeBtn, focused && styles.tradeBtnActive]}>
                <Ionicons name="swap-horizontal" size={22} color="#fff" />
              </View>
              <Text
                style={[
                  styles.tabLabel,
                  focused ? styles.tabLabelActive : styles.tabLabelInactive,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.65}
                allowFontScaling={false}
              >
                Trade
              </Text>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: "Inbox",
          tabBarBadge:
            inboxBadge > 0 ? (inboxBadge > 99 ? "99+" : inboxBadge) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: "#ef4444",
            color: "#fff",
            fontSize: 10,
            fontWeight: "700",
            minWidth: 18,
            height: 18,
            lineHeight: 18,
          },
          tabBarIcon: ({ focused }) => (
            <TabIcon
              iconName={focused ? "mail" : "mail-outline"}
              label="Inbox"
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Account",
          tabBarIcon: ({ focused }) => (
            <TabIcon
              iconName={focused ? "person" : "person-outline"}
              label="Account"
              focused={focused}
            />
          ),
        }}
      />
    </Tabs>
  );
}
