import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, UserPlus } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import { AuthSceneShell } from '@/components/auth-scene-shell';
import { MotionPressable } from '@/components/motion-pressable';
import { useSession } from '@/ctx';
import { getAuthErrorMessage } from '@/lib/authError';
import { APP_COLORS, APP_RADIUS, APP_SHADOW } from '@/lib/design-system';

export default function SignUp() {
  const router = useRouter();
  const { signUp, isDemoMode } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const handleSignUp = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password || !confirmPassword) return setError('请输入邮箱和密码');
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) return setError('请输入有效的邮箱地址');
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return setError('密码至少 8 位，并同时包含字母和数字');
    if (password !== confirmPassword) return setError('两次输入的密码不一致');
    if (!agreed) return setError('请先同意用户协议和隐私政策');
    setLoading(true);
    setError('');
    try {
      const result = await signUp(normalizedEmail, password);
      if (result.error) setError(getAuthErrorMessage(result.error));
      else if (result.needsEmailConfirmation) setConfirmationSent(true);
      else router.replace('/');
    } catch (signUpError) {
      setError(getAuthErrorMessage(signUpError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthSceneShell onBack={() => router.back()} panelLabel="创建账号">
      {confirmationSent ? (
        <View style={styles.confirmation}>
          <View style={styles.successIcon}><CheckCircle2 size={33} color={APP_COLORS.success} /></View>
          <Text style={styles.title}>验证邮件已发送</Text>
          <Text style={styles.subtitle}>请打开 {email.trim()} 收到的邮件完成验证，然后返回登录。</Text>
          <PrimaryButton label="返回登录" loading={false} onPress={() => router.replace('/(auth)/sign-in')} />
        </View>
      ) : (
        <>
          <View style={styles.headingIcon}><UserPlus size={22} color={APP_COLORS.blue} /></View>
          <Text style={styles.title}>创建你的学习护照</Text>
          <Text style={styles.subtitle}>{isDemoMode ? '账号安全保存在当前设备，随时可以继续学习。' : '保存场景、表达和成长记录，在每台设备继续学习。'}</Text>
          <Field icon={<Mail size={19} color="#7186A5" />} value={email} onChange={(value: string) => { setEmail(value); setError(''); }} placeholder="邮箱" autoComplete="email" keyboardType="email-address" />
          <Field icon={<LockKeyhole size={19} color="#7186A5" />} value={password} onChange={(value: string) => { setPassword(value); setError(''); }} placeholder="至少 8 位，包含字母和数字" secure={!showPassword} suffix={(
            <MotionPressable onPress={() => setShowPassword((visible) => !visible)} style={styles.eyeButton} pressedScale={0.9} haptic={false}>
              {showPassword ? <EyeOff size={20} color="#7186A5" /> : <Eye size={20} color="#7186A5" />}
            </MotionPressable>
          )} />
          <Field icon={<ShieldCheck size={19} color="#7186A5" />} value={confirmPassword} onChange={(value: string) => { setConfirmPassword(value); setError(''); }} placeholder="再次输入密码" secure={!showPassword} onSubmit={handleSignUp} />

          <MotionPressable onPress={() => { setAgreed((value) => !value); setError(''); }} style={styles.agreement} pressedScale={0.98} haptic={false}>
            <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>{agreed ? <Text style={styles.checkmark}>✓</Text> : null}</View>
            <Text style={styles.agreementText}>我已阅读并同意<Text style={styles.agreementLink}>用户协议</Text>与<Text style={styles.agreementLink}>隐私政策</Text></Text>
          </MotionPressable>
          {error ? <View style={styles.errorBox}><Text style={styles.error}>{error}</Text></View> : null}
          <PrimaryButton label="创建账号" loading={loading} onPress={handleSignUp} />
          <MotionPressable onPress={() => router.replace('/(auth)/sign-in')} style={styles.secondaryButton} pressedScale={0.97} haptic={false}>
            <Text style={styles.secondaryText}>已有账号？<Text style={styles.secondaryLink}>返回登录</Text></Text>
          </MotionPressable>
        </>
      )}
    </AuthSceneShell>
  );
}

function PrimaryButton({ label, loading, onPress }: { label: string; loading: boolean; onPress: () => void }) {
  return (
    <MotionPressable onPress={onPress} disabled={loading} style={styles.primaryButton} pressedScale={0.97} hoverLift={3}>
      <LinearGradient colors={['#2997FF', '#0968F1', '#2967F6']} style={styles.primaryGradient}>
        {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{label}</Text>}
      </LinearGradient>
    </MotionPressable>
  );
}

function Field({ icon, value, onChange, placeholder, secure, suffix, onSubmit, autoComplete, keyboardType }: any) {
  return (
    <View style={styles.inputShell}>
      {icon}
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#8999B1" autoCapitalize="none" autoComplete={autoComplete ?? 'new-password'} keyboardType={keyboardType} secureTextEntry={secure} returnKeyType={onSubmit ? 'done' : 'next'} onSubmitEditing={onSubmit} style={styles.input} />
      {suffix}
    </View>
  );
}

const styles = StyleSheet.create({
  confirmation: { alignItems: 'center', paddingVertical: 18 },
  headingIcon: { width: 48, height: 48, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: 'rgba(20,120,245,0.09)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)' },
  successIcon: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center', borderRadius: 23, backgroundColor: 'rgba(22,163,106,0.09)' },
  title: { marginTop: 12, color: APP_COLORS.ink, fontSize: 25, lineHeight: 31, fontWeight: '900', textAlign: 'center' },
  subtitle: { marginTop: 5, marginBottom: 8, color: APP_COLORS.muted, fontSize: 12, lineHeight: 18, fontWeight: '600', textAlign: 'center' },
  inputShell: { height: 54, marginTop: 10, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: APP_RADIUS.control, backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1.2, borderColor: APP_COLORS.border },
  input: { flex: 1, minWidth: 0, height: 51, padding: 0, color: APP_COLORS.ink, fontSize: 14, fontWeight: '700', outlineStyle: 'none' } as any,
  eyeButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19 },
  agreement: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  checkbox: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 7, borderWidth: 1.2, borderColor: APP_COLORS.border, backgroundColor: 'rgba(255,255,255,0.7)' },
  checkboxChecked: { borderColor: APP_COLORS.blue, backgroundColor: APP_COLORS.blue },
  checkmark: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  agreementText: { flex: 1, color: APP_COLORS.muted, fontSize: 10.5, lineHeight: 15, fontWeight: '600' },
  agreementLink: { color: APP_COLORS.blueStrong, fontWeight: '800' },
  errorBox: { marginTop: 9, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 11, backgroundColor: 'rgba(200,61,75,0.08)', borderWidth: 1, borderColor: 'rgba(200,61,75,0.18)' },
  error: { color: APP_COLORS.danger, fontSize: 11, lineHeight: 15, fontWeight: '700' },
  primaryButton: { height: 55, marginTop: 13, overflow: 'hidden', borderRadius: 28, ...APP_SHADOW.floating },
  primaryGradient: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 28, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  secondaryButton: { height: 40, marginTop: 7, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: APP_COLORS.muted, fontSize: 12, fontWeight: '600' },
  secondaryLink: { color: APP_COLORS.blueStrong, fontWeight: '900' },
});
