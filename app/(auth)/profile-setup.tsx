import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import DateTimePicker from '@react-native-community/datetimepicker';
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
  View
} from 'react-native';
import { auth, db } from '../../firebaseConfig';

const { width } = Dimensions.get('window');
const STEPS = ['Name', 'Photo', 'Personal', 'Address', 'Contact', 'Bio'];

const PRIMARY   = '#2F2F6F';
const SECONDARY = '#E74C3C';
const BG        = '#F7F5F2';
const CARD      = '#FFFFFF';
const BORDER    = '#E0DDD8';
const TEXT      = '#1A1A1A';
const MUTED     = '#888888';

const lettersOnly = (text: string) =>
  text.replace(/[^a-zA-ZÀ-ÖØ-öø-ÿÑñ\s\-'.]/g, '');

const isEmpty = (v: string | null | undefined) => !v || v.trim().length === 0;

const GENDER_OPTIONS = ['Male', 'Female', 'Others'];
const STATUS_OPTIONS = ['Single', 'Married', 'Widowed', 'Separated', 'Divorced'];

// Fixed address constants
const FIXED_BARANGAY = 'Barangay Paang Bundok';
const FIXED_CITY = 'Quezon City';
const FIXED_ZIP = '1114';

// Street name suggestions for Barangay Paang Bundok (named after mountains)
const STREET_SUGGESTIONS = [
  'Iba Street',
  'Iriga Street',
  'Isarog Street',
  'Bulusan Street',
  'Abao Street',
  'Mariveles Street',
  'Labo Street',
];

export default function ProfileSetupScreen() {
  const [step, setStep] = useState(0);

  // Step 0: Name
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');

  // Step 1: Photo
  const [photo, setPhoto] = useState<string | null>(null);
  const [cropLoading, setCropLoading] = useState(false);

  // Step 2: Personal Info
  const [gender, setGender] = useState('');
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [civilStatus, setCivilStatus] = useState('');
  const [showGenderPicker, setShowGenderPicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Step 3: Address
  const [houseNumber, setHouseNumber] = useState('');
  const [streetName, setStreetName] = useState('');
  const [showStreetSuggestions, setShowStreetSuggestions] = useState(false);

  // Step 4: Contact
  const [phone, setPhone] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');

  // Step 5: Bio
  const [bio, setBio] = useState('');

  const [isSaving, setIsSaving] = useState(false);

  // ── Required-field validation indicator ──────────────────────────
  const [attemptedNext, setAttemptedNext] = useState(false);

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
      case 0:
        return (
          firstName.trim().length >= 2 &&
          firstName.trim().length <= 25 &&
          lastName.trim().length >= 2 &&
          lastName.trim().length <= 25
        );
      case 1:
        return true; // Photo is skippable
      case 2:
        return gender !== '' && birthday !== null && civilStatus !== '';
      case 3:
        return houseNumber.trim().length > 0 && streetName.trim().length > 0;
      case 4:
        return phone.length === 10 && emergencyName.trim().length >= 10 && emergencyPhone.length === 10;
      case 5:
        return true; // Bio is skippable
      default:
        return false;
    }
  };

  const goNext = () => {
    if (!canProceed()) {
      setAttemptedNext(true);
      return;
    }
    setAttemptedNext(false);
    setShowStreetSuggestions(false);
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else handleFinish();
  };

  const goBack = () => {
    setAttemptedNext(false);
    setShowStreetSuggestions(false);
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
        gender,
        birthday: birthday ? birthday.toISOString() : null,
        civilStatus,
        address: {
          houseNumber,
          streetName,
          barangay: FIXED_BARANGAY,
          city: FIXED_CITY,
          zipCode: FIXED_ZIP,
        },
        phone: `+63${phone}`,
        emergencyContact: {
          name: emergencyName,
          phone: `+63${emergencyPhone}`,
        },
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

  const handleEmergencyPhoneChange = (text: string) => {
    const digits = text.replace(/\D/g, '');
    if (digits.length <= 10) setEmergencyPhone(digits);
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

  const isSkippable = step === 1 || step === 5;

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (selectedDate) setBirthday(selectedDate);
  };

  // Must be at least 18 years old
  const maxDate18 = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d;
  })();

  const renderStep = () => {
    switch (step) {
      // ══════════════════════════════════════
      // STEP 0 — Name
      // ══════════════════════════════════════
      case 0:
        return (
          <StepWrapper title="What's your name?" sub="This is required — it's how others will know you.">
            <FieldGroup label="First Name *" error={attemptedNext && (firstName.trim().length < 2)}>
              <TextInput
                style={[s.input, attemptedNext && firstName.trim().length < 2 && s.inputError]}
                placeholder="e.g. Juan"
                placeholderTextColor={MUTED}
                value={firstName}
                onChangeText={t => firstName.length <= 25 ? setFirstName(lettersOnly(t)) : null}
                maxLength={25}
                autoCapitalize="words"
                autoFocus
              />
              <Text style={s.charCount}>{firstName.length}/25 (min 2)</Text>
            </FieldGroup>
            <FieldGroup label="Middle Name (Optional)">
              <TextInput
                style={s.input}
                placeholder="e.g. Santos"
                placeholderTextColor={MUTED}
                value={middleName}
                onChangeText={t => setMiddleName(lettersOnly(t))}
                maxLength={25}
                autoCapitalize="words"
              />
              {/* ── character counter added ── */}
              <Text style={s.charCount}>{middleName.length}/25</Text>
            </FieldGroup>
            <FieldGroup label="Last Name *" error={attemptedNext && (lastName.trim().length < 2)}>
              <TextInput
                style={[s.input, attemptedNext && lastName.trim().length < 2 && s.inputError]}
                placeholder="e.g. dela Cruz"
                placeholderTextColor={MUTED}
                value={lastName}
                onChangeText={t => setLastName(lettersOnly(t))}
                maxLength={25}
                autoCapitalize="words"
              />
              <Text style={s.charCount}>{lastName.length}/25 (min 2)</Text>
            </FieldGroup>
            <View style={s.requiredNote}>
              <Ionicons name="information-circle-outline" size={14} color={MUTED} />
              <Text style={s.requiredNoteText}>First and Last name must be 2-25 characters.</Text>
            </View>
          </StepWrapper>
        );

      // ══════════════════════════════════════
      // STEP 1 — Photo
      // ══════════════════════════════════════
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

      // ══════════════════════════════════════
      // STEP 2 — Personal Info
      // ══════════════════════════════════════
      case 2:
        return (
          <StepWrapper title="Tell us more about you" sub="This helps personalize your experience.">

            {/* ── Gender ─────────────────────────────────────────── */}
            <FieldGroup label="Gender *" error={attemptedNext && !gender}>
              <TouchableOpacity
                style={[s.dropdownInput, attemptedNext && !gender && s.inputError]}
                onPress={() => { setShowGenderPicker(v => !v); setShowStatusPicker(false); }}
                activeOpacity={0.8}
              >
                <Text style={[s.dropdownText, !gender && s.placeholderText]}>
                  {gender || 'Select gender'}
                </Text>
                <Ionicons name={showGenderPicker ? 'chevron-up' : 'chevron-down'} size={18} color={MUTED} />
              </TouchableOpacity>
              {showGenderPicker && (
                <View style={s.inlineDropdown}>
                  {GENDER_OPTIONS.map((opt, idx) => (
                    <TouchableOpacity
                      key={opt}
                      style={[
                        s.streetDropdownItem,
                        idx < GENDER_OPTIONS.length - 1 && s.streetDropdownItemBorder,
                        gender === opt && s.inlineDropdownItemActive,
                      ]}
                      onPress={() => { setGender(opt); setShowGenderPicker(false); }}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.streetDropdownText, gender === opt && s.inlineDropdownTextActive]}>
                        {opt}
                      </Text>
                      {gender === opt && <Ionicons name="checkmark" size={16} color={PRIMARY} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </FieldGroup>

            {/* ── Birthday ────────────────────────────────────────── */}
            <FieldGroup label="Birthday *" error={attemptedNext && !birthday}>
              <TouchableOpacity
                style={[s.dropdownInput, attemptedNext && !birthday && s.inputError]}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.8}
              >
                <Text style={[s.dropdownText, !birthday && s.placeholderText]}>
                  {birthday ? formatDate(birthday) : 'e.g. January 1, 1990'}
                </Text>
                <Ionicons name="calendar-outline" size={18} color={MUTED} />
              </TouchableOpacity>
              {birthday && (
                <Text style={s.fieldHintSuccess}>Age verified — 18+</Text>
              )}
              {showDatePicker && (
                Platform.OS === 'ios' ? (
                  <Modal transparent visible={showDatePicker} animationType="fade">
                    <View style={s.modalOverlay}>
                      <View style={s.pickerCard}>
                        <Text style={s.pickerCardTitle}>Select Birthday</Text>
                        <DateTimePicker
                          value={birthday || maxDate18}
                          mode="date"
                          display="spinner"
                          maximumDate={maxDate18}
                          onChange={onDateChange}
                        />
                        <TouchableOpacity style={s.pickerDoneBtn} onPress={() => setShowDatePicker(false)}>
                          <Text style={s.pickerDoneBtnText}>Done</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </Modal>
                ) : (
                  <DateTimePicker
                    value={birthday || maxDate18}
                    mode="date"
                    display="default"
                    maximumDate={maxDate18}
                    onChange={onDateChange}
                  />
                )
              )}
            </FieldGroup>

            {/* ── Civil Status ─────────────────────────────────────── */}
            <FieldGroup label="Civil Status *" error={attemptedNext && !civilStatus}>
              <TouchableOpacity
                style={[s.dropdownInput, attemptedNext && !civilStatus && s.inputError]}
                onPress={() => { setShowStatusPicker(v => !v); setShowGenderPicker(false); }}
                activeOpacity={0.8}
              >
                <Text style={[s.dropdownText, !civilStatus && s.placeholderText]}>
                  {civilStatus || 'Select civil status'}
                </Text>
                <Ionicons name={showStatusPicker ? 'chevron-up' : 'chevron-down'} size={18} color={MUTED} />
              </TouchableOpacity>
              {showStatusPicker && (
                <View style={s.inlineDropdown}>
                  {STATUS_OPTIONS.map((opt, idx) => (
                    <TouchableOpacity
                      key={opt}
                      style={[
                        s.streetDropdownItem,
                        idx < STATUS_OPTIONS.length - 1 && s.streetDropdownItemBorder,
                        civilStatus === opt && s.inlineDropdownItemActive,
                      ]}
                      onPress={() => { setCivilStatus(opt); setShowStatusPicker(false); }}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.streetDropdownText, civilStatus === opt && s.inlineDropdownTextActive]}>
                        {opt}
                      </Text>
                      {civilStatus === opt && <Ionicons name="checkmark" size={16} color={PRIMARY} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </FieldGroup>

          </StepWrapper>
        );

      // ══════════════════════════════════════
      // STEP 3 — Address
      // ══════════════════════════════════════
      case 3:
        return (
          <StepWrapper title="Where do you live?" sub="Your barangay, city, and zip code are pre-filled.">
            <FieldGroup label="House / Unit / Building No. *" error={attemptedNext && isEmpty(houseNumber)}>
              <TextInput
                style={[s.input, attemptedNext && isEmpty(houseNumber) && s.inputError]}
                placeholder="e.g. Blk 12 Lot 5 / Unit 3B"
                placeholderTextColor={MUTED}
                value={houseNumber}
                onChangeText={setHouseNumber}
                autoFocus
              />
            </FieldGroup>
            <FieldGroup label="Street Name *" error={attemptedNext && isEmpty(streetName)}>
              <View>
                <TextInput
                  style={[s.input, attemptedNext && isEmpty(streetName) && s.inputError]}
                  placeholder="e.g. Iba Street"
                  placeholderTextColor={MUTED}
                  value={streetName}
                  onChangeText={(t) => { setStreetName(t); setShowStreetSuggestions(true); }}
                  onFocus={() => setShowStreetSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowStreetSuggestions(false), 150)}
                />
                {showStreetSuggestions && (() => {
                  const filtered = STREET_SUGGESTIONS.filter(name =>
                    name.toLowerCase().includes(streetName.trim().toLowerCase())
                  );
                  return filtered.length > 0 ? (
                    <View style={s.streetDropdown}>
                      {filtered.map((name, idx) => (
                        <TouchableOpacity
                          key={name}
                          style={[
                            s.streetDropdownItem,
                            idx < filtered.length - 1 && s.streetDropdownItemBorder,
                          ]}
                          onPress={() => { setStreetName(name); setShowStreetSuggestions(false); }}
                          activeOpacity={0.7}
                        >
                          <View style={s.streetDropdownIcon}>
                            <Ionicons name="location-outline" size={15} color={PRIMARY} />
                          </View>
                          <Text style={s.streetDropdownText}>{name}</Text>
                          {streetName === name && (
                            <Ionicons name="checkmark" size={15} color={PRIMARY} />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null;
                })()}
              </View>
              <Text style={s.fieldHint}>Common street names in this barangay are named after mountains.</Text>
            </FieldGroup>

            <FieldGroup label="Barangay">
              <View style={s.fixedField}>
                <Ionicons name="lock-closed" size={14} color={MUTED} />
                <Text style={s.fixedFieldText}>{FIXED_BARANGAY}</Text>
              </View>
            </FieldGroup>

            <View style={s.row}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <FieldGroup label="City">
                  <View style={s.fixedField}>
                    <Ionicons name="lock-closed" size={14} color={MUTED} />
                    <Text style={s.fixedFieldText}>{FIXED_CITY}</Text>
                  </View>
                </FieldGroup>
              </View>
              <View style={{ flex: 1 }}>
                <FieldGroup label="Zip Code">
                  <View style={s.fixedField}>
                    <Ionicons name="lock-closed" size={14} color={MUTED} />
                    <Text style={s.fixedFieldText}>{FIXED_ZIP}</Text>
                  </View>
                </FieldGroup>
              </View>
            </View>
          </StepWrapper>
        );

      // ══════════════════════════════════════
      // STEP 4 — Contact
      // ══════════════════════════════════════
      case 4:
        return (
          <StepWrapper title="Contact information" sub="For account recovery and emergencies.">
            <FieldGroup label="Mobile Number *" error={attemptedNext && phone.length !== 10}>
              <View style={s.phoneRow}>
                <View style={[s.countryBadge, attemptedNext && phone.length !== 10 && s.inputError]}>
                  <Ionicons name="globe" size={18} color={PRIMARY} />
                  <Text style={s.countryCode}>+63</Text>
                </View>
                <TextInput
                  style={[s.input, s.phoneInput, attemptedNext && phone.length !== 10 && s.inputError]}
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
            </FieldGroup>

            <View style={s.sectionDivider} />

            <Text style={s.sectionLabel}>Emergency Contact</Text>

            <FieldGroup
              label="Emergency Contact Name *"
              error={attemptedNext && (isEmpty(emergencyName) || emergencyName.trim().length < 10)}
            >
              <TextInput
                style={[
                  s.input,
                  attemptedNext && (isEmpty(emergencyName) || emergencyName.trim().length < 10) && s.inputError,
                ]}
                placeholder="e.g. Maria Santos dela Cruz"
                placeholderTextColor={MUTED}
                value={emergencyName}
                onChangeText={t => { if (t.length <= 50) setEmergencyName(lettersOnly(t)); }}
                autoCapitalize="words"
                maxLength={50}
              />
              <View style={s.charRow}>
                {attemptedNext && emergencyName.trim().length > 0 && emergencyName.trim().length < 10 && (
                  <Text style={s.charHintError}>Minimum 10 characters</Text>
                )}
                <Text style={[s.charCount, { flex: 1, textAlign: 'right' }]}>{emergencyName.length}/50 (min 10)</Text>
              </View>
            </FieldGroup>

            <FieldGroup label="Emergency Contact Number *" error={attemptedNext && emergencyPhone.length !== 10}>
              <View style={s.phoneRow}>
                <View style={[s.countryBadge, attemptedNext && emergencyPhone.length !== 10 && s.inputError]}>
                  <Ionicons name="globe" size={18} color={PRIMARY} />
                  <Text style={s.countryCode}>+63</Text>
                </View>
                <TextInput
                  style={[s.input, s.phoneInput, attemptedNext && emergencyPhone.length !== 10 && s.inputError]}
                  placeholder="9171234567"
                  placeholderTextColor={MUTED}
                  value={emergencyPhone}
                  onChangeText={handleEmergencyPhoneChange}
                  keyboardType="number-pad"
                  maxLength={10}
                />
              </View>
              <Text style={s.phoneHint}>{emergencyPhone.length}/10 digits</Text>
            </FieldGroup>
          </StepWrapper>
        );

      // ══════════════════════════════════════
      // STEP 5 — Bio
      // ══════════════════════════════════════
      case 5:
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
          <TouchableOpacity onPress={goNext} style={s.skipBtn} disabled={isSaving}>
            <Text style={s.skipText}>Skip</Text>
          </TouchableOpacity>
        ) : (
          <View style={s.skipBtn} />
        )}
        <TouchableOpacity
          style={[s.nextBtn, isSaving && s.nextBtnOff]}
          onPress={goNext}
          disabled={isSaving}
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
            <View style={s.modalIconWrap}>
              <MaterialIcons name="celebration" size={42} color={PRIMARY} />
            </View>

            <Text style={s.modalTitle}>You're all set!</Text>
            <Text style={s.modalSubtitle}>Welcome to BarterBayan</Text>
            <Text style={s.modalBody}>
              Your profile is complete. Start exploring items to trade, connect with your
              community, and make your first barter!
            </Text>

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

function FieldGroup({ label, children, error }: { label: string; children: React.ReactNode; error?: boolean }) {
  return (
    <View style={s.fieldGroup}>
      <View style={s.labelRow}>
        <Text style={[s.label, error && s.labelError]}>{label}</Text>
        {error && (
          <View style={s.errorBadge}>
            <Ionicons name="alert-circle" size={12} color={SECONDARY} />
            <Text style={s.errorBadgeText}>Required</Text>
          </View>
        )}
      </View>
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
  labelRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 11, fontWeight: '700', color: MUTED,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  labelError: { color: SECONDARY },
  errorBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  errorBadgeText: { fontSize: 11, fontWeight: '700', color: SECONDARY },
  input: {
    backgroundColor: CARD, borderWidth: 1.5, borderColor: BORDER,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: TEXT,
  },
  inputError: {
    borderColor: SECONDARY,
    backgroundColor: `${SECONDARY}08`,
  },

  // ── Custom inline dropdown (Gender / Civil Status) ──────────────
  dropdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  dropdownIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: `${PRIMARY}12`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineDropdown: {
    backgroundColor: CARD,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    marginTop: 6,
    overflow: 'hidden',
  },
  inlineDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  inlineDropdownBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  inlineDropdownItemActive: {
    backgroundColor: `${PRIMARY}10`,
  },
  inlineDropdownText: {
    fontSize: 15,
    color: TEXT,
    fontWeight: '500',
  },
  inlineDropdownTextActive: {
    color: PRIMARY,
    fontWeight: '700',
  },
  fieldHintSuccess: {
    fontSize: 12,
    color: '#27AE60',
    marginTop: 6,
    marginLeft: 4,
    fontWeight: '600',
  },
  // ── Birthday field ───────────────────────────────────────────────
  birthdayInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  birthdayText: {
    fontSize: 16,
    color: TEXT,
    flex: 1,
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

  bioInput: { height: 130, paddingTop: 14 },
  charCount: { fontSize: 12, color: MUTED, textAlign: 'right', marginTop: 6 },

  // ── Dropdown / picker fields (kept for birthday button on native) ─
  dropdownInput: {
    backgroundColor: CARD, borderWidth: 1.5, borderColor: BORDER,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  dropdownText: { fontSize: 16, color: TEXT },
  placeholderText: { color: MUTED },

  // ── Fixed (locked) address fields ───────────────────────────────
  fixedField: {
    backgroundColor: '#EFEDE9', borderWidth: 1.5, borderColor: BORDER,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  fixedFieldText: { fontSize: 15, color: MUTED, fontWeight: '600' },

  row: { flexDirection: 'row' },

  sectionDivider: { height: 1, backgroundColor: BORDER, marginVertical: 8, marginBottom: 20 },
  sectionLabel: {
    fontSize: 13, fontWeight: '800', color: TEXT,
    marginBottom: 16, letterSpacing: 0.3,
  },

  // ── Street dropdown list ─────────────────────────────────────────
  streetDropdown: {
    backgroundColor: CARD,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    marginTop: 6,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  streetDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  },
  streetDropdownItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  streetDropdownIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: `${PRIMARY}12`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streetDropdownText: {
    fontSize: 15,
    color: TEXT,
    fontWeight: '500',
    flex: 1,
  },
  fieldHint: { fontSize: 12, color: MUTED, marginTop: 8, lineHeight: 16 },

  // ── Char row (label + counter side by side) ──────────────────────
  charRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  charHintError: {
    fontSize: 12,
    color: SECONDARY,
    fontWeight: '600',
  },

  // ── Picker modal cards (date iOS) ───────────────────────────────
  pickerCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: CARD,
    borderRadius: 18,
    padding: 20,
  },
  pickerCardTitle: {
    fontSize: 16, fontWeight: '800', color: TEXT,
    marginBottom: 12, textAlign: 'center',
  },
  pickerDoneBtn: {
    backgroundColor: PRIMARY, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 12,
  },
  pickerDoneBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

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
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: `${PRIMARY}10`, borderWidth: 2, borderColor: `${PRIMARY}20`,
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginBottom: 18,
  },
  modalTitle: {
    fontSize: 24, fontWeight: '800', color: TEXT,
    textAlign: 'center', letterSpacing: -0.4, marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14, fontWeight: '600', color: PRIMARY,
    textAlign: 'center', marginBottom: 12,
  },
  modalBody: {
    fontSize: 14, color: MUTED, textAlign: 'center',
    lineHeight: 21, marginBottom: 20,
  },
  tipsCard: {
    backgroundColor: BG, borderRadius: 14,
    padding: 16, gap: 12, marginBottom: 22,
    borderWidth: 1, borderColor: BORDER,
  },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tipDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center',
  },
  tipText: { fontSize: 13, color: TEXT, fontWeight: '500', flex: 1 },
  modalBtn: {
    backgroundColor: PRIMARY, borderRadius: 14,
    paddingVertical: 15, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  modalBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});