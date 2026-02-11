import { auth } from '@/firebaseConfig';
import { Redirect } from 'expo-router';

export default function Index() {
  const user = auth.currentUser;

  // If there is no user, send them to login
  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  // If there is a user, send them to the main app
  return <Redirect href="/(tabs)" />;
}