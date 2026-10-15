import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronLeft, MapPin, MessageCircle, Sparkles } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { fetchScenes } from '@/lib/api';

const BLUE      = '#4A90E2';
const BLUE_DARK = '#2E5C8A';
const BLUE_LIGHT = '#EEF5FF';
const YELLOW    = '#FFD60A';
const GREEN     = '#34C759';
const WHITE     = '#FFFFFF';
const BG        = '#F5F8FF';

const ALL_SCENES = [
  { name: '咖啡店',  emoji: '☕' }, { name: '地铁',   emoji: '🚇' },
  { name: '超市',    emoji: '🛒' }, { name: '餐厅',   emoji: '🍜' },
  { name: '公园',    emoji: '🌿' }, { name: '图书馆', emoji: '📚' },
  { name: '机场',    emoji: '✈️' }, { name: '医院',   emoji: '🏥' },
  { name: '银行',    emoji: '🏦' }, { name: '健身房', emoji: '💪' },
  { name: '电影院',  emoji: '🎬' }, { name: '博物馆', emoji: '🏛️' },
  { name: '酒店',    emoji: '🏨' }, { name: '便利店', emoji: '🏪' },
  { name: '公司',    emoji: '🏢' }, { name: '学校',   emoji: '🏫' },
];

function getAiSuggestions(practiced: Set<string>) {
  return ALL_SCENES.filter(s => !practiced.has(s.name)).slice(0, 3);
}

