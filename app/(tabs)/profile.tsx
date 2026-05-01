import { useRouter } from 'expo-router';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '../../firebaseConfig';

export default function ProfileScreen() {
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const router = useRouter();

  const fetchProfile = async (currentUser: User) => {
    setLoading(true);
    setRetrying(false);

    try {
      const docRef = doc(db, 'users', currentUser.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        setUserData(docSnap.data());
        setError(null);
      } else {
        setError('Profile not found');
        setUserData({
          email: currentUser.email,
          username: currentUser.displayName || 'Unknown user',
          rating: 'N/A',
        });
      }
    } catch (err: any) {
      console.error('Error fetching profile:', err);
      const isOffline = err?.code === 'unavailable' || /client is offline/i.test(err?.message);

      if (isOffline) {
        setError('Offline: unable to load profile. Check network and retry.');
        setUserData({
          email: currentUser.email,
          username: currentUser.displayName || 'Offline user',
          rating: 'N/A',
        });
      } else {
        setError('Failed to load profile');
      }
    } finally {
      setLoading(false);
      setRetrying(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser: User | null) => {
      setAuthInitialized(true);
      if (!currentUser) {
        router.replace('/login');
        return;
      }

      await fetchProfile(currentUser);
    });

    return () => {
      unsubscribe();
    };
  }, [router]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleRetry = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      router.replace('/login');
      return;
    }

    setRetrying(true);
    await fetchProfile(currentUser);
  };

  if (!authInitialized || loading || retrying) return <ActivityIndicator style={{ flex: 1 }} />;

  if (error && !userData) {
    return (
      <View style={styles.container}>
        <Text style={{ textAlign: 'center', color: '#333', fontSize: 16, marginBottom: 16 }}>
          {error}
        </Text>
        <TouchableOpacity style={styles.logoutButton} onPress={() => router.replace('/login')}>
          <Text style={styles.logoutText}>Go to Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (error && userData) {
    return (
      <View style={styles.container}>
        <Text style={{ textAlign: 'center', color: '#333', fontSize: 16, marginBottom: 16 }}>
          {error}
        </Text>
        <View style={styles.profileCard}>
          <Text style={styles.label}>Username</Text>
          <Text style={styles.value}>{userData?.username || 'N/A'}</Text>

          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{userData?.email || 'N/A'}</Text>

          <Text style={styles.label}>Trader Rating</Text>
          <Text style={styles.value}>⭐ {userData?.rating || 'N/A'}</Text>
        </View>
        <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!userData) {
    return (
      <View style={styles.container}>
        <Text style={{ textAlign: 'center', color: '#333', fontSize: 16, marginBottom: 20 }}>
          Profile data is not available.
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.logoutButton} onPress={() => router.replace('/login')}>
          <Text style={styles.logoutText}>Go to Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
  logoutButton: { backgroundColor: '#D9534F', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  logoutText: { color: '#fff', fontWeight: 'bold' },
  retryButton: { backgroundColor: '#5BC0DE', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  retryText: { color: '#fff', fontWeight: 'bold' }
});