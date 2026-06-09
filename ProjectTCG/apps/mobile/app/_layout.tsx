import { Stack } from 'expo-router';

// Minimal layout — stripping dependencies to isolate getDevServer error
export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
