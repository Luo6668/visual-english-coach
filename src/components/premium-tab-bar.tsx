import { BookOpen, ChartNoAxesColumnIncreasing, Home, Sparkles, User } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolateColor,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MotionPressable } from '@/components/motion-pressable';
import { IOS_MOTION } from '@/lib/ios-motion';

const BLUE = '#2F6FED';
const BLUE_DARK = '#174EA6';
const INACTIVE = '#8A98AB';

const TAB_CONFIG = {
  home: { label: '首页', icon: Home },
  learning: { label: '学习', icon: BookOpen },
  'ai-coach': { label: 'AI教练', icon: Sparkles },
  growth: { label: '成长', icon: ChartNoAxesColumnIncreasing },
  profile: { label: '我的', icon: User },
} as const;

function AnimatedTabItem({
  routeName,
  focused,
  scale,
  onPress,
  onLongPress,
}: {
  routeName: keyof typeof TAB_CONFIG;
  focused: boolean;
  scale: number;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(focused ? 1 : 0);
  const config = TAB_CONFIG[routeName];
  const Icon = config.icon;
  const isCoach = routeName === 'ai-coach';

  useEffect(() => {
    progress.value = reduceMotion
      ? focused ? 1 : 0
      : withSpring(focused ? 1 : 0, IOS_MOTION.springs.navigation);
  }, [focused, progress, reduceMotion]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -2.5 * progress.value },
      { scale: 1 + 0.08 * progress.value },
    ],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: 0.7 + 0.3 * progress.value,
    color: interpolateColor(progress.value, [0, 1], [INACTIVE, '#FFFFFF']),
    transform: [{ translateY: -1 * progress.value }],
  }));

  const activeIconStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const inactiveIconStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));

  return (
    <MotionPressable
      accessibilityRole="tab"
      accessibilityLabel={config.label}
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      onLongPress={onLongPress}
      pressedScale={0.92}
      style={styles.tabItem}
    >
      <Animated.View
        style={[
          styles.iconWrap,
          { width: 36 * scale, height: 36 * scale },
          isCoach && styles.coachIconWrap,
          isCoach && focused && styles.coachIconWrapFocused,
          iconStyle,
        ]}
      >
        {isCoach ? <Icon size={31 * scale} color="#FFFFFF" strokeWidth={2.3} /> : (
          <>
            <Animated.View style={[styles.layeredIcon, inactiveIconStyle]}><Icon size={30 * scale} color="#111820" strokeWidth={2} /></Animated.View>
            <Animated.View style={[styles.layeredIcon, activeIconStyle]}><Icon size={30 * scale} color="#FFFFFF" strokeWidth={2.4} /></Animated.View>
          </>
        )}
      </Animated.View>
      {!isCoach ? (
        <Animated.Text style={[styles.tabLabel, { fontSize: 17 * scale, lineHeight: 21 * scale }, labelStyle]}>
          {config.label}
        </Animated.Text>
      ) : (
        <View style={[styles.coachDot, focused && styles.coachDotFocused]} />
      )}
    </MotionPressable>
  );
}

