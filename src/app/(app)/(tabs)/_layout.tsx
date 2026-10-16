import { Tabs } from 'expo-router';
import { PremiumTabBar } from '@/components/premium-tab-bar';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <PremiumTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
      initialRouteName="home"
    >
      <Tabs.Screen name="home" options={{ title: '首页' }} />
      <Tabs.Screen name="learning" options={{ title: '学习' }} />
      <Tabs.Screen name="ai-coach" options={{ title: 'AI教练' }} />
      <Tabs.Screen name="growth" options={{ title: '成长' }} />
      <Tabs.Screen name="profile" options={{ title: '我的' }} />
    </Tabs>
  );
}
