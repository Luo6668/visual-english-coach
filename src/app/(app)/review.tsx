import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAudioPlayer } from 'expo-audio';
import { ChevronLeft, RefreshCw, Trash2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSession } from '@/ctx';
import { MotionPressable } from '@/components/motion-pressable';
import { ReviewButton as Button, ReviewPracticeCard } from '@/components/learning-loop/review-practice-card';
import { dueReviews, type ReviewAttempt, type ReviewItem } from '@/lib/learning-loop/model';
import { recordReviewAttempt, removeReviewExpression, saveReviewCue, saveReviewExpression, useReviewQueue } from '@/lib/learning-loop/store';
import { fetchSentences, invokeEdgeFunction } from '@/lib/api';
import { speakWithTTS, stopLocalSpeech } from '@/lib/speech';
import { reviewOutcomeLabel, reviewPrompt } from '@/lib/learning-loop/review-practice';

export default function ReviewScreen() {
  const router = useRouter();
  const { session } = useSession();
  const owner = session?.user.id || '';
  const queue = useReviewQueue(owner);
  const player = useAudioPlayer();
  const [all, setAll] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [interactionBusy, setInteractionBusy] = useState(false);
  const [visited, setVisited] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const onInteractionBusy = useCallback((value: boolean) => setInteractionBusy(value), []);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState<Awaited<ReturnType<typeof fetchSentences>> | null>(null);
  const [picking, setPicking] = useState(false);
  const [now, setNow] = useState(Date.now());
  const lock = useRef(false);
  const roundPin = useRef<string | null>(null);
  const alive = useRef(true);
  const ownerRef = useRef(owner); ownerRef.current = owner;
  const readId = useRef(0);
  useEffect(() => { roundPin.current = null; setSaved(null); setSelected(null); setVisited([]); setNotice(''); setError(''); setPicking(false); readId.current++; }, [owner]);
  useEffect(() => { alive.current = true; const timer = setInterval(() => setNow(Date.now()), 60000); return () => { alive.current = false; clearInterval(timer); stopLocalSpeech(); }; }, []);
  const due = useMemo(() => dueReviews(queue.items, now), [queue.items, now]);
  const items = (all ? queue.items : due).filter(item => !visited.includes(item.id));
  // Keep the saved card visible until the user chooses the next item.
  const current = queue.items.find(item => item.id === (selected || roundPin.current)) || items[0];
  const controlsBusy = busy || interactionBusy;
  const speak = (text: string) => { stopLocalSpeech(); speakWithTTS(text, player, invokeEdgeFunction, () => {}); };
  const act = async (operation: () => Promise<unknown>, message: string) => {
    if (lock.current || !owner || interactionBusy) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await operation(); if (alive.current && ownerRef.current === owner) { setNotice(message); setNow(Date.now()); } }
    catch (e) { if (alive.current && ownerRef.current === owner) setError(e instanceof Error ? e.message : '保存失败，请重试；当前内容未丢失'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const saveAttempt = async (item: ReviewItem, attempt: ReviewAttempt): Promise<ReviewItem> => {
    if (lock.current || !owner) throw new Error('请等待当前操作完成后重试');
    roundPin.current = item.id; setSelected(item.id);
    lock.current = true; setBusy(true);
    try {
      const rows = await recordReviewAttempt(owner, item.id, attempt);
      const updated = rows.find(row => row.id === item.id);
      if (!updated) throw new Error('这条表达已移除，请刷新后重试');
      if (alive.current && ownerRef.current === owner) { setSelected(item.id); setNow(Date.now()); }
      return updated;
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const saveCue = async (item: ReviewItem, cue: string) => {
    if (lock.current || !owner) throw new Error('请等待当前操作完成后重试');
    lock.current = true; setBusy(true);
    try { await saveReviewCue(owner, item.id, cue); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const next = () => {
    if (!current || controlsBusy) return;
    stopLocalSpeech(); roundPin.current = null; setVisited(ids => [...ids, current.id]); setSelected(null); setHistoryOpen(false); setNotice('');
  };
  const pick = async () => {
    if (picking) return;
    const id = ++readId.current;
    setPicking(true); setError('');
    try { const rows = await fetchSentences(); if (alive.current && id === readId.current && ownerRef.current === owner) setSaved(rows); }
    catch { if (alive.current && id === readId.current && ownerRef.current === owner) setError('表达本读取失败，请重新点击选择'); }
    finally { if (alive.current && id === readId.current) setPicking(false); }
  };
  return <View style={{ flex: 1, backgroundColor: '#F3F8FF' }}>
    <LinearGradient colors={['#FCFEFF', '#EAF4FF', '#F5F1FF']} style={{ paddingTop: 52, paddingBottom: 22, paddingHorizontal: 22 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><MotionPressable accessibilityRole="button" accessibilityLabel="返回表达本" disabled={controlsBusy} onPress={() => { stopLocalSpeech(); router.replace('/(app)/(tabs)/learning' as any); }} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFFB8', alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={22} color="#214569" /></MotionPressable><View style={{ flex: 1 }}><Text style={{ fontWeight: '800', fontSize: 26, color: '#132E50' }}>今天再说一次</Text><Text style={{ fontSize: 12, color: '#66809C', marginTop: 4 }}>你的真实表达 · {due.length} 条到期 / {queue.items.length} 条复习表达</Text></View></View>
      <Text style={{ fontSize: 11, color: '#7B8CA4', marginTop: 14 }}>当前账号 · 此设备保存，暂不支持跨设备同步</Text>
    </LinearGradient>
    <ScrollView contentContainerStyle={{ width: '100%', maxWidth: 700, alignSelf: 'center', padding: 18, gap: 15, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Button label={all ? '只看今天到期' : '查看全部与计划'} disabled={controlsBusy} onPress={() => { stopLocalSpeech(); roundPin.current = null; setAll(!all); setSelected(null); setVisited([]); }} /></View><Button label={picking ? '读取中…' : '从表达本加入'} disabled={picking || controlsBusy} onPress={() => void pick()} /></View>
      {queue.loading ? <ActivityIndicator color="#1677EF" /> : null}
      {queue.error ? <View style={{ gap: 8 }}><Text accessibilityRole="alert" style={{ color: '#AD5D26' }}>{queue.error}</Text><Button label="重试读取复习夹" onPress={() => void queue.reload()} /></View> : null}
      {error ? <Text accessibilityRole="alert" style={{ color: '#AF4D24', lineHeight: 21 }}>{error}</Text> : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={{ color: '#148764', lineHeight: 21 }}>{notice}</Text> : null}
      {!queue.loading && !queue.error && current ? <>
        <ReviewPracticeCard key={`${owner}:${current.id}`} item={current} busy={busy} onSave={attempt => saveAttempt(current, attempt)} onCue={cue => saveCue(current, cue)} onSpeak={speak} onNext={next} onInteractionBusy={onInteractionBusy} />
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Text style={{ color: '#7B8EA3', fontSize: 11, flex: 1 }}>练习 {current.attempts} 次 · 下次 {new Date(current.dueAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text><MotionPressable accessibilityRole="button" accessibilityLabel="移除当前复习表达" disabled={controlsBusy} onPress={() => void act(() => removeReviewExpression(owner, current.id), '已从复习夹移除，原表达本收藏不受影响')} style={{ padding: 10 }}><Trash2 size={17} color="#8396AA" /></MotionPressable></View>
        {current.history?.length ? <View style={{ gap: 6, padding: 14, borderRadius: 16, backgroundColor: '#FFFFFF' }}><Button label={historyOpen ? '收起最近练习记录' : '查看最近练习记录'} onPress={() => setHistoryOpen(value => !value)} />{historyOpen ? current.history.slice(0, 3).map(entry => <View key={entry.id} style={{ gap: 3, paddingVertical: 5 }}><Text style={{ color: '#8796A7', fontSize: 11 }}>{new Date(entry.at).toLocaleString('zh-CN')} · {reviewOutcomeLabel[entry.outcome]} · {entry.method === 'voice' ? '语音识别文字' : entry.method === 'none' ? '未提交表达' : '文字输入'}</Text>{entry.text ? <Text style={{ color: '#3B5977', lineHeight: 21, fontSize: 13 }}>{entry.text}</Text> : null}</View>) : null}</View> : null}
        {items.length > 1 ? <View style={{ gap: 7 }}>{items.map((item, index) => <Button key={item.id} label={`${index + 1}. ${reviewPrompt(item).task || item.target}${item.id === current.id ? ' · 当前' : ''}`} disabled={controlsBusy} onPress={() => { stopLocalSpeech(); roundPin.current = item.id; setSelected(item.id); setNotice(''); }} />)}</View> : null}
      </> : !queue.loading && !queue.error ? <View style={{ padding: 26, gap: 12, borderRadius: 24, backgroundColor: '#FFFFFF', alignItems: 'center' }}><RefreshCw size={30} color="#4C94E8" /><Text style={{ color: '#214467', fontWeight: '800', fontSize: 18 }}>{visited.length ? '这一轮先练到这里' : queue.items.length ? '目前没有到期的表达' : '先收下一句真正想会说的表达'}</Text><Text style={{ textAlign: 'center', color: '#788CA2', fontSize: 13, lineHeight: 22 }}>{visited.length ? '练习已记录；跳过的内容保留原计划。可以查看全部与计划，或回到表达本。' : '从表达本或 AI 对话主动加入表达。有情境就练表达，没有情境先跟读熟悉。'}</Text></View> : null}
      {saved ? <View style={{ gap: 9, padding: 15, backgroundColor: '#FFFFFF', borderRadius: 20 }}><Text style={{ color: '#214467', fontWeight: '800' }}>选择你想再练的真实收藏</Text>{saved.length ? saved.map(row => {
        const exists = queue.items.some(item => item.target.toLowerCase().trim() === String(row.sentence || '').toLowerCase().trim());
        return <View key={row.id} style={{ gap: 8, paddingVertical: 9, borderBottomWidth: 1, borderColor: '#EDF1F7' }}><Text style={{ color: '#254568', fontSize: 14, lineHeight: 22 }}>{row.sentence}</Text><Button label={exists ? '已在复习夹' : '将这句加入复习'} disabled={controlsBusy || exists || Boolean(queue.error)} onPress={() => void act(() => saveReviewExpression(owner, { target: row.sentence, original: row.sentence, explanation: row.translation || '', scene: row.scene_name || '我的表达本', source: 'saved', cue: row.translation || '' }), '已加入复习，可以切换到今天到期开始练习')} /></View>;
      }) : <Text style={{ color: '#73869B', lineHeight: 21 }}>还没有收藏句子，先去 AI 对话或场景学习里保存表达。</Text>}<Button label="收起表达选择" onPress={() => setSaved(null)} /></View> : null}
    </ScrollView>
  </View>;
}
