import { auth } from '@/firebaseConfig';
import { Stack } from 'expo-router';
import { onAuthStateChanged, User } from 'firebase/auth';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

export default function RootLayout() {
  const [initializing, setInitializing] = useState(true);
  const hasInitialized = useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser: User | null) => {
      if (!hasInitialized.current) {
        hasInitialized.current = true;
        setInitializing(false);
      }
    });
    return unsubscribe;
  }, []);

  // Always render the navigator immediately so the Root Layout mounts
  // (avoids "Attempted to navigate before mounting the Root Layout" errors).
  // We keep the `initializing` state so you can show a loading UI inside
  // your screens if needed, but do not block rendering the navigator.
  const StackAny: any = Stack;
  return (
    <StackAny screenOptions={{ headerShown: false }} initialRouteName="index">
      <StackAny.Screen name="index" />
      <StackAny.Screen name="(auth)" options={{ headerShown: false }} />
      <StackAny.Screen name="(tabs)" options={{ headerShown: false }} />
      <StackAny.Screen name="modal" options={{ presentation: 'modal' }} />
    </StackAny>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: '#000000' 
  }
});