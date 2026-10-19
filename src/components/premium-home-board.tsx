/* global require */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleX,
  Flame,
  Headphones,
  Mic,
  Volume2,
} from 'lucide-react-native';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Extrapolation,
  FadeInDown,
  FadeOut,
  interpolate,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { MotionPressable } from '@/components/motion-pressable';
import { IOS_MOTION, resistedOffset } from '@/lib/ios-motion';

const BLUE = '#087CFF';
const BLUE_DARK = '#075EE8';
const INK = '#101820';
const MUTED = '#556B88';
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const webGlass = (filter: string) => Platform.OS === 'web'
  ? ({ backdropFilter: filter, WebkitBackdropFilter: filter, isolation: 'isolate' } as any)
  : null;

type RecordItem = {
  id: string;
  scene_name: string;
  scene_image?: string;
  i_see?: string;
};

type Props = {
  topInset: number;
  streakDays: number;
  todayCount: number;
  records: RecordItem[];
  loading: boolean;
  sceneText: string;
  recState: 'idle' | 'requesting' | 'recording' | 'transcribing';
  recSeconds: number;
  recError: string;
  onSceneTextChange: (value: string) => void;
  onCamera: () => void;
  onGallery: () => void;
  onSubmitText: () => void;
  onRecord: () => void;
  onOpenCoach: (prompt?: string) => void;
  onOpenLearning: () => void;
  onOpenRecord: (record: RecordItem) => void;
  onOpenGrowth: () => void;
  onSpeakWord: (word?: string) => void;
  onInteractionLockChange?: (locked: boolean) => void;
  getScrollOffset?: () => number;
};

type SceneCard = {
  key: string;
  source: any;
  title: string;
  subtitle: string;
  prompt: string;
  description: string;
  phrases: readonly [string, string][];
};

type SpatialOverlayKind = 'scene' | 'hero' | 'coach' | 'album';

type SpatialOverlayState = {
  kind: SpatialOverlayKind;
  scene: SceneCard;
  origin: { x: number; y: number; width: number; height: number };
  scrollOffset: number;
};

const WORDS = [
  { english: 'latte', chinese: '拿铁', pronunciation: '/ˈlɑːteɪ/', example: 'Could I have a latte, please?' },
  { english: 'espresso', chinese: '浓缩咖啡', pronunciation: '/eˈspresəʊ/', example: 'One espresso, please.' },
  { english: 'receipt', chinese: '收据', pronunciation: '/rɪˈsiːt/', example: 'Could I have the receipt?' },
] as const;

const ASSETS = {
  hero: require('../../assets/home-premium/hero-photo.png'),
  lessonCity: require('../../assets/home-premium/lesson-city.png'),
  lessonAirport: require('../../assets/home-premium/lesson-airport.png'),
  orb: require('../../assets/home-premium/orb-clean.png'),
  coffee: require('../../assets/home-premium/coffee.png'),
  city: require('../../assets/home-premium/city.png'),
  plane: require('../../assets/home-premium/plane.png'),
  latte: require('../../assets/home-premium/latte-cup.png'),
  latteDetail: require('../../assets/home-premium/latte-detail.png'),
  sceneCoffee: require('../../assets/home-premium/scene-coffee.png'),
  sceneAirport: require('../../assets/home-premium/scene-airport.png'),
  sceneHotel: require('../../assets/home-premium/scene-hotel.png'),
  send: require('../../assets/home-premium/send-plane.png'),
  cameraOrbit: require('../../assets/home-premium/camera-orbit.png'),
  locationPin: require('../../assets/home-premium/location-pin.png'),
  trackCheck: require('../../assets/home-premium/track-check.png'),
  trackPlane: require('../../assets/home-premium/track-plane.png'),
  trackWork: require('../../assets/home-premium/track-work.png'),
};

const SCENES: readonly SceneCard[] = [
  {
    key: 'coffee',
    source: ASSETS.sceneCoffee,
    title: '咖啡馆',
    subtitle: '日常生活',
    prompt: '练习咖啡馆日常英语',
    description: '从进店、点单到结账，在真实对话节奏中练习自然表达。',
    phrases: [['Could I have a latte?', '我可以要一杯拿铁吗？'], ['For here or to go?', '堂食还是外带？']],
  },
  {
    key: 'airport',
    source: ASSETS.sceneAirport,
    title: '机场',
    subtitle: '出行旅行',
    prompt: '练习机场旅行英语',
    description: '练习值机、托运行李与寻找登机口时最常用的英语。',
    phrases: [['Where is gate 12?', '12 号登机口在哪里？'], ['I have one bag to check.', '我有一件行李要托运。']],
  },
  {
    key: 'hotel',
    source: ASSETS.sceneHotel,
    title: '酒店',
    subtitle: '住宿入住',
    prompt: '练习酒店入住英语',
    description: '从办理入住到提出客房需求，完成一次自然的住宿交流。',
    phrases: [['I have a reservation.', '我预订了房间。'], ['Could I get a late checkout?', '可以延迟退房吗？']],
  },
];

const ALBUM_SCENES: readonly SceneCard[] = [
  SCENES[0],
  {
    key: 'city-walk',
    source: ASSETS.city,
    title: '城市漫游',
    subtitle: '问路与探索',
    prompt: '练习城市问路英语',
    description: '围绕城市地标、方向与交通方式，练习清晰自然的问路表达。',
    phrases: [['How do I get downtown?', '去市中心怎么走？'], ['Is it within walking distance?', '走路可以到吗？']],
  },
  { ...SCENES[1], source: ASSETS.plane },
];

function Glass({
  children,
  style,
  tint = ['rgba(255,255,255,0.93)', 'rgba(239,248,255,0.76)', 'rgba(255,255,255,0.88)'],
}: {
  children: ReactNode;
  style?: any;
  tint?: readonly [string, string, ...string[]];
}) {
  return (
    <View style={[styles.glassShell, webGlass('blur(20px) saturate(1.3)'), style]}>
      <LinearGradient colors={tint as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.76)', 'rgba(255,255,255,0.12)', 'rgba(93,196,255,0.10)', 'rgba(133,111,255,0.12)']}
        locations={[0, 0.38, 0.72, 1]}
        start={{ x: 0.02, y: 0.02 }}
        end={{ x: 0.98, y: 0.98 }}
        style={styles.glassReflection}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.96)', 'rgba(255,255,255,0.2)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.glassTopEdge}
      />
      <View pointerEvents="none" style={styles.glassInnerEdge} />
      {children}
    </View>
  );
}

function Waveform({ u, active }: { u: number; active: boolean }) {
  const bars = [18, 31, 49, 34, 61, 43, 74, 49, 65, 32, 53, 27, 43, 20];
  return (
    <View style={[styles.wave, { height: 72 * u, gap: 5 * u }]}>
      {bars.map((height, index) => (
        <View
          key={`${height}-${index}`}
          style={{
            width: 5 * u,
            height: (active ? height : Math.max(14, height * 0.62)) * u,
            borderRadius: 3 * u,
            backgroundColor: index % 3 === 0 ? '#58CFFF' : BLUE,
            opacity: active ? 1 : 0.82,
          }}
        />
      ))}
    </View>
  );
}

