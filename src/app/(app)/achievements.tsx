import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowLeft,
  Award,
  BookOpen,
  Camera,
  Check,
  ChevronRight,
  Flame,
  LockKeyhole,
  Medal,
  Star,
  Target,
  Trophy,
  Zap,
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchLearningRecords, fetchUserStats, fetchXpData } from '@/lib/api';

const COLORS = {
  blue: '#1677F2',
  green: '#0AA968',
  gold: '#E9A816',
  red: '#E85D5D',
  text: '#111827',
  muted: '#64748B',
  subtle: '#94A3B8',
  line: '#E6ECF4',
  white: '#FFFFFF',
};

const LEVELS = [
  { level: 1, name: '英语新手', minXp: 0 },
  { level: 2, name: '初级学员', minXp: 100 },
  { level: 3, name: '进阶学员', minXp: 300 },
  { level: 4, name: '表达能手', minXp: 600 },
  { level: 5, name: '场景达人', minXp: 1000 },
  { level: 6, name: '流利学者', minXp: 1500 },
  { level: 7, name: '英语能手', minXp: 2100 },
  { level: 8, name: '思维大师', minXp: 2800 },
  { level: 9, name: '语言达人', minXp: 3600 },
  { level: 10, name: '英语领袖', minXp: 5000 },
];

const TITLES = [
  { level: 2, name: 'English Rookie', description: '完成入门阶段，开始使用场景英语' },
  { level: 4, name: 'Scene Talker', description: '能够完成基础场景对话' },
  { level: 7, name: 'Fluent Speaker', description: '形成稳定、流畅的表达习惯' },
  { level: 9, name: 'Language Pro', description: '掌握更多真实场景表达' },
  { level: 10, name: 'English Master', description: '完成全部等级成长目标' },
];

function calcLevel(totalXp: number) {
  for (let i = LEVELS.length - 1; i >= 0; i -= 1) {
    if (totalXp >= LEVELS[i].minXp) return LEVELS[i];
  }
  return LEVELS[0];
}

