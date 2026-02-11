import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { auth, db } from '@/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useRouter } from 'expo-router';

export default function ProfileScreen() {
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (auth.currentUser) {
        try {
          const docRef = doc(db, "users", auth.currentUser.uid);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            setUserData(docSnap.data());
          }
        } catch (error) {
          console.error("Error fetching profile:", error);
        } finally {
          setLoading(false);
        }
      }
    };

    fetchUserProfile();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    router.replace('/login');
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;

  return (
    <View style={styles.container}>
      <View style={styles.profileCard}>
        <Text style={styles.label}>Username</Text>
        <Text style={styles.value}>{userData?.username || 'N/A'}</Text>
        
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{userData?.email}</Text>

        <Text style={styles.label}>Trader Rating</Text>
        <Text style={styles.value}>⭐ {userData?.rating}</Text>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff', justifyContent: 'center' },
  profileCard: { padding: 20, borderRadius: 15, backgroundColor: '#f9f9f9', marginBottom: 20 },
  label: { color: '#888', fontSize: 12, marginBottom: 4, textTransform: 'uppercase' },
  value: { fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  logoutButton: { backgroundColor: '#D9534F', padding: 15, borderRadius: 10, alignItems: 'center' },
  logoutText: { color: '#fff', fontWeight: 'bold' }
});