import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { CheckCircle2, Eye, EyeOff, KeyRound } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { MotionPressable } from '@/components/motion-pressable';
import { useSession } from '@/ctx';
import { getAuthErrorMessage } from '@/lib/authError';

export default function ResetPassword() {
  const router = useRouter();
  const { updatePassword } = useSession();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);

  const handleUpdate = async () => {
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError('新密码至少 8 位，并同时包含字母和数字');
      return;
    }
    if (password !== confirmation) {
      setError('两次输入的新密码不一致');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await updatePassword(password);
      if (result.error) setError(getAuthErrorMessage(result.error));
      else setComplete(true);
    } catch (updateError) {
      setError(getAuthErrorMessage(updateError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.page}>
      <LinearGradient colors={['#F8FCFF', '#EAF4FF', '#F7F5FF']} style={StyleSheet.absoluteFillObject} />
      <View style={styles.card}>
        <View style={styles.iconShell}>
          {complete ? <CheckCircle2 size={34} color="#16A36A" /> : <KeyRound size={32} color="#1478F5" />}
        </View>
        <Text style={styles.title}>{complete ? '密码已更新' : '设置新密码'}</Text>
        <Text style={styles.subtitle}>{complete ? '新密码已经生效，现在可以继续学习。' : '使用至少 8 位、同时包含字母与数字的新密码。'}</Text>

        {!complete ? <>
          <PasswordField label="新密码" value={password} onChange={(value) => { setPassword(value); setError(''); }} visible={showPassword} toggle={() => setShowPassword((current) => !current)} />
          <PasswordField label="再次输入新密码" value={confirmation} onChange={(value) => { setConfirmation(value); setError(''); }} visible={showPassword} onSubmit={handleUpdate} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <MotionPressable onPress={handleUpdate} disabled={loading} accessibilityRole="button" accessibilityLabel="更新密码" style={styles.primaryButton} pressedScale={0.97}>
            <LinearGradient colors={['#2997FF', '#0968F1']} style={styles.primaryGradient}>
              {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>更新密码</Text>}
            </LinearGradient>
          </MotionPressable>
        </> : (
          <MotionPressable onPress={() => router.replace('/')} accessibilityRole="button" accessibilityLabel="继续学习" style={styles.primaryButton} pressedScale={0.97}>
            <LinearGradient colors={['#2997FF', '#0968F1']} style={styles.primaryGradient}>
              <Text style={styles.primaryText}>继续学习</Text>
            </LinearGradient>
          </MotionPressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function PasswordField({ label, value, onChange, visible, toggle, onSubmit }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  toggle?: () => void;
  onSubmit?: () => void;
}) {
  return (
    <View style={styles.inputShell}>
      <KeyRound size={19} color="#7186A5" />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={label}
        placeholderTextColor="#8999B1"
        autoComplete="new-password"
        secureTextEntry={!visible}
        returnKeyType={onSubmit ? 'done' : 'next'}
        onSubmitEditing={onSubmit}
        style={styles.input}
      />
      {toggle ? <MotionPressable onPress={toggle} accessibilityRole="button" accessibilityLabel={visible ? '隐藏密码' : '显示密码'} style={styles.eyeButton} pressedScale={0.9} haptic={false}>
        {visible ? <EyeOff size={20} color="#7186A5" /> : <Eye size={20} color="#7186A5" />}
      </MotionPressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22, backgroundColor: '#F4F9FF' },
  card: { width: '100%', maxWidth: 390, padding: 27, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.9)', borderWidth: 1, borderColor: '#FFFFFF', shadowColor: '#365F89', shadowOpacity: 0.16, shadowRadius: 32, shadowOffset: { width: 0, height: 18 } },
  iconShell: { width: 68, height: 68, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderRadius: 23, backgroundColor: '#EAF4FF', borderWidth: 1, borderColor: '#FFFFFF' },
  title: { marginTop: 20, color: '#07162E', fontSize: 28, lineHeight: 34, fontWeight: '900', textAlign: 'center' },
  subtitle: { marginTop: 9, marginBottom: 12, color: '#687B99', fontSize: 14, lineHeight: 22, fontWeight: '600', textAlign: 'center' },
  inputShell: { height: 56, marginTop: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1.2, borderColor: 'rgba(91,143,213,0.3)' },
  input: { flex: 1, height: 53, padding: 0, color: '#07162E', fontSize: 15, fontWeight: '700', outlineStyle: 'none' } as any,
  eyeButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  error: { marginTop: 10, color: '#C83D4B', fontSize: 12, lineHeight: 17, fontWeight: '700' },
  primaryButton: { height: 56, marginTop: 18, overflow: 'hidden', borderRadius: 28, shadowColor: '#116FF2', shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
  primaryGradient: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 28 },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
});
