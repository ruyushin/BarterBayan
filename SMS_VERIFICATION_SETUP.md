# SMS Verification Setup Guide (Firebase Only)

This guide explains how to set up phone number verification using **Firebase Authentication only** - no external services like Twilio required.

## Prerequisites

1. **Firebase Project**: Already set up (barterbayan)
2. **Firebase Console**: Access to enable phone sign-in

## Step 1: Enable Phone Sign-In in Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your **barterbayan** project
3. Navigate to **Authentication** > **Sign-in method**
4. Enable **Phone** sign-in method
5. If testing on Android/iOS emulator, add your phone number to the list of test numbers (or use test credentials)

## Step 2: Install Required Package

Firebase Auth is already included, but ensure you have the latest version:

```bash
npm install firebase
```

## Step 3: Create SMS Verification Service

Create `services/smsVerificationService.ts`:

```typescript
import {
  signInWithPhoneNumber,
  RecaptchaVerifier,
  ConfirmationResult,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth, db } from '../firebaseConfig';
import { doc, setDoc, getDoc } from 'firebase/firestore';

let confirmationResult: ConfirmationResult | null = null;

/**
 * Initialize reCAPTCHA verifier for web (not needed for mobile)
 */
export const initializeRecaptcha = (containerId: string = 'recaptcha-container') => {
  try {
    window.recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
      size: 'invisible',
      callback: (token) => {
        console.log('reCAPTCHA verified');
      },
    });
  } catch (error) {
    console.error('reCAPTCHA initialization error:', error);
  }
};

/**
 * Send SMS verification code to phone number
 * Returns verificationId for mobile or confirmation result for web
 */
export const sendVerificationSMS = async (phoneNumber: string) => {
  try {
    // Format phone number with country code if needed
    const formattedPhone = phoneNumber.startsWith('+') 
      ? phoneNumber 
      : `+1${phoneNumber}`;

    // For web: use reCAPTCHA
    if (typeof window !== 'undefined') {
      confirmationResult = await signInWithPhoneNumber(
        auth,
        formattedPhone,
        window.recaptchaVerifier as RecaptchaVerifier
      );
      return { success: true, message: 'SMS sent successfully' };
    }

    // For mobile/native: Firebase handles SMS automatically
    const result = await signInWithPhoneNumber(auth, formattedPhone);
    confirmationResult = result;
    return { success: true, message: 'SMS sent successfully' };
  } catch (error: any) {
    console.error('Send SMS error:', error);
    throw new Error(error?.message || 'Failed to send SMS verification code');
  }
};

/**
 * Verify the SMS code entered by user
 */
export const verifyPhoneCode = async (code: string) => {
  try {
    if (!confirmationResult) {
      throw new Error('No verification code was sent. Please start the verification process again.');
    }

    const userCredential = await confirmationResult.confirm(code);
    const user = userCredential.user;

    if (!user.phoneNumber) {
      throw new Error('Phone number verification failed');
    }

    // Ensure user document exists in Firestore
    await ensureUserDoc(user);

    return { success: true, user };
  } catch (error: any) {
    console.error('Verify phone code error:', error);
    throw new Error(error?.message || 'Invalid or expired verification code');
  }
};

/**
 * Create or update user document in Firestore
 */
const ensureUserDoc = async (user: any) => {
  if (!user?.uid) return;

  try {
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      await setDoc(userRef, {
        phoneNumber: user.phoneNumber,
        username: user.phoneNumber?.replace(/\D/g, '').slice(-4), // Last 4 digits as username
        createdAt: new Date().toISOString(),
        rating: 5.0,
        tradeCount: 0,
        phoneVerified: true,
      });
    } else if (!userSnap.data()?.phoneVerified) {
      await setDoc(userRef, { phoneVerified: true }, { merge: true });
    }
  } catch (err: any) {
    console.warn('Unable to ensure Firestore user document:', err);
  }
};

/**
 * Sign out user
 */
export const signOutUser = async () => {
  try {
    await signOut(auth);
    confirmationResult = null;
  } catch (error: any) {
    console.error('Sign out error:', error);
    throw error;
  }
};

/**
 * Get current user
 */
export const getCurrentUser = () => {
  return auth.currentUser;
};
```

## Step 4: Create Verification UI Component

Create `app/(auth)/verify-phone.tsx`:

