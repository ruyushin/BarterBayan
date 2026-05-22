import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
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

const { width, height } = Dimensions.get('window');

// Replace with your Google Places API key
const GOOGLE_PLACES_API_KEY = '1081232685961';

const STEPS = ['Name', 'Photo', 'Phone', 'Location', 'Bio'];

interface ProfileData {
  firstName: string;
  lastName: string;
  photo: string | null;
  phone: string;
  location: string;
  locationPlaceId: string | null;
  bio: string;
}

interface ProfileSetupScreenProps {
  onComplete: (profileData: ProfileData) => void;
}

interface LocationPrediction {
  place_id: string;
  description: string;
  structured_formatting?: {
    main_text?: string;
    secondary_text?: string;
  };
}

export default function ProfileSetupScreen({ onComplete }: ProfileSetupScreenProps) {
  const [step, setStep] = useState(0);

  // Fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [locationPlaceId, setLocationPlaceId] = useState<string | null>(null);
  const [bio, setBio] = useState('');

  // Location autocomplete state
  const [locationQuery, setLocationQuery] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState<LocationPrediction[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const locationDebounce = useRef<NodeJS.Timeout | null>(null);

  // Image crop state
  const [cropLoading, setCropLoading] = useState(false);

  // Navigation
  const canProceed = (): boolean => {
    if (step === 0) return firstName.trim().length > 0 && lastName.trim().length > 0;
    if (step === 1) return photo !== null;
    if (step === 2) return phone.length === 10; // 10 digits after +63
    if (step === 3) return location.trim().length > 0;
    if (step === 4) return true; // bio is optional
    return true;
  };

  const goNext = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else handleFinish();
  };

  const goBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleFinish = () => {
    onComplete({
      firstName,
      lastName,
      photo,
      phone: `+63${phone}`,
      location,
      locationPlaceId,
      bio,
    });
  };

  // Phone input
  const handlePhoneChange = (text: string) => {
    const digits = text.replace(/\D/g, '');
    if (digits.length <= 10) setPhone(digits);
  };

  // Image picker + crop
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (!result.canceled && result.assets?.[0]) {
      const uri = result.assets[0].uri;
      setCropLoading(true);
      try {
        const manipulated = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 400, height: 400 } }],
          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
        );
        setPhoto(manipulated.uri);
      } catch {
        setPhoto(uri);
      } finally {
        setCropLoading(false);
      }
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow camera access.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets?.[0]) {
      setCropLoading(true);
      try {
        const manipulated = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 400, height: 400 } }],
          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
        );
        setPhoto(manipulated.uri);
      } catch {
        setPhoto(result.assets[0].uri);
      } finally {
        setCropLoading(false);
      }
    }
  };

  // Location autocomplete
  const fetchSuggestions = useCallback((text: string) => {
    if (text.length < 2) {
      setLocationSuggestions([]);
      return;
    }
    setLoadingLocations(true);
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}&components=country:ph&key=${GOOGLE_PLACES_API_KEY}`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        setLocationSuggestions(data.predictions || []);
      })
      .catch(() => setLocationSuggestions([]))
      .finally(() => setLoadingLocations(false));
  }, []);

  const handleLocationChange = (text: string) => {
    setLocationQuery(text);
    setLocation(text);
    setLocationPlaceId(null);
    if (locationDebounce.current) clearTimeout(locationDebounce.current);
    locationDebounce.current = setTimeout(() => fetchSuggestions(text), 350);
  };

  const selectLocation = (prediction: LocationPrediction) => {
    setLocation(prediction.description);
    setLocationQuery(prediction.description);
    setLocationPlaceId(prediction.place_id);
    setLocationSuggestions([]);
  };

  // Render steps
  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <StepName
            firstName={firstName}
            lastName={lastName}
            setFirstName={setFirstName}
            setLastName={setLastName}
          />
        );
      case 1:
        return (
          <StepPhoto
            photo={photo}
            onPickGallery={pickImage}
            onPickCamera={takePhoto}
            loading={cropLoading}
          />
        );
      case 2:
        return <StepPhone phone={phone} onChangePhone={handlePhoneChange} />;
      case 3:
        return (
          <StepLocation
            query={locationQuery}
            onChangeQuery={handleLocationChange}
            suggestions={locationSuggestions}
            onSelectSuggestion={selectLocation}
            loading={loadingLocations}
          />
        );
      case 4:
        return <StepBio bio={bio} setBio={setBio} />;
      default:
        return null;
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={styles.header}>
        {step > 0 && (
          <TouchableOpacity onPress={goBack} style={styles.backBtn}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
        )}
        <View style={styles.stepPillsRow}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.stepPill,
                i <= step ? styles.stepPillActive : styles.stepPillInactive,
              ]}
            />
          ))}
        </View>
      </View>

      {/* Content */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {renderStep()}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        {step === 4 && (
          <TouchableOpacity onPress={handleFinish} style={styles.skipBtn}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.nextBtn, !canProceed() && styles.nextBtnDisabled]}
          onPress={goNext}
          disabled={!canProceed()}
          activeOpacity={0.85}
        >
          <Text style={styles.nextBtnText}>
            {step === STEPS.length - 1 ? 'Finish' : 'Continue'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Step Components ──────────────────────────────────────────────────────────

function StepName({
  firstName,
  lastName,
  setFirstName,
  setLastName,
}: {
  firstName: string;
  lastName: string;
  setFirstName: (text: string) => void;
  setLastName: (text: string) => void;
}) {
  return (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>What's your name?</Text>
      <Text style={styles.stepSubtitle}>This is how others will see you.</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>First Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Juan"
          placeholderTextColor="#aaa"
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
          autoFocus
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Last Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. dela Cruz"
          placeholderTextColor="#aaa"
          value={lastName}
          onChangeText={setLastName}
          autoCapitalize="words"
        />
      </View>
    </View>
  );
}

function StepPhoto({
  photo,
  onPickGallery,
  onPickCamera,
  loading,
}: {
  photo: string | null;
  onPickGallery: () => void;
  onPickCamera: () => void;
  loading: boolean;
}) {
  return (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Add a profile photo</Text>
      <Text style={styles.stepSubtitle}>Choose a square crop. You can change this later.</Text>

      <View style={styles.avatarWrapper}>
        {loading ? (
          <ActivityIndicator size="large" color="#B8202A" />
        ) : photo ? (
          <Image source={{ uri: photo }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarPlaceholderIcon}>👤</Text>
          </View>
        )}
      </View>

      <View style={styles.photoButtonsRow}>
        <TouchableOpacity
          style={styles.photoBtn}
          onPress={onPickGallery}
          activeOpacity={0.8}
        >
          <Text style={styles.photoBtnIcon}>🖼️</Text>
          <Text style={styles.photoBtnLabel}>Gallery</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.photoBtn}
          onPress={onPickCamera}
          activeOpacity={0.8}
        >
          <Text style={styles.photoBtnIcon}>📷</Text>
          <Text style={styles.photoBtnLabel}>Camera</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.cropNote}>
        The image will be auto-cropped to a 1:1 square. Use the native crop tool
        that appears to adjust framing.
      </Text>
    </View>
  );
}

function StepPhone({
  phone,
  onChangePhone,
}: {
  phone: string;
  onChangePhone: (text: string) => void;
}) {
  return (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Your phone number</Text>
      <Text style={styles.stepSubtitle}>Used for account recovery and verification.</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Mobile Number</Text>
        <View style={styles.phoneRow}>
          <View style={styles.countryCode}>
            <Text style={styles.countryFlag}>🇵🇭</Text>
            <Text style={styles.countryCodeText}>+63</Text>
          </View>

          <TextInput
            style={[styles.input, styles.phoneInput]}
            placeholder="9171234567"
            placeholderTextColor="#aaa"
            value={phone}
            onChangeText={onChangePhone}
            keyboardType="number-pad"
            maxLength={10}
            autoFocus
          />
        </View>

        <Text style={styles.phoneHint}>{phone.length}/10 digits — format: 9XX XXX XXXX</Text>

        {phone.length > 0 && (
          <View style={styles.phonePreview}>
            <Text style={styles.phonePreviewLabel}>Full number:</Text>
            <Text style={styles.phonePreviewValue}>
              +63{' '}
              {phone.slice(0, 3)}
              {phone.length > 3 ? ' ' : ''}
              {phone.slice(3, 6)}
              {phone.length > 6 ? ' ' : ''}
              {phone.slice(6, 10)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function StepLocation({
  query,
  onChangeQuery,
  suggestions,
  onSelectSuggestion,
  loading,
}: {
  query: string;
  onChangeQuery: (text: string) => void;
  suggestions: LocationPrediction[];
  onSelectSuggestion: (prediction: LocationPrediction) => void;
  loading: boolean;
}) {
  return (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Where are you located?</Text>
      <Text style={styles.stepSubtitle}>Helps connect you with people nearby.</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>City / Area</Text>
        <View style={styles.locationInputWrapper}>
          <Text style={styles.locationPin}>📍</Text>
          <TextInput
            style={[styles.input, styles.locationInput]}
            placeholder="Search city, barangay, or address..."
            placeholderTextColor="#aaa"
            value={query}
            onChangeText={onChangeQuery}
            autoFocus
          />
          {loading && (
            <ActivityIndicator
              size="small"
              color="#B8202A"
              style={{ marginRight: 12 }}
            />
          )}
        </View>

        {suggestions.length > 0 && (
          <View style={styles.suggestionsBox}>
            <FlatList
              data={suggestions}
              keyExtractor={(item) => item.place_id}
              scrollEnabled={false}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={[
                    styles.suggestionItem,
                    index < suggestions.length - 1 && styles.suggestionDivider,
                  ]}
                  onPress={() => onSelectSuggestion(item)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.suggestionMain}>
                    {item.structured_formatting?.main_text || item.description}
                  </Text>
                  {item.structured_formatting?.secondary_text ? (
                    <Text style={styles.suggestionSub}>
                      {item.structured_formatting.secondary_text}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              )}
            />
          </View>
        )}

        {GOOGLE_PLACES_API_KEY === 'YOUR_GOOGLE_PLACES_API_KEY' && (
          <Text style={styles.apiWarning}>
            ⚠️ Add your Google Places API key to enable live suggestions.
          </Text>
        )}
      </View>
    </View>
  );
}

function StepBio({ bio, setBio }: { bio: string; setBio: (text: string) => void }) {
  const MAX = 160;
  return (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Tell us about yourself</Text>
      <Text style={styles.stepSubtitle}>Optional — a short bio shown on your profile.</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Bio</Text>
        <TextInput
          style={[styles.input, styles.bioInput]}
          placeholder="e.g. Coffee lover, UI designer, based in Quezon City..."
          placeholderTextColor="#aaa"
          value={bio}
          onChangeText={(t) => t.length <= MAX && setBio(t)}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          autoFocus
        />
        <Text style={styles.charCount}>
          {bio.length}/{MAX}
        </Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const RED = '#B8202A';
const BLUE = '#1C3B8C';
const BLACK = '#0D0D0D';
const BG = '#F7F5F2';
const CARD = '#FFFFFF';
const BORDER = '#E0DDD8';
const TEXT = '#1A1A1A';
const MUTED = '#888';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },

  // Header
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CARD,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BORDER,
  },
  backArrow: {
    fontSize: 18,
    color: BLACK,
  },
  stepPillsRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  stepPill: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  stepPillActive: {
    backgroundColor: RED,
  },
  stepPillInactive: {
    backgroundColor: BORDER,
  },

  // Scroll
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },

  // Step container
  stepContainer: {
    paddingTop: 28,
  },
  stepTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: BLACK,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  stepSubtitle: {
    fontSize: 14,
    color: MUTED,
    marginBottom: 32,
    lineHeight: 20,
  },

  // Input
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  input: {
    backgroundColor: CARD,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: TEXT,
  },

  // Photo step
  avatarWrapper: {
    alignSelf: 'center',
    width: 140,
    height: 140,
    borderRadius: 70,
    overflow: 'hidden',
    backgroundColor: '#E8E4DF',
    marginBottom: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: RED,
    shadowColor: RED,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  avatar: {
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholderIcon: {
    fontSize: 56,
  },
  photoButtonsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  photoBtn: {
    flex: 1,
    backgroundColor: CARD,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 6,
  },
  photoBtnIcon: {
    fontSize: 26,
  },
  photoBtnLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: TEXT,
  },
  cropNote: {
    fontSize: 12,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },

  // Phone step
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  countryCode: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },
  countryFlag: {
    fontSize: 20,
  },
  countryCodeText: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT,
  },
  phoneInput: {
    flex: 1,
    letterSpacing: 1.5,
  },
  phoneHint: {
    fontSize: 12,
    color: MUTED,
    marginTop: 6,
    marginLeft: 4,
  },
  phonePreview: {
    marginTop: 12,
    backgroundColor: `${BLUE}12`,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  phonePreviewLabel: {
    fontSize: 12,
    color: BLUE,
    fontWeight: '600',
  },
  phonePreviewValue: {
    fontSize: 15,
    color: BLUE,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Location step
  locationInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    paddingLeft: 14,
  },
  locationPin: {
    fontSize: 18,
    marginRight: 4,
  },
  locationInput: {
    flex: 1,
    borderWidth: 0,
    borderRadius: 0,
    paddingLeft: 4,
  },
  suggestionsBox: {
    backgroundColor: CARD,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    marginTop: 6,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  suggestionItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  suggestionDivider: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  suggestionMain: {
    fontSize: 14,
    fontWeight: '600',
    color: TEXT,
  },
  suggestionSub: {
    fontSize: 12,
    color: MUTED,
    marginTop: 2,
  },
  apiWarning: {
    marginTop: 10,
    fontSize: 12,
    color: '#B8750A',
    lineHeight: 18,
  },

  // Bio step
  bioInput: {
    height: 130,
    paddingTop: 14,
  },
  charCount: {
    fontSize: 12,
    color: MUTED,
    textAlign: 'right',
    marginTop: 6,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    gap: 12,
  },
  skipBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  skipText: {
    fontSize: 15,
    color: MUTED,
    fontWeight: '600',
  },
  nextBtn: {
    flex: 1,
    backgroundColor: RED,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: RED,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  nextBtnDisabled: {
    backgroundColor: '#ccc',
    shadowOpacity: 0,
    elevation: 0,
  },
  nextBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
});