export default function MapScreen() {
  const router = useRouter();
  const [scenes, setScenes]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    (async () => {
      setLoading(true);
      try { setScenes(await fetchScenes()); }
      finally { setLoading(false); }
    })();
  }, []));

  const practicedMap = new Map(scenes.map(s => [s.scene_name, s.practice_count ?? 1]));
  const practicedSet = new Set(practicedMap.keys());
  const totalPracticed = ALL_SCENES.filter(s => {
    for (const k of practicedSet) { if (k.includes(s.name) || s.name.includes(k)) return true; }
    return false;
  }).length;
  const coverage = Math.round((totalPracticed / ALL_SCENES.length) * 100);
  const suggestions = getAiSuggestions(practicedSet);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>

      {/* ── 顶部 Hero ── */}
      <View style={{ backgroundColor: BLUE_LIGHT, paddingTop: 56, paddingBottom: 24, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#D6E8FF' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <Pressable onPress={() => router.back()} className="active:opacity-70"
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: BLUE + '18', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={20} color={BLUE} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#1E293B', fontSize: 20, fontWeight: '800' }}>🗺️ AI 英语地图</Text>
            <Text style={{ color: '#64748B', fontSize: 12 }}>场景覆盖 · 学习建议</Text>
          </View>
        </View>

        {/* 覆盖率进度 */}
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: '#64748B', fontSize: 12, fontWeight: '600' }}>场景覆盖率</Text>
            <Text style={{ color: BLUE, fontSize: 13, fontWeight: '900' }}>{coverage}%</Text>
          </View>
          <View style={{ height: 8, backgroundColor: BLUE + '20', borderRadius: 999, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${coverage}%`, backgroundColor: BLUE, borderRadius: 999 }} />
          </View>
          <Text style={{ color: '#94A3B8', fontSize: 11 }}>{totalPracticed} / {ALL_SCENES.length} 个场景</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic">
        {loading ? (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <ActivityIndicator size="large" color={BLUE} />
          </View>
        ) : (
          <View style={{ padding: 16, gap: 16, paddingBottom: 40 }}>

            {/* ── AI 建议 ── */}
            {suggestions.length > 0 && (
              <View style={{ backgroundColor: '#1E3A5F', borderRadius: 20, padding: 18, gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={16} color={YELLOW} />
                  <Text style={{ color: WHITE, fontSize: 14, fontWeight: '800' }}>AI 学习建议</Text>
                </View>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, lineHeight: 18 }}>
                  你还没有练习以下场景，快去解锁吧！
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {suggestions.map(s => (
                    <Pressable key={s.name} className="active:opacity-75"
                      onPress={() => router.push(`/(app)/thinking-mode?inputType=manual&text=${encodeURIComponent(s.name)}` as any)}
                      style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: 12, alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 24 }}>{s.emoji}</Text>
                      <Text style={{ color: WHITE, fontSize: 11, fontWeight: '700', textAlign: 'center' }}>{s.name}</Text>
                      <View style={{ backgroundColor: YELLOW, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ color: BLUE_DARK, fontSize: 9, fontWeight: '800' }}>去练习</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* ── 已练习场景 ── */}
            {scenes.length > 0 && (
              <View style={{ gap: 10 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#1E293B' }}>已练习场景 ✅</Text>
                {scenes.slice(0, 8).map((sc, idx) => {
                  const emo = ALL_SCENES.find(a => sc.scene_name.includes(a.name) || a.name.includes(sc.scene_name))?.emoji ?? '📍';
                  const maxCount = scenes[0]?.practice_count ?? 1;
                  const pct = Math.max((sc.practice_count ?? 1) / maxCount, 0.05);
                  return (
                    <Pressable key={sc.id} className="active:opacity-85"
                      onPress={() => router.push({ pathname: '/(app)/dialogue', params: { scene: sc.scene_name } } as any)}
                      style={{ backgroundColor: WHITE, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 }}>
                      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: BLUE + '15', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 22 }}>{emo}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#1E293B' }}>{sc.scene_name}</Text>
                          <Text style={{ fontSize: 11, color: '#94A3B8' }}>{sc.practice_count ?? 1}次</Text>
                        </View>
                        <View style={{ height: 5, backgroundColor: '#F0F4F8', borderRadius: 999, overflow: 'hidden' }}>
                          <View style={{ height: '100%', width: `${pct * 100}%`, backgroundColor: idx === 0 ? BLUE : BLUE + '70', borderRadius: 999 }} />
                        </View>
                      </View>
                      <MessageCircle size={14} color="#CBD5E1" />
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* ── 全场景地图网格 ── */}
            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#1E293B' }}>全场景地图</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {ALL_SCENES.map(s => {
                  const practiced = [...practicedSet].some(k => k.includes(s.name) || s.name.includes(k));
                  const count = practiced ? [...practicedSet].reduce((acc, k) => {
                    if (k.includes(s.name) || s.name.includes(k)) return acc + (practicedMap.get(k) ?? 1);
                    return acc;
                  }, 0) : 0;
                  return (
                    <Pressable key={s.name} className="active:opacity-75"
                      onPress={() => router.push(`/(app)/thinking-mode?inputType=manual&text=${encodeURIComponent(s.name)}` as any)}
                      style={{
                        width: '30%', backgroundColor: practiced ? WHITE : '#F0F4F8',
                        borderRadius: 18, padding: 14, alignItems: 'center', gap: 6,
                        borderWidth: practiced ? 2 : 1,
                        borderColor: practiced ? BLUE + '40' : '#E2E8F0',
                        opacity: practiced ? 1 : 0.6,
                        shadowColor: '#000', shadowOffset: { width: 0, height: practiced ? 3 : 1 },
                        shadowOpacity: practiced ? 0.09 : 0.04, shadowRadius: practiced ? 10 : 4,
                      }}>
                      <Text style={{ fontSize: 28 }}>{s.emoji}</Text>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: practiced ? '#1E293B' : '#94A3B8', textAlign: 'center' }} numberOfLines={1}>{s.name}</Text>
                      {practiced ? (
                        <View style={{ backgroundColor: GREEN + '20', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 9, fontWeight: '800', color: GREEN }}>{count}次</Text>
                        </View>
                      ) : (
                        <View style={{ backgroundColor: '#E2E8F0', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 9, color: '#94A3B8' }}>未练习</Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>

          </View>
        )}
      </ScrollView>
    </View>
  );
}

const ALL_SCENE_TYPES = [
  { name: '咖啡店', emoji: '☕' },
  { name: '地铁', emoji: '🚇' },
  { name: '超市', emoji: '🛒' },
  { name: '餐厅', emoji: '🍜' },
  { name: '公园', emoji: '🌿' },
  { name: '图书馆', emoji: '📚' },
  { name: '机场', emoji: '✈️' },
  { name: '医院', emoji: '🏥' },
  { name: '银行', emoji: '🏦' },
  { name: '健身房', emoji: '💪' },
  { name: '电影院', emoji: '🎬' },
  { name: '博物馆', emoji: '🏛️' },
  { name: '酒店', emoji: '🏨' },
  { name: '便利店', emoji: '🏪' },
  { name: '公司', emoji: '🏢' },
  { name: '学校', emoji: '🏫' },
];

function getAiSuggestion(practiced: Set<string>) {
  const notPracticed = ALL_SCENE_TYPES.filter(s => !practiced.has(s.name));
  if (notPracticed.length === 0) return '太棒了！你已经覆盖了所有常见场景，继续保持！';
  const suggestions = notPracticed.slice(0, 3).map(s => s.name).join('、');
  return `你还没有练习过 ${suggestions} 等场景，建议重点练习这些生活常见场景，提升英语覆盖范围。`;
}

