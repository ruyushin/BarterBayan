import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { onAuthStateChanged, reload, sendEmailVerification } from 'firebase/auth';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth } from '../../firebaseConfig';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerified, setIsVerified] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

  // Check authentication and email verification status
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.replace('/(auth)/login');
        return;
      }

      setUser(currentUser);

      try {
        await reload(currentUser);
        if (currentUser.emailVerified) {
          setIsVerified(true);
        }
      } catch (err) {
        console.error('Error reloading user:', err);
      }

      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  // Auto-check verification every 3 seconds
  useEffect(() => {
    if (!user || isVerified) return;

    const interval = setInterval(async () => {
      try {
        await reload(user);
        if (user.emailVerified) {
          setIsVerified(true);
        }
      } catch (err) {
        console.error('Error checking verification:', err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [user, isVerified]);

  // Countdown timer for resend button
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  // Navigate after verified
  useEffect(() => {
    if (isVerified) {
      const timer = setTimeout(() => {
        router.replace('/(auth)/terms');
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isVerified, router]);

  const handleResendEmail = async () => {
    if (!user) return;

    setIsSending(true);
    try {
      await sendEmailVerification(user);
      Alert.alert('Email Sent', 'Verification email sent! Check your inbox and spam folder.');
      setResendCountdown(60);
    } catch (error: any) {
      console.error('Resend error:', error);
      if (error?.code === 'auth/too-many-requests') {
        Alert.alert(
          'Too Many Attempts',
          'Firebase has temporarily blocked email sending. Please wait a few minutes before trying again.'
        );
        setResendCountdown(120);
      } else {
        Alert.alert('Error', error?.message || 'Failed to send verification email.');
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleCheckNow = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      await reload(user);
      if (user.emailVerified) {
        setIsVerified(true);
      } else {
        Alert.alert(
          'Not Verified Yet',
          'Please check your email and click the verification link, then try again.'
        );
      }
    } catch (err) {
      console.error('Error:', err);
      Alert.alert('Error', 'Unable to check verification status. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2F2F6F" />
      </View>
    );
  }

  if (isVerified) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.successContainer}>
            <MaterialIcons name="check-circle" size={80} color="#5CB85C" />
            <Text style={styles.successTitle}>Email Verified!</Text>
            <Text style={styles.successMessage}>
              Your email address has been successfully verified.
            </Text>
            <Text style={styles.redirectText}>Proceeding to next step...</Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>

          {/* Header */}
          <View style={styles.header}>
            <MaterialIcons name="mail-outline" size={80} color="#2F2F6F" />
            <Text style={styles.title}>Verify Your Email</Text>
            <Text style={styles.subtitle}>We've sent a verification link to:</Text>
            <Text style={styles.email}>{user?.email}</Text>
          </View>

          {/* Instructions */}
          <View style={styles.instructionsContainer}>
            <View style={styles.instructionStep}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>1</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Check Your Email</Text>
                <Text style={styles.stepText}>
                  Look for the verification email from BarterBayan in your inbox or spam folder.
                </Text>
              </View>
            </View>

            <View style={styles.instructionStep}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>2</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Click the Link</Text>
                <Text style={styles.stepText}>
                  Click the verification link in the email.
                </Text>
              </View>
            </View>

            <View style={styles.instructionStep}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>3</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Continue</Text>
                <Text style={styles.stepText}>
                  Return to the app and tap "I've Verified My Email" below.
                </Text>
              </View>
            </View>
          </View>

          {/* Check Button */}
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={handleCheckNow}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>I've Verified My Email</Text>
            )}
          </TouchableOpacity>

          {/* Resend Button */}
          <TouchableOpacity
            style={[
              styles.button,
              styles.secondaryButton,
              (isSending || resendCountdown > 0) ? styles.buttonDisabled : null,
            ]}
            onPress={handleResendEmail}
            disabled={isSending || resendCountdown > 0}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#2F2F6F" />
            ) : (
              <Text style={[styles.secondaryButtonText, resendCountdown > 0 ? styles.buttonTextDisabled : null]}>
                {resendCountdown > 0
                  ? `Resend Email in ${resendCountdown}s`
                  : 'Resend Verification Email'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Didn't receive the email? Check your spam or junk folder.
            </Text>
          </View>

        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    flexGrow: 1,
    paddingVertical: 40,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2F2F6F',
    marginTop: 20,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: '#666666',
    marginTop: 10,
  },
  email: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2F2F6F',
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    marginBottom: 12,
  },
  instructionsContainer: {
    marginBottom: 30,
  },
  instructionStep: {
    flexDirection: 'row',
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  stepNumber: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2F2F6F',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
    marginTop: 2,
  },
  stepNumberText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  stepText: {
    fontSize: 13,
    color: '#666666',
    lineHeight: 18,
  },
  button: {
    height: 55,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#2F2F6F',
  },
  secondaryButton: {
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#2F2F6F',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#2F2F6F',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonTextDisabled: {
    opacity: 0.7,
  },
  footer: {
    marginTop: 20,
    paddingHorizontal: 10,
  },
  footerText: {
    fontSize: 12,
    color: '#999999',
    textAlign: 'center',
    lineHeight: 16,
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2F2F6F',
    marginTop: 20,
    marginBottom: 10,
  },
  successMessage: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 20,
  },
  redirectText: {
    fontSize: 14,
    color: '#999999',
    fontStyle: 'italic',
  },
});