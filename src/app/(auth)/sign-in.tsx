import { useRouter } from 'expo-router';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSession } from '@/ctx';
import { getAuthErrorMessage } from '@/lib/authError';

export default function SignIn() {
  const router = useRouter();
  const { signIn, isDemoMode } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignIn = async () => {
    if (!email || !password) {
      setError('请输入邮箱和密码');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const signInError = await signIn(email, password);
      if (signInError) {
        setError(signInError);
      } else {
        router.replace('/');
      }
    } catch (signInError) {
      setError(getAuthErrorMessage(signInError));
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

        <Text className="text-3xl font-bold text-foreground mb-2">欢迎回来</Text>
        <Text className="text-sm text-muted-foreground mb-8">登录你的 Visual English Coach 账号</Text>
        {isDemoMode ? <Text className="text-sm text-primary mb-4">本地演示模式：输入任意邮箱和密码即可进入</Text> : null}

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
            placeholder="请输入密码"
            placeholderTextColor="#9ca3af"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
          />
          <Pressable onPress={() => setShowPassword(!showPassword)}>
            {showPassword ? <EyeOff size={20} className="text-muted-foreground" /> : <Eye size={20} className="text-muted-foreground" />}
          </Pressable>
        </View>

        {error ? <Text className="text-destructive text-sm mt-3">{error}</Text> : null}

        <Pressable
          className="bg-primary rounded-xl py-4 items-center mt-6 active:opacity-80"
          android_ripple={{ color: "rgba(0,0,0,0.1)" }}
          onPress={handleSignIn}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-primary-foreground font-semibold text-base">登录</Text>}
        </Pressable>

        <Pressable className="mt-4 items-center" onPress={() => router.push('/(auth)/sign-up')}>
          <Text className="text-sm text-muted-foreground">
            还没有账号？<Text className="text-primary font-medium">立即注册</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
