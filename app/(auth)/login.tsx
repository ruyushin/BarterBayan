import { auth } from '@/firebaseConfig';
import { FontAwesome, MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { sendEmailVerification, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput, TouchableOpacity,
  View
} from 'react-native';

export default function LoginScreen() {
  const router = useRouter();
  
  // --- State ---
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepLoggedIn, setKeepLoggedIn] = useState(false); 
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null); // display login errors
  
  // --- Animation Refs ---
  const loginAnim = useRef(new Animated.Value(0)).current;

  // --- Theme Colors (Directly from your Create Account Style) ---
  const bgColor = '#ffffff';      // Pure Black Background
  const textColor = '#000000';    // White Text
  const inputBgColor = '#f0f0f0'; // Light Gray Input (Matches Sign Up)
  const inputTextColor = '#000000';
  const iconGray = '#ADADAD';
  const primaryBrand = '#2F2F6F';

  // --- Components ---
  function SocialButton({ name }: { name: any }) {
    return (
      <TouchableOpacity style={styles.socialButton} activeOpacity={0.7}>
        <FontAwesome name={name} size={24} color={primaryBrand} />
      </TouchableOpacity>
    );
  }

  // --- Handlers ---
  const handleLogin = async () => {
    setError(null);
    const trimmed = email.trim();
    if (!trimmed || !password) {
      setError('Please enter your Gmail and Password.');
      Alert.alert('Incomplete Form', 'Please enter your Gmail and Password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, trimmed, password);
      let user = userCredential.user;
      await user.reload();

      if (!user.emailVerified) {
        Alert.alert(
          'Verification Required',
          'Please verify your Gmail first.',
          [
            { text: 'Resend', onPress: () => sendEmailVerification(user) },
            { text: 'OK', onPress: async () => { await signOut(auth); router.push('/(auth)/verify'); } }
          ]
        );
        await signOut(auth);
        return;
      }
      router.replace('/(tabs)'); 
    } catch (err: any) {
      // inspect the Firebase error code and show a specific message
      let message = 'The Gmail or Password you entered is incorrect.';
      if (err.code === 'auth/user-not-found') {
        message = 'No account exists with that Gmail address.';
      } else if (err.code === 'auth/wrong-password') {
        message = 'The password you entered is wrong.';
      } else if (err.code === 'auth/invalid-email') {
        message = 'Please enter a valid Gmail address.';
      }
      // additional codes could be handled here
      setError(message);
      Alert.alert('Login Failed', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: bgColor }}>
      <ScrollView 
        contentContainerStyle={{ flexGrow: 1 }}
        style={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: textColor }]}>Welcome</Text>
            <Text style={[styles.title, { color: textColor }]}>Back!</Text>
          </View>

          {/* Email Input */}
          <View style={[styles.inputContainer, { backgroundColor: inputBgColor }]}>
            <MaterialIcons name="mail-outline" size={20} color={iconGray} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: inputTextColor }]}
              placeholder="Gmail Address"
              autoCapitalize="none"
              keyboardType="email-address"
              placeholderTextColor="#999999"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          {/* Password Input */}
          <View style={[styles.inputContainer, { backgroundColor: inputBgColor }]}>
            <MaterialIcons name="lock-outline" size={20} color={iconGray} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: inputTextColor }]}
              placeholder="Password"
              placeholderTextColor="#999999"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={text => { setPassword(text); setError(null); }}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <MaterialIcons
                name={showPassword ? 'visibility' : 'visibility-off'}
                size={20}
                color={iconGray}
              />
            </TouchableOpacity>
          </View>

          {/* inline error message placed directly below password */}
          {error && <Text style={styles.errorText}>{error}</Text>}

          <View style={styles.optionsRow}>
            <TouchableOpacity 
              style={styles.keepLoggedInRow} 
              onPress={() => setKeepLoggedIn(!keepLoggedIn)}
            >
              <MaterialIcons 
                name={keepLoggedIn ? "check-box" : "check-box-outline-blank"} 
                size={22} 
                color={primaryBrand} 
              />
              <Text style={[styles.keepLoggedInText, { color: textColor }]}>Keep me logged in</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')}>
              <Text style={[styles.forgotPassword, { color: primaryBrand }]}>Forgot Password?</Text>
            </TouchableOpacity>
          </View>

          {/* Login Button */}
          <Pressable
            disabled={isSubmitting}
            onPressIn={() => Animated.timing(loginAnim, { toValue: 1, duration: 150, useNativeDriver: false }).start()}
            onPressOut={() => Animated.timing(loginAnim, { toValue: 0, duration: 150, useNativeDriver: false }).start()}
            onPress={handleLogin}>
            <Animated.View
              style={[
                styles.loginButton,
                { backgroundColor: loginAnim.interpolate({ inputRange: [0, 1], outputRange: ['#888888', primaryBrand] }) },
              ]}>
              <Text style={styles.loginButtonText}>
                {isSubmitting ? 'Checking...' : 'Log-In'}
              </Text>
            </Animated.View>
          </Pressable>

          {/* FIXED DIVIDER: No more overlapping lines */}
          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <Text style={[styles.dividerText, { color: '#666' }]}>OR Continue with</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social Row */}
          <View style={styles.socialContainer}>
            <SocialButton name="google" />
            <SocialButton name="apple" />
            <SocialButton name="facebook" />
          </View>

          {/* Footer */}
          <View style={styles.signupContainer}>
            <Text style={[styles.signupText, { color: textColor }]}>Create an Account? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
              <Text style={styles.signupLink}>Sign-Up</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Loading Overlay */}
      {isSubmitting && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={primaryBrand} />
          <Text style={[styles.overlayText, { color: primaryBrand }]}>Authenticating...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 80 },
  header: { marginBottom: 40 },
  title: { fontSize: 48, fontWeight: 'bold', lineHeight: 52 },
  inputContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 15, 
    borderRadius: 12, 
    marginBottom: 16, 
    height: 58 
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16 },
  optionsRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 30 
  },
  keepLoggedInRow: { flexDirection: 'row', alignItems: 'center' },
  keepLoggedInText: { marginLeft: 8, fontSize: 14 },
  forgotPassword: { fontSize: 14, fontWeight: '700' },
  loginButton: { height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  loginButtonText: { fontSize: 18, fontWeight: '700', color: '#fff' },
  dividerContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginVertical: 40 
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#333' },
  dividerText: { marginHorizontal: 10, fontSize: 12 },
  socialContainer: { flexDirection: 'row', justifyContent: 'center', marginBottom: 35 },
  socialButton: { 
    width: 60, 
    height: 60, 
    borderRadius: 30, 
    backgroundColor: '#f0f0f0',
    justifyContent: 'center', 
    alignItems: 'center', 
    marginHorizontal: 12,
  },
  signupContainer: { flexDirection: 'row', justifyContent: 'center', paddingBottom: 20 },
  signupText: { fontSize: 15 },
  signupLink: { color: '#2F2F6F', fontSize: 15, fontWeight: 'bold' },
  errorText: { color: '#ff3333', textAlign: 'center', marginBottom: 12 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  overlayText: { marginTop: 15, fontSize: 16, fontWeight: '600' }
});