export default function AchievementsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<'achievements' | 'titles'>(params.tab === 'titles' ? 'titles' : 'achievements');
  const [stats, setStats] = useState<any>(null);
  const [xpData, setXpData] = useState<{ stats: any; logs: any[] }>({ stats: null, logs: [] });
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setActiveTab(params.tab === 'titles' ? 'titles' : 'achievements');
  }, [params.tab]);

  useFocusEffect(useCallback(() => {
    (async () => {
      setLoading(true);
      try {
        const [nextStats, nextXpData, records] = await Promise.all([
          fetchUserStats(),
          fetchXpData(),
          fetchLearningRecords(),
        ]);
        setStats(nextStats);
        setXpData(nextXpData);
        setTotalRecords(records.length);
      } catch { /* 页面保留空数据状态 */ } finally {
        setLoading(false);
      }
    })();
  }, []));

  const totalXp = xpData.stats?.total_xp ?? 0;
  const totalWords = stats?.total_words ?? 0;
  const streak = stats?.streak_days ?? xpData.stats?.streak_days ?? 0;
  const curLevel = calcLevel(totalXp);
  const activeTitle = [...TITLES].reverse().find(title => curLevel.level >= title.level);

  const achievements = [
    { key: 'first-scene', name: '初次启程', description: '完成第一个场景学习', current: totalRecords, target: 1, unit: '个场景', icon: Star, color: COLORS.gold },
    { key: 'scene-explorer', name: '场景探索者', description: '累计完成 5 个场景记录', current: totalRecords, target: 5, unit: '个场景', icon: Camera, color: COLORS.blue },
    { key: 'steady-learner', name: '坚持学习', description: '连续学习达到 3 天', current: streak, target: 3, unit: '天', icon: Flame, color: COLORS.green },
    { key: 'word-collector', name: '单词收藏家', description: '累计收集 10 个实用单词', current: totalWords, target: 10, unit: '个单词', icon: BookOpen, color: '#3A83B8' },
    { key: 'xp-rising', name: '经验新星', description: '累计获得 300 XP', current: totalXp, target: 300, unit: 'XP', icon: Zap, color: COLORS.gold },
    { key: 'scene-master', name: '学习达人', description: '累计完成 20 个场景记录', current: totalRecords, target: 20, unit: '个场景', icon: Trophy, color: COLORS.red },
  ];
  const completedAchievements = achievements.filter(item => item.current >= item.target).length;
  const unlockedTitles = TITLES.filter(title => curLevel.level >= title.level).length;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.white }}>
      <StatusBar style="dark" backgroundColor={COLORS.white} />
      <View style={{ paddingTop: insets.top + 8, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
        <View style={{ height: 54, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="返回我的页面"
            onPress={() => router.back()}
            style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}
          >
            <ArrowLeft size={23} color={COLORS.text} />
          </Pressable>
          <View style={{ flex: 1, marginLeft: 6 }}>
            <Text style={{ color: COLORS.text, fontSize: 19, fontWeight: '900' }}>成就与称号</Text>
            <Text style={{ marginTop: 1, color: COLORS.muted, fontSize: 10 }}>记录每一次真实的学习进步</Text>
          </View>
        </View>

        <View accessibilityRole="tablist" style={{ height: 48, paddingHorizontal: 20, flexDirection: 'row' }}>
          {[
            { key: 'achievements' as const, label: `全部成就 ${completedAchievements}/${achievements.length}` },
            { key: 'titles' as const, label: `称号收藏 ${unlockedTitles}/${TITLES.length}` },
          ].map(tab => {
            const selected = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => {
                  setActiveTab(tab.key);
                  router.setParams({ tab: tab.key });
                }}
                style={({ pressed }) => ({ flex: 1, alignItems: 'center', justifyContent: 'center', borderBottomWidth: selected ? 3 : 1, borderBottomColor: selected ? COLORS.blue : COLORS.line, opacity: pressed ? 0.6 : 1 })}
              >
                <Text style={{ color: selected ? COLORS.blue : COLORS.muted, fontSize: 13, fontWeight: selected ? '900' : '700' }}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={COLORS.blue} /></View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 22, paddingBottom: insets.bottom + 36 }}>
          {activeTab === 'achievements' ? (
            <>
              <View style={{ paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <Text style={{ color: COLORS.text, fontSize: 28, fontWeight: '900' }}>{completedAchievements}</Text>
                  <Text style={{ marginLeft: 5, color: COLORS.muted, fontSize: 13 }}>/ {achievements.length} 已完成</Text>
                  <Text style={{ flex: 1, textAlign: 'right', color: COLORS.blue, fontSize: 12, fontWeight: '800' }}>LV.{curLevel.level} {curLevel.name}</Text>
                </View>
                <View style={{ height: 8, marginTop: 12, backgroundColor: '#E8EDF4', borderRadius: 4, overflow: 'hidden' }}>
                  <View style={{ width: `${(completedAchievements / achievements.length) * 100}%` as any, height: '100%', backgroundColor: COLORS.blue }} />
                </View>
              </View>

              <View style={{ marginTop: 8 }}>
                {achievements.map(item => {
                  const complete = item.current >= item.target;
                  const safeCurrent = Math.min(item.current, item.target);
                  const itemProgress = Math.min(item.current / item.target, 1);
                  return (
                    <View key={item.key} style={{ minHeight: 112, paddingVertical: 18, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
                      <View style={{ width: 50, height: 50, borderRadius: 8, borderWidth: 1, borderColor: complete ? item.color : COLORS.line, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' }}>
                        <item.icon size={25} color={complete ? item.color : COLORS.subtle} />
                      </View>
                      <View style={{ flex: 1, marginLeft: 13 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={{ flex: 1, color: COLORS.text, fontSize: 15, fontWeight: '900' }}>{item.name}</Text>
                          {complete ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}><Check size={14} color={COLORS.green} strokeWidth={3} /><Text style={{ marginLeft: 4, color: COLORS.green, fontSize: 11, fontWeight: '800' }}>已完成</Text></View>
                          ) : (
                            <Text style={{ color: COLORS.muted, fontSize: 11 }}>{safeCurrent}/{item.target} {item.unit}</Text>
                          )}
                        </View>
                        <Text style={{ marginTop: 4, color: COLORS.muted, fontSize: 11 }}>{item.description}</Text>
                        <View style={{ height: 5, marginTop: 12, borderRadius: 3, overflow: 'hidden', backgroundColor: '#E8EDF4' }}>
                          <View style={{ width: `${itemProgress * 100}%` as any, height: '100%', backgroundColor: complete ? COLORS.green : COLORS.blue }} />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          ) : (
            <>
              <View style={{ paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.white, borderWidth: 2, borderColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' }}>
                    <Medal size={40} color={COLORS.gold} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={{ color: COLORS.muted, fontSize: 11 }}>当前使用称号</Text>
                    <Text style={{ marginTop: 3, color: COLORS.text, fontSize: 19, fontWeight: '900' }}>{activeTitle?.name ?? '尚未解锁'}</Text>
                    <Text style={{ marginTop: 5, color: COLORS.blue, fontSize: 11, fontWeight: '800' }}>LV.{curLevel.level} {curLevel.name} · {totalXp} XP</Text>
                  </View>
                </View>
              </View>

              <View style={{ marginTop: 8 }}>
                {TITLES.map(title => {
                  const unlocked = curLevel.level >= title.level;
                  const active = activeTitle?.name === title.name;
                  const requiredXp = LEVELS.find(level => level.level === title.level)?.minXp ?? 0;
                  const titleProgress = Math.min(totalXp / Math.max(requiredXp, 1), 1);
                  return (
                    <View key={title.name} style={{ minHeight: 116, paddingVertical: 18, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
                      <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: COLORS.white, borderWidth: unlocked ? 2 : 1, borderColor: unlocked ? COLORS.gold : COLORS.line, alignItems: 'center', justifyContent: 'center' }}>
                        {unlocked ? <Medal size={31} color={COLORS.gold} /> : <LockKeyhole size={24} color={COLORS.subtle} />}
                      </View>
                      <View style={{ flex: 1, marginLeft: 14 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={{ flex: 1, color: COLORS.text, fontSize: 15, fontWeight: '900' }}>{title.name}</Text>
                          {active ? <View style={{ borderWidth: 1, borderColor: COLORS.blue, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3 }}><Text style={{ color: COLORS.blue, fontSize: 9, fontWeight: '900' }}>使用中</Text></View> : null}
                        </View>
                        <Text style={{ marginTop: 4, color: COLORS.muted, fontSize: 11 }}>{title.description}</Text>
                        <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center' }}>
                          <View style={{ flex: 1, height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: '#E8EDF4' }}><View style={{ width: `${titleProgress * 100}%` as any, height: '100%', backgroundColor: unlocked ? COLORS.gold : COLORS.blue }} /></View>
                          <Text style={{ width: 78, marginLeft: 10, textAlign: 'right', color: unlocked ? COLORS.green : COLORS.muted, fontSize: 10 }}>{unlocked ? '已获得' : `${totalXp}/${requiredXp} XP`}</Text>
                        </View>
                        {!unlocked ? <Text style={{ marginTop: 5, color: COLORS.subtle, fontSize: 10 }}>达到 LV.{title.level} 解锁</Text> : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="继续学习解锁更多成就"
            onPress={() => router.push('/(app)/(tabs)/learning' as any)}
            style={({ pressed }) => ({ height: 52, marginTop: 24, borderRadius: 8, backgroundColor: COLORS.blue, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.72 : 1 })}
          >
            <Target size={19} color={COLORS.white} />
            <Text style={{ marginLeft: 8, color: COLORS.white, fontSize: 14, fontWeight: '900' }}>继续学习</Text>
            <ChevronRight size={18} color={COLORS.white} />
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}
