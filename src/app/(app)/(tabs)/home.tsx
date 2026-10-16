import { fetch as expoFetch } from 'expo/fetch';
import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowRight,
  Camera,
  Check,
  ChevronRight,
  Flame,
  Headphones,
  Image as ImageIcon,
  Map,
  Mic,
  Pencil,
  Send,
  Sparkles,
  Square,
  Volume2,
} from 'lucide-react-native';
import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  type GestureResponderEvent,
  Pressable,
  ScrollView,
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
  FadeOutUp,
  interpolate,
  LinearTransition,
  runOnJS,
  useAnimatedProps,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { MotionPressable } from '@/components/motion-pressable';
import { addXp, fetchLearningRecords, fetchXpData, invokeEdgeFunction } from '@/lib/api';
import { arrayBufferToBase64, audioBlobTo16kWav, startWebAudioRecording } from '@/lib/audioCapture';
import { setPendingUri } from '@/lib/imageStore';
import { speakWithTTS, stopLocalSpeech } from '@/lib/speech';

const BLUE = '#2F6FED';
const BLUE_DARK = '#174EA6';
const BLUE_SOFT = '#EEF4FF';
const GREEN = '#1E9E67';
const ORANGE = '#F97316';
const INK = '#14213D';
const MUTED = '#667085';
const BORDER = '#E6EAF0';
const BG = '#F7F9FC';
const WHITE = '#FFFFFF';
const DAILY_GOAL = 3;
const COACH_EXPRESSION = "I'd like a latte, please.";

const RECORDING_OPTIONS = {
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 64000,
  android: { outputFormat: 'mpeg4' as const, audioEncoder: 'aac' as const },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.HIGH,
    linearPCMBitDepth: 16 as const,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 64000 },
};

type InputMode = 'text' | 'voice';
type SceneInputMode = 'camera' | 'gallery' | InputMode;

interface LearningRecord {
  id: string;
  scene_name: string;
  scene_image?: string;
  i_see?: string;
  created_at: string;
  input_type?: string;
}

function parseRecordDate(value: string): Date {
  const parsed = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function relativeRecordTime(value: string): string {
  const date = parseRecordDate(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dateKey(date) === dateKey(today)) return '今天练习';
  if (dateKey(date) === dateKey(yesterday)) return '昨天练习';
  return `${date.getMonth() + 1}月${date.getDate()}日练习`;
}

function getSceneIcon(name: string): string {
  const icons: Record<string, string> = {
    咖啡: '☕',
    餐厅: '🍽️',
    办公室: '💼',
    公园: '🌳',
    超市: '🛒',
    图书馆: '📚',
    健身房: '🏋️',
    机场: '✈️',
    地铁: '🚇',
    医院: '🏥',
    证件: '📷',
  };
  for (const [keyword, icon] of Object.entries(icons)) {
    if (name.includes(keyword)) return icon;
  }
  return '📍';
}

const BAR_HEIGHTS = [12, 20, 29, 38, 42, 38, 29, 20, 12];
const BAR_MIN = 6;

function WaveBar({ baseHeight, delay, active }: { baseHeight: number; delay: number; active: boolean }) {
  const height = useSharedValue(BAR_MIN);

  useEffect(() => {
    if (active) {
      height.value = withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(baseHeight * 0.85, { duration: 230 }),
            withTiming(BAR_MIN + 4, { duration: 210 }),
            withTiming(baseHeight * 0.55, { duration: 190 }),
          ),
          -1,
          true,
        ),
      );
    } else {
      cancelAnimation(height);
      height.value = withTiming(BAR_MIN, { duration: 220 });
    }
  }, [active, baseHeight, delay, height]);

  const animatedStyle = useAnimatedStyle(() => ({ height: height.value }));
  return <Animated.View style={[styles.waveBar, active && styles.waveBarActive, animatedStyle]} />;
}

function AudioWave({ active }: { active: boolean }) {
  return (
    <View style={styles.waveform}>
      {BAR_HEIGHTS.map((height, index) => (
        <WaveBar key={`${height}-${index}`} baseHeight={height} delay={index * 38} active={active} />
      ))}
    </View>
  );
}

function InputModeButton({
  mode,
  index,
  label,
  description,
  icon: Icon,
  color,
  background,
  selected,
  onPress,
}: {
  mode: SceneInputMode;
  index: string;
  label: string;
  description: string;
  icon: ComponentType<{ size?: number; color?: string }>;
  color: string;
  background: string;
  selected: boolean;
  onPress: (event: GestureResponderEvent, mode: SceneInputMode, color: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  const selection = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    selection.value = reduceMotion
      ? selected ? 1 : 0
      : withSpring(selected ? 1 : 0, { damping: 17, stiffness: 260, mass: 0.7 });
  }, [reduceMotion, selected, selection]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -3 * selection.value },
      { scale: 1 + 0.018 * selection.value },
    ],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.09 * selection.value }],
  }));

  return (
    <Animated.View style={[styles.modeSlot, containerStyle]}>
      <MotionPressable
        onPress={event => onPress(event, mode, color)}
        accessibilityRole="button"
        accessibilityLabel={`${label}输入`}
        accessibilityState={{ selected }}
        style={[
          styles.modeButton,
          { backgroundColor: background, borderColor: selected ? color : 'transparent' },
          selected && styles.modeButtonSelected,
        ]}
      >
        <View style={styles.modeTopRow}>
          <Animated.View style={[styles.modeIcon, { backgroundColor: color }, iconStyle]}>
            <Icon size={20} color={WHITE} />
          </Animated.View>
          <Text style={[styles.modeIndex, { color }]}>{index}</Text>
        </View>
        <View style={styles.modeCopy}>
          <Text style={styles.modeLabel}>{label}</Text>
          <Text style={styles.modeDescription} numberOfLines={1}>{description}</Text>
        </View>
        <View style={[styles.modeDirection, selected && { backgroundColor: color }]}>
          <ChevronRight size={14} color={selected ? WHITE : color} strokeWidth={2.5} />
        </View>
        {selected && (
          <Animated.View entering={reduceMotion ? undefined : ZoomIn.duration(180)} style={[styles.modeCheck, { backgroundColor: color }]}>
            <Check size={10} color={WHITE} strokeWidth={3} />
          </Animated.View>
        )}
      </MotionPressable>
    </Animated.View>
  );
}

