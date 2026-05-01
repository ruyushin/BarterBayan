import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { onAuthStateChanged, sendEmailVerification, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '../../firebaseConfig';

export default function VerifyEmailScreen() {
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any | null>(auth.currentUser);
  const [authReady, setAuthReady] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const appState = useRef(AppState.currentState);
  
  // --- Router ---
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
      setAuthChecking(false);
    });

    return () => unsubscribe();
  }, []);

  const ensureUserDoc = async (user: any) => {
    if (!user?.uid) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          email: user.email,
          username: user.email?.split('@')[0],
          createdAt: new Date().toISOString(),
          rating: 5.0,
          tradeCount: 0,
          emailVerified: true,
        });
      } else if (!userSnap.data()?.emailVerified) {
        await setDoc(userRef, { emailVerified: true }, { merge: true });
      }
    } catch (err: any) {
      console.warn('Unable to ensure Firestore user document:', err);
    }
  };

  const checkVerification = async () => {
    setLoading(true);
    const user = auth.currentUser ?? currentUser;
    if (!user) {
      setLoading(false);
      if (authReady) {
        Alert.alert('Not signed in', 'Please sign in again.');
        router.replace('/login');
      } else {
        Alert.alert('Please wait', 'Checking your sign-in state before verifying.');
      }
      return;
    }

    try {
      // Force Firebase to refresh user data from server
      await auth.currentUser?.reload();
      const freshUser = auth.currentUser ?? user;
      if (freshUser?.emailVerified) {
        // Make sure we have a Firestore user document so the rest of the app can work
        ensureUserDoc(freshUser).catch((err) => console.warn('Failed to update user doc after verification:', err));

        Alert.alert('Verified!', 'Your email is confirmed. Welcome!');
        router.replace('/');
      } else {
        Alert.alert('Not Verified', 'We could not detect the verification yet. Please make sure you clicked the link and then return to the app.');
      }
    } catch (error: any) {
      console.error('checkVerification error', error);
      Alert.alert('Error', error?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // On web and mobile: keep checking verification state automatically
  useEffect(() => {
    const checkOnInterval = setInterval(async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        await user.reload();
        if (user.emailVerified) {
          router.replace('/');
          ensureUserDoc(user).catch((err) => console.warn('Failed to update user doc after periodic verification:', err));
        }
      } catch (err) {
        console.error('Periodic verification check failed', err);
      }
    }, 4000);

    const subscription = AppState.addEventListener?.('change', async (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        const user = auth.currentUser;
        if (!user) return;

        try {
          await user.reload();
          if (user.emailVerified) {
            router.replace('/');
            ensureUserDoc(user).catch((err) => console.warn('Failed to update user doc after AppState verification:', err));
          }
        } catch (err) {
          console.error('AppState verification check failed', err);
        }
      }
      appState.current = nextAppState;
    });

    return () => {
      clearInterval(checkOnInterval);
      if (subscription?.remove) subscription.remove();
    };
  }, [router]);

  const handleResend = async () => {
    const user = auth.currentUser ?? currentUser;
    if (!user) {
      if (authReady) {
        Alert.alert('Not signed in', 'Please sign in again to resend the verification email.');
        router.replace('/login');
      } else {
        Alert.alert('Please wait', 'Checking your sign-in state before resending the verification email.');
      }
      return;
    }

    setResendLoading(true);
    try {
      await user.reload();
      await sendEmailVerification(user);
      Alert.alert("Sent!", "A new verification link has been sent to your Gmail.");
    } catch (err: any) {
      console.error('Resend verification error', err);
      Alert.alert("Error", err?.message || "Could not resend email. Try again later.");
    } finally {
      setResendLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace('/login');
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <MaterialIcons name="mark-email-read" size={80} color="#2F2F6F" />
      </View>

      <Text style={styles.title}>Check your Gmail!</Text>
      <Text style={styles.text}>
        <Text>We sent a verification link to:</Text>
        <Text>{"\n"}</Text>
        <Text style={styles.emailText}>{currentUser?.email ?? (authChecking ? 'Loading...' : 'your email')}</Text>
      </Text>
      
      <TouchableOpacity 
        style={[styles.button, (loading || !currentUser || authChecking) && styles.buttonDisabled]} 
        onPress={checkVerification}
        disabled={loading || !currentUser || authChecking}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>I&apos;ve Clicked the Link</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={handleResend} disabled={resendLoading || authChecking}>
        <Text style={[styles.resendText, (resendLoading || authChecking) && styles.resendDisabled]}>
          {resendLoading ? 'Sending...' : 'Didn\'t get an email? '}
          <Text style={styles.resendLink}>{resendLoading || authChecking ? '' : 'Resend'}</Text>
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelButton} onPress={handleSignOut}>
        <Text style={styles.cancelText}>Cancel / Back to Login</Text>
      </TouchableOpacity>
    </View>
  );
} // <--- THIS WAS THE MISSING BRACE THAT CAUSED THE RED LINES

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: 25, 
    backgroundColor: '#ffffff' 
  },
  iconContainer: {
    marginBottom: 30,
    backgroundColor: '#f0f0f0',
    padding: 20,
    borderRadius: 100,
  },
  title: { fontSize: 28, fontWeight: 'bold', color: '#000000', marginBottom: 15 },
  text: { textAlign: 'center', marginBottom: 40, color: '#333333', fontSize: 16, lineHeight: 24 },
  emailText: { color: '#2F2F6F', fontWeight: 'bold' },
  button: { 
    backgroundColor: '#2F2F6F', 
    padding: 18, 
    borderRadius: 12, 
    width: '100%', 
    alignItems: 'center',
    marginBottom: 20
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  resendText: { color: '#333333', fontSize: 14 },
  resendLink: { color: '#2F2F6F', fontWeight: '700' },
  cancelButton: { marginTop: 50 },
  cancelText: { color: '#2F2F6F', fontWeight: '600', fontSize: 14 },
  resendDisabled: { opacity: 0.6 },
});