function MicGlassControl({ u, active }: { u: number; active: boolean }) {
  const size = 180 * u;
  const center = size / 2;
  const ringRadius = 71 * u;
  const circumference = Math.PI * 2 * ringRadius;

  return (
    <View style={[styles.micGlassControl, { width: size, height: size, borderRadius: center }]}> 
      <View style={[styles.micGlassSurface, { borderRadius: center }]}> 
        <LinearGradient
          colors={['rgba(255,255,255,0.82)', 'rgba(203,240,255,0.38)', 'rgba(255,255,255,0.62)']}
          start={{ x: 0.12, y: 0 }}
          end={{ x: 0.88, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </View>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={StyleSheet.absoluteFillObject}>
        <Defs>
          <RadialGradient id="micCore" cx="35%" cy="24%" rx="76%" ry="82%">
            <Stop offset="0" stopColor="#4BDBFF" />
            <Stop offset="0.46" stopColor="#0B91FF" />
            <Stop offset="1" stopColor="#0756DE" />
          </RadialGradient>
          <SvgLinearGradient id="micArc" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#58E7FF" />
            <Stop offset="0.52" stopColor="#148CFF" />
            <Stop offset="1" stopColor="#0758DF" />
          </SvgLinearGradient>
        </Defs>
        <Circle cx={center} cy={center} r={ringRadius} fill="none" stroke="rgba(146,210,245,0.34)" strokeWidth={13 * u} />
        <Circle
          cx={center}
          cy={center}
          r={ringRadius}
          fill="none"
          stroke="url(#micArc)"
          strokeWidth={13 * u}
          strokeLinecap="round"
          strokeDasharray={`${circumference * (active ? 0.9 : 0.68)} ${circumference}`}
          transform={`rotate(-132 ${center} ${center})`}
        />
        <Circle cx={center} cy={center} r={56 * u} fill="url(#micCore)" stroke="rgba(230,252,255,0.98)" strokeWidth={2.5 * u} />
        <Circle cx={center} cy={center} r={50 * u} fill="none" stroke="rgba(255,255,255,0.56)" strokeWidth={2 * u} strokeDasharray={`${55 * u} ${260 * u}`} transform={`rotate(-118 ${center} ${center})`} />
      </Svg>
      <View style={styles.micGlyph}><Mic size={48 * u} color="#fff" strokeWidth={2.5} /></View>
    </View>
  );
}

function GoalRing({ u, count }: { u: number; count: number }) {
  const reduceMotion = useReducedMotion();
  const displayCount = Math.min(count || 2, 3);
  const radius = 86 * u;
  const size = 204 * u;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0.08, Math.min(displayCount / 3, 1));
  const progressValue = useSharedValue(reduceMotion ? progress : 0);
  const flash = useSharedValue(0);

  useEffect(() => {
    progressValue.value = reduceMotion ? progress : withSpring(progress, { damping: 20, stiffness: 120, mass: 0.9 });
    if (!reduceMotion && progress >= 1) flash.value = withSequence(withTiming(1, { duration: 180 }), withTiming(0, { duration: 520 }));
  }, [flash, progress, progressValue, reduceMotion]);

  const progressProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progressValue.value),
  }));
  const flashStyle = useAnimatedStyle(() => ({
    opacity: flash.value,
    transform: [{ rotate: `${interpolate(flash.value, [0, 1], [-22, 18])}deg` }],
  }));
  const startAngle = 120;
  const endAngle = ((startAngle + progress * 360) * Math.PI) / 180;
  const endX = size / 2 + radius * Math.cos(endAngle);
  const endY = size / 2 + radius * Math.sin(endAngle);
  return (
    <View style={[styles.goalRingShell, { width: size, height: size, borderRadius: size / 2 }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <SvgLinearGradient id="goalProgress" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#43DBFF" />
            <Stop offset="0.48" stopColor="#0785FF" />
            <Stop offset="1" stopColor="#0752DA" />
          </SvgLinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={radius} fill="rgba(247,255,252,0.66)" stroke="rgba(213,236,242,0.8)" strokeWidth={21 * u} />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#goalProgress)"
          strokeWidth={19 * u}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={progressProps}
          transform={`rotate(${startAngle} ${size / 2} ${size / 2})`}
        />
        <Circle cx={size / 2} cy={size / 2} r={radius - 7 * u} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={2 * u} strokeDasharray={`${circumference * 0.2} ${circumference}`} transform={`rotate(-118 ${size / 2} ${size / 2})`} />
        <Circle cx={endX} cy={endY} r={10 * u} fill="rgba(255,255,255,0.96)" stroke="#8BE8FF" strokeWidth={3 * u} />
      </Svg>
      <Animated.View pointerEvents="none" style={[styles.goalFlash, { width: 42 * u, height: 170 * u }, flashStyle]} />
      <View style={styles.goalRingCopy}>
        <Text style={[styles.goalNumber, { fontSize: 37 * u, lineHeight: 45 * u }]}>{displayCount}/3</Text>
        <View style={{ gap: 4 * u }}>
          {['场景练习', '语音对话', '学习词汇'].map((label, index) => (
            <View key={label} style={[styles.goalLine, { gap: 6 * u }]}>
              <View style={[styles.goalCheck, { width: 18 * u, height: 18 * u, borderRadius: 9 * u }, index < displayCount ? styles.goalCheckDone : null]}>
                {index < displayCount ? <Check size={12 * u} color="#fff" strokeWidth={3} /> : null}
              </View>
              <Text style={[styles.goalLabel, { fontSize: 16 * u, lineHeight: 20 * u }, index < displayCount ? styles.goalLabelDone : null]}>{label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function CardHeading({ title, subtitle, u }: { title: string; subtitle: string; u: number }) {
  return (
    <View style={[styles.cardHeading, { left: 20 * u, right: 16 * u, top: 13 * u }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.headingLine}>
          <Text style={[styles.cardTitle, { fontSize: 25 * u, lineHeight: 31 * u }]}>{title}</Text>
        </View>
        <Text style={[styles.cardSubtitle, { fontSize: 17 * u, lineHeight: 23 * u }]}>{subtitle}</Text>
      </View>
      <View style={[styles.headingArrow, { width: 33 * u, height: 33 * u, borderRadius: 17 * u }]}> 
        <ChevronRight size={20 * u} color={INK} strokeWidth={2.2} />
      </View>
    </View>
  );
}

function CoachOrb({ u, state, onPress }: { u: number; state: Props['recState']; onPress: () => void }) {
  const reduceMotion = useReducedMotion();
  const breath = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(breath);
    if (reduceMotion) {
      breath.value = 0;
      return;
    }
    if (state === 'idle') {
      breath.value = withRepeat(withSequence(withTiming(1, { duration: 2800 }), withTiming(0, { duration: 2800 })), -1, true);
    } else if (state === 'recording') {
      breath.value = withRepeat(withSequence(withTiming(1, { duration: 520 }), withTiming(0.18, { duration: 520 })), -1, true);
    } else {
      breath.value = withRepeat(withSequence(withTiming(0.72, { duration: 760 }), withTiming(0.22, { duration: 760 })), -1, true);
    }
    return () => cancelAnimation(breath);
  }, [breath, reduceMotion, state]);

  const orbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(breath.value, [0, 1], [0, state === 'idle' ? -2 * u : -5 * u]) },
      { scale: interpolate(breath.value, [0, 1], [1, state === 'recording' ? 1.035 : 1.012]) },
    ],
  }));

  return (
    <MotionPressable onPress={onPress} pressedScale={0.96} hoverTilt={2.6} accessibilityRole="button" accessibilityLabel="展开 AI 教练" style={{ position: 'absolute', left: 34 * u, top: 113 * u, width: 176 * u, height: 176 * u }}>
      <Animated.View style={[StyleSheet.absoluteFillObject, orbStyle]}>
        <Image source={ASSETS.orb} style={StyleSheet.absoluteFillObject} contentFit="contain" />
      </Animated.View>
    </MotionPressable>
  );
}

type LessonVisual = {
  key: string;
  image: any;
  kicker: string;
  title: string;
  scene: string;
  description: string;
  progress: number;
  record?: RecordItem;
};

function LessonStack({ u, latest, loading, onOpenRecord, onOpenLearning }: {
  u: number;
  latest?: RecordItem;
  loading: boolean;
  onOpenRecord: (record: RecordItem) => void;
  onOpenLearning: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);
  const locked = useSharedValue(false);
  const cardWidth = 438 * u;
  const lessons = useMemo<LessonVisual[]>(() => [
    {
      key: latest?.id ?? 'coffee',
      image: ASSETS.latteDetail,
      kicker: '第 3 课',
      title: '继续学习',
      scene: latest?.scene_name || '咖啡馆点单',
      description: latest?.i_see || '学习如何在咖啡馆自信点单\n并进行简单交流',
      progress: 3,
      record: latest,
    },
    { key: 'city', image: ASSETS.lessonCity, kicker: '旅行英语', title: '城市漫游', scene: '问路与交通', description: '练习询问方向、换乘方式\n和城市中的自然交流', progress: 4 },
    { key: 'airport', image: ASSETS.lessonAirport, kicker: '出行英语', title: '机场出发', scene: '值机与登机', description: '练习值机、托运行李\n并顺利找到登机口', progress: 2 },
  ], [latest]);

  const commitSwipe = useCallback((direction: 1 | -1) => {
    setActiveIndex(current => (current + direction + lessons.length) % lessons.length);
    translateX.value = 0;
    startX.value = 0;
    locked.value = false;
  }, [lessons.length, locked, startX, translateX]);

  const openActive = useCallback(() => {
    const active = lessons[activeIndex];
    if (active.record) onOpenRecord(active.record);
    else onOpenLearning();
  }, [activeIndex, lessons, onOpenLearning, onOpenRecord]);

  const pan = useMemo(() => Gesture.Pan()
    .activeOffsetX([-9, 9])
    .failOffsetY([-17, 17])
    .onBegin(() => {
      cancelAnimation(translateX);
      locked.value = false;
      startX.value = translateX.value;
    })
    .onUpdate(event => {
      translateX.value = resistedOffset(startX.value + event.translationX, cardWidth * 0.88, 0.3);
    })
    .onEnd(event => {
      const projected = translateX.value + event.velocityX * 0.18;
      const distanceRatio = Math.abs(translateX.value) / cardWidth;
      const velocityRatio = Math.abs(event.velocityX) / Math.max(cardWidth, 1);
      const shouldAdvance = Math.abs(projected) > cardWidth * 0.24 || distanceRatio > 0.31 || velocityRatio > 1.15;
      if (!shouldAdvance) {
        translateX.value = withSpring(0, { ...IOS_MOTION.springs.cardReturn, velocity: event.velocityX });
        return;
      }
      locked.value = true;
      const direction: 1 | -1 = projected < 0 ? 1 : -1;
      const target = direction === 1 ? -590 * u : 590 * u;
      translateX.value = reduceMotion
        ? target
        : withSpring(target, { ...IOS_MOTION.springs.cardCommit, velocity: event.velocityX }, finished => {
          if (finished) runOnJS(commitSwipe)(direction);
        });
      if (reduceMotion) runOnJS(commitSwipe)(direction);
    })
    .onFinalize(() => {
      if (!locked.value && Math.abs(translateX.value) < cardWidth * 0.32) {
        translateX.value = withSpring(0, IOS_MOTION.springs.cardReturn);
      }
    }), [cardWidth, commitSwipe, locked, reduceMotion, startX, translateX, u]);

  const tap = useMemo(() => Gesture.Tap().maxDistance(9).onEnd((_event, success) => {
    if (success && !locked.value) runOnJS(openActive)();
  }), [locked, openActive]);
  const gesture = useMemo(() => Gesture.Exclusive(pan, tap), [pan, tap]);

  const frontStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(translateX.value), [0, 420 * u], [1, 0.16], Extrapolation.CLAMP),
    transform: [
      { perspective: 1100 },
      { translateX: translateX.value },
      { translateY: interpolate(Math.abs(translateX.value), [0, 420 * u], [0, 24 * u], Extrapolation.CLAMP) },
      { rotateZ: `${interpolate(translateX.value, [-420 * u, 0, 420 * u], [-11, 4.5, 15], Extrapolation.CLAMP)}deg` },
      { rotateY: `${interpolate(translateX.value, [-420 * u, 0, 420 * u], [8, 0, -8], Extrapolation.CLAMP)}deg` },
      { scale: interpolate(Math.abs(translateX.value), [0, 420 * u], [1, 0.95], Extrapolation.CLAMP) },
    ],
  }));
  const frontShadowStyle = useAnimatedStyle(() => {
    const amount = Math.min(Math.abs(translateX.value) / Math.max(cardWidth, 1), 1);
    return {
      opacity: 0.2 + amount * 0.16,
      transform: [
        { translateX: translateX.value * 0.08 },
        { translateY: (18 + amount * 12) * u },
        { scaleX: 0.88 - amount * 0.09 },
        { scaleY: 1 + amount * 0.1 },
      ],
    };
  });
  const reflectionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(translateX.value), [0, cardWidth * 0.7], [0.34, 0.68], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(translateX.value, [-cardWidth, cardWidth], [-125 * u, 320 * u], Extrapolation.CLAMP) },
      { rotateZ: '-20deg' },
    ],
  }));
  const middleStyle = useAnimatedStyle(() => {
    const progress = interpolate(Math.abs(translateX.value), [0, 150 * u], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: 0.9 + progress * 0.1,
      transform: [
        { perspective: 1100 },
        { translateX: interpolate(progress, [0, 1], [70 * u, 3 * u]) },
        { translateY: interpolate(progress, [0, 1], [17 * u, 4 * u]) },
        { rotateZ: `${interpolate(progress, [0, 1], [2.3, 4.5])}deg` },
        { scale: interpolate(progress, [0, 1], [0.94, 1]) },
      ],
    };
  });
  const rearStyle = useAnimatedStyle(() => {
    const progress = interpolate(Math.abs(translateX.value), [0, 150 * u], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: 0.78 + progress * 0.12,
      transform: [
        { perspective: 1100 },
        { translateX: interpolate(progress, [0, 1], [130 * u, 70 * u]) },
        { translateY: interpolate(progress, [0, 1], [34 * u, 17 * u]) },
        { rotateZ: `${interpolate(progress, [0, 1], [6, 2.3])}deg` },
        { scale: interpolate(progress, [0, 1], [0.89, 0.94]) },
      ],
    };
  });

  const active = lessons[activeIndex];
  const middle = lessons[(activeIndex + 1) % lessons.length];
  const rear = lessons[(activeIndex + 2) % lessons.length];

  return (
    <View style={{ width: 545 * u, height: 426 * u }}>
      <Animated.View pointerEvents="none" style={[styles.lessonBack, styles.lessonBackRear, { zIndex: 1, width: 400 * u, height: 344 * u, left: 0, top: 0, borderRadius: 28 * u }, rearStyle]}>
        <Image source={rear.image} style={StyleSheet.absoluteFillObject} contentFit="cover" />
        <LinearGradient colors={['rgba(255,255,255,0.12)', 'transparent', 'rgba(56,151,255,0.14)']} style={StyleSheet.absoluteFillObject} />
        <View style={styles.lessonBackEdge} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.lessonBack, styles.lessonBackMiddle, { zIndex: 2, width: 444 * u, height: 353 * u, left: 0, top: 0, borderRadius: 28 * u }, middleStyle]}>
        <Image source={middle.image} style={StyleSheet.absoluteFillObject} contentFit="cover" />
        <LinearGradient colors={['rgba(255,255,255,0.08)', 'transparent', 'rgba(84,194,255,0.1)']} style={StyleSheet.absoluteFillObject} />
        <View style={styles.lessonBackEdge} />
      </Animated.View>
      <GestureDetector gesture={gesture}>
        <Animated.View accessible accessibilityRole="button" accessibilityLabel={`继续学习 ${active.scene}，可左右拖动切换`} style={[styles.lessonFront, Platform.OS === 'web' ? ({ touchAction: 'pan-y', transformStyle: 'preserve-3d', WebkitBackfaceVisibility: 'hidden' } as any) : null, { zIndex: 4, left: 3 * u, top: 4 * u, width: 438 * u, height: 365 * u, borderRadius: 28 * u }, frontStyle]}>
          <LinearGradient colors={['rgba(255,255,255,0.9)', 'rgba(250,250,246,0.76)', 'rgba(221,240,255,0.72)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
          <Animated.View pointerEvents="none" style={[styles.lessonDynamicReflection, { width: 145 * u, height: 470 * u }, reflectionStyle]}><LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.58)', 'rgba(124,211,255,0.12)', 'rgba(255,255,255,0)']} locations={[0, 0.42, 0.64, 1]} style={StyleSheet.absoluteFillObject} /></Animated.View>
          <View pointerEvents="none" style={{ position: 'absolute', left: 28 * u, top: 24 * u, zIndex: 2 }}>
            <Text style={[styles.lessonKicker, { fontSize: 20 * u, lineHeight: 26 * u }]}>{active.kicker}</Text>
            <Text style={[styles.lessonTitle, { fontSize: 39 * u, lineHeight: 48 * u, marginTop: 7 * u }]}>{active.title}</Text>
            <Text style={[styles.lessonScene, { fontSize: 23 * u, lineHeight: 30 * u, marginTop: 4 * u }]}>{active.scene}</Text>
            <Text style={[styles.lessonDescription, { fontSize: 17 * u, lineHeight: 25 * u, marginTop: 6 * u }]}>{active.description}</Text>
          </View>
          <Image source={active.image} style={{ position: 'absolute', right: -8 * u, top: 105 * u, width: 190 * u, height: 154 * u, borderRadius: 77 * u }} contentFit="cover" />
          <View pointerEvents="none" style={[styles.continuePill, { left: 15 * u, bottom: 16 * u, width: 279 * u, height: 74 * u, borderRadius: 38 * u, paddingRight: 18 * u, gap: 14 * u }]}>
            <LinearGradient colors={['rgba(255,255,255,0.98)', 'rgba(238,248,255,0.92)']} style={[StyleSheet.absoluteFillObject, { borderRadius: 38 * u }]} />
            <View style={[styles.playOrb, { width: 72 * u, height: 72 * u, borderRadius: 36 * u }]}><LinearGradient colors={['#43DBFF', '#087CFF', '#0752DF']} style={[StyleSheet.absoluteFillObject, { borderRadius: 36 * u }]} /><Svg width={31 * u} height={34 * u} viewBox="0 0 31 34" style={{ zIndex: 3, marginLeft: 4 * u }}><Path d="M4 2.8C4 1.1 5.9.1 7.3 1l20.2 13.9c1.3.9 1.3 2.8 0 3.7L7.3 32.5C5.9 33.4 4 32.4 4 30.7V2.8Z" fill="#FFFFFF" /></Svg></View>
            <Text style={[styles.continueText, { fontSize: 24 * u }]}>继续学习</Text><ChevronRight size={25 * u} color={BLUE_DARK} />
          </View>
          <View pointerEvents="none" style={{ position: 'absolute', right: 25 * u, bottom: 24 * u, width: 105 * u, alignItems: 'flex-end' }}><Text style={[styles.lessonCount, { fontSize: 21 * u }]}>{active.progress}/8</Text><View style={[styles.lessonProgressTrack, { width: 100 * u, height: 9 * u, borderRadius: 5 * u, marginTop: 7 * u }]}><View style={{ width: `${active.progress / 8 * 100}%`, height: '100%', borderRadius: 5 * u, backgroundColor: BLUE }} /></View></View>
          {loading ? <ActivityIndicator color={BLUE} style={styles.lessonLoader} /> : null}
        </Animated.View>
      </GestureDetector>
      <Animated.View pointerEvents="none" style={[styles.lessonMotionShadow, { left: 24 * u, top: 318 * u, width: 385 * u, height: 42 * u, borderRadius: 21 * u }, frontShadowStyle]} />
    </View>
  );
}

