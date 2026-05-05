import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { onAuthStateChanged } from 'firebase/auth';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';
import { auth } from '../firebaseConfig';

export default function RootLayout() {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const segments = useSegments();
  const router = useRouter();

  // Listen for Auth changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Handle Protected Routes
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const authScreen = segments[1] || '';

    if (!user && !inAuthGroup) {
      router.replace('/login');
    } else if (user && inAuthGroup && user.emailVerified) {
      if (authScreen !== 'signup') {
        router.replace('/');
      }
    }
  }, [user, segments, isLoading, router]);

  if (isLoading) {
    return (
      <ThemeProvider value={DefaultTheme}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
          <ActivityIndicator size="large" color="#5D5FEF" />
        </View>
      </ThemeProvider>
    );
  }

  return (
    /* We use DefaultTheme here to force the white background layout */
    <ThemeProvider value={DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Guide' }} />
      </Stack>
      {/* "dark" ensures the clock/battery text is black on your white theme */}
      <StatusBar style="dark" />
    </ThemeProvider>
  );
}