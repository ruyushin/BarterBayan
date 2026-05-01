import { useColorScheme } from '@/hooks/use-color-scheme';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { sendPasswordResetEmail } from 'firebase/auth';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth } from '../../firebaseConfig';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const colorScheme = useColorScheme();
  
  const router = useRouter();

  const isDark = colorScheme === 'dark';
  const bgColor = isDark ? '#ffffff' : '##121212';
  const textColor = isDark ? '#000000' : '#ffffff';
  const inputBgColor = isDark ? '#f0f0f0' : '#1e1e1e';

  const handleSubmit = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      Alert.alert('Enter your email', 'Please provide the email associated with your account.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      await sendPasswordResetEmail(auth, trimmed);
      setSent(true);
      Alert.alert(
        'Reset link sent',
        'If an account exists for that email, you will receive instructions to reset your password.'
      );
    } catch (err: any) {
      let msg = 'Unable to send reset email. Please try again later.';
      // Note: These specific errors only trigger if Email Enumeration Protection is OFF in Firebase
      if (err.code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address.';
      } else if (err.code === 'auth/user-not-found') {
        msg = 'No account found with that email.';
      }
      Alert.alert('Error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: bgColor }]}>
      <View style={styles.content}>
        <Text style={[styles.header, { color: textColor }]}>Forgot Password</Text>
        <Text style={[styles.subText, { color: textColor }]}>
          Enter your email and we will send password reset instructions.
        </Text>

        <View style={[styles.inputContainer, { backgroundColor: inputBgColor }]}>
          <MaterialIcons name="email" size={20} color="#ADADAD" style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: textColor }]}
            placeholder="Email"
            placeholderTextColor="#999999"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <TouchableOpacity
          style={[styles.resetButton, sent && styles.disabledButton]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          <Text style={styles.resetButtonText}>
            {isSubmitting ? 'Sending...' : sent ? 'Send Link Again' : 'Send Reset Link'}
          </Text>
        </TouchableOpacity>

        {/* Enhanced Feedback & Resend Logic */}
        {sent && (
          <View style={styles.resultContainer}>
            <Text style={[styles.sentText, { color: textColor }]}>
              Check your email for reset instructions. It may take a few minutes to arrive.
              After you change the password, you can return to the login screen.
            </Text>

            <View style={styles.retryContainer}>
              <Text style={[styles.subText, { marginBottom: 0, color: textColor }]}>
                Didn&apos;t get the link?{' '}
              </Text>
              <TouchableOpacity 
                onPress={handleSubmit} 
                disabled={isSubmitting}
              >
                <Text style={styles.retryLink}>
                  {isSubmitting ? 'Sending...' : 'Resend Email'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <TouchableOpacity 
          onPress={() => router.back?.()} 
          style={{ marginTop: 20 }}
        >
          <Text style={styles.backLink}>Back to Log-in</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingTop: 60,
  },
  header: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subText: {
    fontSize: 14,
    marginBottom: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    borderRadius: 12,
    marginBottom: 15,
    height: 55,
  },
  inputIcon: {
    marginRight: 10,
    fontSize: 20,
  },
  input: {
    flex: 1,
    fontSize: 16,
  },
  resetButton: {
    backgroundColor: '#2F2F6F',
    height: 55,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  resetButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultContainer: {
    alignItems: 'center',
    marginVertical: 15,
  },
  retryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  retryLink: {
    color: '#2F2F6F',
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  backLink: {
    color: '#2F2F6F',
    textAlign: 'center',
  },
  sentText: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  disabledButton: {
    opacity: 0.8,
  },
});