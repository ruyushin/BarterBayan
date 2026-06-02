import { Stack, useRouter, useSegments } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useEffect, useRef } from 'react';
import { auth, db } from '../../firebaseConfig';

export default function AuthLayout() {
  const router = useRouter();
  const segments = useSegments();
  const navigationInProgressRef = useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigationInProgressRef.current = false;
        return; // not logged in, stay on auth screens
      }

      // If already verified and logged in, check where they should go
      if (user.emailVerified) {
        try {
          // Wait a bit to ensure Firestore doc is written
          await new Promise(resolve => setTimeout(resolve, 500));
          
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          let data = userDoc.data();
          
          // Initialize missing fields if they don't exist
          if (data && (data.termsAccepted === undefined || data.profileComplete === undefined)) {
            const updates: any = {};
            if (data.termsAccepted === undefined) updates.termsAccepted = false;
            if (data.profileComplete === undefined) updates.profileComplete = false;
            
            console.log('[AuthLayout] Initializing missing fields:', updates);
            await setDoc(userDocRef, updates, { merge: true });
            
            // Merge the updates into our local data
            data = { ...data, ...updates };
          }
          
          const currentRoute = segments[segments.length - 1];

          console.log('[AuthLayout] User check:', {
            uid: user.uid,
            termsAccepted: data?.termsAccepted,
            profileComplete: data?.profileComplete,
            currentRoute,
            hasData: !!data,
          });

          // Avoid multiple rapid navigations
          if (navigationInProgressRef.current) {
            console.log('[AuthLayout] Navigation already in progress, skipping');
            return;
          }

          // Don't redirect if already on the correct screen or on special routes
          // Special routes: ChangePasswordScreen, etc. (authenticated-only routes)
          const specialAuthRoutes = ['ChangePasswordScreen'];
          const isSpecialRoute = specialAuthRoutes.includes(currentRoute);
          
          // Priority: Terms → Profile Setup → Home
          
          // 1. If terms not accepted, must show terms screen (don't show profile-setup yet)
          if (!data?.termsAccepted && currentRoute !== 'terms') {
            console.log('[AuthLayout] Redirecting to terms - termsAccepted is false/undefined');
            navigationInProgressRef.current = true;
            await router.replace('/(auth)/terms');
            setTimeout(() => { navigationInProgressRef.current = false; }, 800);
          } 
          // 2. If terms accepted but profile not complete, show profile-setup
          else if (data?.termsAccepted && !data?.profileComplete && currentRoute !== 'profile-setup') {
            console.log('[AuthLayout] Redirecting to profile-setup - profileComplete is false/undefined');
            navigationInProgressRef.current = true;
            await router.replace('/(auth)/profile-setup');
            setTimeout(() => { navigationInProgressRef.current = false; }, 800);
          } 
          // 3. If both complete, go home (but allow special authenticated routes)
          else if (data?.profileComplete && data?.termsAccepted && !isSpecialRoute) {
            console.log('[AuthLayout] Redirecting to home - both flags true');
            navigationInProgressRef.current = true;
            await router.replace('/');
            setTimeout(() => { navigationInProgressRef.current = false; }, 800);
          } else {
            console.log('[AuthLayout] No redirect needed, already on correct screen');
            navigationInProgressRef.current = false;
          }
        } catch (err) {
          console.warn('[AuthLayout] Guard error:', err);
          navigationInProgressRef.current = false;
        }
      }
    });

    return () => unsubscribe();
  }, [segments, router]);

  return <Stack screenOptions={{ headerShown: false }} />;
}