import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useRouter, useSegments } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../../firebaseConfig';
import { welcomeState } from './welcomeState';

const PRIMARY = '#2F2F6F';

// ─── Welcome Modal ─────────────────────────────────────────────────────────────
function WelcomeModal({
  visible,
  name,
  type,
  onDone,
}: {
  visible: boolean;
  name: string;
  type: 'login' | 'signup';
  onDone: () => void;
}) {
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scale.setValue(0.85);
      opacity.setValue(0);
      iconScale.setValue(0);
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 65, friction: 8 }),
        Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]).start(() => {
        Animated.spring(iconScale, {
          toValue: 1, useNativeDriver: true, tension: 80, friction: 6,
        }).start();
      });
    }
  }, [visible]);

  const isSignup = type === 'signup';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDone}>
      <View style={wm.overlay}>
        <Animated.View style={[wm.card, { opacity, transform: [{ scale }] }]}>

          <Animated.View style={[wm.iconRing, { transform: [{ scale: iconScale }] }]}>
            <Ionicons
              name={isSignup ? 'person-add' : 'checkmark'}
              size={isSignup ? 30 : 36}
              color="#fff"
            />
          </Animated.View>

          <Text style={wm.eyebrow}>
            {isSignup ? 'Account created' : 'Welcome back'}
          </Text>

          <Text style={wm.name}>{name || 'Trader'}</Text>

          <View style={wm.divider} />

          <Text style={wm.tagline}>
            {isSignup
              ? <>{`You've joined `}<Text style={wm.brand}>BarterBayan</Text></>
              : <>{`You're signed in to\n`}<Text style={wm.brand}>BarterBayan</Text></>
            }
          </Text>

          <Text style={wm.sub}>
            {isSignup
              ? 'Your profile is ready. Start trading, connect with your community, and make every barter count.'
              : 'Ready to trade, connect, and grow your community.'
            }
          </Text>

          <TouchableOpacity style={wm.btn} onPress={onDone} activeOpacity={0.85}>
            {isSignup && (
              <Ionicons name="rocket" size={16} color="#fff" style={{ marginRight: 8 }} />
            )}
            <Text style={wm.btnText}>{isSignup ? 'Start Exploring' : "Let's Go"}</Text>
            {!isSignup && (
              <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 6 }} />
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const wm = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10,10,30,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    width: '100%',
    alignItems: 'center',
    paddingTop: 36,
    paddingBottom: 32,
    overflow: 'hidden',
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 16,
  },
  iconRing: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  eyebrow: {
    fontSize: 14, fontWeight: '600', color: '#888',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4,
  },
  name: {
    fontSize: 28, fontWeight: '800', color: '#1A1A1A',
    letterSpacing: -0.5, marginBottom: 16,
  },
  divider: {
    width: 40, height: 3, backgroundColor: PRIMARY,
    borderRadius: 2, marginBottom: 16, opacity: 0.4,
  },
  tagline: {
    fontSize: 16, color: '#444', textAlign: 'center',
    lineHeight: 24, marginBottom: 6,
  },
  brand: { color: PRIMARY, fontWeight: '800' },
  sub: {
    fontSize: 13, color: '#999', textAlign: 'center',
    lineHeight: 20, marginBottom: 28, paddingHorizontal: 16,
  },
  btn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: PRIMARY, paddingVertical: 14,
    paddingHorizontal: 36, borderRadius: 14,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
});

