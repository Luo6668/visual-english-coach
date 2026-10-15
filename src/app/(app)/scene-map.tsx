import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { CheckCircle2, ChevronLeft, Lock, Map, Play } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {ActivityIndicator,Pressable, ScrollView, Text, 
  View, 
} from 'react-native';
import { fetchSceneMapProgress } from '@/lib/api';
import { DAILY_SCENES, type SceneNode, WORKPLACE_SCENES } from '@/lib/sceneMapData';

// ── 颜色 ─────────────────────────────────────────────────
const BLUE    = '#2563EB';
const GREEN   = '#22C55E';
const ORANGE  = '#F97316';
const GRAY    = '#94A3B8';
const BG      = '#F0F4FF';
const WHITE   = '#FFFFFF';

// ── 场景状态类型 ──────────────────────────────────────────
type SceneStatus = 'locked' | 'in_progress' | 'completed';

interface SceneProgress {
  scene_id: string;
  status: SceneStatus;
  dialogue_rounds: number;
}

// ── 状态色 ───────────────────────────────────────────────
function statusColor(status: SceneStatus) {
  if (status === 'completed')  return GREEN;
  if (status === 'in_progress') return BLUE;
  return GRAY;
}
function statusLabel(status: SceneStatus) {
  if (status === 'completed')  return '已完成';
  if (status === 'in_progress') return '进行中';
  return '未解锁';
}
function statusBg(status: SceneStatus) {
  if (status === 'completed')  return '#DCFCE7';
  if (status === 'in_progress') return '#EFF6FF';
  return '#F1F5F9';
}

// ── 单个场景节点卡片 ──────────────────────────────────────
function SceneCard({
  scene, progress, index,
}: { scene: SceneNode; progress: SceneProgress | undefined; index: number }) {
  const router = useRouter();
  const status: SceneStatus = progress?.status ?? 'locked';
  const rounds = progress?.dialogue_rounds ?? 0;
  const isLocked = status === 'locked';
  const isEven = index % 2 === 0;

  return (
    <View style={{ alignItems: isEven ? 'flex-start' : 'flex-end', paddingHorizontal: 16, marginBottom: 4 }}>
      <Pressable
        onPress={() => router.push(`/(app)/scene-detail?sceneId=${scene.id}` as any)}
        className="active:opacity-80"
        style={{
          width: 168,
          backgroundColor: isLocked ? '#F8FAFF' : WHITE,
          borderRadius: 20,
          padding: 16, gap: 10,
          borderWidth: 1.5,
          borderColor: isLocked ? '#E2E8F0' : statusColor(status) + '40',
          opacity: isLocked ? 0.75 : 1,
          shadowColor: isLocked ? '#000' : statusColor(status),
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: isLocked ? 0.04 : 0.14,
          shadowRadius: 12,
        }}
      >
        {/* 状态徽章 */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ backgroundColor: statusBg(status), borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: statusColor(status) }}>
              {statusLabel(status)}
            </Text>
          </View>
          {status === 'completed'
            ? <CheckCircle2 size={18} color={GREEN} />
            : isLocked
              ? <Lock size={16} color={GRAY} />
              : <Play size={16} color={BLUE} />
          }
        </View>

        {/* 表情 + 名称 */}
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 36 }}>{scene.emoji}</Text>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#1E293B' }}>{scene.nameZh}</Text>
          <Text style={{ fontSize: 11, color: GRAY }}>{scene.nameEn}</Text>
        </View>

        {/* 进度条 */}
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 10, color: GRAY }}>对话轮次</Text>
            <Text style={{ fontSize: 10, fontWeight: '700', color: statusColor(status) }}>
              {rounds} / {scene.requiredRounds}
            </Text>
          </View>
          <View style={{ height: 5, backgroundColor: '#F1F5F9', borderRadius: 999, overflow: 'hidden' }}>
            <View style={{
              height: '100%',
              width: `${Math.min(100, Math.round((rounds / scene.requiredRounds) * 100))}%`,
              backgroundColor: statusColor(status),
              borderRadius: 999,
            }} />
          </View>
        </View>
      </Pressable>
    </View>
  );
}

// ── 连接路径点 ────────────────────────────────────────────
function PathConnector({ index }: { index: number }) {
  const isEven = index % 2 === 0;
  return (
    <View style={{
      height: 28, marginHorizontal: 16,
      flexDirection: 'row', alignItems: 'center',
      justifyContent: isEven ? 'flex-end' : 'flex-start',
      paddingHorizontal: 52,
    }}>
      {/* 虚线 */}
      {[0,1,2,3,4].map(i => (
        <View key={i} style={{
          width: 4, height: 4, borderRadius: 2,
          backgroundColor: '#BFDBFE', marginHorizontal: 2,
        }} />
      ))}
    </View>
  );
}

