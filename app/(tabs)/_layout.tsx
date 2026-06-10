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

const styles = StyleSheet.create({
  // ── Regular tab icon ────────────────────────────────────────────────────────
  tabIconContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 2,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 3,
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    color: NAVY,
  },
  tabLabelInactive: {
    color: INACTIVE,
  },
  // Active pill behind icon
  activePill: {
    position: "absolute",
    top: 0,
    width: 44,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ECEDF8",
    zIndex: -1,
  },

  // ── Center Trade FAB ─────────────────────────────────────────────────────────
  tradeBtn: {
    top: -18,
    width: 56,
    height: 56,
    borderRadius: 28,
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
        size={22}
        color={focused ? NAVY : INACTIVE}
      />
      <Text
        style={[
          styles.tabLabel,
          focused ? styles.tabLabelActive : styles.tabLabelInactive,
        ]}
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
          height: Platform.OS === "ios" ? 82 : 64,
          paddingBottom: Platform.OS === "ios" ? 24 : 8,
          paddingTop: 8,
          overflow: "visible",
          // Subtle lift
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
            <View style={[styles.tradeBtn, focused && styles.tradeBtnActive]}>
              <Ionicons name="swap-horizontal" size={22} color="#fff" />
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
