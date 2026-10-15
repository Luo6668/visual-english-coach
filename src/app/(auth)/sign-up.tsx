import { useRouter } from 'expo-router';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSession } from '@/ctx';
import { getAuthErrorMessage } from '@/lib/authError';

export default function SignUp() {
  const router = useRouter();
  const { signUp, isDemoMode } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);

  const handleSignUp = async () => {
    if (!email || !password) {
      setError('请输入邮箱和密码');
      return;
    }
    if (password.length < 6) {
      setError('密码至少需要6位');
      return;
    }
    if (!agreed) {
      setError('请同意用户协议');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const signUpError = await signUp(email, password);
      if (signUpError) {
        setError(signUpError);
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

        <Text className="text-3xl font-bold text-foreground mb-2">创建账号</Text>
        <Text className="text-sm text-muted-foreground mb-8">注册 Visual English Coach 开始学习</Text>
        {isDemoMode ? <Text className="text-sm text-primary mb-4">本地演示模式：账号仅保存在当前设备</Text> : null}

        <Text className="text-sm font-medium text-foreground mb-2">邮箱</Text>
        <TextInput
          className="border border-input rounded-lg px-4 py-3 text-base text-foreground bg-card"
          placeholder="请输入邮箱"
          placeholderTextColor="#9ca3af"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Text className="text-sm font-medium text-foreground mt-4 mb-2">密码</Text>
        <View className="flex-row border border-input rounded-lg px-4 py-3 bg-card items-center">
          <TextInput
            className="flex-1 text-base text-foreground"
            placeholder="至少6位密码"
            placeholderTextColor="#9ca3af"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
          />
          <Pressable onPress={() => setShowPassword(!showPassword)}>
            {showPassword ? <EyeOff size={20} className="text-muted-foreground" /> : <Eye size={20} className="text-muted-foreground" />}
          </Pressable>
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
