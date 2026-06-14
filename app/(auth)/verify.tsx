import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import {
  deleteUser,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  signOut,
} from 'firebase/auth';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth } from '../../firebaseConfig';

const PRIMARY  = '#2F2F6F';
const BG       = '#F7F5F2';
const CARD     = '#FFFFFF';
const BORDER   = '#E0DDD8';
const TEXT     = '#1A1A1A';
const MUTED    = '#888888';
const SUCCESS  = '#27AE60';
const WARNING  = '#F59E0B';

const POLL_MS         = 3000;
const RESEND_COOLDOWN = 60;

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.slice(0, Math.min(3, local.length));
  const stars   = '*'.repeat(Math.max(local.length - 3, 2));
  return `${visible}${stars}@${domain}`;
}

export default function VerifyEmailScreen() {
  const router = useRouter();

  const [user,       setUser]       = useState<any>(null);
  const [isBooting,  setIsBooting]  = useState(true);
  const [isVerified, setIsVerified] = useState(false);
  const [isSending,  setIsSending]  = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [countdown,  setCountdown]  = useState(0);

  // ── Animations ───────────────────────────────────────────────────
  const pulseAnim   = useRef(new Animated.Value(1)).current;
  const successAnim = useRef(new Animated.Value(0)).current;
  const dotOpacity  = useRef(new Animated.Value(1)).current;

  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const startPulse = () => {
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.1, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    );
    pulseLoop.current.start();
  };
  const stopPulse = () => { pulseLoop.current?.stop(); pulseAnim.setValue(1); };

  const dotLoop = useRef<Animated.CompositeAnimation | null>(null);
  const startDotBlink = () => {
    dotLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(dotOpacity, { toValue: 0.2, duration: 600, useNativeDriver: true }),
        Animated.timing(dotOpacity, { toValue: 1.0, duration: 600, useNativeDriver: true }),
      ])
    );
    dotLoop.current.start();
  };

  useEffect(() => {
    startPulse();
    startDotBlink();
    return () => { stopPulse(); dotLoop.current?.stop(); };
  }, []);

  // ── Auth listener ─────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace('/(auth)/login');
        return;
      }
      setUser(u);
      try {
        await reload(u);
        if (u.emailVerified) triggerSuccess();
      } catch (_) {}
      setIsBooting(false);
    });
    return unsub;
  }, []);

  // ── Polling — checks every 3s if user has clicked the link ───────
  useEffect(() => {
    if (!user || isVerified) return;
    const id = setInterval(async () => {
      try {
        setIsChecking(true);
        await reload(user);
        if (user.emailVerified) triggerSuccess();
      } catch (_) {}
      finally { setIsChecking(false); }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [user, isVerified]);

  // ── Resend countdown ──────────────────────────────────────────────
  useEffect(() => {
    if (countdown <= 0) return;
    const id = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  // ── Success ───────────────────────────────────────────────────────
  const triggerSuccess = () => {
    stopPulse();
    setIsVerified(true);
    Animated.spring(successAnim, {
      toValue: 1, useNativeDriver: true,
      damping: 12, stiffness: 180,
    }).start();
    setTimeout(() => router.replace('/(auth)/terms'), 1800);
  };

  // ── Resend ────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (!user || isSending || countdown > 0) return;
    setIsSending(true);
    try {
      await sendEmailVerification(user);
      setCountdown(RESEND_COOLDOWN);
    } catch (err: any) {
      const tooMany = err?.code === 'auth/too-many-requests';
      Alert.alert(
        tooMany ? 'Too Many Attempts' : 'Error',
        tooMany
          ? 'Firebase has temporarily blocked email sending. Please wait a few minutes.'
          : err?.message || 'Failed to resend verification email.'
      );
      if (tooMany) setCountdown(120);
    } finally { setIsSending(false); }
  };

  // ── Cancel ────────────────────────────────────────────────────────
  const handleCancel = () => {
  Alert.alert(
    'Cancel Registration',
    'Your unverified account will be permanently deleted. You can sign up again anytime.',
    [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Delete & Exit',
        style: 'destructive',
        onPress: async () => {
          const currentUser = auth.currentUser;
          if (!currentUser) {
            // Already signed out — onAuthStateChanged will navigate
            return;
          }

          try {
            await deleteUser(currentUser);
            // onAuthStateChanged fires → router.replace('/(auth)/login')
          } catch (err: any) {
            if (err?.code === 'auth/requires-recent-login') {
              // Can't delete — sign out instead and warn the user
              Alert.alert(
                'Session Expired',
                'We could not delete your account automatically. Please sign up again to complete registration.',
                [{ text: 'OK' }]
              );
            } else {
              console.warn('deleteUser failed:', err?.message);
            }
            // Fall back to sign-out so the user isn't stuck
            try {
              await signOut(auth);
              // onAuthStateChanged fires → router.replace('/(auth)/login')
            } catch (signOutErr: any) {
              console.warn('signOut failed:', signOutErr?.message);
              // Force navigation as last resort
              router.replace('/(auth)/login');
            }
          }
        },
      },
    ]
  );
};

  // ── Loading splash ────────────────────────────────────────────────
  if (isBooting) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </View>
    );
  }

  // ── Success state ─────────────────────────────────────────────────
  if (isVerified) {
    return (
      <View style={[styles.root, styles.center]}>
        <Animated.View
          style={[
            styles.successRing,
            { transform: [{ scale: successAnim }], opacity: successAnim },
          ]}
        >
          <MaterialIcons name="check-circle" size={72} color={SUCCESS} />
        </Animated.View>
        <Text style={styles.successTitle}>Email Verified!</Text>
        <Text style={styles.successSub}>Proceeding to Terms & Conditions…</Text>
        <ActivityIndicator size="small" color={MUTED} style={{ marginTop: 16 }} />
      </View>
    );
  }

  // ── Main state ────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <View style={styles.bgCircle} />

      <View style={styles.inner}>
        {/* Envelope */}
        <Animated.View style={[styles.iconWrap, { transform: [{ scale: pulseAnim }] }]}>
          <MaterialIcons name="mark-email-unread" size={52} color={PRIMARY} />
        </Animated.View>

        {/* Heading */}
        <Text style={styles.title}>Check Your Inbox</Text>
        <Text style={styles.subtitle}>We sent a verification link to</Text>

        {/* Masked email badge */}
        <View style={styles.emailBadge}>
          <MaterialIcons name="email" size={15} color={PRIMARY} />
          <Text style={styles.emailText}>
            {user?.email ? maskEmail(user.email) : 'your email'}
          </Text>
        </View>

        {/* Steps */}
        <View style={styles.stepsCard}>
          {([
            { icon: 'inbox',     text: "Open your email app", warning: false },
            { icon: 'touch-app', text: "Click the verification link", warning: false },
            { icon: 'autorenew', text: "We'll detect it automatically — no action needed", warning: false },
          ] as const).map(({ icon, text, warning }, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepNum}>{i + 1}</Text>
              </View>
              <MaterialIcons name={icon} size={17} color={PRIMARY} style={styles.stepIcon} />
              <Text style={styles.stepText}>{text}</Text>
            </View>
          ))}

          {/* Divider */}
          <View style={styles.stepDivider} />

          {/* Spam tip */}
          <View style={styles.spamTip}>
            <MaterialIcons name="warning-amber" size={16} color={WARNING} />
            <Text style={styles.spamTipText}>
              <Text style={styles.spamTipBold}>Can't find it?</Text>
              {' '}Check your{' '}
              <Text style={styles.spamTipBold}>Spam</Text>
              {' '}or{' '}
              <Text style={styles.spamTipBold}>Junk</Text>
              {' '}folder — verification emails sometimes land there.
            </Text>
          </View>
        </View>

        {/* Live status */}
        <View style={styles.statusRow}>
          <Animated.View
            style={[
              styles.statusDot,
              { opacity: dotOpacity },
              isChecking && styles.statusDotActive,
            ]}
          />
          <Text style={styles.statusText}>
            {isChecking ? 'Checking verification status…' : 'Listening for verification…'}
          </Text>
        </View>

        {/* Resend */}
        <TouchableOpacity
          style={[styles.resendBtn, (isSending || countdown > 0) && styles.resendBtnOff]}
          onPress={handleResend}
          disabled={isSending || countdown > 0}
          activeOpacity={0.75}
        >
          {isSending
            ? <ActivityIndicator size="small" color={MUTED} />
            : <MaterialIcons name="send" size={15} color={countdown > 0 ? MUTED : PRIMARY} />
          }
          <Text style={[styles.resendText, (isSending || countdown > 0) && styles.resendTextOff]}>
            {isSending
              ? 'Sending…'
              : countdown > 0
              ? `Resend in ${countdown}s`
              : 'Resend Verification Email'}
          </Text>
        </TouchableOpacity>

        {/* Cancel */}
        <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
          <Text style={styles.cancelText}>Cancel registration</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  center: { justifyContent: 'center', alignItems: 'center' },

  bgCircle: {
    position:        'absolute',
    top:             -100,
    right:           -80,
    width:           300,
    height:          300,
    borderRadius:    150,
    backgroundColor: `${PRIMARY}08`,
  },

  inner: {
    flex:              1,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: 28,
    paddingBottom:     40,
  },

  iconWrap: {
    width:           108,
    height:          108,
    borderRadius:    54,
    backgroundColor: `${PRIMARY}10`,
    borderWidth:     2,
    borderColor:     `${PRIMARY}20`,
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    28,
  },

  title: {
    fontSize:      27,
    fontWeight:    '800',
    color:         TEXT,
    letterSpacing: -0.4,
    marginBottom:  8,
    textAlign:     'center',
  },
  subtitle: {
    fontSize:     14,
    color:        MUTED,
    marginBottom: 10,
    textAlign:    'center',
  },

  emailBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    backgroundColor:   `${PRIMARY}10`,
    borderRadius:      20,
    paddingHorizontal: 14,
    paddingVertical:   8,
    marginBottom:      28,
  },
  emailText: {
    fontSize:      14,
    fontWeight:    '700',
    color:         PRIMARY,
    letterSpacing: 0.2,
  },

  stepsCard: {
    width:             '100%',
    backgroundColor:   CARD,
    borderRadius:      16,
    borderWidth:       1,
    borderColor:       BORDER,
    paddingHorizontal: 20,
    paddingVertical:   18,
    gap:               16,
    marginBottom:      20,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems:    'center',
  },
  stepBadge: {
    width:           22,
    height:          22,
    borderRadius:    11,
    backgroundColor: PRIMARY,
    alignItems:      'center',
    justifyContent:  'center',
    marginRight:     10,
  },
  stepNum:  { fontSize: 11, fontWeight: '800', color: CARD },
  stepIcon: { marginRight: 10 },
  stepText: { fontSize: 13, color: TEXT, flex: 1, lineHeight: 19 },

  stepDivider: {
    height:          1,
    backgroundColor: BORDER,
    marginVertical:  2,
  },

  spamTip: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    gap:             8,
    backgroundColor: `${WARNING}12`,
    borderRadius:    10,
    padding:         12,
  },
  spamTipText: {
    flex:       1,
    fontSize:   12,
    color:      TEXT,
    lineHeight: 18,
  },
  spamTipBold: {
    fontWeight: '700',
    color:      TEXT,
  },

  statusRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
    marginBottom:  24,
  },
  statusDot: {
    width:           8,
    height:          8,
    borderRadius:    4,
    backgroundColor: MUTED,
  },
  statusDotActive: { backgroundColor: SUCCESS },
  statusText: { fontSize: 12, color: MUTED },

  resendBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             8,
    width:           '100%',
    borderWidth:     1.5,
    borderColor:     PRIMARY,
    borderRadius:    12,
    paddingVertical: 13,
    justifyContent:  'center',
    marginBottom:    14,
  },
  resendBtnOff:  { borderColor: BORDER },
  resendText:    { fontSize: 15, fontWeight: '700', color: PRIMARY },
  resendTextOff: { color: MUTED },

  cancelBtn:  { paddingVertical: 10 },
  cancelText: { fontSize: 13, color: MUTED, textDecorationLine: 'underline' },

  // Success
  successRing: {
    width:           130,
    height:          130,
    borderRadius:    65,
    backgroundColor: '#EAF9EE',
    borderWidth:     2,
    borderColor:     `${SUCCESS}40`,
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    24,
  },
  successTitle: {
    fontSize:      28,
    fontWeight:    '800',
    color:         TEXT,
    marginBottom:  8,
    letterSpacing: -0.4,
  },
  successSub: { fontSize: 14, color: MUTED },
});