import { useRouter } from 'expo-router';
import { ArrowLeft, CheckCircle2, Eye, EyeOff } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSession } from '@/ctx';
import { getAuthErrorMessage } from '@/lib/authError';

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
    if (!normalizedEmail || !password || !confirmPassword) {
      setError('请输入邮箱和密码');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setError('请输入有效的邮箱地址');
      return;
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError('密码至少 8 位，并同时包含字母和数字');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    if (!agreed) {
      setError('请同意用户协议');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await signUp(normalizedEmail, password);
      if (result.error) {
        setError(getAuthErrorMessage(result.error));
      } else if (result.needsEmailConfirmation) {
        setConfirmationSent(true);
      } else {
        router.replace('/');
      }
    } catch (signUpError) {
      setError(getAuthErrorMessage(signUpError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}
      className="flex-1"
    >
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-6"
        keyboardShouldPersistTaps="handled"
      >
        <Pressable className="absolute top-12 left-4" onPress={() => router.back()}>
          <ArrowLeft size={24} className="text-foreground" />
        </Pressable>

        {confirmationSent ? (
          <View className="items-center rounded-3xl border border-blue-100 bg-white px-6 py-8 shadow-sm">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-blue-50">
              <CheckCircle2 size={34} color="#1478F5" />
            </View>
            <Text className="mt-5 text-2xl font-bold text-foreground">验证邮件已发送</Text>
            <Text className="mt-3 text-center text-sm leading-6 text-muted-foreground">
              请打开发送到 {email.trim()} 的邮件完成验证，然后返回登录。
            </Text>
            <Pressable
              className="mt-6 w-full items-center rounded-xl bg-primary py-4 active:opacity-80"
              onPress={() => router.replace('/(auth)/sign-in')}
            >
              <Text className="font-semibold text-primary-foreground">返回登录</Text>
            </Pressable>
          </View>
        ) : <>
        <Text className="text-3xl font-bold text-foreground mb-2">创建账号</Text>
        <Text className="text-sm text-muted-foreground mb-8">注册 Visual English Coach 开始学习</Text>
        {isDemoMode ? <Text className="text-sm text-primary mb-4">本地演示模式：账号仅保存在当前设备</Text> : null}

        <Text className="text-sm font-medium text-foreground mb-2">邮箱</Text>
        <TextInput
          className="border border-input rounded-lg px-4 py-3 text-base text-foreground bg-card"
          placeholder="请输入邮箱"
          placeholderTextColor="#9ca3af"
          value={email}
          onChangeText={(value) => { setEmail(value); setError(''); }}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
        />

        <Text className="text-sm font-medium text-foreground mt-4 mb-2">密码</Text>
        <View className="flex-row border border-input rounded-lg px-4 py-3 bg-card items-center">
          <TextInput
            className="flex-1 text-base text-foreground"
            placeholder="至少 8 位，包含字母和数字"
            placeholderTextColor="#9ca3af"
            value={password}
            onChangeText={(value) => { setPassword(value); setError(''); }}
            autoComplete="new-password"
            secureTextEntry={!showPassword}
          />
          <Pressable onPress={() => setShowPassword(!showPassword)}>
            {showPassword ? <EyeOff size={20} className="text-muted-foreground" /> : <Eye size={20} className="text-muted-foreground" />}
          </Pressable>
        </View>

        <Text className="text-sm font-medium text-foreground mt-4 mb-2">确认密码</Text>
        <View className="flex-row border border-input rounded-lg px-4 py-3 bg-card items-center">
          <TextInput
            className="flex-1 text-base text-foreground"
            placeholder="再次输入密码"
            placeholderTextColor="#9ca3af"
            value={confirmPassword}
            onChangeText={(value) => { setConfirmPassword(value); setError(''); }}
            autoComplete="new-password"
            secureTextEntry={!showPassword}
            returnKeyType="done"
            onSubmitEditing={handleSignUp}
          />
        </View>

        <Pressable className="flex-row items-center gap-2 mt-4" onPress={() => setAgreed(!agreed)}>
          <View className={`w-5 h-5 rounded border ${agreed ? 'bg-primary border-primary' : 'border-input'} items-center justify-center`}>
            {agreed && <Text className="text-primary-foreground text-xs">✓</Text>}
          </View>
          <Text className="text-sm text-muted-foreground">
            我已同意<Text className="text-foreground">用户协议</Text>和<Text className="text-foreground">隐私政策</Text>
          </Text>
        </Pressable>

        {error ? <Text className="text-destructive text-sm mt-3">{error}</Text> : null}

        <Pressable
          className="bg-primary rounded-xl py-4 items-center mt-6 active:opacity-80"
          android_ripple={{ color: "rgba(0,0,0,0.1)" }}
          onPress={handleSignUp}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-primary-foreground font-semibold text-base">注册</Text>}
        </Pressable>

        <Pressable className="mt-4 items-center" onPress={() => router.push('/(auth)/sign-in')}>
          <Text className="text-sm text-muted-foreground">
            已有账号？<Text className="text-primary font-medium">去登录</Text>
          </Text>
        </Pressable>
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