// ── 分类标题 ─────────────────────────────────────────────
function CategoryHeader({ emoji, title, subtitle, color }: {
  emoji: string; title: string; subtitle: string; color: string;
}) {
  return (
    <View style={{
      marginHorizontal: 16, marginBottom: 20, marginTop: 8,
      backgroundColor: WHITE, borderRadius: 16, padding: 14,
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderWidth: 1, borderColor: color + '25',
      shadowColor: color, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 10,
    }}>
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: color + '15', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 24 }}>{emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '900', color: '#1E293B' }}>{title}</Text>
        <Text style={{ fontSize: 12, color: GRAY, marginTop: 1 }}>{subtitle}</Text>
      </View>
    </View>
  );
}

// ── 主屏 ─────────────────────────────────────────────────
export default function SceneMapScreen() {
  const router = useRouter();
  const [progressMap, setProgressMap] = useState<Record<string, SceneProgress>>({});
  const [loading, setLoading]         = useState(true);

  useFocusEffect(useCallback(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await fetchSceneMapProgress();
        if (data) {
          const map: Record<string, SceneProgress> = {};
          data.forEach((r: any) => { map[r.scene_id] = r; });
          setProgressMap(map);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []));

  // 统计
  const allScenes = [...DAILY_SCENES, ...WORKPLACE_SCENES];
  const completedCount  = allScenes.filter(s => progressMap[s.id]?.status === 'completed').length;
  const inProgressCount = allScenes.filter(s => progressMap[s.id]?.status === 'in_progress').length;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar style="dark" backgroundColor={WHITE} />

      {/* ── 顶部 Hero ── */}
      <LinearGradient
        colors={['#1E40AF', '#2563EB', '#3B82F6']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingTop: 56, paddingBottom: 24, paddingHorizontal: 20 }}
      >
        {/* 导航 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Pressable onPress={() => router.back()} className="active:opacity-70"
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={20} color={WHITE} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: WHITE, fontSize: 20, fontWeight: '900' }}>🗺️ 场景地图</Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>解锁场景 · 对话练习</Text>
          </View>
          <Map size={22} color="rgba(255,255,255,0.8)" />
        </View>

        {/* 统计卡片 */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            { label: '总场景', value: allScenes.length, color: 'rgba(255,255,255,0.15)' },
            { label: '已完成', value: completedCount,   color: '#22C55E30' },
            { label: '进行中', value: inProgressCount,  color: '#F9731630' },
          ].map(stat => (
            <View key={stat.label} style={{
              flex: 1, backgroundColor: stat.color, borderRadius: 14,
              padding: 12, alignItems: 'center', gap: 2,
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
            }}>
              <Text style={{ fontSize: 22, fontWeight: '900', color: WHITE }}>{stat.value}</Text>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)' }}>{stat.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {/* ── 内容 ── */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} size="large" />
          <Text style={{ color: GRAY, marginTop: 12, fontSize: 14 }}>加载进度中…</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40, paddingTop: 24 }}
          contentInsetAdjustmentBehavior="automatic"
        >
          {/* ── 日常生活场景 ── */}
          <CategoryHeader
            emoji="🌍" title="日常生活"
            subtitle={`${DAILY_SCENES.length} 个生活场景 · 咖啡馆、机场、餐厅…`}
            color={BLUE}
          />
          {DAILY_SCENES.map((scene, index) => (
            <View key={scene.id}>
              <SceneCard scene={scene} progress={progressMap[scene.id]} index={index} />
              {index < DAILY_SCENES.length - 1 && <PathConnector index={index} />}
            </View>
          ))}

          {/* 分隔 */}
          <View style={{ height: 1, backgroundColor: '#E2E8F0', marginHorizontal: 20, marginVertical: 28 }} />

          {/* ── 职场场景 ── */}
          <CategoryHeader
            emoji="💼" title="职场英语"
            subtitle={`${WORKPLACE_SCENES.length} 个职场场景 · 会议、面试、谈判…`}
            color={ORANGE}
          />
          {WORKPLACE_SCENES.map((scene, index) => (
            <View key={scene.id}>
              <SceneCard scene={scene} progress={progressMap[scene.id]} index={index} />
              {index < WORKPLACE_SCENES.length - 1 && <PathConnector index={index} />}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
