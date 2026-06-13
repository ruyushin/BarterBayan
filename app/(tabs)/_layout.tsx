import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { startPresenceHeartbeat } from "../../services/presenceService";

import { HapticTab } from "@/components/haptic-tab";
import { Colors } from "@/constants/theme";
import { auth } from "../../firebaseConfig";
import { badgeStore } from "../../services/badgeStore";

const NAVY = "#2f2f6f";
const NAVY_LIGHT = "#434399";
const INACTIVE = "#A0A0B0";

const TAB_BAR_HEIGHT = Platform.OS === "ios" ? 68 : 70;
const TAB_PT = 6;
const TAB_PB = Platform.OS === "ios" ? 6 : 8;

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
    marginTop: -34,
    paddingBottom: 2,
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
});

export default function TabLayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [inboxBadge, setInboxBadge] = useState<number>(badgeStore.getCount());

  useEffect(() => {
  let cleanup: (() => void) | null = null;
  const unsub = onAuthStateChanged(auth, (user) => {
    cleanup?.();
    cleanup = null;
    if (user) {
      cleanup = startPresenceHeartbeat(user.uid);
    }
  });
  return () => {
    cleanup?.();
    unsub();
  };
}, []);

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