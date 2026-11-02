import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowLeft, CheckCircle2, Mail, Send } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { MotionPressable } from '@/components/motion-pressable';
import { useSession } from '@/ctx';
import { getAuthErrorMessage } from '@/lib/authError';

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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.page}>
      <LinearGradient colors={['#F7FBFF', '#EAF4FF', '#FAFCFF']} style={StyleSheet.absoluteFillObject} />
      <MotionPressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="返回" style={styles.backButton} pressedScale={0.9}>
        <ArrowLeft size={22} color="#07162E" />
      </MotionPressable>

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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22, backgroundColor: '#F4F9FF' },
  backButton: { position: 'absolute', left: 22, top: 30, width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.86)', borderWidth: 1, borderColor: '#FFFFFF', shadowColor: '#416D9E', shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  card: { width: '100%', maxWidth: 390, padding: 26, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.86)', borderWidth: 1, borderColor: '#FFFFFF', shadowColor: '#365F89', shadowOpacity: 0.16, shadowRadius: 32, shadowOffset: { width: 0, height: 18 } },
  iconShell: { width: 68, height: 68, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderRadius: 23, backgroundColor: '#EAF4FF', borderWidth: 1, borderColor: '#FFFFFF' },
  title: { marginTop: 20, color: '#07162E', fontSize: 28, lineHeight: 34, fontWeight: '900', textAlign: 'center' },
  subtitle: { marginTop: 9, color: '#687B99', fontSize: 14, lineHeight: 22, fontWeight: '600', textAlign: 'center' },
  inputShell: { height: 56, marginTop: 24, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1.2, borderColor: 'rgba(91,143,213,0.3)' },
  input: { flex: 1, height: 53, padding: 0, color: '#07162E', fontSize: 15, fontWeight: '700', outlineStyle: 'none' } as any,
  error: { marginTop: 10, color: '#C83D4B', fontSize: 12, lineHeight: 17, fontWeight: '700' },
  submitButton: { height: 56, marginTop: 16, overflow: 'hidden', borderRadius: 28, shadowColor: '#116FF2', shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
  submitGradient: { flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 28 },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  loginButton: { height: 44, marginTop: 12, alignItems: 'center', justifyContent: 'center' },
  loginText: { color: '#075BEA', fontSize: 14, fontWeight: '800' },
});
