import FontAwesome from '@expo/vector-icons/FontAwesome';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { makeRedirectUri } from 'expo-auth-session';
import * as Facebook from 'expo-auth-session/providers/facebook';
import * as Google from 'expo-auth-session/providers/google';
import Constants from 'expo-constants';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
    FacebookAuthProvider,
    GoogleAuthProvider,
    browserLocalPersistence,
    browserSessionPersistence,
    sendEmailVerification,
    setPersistence,
    signInWithCredential,
    signInWithEmailAndPassword
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { auth, db } from '../../firebaseConfig';

export default function LoginScreen() {
  // --- Auth request redirectUri ---
  WebBrowser.maybeCompleteAuthSession();
  const useProxy = Platform.OS !== 'web' && Constants.appOwnership === 'expo';
  const redirectUri = makeRedirectUri({
    scheme: 'barterbayanv10',
    ...(useProxy ? { useProxy: true } : {}),
  } as any);

  // --- Google Auth Request ---
  const [request, response, promptAsync] = Google.useAuthRequest({ // eslint-disable-line @typescript-eslint/no-unused-vars
    clientId: '1081232685961-ej4te66gtudrhi4l70jjm37ffball2b6.apps.googleusercontent.com',
    // Optional platform-specific IDs:
    // iosClientId: '<YOUR_IOS_CLIENT_ID>',
    // androidClientId: '<YOUR_ANDROID_CLIENT_ID>',
    // expoClientId: '<YOUR_EXPO_CLIENT_ID>',
    redirectUri,
    responseType: 'id_token',
    scopes: ['profile', 'email'],
  });

  // --- Facebook Auth Request ---
  const [facebookRequest, facebookResponse, facebookPromptAsync] = Facebook.useAuthRequest({ // eslint-disable-line @typescript-eslint/no-unused-vars
    clientId: '848759694896379', // Your Facebook App ID
    redirectUri,
    scopes: ['public_profile', 'email'],
  });

  // if we are on web + expo dev client path, this help avoids COOP popup race
  useEffect(() => {
    if (Platform.OS === 'web' && response?.type === 'error') {
      console.warn('Google Web auth response error', response.error);
    }
  }, [response]);

  useEffect(() => {
    if (Platform.OS === 'web' && facebookResponse?.type === 'error') {
      console.warn('Facebook Web auth response error', facebookResponse.error);
    }
  }, [facebookResponse]);

  // --- Helper function to decode JWT ---
  const decodeJWT = (token: string) => {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map((c) => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error('Error decoding JWT:', error);
      return null;
    }
  };

  // --- State ---
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepLoggedIn, setKeepLoggedIn] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null); // display login errors

  const [showSignupSuccessModal, setShowSignupSuccessModal] = useState(false);
  const [signupSuccessMessage, setSignupSuccessMessage] = useState('');
  const searchParams = useLocalSearchParams();

  const setKeepLoggedInStorage = (value: boolean) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    if (value) {
      window.localStorage.setItem('keepLoggedIn', '1');
    } else {
      window.localStorage.removeItem('keepLoggedIn');
    }
  };

  const getRememberedFlag = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.localStorage.getItem('keepLoggedIn') === '1';
    }
    return keepLoggedIn;
  };

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    const storedValue = window.localStorage.getItem('keepLoggedIn');
    setKeepLoggedIn(storedValue === '1');
  }, []);
  
  // --- Router ---
  const router = useRouter();
  
  // --- Animation Refs ---
  const loginAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (searchParams.signupSuccess === '1') {
      let message = 'Signup successful! Please log in.';
      const rawMessage = searchParams.message;
      if (rawMessage) {
        const value = Array.isArray(rawMessage) ? rawMessage[0] : rawMessage;
        message = decodeURIComponent(value);
      }
      setSignupSuccessMessage(message);
      setShowSignupSuccessModal(true);

      // Clear query state to avoid persisting modal after reload
      router.replace('/login');
    }
  }, [searchParams, router]);

  // --- Handle Google Response ---
  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      handleGoogleSignIn(id_token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  // --- Handle Facebook Response ---
  useEffect(() => {
    if (facebookResponse?.type === 'success') {
      const { access_token } = facebookResponse.params;
      handleFacebookSignIn(access_token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facebookResponse]);

  // --- Google Sign-In Handler ---
  const handleGoogleSignIn = async (idToken: string) => {
    setIsSubmitting(true);
    try {
      const remember = getRememberedFlag();
      const persistence = Platform.OS === 'web'
        ? (remember ? browserLocalPersistence : browserSessionPersistence)
        : undefined;
      if (persistence) {
        await setPersistence(auth, persistence);
      }

      // Decode the id_token to get the email
      const decoded = decodeJWT(idToken);
      if (!decoded || !decoded.email) {
        const message = 'Invalid Google credentials.';
        setError(message);
        Alert.alert('Invalid Credentials', message);
        return;
      }

      // Sign in with Google credential
      const credential = GoogleAuthProvider.credential(idToken);
      const userCredential = await signInWithCredential(auth, credential);
      const user = userCredential.user;

      // Ensure Firestore user doc exists for app-specific fields
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        if (!userDoc.exists()) {
          await setDoc(userDocRef, {
            email: user.email,
            username: user.email?.split('@')[0],
            createdAt: new Date().toISOString(),
            rating: 5.0,
            tradeCount: 0,
            emailVerified: user.emailVerified,
          });
        }
      } catch (firestoreError) {
        console.warn('Unable to create Firestore user doc:', firestoreError);
      }

      // Navigate once signed in (Google accounts are already verified)
      router.replace('/');
    } catch (err: any) {
      let message = 'Google sign-in failed. Please try again.';
      if (err.code === 'auth/popup-closed-by-user') {
        message = 'Sign-in was cancelled.';
      } else if (err.code === 'auth/invalid-credential') {
        message = 'Invalid Google credentials.';
      }
      setError(message);
      Alert.alert('Google Sign-In Failed', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Facebook Sign-In Handler ---
  const handleFacebookSignIn = async (accessToken: string) => {
    setIsSubmitting(true);
    try {
      const remember = getRememberedFlag();
      const persistence = Platform.OS === 'web'
        ? (remember ? browserLocalPersistence : browserSessionPersistence)
        : undefined;
      if (persistence) {
        await setPersistence(auth, persistence);
      }

      // Get user info from Facebook to retrieve email
      const response = await fetch(`https://graph.facebook.com/me?fields=id,email,name&access_token=${accessToken}`);
      const data = await response.json();
      if (!data.email) {
        const message = 'Unable to retrieve email from Facebook account.';
        setError(message);
        Alert.alert('Email Required', message);
        return;
      }

      // Sign in with Facebook credential
      const credential = FacebookAuthProvider.credential(accessToken);
      const userCredential = await signInWithCredential(auth, credential);
      const user = userCredential.user;

      // Ensure Firestore user doc exists for app-specific fields
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        if (!userDoc.exists()) {
          await setDoc(userDocRef, {
            email: user.email,
            username: user.email?.split('@')[0],
            createdAt: new Date().toISOString(),
            rating: 5.0,
            tradeCount: 0,
            emailVerified: user.emailVerified,
          });
        }
      } catch (firestoreError) {
        console.warn('Unable to create Firestore user doc:', firestoreError);
      }

      // Navigate once signed in (Facebook accounts are already verified)
      router.replace('/');
    } catch (err: any) {
      let message = 'Facebook sign-in failed. Please try again.';
      if (err.code === 'auth/popup-closed-by-user') {
        message = 'Sign-in was cancelled.';
      } else if (err.code === 'auth/invalid-credential') {
        message = 'Invalid Facebook credentials.';
      }
      setError(message);
      Alert.alert('Facebook Sign-In Failed', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Theme Colors (Directly from your Create Account Style) ---
  const bgColor = '#ffffff';      // Pure Black Background
  const textColor = '#000000';    // White Text
  const inputBgColor = '#f0f0f0'; // Light Gray Input (Matches Sign Up)
  const inputTextColor = '#000000';
  const iconGray = '#ADADAD';
  const primaryBrand = '#2F2F6F';

  // --- Components ---
  function SocialButton({ name, onPress }: { name: any; onPress?: () => void }) {
    return (
      <TouchableOpacity style={styles.socialButton} activeOpacity={0.7} onPress={onPress}>
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
      setKeepLoggedInStorage(keepLoggedIn);
      const remember = getRememberedFlag();
      const persistence = Platform.OS === 'web'
        ? (remember ? browserLocalPersistence : browserSessionPersistence)
        : undefined;
      if (persistence) {
        await setPersistence(auth, persistence);
      }

      const userCredential = await signInWithEmailAndPassword(auth, trimmed, password);
      let user = userCredential.user;
      await user.reload();

      if (!user.emailVerified) {
        Alert.alert(
          'Verification Required',
          'Please verify your Gmail first.',
          [
            { text: 'Resend', onPress: () => sendEmailVerification(user) },
            { text: 'OK', onPress: () => { router.push('/verify'); } }
          ]
        );
        return;
      }
      router.replace('/'); 
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
              onPress={() => {
                const nextValue = !keepLoggedIn;
                setKeepLoggedIn(nextValue);
                setKeepLoggedInStorage(nextValue);
              }}
            >
              <MaterialIcons 
                name={keepLoggedIn ? "check-box" : "check-box-outline-blank"} 
                size={22} 
                color={primaryBrand} 
              />
              <Text style={[styles.keepLoggedInText, { color: textColor }]}>Keep me logged in</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push('/forgot-password')}>
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
            <Text style={[styles.dividerText, { color: '#666' }]}>OR Login with</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social Row */}
          <View style={styles.socialContainer}>
            <SocialButton 
              name="google" 
              onPress={() => {
                setKeepLoggedInStorage(keepLoggedIn);
                promptAsync({ useProxy } as any);
              }}
            />
            <SocialButton 
              name="facebook" 
              onPress={() => {
                setKeepLoggedInStorage(keepLoggedIn);
                facebookPromptAsync({ useProxy } as any);
              }}
            />
          </View>

          {/* Footer */}
          <View style={styles.signupContainer}>
            <Text style={[styles.signupText, { color: textColor }]}>Create an Account? </Text>
          <TouchableOpacity onPress={() => router.push('/signup')}>
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

      {/* Signup success popup from previous flow */}
      <Modal
        visible={showSignupSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSignupSuccessModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>SIGNUP SUCCESSFULLY</Text>
            <Text style={styles.modalMessage}>{signupSuccessMessage}</Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setShowSignupSuccessModal(false)}
            >
              <Text style={styles.modalButtonText}>Okay</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  overlayText: { marginTop: 15, fontSize: 16, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    width: '80%',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 10,
  },
  modalMessage: {
    fontSize: 16,
    color: '#000000',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalButton: {
    backgroundColor: '#2F2F6F',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  }
});