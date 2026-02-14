import { auth } from '@/firebaseConfig';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { sendEmailVerification, signOut } from 'firebase/auth';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// Workaround: alias `Text` to an `any`-typed variable to avoid TSX typing mismatch in this environment
const TextAny: any = Text;

export default function VerifyEmailScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const appState = useRef(AppState.currentState);

  const checkVerification = async () => {
    setLoading(true);
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      Alert.alert('Not signed in', 'Please log in again.');
      router.replace('/(auth)/login');
      return;
    }

    try {
      // Force Firebase to refresh user data from server
      await user.reload();

      const freshUser = auth.currentUser;
      if (freshUser?.emailVerified) {
        Alert.alert('Verified!', 'Your email is confirmed. Welcome!');
        router.replace('/(tabs)');
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

  // When the app becomes active (e.g. user clicks the Gmail link and returns), re-check verification
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // silently check verification (don't show loader)
        (async () => {
          try {
            const user = auth.currentUser;
            if (!user) return;
            await user.reload();
            if (auth.currentUser?.emailVerified) {
              router.replace('/(tabs)');
            }
          } catch (err) {
            console.error('AppState verification check failed', err);
          }
        })();
      }
      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, []);

  const handleResend = async () => {
    if (auth.currentUser) {
      try {
        await sendEmailVerification(auth.currentUser);
        Alert.alert("Sent!", "A new verification link has been sent to your Gmail.");
      } catch (error) {
        Alert.alert("Error", "Could not resend email. Try again later.");
      }
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace('/(auth)/login');
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <MaterialIcons name="mark-email-read" size={80} color="#2F2F6F" />
      </View>

      <TextAny style={styles.title}>Check your Gmail!</TextAny>
      <TextAny style={styles.text}>
        We sent a verification link to:<TextAny>{"\n"}</TextAny>
        <TextAny style={styles.emailText}>{auth.currentUser?.email}</TextAny>
      </TextAny>
      
      <TouchableOpacity 
        style={styles.button} 
        onPress={checkVerification}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <TextAny style={styles.buttonText}>I've Clicked the Link</TextAny>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={handleResend}>
        <TextAny style={styles.resendText}>Didn't get an email? <TextAny style={styles.resendLink}>Resend</TextAny></TextAny>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelButton} onPress={handleSignOut}>
        <TextAny style={styles.cancelText}>Cancel / Back to Login</TextAny>
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
    backgroundColor: '#000000' 
  },
  iconContainer: {
    marginBottom: 30,
    backgroundColor: '#1A1A1A',
    padding: 20,
    borderRadius: 100,
  },
  title: { fontSize: 28, fontWeight: 'bold', color: '#ffffff', marginBottom: 15 },
  text: { textAlign: 'center', marginBottom: 40, color: '#ADADAD', fontSize: 16, lineHeight: 24 },
  emailText: { color: '#ffffff', fontWeight: 'bold' },
  button: { 
    backgroundColor: '#2F2F6F', 
    padding: 18, 
    borderRadius: 12, 
    width: '100%', 
    alignItems: 'center',
    marginBottom: 20
  },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  resendText: { color: '#ADADAD', fontSize: 14 },
  resendLink: { color: '#2F2F6F', fontWeight: '700' },
  cancelButton: { marginTop: 50 },
  cancelText: { color: '#FF4444', fontWeight: '600', fontSize: 14 }
});