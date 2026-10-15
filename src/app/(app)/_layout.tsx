import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="thinking-mode" />
      <Stack.Screen name="word-detail" />
      <Stack.Screen name="dialogue" />
      <Stack.Screen name="shadowing" />
      <Stack.Screen name="diary" />
      <Stack.Screen name="map" />
      <Stack.Screen name="achievements" />
      <Stack.Screen name="record" />
      <Stack.Screen name="scene-map" />
      <Stack.Screen name="scene-detail" />
      <Stack.Screen name="scene-dialogue" />
    </Stack>
  );
}
