import FontAwesome from '@expo/vector-icons/FontAwesome';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { makeRedirectUri } from 'expo-auth-session';
import * as Facebook from 'expo-auth-session/providers/facebook';
import * as Google from 'expo-auth-session/providers/google';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  createUserWithEmailAndPassword,
  FacebookAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  sendEmailVerification,
  signInWithCredential,
  signOut
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../../firebaseConfig';

const PRIMARY = '#2F2F6F';
const BG      = '#FFFFFF';
const MUTED   = '#666666';
const BORDER  = '#E0E0E0';
const DANGER  = '#D9534F';

WebBrowser.maybeCompleteAuthSession();

// ── Email validation ───────────────────────────────────────────────
const validateEmailFormat = (email: string) =>
  /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email.trim().toLowerCase());

// ── Password strength ──────────────────────────────────────────────
function evaluatePassword(pw: string) {
  let score = 0;
  if (pw.length >= 8)          score++;
  if (/[A-Z]/.test(pw))        score++;
  if (/[0-9]/.test(pw))        score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ['Very Weak', 'Weak', 'Medium', 'Strong', 'Very Strong'];
  const colors = ['#D9534F', '#D9534F', '#F0AD4E', '#F7C948', '#5CB85C'];
  return { score, label: labels[score], color: colors[score] };
}

