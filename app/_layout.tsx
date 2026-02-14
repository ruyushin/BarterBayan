import { auth } from '@/firebaseConfig';
import { Stack, useRouter, useSegments } from 'expo-router';
import { onAuthStateChanged, User } from 'firebase/auth';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export default function RootLayout() {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const hasInitialized = useRef(false);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser: User | null) => {
      console.log('Auth state changed:', authUser);
      setUser(authUser);
      if (!hasInitialized.current) {
        console.log('Initializing complete');
        hasInitialized.current = true;
        setInitializing(false);
      }
    });
    console.log('Setting up auth listener');
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (initializing) return;

    // We check the first segment to see if we are in the auth group
    const firstSegment = segments[0];
    const inAuthGroup = firstSegment === '(auth)';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user) {
      if (!user.emailVerified) {
        if (segments[1] !== 'verify') {
          router.replace('/(auth)/verify');
        }
      } else if (inAuthGroup || !firstSegment) {
        router.replace('/(tabs)');
      }
    }
  }, [user, segments, initializing]);

  if (initializing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2F2F6F" />
      </View>
    );
  }

  // Render only the index screen first to isolate routing issues on web
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: '#000000' 
  }
  ,
  testContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  }
});