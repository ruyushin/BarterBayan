import { Stack } from 'expo-router';

export default function AuthLayout() {
  const StackAny: any = Stack;
  return (
    <StackAny screenOptions={{ headerShown: false }}>
      <StackAny.Screen name="login" />
      <StackAny.Screen name="signup" />
      <StackAny.Screen name="verify" />
      <StackAny.Screen name="forgot-password" />
    </StackAny>
  );
}
                                      