export default function SignUpScreen() {
  const useProxy = Platform.OS !== 'web' && Constants.appOwnership === 'expo';
  const redirectUri = makeRedirectUri({
    scheme: 'barterbayanv10',
    ...(useProxy ? { useProxy: true } : {}),
  } as any);

  const [, googleResponse, googlePromptAsync] = Google.useAuthRequest({
    clientId: '1081232685961-ej4te66gtudrhi4l70jjm37ffball2b6.apps.googleusercontent.com',
    redirectUri,
    responseType: 'id_token',
    scopes: ['profile', 'email'],
  });

  const [, facebookResponse, facebookPromptAsync] = Facebook.useAuthRequest({
    clientId: '848759694896379',
    redirectUri,
    scopes: ['public_profile', 'email'],
  });

  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [confirm,      setConfirm]      = useState('');
  const [pwStrength,   setPwStrength]   = useState(evaluatePassword(''));
  const [showPassword, setShowPassword] = useState(false);
  const [errors,       setErrors]       = useState<{ email?: string; password?: string; confirm?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTyping,     setIsTyping]     = useState(false);

  const strengthOpacity = useRef(new Animated.Value(0)).current;
  const strengthTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const AnimatedAny: any = Animated;

  const router = useRouter();

  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const idToken =
        (googleResponse.params as any).id_token ||
        (googleResponse.authentication as any)?.idToken;
      if (idToken) handleGoogleSignUp(idToken);
      else Alert.alert('Google Sign-Up Error', 'No ID token returned. Please try again.');
    } else if (googleResponse?.type === 'error') {
      console.warn('Google auth error', googleResponse.error);
    }
  }, [googleResponse]);

  useEffect(() => {
    if (facebookResponse?.type === 'success') {
      handleFacebookSignUp((facebookResponse.params as any).access_token);
    } else if (facebookResponse?.type === 'error') {
      console.warn('Facebook auth error', facebookResponse.error);
    }
  }, [facebookResponse]);

  function handlePasswordChange(text: string) {
    setPassword(text);
    setErrors(e => ({ ...e, password: undefined }));
    setPwStrength(evaluatePassword(text));
    setIsTyping(true);
    Animated.timing(strengthOpacity, { toValue: 1, duration: 120, useNativeDriver: true }).start();
    if (strengthTimer.current) clearTimeout(strengthTimer.current);
    strengthTimer.current = setTimeout(() => {
      Animated.timing(strengthOpacity, { toValue: 0, duration: 350, useNativeDriver: true }).start(
        () => setIsTyping(false)
      );
    }, 1200);
  }

  const extractEmailFromError = (error: any): string | null => {
    if (error?.customData?.email) return error.customData.email;
    if (error?.customData?._tokenResponse?.email) return error.customData._tokenResponse.email;
    if (error?.email) return error.email;
    if (error?.message) {
      const match = error.message.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (match) return match[1];
    }
    return null;
  };

  const handleAccountLinking = async (
    email: string,
    credential: any,
    providerName: string
  ): Promise<any> => {
    return new Promise((resolve, reject) => {
      Alert.alert(
        'Account Already Exists',
        `This email (${email}) is already registered with another provider. Would you like to link this ${providerName} account?`,
        [
          {
            text: 'Link Accounts',
            onPress: async () => {
              try {
                const existing = auth.currentUser;
                if (existing) { await linkWithCredential(existing, credential); resolve(existing); }
                else reject(new Error('No existing user to link to'));
              } catch (err) { reject(err instanceof Error ? err : new Error(String(err))); }
            },
          },
          { text: 'Use Existing Account', onPress: () => resolve(auth.currentUser) },
          { text: 'Cancel', style: 'cancel', onPress: () => reject(new Error('User cancelled account linking')) },
        ]
      );
    });
  };

  const ensureFirestoreDoc = async (user: any, extra: Record<string, any> = {}) => {
    try {
      const ref  = doc(db, 'users', user.uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          email: user.email,
          username: user.email?.split('@')[0],
          createdAt: new Date().toISOString(),
          rating: 5.0, tradeCount: 0,
          emailVerified: user.emailVerified,
          termsAccepted: false,
          profileComplete: false,
          ...extra,
        });
      }
    } catch (err) { console.warn('Firestore doc error:', err); }
  };

  const routeAfterSocialSignup = (user: any) => {
    if (!user.emailVerified) {
      router.replace('/(auth)/verify');
    }
  };

  const handleGoogleSignUp = async (idToken: string) => {
    setIsSubmitting(true);
    try {
      await signOut(auth).catch(() => {});
      const credential = GoogleAuthProvider.credential(idToken);
      try {
        const { user } = await signInWithCredential(auth, credential);
        await ensureFirestoreDoc(user);
        routeAfterSocialSignup(user);
      } catch (error: any) {
        if (
          error?.code === 'auth/account-exists-with-different-credential' ||
          error?.message?.includes('account-exists-with-different-credential')
        ) {
          const extracted = extractEmailFromError(error);
          if (!extracted) { Alert.alert('Error', 'Could not extract email for account linking'); return; }
          const linked = await handleAccountLinking(extracted, GoogleAuthProvider.credential(idToken), 'Google').catch(() => null);
          if (linked) routeAfterSocialSignup(linked);
        } else { throw error; }
      }
    } catch (err: any) {
      Alert.alert('Google Signup Error', err?.message || String(err));
    } finally { setIsSubmitting(false); }
  };

  const handleFacebookSignUp = async (accessToken: string) => {
    setIsSubmitting(true);
    try {
      await signOut(auth).catch(() => {});
      const credential = FacebookAuthProvider.credential(accessToken);
      try {
        const { user } = await signInWithCredential(auth, credential);
        if (!user.email) {
          await signOut(auth).catch(() => {});
          Alert.alert('Email Required', 'Your Facebook account did not share an email address.');
          return;
        }
        await ensureFirestoreDoc(user);
        try { await sendEmailVerification(user); } catch (_) {}
        routeAfterSocialSignup(user);
      } catch (error: any) {
        if (
          error?.code === 'auth/account-exists-with-different-credential' ||
          error?.message?.includes('account-exists-with-different-credential')
        ) {
          const extracted = extractEmailFromError(error);
          if (!extracted) { Alert.alert('Error', 'Could not extract email for account linking'); return; }
          const linked = await handleAccountLinking(extracted, FacebookAuthProvider.credential(accessToken), 'Facebook').catch(() => null);
          if (linked) routeAfterSocialSignup(linked);
        } else { throw error; }
      }
    } catch (err: any) {
      Alert.alert('Facebook Signup Error', err?.message || String(err));
    } finally { setIsSubmitting(false); }
  };

  const handleSignUp = async () => {
    const nextErrors: typeof errors = {};
    if (!email.trim())                    nextErrors.email    = 'Email is required.';
    else if (!validateEmailFormat(email)) nextErrors.email    = 'Please enter a valid email address.';
    if (!password)                        nextErrors.password = 'Password is required.';
    else if (password.length < 6)         nextErrors.password = 'Password must be at least 6 characters.';
    if (password !== confirm)             nextErrors.confirm  = 'Passwords do not match.';
    if (Object.keys(nextErrors).length > 0) { setErrors(nextErrors); return; }

    setIsSubmitting(true);

    let user;
    try {
      const { user: u } = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      user = u;
    } catch (error: any) {
      if (error?.code === 'auth/email-already-in-use')
        setErrors({ email: 'This email is already registered. Please log in or use a different email.' });
      else if (error?.code === 'auth/invalid-email')
        setErrors({ email: 'This email address is not valid.' });
      else
        Alert.alert('Signup Error', error?.message || String(error));
      setIsSubmitting(false);
      return;
    }

    await ensureFirestoreDoc(user);

    try {
      await sendEmailVerification(user);
    } catch (err: any) {
      console.warn('Verification email failed:', err?.message);
    }

    setEmail(''); setPassword(''); setConfirm(''); setErrors({});
    setIsSubmitting(false);

    router.replace('/(auth)/verify');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: BG }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerText}>Create an</Text>
          <Text style={styles.headerText}>Account...</Text>
        </View>

        {/* Email */}
        <View style={[styles.inputContainer, errors.email && styles.inputError]}>
          <MaterialIcons name="email" size={20} color="#ADADAD" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Email Address"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            placeholderTextColor="#999999"
            value={email}
            onChangeText={t => { setEmail(t); setErrors(e => ({ ...e, email: undefined })); }}
          />
        </View>
        {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}

        {/* Password */}
        <View style={[styles.inputContainer, errors.password && styles.inputError]}>
          <MaterialIcons name="lock" size={20} color="#ADADAD" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#999999"
            value={password}
            onChangeText={handlePasswordChange}
            secureTextEntry={!showPassword}
            autoComplete="new-password"
            textContentType="newPassword"
          />
          <TouchableOpacity onPress={() => setShowPassword(v => !v)}>
            <MaterialIcons
              name={showPassword ? 'visibility' : 'visibility-off'}
              size={20}
              color="#ADADAD"
            />
          </TouchableOpacity>
        </View>
        {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}

        {/* Password strength */}
        {isTyping && (
          <AnimatedAny.View style={[styles.strengthWrap, { opacity: strengthOpacity }]}>
            <Text style={[styles.strengthLabel, { color: pwStrength.color }]}>
              Password Strength: {pwStrength.label}
            </Text>
            <View style={styles.strengthTrack}>
              <View
                style={[
                  styles.strengthFill,
                  { width: `${(pwStrength.score / 4) * 100}%`, backgroundColor: pwStrength.color },
                ]}
              />
            </View>
          </AnimatedAny.View>
        )}

        {/* Confirm password */}
        <View style={[styles.inputContainer, errors.confirm && styles.inputError]}>
          <MaterialIcons name="lock" size={20} color="#ADADAD" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Confirm Password"
            placeholderTextColor="#999999"
            value={confirm}
            onChangeText={t => { setConfirm(t); setErrors(e => ({ ...e, confirm: undefined })); }}
            secureTextEntry={!showPassword}
            autoComplete="new-password"
            textContentType="newPassword"
          />
        </View>
        {errors.confirm ? <Text style={styles.errorText}>{errors.confirm}</Text> : null}

        {/* Submit */}
        <Pressable
          disabled={isSubmitting}
          onPress={handleSignUp}
          style={({ pressed }) => [styles.signupBtn, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.signupBtnText}>
            {isSubmitting ? 'Creating Account…' : 'Sign Up'}
          </Text>
        </Pressable>

        {/* Divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR Sign up with</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Social */}
        <View style={styles.socialRow}>
          <TouchableOpacity
            style={styles.socialBtn}
            activeOpacity={0.7}
            onPress={() =>
              googlePromptAsync({ useProxy } as any).catch((err: any) =>
                Alert.alert('Google Error', err?.message || 'Failed to open Google login')
              )
            }
          >
            <FontAwesome name="google" size={24} color={PRIMARY} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.socialBtn}
            activeOpacity={0.7}
            onPress={() =>
              facebookPromptAsync
                ? facebookPromptAsync({ useProxy } as any).catch((err: any) =>
                    Alert.alert('Facebook Error', err?.message || 'Failed to open Facebook login')
                  )
                : Alert.alert('Error', 'Facebook Sign-In not ready. Please try again.')
            }
          >
            <FontAwesome name="facebook" size={24} color={PRIMARY} />
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => router.push('/login')}>
            <Text style={styles.footerLink}>Log In</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // flexGrow + justifyContent: 'center' eliminates dead space below
  scrollContent: {
    flexGrow:          1,
    justifyContent:    'center',
    paddingHorizontal: 20,
    paddingVertical:   40,
  },

  header:     { marginBottom: 40 },
  headerText: { fontSize: 36, fontWeight: 'bold', textAlign: 'center', lineHeight: 42, color: '#000000' },

  inputContainer: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 15,
    borderRadius:      12,
    marginBottom:      16,
    height:            55,
    backgroundColor:   '#F0F0F0',
  },
  inputError: {
    borderWidth: 1.5,
    borderColor: DANGER,
  },
  inputIcon: { marginRight: 10 },
  input:     { flex: 1, fontSize: 16, color: '#000000' },

  errorText: { color: DANGER, fontSize: 13, marginBottom: 8, marginLeft: 4, marginTop: -10 },

  strengthWrap:  { marginBottom: 16, marginLeft: 4 },
  strengthLabel: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  strengthTrack: { height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, overflow: 'hidden' },
  strengthFill:  { height: '100%' },

  signupBtn: {
    backgroundColor: PRIMARY,
    height:          55,
    borderRadius:    12,
    justifyContent:  'center',
    alignItems:      'center',
    marginTop:       4,
    marginBottom:    30,
  },
  signupBtnText: { color: '#FFFFFF', fontSize: 18, fontWeight: '600' },

  divider:     { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: BORDER },
  dividerText: { marginHorizontal: 10, color: MUTED, fontSize: 14 },

  socialRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 24 },
  socialBtn: {
    width:            60,
    height:           60,
    borderRadius:     30,
    backgroundColor:  '#F0F0F0',
    justifyContent:   'center',
    alignItems:       'center',
    marginHorizontal: 12,
  },

  footer:     { flexDirection: 'row', justifyContent: 'center' },
  footerText: { fontSize: 15, color: '#000000' },
  footerLink: { color: PRIMARY, fontSize: 15, fontWeight: 'bold' },
});