export function PremiumTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const scale = Math.min(1, Math.max(0.5, width / 850));
  const visibleRoutes = state.routes.filter((route: any) => route.name !== 'ai-coach');
  const activeRoute = state.routes[state.index];
  const visibleIndex = Math.max(0, visibleRoutes.findIndex((route: any) => route.key === activeRoute?.key));
  const barWidth = Math.min(width - 54 * scale, 744);
  const horizontalPadding = 8 * scale;
  const itemWidth = (barWidth - horizontalPadding * 2) / visibleRoutes.length;
  const indicatorX = useSharedValue(horizontalPadding + itemWidth * visibleIndex + 3 * scale);
  const indicatorScaleX = useSharedValue(1);

  useEffect(() => {
    const nextX = horizontalPadding + itemWidth * visibleIndex + 3 * scale;
    if (reduceMotion) {
      indicatorX.value = nextX;
      indicatorScaleX.value = 1;
      return;
    }
    indicatorScaleX.value = withSequence(
      withTiming(1.16, IOS_MOTION.instant),
      withSpring(1, IOS_MOTION.springs.navigation),
    );
    indicatorX.value = withSpring(nextX, IOS_MOTION.springs.navigation);
  }, [indicatorScaleX, indicatorX, itemWidth, reduceMotion, scale, visibleIndex]);

  const indicatorStyle = useAnimatedStyle(() => ({
    width: Math.max(itemWidth - 6 * scale, 48),
    transform: [{ translateX: indicatorX.value }, { scaleX: indicatorScaleX.value }],
  }));

  return (
    <View
      style={[styles.shell, { paddingBottom: Math.max(insets.bottom, 25 * scale), paddingTop: 5 * scale }]}
    >
      <View style={[styles.bar, { width: barWidth, height: 108 * scale, borderRadius: 56 * scale, paddingHorizontal: horizontalPadding }]}>
        <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.94)', 'rgba(228,244,255,0.62)', 'rgba(249,252,255,0.84)']} locations={[0, 0.54, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
        <View pointerEvents="none" style={styles.barTopShine} />
        <Animated.View pointerEvents="none" style={[styles.activeCapsule, { top: 7 * scale, height: 94 * scale, borderRadius: 48 * scale }, indicatorStyle]}>
          <LinearGradient colors={['#A7F5FF', '#32B5FF', '#0B7CFA', '#075FE5', '#9DEEFF']} locations={[0, 0.22, 0.5, 0.78, 1]} start={{ x: 0.08, y: 0 }} end={{ x: 0.92, y: 1 }} style={StyleSheet.absoluteFillObject} />
          <View style={styles.capsuleShine} />
          <View style={styles.capsuleInnerEdge} />
        </Animated.View>
        {visibleRoutes.map((route: any) => {
          const focused = activeRoute?.key === route.key;
          const routeName = route.name as keyof typeof TAB_CONFIG;
          return (
            <AnimatedTabItem
              key={route.key}
              routeName={routeName}
              focused={focused}
              scale={scale}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
              }}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignItems: 'center',
    backgroundColor: 'rgba(250,253,255,0.9)',
    shadowColor: '#1C3D6B',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 28,
    elevation: 12,
  },
  bar: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.66)',
    borderWidth: 1.5,
    borderColor: 'rgba(181,220,247,0.76)',
    shadowColor: '#3877B8',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 28,
    elevation: 8,
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(24px) saturate(1.5)', WebkitBackdropFilter: 'blur(24px) saturate(1.5)', isolation: 'isolate' } as any) : null),
  },
  barTopShine: { position: 'absolute', left: '5%', right: '5%', top: 2, height: 2, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.92)' },
  activeCapsule: {
    position: 'absolute',
    left: 0,
    borderWidth: 1,
    borderColor: 'rgba(231,253,255,0.95)',
    overflow: 'hidden',
    shadowColor: '#0089FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55,
    shadowRadius: 13,
    elevation: 6,
  },
  capsuleShine: { position: 'absolute', left: '12%', right: '12%', top: 3, height: '34%', borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.3)' },
  capsuleInnerEdge: { ...StyleSheet.absoluteFillObject, borderRadius: 48, borderWidth: 1, borderColor: 'rgba(210,252,255,0.72)' },
  tabItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    zIndex: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  layeredIcon: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  tabLabel: {
    color: INACTIVE,
    fontWeight: '700',
  },
  tabLabelFocused: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  coachIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: BLUE,
    marginTop: -14,
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.34,
    shadowRadius: 13,
    elevation: 6,
  },
  coachIconWrapFocused: {
    backgroundColor: BLUE_DARK,
    shadowOpacity: 0.46,
  },
  coachDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    marginTop: -1,
  },
  coachDotFocused: {
    width: 16,
    backgroundColor: BLUE,
  },
});
