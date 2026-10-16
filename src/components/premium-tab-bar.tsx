import { BookOpen, Home, Sparkles, TreePine, User } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MotionPressable } from '@/components/motion-pressable';

const BLUE = '#2F6FED';
const BLUE_DARK = '#174EA6';
const INACTIVE = '#8A98AB';

const TAB_CONFIG = {
  home: { label: '首页', icon: Home },
  learning: { label: '学习', icon: BookOpen },
  'ai-coach': { label: 'AI教练', icon: Sparkles },
  growth: { label: '成长', icon: TreePine },
  profile: { label: '我的', icon: User },
} as const;

function AnimatedTabItem({
  routeName,
  focused,
  onPress,
  onLongPress,
}: {
  routeName: keyof typeof TAB_CONFIG;
  focused: boolean;
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
      : withSpring(focused ? 1 : 0, { damping: 17, stiffness: 260, mass: 0.7 });
  }, [focused, progress, reduceMotion]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -2.5 * progress.value },
      { scale: 1 + 0.08 * progress.value },
    ],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: 0.7 + 0.3 * progress.value,
    transform: [{ translateY: -1 * progress.value }],
  }));

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
          isCoach && styles.coachIconWrap,
          isCoach && focused && styles.coachIconWrapFocused,
          iconStyle,
        ]}
      >
        <Icon
          size={isCoach ? 21 : 20}
          color={isCoach ? '#FFFFFF' : focused ? BLUE : INACTIVE}
          strokeWidth={focused ? 2.4 : 2}
        />
      </Animated.View>
      {!isCoach ? (
        <Animated.Text style={[styles.tabLabel, focused && styles.tabLabelFocused, labelStyle]}>
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
  const barWidth = Math.min(width, 760);
  const horizontalPadding = 10;
  const itemWidth = (barWidth - horizontalPadding * 2) / state.routes.length;
  const indicatorX = useSharedValue(horizontalPadding + itemWidth * state.index + 4);
  const indicatorScaleX = useSharedValue(1);

  useEffect(() => {
    const nextX = horizontalPadding + itemWidth * state.index + 4;
    if (reduceMotion) {
      indicatorX.value = nextX;
      indicatorScaleX.value = 1;
      return;
    }
    indicatorScaleX.value = withSequence(
      withTiming(1.28, { duration: 90 }),
      withSpring(1, { damping: 16, stiffness: 230 }),
    );
    indicatorX.value = withSpring(nextX, { damping: 20, stiffness: 210, mass: 0.8 });
  }, [indicatorScaleX, indicatorX, itemWidth, reduceMotion, state.index]);

  const indicatorStyle = useAnimatedStyle(() => ({
    width: Math.max(itemWidth - 8, 48),
    transform: [{ translateX: indicatorX.value }, { scaleX: indicatorScaleX.value }],
  }));

  return (
    <View style={[styles.shell, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      <View style={[styles.bar, { width: barWidth }]}>
        <Animated.View pointerEvents="none" style={[styles.activeCapsule, indicatorStyle]} />
        {state.routes.map((route: any, index: number) => {
          const focused = state.index === index;
          const routeName = route.name as keyof typeof TAB_CONFIG;
          return (
            <AnimatedTabItem
              key={route.key}
              routeName={routeName}
              focused={focused}
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
    backgroundColor: '#FFFFFF',
    borderTopColor: '#E6EBF2',
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: '#1C3D6B',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
    elevation: 12,
  },
  bar: {
    position: 'relative',
    height: 66,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  activeCapsule: {
    position: 'absolute',
    top: 7,
    left: 0,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#EDF4FF',
    borderWidth: 1,
    borderColor: '#DCE9FF',
  },
  tabItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    zIndex: 1,
  },
  iconWrap: {
    width: 27,
    height: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    color: INACTIVE,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
  },
  tabLabelFocused: {
    color: BLUE_DARK,
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
