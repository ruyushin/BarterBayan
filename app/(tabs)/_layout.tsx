import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/firebaseConfig'; 
import { ActivityIndicator, View } from 'react-native';

export default function RootLayout() {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<any>(null);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
      if (initializing) setInitializing(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (initializing) return;

    const inAuthGroup = segments[0] === '(auth)'; // If you put login/signup in an (auth) folder

    if (!user || !user.emailVerified) {
      // If not logged in or not verified, force them to login
      // Check to prevent infinite redirect loops
      if (segments[0] !== 'login' && segments[0] !== 'signup') {
        router.replace('/login');
      }
    } else if (user && user.emailVerified) {
      // If logged in and verified, don't let them stay on login/signup
      if (segments[0] === 'login' || segments[0] === 'signup') {
        router.replace('/');
      }
    }
  }, [user, segments, initializing]);

  if (initializing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2F2F6F" />
      </View>
    );
  }

  // Use Stack instead of Tabs for the Root if you want to hide the bottom bar everywhere
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
    </Stack>
  );
}