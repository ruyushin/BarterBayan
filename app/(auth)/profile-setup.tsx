import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { doc, setDoc } from 'firebase/firestore';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../../firebaseConfig';

const { width } = Dimensions.get('window');
const STEPS = ['Name', 'Photo', 'Phone', 'Bio'];

const PRIMARY   = '#2F2F6F';
const SECONDARY = '#E74C3C';
const BG        = '#F7F5F2';
const CARD      = '#FFFFFF';
const BORDER    = '#E0DDD8';
const TEXT      = '#1A1A1A';
const MUTED     = '#888888';

const lettersOnly = (text: string) =>
  text.replace(/[^a-zA-ZÀ-ÖØ-öø-ÿÑñ\s\-'.]/g, '');

export default function ProfileSetupScreen() {
  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [cropLoading, setCropLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // ── Welcome modal state ─────────────────────────────────────────
  const [showWelcome, setShowWelcome] = useState(false);
  const welcomeFade  = useRef(new Animated.Value(0)).current;
  const welcomeScale = useRef(new Animated.Value(0.88)).current;

  const openWelcomeModal = () => {
    setShowWelcome(true);
    Animated.parallel([
      Animated.timing(welcomeFade,  { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(welcomeScale, {
        toValue: 1, useNativeDriver: true, damping: 16, stiffness: 200,
      }),
    ]).start();
  };

  const confirmWelcome = () => {
    Animated.parallel([
      Animated.timing(welcomeFade,  { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(welcomeScale, { toValue: 0.92, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      setShowWelcome(false);
      welcomeFade.setValue(0);
      welcomeScale.setValue(0.88);
      router.replace('/(tabs)');
    });
  };

  // ── Step logic ──────────────────────────────────────────────────
  const canProceed = () => {
    switch (step) {
      case 0: return firstName.trim().length > 0 && lastName.trim().length > 0;
      case 1: return photo !== null;
      case 2: return phone.length === 10;
      case 3: return true;
      default: return false;
    }
  };

  const goNext = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else handleFinish();
  };

  const goBack = () => {
    if (step > 0) setStep(s => s - 1);
  };

  const handleFinish = async () => {
    if (!auth.currentUser) {
      Alert.alert('Error', 'User not found. Please sign up again.');
      router.replace('/(auth)/signup');
      return;
    }

    setIsSaving(true);
    try {
      const user = auth.currentUser;
      const profileData = {
        email: user.email,
        firstName,
        middleName: middleName || null,
        lastName,
        photo: photo || null,
        avatarUrl: photo || null,
        phone: `+63${phone}`,
        bio,
        createdAt: new Date().toISOString(),
        rating: 5.0,
        tradeCount: 0,
        emailVerified: user.emailVerified,
        profileComplete: true,
      };

      await setDoc(doc(db, 'users', user.uid), profileData, { merge: true });

      // ── Show welcome modal instead of navigating directly ─────────
      openWelcomeModal();
    } catch (error: any) {
      console.error('Profile setup error:', error);
      Alert.alert('Error', error?.message || 'Failed to save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePhoneChange = (text: string) => {
    const digits = text.replace(/\D/g, '');
    if (digits.length <= 10) setPhone(digits);
  };

  const processImage = async (uri: string) => {
    setCropLoading(true);
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 400, height: 400 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
      );
      setPhoto(result.uri);
    } catch (error) {
      console.error('Image processing error:', error);
      setPhoto(uri);
    } finally {
      setCropLoading(false);
    }
  };

  const pickFromGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please enable media library access in settings.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (!result.canceled && result.assets?.[0]) {
        await processImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Gallery picker error:', error);
      Alert.alert('Error', 'Failed to pick image from gallery.');
    }
  };

  const isSkippable = step === 3;

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <StepWrapper title="What's your name?" sub="This is required — it's how others will know you.">
            <FieldGroup label="First Name *">
              <TextInput
                style={s.input}
                placeholder="e.g. Juan"
                placeholderTextColor={MUTED}
                value={firstName}
                onChangeText={t => setFirstName(lettersOnly(t))}
                autoCapitalize="words"
                autoFocus
              />
            </FieldGroup>
            <FieldGroup label="Middle Name (Optional)">
              <TextInput
                style={s.input}
                placeholder="e.g. Santos"
                placeholderTextColor={MUTED}
                value={middleName}
                onChangeText={t => setMiddleName(lettersOnly(t))}
                autoCapitalize="words"
              />
            </FieldGroup>
            <FieldGroup label="Last Name *">
              <TextInput
                style={s.input}
                placeholder="e.g. dela Cruz"
                placeholderTextColor={MUTED}
                value={lastName}
                onChangeText={t => setLastName(lettersOnly(t))}
                autoCapitalize="words"
              />
            </FieldGroup>
            <View style={s.requiredNote}>
              <Ionicons name="information-circle-outline" size={14} color={MUTED} />
              <Text style={s.requiredNoteText}>First and Last name are required to continue.</Text>
            </View>
          </StepWrapper>
        );

      case 1:
        return (
          <StepWrapper title="Add a profile photo" sub="Cropped to 1:1 square. You can change this later.">
            <View style={s.avatarRing}>
              {cropLoading
                ? <ActivityIndicator size="large" color={PRIMARY} />
                : photo
                  ? <Image source={{ uri: photo }} style={s.avatar} />
                  : <Ionicons name="person-circle" size={60} color={PRIMARY} />
              }
            </View>
            <TouchableOpacity style={s.photoBtnFull} onPress={pickFromGallery} activeOpacity={0.8}>
              <Ionicons name="image" size={26} color={PRIMARY} />
              <Text style={s.photoBtnLabel}>Choose from Gallery</Text>
            </TouchableOpacity>
            <Text style={s.cropNote}>
              Drag and pinch to reposition your photo after selecting.
            </Text>
          </StepWrapper>
        );

      case 2:
        return (
          <StepWrapper title="What's your phone number?" sub="For account recovery and important notifications.">
            <FieldGroup label="Mobile Number">
              <View style={s.phoneRow}>
                <View style={s.countryBadge}>
                  <Ionicons name="globe" size={18} color={PRIMARY} />
                  <Text style={s.countryCode}>+63</Text>
                </View>
                <TextInput
                  style={[s.input, s.phoneInput]}
                  placeholder="9171234567"
                  placeholderTextColor={MUTED}
                  value={phone}
                  onChangeText={handlePhoneChange}
                  keyboardType="number-pad"
                  maxLength={10}
                  autoFocus
                />
              </View>
              <Text style={s.phoneHint}>{phone.length}/10 digits</Text>
              {phone.length > 0 && (
                <View style={s.previewBox}>
                  <Text style={s.previewLabel}>Full number: </Text>
                  <Text style={s.previewValue}>
                    +63 {phone.slice(0,3)}{phone.length>3?' ':''}{phone.slice(3,6)}{phone.length>6?' ':''}{phone.slice(6)}
                  </Text>
                </View>
              )}
            </FieldGroup>
          </StepWrapper>
        );

      case 3:
        return (
          <StepWrapper title="Tell us about yourself" sub="Optional — shown on your public profile.">
            <FieldGroup label="Bio">
              <TextInput
                style={[s.input, s.bioInput]}
                placeholder="e.g. Coffee lover, based in QC, open to connect..."
                placeholderTextColor={MUTED}
                value={bio}
                onChangeText={t => t.length <= 160 && setBio(t)}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                autoFocus
              />
              <Text style={s.charCount}>{bio.length}/160</Text>
            </FieldGroup>
          </StepWrapper>
        );
    }
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.header}>
        {step > 0
          ? <TouchableOpacity onPress={goBack} style={s.backBtn}>
              <Ionicons name="chevron-back" size={22} color={TEXT} />
            </TouchableOpacity>
          : <View style={{ width: 36 }} />
        }
        <View style={s.pills}>
          {STEPS.map((_, i) => (
            <View key={i} style={[s.pill, i <= step ? s.pillOn : s.pillOff]} />
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {renderStep()}
      </ScrollView>

      <View style={s.footer}>
        {isSkippable ? (
          <TouchableOpacity onPress={handleFinish} style={s.skipBtn} disabled={isSaving}>
            <Text style={s.skipText}>Skip</Text>
          </TouchableOpacity>
        ) : (
          <View style={s.skipBtn} />
        )}
        <TouchableOpacity
          style={[s.nextBtn, (!canProceed() || isSaving) && s.nextBtnOff]}
          onPress={goNext}
          disabled={!canProceed() || isSaving}
          activeOpacity={0.85}
        >
          <Text style={s.nextBtnText}>
            {isSaving ? 'Saving...' : (step === STEPS.length - 1 ? 'Finish' : 'Continue')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Welcome Modal — fires after profile is saved ─────────── */}
      <Modal
        transparent
        visible={showWelcome}
        animationType="none"
        onRequestClose={confirmWelcome}
      >
        <View style={s.modalOverlay}>
          <Animated.View
            style={[
              s.modalCard,
              { opacity: welcomeFade, transform: [{ scale: welcomeScale }] },
            ]}
          >
            {/* Celebration icon */}
            <View style={s.modalIconWrap}>
              <MaterialIcons name="celebration" size={42} color={PRIMARY} />
            </View>

            <Text style={s.modalTitle}>You're all set!</Text>
            <Text style={s.modalSubtitle}>Welcome to BarterBayan</Text>
            <Text style={s.modalBody}>
              Your profile is complete. Start exploring items to trade, connect with your
              community, and make your first barter!
            </Text>

            {/* Quick-start tips */}
            <View style={s.tipsCard}>
              {([
                { icon: 'search',           text: 'Browse items on the Explore tab' },
                { icon: 'add-circle',       text: 'List your first item to trade' },
                { icon: 'people',           text: 'Connect with traders near you' },
              ] as const).map(({ icon, text }, i) => (
                <View key={i} style={s.tipRow}>
                  <View style={s.tipDot}>
                    <Ionicons name={icon} size={14} color={CARD} />
                  </View>
                  <Text style={s.tipText}>{text}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={s.modalBtn}
              onPress={confirmWelcome}
              activeOpacity={0.85}
            >
              <Text style={s.modalBtnText}>Start Exploring</Text>
              <MaterialIcons name="arrow-forward" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function StepWrapper({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <View style={s.stepWrap}>
      <Text style={s.title}>{title}</Text>
      <Text style={s.sub}>{sub}</Text>
      {children}
    </View>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.fieldGroup}>
      <Text style={s.label}>{label}</Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: {
    paddingTop: Platform.OS === 'ios' ? 56 : 36,
    paddingHorizontal: 24, paddingBottom: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: BG,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  pills: { flex: 1, flexDirection: 'row', gap: 6 },
  pill:  { flex: 1, height: 4, borderRadius: 2 },
  pillOn:  { backgroundColor: PRIMARY },
  pillOff: { backgroundColor: BORDER },

  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 24 },
  stepWrap: { paddingTop: 28 },
  title: { fontSize: 26, fontWeight: '800', color: TEXT, letterSpacing: -0.5, marginBottom: 6 },
  sub: { fontSize: 14, color: MUTED, marginBottom: 32, lineHeight: 20 },

  fieldGroup: { marginBottom: 20 },
  label: {
    fontSize: 11, fontWeight: '700', color: MUTED,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
  },
  input: {
    backgroundColor: CARD, borderWidth: 1.5, borderColor: BORDER,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: TEXT,
  },

  requiredNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 4, paddingHorizontal: 4,
  },
  requiredNoteText: { fontSize: 12, color: MUTED, flex: 1 },

  avatarRing: {
    alignSelf: 'center', width: 140, height: 140, borderRadius: 70,
    backgroundColor: '#E8E4DF', borderWidth: 3, borderColor: PRIMARY,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 28, overflow: 'hidden',
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 8,
  },
  avatar: { width: 140, height: 140, borderRadius: 70 },
  photoBtnFull: {
    backgroundColor: CARD, borderWidth: 1.5, borderColor: BORDER,
    borderRadius: 14, paddingVertical: 18, alignItems: 'center', gap: 6, marginBottom: 16,
  },
  photoBtnLabel: { fontSize: 14, fontWeight: '600', color: TEXT },
  cropNote: { fontSize: 12, color: MUTED, textAlign: 'center', lineHeight: 18 },

  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  countryBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: CARD, borderWidth: 1.5, borderColor: BORDER,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14,
  },
  countryCode: { fontSize: 16, fontWeight: '700', color: TEXT },
  phoneInput: { flex: 1, letterSpacing: 1.5 },
  phoneHint: { fontSize: 12, color: MUTED, marginTop: 6, marginLeft: 4 },
  previewBox: {
    marginTop: 12, backgroundColor: `${PRIMARY}15`, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center',
  },
  previewLabel: { fontSize: 12, color: PRIMARY, fontWeight: '600' },
  previewValue: { fontSize: 15, color: PRIMARY, fontWeight: '800', letterSpacing: 1 },

  bioInput: { height: 130, paddingTop: 14 },
  charCount: { fontSize: 12, color: MUTED, textAlign: 'right', marginTop: 6 },

  footer: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 24, paddingVertical: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    backgroundColor: BG, borderTopWidth: 1, borderTopColor: BORDER, gap: 12,
  },
  skipBtn: { paddingHorizontal: 16, paddingVertical: 14 },
  skipText: { fontSize: 15, color: MUTED, fontWeight: '600' },
  nextBtn: {
    flex: 1, backgroundColor: PRIMARY, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  nextBtnOff: { backgroundColor: '#ccc', shadowOpacity: 0, elevation: 0 },
  nextBtnText: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },

  // ── Welcome modal ───────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: CARD,
    borderRadius: 22,
    padding: 26,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 14,
  },
  modalIconWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: `${PRIMARY}10`,
    borderWidth: 2,
    borderColor: `${PRIMARY}20`,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 18,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: TEXT,
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: PRIMARY,
    textAlign: 'center',
    marginBottom: 12,
  },
  modalBody: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
  },
  tipsCard: {
    backgroundColor: BG,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: BORDER,
  },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tipDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipText: { fontSize: 13, color: TEXT, fontWeight: '500', flex: 1 },
  modalBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 14,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  modalBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});