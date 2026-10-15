import { useAudioPlayer } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {BookOpen, CheckCircle2, 
  ChevronLeft, Lock,
  MessageSquare, Play, Target, Volume2,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {ActivityIndicator,Pressable, ScrollView, Text, 
  View, 
} from 'react-native';
import { fetchSceneMapProgress, invokeEdgeFunction, upsertSceneMapProgress } from '@/lib/api';
import { getSceneById } from '@/lib/sceneMapData';
import { speakWithTTS } from '@/lib/speech';

// ── 颜色 ─────────────────────────────────────────────────
const BLUE    = '#2563EB';
const GREEN   = '#22C55E';
const GRAY    = '#94A3B8';
const BG      = '#F0F4FF';
const WHITE   = '#FFFFFF';

type SceneStatus = 'locked' | 'in_progress' | 'completed';

export default function SceneDetailScreen() {
  const router = useRouter();
  const { sceneId } = useLocalSearchParams<{ sceneId: string }>();
  const scene = getSceneById(sceneId ?? '');
  const player = useAudioPlayer();

  const [status, setStatus]       = useState<SceneStatus>('locked');
  const [rounds, setRounds]       = useState(0);
  const [loading, setLoading]     = useState(true);
  const [starting, setStarting]   = useState(false);
  const [speakingWord, setSpeakingWord] = useState<string | null>(null);

  const handleSpeak = (word: string) => {
    if (speakingWord) return;
    setSpeakingWord(word);
    speakWithTTS(word, player, invokeEdgeFunction, () => setSpeakingWord(null));
  };

  useEffect(() => {
    if (!sceneId) return;
    (async () => {
      const data = (await fetchSceneMapProgress(sceneId))[0];
      if (data) {
        setStatus(data.status as SceneStatus);
        setRounds(data.dialogue_rounds ?? 0);
      }
      setLoading(false);
    })();
  }, [sceneId]);

  const handleStart = async () => {
    if (!scene) return;
    setStarting(true);
    try {
      // 若是 locked → 改为 in_progress
      if (status === 'locked') {
        await upsertSceneMapProgress({
          scene_id: scene.id,
          scene_name_zh: scene.nameZh,
          scene_name_en: scene.nameEn,
          category: scene.category,
          status: 'in_progress',
          dialogue_rounds: 0,
        });
        setStatus('in_progress');
      }
      router.push(`/(app)/scene-dialogue?sceneId=${scene.id}` as any);
    } finally {
      setStarting(false);
    }
  };

  if (!scene) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG }}>
        <Text style={{ color: GRAY }}>场景不存在</Text>
      </View>
    );
  }

  const progressPct = Math.min(100, Math.round((rounds / scene.requiredRounds) * 100));
  const isCompleted = status === 'completed';

  const statusColor = isCompleted ? GREEN : status === 'in_progress' ? BLUE : GRAY;
  const gradColors: [string, string] = scene.category === 'daily'
    ? ['#1E40AF', '#2563EB']
    : ['#EA580C', '#F97316'];

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar style="light" backgroundColor="transparent" translucent />

      {/* ── Hero ── */}
      <LinearGradient
        colors={gradColors}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingTop: 56, paddingBottom: 32, paddingHorizontal: 20 }}
      >
        {/* 返回按钮 */}
        <Pressable onPress={() => router.back()} className="active:opacity-70"
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <ChevronLeft size={20} color={WHITE} />
        </Pressable>

        {/* 场景信息 */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
          <View style={{
            width: 72, height: 72, borderRadius: 22,
            backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
            borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)',
          }}>
            <Text style={{ fontSize: 38 }}>{scene.emoji}</Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
              {scene.category === 'daily' ? '🌍 日常生活' : '💼 职场英语'}
            </Text>
            <Text style={{ color: WHITE, fontSize: 24, fontWeight: '900' }}>{scene.nameZh}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>{scene.nameEn}</Text>
          </View>
        </View>

        {/* 状态 + 进度 */}
        <View style={{ marginTop: 20, gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 5,
              backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4,
            }}>
              {isCompleted
                ? <CheckCircle2 size={13} color={WHITE} />
                : status === 'in_progress'
                  ? <Play size={13} color={WHITE} />
                  : <Lock size={13} color={WHITE} />
              }
              <Text style={{ color: WHITE, fontSize: 12, fontWeight: '700' }}>
                {isCompleted ? '已完成' : status === 'in_progress' ? '进行中' : '未开始'}
              </Text>
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '700' }}>
              {rounds} / {scene.requiredRounds} 轮
            </Text>
          </View>
          <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 999, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${progressPct}%`, backgroundColor: WHITE, borderRadius: 999 }} />
          </View>
        </View>
      </LinearGradient>

      {/* ── 内容 ── */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 120 }}
          contentInsetAdjustmentBehavior="automatic"
        >
          {/* 场景描述 */}
          <View style={{ backgroundColor: WHITE, borderRadius: 18, padding: 18, gap: 10, borderWidth: 1, borderColor: '#E2E8F0' }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#1E293B' }}>📖 场景介绍</Text>
            <Text style={{ fontSize: 14, color: '#475569', lineHeight: 22 }}>{scene.description}</Text>
          </View>

          {/* AI角色 */}
          <View style={{ backgroundColor: WHITE, borderRadius: 18, padding: 18, gap: 12, borderWidth: 1, borderColor: '#E2E8F0' }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#1E293B' }}>
              <MessageSquare size={15} color={BLUE} /> 角色扮演
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[
                { label: 'AI 扮演', value: scene.aiRole, color: BLUE },
                { label: '你扮演', value: scene.userRole, color: '#7C3AED' },
              ].map(r => (
                <View key={r.label} style={{
                  flex: 1, backgroundColor: r.color + '10', borderRadius: 14, padding: 12, gap: 4,
                  borderWidth: 1, borderColor: r.color + '25',
                }}>
                  <Text style={{ fontSize: 10, color: r.color, fontWeight: '700' }}>{r.label}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E293B' }}>{r.value}</Text>
                </View>
              ))}
            </View>
            {/* AI 开场白预览 */}
            <View style={{ backgroundColor: '#F8FAFF', borderRadius: 12, padding: 12, borderLeftWidth: 3, borderLeftColor: BLUE }}>
              <Text style={{ fontSize: 10, color: GRAY, marginBottom: 4 }}>AI 开场白预览</Text>
              <Text style={{ fontSize: 13, color: '#1E293B', lineHeight: 20, fontStyle: 'italic' }}>
                "{scene.aiOpener}"
              </Text>
            </View>
          </View>

          {/* 对话目标 */}
          <View style={{ backgroundColor: WHITE, borderRadius: 18, padding: 18, gap: 10, borderWidth: 1, borderColor: '#E2E8F0' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Target size={16} color={GREEN} />
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#1E293B' }}>对话目标</Text>
            </View>
            <Text style={{ fontSize: 14, color: '#475569', lineHeight: 22 }}>{scene.dialogueGoal}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#DCFCE7', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' }}>
              <CheckCircle2 size={12} color={GREEN} />
              <Text style={{ fontSize: 11, color: '#166534', fontWeight: '700' }}>
                完成 {scene.requiredRounds} 轮对话解锁场景
              </Text>
            </View>
          </View>

          {/* 常用词汇 */}
          <View style={{ backgroundColor: WHITE, borderRadius: 18, padding: 18, gap: 12, borderWidth: 1, borderColor: '#E2E8F0' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <BookOpen size={16} color='#F59E0B' />
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#1E293B' }}>常用词汇 & 表达</Text>
            </View>
            {scene.vocab.map((v, i) => (
              <View key={i} style={{
                flexDirection: 'row', alignItems: 'flex-start', gap: 12,
                paddingBottom: i < scene.vocab.length - 1 ? 12 : 0,
                borderBottomWidth: i < scene.vocab.length - 1 ? 1 : 0,
                borderBottomColor: '#F1F5F9',
              }}>
                <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '900', color: '#92400E' }}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#1E293B' }}>{v.word}</Text>
                  <Text style={{ fontSize: 12, color: GRAY }}>{v.meaning}</Text>
                </View>
                {/* 朗读按钮 */}
                <Pressable
                  onPress={() => handleSpeak(v.word)}
                  className="active:opacity-60"
                  style={{
                    width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: speakingWord === v.word ? BLUE + '18' : '#F1F5F9',
                    borderWidth: 1, borderColor: speakingWord === v.word ? BLUE + '40' : '#E2E8F0',
                  }}
                >
                  <Volume2 size={15} color={speakingWord === v.word ? BLUE : GRAY} />
                </Pressable>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* ── 底部开始按钮 ── */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: WHITE, padding: 20, paddingBottom: 34,
        borderTopWidth: 1, borderTopColor: '#F1F5F9',
        shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.06, shadowRadius: 12,
      }}>
        <Pressable onPress={handleStart} disabled={starting} className="active:opacity-85" style={{ overflow: 'hidden', borderRadius: 18 }}>
          <LinearGradient
            colors={isCompleted ? ['#22C55E', '#16A34A'] : gradColors}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{ paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}
          >
            {starting ? (
              <ActivityIndicator color={WHITE} size="small" />
            ) : (
              <>
                <Play size={20} color={WHITE} fill={WHITE} />
                <Text style={{ fontSize: 16, fontWeight: '900', color: WHITE }}>
                  {isCompleted ? '再次练习' : status === 'in_progress' ? '继续练习' : '开始练习'}
                </Text>
              </>
            )}
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}
