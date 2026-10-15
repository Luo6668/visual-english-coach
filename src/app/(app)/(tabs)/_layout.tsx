import { Tabs } from 'expo-router';
import { BookOpen, Home, Sparkles, TreePine, User } from 'lucide-react-native';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BLUE = '#4A90E2';
const BLUE_DARK = '#2E5C8A';
const INACTIVE = '#B0BAC9';

function AiTabIcon({ color: _color, focused }: { color: string; focused: boolean }) {
  return (
    <View style={{
      width: 48, height: 48, borderRadius: 24,
      backgroundColor: focused ? BLUE_DARK : BLUE,
      alignItems: 'center', justifyContent: 'center',
      marginBottom: 2,
      shadowColor: BLUE,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: focused ? 0.5 : 0.3,
      shadowRadius: 8,
    }}>
      <Sparkles size={22} color="#FFFFFF" />
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: BLUE,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: {
          height: 68 + insets.bottom,
          paddingBottom: insets.bottom + 6,
          paddingTop: 8,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 0.5,
          borderTopColor: '#E2E8F0',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.08,
          shadowRadius: 16,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 1 },
      }}
      initialRouteName="home"
    >
      <Tabs.Screen name="home"      options={{ title: '首页',    tabBarIcon: ({ color, size }) => <Home     size={size} color={color} /> }} />
      <Tabs.Screen name="learning"  options={{ title: '学习',    tabBarIcon: ({ color, size }) => <BookOpen  size={size} color={color} /> }} />
      <Tabs.Screen name="ai-coach"  options={{ title: 'AI教练',  tabBarLabel: () => null, tabBarIcon: ({ color, focused }) => <AiTabIcon color={color} focused={focused} /> }} />
      <Tabs.Screen name="growth"    options={{ title: '成长',    tabBarIcon: ({ color, size }) => <TreePine  size={size} color={color} /> }} />
      <Tabs.Screen name="profile"   options={{ title: '我的',    tabBarIcon: ({ color, size }) => <User      size={size} color={color} /> }} />
    </Tabs>
  );
}
