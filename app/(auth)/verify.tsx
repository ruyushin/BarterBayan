import { auth } from '@/firebaseConfig';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { sendEmailVerification, signOut } from 'firebase/auth';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const checkVerification = async () => {
    setLoading(true);
    try {
      // Force Firebase to check the server for the verification status
      await auth.currentUser?.reload(); 
      
      if (auth.currentUser?.emailVerified) {
        Alert.alert("Verified!", "Your email is confirmed. Welcome!");
        // We move to (tabs) because RootLayout will now see emailVerified as true
        router.replace('/(tabs)'); 
      } else {
        Alert.alert("Not Verified", "Please check your Gmail and click the link first.");
      }
    } catch (error) {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
      Alert.alert("Sent!", "A new verification link has been sent to your Gmail.");
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace('/(auth)/login');
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <MaterialIcons name="mark-email-read" size={80} color="#2F2F6F" />
      </View>

      <Text style={styles.title}>Check your Gmail!</Text>
      <Text style={styles.text}>
        We sent a verification link to:{"\n"}
        <Text style={styles.emailText}>{auth.currentUser?.email}</Text>
      </Text>
      
      <TouchableOpacity 
        style={styles.button} 
        onPress={checkVerification}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>I've Clicked the Link</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={handleResend}>
        <Text style={styles.resendText}>Didn't get an email? <Text style={styles.resendLink}>Resend</Text></Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelButton} onPress={handleSignOut}>
        <Text style={styles.cancelText}>Cancel / Back to Login</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: 25, 
    backgroundColor: '#000000' // Matches your Black theme
  },
  iconContainer: {
    marginBottom: 30,
    backgroundColor: '#1A1A1A',
    padding: 20,
    borderRadius: 100,
  },
  title: { fontSize: 28, fontWeight: 'bold', color: '#ffffff', marginBottom: 15 },
  text: { textAlign: 'center', marginBottom: 40, color: '#ADADAD', fontSize: 16, lineHeight: 24 },
  emailText: { color: '#ffffff', fontWeight: 'bold' },
  button: { 
    backgroundColor: '#2F2F6F', 
    padding: 18, 
    borderRadius: 12, 
    width: '100%', 
    alignItems: 'center',
    marginBottom: 20
  },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  resendText: { color: '#ADADAD', fontSize: 14 },
  resendLink: { color: '#2F2F6F', fontWeight: '700' },
  cancelButton: { marginTop: 50 },
  cancelText: { color: '#FF4444', fontWeight: '600', fontSize: 14 }
});