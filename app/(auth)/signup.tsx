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
  Modal,
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

export default function SignUpScreen() {
  WebBrowser.maybeCompleteAuthSession();
  const useProxy = Platform.OS !== 'web' && Constants.appOwnership === 'expo';
  const redirectUri = makeRedirectUri({
    scheme: 'barterbayanv10',
    ...(useProxy ? { useProxy: true } : {}),
  } as any);

  // --- Google Auth Request ---
  const [request, response, promptAsync] = Google.useAuthRequest({ // eslint-disable-line @typescript-eslint/no-unused-vars
    clientId: '1081232685961-ej4te66gtudrhi4l70jjm37ffball2b6.apps.googleusercontent.com',
    redirectUri,
    responseType: 'id_token',
    scopes: ['profile', 'email'],
  });

  // --- Facebook Auth Request ---
  const [facebookRequest, facebookResponse, facebookPromptAsync] = Facebook.useAuthRequest({ // eslint-disable-line @typescript-eslint/no-unused-vars
    clientId: '848759694896379',
    redirectUri,
    scopes: ['public_profile', 'email'],
  });

  useEffect(() => {
    if (Platform.OS === 'web' && response?.type === 'error') {
      console.warn('Google Web auth response error', response.error);
    }
  }, [response]);

  useEffect(() => {
    if (Platform.OS === 'web' && facebookResponse?.type === 'error') {
      console.warn('Facebook Web auth response error', facebookResponse.error);
    }
    console.log('Facebook response changed:', facebookResponse?.type, facebookResponse);
  }, [facebookResponse]);

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
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [successRoute, setSuccessRoute] = useState<'login' | 'verify'>('login');

  const router = useRouter();

  const showSuccessAndReset = (message: string, route: 'login' | 'verify' = 'login') => {
    setSuccessMessage(message);
    setSuccessRoute(route);
    setShowSuccessModal(true);
    setEmail('');
    setPassword('');
    setConfirm('');
    setErrors({});
  };

  // When Google response comes back
  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      handleGoogleSignUp(id_token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  // When Facebook response comes back
  useEffect(() => {
    if (facebookResponse?.type === 'success') {
      const { access_token } = facebookResponse.params;
      handleFacebookSignUp(access_token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facebookResponse]);

  const textColor = '#000000';
  const inputBgColor = '#f0f0f0';
  const iconColor = '#ADADAD';

  function SocialButton({ name, onPress }: { name: any; onPress?: () => void }) {
    return (
      <TouchableOpacity style={styles.socialButton} activeOpacity={0.7} onPress={onPress}>
        <FontAwesome name={name} size={24} color="#2F2F6F" />
      </TouchableOpacity>
    );
  }

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
      Animated.timing(strengthOpacity, { toValue: 0, duration: 350, useNativeDriver: true }).start(() =>
        setIsTyping(false)
      );
    }, 1200);
  }

  // --- Helper: extract email from a Firebase auth error (multiple fallback sources) ---
  const extractEmailFromError = (error: any): string | null => {
    console.log('Extracting email from error:', error);
    // Firebase Web SDK v9+ top-level customData
    if (error?.customData?.email) {
      console.log('Found email in customData.email:', error.customData.email);
      return error.customData.email;
    }
    // Firebase Web SDK — nested inside token response (common for Facebook on web)
    if (error?.customData?._tokenResponse?.email) {
      console.log('Found email in customData._tokenResponse.email:', error.customData._tokenResponse.email);
      return error.customData._tokenResponse.email;
    }
    // Direct property (some SDK versions)
    if (error?.email) {
      console.log('Found email in error.email:', error.email);
      return error.email;
    }
    // Last-resort: regex parse any email address from the message string
    if (error?.message) {
      const match = error.message.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (match) {
        console.log('Found email in error message:', match[1]);
        return match[1];
      }
    }
    console.log('No email found in error');
    return null;
  };

  // --- Helper: handle account linking with user confirmation ---
  const handleAccountLinking = async (email: string, credential: any, providerName: string): Promise<any> => {
    return new Promise((resolve: (user: any) => void, reject: (error: Error) => void) => {
      Alert.alert(
        'Account Already Exists',
        `This email (${email}) is already registered with another provider. Would you like to:\n\n1. Link this ${providerName} account to your existing account (same user)\n2. Cancel and use your existing account instead`,
        [
          {
            text: 'Link Accounts',
            onPress: async () => {
              try {
                console.log(`Linking ${providerName} credential to existing account...`);
                // Get the existing user and link the new credential
                const existingUser = auth.currentUser;
                if (existingUser) {
                  await linkWithCredential(existingUser, credential);
                  console.log(`Successfully linked ${providerName} to existing account`);
                  resolve(existingUser);
                } else {
                  reject(new Error('No existing user to link to'));
                }
              } catch (error) {
                console.error(`Failed to link ${providerName}:`, error);
                reject(error instanceof Error ? error : new Error(String(error)));
              }
            },
          },
          {
            text: 'Use Existing Account',
            onPress: () => {
              // Return the existing user so they can go through verify → terms → profile-setup
              const user = auth.currentUser;
              resolve(user);
            },
          },
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              reject(new Error('User cancelled account linking'));
            },
          },
        ]
      );
    });
  };

  // --- Helper: create / update Firestore user document ---
  const ensureFirestoreDoc = async (user: any, extraFields: Record<string, any> = {}) => {
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userDocRef);
      if (!snap.exists()) {
        await setDoc(userDocRef, {
          email: user.email,
          username: user.email?.split('@')[0],
          createdAt: new Date().toISOString(),
          rating: 5.0,
          tradeCount: 0,
          emailVerified: user.emailVerified,
          termsAccepted: false,
          profileComplete: false,
          ...extraFields,
        });
      }
    } catch (err) {
      console.warn('Unable to create Firestore user doc:', err);
    }
  };

  // --- Google sign-up ---
  const handleGoogleSignUp = async (idToken: string) => {
    setIsSubmitting(true);
    try {
      await signOut(auth).catch(() => {});
      const credential = GoogleAuthProvider.credential(idToken);
      
      try {
        const userCredential = await signInWithCredential(auth, credential);
        const user = userCredential.user;
        console.log('Google sign-in successful');

        await ensureFirestoreDoc(user);
        
        // Send verification email (even though Google already verified the email)
        try {
          await sendEmailVerification(user);
        } catch (err: any) {
          console.error('Email verification send error:', err);
        }
        
        // All paths go through: verify → terms → profile-setup
        router.push('/(auth)/verify');
      } catch (error: any) {
        if (
          error?.code === 'auth/account-exists-with-different-credential' ||
          error?.message?.includes('account-exists-with-different-credential')
        ) {
          console.log('Account exists with different credential - attempting to link');
          const extractedEmail = extractEmailFromError(error);
          const googleCredential = GoogleAuthProvider.credential(idToken);
          
          if (!extractedEmail) {
            Alert.alert('Error', 'Could not extract email for account linking');
            return;
          }
          
          try {
            const linkedUser = await handleAccountLinking(extractedEmail, googleCredential, 'Google');
            if (linkedUser) {
              // Send verification email for linked account
              try {
                await sendEmailVerification(linkedUser);
              } catch (err: any) {
                console.error('Email verification send error:', err);
              }
              router.push('/(auth)/verify');
            }
          } catch (linkError: any) {
            console.error('Account linking failed:', linkError);
            Alert.alert('Error', (linkError instanceof Error ? linkError.message : String(linkError)) || 'Failed to link accounts');
          }
        } else {
          throw error;
        }
      }
    } catch (error: any) {
      console.error('Google Signup Error:', error);
      Alert.alert('Google Signup Error', error?.message || String(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Facebook sign-up ---
  const handleFacebookSignUp = async (accessToken: string) => {
    console.log('handleFacebookSignUp called with token:', accessToken?.substring(0, 20) + '...');
    setIsSubmitting(true);
    try {
      // Sign in directly — no preflight graph.facebook.com fetch
      // (that fetch can hang or CORS-block in Expo web dev environment).
      // We get the email from the Firebase user object after sign-in instead.
      console.log('Signing out any existing user...');
      await signOut(auth).catch(() => {});
      
      console.log('Creating Facebook credential...');
      const credential = FacebookAuthProvider.credential(accessToken);
      
      try {
        console.log('Signing in with Facebook credential...');
        const userCredential = await signInWithCredential(auth, credential);
        const user = userCredential.user;
        console.log('Firebase sign-in successful. User:', user.email);

        // Guard: if Facebook didn't supply an email, bail out cleanly
        if (!user.email) {
          console.warn('User has no email from Facebook');
          await signOut(auth).catch(() => {});
          Alert.alert(
            'Email Required',
            'Your Facebook account did not share an email address. Please ensure your Facebook account has a verified email and try again.'
          );
          return;
        }

        console.log('Creating Firestore doc for user:', user.uid);
        await ensureFirestoreDoc(user);

        // Send verification email
        try {
          await sendEmailVerification(user);
        } catch (err: any) {
          console.error('Email verification send error:', err);
        }

        // All paths go through: verify → terms → profile-setup
        console.log('Navigating to verify...');
        router.push('/(auth)/verify');
      } catch (error: any) {
        if (
          error?.code === 'auth/account-exists-with-different-credential' ||
          error?.message?.includes('account-exists-with-different-credential')
        ) {
          console.log('Account exists with different credential - attempting to link');
          const extractedEmail = extractEmailFromError(error);
          const facebookCredential = FacebookAuthProvider.credential(accessToken);
          
          if (!extractedEmail) {
            Alert.alert('Error', 'Could not extract email for account linking');
            return;
          }
          
          try {
            const linkedUser = await handleAccountLinking(extractedEmail, facebookCredential, 'Facebook');
            if (linkedUser) {
              // Send verification email for linked account
              try {
                await sendEmailVerification(linkedUser);
              } catch (err: any) {
                console.error('Email verification send error:', err);
              }
              router.push('/(auth)/verify');
            }
          } catch (linkError: any) {
            console.error('Account linking failed:', linkError);
            Alert.alert('Error', (linkError instanceof Error ? linkError.message : String(linkError)) || 'Failed to link accounts');
          }
        } else {
          throw error;
        }
      }
    } catch (error: any) {
      console.error('Facebook Signup Error Full:', error);
      console.log('Error code:', error?.code);
      console.log('Error message:', error?.message);
      console.log('Error customData:', error?.customData);
      
      console.error('Facebook Signup Error:', error);
      Alert.alert('Facebook Signup Error', error?.message || String(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Email / password sign-up ---
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
    await createEmailAccount(email.trim(), password);
  };

  const createEmailAccount = async (emailAddr: string, pw: string) => {
    setIsSubmitting(true);
    let user;

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, emailAddr, pw);
      user = userCredential.user;
    } catch (error: any) {
      if (error?.code === 'auth/email-already-in-use') {
        setErrors({ email: 'This Gmail is already registered.' });
      } else if (error?.code === 'auth/invalid-email') {
        setErrors({ email: 'This email is not valid or does not exist.' });
      } else {
        Alert.alert('Signup Error', error?.message || String(error));
      }
      setIsSubmitting(false);
      return;
    }

    if (!user) {
      setIsSubmitting(false);
      return;
    }

    await ensureFirestoreDoc(user);

    try {
      console.log('📨 Sending email verification to:', user.email);
      await sendEmailVerification(user);
      console.log('✅ Verification email sent successfully!');
    } catch (error: any) {
      console.error('❌ Email verification send error:', error);
      Alert.alert('Verification Email Failed', error?.message || 'Unable to send a verification email. Please try again.');
    }

    setEmail('');
    setPassword('');
    setConfirm('');
    setErrors({});
    setIsSubmitting(false);
    // Email/password users must verify their email
    console.log('→ Navigating to verify screen...');
    router.push('/(auth)/verify');
  };

  return (
    <View style={{ flex: 1 }}>
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
              onChangeText={setEmail}
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
              value={password}
              onChangeText={handlePasswordChange}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <MaterialIcons
                name={showPassword ? 'visibility' : 'visibility-off'}
                size={20}
                color={iconColor}
              />
            </TouchableOpacity>
          </View>
          {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}

          {/* Password Strength Indicator */}
          {isTyping && (
            <AnimatedAny.View style={[styles.strengthContainer, { opacity: strengthOpacity }]}>
              <Text style={[styles.strengthText, { color: pwStrength.color }]}>
                Password Strength: {pwStrength.label}
              </Text>
              <View style={styles.strengthBar}>
                <View
                  style={[
                    styles.strengthFill,
                    { width: `${(pwStrength.score / 4) * 100}%`, backgroundColor: pwStrength.color },
                  ]}
                />
              </View>
            </AnimatedAny.View>
          )}

          {/* Confirm Password Input */}
          <View style={[styles.inputContainer, { backgroundColor: inputBgColor }]}>
            <MaterialIcons name="lock" size={20} color={iconColor} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: textColor }]}
              placeholder="Confirm Password"
              placeholderTextColor="#999999"
              value={confirm}
              onChangeText={(text) => {
                setConfirm(text);
                setErrors((e) => ({ ...e, confirm: undefined }));
              }}
              secureTextEntry={!showPassword}
            />
          </View>
          {errors.confirm ? <Text style={styles.errorText}>{errors.confirm}</Text> : null}

          {/* Sign Up Button */}
          <Pressable
            disabled={isSubmitting}
            onPress={handleSignUp}
            style={({ pressed }) => [styles.signupButton, pressed && styles.signupButtonPressed]}
          >
            <Text style={styles.signupButtonText}>
              {isSubmitting ? 'Creating Account...' : 'Sign Up'}
            </Text>
          </Pressable>

          {/* Divider */}
          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR Sign up with</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social Buttons */}
          <View style={styles.socialContainer}>
            <SocialButton 
              name="google" 
              onPress={() => {
                if (promptAsync) {
                  promptAsync({ useProxy } as any).catch(err => console.error('Google prompt error:', err));
                } else {
                  Alert.alert('Error', 'Google Sign-In not ready');
                }
              }} 
            />
            <SocialButton 
              name="facebook" 
              onPress={() => {
                console.log('Facebook button pressed', { facebookRequest, facebookPromptAsync });
                if (facebookPromptAsync && facebookRequest) {
                  facebookPromptAsync({ useProxy } as any).catch(err => {
                    console.error('Facebook prompt error:', err);
                    Alert.alert('Facebook Error', err?.message || 'Failed to open Facebook login');
                  });
                } else if (facebookPromptAsync) {
                  facebookPromptAsync({ useProxy } as any).catch(err => {
                    console.error('Facebook prompt error:', err);
                    Alert.alert('Facebook Error', err?.message || 'Failed to open Facebook login');
                  });
                } else {
                  Alert.alert('Error', 'Facebook Sign-In not ready. Please try again.');
                  console.error('facebookPromptAsync is null or undefined');
                }
              }} 
            />
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: textColor }]}>Already have an account? </Text>
            {/* FIX: was `() => ('/login')` — missing router.push */}
            <TouchableOpacity onPress={() => router.push('/login')}>
              <Text style={styles.footerLink}>Log In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Success Modal */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>SIGNUP SUCCESSFULLY</Text>
            <Text style={styles.modalMessage}>{successMessage}</Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => {
                setShowSuccessModal(false);
                setEmail('');
                setPassword('');
                setConfirm('');
                if (successRoute === 'verify') {
                  router.replace('/verify');
                } else {
                  router.replace('/login');
                }
              }}
            >
              <Text style={styles.modalButtonText}>
                {successRoute === 'verify' ? 'Go to Verification' : 'Go to Login'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: 60 },
  header: { marginBottom: 40 },
  headerGradient: { fontSize: 36, fontWeight: 'bold', textAlign: 'center', lineHeight: 42 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    borderRadius: 12,
    marginBottom: 16,
    height: 55,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16 },
  errorText: { color: '#D9534F', fontSize: 14, marginBottom: 8, marginLeft: 15 },
  strengthContainer: { marginBottom: 16, marginLeft: 15 },
  strengthText: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  strengthBar: { height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, overflow: 'hidden' },
  strengthFill: { height: '100%' },
  signupButton: {
    backgroundColor: '#2F2F6F',
    height: 55,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 30,
  },
  signupButtonPressed: { opacity: 0.8 },
  signupButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '600' },
  dividerContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E0E0E0' },
  dividerText: { marginHorizontal: 10, color: '#666', fontSize: 14 },
  socialContainer: { flexDirection: 'row', justifyContent: 'center', marginBottom: 30 },
  socialButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 12,
  },
  footer: { flexDirection: 'row', justifyContent: 'center', paddingBottom: 20 },
  footerText: { fontSize: 15 },
  footerLink: { color: '#2F2F6F', fontSize: 15, fontWeight: 'bold' },
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
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: '#000000', marginBottom: 10 },
  modalMessage: { fontSize: 16, color: '#000000', textAlign: 'center', marginBottom: 20 },
  modalButton: { backgroundColor: '#2F2F6F', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  modalButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});