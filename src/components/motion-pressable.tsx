import * as Haptics from 'expo-haptics';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  type GestureResponderEvent,
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { IOS_MOTION } from '@/lib/ios-motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface MotionPressableProps extends Omit<PressableProps, 'children' | 'style'> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  pressedScale?: number;
  haptic?: boolean;
  hoverScale?: number;
  hoverLift?: number;
  hoverTilt?: number;
  enableHover?: boolean;
}

export function MotionPressable({
  children,
  style,
  pressedScale = 0.975,
  haptic = true,
  hoverScale = 1.008,
  hoverLift = 1.5,
  hoverTilt = 0,
  enableHover = true,
  disabled,
  onPressIn,
  onPressOut,
  onHoverIn,
  onHoverOut,
  onLayout,
  onPointerMove,
  onPointerCancel,
  ...props
}: MotionPressableProps) {
  const scale = useSharedValue(1);
  const lift = useSharedValue(0);
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);
  const hoveredRef = useRef(false);
  const sizeRef = useRef({ width: 1, height: 1 });
  const [precisePointer, setPrecisePointer] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setPrecisePointer(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 900 },
      { translateY: lift.value },
      { rotateX: `${tiltX.value}deg` },
      { rotateY: `${tiltY.value}deg` },
      { scale: scale.value },
    ],
  }));

  const settleTilt = () => {
    tiltX.value = reduceMotion ? 0 : withSpring(0, IOS_MOTION.springs.hover);
    tiltY.value = reduceMotion ? 0 : withSpring(0, IOS_MOTION.springs.hover);
  };

  const handlePressIn = (event: GestureResponderEvent) => {
    scale.value = reduceMotion ? pressedScale : withSpring(pressedScale, IOS_MOTION.springs.press);
    lift.value = reduceMotion ? 0 : withSpring(0, IOS_MOTION.springs.press);
    if (haptic && process.env.EXPO_OS !== 'web') void Haptics.selectionAsync();
    onPressIn?.(event);
  };

  const handlePressOut = (event: GestureResponderEvent) => {
    const restingScale = hoveredRef.current ? hoverScale : 1;
    const restingLift = hoveredRef.current ? -hoverLift : 0;
    scale.value = reduceMotion ? restingScale : withSpring(restingScale, IOS_MOTION.springs.press);
    lift.value = reduceMotion ? restingLift : withSpring(restingLift, IOS_MOTION.springs.press);
    onPressOut?.(event);
  };

  const handleHoverIn: NonNullable<MotionPressableProps['onHoverIn']> = (event) => {
    if (!enableHover || !precisePointer) {
      onHoverIn?.(event);
      return;
    }
    hoveredRef.current = true;
    scale.value = reduceMotion ? hoverScale : withSpring(hoverScale, IOS_MOTION.springs.hover);
    lift.value = reduceMotion ? -hoverLift : withSpring(-hoverLift, IOS_MOTION.springs.hover);
    onHoverIn?.(event);
  };

  const handleHoverOut: NonNullable<MotionPressableProps['onHoverOut']> = (event) => {
    if (!enableHover || !precisePointer) {
      onHoverOut?.(event);
      return;
    }
    hoveredRef.current = false;
    scale.value = reduceMotion ? 1 : withSpring(1, IOS_MOTION.springs.hover);
    lift.value = reduceMotion ? 0 : withSpring(0, IOS_MOTION.springs.hover);
    settleTilt();
    onHoverOut?.(event);
  };

  const handlePointerMove: NonNullable<PressableProps['onPointerMove']> = (event) => {
    if (precisePointer && enableHover && hoverTilt > 0 && !reduceMotion) {
      const { width, height } = sizeRef.current;
      const nx = Math.max(-0.5, Math.min(0.5, event.nativeEvent.offsetX / width - 0.5));
      const ny = Math.max(-0.5, Math.min(0.5, event.nativeEvent.offsetY / height - 0.5));
      tiltX.value = withSpring(-ny * hoverTilt * 2, IOS_MOTION.springs.hover);
      tiltY.value = withSpring(nx * hoverTilt * 2, IOS_MOTION.springs.hover);
    }
    onPointerMove?.(event);
  };

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      onPointerMove={handlePointerMove}
      onPointerCancel={(event) => {
        settleTilt();
        onPointerCancel?.(event);
      }}
      onLayout={(event) => {
        sizeRef.current = event.nativeEvent.layout;
        onLayout?.(event);
      }}
      style={[style, animatedStyle, disabled && { opacity: 0.52 }]}
    >
      {children}
    </AnimatedPressable>
  );
}
