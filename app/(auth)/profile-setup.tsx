import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { doc, setDoc } from 'firebase/firestore';
import React, { useCallback, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { auth, db } from '../../firebaseConfig';

/**
 * Profile Setup Screen - Expo Router Route
 * Place this file at: app/(auth)/profile-setup.tsx
 *
 * Required packages:
 *   npx expo install expo-image-picker expo-image-manipulator
 *
 * Replace GOOGLE_PLACES_API_KEY with your key for live location suggestions.
 * Get one at: https://console.cloud.google.com → Places API
 */

const GOOGLE_PLACES_API_KEY = 'YOUR_GOOGLE_PLACES_API_KEY';

const { width } = Dimensions.get('window');
const STEPS = ['Name', 'Photo', 'Phone', 'Location', 'Bio'];

const RED  = '#B8202A';
const BLUE = '#1C3B8C';
const BG   = '#F7F5F2';
const CARD = '#FFFFFF';
const BORDER = '#E0DDD8';
const TEXT = '#1A1A1A';
const MUTED = '#888888';

// ─── Main screen (Expo Router page) ──────────────────────────────────────────
export default function ProfileSetupScreen() {
  const [step, setStep] = useState(0);

  const [firstName, setFirstName]         = useState('');
  const [lastName,  setLastName]          = useState('');
  const [photo,     setPhoto]             = useState<string | null>(null);
  const [phone,     setPhone]             = useState('');
  const [location,  setLocation]          = useState('');
  const [locationPlaceId, setLocationPlaceId] = useState<string | null>(null);
  const [bio,       setBio]               = useState('');

  const [locationQuery,       setLocationQuery]       = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState<any[]>([]);
  const [loadingLocations,    setLoadingLocations]    = useState(false);
  const [cropLoading,         setCropLoading]         = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const locationDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Validation ──────────────────────────────────────────────────────────
  const canProceed = () => {
    switch (step) {
      case 0: return firstName.trim().length > 0 && lastName.trim().length > 0;
      case 1: return photo !== null;
      case 2: return phone.length === 10;
      case 3: return location.trim().length > 0;
      case 4: return true; // bio is optional
      default: return false;
    }
  };

  const goNext = () => {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
    } else {
      handleFinish();
    }
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
        username: user.email?.split('@')[0],
        firstName,
        lastName,
        photo: photo || null,
        phone: `+63${phone}`,
        location,
        locationPlaceId,
        bio,
        createdAt: new Date().toISOString(),
        rating: 5.0,
        tradeCount: 0,
        emailVerified: user.emailVerified,
      };

      // Save to Firestore
      await setDoc(doc(db, 'users', user.uid), profileData);

      // Navigate to verification or home
      router.replace('/(auth)/verify');
    } catch (error: any) {
      console.error('Profile setup error:', error);
      Alert.alert('Error', error?.message || 'Failed to save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Phone ───────────────────────────────────────────────────────────────
  const handlePhoneChange = (text: string) => {
    const digits = text.replace(/\D/g, '');
    if (digits.length <= 10) setPhone(digits);
  };

  // ── Image picker ────────────────────────────────────────────────────────
  const processImage = async (uri: string) => {
    setCropLoading(true);
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 400, height: 400 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
      );
      setPhoto(result.uri);
    } catch {
      setPhoto(uri);
    } finally {
      setCropLoading(false);
    }
  };

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets?.[0]) {
      await processImage(result.assets[0].uri);
    }
  };

  const pickFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets?.[0]) {
      await processImage(result.assets[0].uri);
    }
  };

  // ── Location autocomplete ───────────────────────────────────────────────
  const fetchSuggestions = useCallback(async (text: string) => {
    if (text.length < 2) { setLocationSuggestions([]); return; }
    setLoadingLocations(true);
    try {
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}&components=country:ph&key=${GOOGLE_PLACES_API_KEY}`;
      const res  = await fetch(url);
      const data = await res.json();
      setLocationSuggestions(data.predictions || []);
    } catch {
      setLocationSuggestions([]);
    } finally {
      setLoadingLocations(false);
    }
  }, []);

  const handleLocationChange = (text: string) => {
    setLocationQuery(text);
    setLocation(text);
    setLocationPlaceId(null);
    if (locationDebounce.current) clearTimeout(locationDebounce.current);
    locationDebounce.current = setTimeout(() => fetchSuggestions(text), 350);
  };

  const selectLocation = (prediction: any) => {
    const desc = prediction.description;
    setLocation(desc);
    setLocationQuery(desc);
    setLocationPlaceId(prediction.place_id);
    setLocationSuggestions([]);
  };

  // ── Step renderer ───────────────────────────────────────────────────────
  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <StepWrapper title="What's your name?" sub="This is how others will see you.">
            <FieldGroup label="First Name">
              <TextInput style={s.input} placeholder="e.g. Juan" placeholderTextColor={MUTED}
                value={firstName} onChangeText={setFirstName} autoCapitalize="words" autoFocus />
            </FieldGroup>
            <FieldGroup label="Last Name">
              <TextInput style={s.input} placeholder="e.g. dela Cruz" placeholderTextColor={MUTED}
                value={lastName} onChangeText={setLastName} autoCapitalize="words" />
            </FieldGroup>
          </StepWrapper>
        );

      case 1:
        return (
          <StepWrapper title="Add a profile photo" sub="Cropped to 1:1 square. You can change this later.">
            <View style={s.avatarRing}>
              {cropLoading
                ? <ActivityIndicator size="large" color={RED} />
                : photo
                  ? <Image source={{ uri: photo }} style={s.avatar} />
                  : <Text style={s.avatarIcon}>👤</Text>
              }
            </View>
            <View style={s.photoRow}>
              <TouchableOpacity style={s.photoBtn} onPress={pickFromGallery} activeOpacity={0.8}>
                <Text style={s.photoBtnIcon}>🖼️</Text>
                <Text style={s.photoBtnLabel}>Gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.photoBtn} onPress={pickFromCamera} activeOpacity={0.8}>
                <Text style={s.photoBtnIcon}>📷</Text>
                <Text style={s.photoBtnLabel}>Camera</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.cropNote}>
              Use the crop tool that appears after selecting to frame your shot.
            </Text>
          </StepWrapper>
        );

      case 2:
        return (
          <StepWrapper title="Your phone number" sub="Used for verification and account recovery.">
            <FieldGroup label="Mobile Number">
              <View style={s.phoneRow}>
                <View style={s.countryBadge}>
                  <Text style={s.countryFlag}>🇵🇭</Text>
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
          <StepWrapper title="Where are you located?" sub="Helps you connect with people nearby.">
            <FieldGroup label="City / Area">
              <View style={s.locationRow}>
                <Text style={s.locationPin}>📍</Text>
                <TextInput
                  style={[s.input, s.locationInput]}
                  placeholder="Search city or barangay..."
                  placeholderTextColor={MUTED}
                  value={locationQuery}
                  onChangeText={handleLocationChange}
                  autoFocus
                />
                {loadingLocations && <ActivityIndicator size="small" color={RED} style={{ marginRight: 12 }} />}
              </View>

              {locationSuggestions.length > 0 && (
                <View style={s.suggestionBox}>
                  {locationSuggestions.map((item, idx) => (
                    <TouchableOpacity
                      key={item.place_id}
                      style={[s.suggestionItem, idx < locationSuggestions.length - 1 && s.suggestionDivider]}
                      onPress={() => selectLocation(item)}
                      activeOpacity={0.75}
                    >
                      <Text style={s.suggestionMain}>
                        {item.structured_formatting?.main_text || item.description}
                      </Text>
                      {item.structured_formatting?.secondary_text
                        ? <Text style={s.suggestionSub}>{item.structured_formatting.secondary_text}</Text>
                        : null}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {GOOGLE_PLACES_API_KEY === 'YOUR_GOOGLE_PLACES_API_KEY' && (
                <Text style={s.apiWarning}>⚠️ Add your Google Places API key for live suggestions.</Text>
              )}
            </FieldGroup>
          </StepWrapper>
        );

      case 4:
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

  // ── Layout ──────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

      {/* Progress bar + back */}
      <View style={s.header}>
        {step > 0
          ? <TouchableOpacity onPress={goBack} style={s.backBtn}>
              <Text style={s.backArrow}>←</Text>
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

      {/* Footer */}
      <View style={s.footer}>
        {step === 4 && (
          <TouchableOpacity onPress={handleFinish} style={s.skipBtn} disabled={isSaving}>
            <Text style={s.skipText}>Skip</Text>
          </TouchableOpacity>
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

    </KeyboardAvoidingView>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

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

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  header: {
    paddingTop: Platform.OS === 'ios' ? 56 : 36,
    paddingHorizontal: 24,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: BG,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  backArrow: { fontSize: 18, color: TEXT },
  pills: { flex: 1, flexDirection: 'row', gap: 6 },
  pill:  { flex: 1, height: 4, borderRadius: 2 },
  pillOn:  { backgroundColor: RED },
  pillOff: { backgroundColor: BORDER },

  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 24 },

  stepWrap: { paddingTop: 28 },
  title: {
    fontSize: 26, fontWeight: '800', color: TEXT,
    letterSpacing: -0.5, marginBottom: 6,
  },
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

  // Photo
  avatarRing: {
    alignSelf: 'center', width: 140, height: 140, borderRadius: 70,
    backgroundColor: '#E8E4DF', borderWidth: 3, borderColor: RED,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 28, overflow: 'hidden',
    shadowColor: RED, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 8,
  },
  avatar:     { width: 140, height: 140, borderRadius: 70 },
  avatarIcon: { fontSize: 56 },
  photoRow:   { flexDirection: 'row', gap: 16, marginBottom: 16 },
  photoBtn: {
    flex: 1, backgroundColor: CARD, borderWidth: 1.5, borderColor: BORDER,
    borderRadius: 14, paddingVertical: 18, alignItems: 'center', gap: 6,
  },
  photoBtnIcon:  { fontSize: 26 },
  photoBtnLabel: { fontSize: 14, fontWeight: '600', color: TEXT },
  cropNote: { fontSize: 12, color: MUTED, textAlign: 'center', lineHeight: 18 },

  // Phone
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  countryBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: CARD, borderWidth: 1.5, borderColor: BORDER,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14,
  },
  countryFlag: { fontSize: 20 },
  countryCode: { fontSize: 16, fontWeight: '700', color: TEXT },
  phoneInput:  { flex: 1, letterSpacing: 1.5 },
  phoneHint:   { fontSize: 12, color: MUTED, marginTop: 6, marginLeft: 4 },
  previewBox: {
    marginTop: 12, backgroundColor: `${BLUE}15`, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center',
  },
  previewLabel: { fontSize: 12, color: BLUE, fontWeight: '600' },
  previewValue: { fontSize: 15, color: BLUE, fontWeight: '800', letterSpacing: 1 },

  // Location
  locationRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD, borderWidth: 1.5, borderColor: BORDER,
    borderRadius: 14, paddingLeft: 14,
  },
  locationPin:   { fontSize: 18, marginRight: 4 },
  locationInput: { flex: 1, borderWidth: 0, borderRadius: 0, paddingLeft: 4 },
  suggestionBox: {
    backgroundColor: CARD, borderWidth: 1.5, borderColor: BORDER,
    borderRadius: 14, marginTop: 6, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  suggestionItem:    { paddingHorizontal: 16, paddingVertical: 12 },
  suggestionDivider: { borderBottomWidth: 1, borderBottomColor: BORDER },
  suggestionMain:    { fontSize: 14, fontWeight: '600', color: TEXT },
  suggestionSub:     { fontSize: 12, color: MUTED, marginTop: 2 },
  apiWarning:        { marginTop: 10, fontSize: 12, color: '#B8750A', lineHeight: 18 },

  // Bio
  bioInput:   { height: 130, paddingTop: 14 },
  charCount:  { fontSize: 12, color: MUTED, textAlign: 'right', marginTop: 6 },

  // Footer
  footer: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 24, paddingVertical: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    backgroundColor: BG, borderTopWidth: 1, borderTopColor: BORDER, gap: 12,
  },
  skipBtn:    { paddingHorizontal: 16, paddingVertical: 14 },
  skipText:   { fontSize: 15, color: MUTED, fontWeight: '600' },
  nextBtn: {
    flex: 1, backgroundColor: RED, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: RED, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  nextBtnOff: { backgroundColor: '#ccc', shadowOpacity: 0, elevation: 0 },
  nextBtnText: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
});
