import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import React, { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { Colors } from '@/constants/theme';
import { auth } from '../../firebaseConfig';

const styles = StyleSheet.create({
  tabIconContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabIconActive: {
    borderBottomColor: '#2f2f6f',
  },
});

export default function TabLayout() {
  const router = useRouter();

  // Keep internal tab-level auth check to ensure users don't "glitch" into the home screen
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace('/login');
      } else if (!user.emailVerified) {
        router.replace('/verify');
      }
    });

    return () => unsubscribe();
  }, [router]);

  return (
    <Tabs
      screenOptions={{
        // Force 'light' tint for the white theme
        tabBarActiveTintColor: Colors['light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        // Match the white background from your reference design
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#EEEEEE',
          ...Platform.select({
            ios: { position: 'absolute' },
            default: {},
          }),
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIconContainer, focused && styles.tabIconActive]}>
              <Ionicons name="home" size={24} color={focused ? '#2f2f6f' : color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIconContainer, focused && styles.tabIconActive]}>
              <Ionicons name="compass" size={24} color={focused ? '#2f2f6f' : color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="trade"
        options={{
          title: 'Trade',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIconContainer, focused && styles.tabIconActive]}>
              <Ionicons name="swap-horizontal" size={24} color={focused ? '#2f2f6f' : color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIconContainer, focused && styles.tabIconActive]}>
              <Ionicons name="mail" size={24} color={focused ? '#2f2f6f' : color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Account',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIconContainer, focused && styles.tabIconActive]}>
              <Ionicons name="person" size={24} color={focused ? '#2f2f6f' : color} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}