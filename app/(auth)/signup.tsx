import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Alert, Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
// 1. Added sendEmailVerification to the imports
import { auth, db } from '@/firebaseConfig';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc } from "firebase/firestore";

export default function SignUpScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwStrength, setPwStrength] = useState({ score: 0, label: 'Very Weak', color: '#D9534F' });
  const strengthOpacity = useRef(new Animated.Value(0)).current;
  const strengthTimer = useRef<any>(null);
  const AnimatedAny: any = Animated;
  const [isTyping, setIsTyping] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirm?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const textColor = '#000000';
  const inputBgColor = '#f0f0f0';
  const iconColor = '#ADADAD';

  // --- HELPER FUNCTIONS ---
  // STRICTOR VALIDATION: Only allows valid @gmail.com structures
  const validateEmailFormat = (email: string) => {
    return /^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(email.toLowerCase());
  };

  function evaluatePassword(pw: string) {
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    const labels = ['Very Weak', 'Weak', 'Medium', 'Strong', 'Very Strong'];
    const colors = ['#D9534F', '#D9534F', '#F0AD4E', '#F7C948', '#5CB85C'];
    return { score, label: labels[score], color: colors[score] };
  }

  function handlePasswordChange(text: string) {
    setPassword(text);
    setErrors((e) => ({ ...e, password: undefined }));
    setPwStrength(evaluatePassword(text));
    setIsTyping(true);
    Animated.timing(strengthOpacity, { toValue: 1, duration: 120, useNativeDriver: true }).start();
    if (strengthTimer.current) clearTimeout(strengthTimer.current);
    strengthTimer.current = setTimeout(() => {
      Animated.timing(strengthOpacity, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => setIsTyping(false));
    }, 1200);
  }

  // --- CORE SIGNUP LOGIC ---
  const handleSignUp = async () => {
    const nextErrors: any = {};

    if (!email.trim()) {
      nextErrors.email = 'Email is required';
    } else if (!validateEmailFormat(email)) {
      nextErrors.email = 'Please enter a valid @gmail.com address';
    }

    if (!password) {
      nextErrors.password = 'Password is required';
    } else if (password.length < 6) {
      nextErrors.password = 'Password must be at least 6 characters';
    }

    if (password !== confirm) {
      nextErrors.confirm = 'Passwords do not match';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const user = userCredential.user;

      await sendEmailVerification(user);

      await setDoc(doc(db, 'users', user.uid), {
        email: user.email,
        username: email.split('@')[0],
        createdAt: new Date().toISOString(),
        rating: 5.0,
        tradeCount: 0,
        emailVerified: false,
      });

      Alert.alert(
        'Verify Your Gmail',
        "Account created! We've sent a verification link to your Gmail. Please click it before logging in."
      );
      router.replace('/login');
    } catch (error: any) {
      if (error?.code === 'auth/email-already-in-use') {
        setErrors({ email: 'This Gmail is already registered.' });
      } else if (error?.code === 'auth/invalid-email') {
        setErrors({ email: 'This email is not valid or does not exist.' });
      } else {
        Alert.alert('Signup Error', error?.message || String(error));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: '#ffffff' }]}> 
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.headerGradient, { color: textColor }]}>Create an</Text>
          <Text style={[styles.headerGradient, { color: textColor }]}>Account...</Text>
        </View>

        {/* Email Input */}
        <View style={[styles.inputContainer, { backgroundColor: inputBgColor }]}> 
          <MaterialIcons name="email" size={20} color={iconColor} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: textColor }]}
            placeholder="Gmail Address"
            autoCapitalize="none"
            keyboardType="email-address"
            placeholderTextColor="#999999"
            value={email}
            onChangeText={(text: string) => {
              setEmail(text);
              setErrors(e => ({...e, email: undefined}));
            }}
          />
        </View>
        {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}

        {/* Password Input */}
        <View style={[styles.inputContainer, { backgroundColor: inputBgColor }]}> 
          <MaterialIcons name="lock" size={20} color={iconColor} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: textColor }]}
            placeholder="Password"
            placeholderTextColor="#999999"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={handlePasswordChange}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <MaterialIcons name={showPassword ? 'visibility' : 'visibility-off'} size={20} color={iconColor} style={styles.eyeIcon} />
          </TouchableOpacity>
        </View>
        {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}

        {/* Password Strength UI */}
          {isTyping && (
            <AnimatedAny.View style={[styles.strengthRow, { opacity: strengthOpacity }] as any}>
              <View style={styles.strengthBar}>
               <View style={[styles.strengthFill, { width: `${(pwStrength.score / 4) * 100}%`, backgroundColor: pwStrength.color }]} />
              </View>
              <Text style={[styles.strengthLabel, { color: pwStrength.color }]}>{pwStrength.label}</Text>
            </AnimatedAny.View>
          )}

        {/* Confirm Password */}
        <View style={[styles.inputContainer, { backgroundColor: inputBgColor }]}> 
          <MaterialIcons name="lock" size={20} color={iconColor} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: textColor }]}
            placeholder="Confirm Password"
            placeholderTextColor="#999999"
            secureTextEntry={!showPassword}
            value={confirm}
            onChangeText={(text: string) => {
              setConfirm(text);
              setErrors(e => ({...e, confirm: undefined}));
            }}
          />
        </View>
        {errors.confirm ? <Text style={styles.errorText}>{errors.confirm}</Text> : null}

        {/* Sign Up Button */}
        <Pressable onPress={handleSignUp} disabled={isSubmitting}>
          <Animated.View style={[styles.loginButton, { backgroundColor: isSubmitting ? '#2F2F6F' : '#888888' }]}>
            <Text style={styles.loginButtonText}>{isSubmitting ? 'Verifying...' : 'Sign-Up'}</Text>
          </Animated.View>
        </Pressable>

        <TouchableOpacity onPress={() => router.push('/login')}>
          <Text style={[styles.backlogin, { color: '#2F2F6F' }]}>Back to Login</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: 60 },
  header: { marginBottom: 24 },
  headerGradient: { fontSize: 32, fontWeight: '700' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, borderRadius: 12, marginBottom: 15, height: 55 },
  inputIcon: { marginRight: 10, fontSize: 20 },
  input: { flex: 1, fontSize: 16 },
  eyeIcon: { fontSize: 18, marginLeft: 10 },
  loginButton: { backgroundColor: '#888888', height: 55, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 10, marginBottom: 30 },
  loginButtonText: { color: '#ffffff', fontSize: 18, fontWeight: '600' },
  errorText: { color: '#D9534F', marginBottom: 8, fontSize: 12, marginLeft: 5 },
  strengthRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  strengthBar: { flex: 1, height: 8, backgroundColor: '#eee', borderRadius: 6, marginRight: 10, overflow: 'hidden' },
  strengthFill: { height: '100%', width: '0%', backgroundColor: '#D9534F' },
  strengthLabel: { fontSize: 12, fontWeight: '600' },
  backlogin: { textAlign: 'right', marginBottom: 25, marginRight: 8, marginTop: -18, fontSize: 14, fontWeight: 'bold' },
});