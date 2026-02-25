import { auth } from '@/firebaseConfig';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

export default function RootIndex() {
  const router = useRouter();

  useEffect(() => {
    // Defer navigation to avoid "Attempted to navigate before mounting the Root Layout"
    // which occurs when router.replace is called before the root layout is mounted.
    const t = setTimeout(() => {
      try {
        const user = auth.currentUser;

        if (!user) {
          router.replace('/(auth)/login');
          return;
        }

        if (!user.emailVerified) {
          router.replace('/(auth)/verify');
          return;
        }

        router.replace('/(tabs)');
      } catch (e) {
        // swallow navigation errors that occur if the router isn't ready yet.
        // This ensures the app won't crash during the initial mount.
        // We could retry later if needed.
        console.warn('Navigation deferred: ', e);
      }
    }, 50);

    return () => clearTimeout(t);
  }, [router]);

  return null;
}