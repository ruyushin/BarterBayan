import { auth } from '@/firebaseConfig';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const user = auth.currentUser;
        if (!user) router.replace('/(auth)/login');
      } catch (e) {
        console.warn('Deferred navigation error in tabs/index:', e);
      }
    }, 50);

    return () => clearTimeout(t);
  }, [router]);

  // Render a simple home placeholder for the tabs index to avoid redirect loops
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Home</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 20, fontWeight: '600' }
});