import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { Colors } from "@/constants/theme";
import { auth } from "../../firebaseConfig";
import { badgeStore } from "../../services/badgeStore";

const NAVY = "#2f2f6f";
const NAVY_LIGHT = "#434399";
const INACTIVE = "#A0A0B0";

// Tab bar total height (excluding safe area inset which RN adds automatically)
const TAB_BAR_HEIGHT = Platform.OS === "ios" ? 68 : 70;
// Vertical padding inside the bar
const TAB_PT = 6;
const TAB_PB = Platform.OS === "ios" ? 6 : 8;

const styles = StyleSheet.create({
  // ── Regular tab icon ────────────────────────────────────────────────────────
  tabIconContainer: {
    // Fixed size so the pill, icon, and label always fit in one line
    width: 64,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 2,
    marginTop: 20,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
    letterSpacing: 0,          // reset — even 0.2 can cause wrapping on small screens
    textAlign: "center",
    // Prevent wrapping on very narrow devices
    includeFontPadding: false,
  },
  tabLabelActive: {
    color: NAVY,
  },
  tabLabelInactive: {
    color: INACTIVE,
  },
  // Active pill sits behind icon, sized to icon width only
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

  // ── Center Trade FAB ─────────────────────────────────────────────────────────
  tradeBtnWrap: {
    // Wrapper gives the FAB a fixed hit-area aligned with the bar
    width: 64,
    alignItems: "center",
    justifyContent: "center",
    // Pull the circle up; overflow:visible on the tab bar lets it show
    marginTop: -50,
  },
  tradeBtn: {
    width: 65,
    height: 65,
    borderRadius: 27,
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
});

export default function TabLayout() {
  const router = useRouter();
  const [inboxBadge, setInboxBadge] = useState<number>(badgeStore.getCount());

  useEffect(() => {
    const unsub = badgeStore.subscribe(setInboxBadge);
    return unsub;
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login");
      } else if (!user.emailVerified) {
        router.replace("/verify");
      }
    });
    return () => unsubscribe();
  }, [router]);

  // ── Reusable icon renderer ────────────────────────────────────────────────
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
        size={26}
        color={focused ? NAVY : INACTIVE}
      />
      <Text
        style={[
          styles.tabLabel,
          focused ? styles.tabLabelActive : styles.tabLabelInactive,
        ]}
        numberOfLines={1}
        allowFontScaling={false}
      >
        {label}
      </Text>
    </View>
  );

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
          // Height = content area only; RN adds the safe area inset on top
          height: TAB_BAR_HEIGHT,
          paddingTop: TAB_PT,
          paddingBottom: TAB_PB,
          // Must be visible so the FAB circle overflows above the bar
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
        // Let each tab item stretch evenly
        tabBarItemStyle: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          overflow: "visible",
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
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: "Inbox",
          tabBarBadge:
            inboxBadge > 0
              ? inboxBadge > 99
                ? "99+"
                : inboxBadge
              : undefined,
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