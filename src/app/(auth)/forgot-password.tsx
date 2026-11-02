import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { CheckCircle2, Mail, Send } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import { AuthSceneShell } from '@/components/auth-scene-shell';
import { MotionPressable } from '@/components/motion-pressable';
import { useSession } from '@/ctx';
import { getAuthErrorMessage } from '@/lib/authError';
import { APP_COLORS, APP_RADIUS, APP_SHADOW } from '@/lib/design-system';

export default function ForgotPassword() {
  const router = useRouter();
  const { requestPasswordReset, isDemoMode } = useSession();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async () => {
    const normalizedEmail = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setError('请输入有效的邮箱地址');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await requestPasswordReset(normalizedEmail);
      if (result.error) setError(getAuthErrorMessage(result.error));
      else setMessage(result.message ?? '操作已完成。');
    } catch (requestError) {
      setError(getAuthErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthSceneShell onBack={() => router.back()} panelLabel="找回密码">
      <View style={styles.card}>
        <View style={styles.iconShell}>
          {message ? <CheckCircle2 size={32} color="#1478F5" /> : <Mail size={31} color="#1478F5" />}
        </View>
        <Text style={styles.title}>{message ? '请查看邮箱' : '找回密码'}</Text>
        <Text style={styles.subtitle}>
          {message || (isDemoMode
            ? '本地演示模式不会发送真实邮件，提交后会说明如何继续。'
            : '输入注册邮箱，我们会发送一个安全的密码重置链接。')}
        </Text>

        {!message ? <>
          <View style={styles.inputShell}>
            <Mail size={19} color="#7186A5" />
            <TextInput
              value={email}
              onChangeText={(value) => { setEmail(value); setError(''); }}
              placeholder="注册邮箱"
              placeholderTextColor="#8999B1"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              returnKeyType="send"
              onSubmitEditing={handleSubmit}
              style={styles.input}
            />
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <MotionPressable onPress={handleSubmit} disabled={loading} accessibilityRole="button" accessibilityLabel="发送重置链接" style={styles.submitButton} pressedScale={0.97}>
            <LinearGradient colors={['#2997FF', '#0968F1']} style={styles.submitGradient}>
              {loading ? <ActivityIndicator color="#FFFFFF" /> : <><Text style={styles.submitText}>发送重置链接</Text><Send size={18} color="#FFFFFF" /></>}
            </LinearGradient>
          </MotionPressable>
        </> : null}

        <MotionPressable onPress={() => router.replace('/(auth)/sign-in')} accessibilityRole="button" accessibilityLabel="返回登录" style={styles.loginButton} pressedScale={0.97} haptic={false}>
          <Text style={styles.loginText}>返回登录</Text>
        </MotionPressable>
      </View>
    </AuthSceneShell>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', paddingVertical: 8 },
  iconShell: { width: 68, height: 68, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderRadius: 23, backgroundColor: '#EAF4FF', borderWidth: 1, borderColor: '#FFFFFF' },
  title: { marginTop: 16, color: APP_COLORS.ink, fontSize: 26, lineHeight: 32, fontWeight: '900', textAlign: 'center' },
  subtitle: { marginTop: 7, color: APP_COLORS.muted, fontSize: 13, lineHeight: 20, fontWeight: '600', textAlign: 'center' },
  inputShell: { height: 56, marginTop: 20, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: APP_RADIUS.control, backgroundColor: 'rgba(255,255,255,0.74)', borderWidth: 1.2, borderColor: APP_COLORS.border },
  input: { flex: 1, height: 53, padding: 0, color: '#07162E', fontSize: 15, fontWeight: '700', outlineStyle: 'none' } as any,
  error: { marginTop: 10, color: APP_COLORS.danger, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  submitButton: { height: 56, marginTop: 16, overflow: 'hidden', borderRadius: 28, ...APP_SHADOW.floating },
  submitGradient: { flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 28 },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  loginButton: { height: 44, marginTop: 12, alignItems: 'center', justifyContent: 'center' },
  loginText: { color: '#075BEA', fontSize: 14, fontWeight: '800' },
});
