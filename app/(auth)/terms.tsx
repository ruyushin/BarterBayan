import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import React, { useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../../firebaseConfig';

const PRIMARY = '#2F2F6F';
const DANGER  = '#C0392B';
const BG      = '#FFFFFF';
const BORDER  = '#E0E0E0';
const TEXT    = '#1A1A1A';
const MUTED   = '#666666';

export default function TermsAndConditionsScreen() {
  const router = useRouter();

  const [agreeToTerms,     setAgreeToTerms]     = useState(false);
  const [isSubmitting,     setIsSubmitting]     = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [isSigningOut,     setIsSigningOut]     = useState(false);

  // Shake animation for the checkbox when user taps Accept without checking
  const shakeAnim    = useRef(new Animated.Value(0)).current;
  // Modal entrance animations
  const modalFade    = useRef(new Animated.Value(0)).current;
  const modalScale   = useRef(new Animated.Value(0.9)).current;

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue:  9, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -9, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue:  6, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue:  0, duration: 55, useNativeDriver: true }),
    ]).start();
  };

  const openDeclineModal = () => {
    setShowDeclineModal(true);
    Animated.parallel([
      Animated.timing(modalFade,  { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(modalScale, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 220 }),
    ]).start();
  };

  const closeDeclineModal = () => {
    Animated.parallel([
      Animated.timing(modalFade,  { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(modalScale, { toValue: 0.9, duration: 160, useNativeDriver: true }),
    ]).start(() => {
      setShowDeclineModal(false);
      modalFade.setValue(0);
      modalScale.setValue(0.9);
    });
  };

  // ── Accept ────────────────────────────────────────────────────────
  const handleAccept = async () => {
    if (!agreeToTerms) {
      triggerShake();
      return;
    }
    setIsSubmitting(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('No user found');
      await setDoc(doc(db, 'users', user.uid), { termsAccepted: true }, { merge: true });
      router.replace('/(auth)/profile-setup');
    } catch (error) {
      console.error('Error accepting terms:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Confirm decline: sign out → login ─────────────────────────────
  // termsAccepted stays false in Firestore, so if they log in again
  // the auth guard will send them straight back here.
  const handleConfirmDecline = async () => {
    setIsSigningOut(true);
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Sign-out error:', err);
    } finally {
      setIsSigningOut(false);
      setShowDeclineModal(false);
      router.replace('/(auth)/login');
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <MaterialIcons name="description" size={60} color={PRIMARY} />
          <Text style={styles.headerTitle}>Terms & Conditions</Text>
          <Text style={styles.headerSubtitle}>Please read carefully before continuing</Text>
        </View>

        {/* Terms content */}
        <View style={styles.termsContainer}>

          {/* ── Terms of Use ──────────────────────────────────────── */}
          <Text style={[styles.sectionTitle, { marginTop: 0, fontSize: 17 }]}>
            Terms of Use
          </Text>

          <Text style={styles.sectionTitle}>1. Use License</Text>
          <Text style={styles.sectionContent}>
            Permission is granted to temporarily download one copy of the materials on
            BarterBayan's website/app for personal, non-commercial transitory viewing only. This
            is the grant of a license, not a transfer of title. Under this license you may not:
          </Text>
          <Text style={styles.bullet}>• Modify or copy the materials</Text>
          <Text style={styles.bullet}>• Use the materials for any commercial purpose or public display</Text>
          <Text style={styles.bullet}>• Attempt to decompile or reverse engineer any software contained</Text>
          <Text style={styles.bullet}>• Remove any copyright or proprietary notations from the materials</Text>

          <Text style={styles.sectionTitle}>2. Disclaimer</Text>
          <Text style={styles.sectionContent}>
            The materials on BarterBayan's website/app are provided on an 'as is' basis.
            BarterBayan makes no warranties, expressed or implied, and hereby disclaims all other
            warranties including implied warranties of merchantability, fitness for a particular
            purpose, or non-infringement of intellectual property or other violation of rights.
          </Text>

          <Text style={styles.sectionTitle}>3. Limitations</Text>
          <Text style={styles.sectionContent}>
            In no event shall BarterBayan or its suppliers be liable for any damages (including
            damages for loss of data or profit, or due to business interruption) arising out of
            the use or inability to use the materials on BarterBayan's website/app.
          </Text>

          <Text style={styles.sectionTitle}>4. Accuracy of Materials</Text>
          <Text style={styles.sectionContent}>
            Materials appearing on BarterBayan could include technical, typographical, or
            photographic errors. BarterBayan does not warrant that any materials are accurate,
            complete, or current, and may make changes at any time without notice.
          </Text>

          <Text style={styles.sectionTitle}>5. Modifications</Text>
          <Text style={styles.sectionContent}>
            BarterBayan may revise these terms at any time without notice. By using this
            website/app you agree to be bound by the then-current version of these terms.
          </Text>

          <Text style={styles.sectionTitle}>6. Governing Law</Text>
          <Text style={styles.sectionContent}>
            These terms are governed by and construed in accordance with the laws of your
            jurisdiction, and you irrevocably submit to the exclusive jurisdiction of the courts
            in that location.
          </Text>

          {/* ── Privacy Policy ────────────────────────────────────── */}
          <Text style={[styles.sectionTitle, { marginTop: 32, fontSize: 17 }]}>
            Privacy Policy
          </Text>
          <Text style={styles.sectionContent}>
            Your privacy is important to us. This Privacy Policy explains how BarterBayan
            collects, uses, stores, and protects your personal information when you use our
            platform.
          </Text>

          <Text style={styles.sectionTitle}>7. Information We Collect</Text>
          <Text style={styles.sectionContent}>
            We may collect the following types of personal information:
          </Text>
          <Text style={styles.bullet}>• Full name and profile photo</Text>
          <Text style={styles.bullet}>• Email address and contact number</Text>
          <Text style={styles.bullet}>• Device information and IP address</Text>
          <Text style={styles.bullet}>• Location data (only when permitted by you)</Text>
          <Text style={styles.bullet}>• Transaction and barter activity history</Text>

          <Text style={styles.sectionTitle}>8. How We Use Your Information</Text>
          <Text style={styles.sectionContent}>
            The personal data we collect is used solely for the following purposes:
          </Text>
          <Text style={styles.bullet}>• To create and manage your BarterBayan account</Text>
          <Text style={styles.bullet}>• To facilitate barter and trade transactions between users</Text>
          <Text style={styles.bullet}>• To improve app features and user experience</Text>
          <Text style={styles.bullet}>• To send important service notifications</Text>
          <Text style={styles.bullet}>• To comply with applicable laws and regulations</Text>

          <Text style={styles.sectionTitle}>9. Data Sharing & Disclosure</Text>
          <Text style={styles.sectionContent}>
            BarterBayan does not sell, rent, or trade your personal information to third parties.
            We may share data only with trusted service providers (e.g. Firebase/Google) strictly
            necessary to operate the platform, or when required by law or court order.
          </Text>

          <Text style={styles.sectionTitle}>10. Data Retention</Text>
          <Text style={styles.sectionContent}>
            We retain your personal data only for as long as necessary to fulfill the purposes
            outlined in this policy, or as required by applicable law. You may request deletion
            of your account and associated data at any time by contacting us.
          </Text>

          <Text style={styles.sectionTitle}>11. Your Rights as a Data Subject</Text>
          <Text style={styles.sectionContent}>
            Under the Data Privacy Act of 2012 (Republic Act No. 10173) of the Philippines,
            you have the following rights regarding your personal data:
          </Text>
          <Text style={styles.bullet}>• Right to be informed — know how your data is collected and used</Text>
          <Text style={styles.bullet}>• Right to access — request a copy of your personal data we hold</Text>
          <Text style={styles.bullet}>• Right to rectification — correct inaccurate or outdated data</Text>
          <Text style={styles.bullet}>• Right to erasure — request deletion of your personal data</Text>
          <Text style={styles.bullet}>• Right to object — opt out of certain data processing activities</Text>
          <Text style={styles.bullet}>• Right to data portability — receive your data in a usable format</Text>
          <Text style={styles.bullet}>• Right to lodge a complaint — file a complaint with the National Privacy Commission (NPC)</Text>

          <Text style={styles.sectionTitle}>12. Data Privacy Act of 2012 (RA 10173)</Text>
          <Text style={styles.sectionContent}>
            BarterBayan is committed to full compliance with Republic Act No. 10173, known as
            the Data Privacy Act of 2012, and its Implementing Rules and Regulations. We process
            personal data only on lawful grounds, with your consent, and take reasonable
            technical and organizational measures to protect your information from unauthorized
            access, disclosure, alteration, or destruction.
          </Text>
          <Text style={styles.sectionContent}>
            If you believe your data privacy rights have been violated, you may contact the
            National Privacy Commission (NPC) at{' '}
            <Text style={{ color: PRIMARY }}>privacy.gov.ph</Text>.
          </Text>

          <Text style={styles.sectionTitle}>13. Cookies & Analytics</Text>
          <Text style={styles.sectionContent}>
            We may use analytics tools to understand app usage patterns. No personally
            identifiable information is shared through analytics. You may opt out through
            your device settings.
          </Text>

          <Text style={styles.sectionTitle}>14. Security</Text>
          <Text style={styles.sectionContent}>
            We implement industry-standard security measures including encrypted data
            transmission (HTTPS/TLS), secure authentication via Firebase, and access controls
            to protect your personal information. No method of transmission over the internet
            is 100% secure, and we cannot guarantee absolute security.
          </Text>

          <Text style={styles.sectionTitle}>15. Changes to This Privacy Policy</Text>
          <Text style={styles.sectionContent}>
            We may update this Privacy Policy from time to time. We will notify you of
            significant changes via the app or email. Continued use of BarterBayan after
            changes take effect constitutes your acceptance of the updated policy.
          </Text>

          <Text style={styles.sectionTitle}>16. Contact Us</Text>
          <Text style={styles.sectionContent}>
            For any privacy-related concerns, data requests, or questions about these terms,
            please reach out to us through the BarterBayan support channel within the app.
          </Text>

        </View>
      </ScrollView>

      {/* Agreement footer */}
      <View style={styles.footer}>
        <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setAgreeToTerms(v => !v)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, agreeToTerms && styles.checkboxOn]}>
              {agreeToTerms && <MaterialIcons name="check" size={16} color="#FFF" />}
            </View>
            <Text style={styles.checkboxLabel}>
              I have read and agree to the Terms & Conditions and Privacy Policy
            </Text>
          </TouchableOpacity>
        </Animated.View>

        <View style={styles.btnRow}>
          <TouchableOpacity
            style={styles.declineBtn}
            onPress={openDeclineModal}
            disabled={isSubmitting}
          >
            <Text style={styles.declineBtnText}>Decline</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.acceptBtn, !agreeToTerms && styles.acceptBtnOff]}
            onPress={handleAccept}
            disabled={isSubmitting}
            activeOpacity={0.85}
          >
            <Text style={styles.acceptBtnText}>
              {isSubmitting ? 'Saving…' : 'Accept & Continue'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Decline confirmation modal ────────────────────────────── */}
      <Modal
        transparent
        visible={showDeclineModal}
        animationType="none"
        onRequestClose={closeDeclineModal}
      >
        <View style={styles.overlay}>
          <Animated.View
            style={[
              styles.modalCard,
              { opacity: modalFade, transform: [{ scale: modalScale }] },
            ]}
          >
            {/* Icon */}
            <View style={styles.modalIconWrap}>
              <MaterialIcons name="gavel" size={34} color={DANGER} />
            </View>

            <Text style={styles.modalTitle}>Decline Terms & Conditions?</Text>
            <Text style={styles.modalBody}>
              Accepting our Terms & Conditions and Privacy Policy is required to use BarterBayan.
              If you decline:
            </Text>

            {/* Consequences */}
            {[
              'You will be signed out immediately',
              'Your account will stay inactive until you accept',
              'You can sign in again anytime and accept to continue',
            ].map((line, i) => (
              <View key={i} style={styles.consequenceRow}>
                <MaterialIcons name="remove-circle-outline" size={15} color={DANGER} />
                <Text style={styles.consequenceText}>{line}</Text>
              </View>
            ))}

            <View style={styles.divider} />

            {/* Go back — primary action, visually dominant */}
            <TouchableOpacity
              style={styles.goBackBtn}
              onPress={closeDeclineModal}
              disabled={isSigningOut}
            >
              <Text style={styles.goBackText}>Go Back & Review</Text>
            </TouchableOpacity>

            {/* Confirm decline — destructive, secondary */}
            <TouchableOpacity
              style={[styles.confirmDeclineBtn, isSigningOut && { opacity: 0.55 }]}
              onPress={handleConfirmDecline}
              disabled={isSigningOut}
            >
              <MaterialIcons name="logout" size={15} color="#FFF" />
              <Text style={styles.confirmDeclineText}>
                {isSigningOut ? 'Signing out…' : 'Decline & Sign Out'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    paddingTop: 32,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 210, // clears the fixed footer
  },

  // ── Header ──────────────────────────────────────────────────────
  header: {
    alignItems: 'center',
    marginBottom: 28,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: TEXT,
    marginTop: 12,
    marginBottom: 4,
  },
  headerSubtitle: { fontSize: 13, color: MUTED },

  // ── Terms text ───────────────────────────────────────────────────
  termsContainer: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: PRIMARY,
    marginTop: 20,
    marginBottom: 8,
  },
  sectionContent: {
    fontSize: 13,
    color: '#333',
    lineHeight: 21,
    marginBottom: 10,
  },
  bullet: {
    fontSize: 13,
    color: '#333',
    lineHeight: 20,
    marginLeft: 10,
    marginBottom: 4,
  },

  // ── Footer ───────────────────────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    padding: 20,
    paddingBottom: 34,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  checkbox: {
    width: 24, height: 24,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: PRIMARY,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxOn: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  checkboxLabel: {
    fontSize: 14,
    color: TEXT,
    fontWeight: '500',
    flex: 1,
    lineHeight: 20,
  },
  btnRow: { flexDirection: 'row', gap: 12 },
  declineBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#FDF2F2',
    borderWidth: 1,
    borderColor: '#F5C6C6',
    alignItems: 'center',
  },
  declineBtnText: { fontSize: 15, fontWeight: '600', color: DANGER },
  acceptBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: PRIMARY,
    alignItems: 'center',
  },
  acceptBtnOff: { backgroundColor: '#CCCCCC' },
  acceptBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },

  // ── Modal ────────────────────────────────────────────────────────
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.48)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: BG,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  modalIconWrap: {
    width: 66, height: 66,
    borderRadius: 33,
    backgroundColor: '#FDF2F2',
    borderWidth: 1.5,
    borderColor: '#F5C6C6',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: TEXT,
    textAlign: 'center',
    letterSpacing: -0.2,
    marginBottom: 8,
  },
  modalBody: {
    fontSize: 13,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 14,
  },
  consequenceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginBottom: 7,
    paddingHorizontal: 2,
  },
  consequenceText: {
    fontSize: 13,
    color: '#444',
    flex: 1,
    lineHeight: 19,
  },
  divider: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 16,
  },
  goBackBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  goBackText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  confirmDeclineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: DANGER,
    borderRadius: 12,
    paddingVertical: 13,
  },
  confirmDeclineText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});