function VocabularyDeck({ u, onSpeak }: { u: number; onSpeak: (word?: string) => void }) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const flip = useSharedValue(0);
  const swipeX = useSharedValue(0);
  const flipTarget = useSharedValue(0);
  const word = WORDS[index];

  const changeWord = useCallback((direction: 1 | -1) => {
    setIndex(current => (current + direction + WORDS.length) % WORDS.length);
    swipeX.value = 0;
    flip.value = 0;
    flipTarget.value = 0;
  }, [flip, flipTarget, swipeX]);

  const tap = useMemo(() => Gesture.Tap().maxDistance(8).onEnd((_event, success) => {
    if (!success) return;
    flipTarget.value = flipTarget.value > 0.5 ? 0 : 1;
    cancelAnimation(flip);
    flip.value = reduceMotion ? flipTarget.value : withSpring(flipTarget.value, IOS_MOTION.springs.flip);
  }), [flip, flipTarget, reduceMotion]);
  const pan = useMemo(() => Gesture.Pan().activeOffsetX([-10, 10]).failOffsetY([-18, 18]).onBegin(() => {
    cancelAnimation(swipeX);
    if (flip.value > 0.04) {
      flipTarget.value = 0;
      flip.value = reduceMotion ? 0 : withTiming(0, IOS_MOTION.instant);
    }
  }).onUpdate(event => {
    swipeX.value = resistedOffset(event.translationX, 170 * u, 0.28);
  }).onEnd(event => {
    const projected = swipeX.value + event.velocityX * 0.14;
    if (Math.abs(projected) < 68 * u) {
      swipeX.value = withSpring(0, { ...IOS_MOTION.springs.cardReturn, velocity: event.velocityX });
      return;
    }
    const direction: 1 | -1 = projected < 0 ? 1 : -1;
    swipeX.value = reduceMotion ? (direction === 1 ? -300 * u : 300 * u) : withSpring(direction === 1 ? -300 * u : 300 * u, { ...IOS_MOTION.springs.cardCommit, velocity: event.velocityX }, finished => {
      if (finished) runOnJS(changeWord)(direction);
    });
    if (reduceMotion) runOnJS(changeWord)(direction);
  }), [changeWord, flip, flipTarget, reduceMotion, swipeX, u]);
  const gesture = useMemo(() => Gesture.Exclusive(pan, tap), [pan, tap]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(swipeX.value), [0, 250 * u], [1, 0.18], Extrapolation.CLAMP),
    transform: [{ perspective: 900 }, { translateX: swipeX.value }, { rotateZ: `${interpolate(swipeX.value, [-250 * u, 0, 250 * u], [-8, -6, 2])}deg` }],
  }));
  const frontStyle = useAnimatedStyle(() => ({
    opacity: interpolate(flip.value, [0, 0.48, 0.52, 1], [1, 1, 0, 0], Extrapolation.CLAMP),
    transform: [{ perspective: 900 }, { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: interpolate(flip.value, [0, 0.48, 0.52, 1], [0, 0, 1, 1], Extrapolation.CLAMP),
    transform: [{ perspective: 900 }, { rotateY: `${interpolate(flip.value, [0, 1], [-180, 0])}deg` }],
  }));
  const edgeStyle = useAnimatedStyle(() => {
    const edge = 1 - Math.abs(flip.value - 0.5) * 2;
    return {
      opacity: Math.max(0, edge) * 0.78,
      transform: [{ scaleX: 0.72 + edge * 0.28 }],
    };
  });

  return (
    <>
      <View style={[styles.wordBack, { right: 21 * u, bottom: 16 * u, width: 216 * u, height: 121 * u, borderRadius: 14 * u, transform: [{ rotate: '-3deg' }] }]}>
        <LinearGradient colors={['#F7FBFF', '#AEDDFF']} style={StyleSheet.absoluteFillObject} />
        <Text style={[styles.wordChinese, { fontSize: 21 * u, right: 32 * u, top: 25 * u }]}>{WORDS[(index + 1) % WORDS.length].chinese}</Text>
        <Image source={ASSETS.latte} style={{ position: 'absolute', right: 40 * u, bottom: 16 * u, width: 45 * u, height: 38 * u }} contentFit="contain" />
      </View>
      <GestureDetector gesture={gesture}>
        <Animated.View accessible accessibilityRole="button" accessibilityLabel={`${word.english} 词汇卡，点击翻面，左右滑动切换`} style={[styles.wordFlipCard, Platform.OS === 'web' ? ({ touchAction: 'pan-y', transformStyle: 'preserve-3d', WebkitBackfaceVisibility: 'hidden' } as any) : null, { left: 19 * u, bottom: 23 * u, width: 238 * u, height: 119 * u }, cardStyle]}>
          <Animated.View style={[styles.wordFront, styles.wordFace, { borderRadius: 15 * u, padding: 17 * u }, frontStyle]}>
            <Text style={[styles.wordEnglish, { fontSize: 42 * u, lineHeight: 51 * u }]}>{word.english}</Text>
            <View style={[styles.pronunciation, { gap: 10 * u }]}><Text style={[styles.pronunciationText, { fontSize: 20 * u }]}>{word.pronunciation}</Text></View>
          </Animated.View>
          <Animated.View style={[styles.wordFront, styles.wordFace, styles.wordFaceBack, { borderRadius: 15 * u, padding: 15 * u }, backStyle]}>
            <Text style={[styles.wordBackTitle, { fontSize: 23 * u }]}>{word.chinese}</Text>
            <Text style={[styles.wordExample, { fontSize: 14 * u, lineHeight: 19 * u }]}>{word.example}</Text>
            <Text style={[styles.wordFlipHint, { fontSize: 12 * u }]}>点击翻回</Text>
          </Animated.View>
          <Animated.View pointerEvents="none" style={[styles.wordEdgeFlash, { left: 3 * u, right: 3 * u, top: 1 * u, height: 3 * u, borderRadius: 3 * u }, edgeStyle]} />
        </Animated.View>
      </GestureDetector>
      <MotionPressable onPress={() => onSpeak(word.english)} haptic={false} style={[styles.wordSpeakButton, { left: 171 * u, bottom: 31 * u, width: 38 * u, height: 38 * u, borderRadius: 19 * u }]} accessibilityRole="button" accessibilityLabel={`播放 ${word.english} 发音`}>
        <Volume2 size={21 * u} color="#5F7390" />
      </MotionPressable>
    </>
  );
}

function PhotoDeck({ u, onPreview }: { u: number; onPreview: (index: number) => void }) {
  const reduceMotion = useReducedMotion();
  const [selected, setSelected] = useState(0);
  const dragX = useSharedValue(0);
  const sources = [ASSETS.coffee, ASSETS.city, ASSETS.plane];
  const shift = useCallback((direction: 1 | -1) => setSelected(current => (current + direction + sources.length) % sources.length), [sources.length]);
  const pan = useMemo(() => Gesture.Pan().activeOffsetX([-10, 10]).failOffsetY([-18, 18]).onBegin(() => {
    cancelAnimation(dragX);
  }).onUpdate(event => {
    dragX.value = resistedOffset(event.translationX, 150 * u, 0.25);
  }).onEnd(event => {
    const projected = dragX.value + event.velocityX * 0.13;
    if (Math.abs(projected) > 64 * u) runOnJS(shift)(projected < 0 ? 1 : -1);
    dragX.value = withSpring(0, { ...IOS_MOTION.springs.cardReturn, velocity: event.velocityX });
  }), [dragX, shift, u]);
  const deckStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 850 },
      { translateX: dragX.value * 0.16 },
      { rotateY: `${interpolate(dragX.value, [-150 * u, 0, 150 * u], [4, 0, -4], Extrapolation.CLAMP)}deg` },
    ],
  }));

  return (
    <>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.albumPhotos, Platform.OS === 'web' ? ({ touchAction: 'pan-y', transformStyle: 'preserve-3d' } as any) : null, { left: 20 * u, right: 18 * u, top: 83 * u, height: 119 * u }, deckStyle]}> 
          {sources.map((source, index) => {
            const distance = (index - selected + sources.length) % sources.length;
            const left = [0, 126, 250][distance];
            return (
              <Animated.View key={index} layout={reduceMotion ? undefined : LinearTransition.springify().damping(IOS_MOTION.springs.cardPromote.damping).stiffness(IOS_MOTION.springs.cardPromote.stiffness)} style={[styles.albumPhotoButton, { left: left * u, width: (distance === 2 ? 116 : 154) * u, height: (distance === 0 ? 112 : 106) * u, borderRadius: 15 * u, zIndex: distance === 0 ? 4 : 3 - distance, transform: [{ translateY: (distance === 0 ? -5 : distance * 2) * u }, { rotate: `${distance === 0 ? -6 : distance === 1 ? -1.5 : 5}deg` }, { scale: distance === 0 ? 1.04 : 0.96 }] }]}> 
                <MotionPressable accessibilityRole="button" accessibilityLabel={`${['咖啡馆', '城市', '机场'][index]}照片${selected === index ? '，再次点击展开' : ''}`} onPress={() => selected === index ? onPreview(index) : setSelected(index)} pressedScale={0.97} style={StyleSheet.absoluteFillObject}>
                  <Image source={source} style={[StyleSheet.absoluteFillObject, styles.albumPhoto, selected === index && styles.albumPhotoActive, { borderRadius: 15 * u }]} contentFit="cover" />
                </MotionPressable>
              </Animated.View>
            );
          })}
        </Animated.View>
      </GestureDetector>
      <View style={[styles.dots, { bottom: 6 * u, left: 160 * u, gap: 7 * u }]}>{sources.map((_, index) => <View key={index} style={{ width: (selected === index ? 22 : 8) * u, height: 7 * u, borderRadius: 4 * u, backgroundColor: selected === index ? BLUE : '#CBD7E6' }} />)}</View>
      <Pressable accessibilityRole="button" accessibilityLabel="切换相册场景" onPress={() => shift(1)} style={[styles.cardNext, { right: 0, bottom: 9 * u, width: 48 * u, height: 48 * u, borderRadius: 24 * u }]}><ChevronRight size={28 * u} color={INK} /></Pressable>
    </>
  );
}

