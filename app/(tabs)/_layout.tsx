import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { Colors } from "@/constants/theme";
import { auth } from "../../firebaseConfig";
import { badgeStore } from "../../services/badgeStore";

const styles = StyleSheet.create({
  tabIconContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  tabIconActive: {
    borderBottomColor: "#2f2f6f",
  },
  tradeBtn: {
    top: -15,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#434399",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#25252e",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  tradeBtnActive: {
    backgroundColor: "#1a1a4f",
  },
  tradeBtnLabel: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "600",
    marginTop: 2,
  },
});

export default function TabLayout() {
  const router = useRouter();
  const [inboxBadge, setInboxBadge] = useState<number>(badgeStore.getCount());

  // Subscribe to badge store updates from InboxScreen
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

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors["light"].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopWidth: 1,
          borderTopColor: "#EEEEEE",
          overflow: "visible",
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
          tabBarIcon: ({ color, focused }) => (
            <View
              style={[styles.tabIconContainer, focused && styles.tabIconActive]}
            >
              <Ionicons
                name="home"
                size={24}
                color={focused ? "#2f2f6f" : color}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
          tabBarIcon: ({ color, focused }) => (
            <View
              style={[styles.tabIconContainer, focused && styles.tabIconActive]}
            >
              <Ionicons
                name="compass"
                size={24}
                color={focused ? "#2f2f6f" : color}
              />
            </View>
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
              <Ionicons name="swap-horizontal" size={24} color="#fff" />
              <Text style={styles.tradeBtnLabel}>Trade</Text>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: "Inbox",
          // Show count badge when > 0, hide it completely when 0
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
          tabBarIcon: ({ color, focused }) => (
            <View
              style={[styles.tabIconContainer, focused && styles.tabIconActive]}
            >
              <Ionicons
                name="mail"
                size={24}
                color={focused ? "#2f2f6f" : color}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Account",
          tabBarIcon: ({ color, focused }) => (
            <View
              style={[styles.tabIconContainer, focused && styles.tabIconActive]}
            >
              <Ionicons
                name="person"
                size={24}
                color={focused ? "#2f2f6f" : color}
              />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