```typescript
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth } from '../../firebaseConfig';
import {
  sendVerificationSMS,
  verifyPhoneCode,
} from '../../services/smsVerificationService';

export default function VerifyPhoneScreen() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const appState = useRef(AppState.currentState);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user?.phoneNumber) {
        Alert.alert('Verified!', 'Your phone number is confirmed. Welcome!');
        router.replace('/(auth)/profile-setup');
      }
    });

    return () => unsubscribe();
  }, []);

  // Resend countdown timer
  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCountdown]);

  const handleSendCode = async () => {
    if (!phoneNumber.trim()) {
      Alert.alert('Error', 'Please enter a valid phone number');
      return;
    }

    setLoading(true);
    try {
      await sendVerificationSMS(phoneNumber);
      setCodeSent(true);
      setResendCountdown(60);
      Alert.alert('Success', 'Verification code sent to your phone');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode.trim()) {
      Alert.alert('Error', 'Please enter the verification code');
      return;
    }

    setLoading(true);
    try {
      await verifyPhoneCode(verificationCode);
      Alert.alert('Success', 'Phone number verified!');
      router.replace('/(auth)/profile-setup');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    try {
      await sendVerificationSMS(phoneNumber);
      setResendCountdown(60);
      Alert.alert('Success', 'Verification code resent');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setResendLoading(false);
    }
  };

  if (!codeSent) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <MaterialIcons name="phone-in-talk" size={48} color="#007AFF" />
          <Text style={styles.title}>Phone Verification</Text>
          <Text style={styles.subtitle}>Enter your phone number to verify</Text>
        </View>

        <TextInput
          style={styles.input}
          placeholder="+1 (555) 123-4567"
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          editable={!loading}
          placeholderTextColor="#999"
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSendCode}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Send Code</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <MaterialIcons name="verified-user" size={48} color="#34C759" />
        <Text style={styles.title}>Verify Code</Text>
        <Text style={styles.subtitle}>Enter the 6-digit code sent to your phone</Text>
      </View>

      <TextInput
        style={styles.input}
        placeholder="000000"
        value={verificationCode}
        onChangeText={setVerificationCode}
        keyboardType="number-pad"
        maxLength={6}
        editable={!loading}
        placeholderTextColor="#999"
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleVerifyCode}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.buttonText}>Verify Code</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleResend}
        disabled={resendCountdown > 0 || resendLoading}
        style={styles.resendButton}
      >
        <Text style={styles.resendText}>
          {resendCountdown > 0
            ? `Resend in ${resendCountdown}s`
            : 'Resend Code'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  resendButton: {
    alignItems: 'center',
    padding: 12,
  },
  resendText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '500',
  },
});
```

## Step 5: Update Login Navigation

Update your login screen to navigate to phone verification instead of email:

```typescript
// In your login.tsx or signup.tsx
const handlePhoneSignIn = () => {
  router.push('/(auth)/verify-phone');
};
```

  try {
    const stored = verificationCodes[phoneNumber];

    if (!stored) {
      throw new functions.https.HttpsError(
        "not-found",
        "No verification code found for this number"
      );
    }

    if (Date.now() > stored.timestamp) {
      delete verificationCodes[phoneNumber];
      throw new functions.https.HttpsError(
        "deadline-exceeded",
        "Verification code has expired"
      );
    }

    if (stored.code !== code) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Invalid verification code"
      );
    }

    // Code is correct, delete it
    delete verificationCodes[phoneNumber];

    return { success: true, message: "Phone number verified successfully" };
  } catch (error: any) {
    throw error;
  }
});
```

## Step 4: Set Environment Variables

1. Create `.env.local` in the `functions` directory:
   ```
   TWILIO_ACCOUNT_SID=your_account_sid
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_PHONE_NUMBER=+1234567890
   ```

2. Set Firebase secrets:
   ```bash
   firebase functions:config:set twilio.account_sid="your_account_sid"
   firebase functions:config:set twilio.auth_token="your_auth_token"
   firebase functions:config:set twilio.phone_number="+1234567890"
   ```

3. Update the Cloud Function to use secrets:
   ```typescript
   const twilioClient = twilio(
     process.env.TWILIO_ACCOUNT_SID,
     process.env.TWILIO_AUTH_TOKEN
   );
   ```

## Step 5: Deploy Functions

```bash
firebase deploy --only functions
```

## Step 6: For Production - Use Firestore Instead of In-Memory

The current implementation stores codes in memory, which won't persist across function restarts. For production, use Firestore:

```typescript
const db = admin.firestore();

export const sendVerificationSMS = functions.https.onCall(async (data, context) => {
  const { phoneNumber } = data;

  try {
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Store in Firestore
    await db.collection("verificationCodes").doc(phoneNumber).set({
      code,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    // Send SMS
    await twilioClient.messages.create({
      body: `Your BarterBayan verification code is: ${code}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber,
    });

    return { success: true };
  } catch (error: any) {
    throw new functions.https.HttpsError("internal", error.message);
  }
});

export const verifyPhoneCode = functions.https.onCall(async (data, context) => {
  const { phoneNumber, code } = data;

  try {
    const doc = await db.collection("verificationCodes").doc(phoneNumber).get();

    if (!doc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "No verification code found"
      );
    }

    const data = doc.data();

    if (data.code !== code) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Invalid code"
      );
    }

    if (new Date() > data.expiresAt.toDate()) {
      throw new functions.https.HttpsError(
        "deadline-exceeded",
        "Code expired"
      );
    }

    // Delete the code after successful verification
    await doc.ref.delete();

    return { success: true };
  } catch (error: any) {
    throw error;
  }
});
```

## Testing

1. Start the emulator:
   ```bash
   firebase emulators:start
   ```

2. Test functions using the Firebase console or your app

## Troubleshooting

- **"twilio not found"**: Run `npm install twilio` in the functions directory
- **Auth errors**: Check your Twilio credentials
- **SMS not sending**: Verify the phone number format includes country code (e.g., +63 for Philippines)
- **CORS errors**: Firebase Functions should allow CORS by default for authenticated calls

## Frontend Integration

The app is already set up to call these functions:
- `sendVerificationSMS` - Called when user taps "Send Verification Code"
- `verifyPhoneCode` - Called when user submits the code from SMS

No additional frontend changes needed!
