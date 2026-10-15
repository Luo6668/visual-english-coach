import { useRouter } from 'expo-router';
import { BookOpen, Camera, Languages, Pencil } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

export default function LandingScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-background px-6">
      <View className="flex-1 items-center justify-center gap-6">
        <View className="w-20 h-20 bg-primary rounded-2xl items-center justify-center mb-2">
          <BookOpen size={36} className="text-primary-foreground" />
        </View>
        <Text className="text-3xl font-bold text-foreground">Visual English Coach</Text>
        <Text className="text-base text-muted-foreground text-center leading-relaxed">
          把现实世界实时转换成英语思维的AI学习助手{"\n"}
          拍照识别场景，练习英语思维表达
        </Text>
      </View>
      <View className="gap-4 mb-8">
        <Pressable
          className="bg-primary rounded-xl py-4 items-center active:opacity-80"
          android_ripple={{ color: "rgba(0,0,0,0.1)" }}
          onPress={() => router.push("/(auth)/sign-in")}
        >
          <Text className="text-primary-foreground font-semibold text-base">登录 / 注册</Text>
        </Pressable>
        <View className="flex-row justify-center gap-6">
          <View className="items-center gap-2">
            <View className="w-12 h-12 border border-border rounded-lg items-center justify-center">
              <Camera size={20} className="text-foreground" />
            </View>
            <Text className="text-xs text-muted-foreground">拍照</Text>
          </View>
          <View className="items-center gap-2">
            <View className="w-12 h-12 border border-border rounded-lg items-center justify-center">
              <Pencil size={20} className="text-foreground" />
            </View>
            <Text className="text-xs text-muted-foreground">输入</Text>
          </View>
          <View className="items-center gap-2">
            <View className="w-12 h-12 border border-border rounded-lg items-center justify-center">
              <Languages size={20} className="text-foreground" />
            </View>
            <Text className="text-xs text-muted-foreground">翻译</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