function SpatialOverlay({ overlay, u, recState, recSeconds, sceneText, onRecord, onSpeak, onStart, onCloseComplete }: {
  overlay: SpatialOverlayState;
  u: number;
  recState: Props['recState'];
  recSeconds: number;
  sceneText: string;
  onRecord: () => void;
  onSpeak: (word?: string) => void;
  onStart: () => void;
  onCloseComplete: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);
  const [hotspot, setHotspot] = useState<number | null>(null);
  const target = { x: 25, y: 112, width: 800, height: 1000 };

  useEffect(() => {
    progress.value = reduceMotion ? 1 : withSpring(1, IOS_MOTION.springs.spatial);
  }, [progress, reduceMotion]);

  const close = useCallback(() => {
    if (reduceMotion) {
      onCloseComplete();
      return;
    }
    cancelAnimation(progress);
    progress.value = withSpring(0, IOS_MOTION.springs.spatial, finished => {
      if (finished) runOnJS(onCloseComplete)();
    });
  }, [onCloseComplete, progress, reduceMotion]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value * 0.94 }));
  const isCoach = overlay.kind === 'coach';
  const isHero = overlay.kind === 'hero';
  const panelStyle = useAnimatedStyle(() => {
    const originCenterX = overlay.origin.x + overlay.origin.width / 2;
    const originCenterY = overlay.origin.y - overlay.scrollOffset / u + overlay.origin.height / 2;
    const targetCenterX = target.x + target.width / 2;
    const targetCenterY = target.y + target.height / 2;
    const scaleX = overlay.origin.width / target.width;
    const scaleY = overlay.origin.height / target.height;
    const originRadius = overlay.kind === 'hero' || overlay.kind === 'coach' ? 31 : 15;
    const correctedRadius = originRadius / Math.max(Math.min(scaleX, scaleY), 0.08);
    return {
      opacity: 1,
      borderRadius: interpolate(progress.value, [0, 1], [correctedRadius * u, 38 * u]),
      shadowOpacity: interpolate(progress.value, [0, 1], [0.16, 0.34]),
      transform: [
        { perspective: 1400 },
        { translateX: interpolate(progress.value, [0, 1], [(originCenterX - targetCenterX) * u, 0]) },
        { translateY: interpolate(progress.value, [0, 1], [(originCenterY - targetCenterY) * u, 0]) },
        { scaleX: interpolate(progress.value, [0, 1], [scaleX, 1]) },
        { scaleY: interpolate(progress.value, [0, 1], [scaleY, 1]) },
        { rotateX: `${interpolate(progress.value, [0, 1], [5, 0])}deg` },
      ],
    };
  });
  const imageStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [target.height * u, (isCoach ? 430 : 505) * u]),
    borderRadius: interpolate(progress.value, [0, 1], [34 * u, 0]),
    transform: [{ scale: interpolate(progress.value, [0, 0.35, 1], [1.03, 1.015, 1]) }],
  }));
  const detailStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.5, 0.82, 1], [0, 0.76, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(progress.value, [0.5, 1], [26 * u, 0], Extrapolation.CLAMP) }],
  }));
  return (
    <View style={[styles.overlayRoot, Platform.OS === 'web' ? ({ minHeight: '100dvh' } as any) : null, { top: overlay.scrollOffset }]} accessibilityViewIsModal>
      <Animated.View style={[styles.overlayBackdrop, webGlass('blur(12px) saturate(.9)'), backdropStyle]} />
      <Pressable onPress={close} style={StyleSheet.absoluteFillObject} accessibilityLabel="关闭详情" />
      <Animated.View style={[styles.overlayPanel, Platform.OS === 'web' ? ({ transformStyle: 'preserve-3d', WebkitBackfaceVisibility: 'hidden', isolation: 'isolate' } as any) : null, { left: target.x * u, top: target.y * u, width: target.width * u, height: target.height * u }, panelStyle]}>
        <Animated.View pointerEvents="none" style={[styles.overlayImageClip, imageStyle]}>
          <Image source={isHero ? ASSETS.hero : isCoach ? ASSETS.orb : overlay.scene.source} style={styles.overlayImage} contentFit={isCoach ? 'contain' : 'cover'} />
          <LinearGradient colors={['rgba(255,255,255,0.34)', 'rgba(255,255,255,0)', 'rgba(87,191,255,0.14)']} locations={[0, 0.34, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
        </Animated.View>
        <LinearGradient colors={isCoach ? ['rgba(222,244,255,0.1)', 'rgba(234,248,255,0.82)', 'rgba(255,255,255,0.98)'] : ['rgba(0,0,0,0.08)', 'rgba(4,13,28,0.42)', 'rgba(250,253,255,0.98)']} locations={[0, 0.48, 0.76]} style={StyleSheet.absoluteFillObject} />
        <MotionPressable onPress={close} style={[styles.overlayClose, detailStyle, { right: 20 * u, top: 20 * u, width: 48 * u, height: 48 * u, borderRadius: 24 * u }]} accessibilityRole="button" accessibilityLabel="关闭">
          <CircleX size={29 * u} color="#10213A" />
        </MotionPressable>
        <Animated.View style={[styles.overlayCopy, { left: 34 * u, right: 34 * u, top: (isCoach ? 420 : 455) * u }, detailStyle]}>
          <Text style={[styles.overlayEyebrow, { fontSize: 15 * u }]}>{isCoach ? 'AI CONVERSATION' : isHero ? 'IMMERSIVE SCENE' : 'SCENE PRACTICE'}</Text>
          <Text style={[styles.overlayTitle, { fontSize: 42 * u, lineHeight: 52 * u }]}>{isCoach ? 'AI 教练对话空间' : isHero ? '咖啡馆场景探索' : overlay.scene.title}</Text>
          <Text style={[styles.overlayDescription, { fontSize: 20 * u, lineHeight: 30 * u }]}>{isCoach ? (sceneText || (recState === 'recording' ? `正在录音 ${recSeconds}s，松开后识别内容` : '点击下方麦克风开始真实语音对话，识别结果会在这里出现。')) : overlay.scene.description}</Text>
          {isCoach ? (
            <View style={[styles.coachOverlayActions, { marginTop: 24 * u, gap: 15 * u }]}>
              <MotionPressable onPress={onRecord} style={[styles.overlayPrimary, { height: 66 * u, borderRadius: 34 * u }]}><LinearGradient colors={['#31D8FF', BLUE, '#0752DF']} style={StyleSheet.absoluteFillObject} /><Mic size={26 * u} color="#fff" /><Text style={[styles.overlayPrimaryText, { fontSize: 20 * u }]}>{recState === 'recording' ? '停止并识别' : recState === 'idle' ? '开始录音' : '正在处理'}</Text></MotionPressable>
              <View style={[styles.coachStateCard, { minHeight: 86 * u, borderRadius: 22 * u, padding: 17 * u }]}><Headphones size={24 * u} color={BLUE} /><View style={{ flex: 1 }}><Text style={[styles.coachStateTitle, { fontSize: 17 * u }]}>状态反馈</Text><Text style={[styles.coachStateText, { fontSize: 15 * u }]}>{recState === 'recording' ? '正在收音，动画仅表示录音状态' : recState === 'transcribing' ? '语音已发送，正在识别' : '准备好后开始对话'}</Text></View></View>
            </View>
          ) : (
            <View style={{ gap: 12 * u, marginTop: 22 * u }}>
              {overlay.scene.phrases.map(([english, chinese]) => (
                <MotionPressable key={english} onPress={() => onSpeak(english)} haptic={false} style={[styles.phraseCard, { minHeight: 74 * u, borderRadius: 22 * u, paddingHorizontal: 20 * u }]}>
                  <View style={{ flex: 1 }}><Text style={[styles.phraseEnglish, { fontSize: 19 * u }]}>{english}</Text><Text style={[styles.phraseChinese, { fontSize: 15 * u }]}>{chinese}</Text></View><Volume2 size={23 * u} color={BLUE} />
                </MotionPressable>
              ))}
              <MotionPressable onPress={onStart} style={[styles.overlayPrimary, { height: 66 * u, borderRadius: 34 * u, marginTop: 6 * u }]}><LinearGradient colors={['#31D8FF', BLUE, '#0752DF']} style={StyleSheet.absoluteFillObject} /><Text style={[styles.overlayPrimaryText, { fontSize: 20 * u }]}>进入英语练习</Text><ChevronRight size={24 * u} color="#fff" /></MotionPressable>
            </View>
          )}
        </Animated.View>
        {isHero ? (
          <View pointerEvents="box-none" style={StyleSheet.absoluteFillObject}>
            {[[275, 255, 'latte'], [116, 320, 'espresso'], [615, 245, 'menu']].map(([x, y, label], index) => (
              <MotionPressable key={String(label)} onPress={() => setHotspot(index)} style={[styles.hotspot, { left: Number(x) * u, top: Number(y) * u, width: 34 * u, height: 34 * u, borderRadius: 17 * u }]} accessibilityLabel={`查看 ${label}`}><View style={[styles.hotspotCore, { width: 10 * u, height: 10 * u, borderRadius: 5 * u }]} /></MotionPressable>
            ))}
            {hotspot !== null ? <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOut.duration(150)} style={[styles.hotspotCard, { left: 230 * u, top: 310 * u, width: 330 * u, minHeight: 120 * u, borderRadius: 24 * u, padding: 18 * u }]}><Text style={[styles.hotspotWord, { fontSize: 27 * u }]}>{['latte', 'espresso', 'menu'][hotspot]}</Text><Text style={[styles.hotspotTranslation, { fontSize: 16 * u }]}>{['拿铁', '浓缩咖啡', '菜单'][hotspot]}</Text><MotionPressable onPress={() => onSpeak(['latte', 'espresso', 'menu'][hotspot])} style={[styles.hotspotSpeak, { width: 42 * u, height: 42 * u, borderRadius: 21 * u }]}><Volume2 size={22 * u} color={BLUE} /></MotionPressable></Animated.View> : null}
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

export function PremiumHomeBoard(props: Props) {
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const boardWidth = Math.min(width, 850);
  const u = boardWidth / 850;
  const [overlay, setOverlay] = useState<SpatialOverlayState | null>(null);
  const [trackInfo, setTrackInfo] = useState<string | null>(null);
  const focusReturnRef = useRef<{ focus?: () => void } | null>(null);
  const latest = props.records[0];
  const isRecording = props.recState === 'recording';
  const busy = props.recState === 'requesting' || props.recState === 'transcribing';
  const boardHeight = 1678 * u;
  const fs = (value: number) => value * u;
  const openOverlay = useCallback((next: Omit<SpatialOverlayState, 'scrollOffset'>) => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      focusReturnRef.current = document.activeElement as { focus?: () => void } | null;
    }
    setOverlay({ ...next, scrollOffset: props.getScrollOffset?.() ?? 0 });
    props.onInteractionLockChange?.(true);
  }, [props]);
  const closeOverlay = useCallback(() => {
    setOverlay(null);
    props.onInteractionLockChange?.(false);
    if (Platform.OS === 'web' && typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => focusReturnRef.current?.focus?.());
    }
  }, [props]);

  return (
    <View style={[styles.board, { width: boardWidth, height: boardHeight, marginTop: Math.max(props.topInset, 8) }]}>
      <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(380)} style={[styles.header, { left: 42 * u, right: 30 * u, top: 18 * u, height: 72 * u }]}>
        <View>
          <Text style={[styles.brand, { fontSize: fs(42), lineHeight: fs(48) }]} numberOfLines={1} adjustsFontSizeToFit>
            <Text style={styles.brandBlue}>Visual</Text> English Coach
          </Text>
          <Text style={[styles.tagline, { fontSize: fs(21), lineHeight: fs(27) }]}>看见场景，说出英语</Text>
        </View>
        <MotionPressable onPress={props.onOpenGrowth} style={[styles.streak, { height: 54 * u, borderRadius: 28 * u, paddingHorizontal: 20 * u, gap: 8 * u }]}>
          <Flame size={25 * u} color="#FF6B16" fill="#FF6B16" />
          <Text style={[styles.streakText, { fontSize: fs(20) }]}>连续学习</Text>
          <Text style={[styles.streakDays, { fontSize: fs(31) }]}>{props.streakDays || 7}</Text>
          <Text style={[styles.streakText, { fontSize: fs(20) }]}>天</Text>
          <ChevronRight size={20 * u} color="#52647C" />
        </MotionPressable>
      </Animated.View>

      <Animated.View entering={reduceMotion ? undefined : FadeInDown.delay(50).duration(420)} style={[styles.hero, { left: 27 * u, top: 95 * u, width: 540 * u, height: 600 * u, borderRadius: 32 * u }]}>
        <Image source={ASSETS.hero} style={{ position: 'absolute', left: 0, right: 0, top: -25 * u, width: 540 * u, height: 625 * u }} contentFit="fill" transition={180} />
        <LinearGradient colors={['rgba(4,11,19,0.08)', 'rgba(4,11,19,0.02)', 'rgba(4,11,19,0.18)']} style={StyleSheet.absoluteFillObject} />
        <View style={{ position: 'absolute', left: 39 * u, top: 54 * u }}>
          <Text style={[styles.heroTitle, { fontSize: fs(45), lineHeight: fs(54) }]}>实时场景</Text>
          <Text style={[styles.heroSubtitle, { fontSize: fs(21), lineHeight: fs(30) }]}>在真实场景中练习地道表达</Text>
        </View>
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(2,7,10,0.72)', 'rgba(2,7,10,0.54)', 'rgba(2,7,10,0.08)']}
          locations={[0, 0.62, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', left: 31 * u, top: 148 * u, width: 205 * u, height: 235 * u, borderRadius: 18 * u }}
        />
        <View style={{ position: 'absolute', left: 41 * u, top: 159 * u, width: 148 * u }}>
          <Text style={[styles.menuTitle, { fontSize: fs(31), lineHeight: fs(37) }]}>COFFEE</Text>
          <View style={{ height: 2 * u, backgroundColor: 'rgba(255,255,255,0.88)', marginVertical: 4 * u }} />
          {[['Espresso','3.0'],['Americano','3.5'],['Latte','4.0'],['Cappuccino','4.0'],['Mocha','4.5']].map(([name, price]) => (
            <View key={name} style={styles.menuLine}>
              <Text style={[styles.menuText, { fontSize: fs(17), lineHeight: fs(24) }]}>{name}</Text>
              <Text style={[styles.menuText, { fontSize: fs(17), lineHeight: fs(24) }]}>{price}</Text>
            </View>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="进入咖啡馆沉浸式场景"
          onPress={() => openOverlay({ kind: 'hero', scene: SCENES[0], origin: { x: 27, y: 95, width: 540, height: 600 } })}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 430 * u }}
        />
        <MotionPressable onPress={() => props.onOpenCoach('我想练习咖啡馆点单')} hoverTilt={1.8} accessibilityRole="button" accessibilityLabel="进入咖啡馆点单场景" style={[styles.locationPill, { left: 21 * u, bottom: 62 * u, width: 282 * u, height: 76 * u, borderRadius: 39 * u, gap: 11 * u, paddingHorizontal: 20 * u }]}>
          <LinearGradient colors={['rgba(244,253,255,0.72)', 'rgba(174,220,255,0.16)', 'rgba(255,255,255,0.38)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFillObject,{borderRadius:39*u}]} />
          <LinearGradient colors={['rgba(255,255,255,0.92)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', left: 15 * u, right: 22 * u, top: 3 * u, height: 2 * u }} />
          <Image source={ASSETS.locationPin} style={{ width: 29 * u, height: 34 * u }} contentFit="contain" />
          <Text style={[styles.locationText, { fontSize: fs(23) }]}>咖啡馆点单</Text><ChevronRight size={27 * u} color="#fff" />
        </MotionPressable>
        <MotionPressable onPress={props.onCamera} hoverTilt={2.8} accessibilityRole="button" accessibilityLabel="拍照识别" style={[styles.heroCameraHit, { right: 19 * u, bottom: 20 * u, width: 150 * u, height: 170 * u, borderRadius: 75 * u }]}>
          <Image source={ASSETS.cameraOrbit} style={{ width: 146 * u, height: 135 * u }} contentFit="contain" />
          <Text style={[styles.cameraLabel, { fontSize: fs(20) }]}>拍照识别</Text>
        </MotionPressable>
      </Animated.View>

      <Animated.View entering={reduceMotion ? undefined : FadeInDown.delay(90).duration(460)} style={[styles.coach, { left: 580 * u, top: 101 * u, width: 244 * u, height: 630 * u, borderRadius: 31 * u }]}>
        <Glass style={StyleSheet.absoluteFillObject} tint={['rgba(250,254,255,0.88)', 'rgba(214,241,255,0.62)', 'rgba(247,244,255,0.78)']}> 
          <Pressable onPress={() => props.onOpenCoach()} style={[styles.coachTitleHit, { padding: 22 * u }]}>
            <Text style={[styles.coachTitle, { fontSize: fs(34), lineHeight: fs(42) }]}>AI 教练</Text>
            <ChevronRight size={24 * u} color={INK} />
          </Pressable>
          <Text style={[styles.coachSubtitle, { left: 23 * u, top: 70 * u, fontSize: fs(18) }]}>语音对话 · 即时反馈</Text>
          <CoachOrb u={u} state={props.recState} onPress={() => openOverlay({ kind: 'coach', scene: SCENES[0], origin: { x: 580, y: 101, width: 244, height: 630 } })} />
          <View style={{ position: 'absolute', left: 29 * u, top: 286 * u, width: 187 * u }}><Waveform u={u} active={isRecording} /></View>
          <Text style={[styles.listening, { top: 357 * u, fontSize: fs(18) }]}> 
            {busy ? '正在识别...' : isRecording ? `${String(Math.floor(props.recSeconds / 60)).padStart(2, '0')}:${String(props.recSeconds % 60).padStart(2, '0')}` : '正在倾听...'}
          </Text>
          <MotionPressable
            onPress={props.onRecord}
            disabled={busy}
            accessibilityLabel={isRecording ? '停止录音' : '开始录音'}
            style={[styles.micButton, { left: 25 * u, bottom: 20 * u, width: 194 * u, height: 202 * u }]}
            pressedScale={0.96}
            hoverTilt={2.2}
          >
            <MicGlassControl u={u} active={isRecording} />
            {busy ? <ActivityIndicator color={BLUE} style={styles.micBusy} /> : null}
            <Text style={[styles.sendLabel, { fontSize: fs(18), bottom: 0 }]}>{isRecording ? '点击结束发送' : '点击开始说话'}</Text>
          </MotionPressable>
        </Glass>
      </Animated.View>

      <Animated.View entering={reduceMotion ? undefined : FadeInDown.delay(130).duration(470)} style={[styles.lesson, { left: 26 * u, top: 650 * u, width: 545 * u, height: 426 * u }]}>
        <LessonStack u={u} latest={latest} loading={props.loading} onOpenRecord={props.onOpenRecord} onOpenLearning={props.onOpenLearning} />
      </Animated.View>

      <Animated.View entering={reduceMotion ? undefined : FadeInDown.delay(170).duration(470)} style={[styles.goal, { left: 578 * u, top: 750 * u, width: 245 * u, height: 323 * u, borderRadius: 28 * u }]}>
        <Glass style={StyleSheet.absoluteFillObject} tint={['rgba(240,255,248,0.94)', 'rgba(211,249,242,0.77)', 'rgba(241,250,255,0.9)']}>
          <Pressable onPress={props.onOpenGrowth} style={[styles.goalHeader, { height: 54 * u, paddingHorizontal: 18 * u }]}>
            <Text style={[styles.goalTitle, { fontSize: fs(25) }]}>今日目标</Text>
            <View style={[styles.goalChevron, { width: 31 * u, height: 31 * u, borderRadius: 16 * u }]}><ChevronDown size={19 * u} color={INK} /></View>
          </Pressable>
          <View style={{ position: 'absolute', left: 21 * u, top: 47 * u }}><GoalRing u={u} count={props.todayCount} /></View>
          <MotionPressable onPress={props.onOpenGrowth} style={[styles.goalButton, { left: 9 * u, right: 9 * u, bottom: 9 * u, height: 49 * u, borderRadius: 26 * u }]}>
            <LinearGradient colors={['#1CC8FF', BLUE, '#0067F3']} style={[StyleSheet.absoluteFillObject, { borderRadius: 26 * u }]} />
            <Text style={[styles.goalButtonText, { fontSize: fs(20) }]}>继续完成</Text><ChevronRight size={21 * u} color="#fff" />
          </MotionPressable>
        </Glass>
      </Animated.View>

      <Animated.View entering={reduceMotion ? undefined : FadeInDown.delay(210).duration(450)} style={[styles.album, { left: 32 * u, top: 1068 * u, width: 410 * u, height: 225 * u, borderRadius: 28 * u }]}> 
        <Glass style={StyleSheet.absoluteFillObject}>
          <CardHeading u={u} title="相册场景" subtitle="从照片中练习英语表达" />
          <PhotoDeck u={u} onPreview={(index) => openOverlay({ kind: 'album', scene: ALBUM_SCENES[index], origin: { x: 52, y: 1146, width: 154, height: 112 } })} />
        </Glass>
      </Animated.View>

      <Animated.View entering={reduceMotion ? undefined : FadeInDown.delay(240).duration(450)} style={[styles.writing, { left: 455 * u, top: 1068 * u, width: 369 * u, height: 225 * u, borderRadius: 28 * u }]}> 
        <Glass style={StyleSheet.absoluteFillObject} tint={['rgba(255,255,255,0.94)', 'rgba(235,243,255,0.82)', 'rgba(255,255,255,0.92)']}>
          <CardHeading u={u} title="文字练习" subtitle="用文字创建你想练习的场景" />
          <View style={[styles.writingBox, { left: 19 * u, right: 17 * u, bottom: 17 * u, height: 106 * u, borderRadius: 25 * u, paddingLeft: 18 * u, paddingRight: 74 * u }]}>
            <TextInput
              value={props.sceneText}
              onChangeText={props.onSceneTextChange}
              placeholder={'我想在咖啡馆点一杯拿铁，\n可以怎么说？'}
              placeholderTextColor="#29446E"
              multiline
              style={[styles.writingInput, { fontSize: fs(19), lineHeight: fs(29) }]}
            />
            <MotionPressable onPress={props.onSubmitText} style={[styles.sendButton, { right: 8 * u, top: 19 * u, width: 67 * u, height: 67 * u, borderRadius: 34 * u }]}>
              <LinearGradient colors={['#2BD0FF', '#087CFF', '#075EE8']} style={[StyleSheet.absoluteFillObject, { borderRadius: 34 * u }]} />
              <Image source={ASSETS.send} style={{ width: 34 * u, height: 34 * u, transform: [{ rotate: '-10deg' }] }} contentFit="contain" />
            </MotionPressable>
          </View>
        </Glass>
      </Animated.View>

      <Animated.View entering={reduceMotion ? undefined : FadeInDown.delay(270).duration(450)} style={[styles.vocab, { left: 32 * u, top: 1305 * u, width: 394 * u, height: 225 * u, borderRadius: 28 * u }]}> 
        <Glass style={StyleSheet.absoluteFillObject} tint={['rgba(255,255,255,0.96)', 'rgba(255,249,229,0.72)', 'rgba(225,243,255,0.82)']}>
          <CardHeading u={u} title="重点词汇" subtitle="场景高频词 · 翻卡记忆" />
          <VocabularyDeck u={u} onSpeak={props.onSpeakWord} />
        </Glass>
      </Animated.View>

      <Animated.View entering={reduceMotion ? undefined : FadeInDown.delay(300).duration(450)} style={[styles.recommend, { left: 437 * u, top: 1305 * u, width: 387 * u, height: 225 * u, borderRadius: 28 * u }]}> 
        <Glass style={StyleSheet.absoluteFillObject}>
          <CardHeading u={u} title="场景推荐" subtitle="更多真实场景，拓展你的表达" />
          <View style={[styles.sceneRow, { left: 14 * u, right: 14 * u, bottom: 14 * u, height: 124 * u, gap: 8 * u }]}>
            {SCENES.map((scene, index) => (
              <MotionPressable key={scene.key} accessibilityRole="button" accessibilityLabel={`展开${scene.title}场景练习`} onPress={() => openOverlay({ kind: 'scene', scene, origin: { x: 451 + index * 119, y: 1392, width: 112, height: 124 } })} style={[styles.sceneTile, { flex: 1, borderRadius: 15 * u }, index === 0 && styles.sceneTileActive]}>
                <Image source={scene.source} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                <LinearGradient colors={['transparent', 'rgba(4,12,25,0.84)']} style={StyleSheet.absoluteFillObject} />
                <View style={{ position: 'absolute', left: 9 * u, bottom: 8 * u }}><Text style={[styles.sceneTitle, { fontSize: fs(17) }]}>{scene.title}</Text><Text style={[styles.sceneSubtitle, { fontSize: fs(13) }]}>{scene.subtitle}</Text></View>
              </MotionPressable>
            ))}
          </View>
          <Pressable onPress={() => props.onOpenLearning()} style={[styles.cardNext, { right: -2 * u, bottom: 52 * u, width: 50 * u, height: 50 * u, borderRadius: 25 * u }]}><ChevronRight size={28 * u} color={INK} /></Pressable>
        </Glass>
      </Animated.View>

      <Animated.View entering={reduceMotion ? undefined : FadeInDown.delay(340).duration(450)} style={[styles.journey, { left: 31 * u, top: 1542 * u, width: 793 * u, height: 108 * u, borderRadius: 29 * u }]}> 
        <Glass style={StyleSheet.absoluteFillObject} tint={['rgba(255,255,255,0.94)', 'rgba(228,245,255,0.76)', 'rgba(255,244,238,0.72)']}>
          <View style={{ position: 'absolute', left: 23 * u, top: 18 * u }}><Text style={[styles.journeyTitle, { fontSize: fs(25) }]}>学习轨迹</Text><Text style={[styles.journeySubtitle, { fontSize: fs(17), marginTop: 5 * u }]}>从生活场景走向更广阔的世界</Text></View>
          <View style={[styles.track, { right: 28 * u, top: 14 * u, width: 453 * u, height: 87 * u }]}>
            <Svg style={StyleSheet.absoluteFillObject} viewBox="0 0 453 87"><Path d="M30 45 C90 21 130 60 191 42 S300 42 420 44" fill="none" stroke="#BBC7D7" strokeWidth="5" strokeLinecap="round" /><Path d="M30 45 C90 21 130 60 191 42" fill="none" stroke={BLUE} strokeWidth="5" strokeLinecap="round" /></Svg>
            {[
              [31, ASSETS.trackCheck, '日常', false, false],
              [191, ASSETS.trackPlane, '旅行', true, false],
              [310, ASSETS.trackWork, '工作', false, true],
            ].map(([left, source, label, current, locked]) => (
              <MotionPressable key={String(label)} disabled={Boolean(locked)} onPress={() => setTrackInfo(String(label))} pressedScale={0.9} style={{ position: 'absolute', left: Number(left) * u - 22 * u, top: 20 * u, width: 48 * u, alignItems: 'center' }}>
                {current ? <Text style={[styles.nowPill, { top: -25 * u, fontSize: fs(13), paddingHorizontal: 9 * u, borderRadius: 12 * u }]}>正在学习</Text> : null}
                <View style={[styles.trackNode, { width: 43 * u, height: 43 * u, borderRadius: 22 * u }, current && styles.trackNodeCurrent, locked && styles.trackNodeLocked]}>
                  <Image source={source} style={{ width: 34 * u, height: 34 * u, opacity: locked ? 0.72 : 1 }} contentFit="contain" tintColor={locked ? '#FFFFFF' : undefined} />
                </View>
                <Text style={[styles.trackLabel, { fontSize: fs(15), marginTop: 2 * u }, current && styles.trackLabelActive]}>{String(label)}</Text>
              </MotionPressable>
            ))}
            <Pressable onPress={props.onOpenLearning} style={{ position: 'absolute', right: 0, top: 20 * u, width: 50 * u, alignItems: 'center' }}><View style={[styles.moreNode, { width: 43 * u, height: 43 * u, borderRadius: 22 * u }]}><Text style={{ color: '#fff', fontSize: fs(20), letterSpacing: 1 }}>•••</Text></View><Text style={[styles.trackLabel, { fontSize: fs(15), marginTop: 2 * u }]}>更多</Text></Pressable>
          </View>
        </Glass>
      </Animated.View>
      {trackInfo ? (
        <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(240)} exiting={FadeOut.duration(160)} style={[styles.trackInfoCard, { left: 435 * u, top: 1450 * u, width: 330 * u, minHeight: 102 * u, borderRadius: 24 * u, padding: 16 * u }]}>
          <LinearGradient colors={['rgba(255,255,255,0.96)', 'rgba(223,243,255,0.88)']} style={StyleSheet.absoluteFillObject} />
          <Text style={[styles.trackInfoTitle, { fontSize: fs(20) }]}>{trackInfo}阶段</Text>
          <Text style={[styles.trackInfoText, { fontSize: fs(15), lineHeight: fs(21) }]}>{trackInfo === '旅行' ? '继续完成机场与酒店场景，解锁工作英语。' : '日常场景已完成，可随时复习。'}</Text>
          <Pressable onPress={() => setTrackInfo(null)} style={styles.trackInfoClose}><CircleX size={20 * u} color={MUTED} /></Pressable>
        </Animated.View>
      ) : null}
      {overlay ? (
        <SpatialOverlay
          overlay={overlay}
          u={u}
          recState={props.recState}
          recSeconds={props.recSeconds}
          sceneText={props.sceneText}
          onRecord={props.onRecord}
          onSpeak={props.onSpeakWord}
          onStart={() => props.onOpenCoach(overlay.scene.prompt)}
          onCloseComplete={closeOverlay}
        />
      ) : null}
      {props.recError ? <Text style={[styles.error, { left: 584 * u, top: 720 * u, width: 235 * u, fontSize: fs(12) }]}>{props.recError}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { position: 'relative', alignSelf: 'center', backgroundColor: '#FDFEFF', overflow: 'visible' },
  header: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: '#05080C', fontWeight: '900', letterSpacing: 0 },
  brandBlue: { color: BLUE },
  tagline: { color: '#61738D', fontWeight: '500' },
  streak: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(145,177,214,0.3)', backgroundColor: 'rgba(255,255,255,0.82)', shadowColor: '#7CA0CD', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 18, elevation: 5 },
  streakText: { color: INK, fontWeight: '800' },
  streakDays: { color: '#F47A18', fontWeight: '500' },
  hero: { position: 'absolute', overflow: 'hidden', backgroundColor: '#49382E', borderWidth: 1, borderColor: 'rgba(255,255,255,0.94)', shadowColor: '#143C72', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.22, shadowRadius: 34, elevation: 9 },
  heroCameraHit: { position: 'absolute', alignItems: 'center', justifyContent: 'flex-start' },
  heroLocationHit: { position: 'absolute' },
  heroTitle: { color: '#fff', fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.36)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  heroSubtitle: { color: '#fff', fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.42)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  menuTitle: { color: '#fff', fontStyle: 'italic', fontWeight: '500', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 5 },
  menuLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  menuText: { color: '#fff', fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 4 },
  locationPill: { position: 'absolute', overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.96)', flexDirection: 'row', alignItems: 'center', shadowColor: '#06264F', shadowOffset: { width: 0, height: 11 }, shadowOpacity: 0.32, shadowRadius: 18, elevation: 8, ...webGlass('blur(15px) saturate(1.45)') },
  locationText: { flex: 1, color: '#fff', fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.42)', textShadowRadius: 5 },
  cameraLabel: { color: '#fff', fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 5 },
  glassShell: { position: 'relative', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(154,205,244,0.72)', shadowColor: '#2C679D', shadowOffset: { width: 0, height: 15 }, shadowOpacity: 0.2, shadowRadius: 30, elevation: 8 },
  glassReflection: { ...StyleSheet.absoluteFillObject, opacity: 0.8 },
  glassTopEdge: { position: 'absolute', left: '4%', right: '5%', top: 1, height: 2, borderRadius: 999 },
  glassInnerEdge: { ...StyleSheet.absoluteFillObject, borderWidth: 1, borderColor: 'rgba(255,255,255,0.48)', borderRadius: 27 },
  coach: { position: 'absolute', overflow: 'hidden' },
  coachTitleHit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  coachTitle: { color: INK, fontWeight: '900' },
  coachSubtitle: { position: 'absolute', color: MUTED, fontWeight: '500' },
  wave: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  listening: { position: 'absolute', left: 0, right: 0, textAlign: 'center', color: '#4D6281', fontWeight: '500' },
  micButton: { position: 'absolute', alignItems: 'center', justifyContent: 'flex-start' },
  micGlassControl: { alignItems: 'center', justifyContent: 'center' },
  micGlassSurface: { ...StyleSheet.absoluteFillObject, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(239,253,255,0.96)', ...(Platform.OS === 'web' ? ({ boxShadow: '0 11px 25px rgba(6,126,239,0.25), inset 0 2px 5px rgba(255,255,255,0.75)' } as any) : null) },
  micGlyph: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  micBusy: { position: 'absolute', top: '36%' },
  sendLabel: { position: 'absolute', color: BLUE_DARK, fontWeight: '700' },
  lesson: { position: 'absolute' },
  lessonBack: { position: 'absolute', overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(169,226,255,0.82)', shadowColor: '#155F9D', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.32, shadowRadius: 22, elevation: 7 },
  lessonBackMiddle: { shadowOffset: { width: 5, height: 16 }, shadowOpacity: 0.34, shadowRadius: 23 },
  lessonBackRear: { shadowOffset: { width: 9, height: 18 }, shadowOpacity: 0.28, shadowRadius: 26 },
  lessonBackEdge: { ...StyleSheet.absoluteFillObject, borderWidth: 1, borderColor: 'rgba(255,255,255,0.62)', borderRadius: 27 },
  lessonFront: { position: 'absolute', overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.98)', shadowColor: '#174D83', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.3, shadowRadius: 28, elevation: 10 },
  lessonFrontRefraction: { position: 'absolute', left: -48, top: -86, width: 170, height: 300, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.28)', transform: [{ rotate: '-20deg' }] },
  lessonDynamicReflection: { position: 'absolute', zIndex: 3, left: -112, top: -52, borderRadius: 90, overflow: 'hidden' },
  lessonMotionShadow: { position: 'absolute', zIndex: 3, backgroundColor: 'rgba(24,73,119,0.28)', shadowColor: '#174D83', shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.34, shadowRadius: 18, elevation: 5 },
  lessonLoader: { position: 'absolute', left: '48%', top: '45%' },
  lessonKicker: { color: '#2B4775', fontWeight: '800', letterSpacing: 1 },
  lessonTitle: { color: '#070B10', fontWeight: '900' },
  lessonScene: { color: '#1B3B68', fontWeight: '800' },
  lessonDescription: { color: '#405C82', fontWeight: '500' },
  continuePill: { position: 'absolute', overflow: 'hidden', flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.98)', shadowColor: '#1A6EB4', shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.28, shadowRadius: 15, elevation: 6, ...webGlass('blur(15px) saturate(1.35)') },
  playOrb: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#D9FAFF', shadowColor: BLUE, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.56, shadowRadius: 13, elevation: 7 },
  continueText: { color: BLUE_DARK, fontWeight: '900' },
  lessonCount: { color: '#3A557A', fontWeight: '500' },
  lessonProgressTrack: { backgroundColor: '#D7E2EF', overflow: 'hidden' },
  goal: { position: 'absolute', overflow: 'hidden' },
  goalRingShell: { alignItems: 'center', justifyContent: 'center', shadowColor: '#3AC5FF', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 15, elevation: 5 },
  goalFlash: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.48)', borderRadius: 999 },
  goalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  goalTitle: { color: INK, fontWeight: '900' },
  goalChevron: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(125,177,190,0.22)' },
  goalRingCopy: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  goalNumber: { color: '#080C12', fontWeight: '900', textAlign: 'center' },
  goalLine: { flexDirection: 'row', alignItems: 'center' },
  goalCheck: { borderWidth: 2, borderColor: '#8EA0B5', alignItems: 'center', justifyContent: 'center' },
  goalCheckDone: { borderWidth: 0, backgroundColor: '#28B463' },
  goalLabel: { color: '#65778D', fontWeight: '700' },
  goalLabelDone: { color: '#1FA151' },
  goalButton: { position: 'absolute', overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#A4E8FF', shadowColor: BLUE, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 5 },
  goalButtonText: { color: '#fff', fontWeight: '800' },
  album: { position: 'absolute', overflow: 'hidden' }, writing: { position: 'absolute', overflow: 'hidden' }, vocab: { position: 'absolute', overflow: 'hidden' }, recommend: { position: 'absolute', overflow: 'hidden' }, journey: { position: 'absolute', overflow: 'hidden' },
  cardHeading: { position: 'absolute', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headingLine: { flexDirection: 'row', alignItems: 'center' },
  headingArrow: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.58)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.92)', shadowColor: '#557A9F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.14, shadowRadius: 8, elevation: 3 },
  cardTitle: { color: INK, fontWeight: '900' },
  cardSubtitle: { color: MUTED, fontWeight: '500' },
  albumPhotos: { position: 'absolute', overflow: 'visible' },
  albumPhotoButton: { position: 'absolute' },
  albumPhoto: { borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.96)', shadowColor: '#1E578D', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.34, shadowRadius: 12, elevation: 6 },
  albumPhotoActive: { borderColor: '#1095FF', shadowColor: '#008CFF', shadowOpacity: 0.56, shadowRadius: 14 },
  dots: { position: 'absolute', flexDirection: 'row', alignItems: 'center' },
  cardNext: { position: 'absolute', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#34597F', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.18, shadowRadius: 10, elevation: 5 },
  writingBox: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.94)', shadowColor: '#315B88', shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 4, justifyContent: 'center', ...webGlass('blur(16px) saturate(1.3)') },
  writingInput: { color: '#29446E', fontWeight: '500', paddingVertical: 0, height: '100%', outlineStyle: 'none' } as any,
  sendButton: { position: 'absolute', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 2, borderColor: '#C9F1FF', shadowColor: BLUE, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.42, shadowRadius: 10, elevation: 6 },
  wordBack: { position: 'absolute', overflow: 'hidden', borderWidth: 1.5, borderColor: '#9EDCFF', shadowColor: '#2478B8', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.38, shadowRadius: 15, elevation: 6 },
  wordChinese: { position: 'absolute', color: INK, fontWeight: '800' },
  wordFront: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.9)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.98)', shadowColor: '#26394D', shadowOffset: { width: 0, height: 13 }, shadowOpacity: 0.32, shadowRadius: 17, elevation: 8, ...webGlass('blur(12px) saturate(1.25)') },
  wordFlipCard: { position: 'absolute' },
  wordFace: { ...StyleSheet.absoluteFillObject, backfaceVisibility: 'hidden', overflow: 'hidden', ...(Platform.OS === 'web' ? ({ WebkitBackfaceVisibility: 'hidden', transformStyle: 'preserve-3d' } as any) : null) },
  wordFaceBack: { backgroundColor: 'rgba(239,248,255,0.96)', justifyContent: 'center' },
  wordEdgeFlash: { position: 'absolute', zIndex: 16, backgroundColor: 'rgba(255,255,255,0.96)', shadowColor: '#7ED6FF', shadowOpacity: 0.52, shadowRadius: 7 },
  wordBackTitle: { color: INK, fontWeight: '900' },
  wordExample: { color: '#405C82', fontWeight: '600', marginTop: 7 },
  wordFlipHint: { color: '#7C8DA5', fontWeight: '600', marginTop: 7 },
  wordSpeakButton: { position: 'absolute', zIndex: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.82)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.98)', shadowColor: '#315B88', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 5 },
  wordEnglish: { color: '#101010', fontWeight: '800' },
  pronunciation: { flexDirection: 'row', alignItems: 'center' },
  pronunciationText: { color: '#67758B', fontWeight: '500' },
  sceneRow: { position: 'absolute', flexDirection: 'row' },
  sceneTile: { overflow: 'hidden', borderWidth: 2, borderColor: '#fff', shadowColor: '#234F79', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.24, shadowRadius: 8, elevation: 4 },
  sceneTileActive: { borderColor: BLUE, shadowColor: BLUE, shadowOpacity: 0.5 },
  sceneTitle: { color: '#fff', fontWeight: '900' },
  sceneSubtitle: { color: '#fff', fontWeight: '600' },
  journeyTitle: { color: INK, fontWeight: '900' },
  journeySubtitle: { color: MUTED, fontWeight: '500' },
  track: { position: 'absolute' },
  nowPill: { position: 'absolute', color: '#fff', backgroundColor: BLUE, overflow: 'hidden', fontWeight: '800', whiteSpace: 'nowrap' } as any,
  trackLabel: { color: '#76879D', fontWeight: '700' },
  trackLabelActive: { color: BLUE },
  trackNode: { backgroundColor: '#1B91FF', borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: BLUE, shadowOpacity: 0.28, shadowRadius: 6, elevation: 3 },
  trackNodeCurrent: { backgroundColor: BLUE_DARK, transform: [{ scale: 1.08 }] },
  trackNodeLocked: { backgroundColor: '#B1B9C5', shadowOpacity: 0.08 },
  moreNode: { backgroundColor: '#A8AFBA', borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  trackInfoCard: { position: 'absolute', zIndex: 60, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.98)', shadowColor: '#23598D', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.3, shadowRadius: 24, elevation: 12, ...webGlass('blur(20px) saturate(1.35)') },
  trackInfoTitle: { color: INK, fontWeight: '900' },
  trackInfoText: { color: MUTED, fontWeight: '600', marginTop: 5, paddingRight: 28 },
  trackInfoClose: { position: 'absolute', right: 11, top: 11 },
  overlayRoot: { ...StyleSheet.absoluteFillObject, zIndex: 500, overflow: 'visible' },
  overlayBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(228,239,251,0.78)' },
  overlayPanel: { position: 'absolute', overflow: 'hidden', backgroundColor: 'rgba(246,251,255,0.96)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.98)', shadowColor: '#123F73', shadowOffset: { width: 0, height: 24 }, shadowOpacity: 0.34, shadowRadius: 42, elevation: 24 },
  overlayImageClip: { position: 'absolute', left: 0, right: 0, top: 0, overflow: 'hidden' },
  overlayImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  overlayClose: { position: 'absolute', zIndex: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.78)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.96)', shadowColor: '#244F7D', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.22, shadowRadius: 12, elevation: 8, ...webGlass('blur(14px) saturate(1.3)') },
  overlayCopy: { position: 'absolute' },
  overlayEyebrow: { color: BLUE, fontWeight: '900', letterSpacing: 1.2 },
  overlayTitle: { color: INK, fontWeight: '900', marginTop: 5 },
  overlayDescription: { color: '#49617E', fontWeight: '500', marginTop: 8 },
  phraseCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.98)', shadowColor: '#315C88', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 14, elevation: 5, ...webGlass('blur(16px) saturate(1.25)') },
  phraseEnglish: { color: '#17355E', fontWeight: '800' },
  phraseChinese: { color: MUTED, fontWeight: '500', marginTop: 3 },
  overlayPrimary: { overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1.5, borderColor: '#C8F4FF', shadowColor: BLUE, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.36, shadowRadius: 16, elevation: 7 },
  overlayPrimaryText: { color: '#fff', fontWeight: '900' },
  coachOverlayActions: { width: '100%' },
  coachStateCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)' },
  coachStateTitle: { color: INK, fontWeight: '900' },
  coachStateText: { color: MUTED, fontWeight: '500', marginTop: 4 },
  hotspot: { position: 'absolute', zIndex: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.56)', borderWidth: 2, borderColor: '#fff', shadowColor: '#007DFF', shadowOpacity: 0.7, shadowRadius: 12, elevation: 9 },
  hotspotCore: { backgroundColor: BLUE },
  hotspotCard: { position: 'absolute', zIndex: 35, backgroundColor: 'rgba(255,255,255,0.86)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.98)', shadowColor: '#123F73', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.28, shadowRadius: 20, elevation: 12, ...webGlass('blur(18px) saturate(1.35)') },
  hotspotWord: { color: INK, fontWeight: '900' },
  hotspotTranslation: { color: MUTED, fontWeight: '600', marginTop: 4 },
  hotspotSpeak: { position: 'absolute', right: 15, top: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(231,246,255,0.92)' },
  error: { position: 'absolute', color: '#D92D20', textAlign: 'center', fontWeight: '700' },
});
