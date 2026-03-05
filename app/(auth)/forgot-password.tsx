import { auth } from '@/firebaseConfig';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { sendPasswordResetEmail } from 'firebase/auth';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const colorScheme = useColorScheme();

  const isDark = colorScheme === 'dark';
  const bgColor = '#ffffff';
  const textColor = '#000000';
  const inputBgColor = '#f0f0f0';

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
      // do not navigate away; keep user on screen until they update
    } catch (err: any) {
      let msg = 'Unable to send reset email. Please try again later.';
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
        <Text style={[styles.subText, { color: textColor }]}>Enter your email and we will send password reset instructions.</Text>

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
          disabled={isSubmitting || sent}
        >
          <Text style={styles.resetButtonText}>
            {isSubmitting ? 'Sending...' : sent ? 'Link Sent' : 'Send Reset Link'}
          </Text>
        </TouchableOpacity>

        {sent && (
          <Text style={styles.sentText}>
            Check your email for the reset instructions. After you change the password
            you can return to the login screen.
          </Text>
        )}

        <TouchableOpacity onPress={() => router.back()}>
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
  backLink: {
    color: '#2F2F6F',
    textAlign: 'center',
  },
  sentText: {
    textAlign: 'center',
    marginVertical: 15,
    color: '#333',
  },
  disabledButton: {
    opacity: 0.6,
  },
});
