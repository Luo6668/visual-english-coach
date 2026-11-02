import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight, CirclePlay, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { MotionPressable } from '@/components/motion-pressable';
import { useSession } from '@/ctx';
import { getAuthErrorMessage } from '@/lib/authError';

const COLORS = {
  ink: '#07162E',
  blue: '#1478F5',
  blueStrong: '#075BEA',
  muted: '#687B99',
  border: 'rgba(130, 158, 194, 0.28)',
};

const GLASS_WEB = Platform.select({
  web: {
    backdropFilter: 'blur(24px) saturate(1.18)',
    WebkitBackdropFilter: 'blur(24px) saturate(1.18)',
  } as any,
  default: {},
});

const HOTSPOTS = {
  coffee: { word: 'coffee', meaning: '咖啡', hint: 'A cup of coffee, please.' },
  menu: { word: 'menu', meaning: '菜单', hint: 'Could I see the menu?' },
} as const;

type HotspotKey = keyof typeof HOTSPOTS;

export default function SignIn() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { signIn, isDemoMode } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [quickLoading, setQuickLoading] = useState(false);
  const [error, setError] = useState('');
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);
  const [activeHotspot, setActiveHotspot] = useState<HotspotKey>('coffee');

  const compact = width <= 375;
  const activeVocabulary = useMemo(() => HOTSPOTS[activeHotspot], [activeHotspot]);

  const handleSignIn = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setError('请输入邮箱和密码');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setError('请输入有效的邮箱地址');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const signInError = await signIn(normalizedEmail, password);
      if (signInError) setError(getAuthErrorMessage(signInError));
      else router.replace('/');
    } catch (signInError) {
      setError(getAuthErrorMessage(signInError));
    } finally {
      setLoading(false);
    }
  };

  const handleQuickExperience = async () => {
    if (!isDemoMode) {
      router.push('/(auth)/sign-up');
      return;
    }

    setQuickLoading(true);
    setError('');
    try {
      const signInError = await signIn('guest@visualcoach.local', 'visual-coach-demo');
      if (signInError) setError(getAuthErrorMessage(signInError));
      else router.replace('/');
    } catch (signInError) {
      setError(getAuthErrorMessage(signInError));
    } finally {
      setQuickLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.page}>
      <LinearGradient
        colors={['#F9FCFF', '#EDF6FF', '#F8FBFF']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <View pointerEvents="none" style={styles.backgroundLineOne} />
      <View pointerEvents="none" style={styles.backgroundLineTwo} />

      <ScrollView
        bounces={false}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={[styles.shell, compact && styles.shellCompact]}>
          <View style={[styles.brandHeader, compact && styles.brandHeaderCompact]}>
            <MotionPressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="返回"
              pressedScale={0.9}
              hoverLift={2}
              style={styles.backButton}
            >
              <ArrowLeft size={22} color={COLORS.ink} strokeWidth={2.4} />
            </MotionPressable>

            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
              style={[styles.brandTitle, compact && styles.brandTitleCompact]}
            >
              <Text style={styles.brandBlue}>Visual</Text>
              <Text> English Coach</Text>
            </Text>
            <Text style={styles.brandSubtitle}>看见场景，说出英语</Text>
          </View>

          <View style={styles.sceneFrame}>
            <Image
              source={require('../../../assets/home-cafe-hero.png')}
              contentFit="cover"
              contentPosition="center"
              transition={240}
              style={StyleSheet.absoluteFillObject}
            />
            <LinearGradient
              colors={['rgba(2,15,35,0.03)', 'rgba(2,15,35,0)', 'rgba(2,15,35,0.32)']}
              locations={[0, 0.55, 1]}
              style={StyleSheet.absoluteFillObject}
            />
            <View pointerEvents="none" style={styles.sceneEdge} />

            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE SCENE</Text>
            </View>

            <Hotspot
              label="coffee"
              active={activeHotspot === 'coffee'}
              onPress={() => setActiveHotspot('coffee')}
              style={styles.coffeeHotspot}
            />
            <Hotspot
              label="menu"
              active={activeHotspot === 'menu'}
              onPress={() => setActiveHotspot('menu')}
              style={styles.menuHotspot}
            />

            <View style={styles.vocabularyPreview}>
              <Text style={styles.vocabularyWord}>{activeVocabulary.word}</Text>
              <Text style={styles.vocabularyMeaning}>{activeVocabulary.meaning}</Text>
              <Text numberOfLines={1} style={styles.vocabularyHint}>{activeVocabulary.hint}</Text>
            </View>
          </View>

          <View style={styles.loginBorder}>
            <View style={styles.loginPanel}>
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(255,255,255,0.97)', 'rgba(244,249,255,0.88)', 'rgba(255,255,255,0.94)']}
                locations={[0, 0.6, 1]}
                style={StyleSheet.absoluteFillObject}
              />
              <View pointerEvents="none" style={styles.loginHighlight} />

              <Text style={styles.welcomeTitle}>欢迎回来</Text>
              <Text style={styles.welcomeSubtitle}>登录后继续你的场景学习</Text>

              <View style={[styles.inputShell, focusedField === 'email' && styles.inputShellFocused]}>
                <Mail size={20} color={focusedField === 'email' ? COLORS.blue : '#7F91AC'} strokeWidth={2} />
                <TextInput
                  value={email}
                  onChangeText={(value) => {
                    setEmail(value);
                    if (error) setError('');
                  }}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="邮箱"
                  placeholderTextColor="#8A9AB3"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  returnKeyType="next"
                  accessibilityLabel="邮箱"
                  style={styles.input}
                />
              </View>

              <View style={[styles.inputShell, focusedField === 'password' && styles.inputShellFocused]}>
                <LockKeyhole size={20} color={focusedField === 'password' ? COLORS.blue : '#7F91AC'} strokeWidth={2} />
                <TextInput
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    if (error) setError('');
                  }}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="密码"
                  placeholderTextColor="#8A9AB3"
                  autoComplete="current-password"
                  secureTextEntry={!showPassword}
                  returnKeyType="go"
                  onSubmitEditing={handleSignIn}
                  accessibilityLabel="密码"
                  style={styles.input}
                />
                <MotionPressable
                  onPress={() => setShowPassword((visible) => !visible)}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? '隐藏密码' : '显示密码'}
                  pressedScale={0.88}
                  haptic={false}
                  style={styles.eyeButton}
                >
                  {showPassword
                    ? <EyeOff size={21} color="#778BA9" strokeWidth={2} />
                    : <Eye size={21} color="#778BA9" strokeWidth={2} />}
                </MotionPressable>
              </View>

              {error ? (
                <View style={styles.errorBox} accessibilityLiveRegion="polite">
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <MotionPressable
                onPress={handleSignIn}
                disabled={loading || quickLoading}
                accessibilityRole="button"
                accessibilityLabel="登录"
                pressedScale={0.965}
                hoverLift={3}
                style={styles.primaryButton}
              >
                <LinearGradient
                  colors={['#2997FF', '#0968F1', '#2967F6']}
                  start={{ x: 0, y: 0.1 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.primaryButtonGradient}
                >
                  {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>登录</Text>}
                  <View style={styles.primaryButtonArrow}>
                    <ChevronRight size={21} color="#FFFFFF" strokeWidth={2.6} />
                  </View>
                </LinearGradient>
              </MotionPressable>

              <MotionPressable
                onPress={handleQuickExperience}
                disabled={loading || quickLoading}
                accessibilityRole="button"
                accessibilityLabel="快速体验"
                pressedScale={0.97}
                hoverLift={2}
                style={styles.quickButton}
              >
                {quickLoading
                  ? <ActivityIndicator color={COLORS.blue} />
                  : <>
                      <View style={styles.quickIcon}><CirclePlay size={16} color={COLORS.blue} fill="rgba(20,120,245,0.1)" /></View>
                      <Text style={styles.quickText}>快速体验</Text>
                    </>}
              </MotionPressable>

              <View style={styles.registerRow}>
                <View style={styles.registerLine} />
                <Text style={styles.registerHint}>还没有账号？</Text>
                <MotionPressable
                  onPress={() => router.push('/(auth)/sign-up')}
                  accessibilityRole="button"
                  accessibilityLabel="立即注册"
                  pressedScale={0.95}
                  haptic={false}
                >
                  <Text style={styles.registerLink}>立即注册</Text>
                </MotionPressable>
                <View style={styles.registerLine} />
              </View>

              <View style={styles.privacyRow}>
                <ShieldCheck size={16} color="#7C90AC" strokeWidth={2} />
                <Text style={styles.privacyText}>我们重视你的隐私，信息将被安全加密保护</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Hotspot({ label, active, onPress, style }: {
  label: HotspotKey;
  active: boolean;
  onPress: () => void;
  style: object;
}) {
  return (
    <MotionPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`查看单词 ${label}`}
      pressedScale={0.93}
      hoverLift={3}
      hoverTilt={2}
      style={[styles.hotspot, active && styles.hotspotActive, style]}
    >
      <View style={[styles.hotspotRing, active && styles.hotspotRingActive]}>
        <View style={styles.hotspotCore} />
      </View>
      <Text style={[styles.hotspotLabel, active && styles.hotspotLabelActive]}>{label}</Text>
      <ChevronRight size={14} color={active ? COLORS.blue : '#8798B0'} strokeWidth={2.3} />
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F5FAFF' },
  backgroundLineOne: {
    position: 'absolute', width: 480, height: 160, left: -210, top: 190,
    borderRadius: 80, borderWidth: 1, borderColor: 'rgba(64,132,224,0.08)',
    transform: [{ rotate: '-18deg' }],
  },
  backgroundLineTwo: {
    position: 'absolute', width: 430, height: 150, right: -250, top: 520,
    borderRadius: 75, borderWidth: 1, borderColor: 'rgba(98,111,229,0.07)',
    transform: [{ rotate: '18deg' }],
  },
  scrollContent: { flexGrow: 1, alignItems: 'center' },
  shell: { width: '100%', maxWidth: 430, minHeight: 844, paddingHorizontal: 18, paddingTop: 26, paddingBottom: 20 },
  shellCompact: { paddingHorizontal: 14 },
  brandHeader: { minHeight: 105, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34 },
  brandHeaderCompact: {
    minHeight: 108,
    justifyContent: 'flex-start',
    paddingTop: 50,
    paddingHorizontal: 0,
  },
  backButton: {
    position: 'absolute', left: 0, top: 2, width: 48, height: 48, zIndex: 4,
    alignItems: 'center', justifyContent: 'center', borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.82)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.98)', shadowColor: '#557899',
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 18,
    ...GLASS_WEB,
  },
  brandTitle: { color: COLORS.ink, fontSize: 27, lineHeight: 34, fontWeight: '900', letterSpacing: 0 },
  brandTitleCompact: { fontSize: 18.5, lineHeight: 26 },
  brandBlue: { color: COLORS.blue },
  brandSubtitle: { marginTop: 5, color: '#647794', fontSize: 13, lineHeight: 18, fontWeight: '700', letterSpacing: 4.5 },
  sceneFrame: {
    height: 292, overflow: 'hidden', borderRadius: 30, borderWidth: 1.4,
    borderColor: 'rgba(255,255,255,0.96)', backgroundColor: '#D9EAF7',
    shadowColor: '#31597D', shadowOffset: { width: 0, height: 17 },
    shadowOpacity: 0.23, shadowRadius: 30,
  },
  sceneEdge: {
    ...StyleSheet.absoluteFillObject, borderRadius: 29, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.74)',
  },
  liveBadge: {
    position: 'absolute', right: 14, top: 14, minWidth: 104, height: 36,
    paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 18, backgroundColor: 'rgba(10,18,32,0.66)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.38)', ...GLASS_WEB,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FF365B', shadowColor: '#FF365B', shadowOpacity: 0.8, shadowRadius: 7 },
  liveText: { color: '#FFFFFF', fontSize: 11, lineHeight: 14, fontWeight: '900', letterSpacing: 0.5 },
  hotspot: {
    position: 'absolute', minWidth: 118, height: 43, paddingHorizontal: 13,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.76)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)', shadowColor: '#2F557A',
    shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.18, shadowRadius: 14,
    ...GLASS_WEB,
  },
  hotspotActive: { backgroundColor: 'rgba(255,255,255,0.92)', borderColor: 'rgba(68,148,255,0.62)' },
  coffeeHotspot: { right: 58, top: 136 },
  menuHotspot: { right: 20, top: 202 },
  hotspotRing: {
    width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#7AA9E9', backgroundColor: 'rgba(255,255,255,0.88)',
  },
  hotspotRingActive: { borderColor: COLORS.blue, shadowColor: COLORS.blue, shadowOpacity: 0.52, shadowRadius: 6 },
  hotspotCore: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.blue },
  hotspotLabel: { color: '#293A52', fontSize: 13, lineHeight: 16, fontWeight: '800' },
  hotspotLabelActive: { color: COLORS.ink },
  vocabularyPreview: {
    position: 'absolute', left: 14, bottom: 13, maxWidth: 208, minHeight: 54,
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: 16,
    backgroundColor: 'rgba(7,20,40,0.68)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)', ...GLASS_WEB,
  },
  vocabularyWord: { color: '#FFFFFF', fontSize: 13, lineHeight: 16, fontWeight: '900' },
  vocabularyMeaning: { position: 'absolute', right: 12, top: 8, color: '#A9D2FF', fontSize: 10, lineHeight: 14, fontWeight: '800' },
  vocabularyHint: { marginTop: 3, color: 'rgba(255,255,255,0.78)', fontSize: 9.5, lineHeight: 13, fontWeight: '600' },
  loginBorder: {
    marginTop: -22, padding: 1.5, borderRadius: 32, zIndex: 5,
    backgroundColor: 'rgba(255,255,255,0.84)', shadowColor: '#365F89',
    shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.18, shadowRadius: 34,
  },
  loginPanel: {
    overflow: 'hidden', paddingHorizontal: 20, paddingTop: 22, paddingBottom: 14,
    borderRadius: 30.5, backgroundColor: 'rgba(248,252,255,0.84)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.96)', ...GLASS_WEB,
  },
  loginHighlight: {
    position: 'absolute', width: 250, height: 100, left: -60, top: -45,
    borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.55)', transform: [{ rotate: '-8deg' }],
  },
  welcomeTitle: { color: COLORS.ink, fontSize: 29, lineHeight: 35, fontWeight: '900', textAlign: 'center' },
  welcomeSubtitle: { marginTop: 3, color: COLORS.muted, fontSize: 14, lineHeight: 19, fontWeight: '700', textAlign: 'center' },
  inputShell: {
    height: 54, marginTop: 11, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 11,
    borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1.2,
    borderColor: COLORS.border, shadowColor: '#5A789B', shadowOpacity: 0.04, shadowRadius: 8,
  },
  inputShellFocused: {
    backgroundColor: 'rgba(255,255,255,0.96)', borderColor: '#2C8BFF',
    shadowColor: '#2788FF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.16, shadowRadius: 12,
  },
  input: { flex: 1, minWidth: 0, height: 51, padding: 0, color: COLORS.ink, fontSize: 15, lineHeight: 20, fontWeight: '700', outlineStyle: 'none' } as any,
  eyeButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19 },
  errorBox: {
    minHeight: 30, marginTop: 9, paddingHorizontal: 11, paddingVertical: 7,
    justifyContent: 'center', borderRadius: 11, backgroundColor: 'rgba(236,75,87,0.08)',
    borderWidth: 1, borderColor: 'rgba(236,75,87,0.18)',
  },
  errorText: { color: '#C83D4B', fontSize: 11, lineHeight: 15, fontWeight: '700' },
  primaryButton: {
    height: 56, marginTop: 12, overflow: 'hidden', borderRadius: 28,
    shadowColor: '#116FF2', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.32, shadowRadius: 20,
  },
  primaryButtonGradient: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 30, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 18, lineHeight: 23, fontWeight: '900' },
  primaryButtonArrow: {
    position: 'absolute', right: 8, width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)',
  },
  quickButton: {
    height: 46, marginTop: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.52)', borderWidth: 1,
    borderColor: 'rgba(118,157,207,0.3)',
  },
  quickIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(20,120,245,0.08)' },
  quickText: { color: COLORS.blueStrong, fontSize: 14, lineHeight: 18, fontWeight: '800' },
  registerRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  registerLine: { flex: 1, maxWidth: 56, height: 1, backgroundColor: 'rgba(124,145,174,0.24)' },
  registerHint: { color: '#71839E', fontSize: 12, lineHeight: 16, fontWeight: '600' },
  registerLink: { color: COLORS.blueStrong, fontSize: 12, lineHeight: 16, fontWeight: '900' },
  privacyRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  privacyText: { color: '#8191A8', fontSize: 9.5, lineHeight: 13, fontWeight: '600' },
});
