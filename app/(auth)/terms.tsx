import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { doc, setDoc } from 'firebase/firestore';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '../../firebaseConfig';

export default function TermsAndConditionsScreen() {
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleAccept = async () => {
    if (!agreeToTerms) {
      Alert.alert('Required', 'Please agree to the Terms & Conditions to continue');
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

  const handleDecline = () => {
    Alert.alert(
      'Decline Terms',
      'You must accept the Terms & Conditions to continue using BarterBayan.',
      [
        { text: 'Go Back', onPress: () => setAgreeToTerms(false) },
        {
          text: 'Sign Out',
          onPress: () => router.replace('/(auth)/login'),
          style: 'destructive',
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <MaterialIcons name="description" size={60} color="#2F2F6F" />
          <Text style={styles.headerTitle}>Terms & Conditions</Text>
          <Text style={styles.headerSubtitle}>Please read and accept our terms</Text>
        </View>

        {/* Terms Content */}
        <View style={styles.termsContainer}>
          <Text style={styles.sectionTitle}>1. Use License</Text>
          <Text style={styles.sectionContent}>
            Permission is granted to temporarily download one copy of the materials (information or software) on BarterBayan's website/app for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:
          </Text>

          <Text style={styles.bulletPoint}>• Modifying or copying the materials</Text>
          <Text style={styles.bulletPoint}>• Using the materials for any commercial purpose or for any public display</Text>
          <Text style={styles.bulletPoint}>• Attempting to decompile or reverse engineer any software contained</Text>
          <Text style={styles.bulletPoint}>• Removing any copyright or other proprietary notations from the materials</Text>

          <Text style={styles.sectionTitle}>2. Disclaimer</Text>
          <Text style={styles.sectionContent}>
            The materials on BarterBayan's website/app are provided on an 'as is' basis. BarterBayan makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.
          </Text>

          <Text style={styles.sectionTitle}>3. Limitations</Text>
          <Text style={styles.sectionContent}>
            In no event shall BarterBayan or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on BarterBayan's website/app.
          </Text>

          <Text style={styles.sectionTitle}>4. Accuracy of Materials</Text>
          <Text style={styles.sectionContent}>
            The materials appearing on BarterBayan's website/app could include technical, typographical, or photographic errors. BarterBayan does not warrant that any of the materials on the website/app are accurate, complete, or current. BarterBayan may make changes to the materials contained on the website/app at any time without notice.
          </Text>

          <Text style={styles.sectionTitle}>5. Materials Limitations</Text>
          <Text style={styles.sectionContent}>
            The materials and services on BarterBayan's website/app are provided on an 'as-is' basis for current information only, and BarterBayan shall not be liable should information on the website/app be inaccurate, incomplete, or not current.
          </Text>

          <Text style={styles.sectionTitle}>6. Modifications</Text>
          <Text style={styles.sectionContent}>
            BarterBayan may revise these website terms of service for its website/app at any time without notice. By using this website/app, you are agreeing to be bound by the then current version of these terms of service.
          </Text>

          <Text style={styles.sectionTitle}>7. Governing Law</Text>
          <Text style={styles.sectionContent}>
            These terms and conditions are governed by and construed in accordance with the laws of your jurisdiction, and you irrevocably submit to the exclusive jurisdiction of the courts in that location.
          </Text>
        </View>
      </ScrollView>

      {/* Agreement Section */}
      <View style={styles.agreementSection}>
        <TouchableOpacity
          style={styles.checkboxContainer}
          onPress={() => setAgreeToTerms(!agreeToTerms)}
        >
          <View style={[styles.checkbox, agreeToTerms && styles.checkboxChecked]}>
            {agreeToTerms && (
              <MaterialIcons name="check" size={18} color="#FFFFFF" />
            )}
          </View>
          <Text style={styles.checkboxLabel}>
            I agree to the Terms & Conditions
          </Text>
        </TouchableOpacity>

        {/* Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.declineButton]}
            onPress={handleDecline}
            disabled={isSubmitting}
          >
            <Text style={styles.declineButtonText}>Decline</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.button,
              styles.acceptButton,
              !agreeToTerms && styles.acceptButtonDisabled,
            ]}
            onPress={handleAccept}
            disabled={isSubmitting || !agreeToTerms}
          >
            <Text style={styles.acceptButtonText}>
              {isSubmitting ? 'Accepting...' : 'Accept & Continue'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 200,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000000',
    marginTop: 12,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666666',
  },
  termsContainer: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2F2F6F',
    marginTop: 20,
    marginBottom: 10,
  },
  sectionContent: {
    fontSize: 14,
    color: '#333333',
    lineHeight: 22,
    marginBottom: 12,
  },
  bulletPoint: {
    fontSize: 14,
    color: '#333333',
    lineHeight: 20,
    marginLeft: 10,
    marginBottom: 6,
  },
  agreementSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    padding: 20,
    paddingBottom: 30,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#2F2F6F',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#2F2F6F',
    borderColor: '#2F2F6F',
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#000000',
    fontWeight: '500',
    flex: 1,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  declineButton: {
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  declineButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666666',
  },
  acceptButton: {
    backgroundColor: '#2F2F6F',
  },
  acceptButtonDisabled: {
    backgroundColor: '#CCCCCC',
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});