const AnimatedImage = Animated.createAnimatedComponent(Image);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function ProgressRing({ progress, count, goal }: { progress: number; count: number; goal: number }) {
  const reduceMotion = useReducedMotion();
  const animatedProgress = useSharedValue(0);
  const radius = 27;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    animatedProgress.value = reduceMotion ? progress : withTiming(progress, { duration: 780 });
  }, [animatedProgress, progress, reduceMotion]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - Math.max(0, Math.min(animatedProgress.value, 1))),
  }));

  return (
    <View style={styles.progressRingWrap} accessibilityLabel={`今日学习进度 ${count}/${goal}`}>
      <Svg width={68} height={68} viewBox="0 0 68 68">
        <Circle cx={34} cy={34} r={radius} fill="none" stroke="#E7EEF8" strokeWidth={7} />
        <AnimatedCircle
          animatedProps={animatedProps}
          cx={34}
          cy={34}
          r={radius}
          fill="none"
          stroke={progress >= 1 ? GREEN : BLUE}
          strokeWidth={7}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeLinecap="round"
          transform="rotate(-90 34 34)"
        />
      </Svg>
      <View style={styles.progressRingCopy}>
        {progress >= 1 ? (
          <View style={styles.progressRingCompleted}>
            <Check size={16} color={GREEN} strokeWidth={3} />
            <Text style={styles.progressRingCompletedText}>完成</Text>
          </View>
        ) : (
          <View style={styles.progressRingFraction}>
            <Text style={styles.progressRingNumber}>{count}</Text>
            <Text style={styles.progressRingGoal}>/{goal}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

interface LearningDeckProps {
  records: LearningRecord[];
  loading: boolean;
  failedImageId: string | null;
  onImageError: (id: string) => void;
  onOpen: (record: LearningRecord, event: GestureResponderEvent) => void;
  onEmpty: () => void;
}

function LearningDeck({ records, loading, failedImageId, onImageError, onOpen, onEmpty }: LearningDeckProps) {
  const reduceMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const draggedRef = useRef(false);
  const dragResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translateX = useSharedValue(0);
  const cardTilt = useSharedValue(0);
  const visibleRecords = records.slice(0, 3);

  useEffect(() => {
    if (activeIndex >= visibleRecords.length) setActiveIndex(0);
  }, [activeIndex, visibleRecords.length]);

  useEffect(() => () => {
    if (dragResetTimerRef.current) clearTimeout(dragResetTimerRef.current);
  }, []);

  const finishSwipe = useCallback((direction: 1 | -1) => {
    if (visibleRecords.length < 2) return;
    setActiveIndex(current => (current + direction + visibleRecords.length) % visibleRecords.length);
    translateX.value = 0;
    cardTilt.value = 0;
    if (process.env.EXPO_OS !== 'web') void Haptics.selectionAsync();
  }, [cardTilt, translateX, visibleRecords.length]);

  const pan = useMemo(() => Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-12, 12])
    .failOffsetY([-16, 16])
    .onBegin(() => {
      draggedRef.current = false;
      if (dragResetTimerRef.current) clearTimeout(dragResetTimerRef.current);
    })
    .onUpdate(event => {
      if (Math.abs(event.translationX) > 10) draggedRef.current = true;
      translateX.value = event.translationX;
      cardTilt.value = interpolate(event.translationX, [-240, 0, 240], [-3.5, 0, 3.5], Extrapolation.CLAMP);
    })
    .onEnd(event => {
      const shouldAdvance = Math.abs(event.translationX) > 70 || Math.abs(event.velocityX) > 650;
      if (!shouldAdvance || visibleRecords.length < 2) {
        translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
        cardTilt.value = withSpring(0, { damping: 18, stiffness: 220 });
        return;
      }
      const direction: 1 | -1 = event.translationX < 0 ? 1 : -1;
      const target = direction === 1 ? -520 : 520;
      translateX.value = withTiming(target, { duration: reduceMotion ? 1 : 230 }, finished => {
        if (finished) runOnJS(finishSwipe)(direction);
      });
    })
    .onFinalize(() => {
      dragResetTimerRef.current = setTimeout(() => {
        draggedRef.current = false;
      }, 120);
    }), [cardTilt, finishSwipe, reduceMotion, translateX, visibleRecords.length]);

  const activeCardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { rotate: `${cardTilt.value}deg` },
    ],
  }));

  if (loading) {
    return (
      <View style={[styles.learningDeck, styles.learningDeckLoading]}>
        <ActivityIndicator size="small" color={BLUE} />
      </View>
    );
  }

  if (visibleRecords.length === 0) {
    return (
      <MotionPressable onPress={onEmpty} style={styles.emptyLearningCard} accessibilityRole="button" accessibilityLabel="开始第一个场景">
        <View style={styles.continueFallback}><Text style={styles.continueEmoji}>📍</Text></View>
        <View style={styles.continueCopy}>
          <Text style={styles.continueTitle}>开始第一个场景</Text>
          <Text style={styles.continueMeta}>拍一张照片，建立你的第一条学习记录</Text>
        </View>
        <View style={styles.continueAction}><Text style={styles.continueActionText}>开始</Text><ChevronRight size={16} color={BLUE} /></View>
      </MotionPressable>
    );
  }

  const ordered = [0, 1, 2]
    .filter(offset => offset < visibleRecords.length)
    .map(offset => ({ offset, record: visibleRecords[(activeIndex + offset) % visibleRecords.length] }));
  const activeRecord = visibleRecords[activeIndex];

  const renderCardContent = (record: LearningRecord) => (
    <>
      <View style={styles.deckAccentRail} />
      {record.scene_image && !record.scene_image.startsWith('blob:') && failedImageId !== record.id ? (
        <Image
          source={{ uri: record.scene_image }}
          style={styles.deckImage}
          contentFit="cover"
          onError={() => onImageError(record.id)}
        />
      ) : (
        <View style={styles.deckFallback}><Text style={styles.deckEmoji}>{getSceneIcon(record.scene_name)}</Text></View>
      )}
      <View style={styles.deckCopy}>
        <View style={styles.deckEyebrowRow}>
          <Text style={styles.deckEyebrow}>最近练习</Text>
          <Text style={styles.deckDate}>{relativeRecordTime(record.created_at)}</Text>
        </View>
        <Text style={styles.deckTitle} numberOfLines={1}>{record.scene_name}</Text>
        <Text style={styles.deckSentence} numberOfLines={2}>{record.i_see || '继续完成你的场景英语练习'}</Text>
      </View>
      <View style={styles.deckArrow}>
        <Text style={styles.deckArrowLabel}>继续</Text>
        <ChevronRight size={15} color={BLUE} strokeWidth={2.5} />
      </View>
    </>
  );

  return (
    <View>
      <View style={styles.learningDeck}>
        {[...ordered].reverse().map(({ offset, record }) => {
          if (offset === 0) return null;
          return (
            <Animated.View
              key={`${record.id}-${offset}`}
              layout={reduceMotion ? undefined : LinearTransition.springify().damping(19).stiffness(180)}
              style={[
                styles.deckCard,
                styles.deckCardBack,
                {
                  top: offset * 9,
                  left: offset * 10,
                  right: offset * 10,
                  opacity: 1 - offset * 0.18,
                  transform: [{ scale: 1 - offset * 0.035 }],
                  zIndex: 3 - offset,
                },
              ]}
            >
              {renderCardContent(record)}
            </Animated.View>
          );
        })}
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.deckCard, styles.deckCardFront, activeCardStyle]}>
            <Pressable
              onPress={(event) => {
                if (!draggedRef.current) onOpen(activeRecord, event);
              }}
              accessibilityRole="button"
              accessibilityLabel={`继续学习 ${activeRecord.scene_name}`}
              style={styles.deckPressable}
            >
              {renderCardContent(activeRecord)}
            </Pressable>
          </Animated.View>
        </GestureDetector>
      </View>

      <View style={styles.deckPagination}>
        <Text style={styles.deckCounter}>第 {activeIndex + 1}/{visibleRecords.length} 条</Text>
        <View style={styles.deckIndicatorRow}>
          {visibleRecords.map((record, index) => (
            <Pressable
              key={record.id}
              accessibilityRole="button"
              accessibilityLabel={`查看第 ${index + 1} 条学习记录`}
              onPress={() => setActiveIndex(index)}
              hitSlop={8}
            >
              <Animated.View
                layout={reduceMotion ? undefined : LinearTransition.springify().damping(20).stiffness(220)}
                style={[styles.deckIndicator, index === activeIndex && styles.deckIndicatorActive]}
              />
            </Pressable>
          ))}
        </View>
        <Text style={styles.deckSwipeHint}>左右滑动</Text>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const player = useAudioPlayer();
  const recorder = useAudioRecorder(RECORDING_OPTIONS);

  const [sceneInputMode, setSceneInputMode] = useState<InputMode | null>(null);
  const [sceneInputText, setSceneInputText] = useState('');
  const [coachInput, setCoachInput] = useState('');
  const [coachInputFocused, setCoachInputFocused] = useState(false);
  const [records, setRecords] = useState<LearningRecord[]>([]);
  const [streakDays, setStreakDays] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failedRecordImageId, setFailedRecordImageId] = useState<string | null>(null);
  const [previewSpeaking, setPreviewSpeaking] = useState(false);
  const [recState, setRecState] = useState<'idle' | 'requesting' | 'recording' | 'transcribing'>('idle');
  const [recError, setRecError] = useState('');
  const [recSeconds, setRecSeconds] = useState(0);
  const [reveal, setReveal] = useState<{ x: number; y: number; color: string } | null>(null);

  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const revealActionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webRecorderRef = useRef<MediaRecorder | null>(null);
  const progressValue = useSharedValue(0);
  const revealProgress = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const contentWidth = Math.min(width, 760);
  const compactHeader = width < 480;
  const heroHeight = Math.min(360, Math.max(300, Math.round((contentWidth - 32) * 0.78)));

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        setLoading(true);
        await addXp('daily_checkin').catch(() => {});
        const [recordsResult, xpResult] = await Promise.allSettled([
          fetchLearningRecords(),
          fetchXpData(),
        ]);
        if (!active) return;
        if (recordsResult.status === 'fulfilled') {
          const sorted = [...recordsResult.value].sort(
            (a, b) => parseRecordDate(b.created_at).getTime() - parseRecordDate(a.created_at).getTime(),
          );
          setRecords(sorted);
          setFailedRecordImageId(null);
        }
        if (xpResult.status === 'fulfilled') {
          setStreakDays(Number(xpResult.value.stats?.streak_days ?? 0));
        }
        setLoading(false);
      })();

      return () => {
        active = false;
        stopLocalSpeech();
        setPreviewSpeaking(false);
      };
    }, []),
  );

  useEffect(() => () => {
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    if (revealActionTimerRef.current) clearTimeout(revealActionTimerRef.current);
    if (revealCleanupTimerRef.current) clearTimeout(revealCleanupTimerRef.current);
  }, []);

  const handleCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images' as any, quality: 0.8 });
    if (!result.canceled) {
      setPendingUri(result.assets[0].uri);
      router.push('/(app)/thinking-mode?inputType=photo' as any);
    }
  };

  const handleGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images' as any, quality: 0.8 });
    if (!result.canceled) {
      setPendingUri(result.assets[0].uri);
      router.push('/(app)/thinking-mode?inputType=photo' as any);
    }
  };

  const submitSceneText = () => {
    const text = sceneInputText.trim();
    if (!text) return;
    const inputType = sceneInputMode ?? 'text';
    router.push(`/(app)/thinking-mode?inputType=${inputType}&text=${encodeURIComponent(text)}` as any);
  };

  const transcribeAudio = async (speech: string, length: number, format: 'wav' | 'm4a') => {
    const data = await invokeEdgeFunction('short-speech-recognition', {
      speech,
      len: length,
      format,
      rate: 16000,
      language: 'en',
      cuid: 'home',
    });
    const recognized = String(data?.result?.[0] || '').trim();
    if (!recognized) throw new Error('未识别到内容，请靠近麦克风后重试');
    setSceneInputText(recognized);
  };

  const startRecording = async () => {
    setRecError('');
    setRecState('requesting');
    if (process.env.EXPO_OS === 'web') {
      try {
        webRecorderRef.current = await startWebAudioRecording(
          async (blob) => {
            webRecorderRef.current = null;
            if (blob.size < 200) throw new Error('录音时间太短，请重新录制');
            setRecState('transcribing');
            try {
              const wav = await audioBlobTo16kWav(blob);
              await transcribeAudio(arrayBufferToBase64(wav), wav.byteLength, 'wav');
            } catch (error) {
              setRecError(error instanceof Error ? error.message : '识别失败，请重试');
            } finally {
              setRecState('idle');
            }
          },
          (error) => {
            webRecorderRef.current = null;
            setRecError(error instanceof Error ? error.message : '录音失败，请重试');
            setRecState('idle');
          },
        );
        setRecState('recording');
        setRecSeconds(0);
        recTimerRef.current = setInterval(() => setRecSeconds((seconds) => seconds + 1), 1000);
        return;
      } catch (error) {
        setRecError(error instanceof Error ? error.message : '无法使用麦克风，请检查浏览器权限');
        setRecState('idle');
        return;
      }
    }

    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setRecError('需要麦克风权限才能录音');
      setRecState('idle');
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecState('recording');
      setRecSeconds(0);
      recTimerRef.current = setInterval(() => setRecSeconds((seconds) => seconds + 1), 1000);
    } catch {
      setRecError('录音启动失败，请重试');
      setRecState('idle');
    }
  };

  const stopRecording = async () => {
    if (recTimerRef.current) {
      clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
    if (process.env.EXPO_OS === 'web' && webRecorderRef.current) {
      const activeRecorder = webRecorderRef.current;
      if (activeRecorder.state !== 'inactive') activeRecorder.stop();
      setRecState('transcribing');
      return;
    }

    setRecState('transcribing');
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('录音文件为空');
      const response = await expoFetch(uri);
      const buffer = await response.arrayBuffer();
      await transcribeAudio(arrayBufferToBase64(buffer), buffer.byteLength, 'm4a');
    } catch (error) {
      setRecError(error instanceof Error ? error.message : '识别失败，请重试');
    } finally {
      setRecState('idle');
    }
  };

  useEffect(() => {
    if (recState === 'recording' && recSeconds >= 60) void stopRecording();
  }, [recSeconds, recState]);

  const openCoach = (prompt?: string) => {
    const trimmed = prompt?.trim();
    if (trimmed) {
      setCoachInput('');
      router.push({
        pathname: '/(app)/(tabs)/ai-coach',
        params: { prompt: trimmed },
      } as any);
      return;
    }
    router.push('/(app)/(tabs)/ai-coach' as any);
  };

  const togglePreviewSpeech = () => {
    if (previewSpeaking) {
      stopLocalSpeech();
      setPreviewSpeaking(false);
      return;
    }
    setPreviewSpeaking(true);
    void speakWithTTS(COACH_EXPRESSION, player, invokeEdgeFunction, () => setPreviewSpeaking(false));
  };

  const today = useMemo(() => new Date(), [records]);
  const todayCount = records.filter((record) => dateKey(parseRecordDate(record.created_at)) === dateKey(today)).length;
  const dailyProgress = Math.min(todayCount / DAILY_GOAL, 1);

  useEffect(() => {
    progressValue.value = reduceMotion
      ? dailyProgress
      : withTiming(dailyProgress, { duration: 720 });
  }, [dailyProgress, progressValue, reduceMotion]);

  const progressAnimatedStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(progressValue.value, 1)) * 100}%`,
  }));

  const handleScroll = useAnimatedScrollHandler(event => {
    scrollY.value = event.contentOffset.y;
  });

  const heroImageAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(scrollY.value, [0, 360], [0, 58], Extrapolation.CLAMP) },
      { scale: interpolate(scrollY.value, [0, 360], [1.02, 1.1], Extrapolation.CLAMP) },
    ],
  }));

  const revealAnimatedStyle = useAnimatedStyle(() => {
    const maxScale = (Math.hypot(width, height) * 2.2) / 72;
    return {
      opacity: interpolate(revealProgress.value, [0, 0.12, 1], [0, 0.94, 0.97], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(revealProgress.value, [0, 1], [0.2, maxScale], Extrapolation.CLAMP) }],
    };
  });

  const runCircularAction = (event: GestureResponderEvent, action: () => void, color = BLUE) => {
    if (reduceMotion) {
      action();
      return;
    }
    if (revealActionTimerRef.current) clearTimeout(revealActionTimerRef.current);
    if (revealCleanupTimerRef.current) clearTimeout(revealCleanupTimerRef.current);
    const { pageX, pageY } = event.nativeEvent;
    setReveal({ x: pageX, y: pageY, color });
    revealProgress.value = 0;
    requestAnimationFrame(() => {
      revealProgress.value = withTiming(1, { duration: 390 });
    });
    if (process.env.EXPO_OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    revealActionTimerRef.current = setTimeout(action, 270);
    revealCleanupTimerRef.current = setTimeout(() => {
      setReveal(null);
      revealProgress.value = 0;
    }, 620);
  };

  const weekDays = useMemo(() => {
    const start = new Date(today);
    const offset = (today.getDay() + 6) % 7;
    start.setDate(today.getDate() - offset);
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [today]);
  const practicedDays = useMemo(
    () => new Set(records.map((record) => dateKey(parseRecordDate(record.created_at)))),
    [records],
  );
  const weekCompleted = weekDays.filter((date) => practicedDays.has(dateKey(date))).length;

  const selectInputMode = (mode: SceneInputMode) => {
    setRecError('');
    if (mode === 'camera') {
      void handleCamera();
      return;
    }
    if (mode === 'gallery') {
      void handleGallery();
      return;
    }
    setSceneInputMode((current) => (current === mode ? null : mode));
  };

  const handleInputModePress = (
    event: GestureResponderEvent,
    mode: SceneInputMode,
    color: string,
  ) => {
    if (mode === 'camera' || mode === 'gallery') {
      runCircularAction(event, () => selectInputMode(mode), color);
      return;
    }
    selectInputMode(mode);
  };

  const inputModes = [
    { key: 'camera' as const, index: '01', label: '拍照', description: '拍下眼前场景', icon: Camera, color: BLUE, background: '#F4F8FF' },
    { key: 'gallery' as const, index: '02', label: '相册', description: '从已有照片开始', icon: ImageIcon, color: GREEN, background: '#F2FBF7' },
    { key: 'text' as const, index: '03', label: '文字', description: '描述正在经历的', icon: Pencil, color: ORANGE, background: '#FFF7F1' },
    { key: 'voice' as const, index: '04', label: '语音', description: '说出眼前的场景', icon: Mic, color: '#7357D9', background: '#F7F4FF' },
  ];
  const activeInputMode = inputModes.find(({ key }) => key === sceneInputMode);
  const coachSuggestions = ['咖啡馆怎么自然点单？', '帮我纠正一句英语', '练习机场英语对话'];

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" backgroundColor={WHITE} />
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <View style={[styles.page, { paddingTop: Math.max(insets.top + 12, 24) }]}>
          <Animated.View
            entering={reduceMotion ? undefined : FadeInDown.duration(420)}
            style={[styles.brandRow, compactHeader && styles.brandRowCompact]}
          >
            <View style={styles.brandBlock}>
              <Text style={styles.brandTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.86}>
                Visual English <Text style={styles.brandAccent}>Coach</Text>
              </Text>
              <Text style={[styles.brandSubtitle, compactHeader && styles.brandSubtitleCompact]}>
                用真实场景，看见更地道的英语
              </Text>
            </View>
            <MotionPressable
              onPress={() => router.push('/(app)/(tabs)/growth' as any)}
              accessibilityRole="button"
              accessibilityLabel={`连续学习 ${streakDays} 天，查看成长进度`}
              style={[styles.streakPill, compactHeader && styles.streakPillCompact]}
            >
              <Flame size={17} color={ORANGE} fill={ORANGE} />
              {!compactHeader ? <Text style={styles.streakText}>连续学习</Text> : null}
              <Text style={styles.streakNumber}>{streakDays}</Text>
              <Text style={styles.streakText}>天</Text>
              <ChevronRight size={15} color="#98A2B3" />
            </MotionPressable>
          </Animated.View>

          <Animated.View
            entering={reduceMotion ? undefined : FadeInDown.delay(70).duration(460)}
            style={[styles.hero, { height: heroHeight }]}
          >
            <AnimatedImage
              source={require('../../../../assets/home-cafe-hero.png')}
              style={[styles.heroImage, heroImageAnimatedStyle]}
              contentFit="cover"
              contentPosition="center"
              transition={250}
            />
            <LinearGradient
              colors={['rgba(10,20,38,0.02)', 'rgba(10,20,38,0.12)', 'rgba(8,17,34,0.82)']}
              locations={[0, 0.45, 1]}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.heroVisionBadge}>
              <Sparkles size={13} color={WHITE} />
              <Text style={styles.heroVisionText}>AI 视觉场景</Text>
            </View>
            <View style={styles.heroContent}>
              <Text style={styles.heroTitle}>今天从哪个{`\n`}场景开始？</Text>
              <Text style={styles.heroDescription}>拍下你眼前的场景，让 AI 帮你看图学英语。</Text>
              <MotionPressable
                onPress={event => runCircularAction(event, () => void handleCamera())}
                accessibilityRole="button"
                accessibilityLabel="拍下眼前场景"
                style={styles.heroButtonWrap}
                pressedScale={0.965}
                haptic={false}
              >
                <LinearGradient colors={['#2F7AF8', '#245EDB']} style={styles.heroButton}>
                  <Camera size={21} color={WHITE} />
                  <Text style={styles.heroButtonText}>拍下眼前场景</Text>
                  <ChevronRight size={19} color={WHITE} />
                </LinearGradient>
              </MotionPressable>
            </View>
          </Animated.View>

          <Animated.View
            entering={reduceMotion ? undefined : FadeInDown.delay(130).duration(440)}
            layout={reduceMotion ? undefined : LinearTransition.springify().damping(19).stiffness(190)}
            style={styles.modeRow}
          >
            {inputModes.map(({ key, index, label, description, icon, color, background }) => {
              const selected = sceneInputMode === key;
              return (
                <InputModeButton
                  key={key}
                  mode={key}
                  index={index}
                  label={label}
                  description={description}
                  icon={icon}
                  color={color}
                  background={background}
                  selected={selected}
                  onPress={handleInputModePress}
                />
              );
            })}
          </Animated.View>

          {sceneInputMode ? (
            <Animated.View
              entering={reduceMotion ? undefined : FadeInDown.duration(260)}
              exiting={reduceMotion ? undefined : FadeOutUp.duration(180)}
              layout={reduceMotion ? undefined : LinearTransition.springify().damping(20).stiffness(180)}
              style={styles.sceneInputPanel}
            >
              <View style={styles.sceneInputHeader}>
                <View style={[styles.sceneInputMarker, { backgroundColor: activeInputMode?.color ?? BLUE }]} />
                <View style={styles.sceneInputHeaderCopy}>
                  <Text style={styles.sceneInputEyebrow}>当前输入方式</Text>
                  <Text style={styles.sceneInputTitle}>{activeInputMode?.label}</Text>
                </View>
                <Text style={styles.sceneInputStep}>{activeInputMode?.index}</Text>
              </View>
              {sceneInputMode === 'text' ? (
                <View style={styles.textInputRow}>
                  <TextInput
                    value={sceneInputText}
                    onChangeText={setSceneInputText}
                    placeholder="描述场景，例如：我正在咖啡馆工作"
                    placeholderTextColor="#98A2B3"
                    returnKeyType="send"
                    onSubmitEditing={submitSceneText}
                    style={styles.sceneTextInput}
                  />
                  <Pressable
                    onPress={submitSceneText}
                    disabled={!sceneInputText.trim()}
                    accessibilityRole="button"
                    accessibilityLabel="分析文字场景"
                    style={[styles.roundAction, !sceneInputText.trim() && styles.roundActionDisabled]}
                  >
                    <ArrowRight size={20} color={sceneInputText.trim() ? WHITE : '#98A2B3'} />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.voicePanel}>
                  <AudioWave active={recState === 'recording'} />
                  <Pressable
                    onPress={recState === 'idle' ? startRecording : recState === 'recording' ? stopRecording : undefined}
                    disabled={recState === 'requesting' || recState === 'transcribing'}
                    accessibilityRole="button"
                    accessibilityLabel={recState === 'recording'
                      ? '停止录音'
                      : recState === 'requesting'
                        ? '正在请求麦克风权限'
                        : recState === 'transcribing'
                          ? '正在识别语音'
                          : '开始语音输入'}
                    style={[
                      styles.recordButton,
                      recState === 'recording' && styles.recordButtonActive,
                      (recState === 'requesting' || recState === 'transcribing') && styles.recordButtonDisabled,
                    ]}
                  >
                    {recState === 'requesting' || recState === 'transcribing' ? (
                      <ActivityIndicator size="small" color={BLUE} />
                    ) : recState === 'recording' ? (
                      <Square size={19} color={WHITE} fill={WHITE} />
                    ) : (
                      <Mic size={23} color={WHITE} />
                    )}
                  </Pressable>
                  <View style={styles.voiceCopy}>
                    <Text style={[styles.voiceTitle, recState === 'recording' && styles.voiceTitleActive]}>
                      {recState === 'recording'
                        ? `录音中 ${recSeconds}s`
                        : recState === 'requesting'
                          ? '正在请求麦克风权限'
                          : recState === 'transcribing'
                            ? '正在识别语音'
                            : '点击麦克风开始描述'}
                    </Text>
                    <Text style={styles.voiceHint}>
                      {recState === 'recording'
                        ? '再次点击即可停止'
                        : recState === 'requesting'
                          ? '请在浏览器提示中选择允许'
                          : '可用英文描述你看到的场景'}
                    </Text>
                  </View>
                </View>
              )}

              {sceneInputMode === 'voice' && sceneInputText.trim() && recState === 'idle' ? (
                <View style={styles.transcriptBox}>
                  <Text style={styles.transcriptLabel}>识别结果</Text>
                  <Text style={styles.transcriptText}>{sceneInputText}</Text>
                  <View style={styles.transcriptActions}>
                    <Pressable onPress={submitSceneText} style={styles.primarySmallButton}>
                      <Text style={styles.primarySmallButtonText}>开始分析</Text>
                    </Pressable>
                    <Pressable onPress={() => setSceneInputText('')} style={styles.secondarySmallButton}>
                      <Text style={styles.secondarySmallButtonText}>重新录音</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
              {recError ? <Text style={styles.errorText}>{recError}</Text> : null}
            </Animated.View>
          ) : null}

          <View style={styles.sectionGap} />

          <Animated.View
            entering={reduceMotion ? undefined : FadeInDown.delay(170).duration(420)}
            style={styles.sectionHeader}
          >
            <View style={styles.sectionHeadingBlock}>
              <Text style={styles.sectionEyebrow}>LEARNING PATH</Text>
              <Text style={styles.sectionTitle}>继续学习</Text>
            </View>
            <MotionPressable onPress={() => router.push('/(app)/(tabs)/learning' as any)} style={styles.textLink}>
              <Text style={styles.textLinkLabel}>全部记录</Text>
              <ChevronRight size={15} color={BLUE} />
            </MotionPressable>
          </Animated.View>

          <Animated.View entering={reduceMotion ? undefined : FadeInDown.delay(210).duration(440)}>
            <LearningDeck
              records={records}
              loading={loading}
              failedImageId={failedRecordImageId}
              onImageError={setFailedRecordImageId}
              onOpen={(record, event) => runCircularAction(
                event,
                () => router.push(`/(app)/record/${record.id}` as any),
                '#F4F7FB',
              )}
              onEmpty={() => void handleCamera()}
            />
          </Animated.View>

          <Animated.View
            entering={reduceMotion ? undefined : FadeInDown.delay(250).duration(440)}
            style={styles.progressPanel}
          >
            <View style={styles.progressHeader}>
              <View style={styles.progressHeaderCopy}>
                <View style={styles.progressEyebrowRow}>
                  <View style={styles.progressPulse} />
                  <Text style={styles.progressEyebrow}>今日目标</Text>
                </View>
                <Text style={styles.sectionTitle}>学习进度</Text>
                <Text style={styles.progressSubtitle}>
                  {dailyProgress >= 1 ? '今日目标已完成，保持这个节奏' : `再完成 ${DAILY_GOAL - todayCount} 个场景达成目标`}
                </Text>
              </View>
              <ProgressRing progress={dailyProgress} count={todayCount} goal={DAILY_GOAL} />
            </View>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, progressAnimatedStyle]} />
            </View>
            <View style={styles.progressMetricRow}>
              <View style={styles.progressMetric}>
                <Text style={styles.progressMetricValue}>{todayCount}</Text>
                <Text style={styles.progressMetricLabel}>今日场景</Text>
              </View>
              <View style={styles.progressMetricDivider} />
              <View style={styles.progressMetric}>
                <Text style={styles.progressMetricValue}>{streakDays}</Text>
                <Text style={styles.progressMetricLabel}>连续天数</Text>
              </View>
              <View style={styles.progressMetricDivider} />
              <View style={styles.progressMetric}>
                <Text style={styles.progressMetricValue}>{weekCompleted}</Text>
                <Text style={styles.progressMetricLabel}>本周完成</Text>
              </View>
            </View>
            <View style={styles.weekHeader}>
              <Text style={styles.weekTitle}>本周学习</Text>
              <Text style={styles.weekCount}>{weekCompleted}/7 天</Text>
            </View>
            <View style={styles.weekRow}>
              <View pointerEvents="none" style={styles.weekConnector}>
                <View
                  style={[
                    styles.weekConnectorFill,
                    { width: `${Math.max(0, Math.min((weekCompleted - 1) / 6, 1)) * 100}%` },
                  ]}
                />
              </View>
              {weekDays.map((date, index) => {
                const completed = practicedDays.has(dateKey(date));
                const isToday = dateKey(date) === dateKey(today);
                return (
                  <View key={dateKey(date)} style={styles.weekDay}>
                    <Text style={[styles.weekDayLabel, isToday && styles.weekDayLabelToday]}>
                      {['一', '二', '三', '四', '五', '六', '日'][index]}
                    </Text>
                    <Animated.View
                      entering={reduceMotion ? undefined : ZoomIn.delay(300 + index * 45).duration(240)}
                      style={[
                        styles.weekDot,
                        completed && styles.weekDotCompleted,
                        isToday && !completed && styles.weekDotToday,
                      ]}
                    >
                      {completed ? <Check size={13} color={WHITE} strokeWidth={3} /> : null}
                    </Animated.View>
                  </View>
                );
              })}
            </View>
          </Animated.View>

          <Animated.View
            entering={reduceMotion ? undefined : FadeInDown.delay(300).duration(440)}
            style={styles.coachSection}
          >
            <LinearGradient
              colors={['#2F6FED', '#62A0FF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.coachTopAccent}
            />
            <View style={styles.coachHeading}>
              <View style={styles.coachMark}>
                <Sparkles size={18} color={BLUE} />
              </View>
              <View style={styles.coachHeadingCopy}>
                <Text style={styles.coachKicker}>PERSONAL COACH</Text>
                <Text style={styles.sectionTitle}>AI 英语教练</Text>
                <Text style={styles.coachSubtitle}>问表达、练对话、纠正英语</Text>
              </View>
              <View style={styles.onlineStatus}>
                <View style={styles.onlineDot} />
                <Text style={styles.onlineText}>在线</Text>
              </View>
            </View>

            <View style={[styles.coachComposer, coachInputFocused && styles.coachComposerFocused]}>
              <TextInput
                value={coachInput}
                onChangeText={setCoachInput}
                onFocus={() => setCoachInputFocused(true)}
                onBlur={() => setCoachInputFocused(false)}
                placeholder="问问 AI 教练…"
                placeholderTextColor="#98A2B3"
                returnKeyType="send"
                onSubmitEditing={() => openCoach(coachInput)}
                style={styles.coachInput}
              />
              <MotionPressable
                onPress={() => openCoach()}
                accessibilityRole="button"
                accessibilityLabel="打开 AI 教练语音输入"
                style={styles.coachMicButton}
              >
                <Mic size={19} color={BLUE} />
              </MotionPressable>
              <MotionPressable
                onPress={() => openCoach(coachInput)}
                disabled={!coachInput.trim()}
                accessibilityRole="button"
                accessibilityLabel="发送给 AI 教练"
                style={[styles.coachSendButton, !coachInput.trim() && styles.coachSendDisabled]}
              >
                <Send size={18} color={coachInput.trim() ? WHITE : '#98A2B3'} />
              </MotionPressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              contentContainerStyle={styles.suggestionRow}
            >
              {coachSuggestions.map((suggestion) => (
                <MotionPressable key={suggestion} onPress={() => openCoach(suggestion)} style={styles.suggestionChip}>
                  <Text style={styles.suggestionText}>{suggestion}</Text>
                </MotionPressable>
              ))}
            </ScrollView>

            <View style={styles.coachReply}>
              <View style={styles.replyTopRow}>
                <View style={styles.replyLabelRow}>
                  <View style={styles.replyStatusDot} />
                  <Text style={styles.replyLabel}>AI 教练推荐</Text>
                </View>
                <MotionPressable onPress={togglePreviewSpeech} style={styles.readButton}>
                  {previewSpeaking ? <Square size={12} color={BLUE} fill={BLUE} /> : <Volume2 size={15} color={BLUE} />}
                  <Text style={styles.readButtonText}>{previewSpeaking ? '停止' : '朗读'}</Text>
                </MotionPressable>
              </View>
              <Text style={styles.replyEnglish}>{COACH_EXPRESSION}</Text>
              <Text style={styles.replyChinese}>我想要一杯拿铁，谢谢。</Text>
              <MotionPressable onPress={() => openCoach('请和我练习在咖啡馆用英语点单。')} style={styles.continueChatButton}>
                <Text style={styles.continueChatText}>继续这个对话</Text>
                <ArrowRight size={15} color={BLUE} />
              </MotionPressable>
            </View>
          </Animated.View>

          <Animated.View
            entering={reduceMotion ? undefined : FadeInDown.delay(350).duration(440)}
            style={styles.shortcutRow}
          >
            <MotionPressable
              onPress={() => router.push(`/(app)/shadowing?sentence=${encodeURIComponent(COACH_EXPRESSION)}` as any)}
              style={styles.shortcut}
            >
              <View style={styles.shortcutTopRow}>
                <View style={[styles.shortcutIcon, styles.shortcutIconOrange]}>
                  <Headphones size={21} color={ORANGE} />
                </View>
                <Text style={styles.shortcutIndex}>01</Text>
              </View>
              <Text style={styles.shortcutTitle}>影子跟读</Text>
              <View style={styles.shortcutFooter}>
                <Text style={styles.shortcutSubtitle}>练语音节奏</Text>
                <View style={styles.shortcutArrow}>
                  <ChevronRight size={15} color={ORANGE} strokeWidth={2.5} />
                </View>
              </View>
            </MotionPressable>
            <MotionPressable
              onPress={() => router.push('/(app)/scene-map' as any)}
              style={styles.shortcut}
            >
              <View style={styles.shortcutTopRow}>
                <View style={[styles.shortcutIcon, styles.shortcutIconGreen]}>
                  <Map size={21} color={GREEN} />
                </View>
                <Text style={styles.shortcutIndex}>02</Text>
              </View>
              <Text style={styles.shortcutTitle}>场景地图</Text>
              <View style={styles.shortcutFooter}>
                <Text style={styles.shortcutSubtitle}>探索更多场景</Text>
                <View style={styles.shortcutArrow}>
                  <ChevronRight size={15} color={GREEN} strokeWidth={2.5} />
                </View>
              </View>
            </MotionPressable>
          </Animated.View>
        </View>
      </Animated.ScrollView>
      {reveal ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.revealCircle,
            { left: reveal.x - 36, top: reveal.y - 36, backgroundColor: reveal.color },
            revealAnimatedStyle,
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  scrollContent: { alignItems: 'center', paddingBottom: 34 },
  page: { width: '100%', maxWidth: 760, paddingHorizontal: 16 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 16 },
  brandRowCompact: { position: 'relative', flexDirection: 'column', alignItems: 'stretch' },
  brandBlock: { flex: 1, minWidth: 0 },
  brandTitle: { color: INK, fontSize: 24, lineHeight: 30, fontWeight: '900', letterSpacing: 0 },
  brandAccent: { color: BLUE },
  brandSubtitle: { color: MUTED, fontSize: 13, lineHeight: 19, marginTop: 1 },
  brandSubtitleCompact: { paddingRight: 78 },
  streakPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 38, borderRadius: 8, backgroundColor: WHITE, borderWidth: 1, borderColor: '#DCE6F4', flexShrink: 0, shadowColor: '#2F6FED', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 2 },
  streakPillCompact: { position: 'absolute', right: 0, bottom: 3, height: 34, paddingHorizontal: 8 },
  streakText: { color: MUTED, fontSize: 12, fontWeight: '700' },
  streakNumber: { color: ORANGE, fontSize: 16, fontWeight: '900' },
  hero: { borderRadius: 8, overflow: 'hidden', backgroundColor: '#D8E0E8', borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)', shadowColor: '#234A87', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.18, shadowRadius: 28, elevation: 7 },
  heroImage: { ...StyleSheet.absoluteFillObject },
  heroVisionBadge: { position: 'absolute', top: 16, right: 16, height: 32, paddingHorizontal: 11, borderRadius: 8, backgroundColor: 'rgba(11,26,51,0.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroVisionText: { color: WHITE, fontSize: 11, fontWeight: '800' },
  heroContent: { position: 'absolute', left: 22, right: 22, bottom: 22, alignItems: 'flex-start' },
  heroTitle: { color: WHITE, fontSize: 32, lineHeight: 39, fontWeight: '900', letterSpacing: 0 },
  heroDescription: { color: 'rgba(255,255,255,0.88)', fontSize: 14, lineHeight: 21, marginTop: 8, maxWidth: 330 },
  heroButtonWrap: { marginTop: 16, borderRadius: 8, overflow: 'hidden', shadowColor: '#0D4FD1', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.36, shadowRadius: 18, elevation: 6 },
  heroButton: { position: 'relative', minWidth: 198, height: 50, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, overflow: 'hidden' },
  heroButtonText: { color: WHITE, fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.76 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  modeSlot: { width: '48.5%', flexGrow: 1 },
  modeButton: { position: 'relative', minHeight: 112, borderRadius: 8, borderWidth: 1.5, padding: 12, justifyContent: 'space-between', overflow: 'hidden', shadowColor: '#274D7E', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.08, shadowRadius: 15, elevation: 2 },
  modeButtonSelected: { shadowColor: BLUE, shadowOpacity: 0.2, shadowRadius: 18, elevation: 5 },
  modeTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modeIcon: { width: 38, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center', shadowColor: '#14213D', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.14, shadowRadius: 8, elevation: 3 },
  modeIndex: { fontSize: 11, fontWeight: '900' },
  modeCopy: { paddingRight: 24, marginTop: 10 },
  modeLabel: { color: INK, fontSize: 15, lineHeight: 20, fontWeight: '900' },
  modeDescription: { color: MUTED, fontSize: 10, lineHeight: 15, marginTop: 2, fontWeight: '600' },
  modeDirection: { position: 'absolute', right: 10, bottom: 11, width: 24, height: 24, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.78)', alignItems: 'center', justifyContent: 'center' },
  modeCheck: { position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  sceneInputPanel: { marginTop: 10, borderRadius: 8, borderWidth: 1, borderColor: '#C9DAF3', backgroundColor: WHITE, padding: 12, shadowColor: '#315D93', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 18, elevation: 3 },
  sceneInputHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingBottom: 10, marginBottom: 11, borderBottomWidth: 1, borderBottomColor: '#E9EEF5' },
  sceneInputMarker: { width: 4, height: 30, borderRadius: 2 },
  sceneInputHeaderCopy: { flex: 1 },
  sceneInputEyebrow: { color: '#98A2B3', fontSize: 9, lineHeight: 12, fontWeight: '800' },
  sceneInputTitle: { color: INK, fontSize: 14, lineHeight: 18, fontWeight: '900' },
  sceneInputStep: { color: '#B3BCC9', fontSize: 16, fontWeight: '900' },
  textInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sceneTextInput: { flex: 1, height: 46, borderRadius: 8, borderWidth: 1, borderColor: '#D8E2F0', backgroundColor: '#FAFBFD', paddingHorizontal: 13, color: INK, fontSize: 14 },
  roundAction: { width: 46, height: 46, borderRadius: 8, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },
  roundActionDisabled: { backgroundColor: '#EEF0F3' },
  voicePanel: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12 },
  waveform: { width: 78, height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  waveBar: { width: 3, height: BAR_MIN, borderRadius: 2, backgroundColor: '#CDD5DF' },
  waveBarActive: { backgroundColor: BLUE },
  recordButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },
  recordButtonActive: { backgroundColor: '#E04444' },
  recordButtonDisabled: { backgroundColor: '#EDF1F5' },
  voiceCopy: { flex: 1, minWidth: 0 },
  voiceTitle: { color: INK, fontSize: 14, fontWeight: '800' },
  voiceTitleActive: { color: '#D92D20' },
  voiceHint: { color: MUTED, fontSize: 12, lineHeight: 17, marginTop: 3 },
  transcriptBox: { marginTop: 10, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 11 },
  transcriptLabel: { color: GREEN, fontSize: 12, fontWeight: '800' },
  transcriptText: { color: INK, fontSize: 14, lineHeight: 20, marginTop: 5 },
  transcriptActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  primarySmallButton: { flex: 1, height: 38, borderRadius: 8, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },
  primarySmallButtonText: { color: WHITE, fontSize: 13, fontWeight: '800' },
  secondarySmallButton: { flex: 1, height: 38, borderRadius: 8, backgroundColor: '#F1F3F6', alignItems: 'center', justifyContent: 'center' },
  secondarySmallButtonText: { color: MUTED, fontSize: 13, fontWeight: '800' },
  errorText: { color: '#D92D20', fontSize: 12, lineHeight: 18, marginTop: 8 },
  sectionGap: { height: 26 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 10 },
  sectionHeadingBlock: { gap: 1 },
  sectionEyebrow: { color: BLUE, fontSize: 9, lineHeight: 12, fontWeight: '900' },
  sectionTitle: { color: INK, fontSize: 18, lineHeight: 24, fontWeight: '900', letterSpacing: 0 },
  textLink: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 4 },
  textLinkLabel: { color: BLUE, fontSize: 12, fontWeight: '800' },
  continueRow: { minHeight: 78, borderRadius: 8, borderWidth: 1, borderColor: BORDER, backgroundColor: WHITE, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 11 },
  continueLoader: { width: 56 },
  continueImage: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#EDF1F5' },
  continueFallback: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#FFF3E8', alignItems: 'center', justifyContent: 'center' },
  continueEmoji: { fontSize: 27 },
  continueCopy: { flex: 1, minWidth: 0 },
  continueTitle: { color: INK, fontSize: 15, fontWeight: '900' },
  continueMeta: { color: MUTED, fontSize: 12, lineHeight: 17, marginTop: 4 },
  continueAction: { height: 34, paddingHorizontal: 9, borderRadius: 8, backgroundColor: BLUE_SOFT, flexDirection: 'row', alignItems: 'center', gap: 2 },
  continueActionText: { color: BLUE, fontSize: 12, fontWeight: '800' },
  learningDeck: { position: 'relative', height: 126, marginHorizontal: 2 },
  learningDeckLoading: { borderRadius: 8, borderWidth: 1, borderColor: BORDER, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center' },
  emptyLearningCard: { minHeight: 92, borderRadius: 8, borderWidth: 1, borderColor: BORDER, backgroundColor: WHITE, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
  deckCard: { position: 'absolute', minHeight: 106, borderRadius: 8, borderWidth: 1, borderColor: '#D4E1F4', backgroundColor: WHITE, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12, overflow: 'hidden', shadowColor: '#1B3B6F', shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.13, shadowRadius: 20, elevation: 4 },
  deckCardBack: { minHeight: 104, backgroundColor: '#F5F8FD', borderColor: '#C9D9F0' },
  deckCardFront: { top: 0, left: 0, right: 0, zIndex: 4, padding: 0, backgroundColor: WHITE, borderColor: '#C7D9F7' },
  deckPressable: { minHeight: 104, flex: 1, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  deckAccentRail: { position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderRadius: 2, backgroundColor: BLUE },
  deckImage: { width: 76, height: 76, borderRadius: 8, backgroundColor: '#EDF1F5' },
  deckFallback: { width: 76, height: 76, borderRadius: 8, backgroundColor: '#FFF3E8', alignItems: 'center', justifyContent: 'center' },
  deckEmoji: { fontSize: 34 },
  deckCopy: { flex: 1, minWidth: 0, alignSelf: 'stretch', justifyContent: 'center' },
  deckEyebrowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  deckEyebrow: { color: BLUE, fontSize: 10, fontWeight: '900' },
  deckDate: { color: '#98A2B3', fontSize: 10, fontWeight: '700' },
  deckTitle: { color: INK, fontSize: 16, lineHeight: 21, fontWeight: '900', marginTop: 4 },
  deckSentence: { color: MUTED, fontSize: 12, lineHeight: 17, marginTop: 3 },
  deckArrow: { height: 32, paddingHorizontal: 8, borderRadius: 8, backgroundColor: BLUE_SOFT, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 1 },
  deckArrowLabel: { color: BLUE, fontSize: 10, fontWeight: '900' },
  deckPagination: { minHeight: 28, marginTop: 4, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  deckCounter: { width: 62, color: MUTED, fontSize: 10, fontWeight: '800' },
  deckIndicatorRow: { height: 16, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 5, borderRadius: 8, backgroundColor: '#E9EEF5' },
  deckIndicator: { width: 12, height: 4, borderRadius: 2, backgroundColor: '#C6D0DE' },
  deckIndicatorActive: { width: 30, backgroundColor: BLUE },
  deckSwipeHint: { width: 54, color: '#98A2B3', fontSize: 10, textAlign: 'right' },
  progressPanel: { position: 'relative', marginTop: 14, borderRadius: 8, borderWidth: 1, borderColor: '#D5E1F2', backgroundColor: WHITE, padding: 16, overflow: 'hidden', shadowColor: '#2457A6', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 22, elevation: 4 },
  progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  progressHeaderCopy: { flex: 1, minWidth: 0 },
  progressEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  progressPulse: { width: 7, height: 7, borderRadius: 4, backgroundColor: BLUE, shadowColor: BLUE, shadowOpacity: 0.58, shadowRadius: 6, elevation: 3 },
  progressEyebrow: { color: BLUE, fontSize: 10, fontWeight: '900' },
  progressSubtitle: { color: MUTED, fontSize: 12, marginTop: 3 },
  progressBadge: { minWidth: 54, height: 32, borderRadius: 8, paddingHorizontal: 9, backgroundColor: BLUE_SOFT, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  progressBadgeCompleted: { backgroundColor: '#EAF8F1' },
  progressCount: { color: BLUE, fontSize: 18, fontWeight: '900' },
  progressCountCompleted: { color: GREEN },
  progressRingWrap: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center' },
  progressRingCopy: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  progressRingCompleted: { alignItems: 'center', justifyContent: 'center' },
  progressRingCompletedText: { color: GREEN, fontSize: 9, lineHeight: 11, fontWeight: '900' },
  progressRingFraction: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' },
  progressRingNumber: { color: BLUE, fontSize: 20, fontWeight: '900' },
  progressRingGoal: { color: MUTED, fontSize: 10, fontWeight: '800', marginLeft: 1 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: '#EAF0F7', marginTop: 13, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: GREEN },
  progressMetricRow: { minHeight: 54, marginTop: 13, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F6F8FB', borderRadius: 8, paddingVertical: 8 },
  progressMetric: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  progressMetricValue: { color: INK, fontSize: 17, lineHeight: 21, fontWeight: '900' },
  progressMetricLabel: { color: MUTED, fontSize: 9, lineHeight: 13, marginTop: 1, fontWeight: '700' },
  progressMetricDivider: { width: 1, height: 27, backgroundColor: '#DDE4EE' },
  weekHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 13, borderTopWidth: 1, borderTopColor: BORDER },
  weekTitle: { color: INK, fontSize: 13, fontWeight: '800' },
  weekCount: { color: GREEN, fontSize: 12, fontWeight: '800' },
  weekRow: { position: 'relative', flexDirection: 'row', justifyContent: 'space-between', marginTop: 11 },
  weekConnector: { position: 'absolute', left: 15, right: 15, top: 32, height: 2, backgroundColor: '#E7ECF3', overflow: 'hidden' },
  weekConnectorFill: { height: '100%', backgroundColor: '#83CCAD' },
  weekDay: { width: 30, alignItems: 'center', gap: 7, zIndex: 1 },
  weekDayLabel: { color: '#98A2B3', fontSize: 11, fontWeight: '700' },
  weekDayLabelToday: { color: BLUE },
  weekDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#F0F2F5', alignItems: 'center', justifyContent: 'center' },
  weekDotCompleted: { backgroundColor: GREEN },
  weekDotToday: { backgroundColor: WHITE, borderWidth: 2, borderColor: BLUE },
  coachSection: { position: 'relative', marginTop: 22, borderRadius: 8, borderWidth: 1, borderColor: '#CFE0FB', backgroundColor: WHITE, padding: 16, paddingTop: 19, overflow: 'hidden', shadowColor: '#2F6FED', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 22, elevation: 4 },
  coachTopAccent: { position: 'absolute', left: 0, right: 0, top: 0, height: 3 },
  coachHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  coachMark: { width: 40, height: 40, borderRadius: 8, backgroundColor: BLUE_SOFT, alignItems: 'center', justifyContent: 'center' },
  coachHeadingCopy: { flex: 1, minWidth: 0 },
  coachKicker: { color: BLUE, fontSize: 8, lineHeight: 10, fontWeight: '900' },
  coachSubtitle: { color: MUTED, fontSize: 12, marginTop: 1 },
  onlineStatus: { height: 27, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, borderRadius: 8, backgroundColor: '#ECF9F2' },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: GREEN },
  onlineText: { color: MUTED, fontSize: 11, fontWeight: '700' },
  coachComposer: { height: 52, marginTop: 15, borderRadius: 8, borderWidth: 1, borderColor: '#D7E0EB', backgroundColor: '#FAFBFD', flexDirection: 'row', alignItems: 'center', paddingLeft: 13, paddingRight: 5, gap: 5 },
  coachComposerFocused: { borderColor: BLUE, backgroundColor: WHITE, shadowColor: BLUE, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 3 },
  coachInput: { flex: 1, minWidth: 0, color: INK, fontSize: 14, paddingVertical: 0 },
  coachMicButton: { width: 38, height: 38, borderRadius: 8, backgroundColor: BLUE_SOFT, alignItems: 'center', justifyContent: 'center' },
  coachSendButton: { width: 38, height: 38, borderRadius: 8, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },
  coachSendDisabled: { backgroundColor: '#E9EDF2' },
  suggestionRow: { gap: 8, paddingTop: 11, paddingRight: 2 },
  suggestionChip: { height: 32, paddingHorizontal: 11, borderRadius: 8, borderWidth: 1, borderColor: '#DCE4EF', backgroundColor: WHITE, justifyContent: 'center' },
  suggestionText: { color: '#475467', fontSize: 12, fontWeight: '700' },
  coachReply: { marginTop: 13, borderRadius: 8, backgroundColor: '#F5F8FF', padding: 13, borderLeftWidth: 3, borderLeftColor: BLUE },
  replyTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  replyLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  replyStatusDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: BLUE },
  replyLabel: { color: BLUE_DARK, fontSize: 11, fontWeight: '900' },
  readButton: { height: 30, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, borderRadius: 8, backgroundColor: WHITE, borderWidth: 1, borderColor: '#D9E4F8' },
  readButtonText: { color: BLUE, fontSize: 11, fontWeight: '800' },
  replyEnglish: { color: INK, fontSize: 17, lineHeight: 24, fontWeight: '900', marginTop: 8 },
  replyChinese: { color: MUTED, fontSize: 12, marginTop: 3 },
  continueChatButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, paddingVertical: 3 },
  continueChatText: { color: BLUE, fontSize: 12, fontWeight: '800' },
  shortcutRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  shortcut: { flex: 1, minHeight: 116, borderRadius: 8, borderWidth: 1, borderColor: '#DCE5F1', backgroundColor: WHITE, padding: 12, justifyContent: 'space-between', shadowColor: '#24486F', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.08, shadowRadius: 15, elevation: 3 },
  shortcutTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  shortcutIcon: { width: 38, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  shortcutIconOrange: { backgroundColor: '#FFF3EA' },
  shortcutIconGreen: { backgroundColor: '#EAF8F1' },
  shortcutIndex: { color: '#B4BECC', fontSize: 10, fontWeight: '900' },
  shortcutTitle: { color: INK, fontSize: 15, lineHeight: 20, fontWeight: '900', marginTop: 9 },
  shortcutFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 },
  shortcutSubtitle: { color: MUTED, fontSize: 10 },
  shortcutArrow: { width: 25, height: 25, borderRadius: 8, backgroundColor: '#F5F7FA', alignItems: 'center', justifyContent: 'center' },
  revealCircle: { position: 'absolute', width: 72, height: 72, borderRadius: 36, zIndex: 100, elevation: 20 },
});
