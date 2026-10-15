import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  Award,
  BookOpen,
  Camera,
  ChevronRight,
  Flame,
  LockKeyhole,
  LogOut,
  Map,
  Medal,
  Settings,
  Star,
  Target,
  User,
} from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSession } from '@/ctx';
import { fetchLearningRecords, fetchUserStats, fetchXpData } from '@/lib/api';

const BLUE = '#1677F2';
const GREEN = '#0AA968';
const GOLD = '#E9A816';
const RED = '#EF4444';
const TEXT = '#111827';
const MUTED = '#64748B';
const LINE = '#E6ECF4';
const LOCKED = '#A8B3C2';
const WHITE = '#FFFFFF';
const BG = WHITE;

// 等级与称号规则保持和成长页一致。
const LEVELS = [
  { level: 1, name: '英语新手', emoji: '🌱', minXp: 0, color: '#86EFAC', bg: '#F0FDF4', reward: '获得「起步」专属徽章', rewardEmoji: '🎖️' },
  { level: 2, name: '初级学员', emoji: '📖', minXp: 100, color: '#60A5FA', bg: '#EFF6FF', reward: '解锁称号「English Rookie」', rewardEmoji: '🏷️' },
  { level: 3, name: '进阶学员', emoji: '🎯', minXp: 300, color: '#A78BFA', bg: '#F5F3FF', reward: '获得蓝色专属头像框', rewardEmoji: '🔵' },
  { level: 4, name: '表达能手', emoji: '💬', minXp: 600, color: '#FB923C', bg: '#FFF7ED', reward: '解锁称号「Scene Talker」', rewardEmoji: '🏷️' },
  { level: 5, name: '场景达人', emoji: '🗺️', minXp: 1000, color: '#FACC15', bg: '#FEFCE8', reward: '获得「场景探索者」限定徽章', rewardEmoji: '🗺️' },
  { level: 6, name: '流利学者', emoji: '🎓', minXp: 1500, color: '#34D399', bg: '#ECFDF5', reward: '获得金色专属头像框', rewardEmoji: '🟡' },
  { level: 7, name: '英语能手', emoji: '⚡', minXp: 2100, color: '#38BDF8', bg: '#F0F9FF', reward: '解锁称号「Fluent Speaker」', rewardEmoji: '🏷️' },
  { level: 8, name: '思维大师', emoji: '🧠', minXp: 2800, color: '#E879F9', bg: '#FDF4FF', reward: '获得「思维大师」稀有徽章', rewardEmoji: '💎' },
  { level: 9, name: '语言达人', emoji: '🏅', minXp: 3600, color: '#F97316', bg: '#FFF7ED', reward: '解锁称号「Language Pro」+ 彩虹框', rewardEmoji: '🌈' },
  { level: 10, name: '英语领袖', emoji: '👑', minXp: 5000, color: '#FBBF24', bg: '#FFFBEB', reward: '传奇称号「English Master」+ 王冠框', rewardEmoji: '👑' },
];

const TITLES = [
  { level: 2, name: 'English Rookie', color: '#60A5FA', bg: '#EFF6FF' },
  { level: 4, name: 'Scene Talker', color: '#FB923C', bg: '#FFF7ED' },
  { level: 7, name: 'Fluent Speaker', color: '#38BDF8', bg: '#F0F9FF' },
  { level: 9, name: 'Language Pro', color: '#F97316', bg: '#FFF7ED' },
  { level: 10, name: 'English Master', color: '#FBBF24', bg: '#FFFBEB' },
];

function calcLevel(totalXp: number) {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (totalXp >= LEVELS[i].minXp) return LEVELS[i];
  }
  return LEVELS[0];
}