// ─── Auth Layout ───────────────────────────────────────────────────────────────
export default function AuthLayout() {
  const router = useRouter();
  const segments = useSegments();
  const navigationInProgressRef = useRef(false);

  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const [welcomeName, setWelcomeName] = useState('');
  const [welcomeType, setWelcomeType] = useState<'login' | 'signup'>('login');
  const pendingRouteRef = useRef<string | null>(null);

  const showWelcomeThen = (name: string, type: 'login' | 'signup', route: string) => {
    setWelcomeName(name);
    setWelcomeType(type);
    pendingRouteRef.current = route;
    setWelcomeVisible(true);
  };

  const handleWelcomeDone = () => {
    setWelcomeVisible(false);
    const route = pendingRouteRef.current;
    pendingRouteRef.current = null;
    if (route) {
      router.replace(route as any);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigationInProgressRef.current = false;
        return;
      }

      const currentRoute = segments[segments.length - 1];

      // ── STEP 1: Email not verified → always send to /verify ──────────────
      // Allow staying on verify, login, signup screens
      if (!user.emailVerified) {
        const safeRoutes = ['verify', 'login', 'signup'];
        if (!safeRoutes.includes(currentRoute)) {
          router.replace('/(auth)/verify');
        }
        navigationInProgressRef.current = false;
        return;
      }

      // ── STEP 2: Email verified → check Firestore onboarding state ────────
      try {
        await new Promise(resolve => setTimeout(resolve, 500));

        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);

        // Race condition: doc not written yet right after social signup
        if (!userDoc.exists()) {
          if (currentRoute !== 'verify') {
            router.replace('/(auth)/verify');
          }
          navigationInProgressRef.current = false;
          return;
        }

        let data = userDoc.data();

        // Backfill missing fields
        if (data && (data.termsAccepted === undefined || data.profileComplete === undefined)) {
          const updates: any = {};
          if (data.termsAccepted === undefined) updates.termsAccepted = false;
          if (data.profileComplete === undefined) updates.profileComplete = false;
          await setDoc(userDocRef, updates, { merge: true });
          data = { ...data, ...updates };
        }

        console.log('[AuthLayout] User check:', {
          uid: user.uid,
          emailVerified: user.emailVerified,
          termsAccepted: data?.termsAccepted,
          profileComplete: data?.profileComplete,
          currentRoute,
        });

        if (navigationInProgressRef.current) {
          console.log('[AuthLayout] Navigation already in progress, skipping');
          return;
        }

        // Check for a pending welcome signal
        const pending = welcomeState.consume();

        // Determine next route based on onboarding progress
        // Flow: verify → terms → profile-setup → home
        const specialAuthRoutes = ['ChangePasswordScreen'];
        const isSpecialRoute = specialAuthRoutes.includes(currentRoute);

        let nextRoute: string | null = null;

        if (!data?.termsAccepted && currentRoute !== 'terms') {
          // ── STEP 3: Terms not accepted yet ──
          nextRoute = '/(auth)/terms';
        } else if (data?.termsAccepted && !data?.profileComplete && currentRoute !== 'profile-setup') {
          // ── STEP 4: Profile not set up yet ──
          nextRoute = '/(auth)/profile-setup';
        } else if (data?.profileComplete && data?.termsAccepted && !isSpecialRoute) {
          // ── STEP 5: Fully onboarded → home ──
          nextRoute = '/';
        }

        if (!nextRoute) {
          console.log('[AuthLayout] No redirect needed');
          navigationInProgressRef.current = false;
          return;
        }

        navigationInProgressRef.current = true;

        // Show welcome modal only when going home AND a pending signal exists
        const isGoingHome = nextRoute === '/';

        if (pending && isGoingHome) {
          showWelcomeThen(pending.name, pending.type, nextRoute);
          setTimeout(() => { navigationInProgressRef.current = false; }, 800);
        } else {
          await router.replace(nextRoute as any);
          setTimeout(() => { navigationInProgressRef.current = false; }, 800);
        }
      } catch (err) {
        console.warn('[AuthLayout] Guard error:', err);
        navigationInProgressRef.current = false;
      }
    });

    return () => unsubscribe();
  }, [segments, router]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <WelcomeModal
        visible={welcomeVisible}
        name={welcomeName}
        type={welcomeType}
        onDone={handleWelcomeDone}
      />
    </>
  );
}