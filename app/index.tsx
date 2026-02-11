import { Redirect } from 'expo-router';

export default function RootIndex() {
  // This sends users to your login screen immediately
  return <Redirect href="/(auth)/login" />;
}