export default function ProfileScreen() {
  const router = useRouter();
  const { session, signOut } = useSession();
  const [stats, setStats] = useState<any>(null);
  const [xpData, setXpData] = useState<{ stats: any; logs: any[] }>({ stats: null, logs: [] });
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    (async () => {
      setLoading(true);
      try {
        const [s, xp, records] = await Promise.all([
          fetchUserStats(),
          fetchXpData(),
          fetchLearningRecords(),
        ]);
        setStats(s);
        setXpData(xp);
        setTotalRecords(records.length);
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    })();
  }, []));

  const handleLogout = signOut;
  const streak = stats?.streak_days ?? xpData.stats?.streak_days ?? 0;
  const totalWords = stats?.total_words ?? 0;
  const totalXp = xpData.stats?.total_xp ?? 0;
  const curLevel = calcLevel(totalXp);
  const nextLevel = LEVELS.find(l => l.level === curLevel.level + 1);
  const progress = nextLevel ? (totalXp - curLevel.minXp) / (nextLevel.minXp - curLevel.minXp) : 1;
  const xpToNext = nextLevel ? Math.max(nextLevel.minXp - totalXp, 0) : 0;
  const email = session?.user?.email ?? '用户';
  const displayName = email.includes('@') ? email.split('@')[0] : email;
  const unlockedTitles = TITLES.filter(t => curLevel.level >= t.level);
  const activeTitleObj = [...unlockedTitles].reverse()[0];
  const upcomingTitles = TITLES.filter(t => curLevel.level < t.level).slice(0, 2);

  const MENU_ITEMS = [
    { icon: Camera, label: '场景记录', sub: '查看历史学习记录', route: '/(app)/(tabs)/learning' as any },
    { icon: BookOpen, label: '英语日记', sub: 'Weekly Story · AI生成', route: '/(app)/diary' as any },
    { icon: Map, label: 'AI 英语地图', sub: '场景覆盖与学习建议', route: '/(app)/map' as any },
    { icon: Settings, label: '设置', sub: 'API配置 · 通知 · 关于', route: '/(app)/settings' as any },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar style="dark" backgroundColor={BG} />
      <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ paddingTop: 54, paddingHorizontal: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
            <Text style={{ flex: 1, fontSize: 28, fontWeight: '900', color: TEXT }}>我的</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="打开设置"
              onPress={() => router.push('/(app)/settings' as any)}
              style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? '#E8EEF6' : WHITE, borderWidth: 1, borderColor: LINE })}
            >
              <Settings size={21} color={TEXT} strokeWidth={2} />
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
            <View style={{ width: 78, height: 78, borderRadius: 39, borderWidth: 3, borderColor: BLUE, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center' }}>
                <User size={31} color={BLUE} strokeWidth={1.8} />
              </View>
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text numberOfLines={1} style={{ fontSize: 22, fontWeight: '900', color: TEXT }}>{displayName}</Text>
              <Text style={{ marginTop: 2, fontSize: 13, color: MUTED }}>{curLevel.name}</Text>
              {activeTitleObj && (
                <View style={{ marginTop: 7, flexDirection: 'row', alignItems: 'center' }}>
                  <Star size={13} color={BLUE} fill={BLUE} />
                  <Text style={{ marginLeft: 5, color: BLUE, fontSize: 13, fontWeight: '800' }}>{activeTitleObj.name}</Text>
                  <Text style={{ color: MUTED, fontSize: 12 }}> · 使用中</Text>
                </View>
              )}
            </View>
            {streak > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: WHITE, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#B8E8D1' }}>
                <Flame size={16} color={GREEN} fill={GREEN} />
                <Text style={{ marginLeft: 5, color: GREEN, fontSize: 12, fontWeight: '800' }}>连续 {streak} 天</Text>
              </View>
            )}
          </View>

          <View style={{ paddingBottom: 22, borderBottomWidth: 1, borderBottomColor: LINE }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 9 }}>
              <Text style={{ color: BLUE, fontSize: 21, fontWeight: '900' }}>LV.{curLevel.level}</Text>
              <Text style={{ marginLeft: 14, color: MUTED, fontSize: 14 }}>{totalXp} / {nextLevel?.minXp ?? totalXp} XP</Text>
              <Text style={{ flex: 1, textAlign: 'right', color: MUTED, fontSize: 12 }}>{nextLevel ? `${xpToNext} XP 后升级` : '已达到最高等级'}</Text>
            </View>
            <View style={{ height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: '#E7EDF5' }}>
              <View style={{ width: `${Math.min(Math.max(progress, 0) * 100, 100)}%` as any, height: '100%', borderRadius: 4, backgroundColor: BLUE }} />
            </View>
          </View>
        </View>

        {loading && <View style={{ paddingVertical: 18, alignItems: 'center' }}><ActivityIndicator color={BLUE} /></View>}

        <View style={{ paddingHorizontal: 20, paddingTop: loading ? 2 : 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
            <Text style={{ flex: 1, fontSize: 19, fontWeight: '900', color: TEXT }}>我的成就</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="查看全部成就"
              onPress={() => router.push('/(app)/achievements?tab=achievements' as any)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', opacity: pressed ? 0.55 : 1 })}
            >
              <Text style={{ fontSize: 12, color: MUTED }}>查看全部</Text>
              <ChevronRight size={15} color={MUTED} />
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`查看当前称号 ${activeTitleObj?.name ?? ''}`}
              onPress={() => router.push('/(app)/achievements?tab=achievements' as any)}
              style={({ pressed }) => ({ flex: 1.05, minHeight: 208, borderRadius: 8, borderWidth: 1, borderColor: '#F2CC68', backgroundColor: WHITE, padding: 14, justifyContent: 'space-between', opacity: pressed ? 0.72 : 1 })}
            >
              <View style={{ alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 5, backgroundColor: BLUE }}><Text style={{ color: WHITE, fontSize: 10, fontWeight: '800' }}>当前称号</Text></View>
              <View style={{ alignItems: 'center' }}>
                <View style={{ width: 78, height: 78, borderRadius: 39, backgroundColor: WHITE, borderWidth: 2, borderColor: '#F2CC68', alignItems: 'center', justifyContent: 'center' }}><Medal size={44} color={GOLD} strokeWidth={1.8} /></View>
                <Text numberOfLines={2} style={{ marginTop: 12, color: TEXT, fontSize: 16, fontWeight: '900', textAlign: 'center' }}>{activeTitleObj?.name ?? '等待解锁'}</Text>
                <Text style={{ marginTop: 5, color: MUTED, fontSize: 11, textAlign: 'center' }}>{activeTitleObj ? '完成阶段学习目标' : '继续学习获得首个称号'}</Text>
              </View>
            </Pressable>

            <View style={{ flex: 1, gap: 10 }}>
              {upcomingTitles.length > 0 ? upcomingTitles.map(title => (
                <Pressable
                  key={title.name}
                  accessibilityRole="button"
                  accessibilityLabel={`查看称号 ${title.name}，LV.${title.level} 解锁`}
                  onPress={() => router.push('/(app)/achievements?tab=achievements' as any)}
                  style={({ pressed }) => ({ flex: 1, minHeight: 99, borderRadius: 8, borderWidth: 1, borderColor: LINE, backgroundColor: WHITE, padding: 12, flexDirection: 'row', alignItems: 'center', opacity: pressed ? 0.65 : 1 })}
                >
                  <View style={{ width: 46, height: 46, borderRadius: 8, backgroundColor: WHITE, borderWidth: 1, borderColor: LINE, alignItems: 'center', justifyContent: 'center' }}>
                    <Award size={25} color={LOCKED} strokeWidth={1.7} />
                    <View style={{ position: 'absolute', right: -3, top: -3, width: 19, height: 19, borderRadius: 10, backgroundColor: '#667085', alignItems: 'center', justifyContent: 'center' }}><LockKeyhole size={10} color={WHITE} /></View>
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text numberOfLines={2} style={{ color: TEXT, fontSize: 12, fontWeight: '800' }}>{title.name}</Text>
                    <Text style={{ marginTop: 5, color: MUTED, fontSize: 10 }}>LV.{title.level} 解锁</Text>
                  </View>
                </Pressable>
              )) : (
                <Pressable onPress={() => router.push('/(app)/achievements?tab=achievements' as any)} style={({ pressed }) => ({ flex: 1, borderRadius: 8, borderWidth: 1, borderColor: '#BDEBD6', backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center', padding: 16, opacity: pressed ? 0.65 : 1 })}>
                  <Medal size={34} color={GREEN} /><Text style={{ marginTop: 8, color: GREEN, fontWeight: '900' }}>称号已全部解锁</Text>
                </Pressable>
              )}
            </View>
          </View>

          <View style={{ marginTop: 26, paddingBottom: 22, borderBottomWidth: 1, borderBottomColor: LINE }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ flex: 1, color: TEXT, fontSize: 18, fontWeight: '900' }}>称号收藏</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="查看全部称号收藏"
                onPress={() => router.push('/(app)/achievements?tab=titles' as any)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', opacity: pressed ? 0.55 : 1 })}
              >
                <Text style={{ color: MUTED, fontSize: 12 }}>查看全部</Text>
                <ChevronRight size={15} color={MUTED} />
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row' }}>
              {TITLES.map(title => {
                const unlocked = curLevel.level >= title.level;
                const active = activeTitleObj?.name === title.name;
                return (
                  <Pressable
                    key={title.name}
                    accessibilityRole="button"
                    accessibilityLabel={`${title.name}，${unlocked ? '已获得' : `LV.${title.level} 解锁`}`}
                    onPress={() => router.push('/(app)/achievements?tab=titles' as any)}
                    style={({ pressed }) => ({ flex: 1, alignItems: 'center', paddingHorizontal: 2, opacity: pressed ? 0.58 : 1 })}
                  >
                    <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: WHITE, borderWidth: unlocked ? 2 : 1, borderColor: unlocked ? '#F2CC68' : '#DCE3EC', alignItems: 'center', justifyContent: 'center' }}>
                      {unlocked ? <Medal size={24} color={GOLD} /> : <LockKeyhole size={18} color={LOCKED} />}
                    </View>
                    <Text numberOfLines={2} style={{ minHeight: 28, marginTop: 7, color: active ? TEXT : MUTED, fontSize: 9, fontWeight: active ? '800' : '600', lineHeight: 12, textAlign: 'center' }}>{title.name}</Text>
                    <Text style={{ marginTop: 2, color: unlocked ? GOLD : LOCKED, fontSize: 9 }}>{unlocked ? '已获得' : '未解锁'}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ marginTop: 24 }}>
            <Text style={{ color: TEXT, fontSize: 18, fontWeight: '900', marginBottom: 16 }}>学习概览</Text>
            <View style={{ flexDirection: 'row', paddingVertical: 2 }}>
              {[
                { icon: Camera, value: totalRecords, unit: '场景', label: '学习记录', color: BLUE },
                { icon: BookOpen, value: totalWords, unit: '单词', label: '已学单词', color: '#3A83B8' },
                { icon: Flame, value: streak, unit: '天', label: '连续学习', color: GREEN },
              ].map((item, index) => (
                <View key={item.label} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: index === 1 ? 10 : 4, borderLeftWidth: index > 0 ? 1 : 0, borderLeftColor: LINE }}>
                  <item.icon size={23} color={item.color} strokeWidth={1.8} />
                  <View style={{ marginLeft: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}><Text style={{ color: TEXT, fontSize: 22, fontWeight: '900' }}>{item.value}</Text><Text style={{ marginLeft: 3, color: MUTED, fontSize: 10 }}>{item.unit}</Text></View>
                    <Text style={{ color: MUTED, fontSize: 10 }}>{item.label}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {nextLevel && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="继续学习"
              onPress={() => router.push('/(app)/(tabs)/learning' as any)}
              style={({ pressed }) => ({ marginTop: 24, minHeight: 64, borderRadius: 8, borderWidth: 1, borderColor: BLUE, backgroundColor: WHITE, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, transform: [{ scale: pressed ? 0.99 : 1 }], opacity: pressed ? 0.72 : 1 })}
            >
              <Target size={23} color={BLUE} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ color: TEXT, fontSize: 13, fontWeight: '800' }}>再获得 {xpToNext} XP，进入 LV.{nextLevel.level}</Text>
                <Text numberOfLines={1} style={{ marginTop: 3, color: MUTED, fontSize: 10 }}>{nextLevel.name} · {nextLevel.reward}</Text>
              </View>
              <View style={{ height: 36, paddingHorizontal: 12, borderRadius: 8, backgroundColor: BLUE, flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: WHITE, fontSize: 12, fontWeight: '800' }}>继续学习</Text><ChevronRight size={15} color={WHITE} />
              </View>
            </Pressable>
          )}

          <View style={{ marginTop: 26, borderTopWidth: 1, borderTopColor: LINE }}>
            {MENU_ITEMS.map((item, index) => (
              <Pressable
                key={item.label}
                accessibilityRole="button"
                accessibilityLabel={`${item.label}，${item.sub}`}
                onPress={() => router.push(item.route)}
                style={({ pressed }) => ({ minHeight: 68, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: LINE, backgroundColor: pressed ? '#F1F5FA' : 'transparent', paddingHorizontal: 4 })}
              >
                <item.icon size={21} color={index === 2 ? GREEN : '#526071'} strokeWidth={1.8} />
                <View style={{ flex: 1, marginLeft: 14 }}><Text style={{ color: TEXT, fontSize: 14, fontWeight: '800' }}>{item.label}</Text><Text style={{ marginTop: 2, color: MUTED, fontSize: 10 }}>{item.sub}</Text></View>
                <ChevronRight size={18} color={LOCKED} />
              </Pressable>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={handleLogout}
            style={({ pressed }) => ({ height: 58, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.65 : 1 })}
          >
            <LogOut size={17} color={RED} /><Text style={{ marginLeft: 8, color: RED, fontSize: 13, fontWeight: '700' }}>退出登录</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
