import { useAudioPlayer } from 'expo-audio';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { BookOpen, ChevronDown, ChevronLeft, Mic, Volume2 } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MotionPressable } from '@/components/motion-pressable';
import { useSession } from '@/ctx';
import { fetchSentences, invokeEdgeFunction, updateSavedSentenceTranslation } from '@/lib/api';
import { normalizeExpression } from '@/lib/learning-loop/model';
import { saveReviewExpression, useReviewQueue } from '@/lib/learning-loop/store';
import { fetchSentenceDetail, sentenceErrorMessage, type SentenceDetail } from '@/lib/sentence-learning';
import { speakWithTTS, stopLocalSpeech } from '@/lib/speech';

function Section({ label, children }: { label: string; children: ReactNode }) {
  return <View style={s.section}><Text style={s.sectionTitle}>{label}</Text>{children}</View>;
}
function Action({ label, onPress, disabled = false, primary = false }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  return <MotionPressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} onPress={onPress} disabled={disabled} style={[s.action, primary && s.primary, disabled && { opacity: 0.5 }]}><Text style={[s.actionText, primary && { color: '#FFFFFF' }]}>{label}</Text></MotionPressable>;
}
const scalar = (value?: string | string[]) => Array.isArray(value) ? value[0] || '' : value || '';
export default function SentenceDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sentenceId?: string; sentence?: string }>();
  const sentenceId = scalar(params.sentenceId); const raw = scalar(params.sentence);
  const { session } = useSession(); const owner = session?.user.id || '';
  const currentOwner = useRef(owner); currentOwner.current = owner;
  const player = useAudioPlayer();
  const queue = useReviewQueue(owner);
  const [sentence, setSentence] = useState(raw);
  const [translation, setTranslation] = useState('');
  const [detail, setDetail] = useState<SentenceDetail | null>(null);
  const [error, setError] = useState(''); const [storageError, setStorageError] = useState('');
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0); const [wordOpen, setWordOpen] = useState(''); const [speaking, setSpeaking] = useState('');
  const generation = useRef(0); const mounted = useRef(true); const saveLock = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; stopLocalSpeech(); }; }, []);
  useFocusEffect(useCallback(() => { setSpeaking(''); return () => stopLocalSpeech(); }, []));
  const persistTranslation = useCallback(async (text: string) => {
    if (!sentenceId || !owner || currentOwner.current !== owner) return;
    try { await updateSavedSentenceTranslation(sentenceId, text); if (mounted.current && currentOwner.current === owner) setStorageError(''); }
    catch { if (mounted.current && currentOwner.current === owner) setStorageError('解析已显示，中文暂未写入表达本，可以重试保存。'); }
  }, [sentenceId, owner]);
  useEffect(() => {
    const request = ++generation.current; let active = true;
    const valid = () => active && mounted.current && request === generation.current && currentOwner.current === owner;
    setLoading(true); setError(''); setStorageError(''); setDetail(null); setSentence(raw); setTranslation('');
    void (async () => {
      try {
        let target = raw; let existingTranslation = '';
        if (sentenceId) {
          const rows = await fetchSentences(); if (!valid()) return;
          const row = rows.find(row => String(row.id) === sentenceId);
          if (!row) throw new Error('这条收藏已移除或不属于当前账号，请返回句库重新选择');
          target = String(row.sentence || ''); existingTranslation = String(row.translation || '');
        }
        if (!valid()) return;
        setSentence(target); setTranslation(existingTranslation);
        const result = await fetchSentenceDetail(target, '', reload > 0);
        if (!valid()) return;
        setDetail(result); setWordOpen(result.words[0]?.text || ''); setTranslation(existingTranslation || result.translation);
        if (!existingTranslation) await persistTranslation(result.translation);
      } catch (e) { if (valid()) setError(sentenceErrorMessage(e)); }
      finally { if (valid()) setLoading(false); }
    })();
    return () => { active = false; generation.current++; };
  }, [sentenceId, raw, owner, reload, persistTranslation]);
  const speak = (text: string, key: string) => {
    stopLocalSpeech();
    if (speaking === key) { setSpeaking(''); return; }
    setSpeaking(key); void speakWithTTS(text, player, invokeEdgeFunction, () => { if (mounted.current) setSpeaking(''); });
  };
  const reviewed = queue.items.some(item => normalizeExpression(item.target) === normalizeExpression(sentence));
  const addReview = async () => {
    if (saveLock.current || !owner || !detail) return;
    saveLock.current = true; setBusy(true); setStorageError('');
    try { await saveReviewExpression(owner, { target: sentence, original: sentence, scene: '表达句库', source: 'saved', cue: detail.translation, explanation: detail.explanation }); }
    catch (e) { if (mounted.current && currentOwner.current === owner) setStorageError(e instanceof Error ? e.message : '加入复习失败，请重试'); }
    finally { saveLock.current = false; if (mounted.current) setBusy(false); }
  };
  return <View style={s.page}>
    <View style={s.header}><MotionPressable accessibilityRole="button" accessibilityLabel="返回表达句库" onPress={() => { stopLocalSpeech(); router.canGoBack() ? router.back() : router.replace('/(app)/(tabs)/learning' as any); }} style={s.back}><ChevronLeft size={23} color="#23486F" /></MotionPressable><View style={{ flex: 1 }}><Text style={s.title}>看懂这句话</Text><Text style={s.caption}>意思 · 句型 · 词性 · 表达拓展</Text></View><BookOpen size={23} color="#3C89ED" /></View>
    <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
      {sentence ? <View style={s.hero}><Text style={s.eyebrow}>MY EXPRESSION</Text><Text selectable style={s.english}>{sentence}</Text><MotionPressable accessibilityRole="button" accessibilityLabel={speaking === 'sentence' ? '停止原句朗读' : '朗读原句'} onPress={() => speak(sentence, 'sentence')} style={s.sound}><Volume2 size={18} color="#1977DE" /><Text style={s.actionText}>{speaking === 'sentence' ? '停止朗读' : '听原句'}</Text></MotionPressable>{translation ? <Text selectable style={s.translation}>{translation}</Text> : null}</View> : null}
      {loading ? <View accessibilityLiveRegion="polite" style={s.loading}><ActivityIndicator color="#267BE0" /><Text style={s.muted}>{translation ? '中文已显示，正在拆解句型和词汇…' : '正在分析中文意思、句型和词汇…'}</Text></View> : null}
      {error ? <View style={s.error}><Text accessibilityRole="alert" style={s.errorText}>{error}</Text><Action label="重试句子解析" onPress={() => setReload(value => value + 1)} /></View> : null}
      {detail ? <>
        <Section label="这句话怎么理解"><Text style={s.paragraph}>{detail.explanation}</Text><Text style={s.caption}>AI 辅助解析，可能有误；参考表达不只有一种。</Text></Section>
        <Section label="拆开看句子">{detail.structure.map((part, index) => <View key={`${part.text}-${index}`} style={s.part}><View style={s.row}><Text style={s.fragment}>{part.text}</Text><Text style={s.tag}>{part.role}</Text></View><Text style={s.paragraph}>{part.explanation}</Text></View>)}</Section>
        <Section label="句型与语法">{detail.grammar.map((point, index) => <View key={index} style={{ gap: 7 }}><Text style={s.strong}>{point.title}</Text><Text style={s.paragraph}>{point.explanation}</Text></View>)}</Section>
        <Section label="重点词 · 词性与拓展">{detail.words.map((word, index) => {
          const open = wordOpen === word.text;
          return <View key={`${word.text}-${index}`} style={s.word}>
            <MotionPressable accessibilityRole="button" accessibilityLabel={`${open ? '收起' : '展开'}词汇拓展 ${word.text}`} accessibilityState={{ expanded: open }} onPress={() => setWordOpen(open ? '' : word.text)} style={{ gap: 9, paddingVertical: 6 }}><View style={s.row}><Text style={s.wordTitle}>{word.text}</Text><Text style={s.tag}>{word.partOfSpeech}</Text><ChevronDown size={17} color="#6D8CAC" /></View><Text style={s.paragraph}>本句含义：{word.meaning}</Text></MotionPressable>
            {open ? <View style={{ gap: 11, paddingTop: 10 }}>
              <View style={s.row}>{word.phonetic ? <Text style={s.caption}>{word.phonetic}</Text> : null}<Action label={`听单词 ${word.text}`} onPress={() => speak(word.lemma || word.text, `word-${index}`)} /></View>
              <Text style={s.paragraph}>{word.usage}</Text>
              {word.forms.length ? <View style={s.inset}><Text style={s.strong}>词形变化</Text>{word.forms.map((form, i) => <Text key={i} style={s.paragraph}>{form}</Text>)}</View> : null}
              <View style={s.inset}><Text style={s.strong}>常用搭配</Text>{word.collocations.map((pair, i) => <View key={i} style={{ gap: 3 }}><Text style={s.smallEnglish}>{pair.english}</Text><Text style={s.muted}>{pair.chinese}</Text></View>)}</View>
              <Text style={s.strong}>换个场景也能用</Text>{word.examples.map((pair, i) => <View key={i} style={s.example}><Text style={s.smallEnglish}>{pair.english}</Text><Text style={s.muted}>{pair.chinese}</Text><Action label={`听拓展例句 ${index + 1}-${i + 1}`} onPress={() => speak(pair.english, `example-${index}-${i}`)} /></View>)}
              <Action label={`查看完整词条 ${word.lemma || word.text}`} onPress={() => { stopLocalSpeech(); router.push({ pathname: '/(app)/word-detail', params: { word: word.lemma || word.text, scene: sentence } } as any); }} />
            </View> : null}
          </View>;
        })}</Section>
        <Section label="还可以怎样表达">{detail.alternatives.map((pair, i) => <View key={i} style={s.example}><Text style={s.smallEnglish}>{pair.english}</Text><Text style={s.paragraph}>{pair.chinese}</Text><Text style={s.caption}>{pair.difference}</Text><Action label={`听相近表达 ${i + 1}`} onPress={() => speak(pair.english, `alternative-${i}`)} /></View>)}</Section>
      </> : null}
      {storageError ? <View style={s.error}><Text accessibilityRole="alert" style={s.errorText}>{storageError}</Text>{storageError.startsWith('解析已显示') && detail ? <Action label="重试保存中文意思" onPress={() => void persistTranslation(detail.translation)} /> : null}</View> : null}
    </ScrollView>
    <View style={s.footer}><View style={{ flex: 1 }}><Action label={reviewed ? '已加入复习' : busy ? '正在加入…' : '加入情境复习'} disabled={busy || reviewed || !detail || Boolean(queue.error)} onPress={() => void addReview()} /></View><View style={{ flex: 1 }}><Action label="跟读这句话" primary disabled={!sentence} onPress={() => { stopLocalSpeech(); router.push({ pathname: '/(app)/shadowing', params: { sentence } } as any); }} /></View><Mic size={18} color="#3C89ED" /></View>
  </View>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F3F7FD' }, header: { paddingTop: 50, paddingBottom: 17, paddingHorizontal: 20, flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: '#FBFDFF', borderBottomWidth: 1, borderColor: '#E5EDF7' }, back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EBF3FE', borderRadius: 20 }, title: { fontSize: 23, fontWeight: '800', color: '#193B63' }, caption: { fontSize: 12, lineHeight: 20, color: '#7D8EA4' }, body: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 18, gap: 15, paddingBottom: 30 }, hero: { backgroundColor: '#EAF3FF', borderRadius: 24, padding: 22, gap: 12, borderWidth: 1, borderColor: '#D8E7FC' }, eyebrow: { fontSize: 10, letterSpacing: 2, fontWeight: '800', color: '#3B8BE8' }, english: { fontSize: 25, lineHeight: 36, fontWeight: '800', color: '#153C6C' }, translation: { fontSize: 17, lineHeight: 27, color: '#41678C' }, sound: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', minHeight: 42 }, section: { padding: 18, borderRadius: 22, borderWidth: 1, borderColor: '#E0EAF6', backgroundColor: '#FFFFFF', gap: 16 }, sectionTitle: { fontSize: 17, fontWeight: '800', color: '#1E446F' }, paragraph: { fontSize: 14, lineHeight: 24, color: '#4C647F' }, muted: { fontSize: 13, lineHeight: 21, color: '#73869D' }, row: { flexDirection: 'row', gap: 9, alignItems: 'center', flexWrap: 'wrap' }, fragment: { fontSize: 17, lineHeight: 25, fontWeight: '700', color: '#216FC0' }, tag: { fontSize: 11, lineHeight: 18, color: '#7868A1', backgroundColor: '#F0EDFA', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, overflow: 'hidden' }, part: { borderLeftWidth: 3, borderColor: '#A7D1FB', paddingLeft: 13, gap: 7 }, strong: { fontSize: 14, fontWeight: '700', color: '#30567C' }, word: { gap: 4, borderTopWidth: 1, borderColor: '#EDF2F8', paddingTop: 13 }, wordTitle: { fontSize: 20, fontWeight: '800', color: '#1E66AE' }, inset: { gap: 9, padding: 13, backgroundColor: '#F6F9FD', borderRadius: 13 }, example: { padding: 13, borderRadius: 14, backgroundColor: '#F3F8FF', gap: 7 }, smallEnglish: { fontSize: 15, lineHeight: 23, fontWeight: '600', color: '#31577F' }, action: { minHeight: 42, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 13, backgroundColor: '#EDF4FE', borderWidth: 1, borderColor: '#D9E7FA', justifyContent: 'center', alignItems: 'center' }, primary: { backgroundColor: '#1978ED', borderColor: '#1978ED' }, actionText: { fontSize: 13, fontWeight: '700', color: '#286EBB' }, footer: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 24, borderTopWidth: 1, borderColor: '#DFEAF6', backgroundColor: '#FFFFFF' }, loading: { padding: 20, gap: 12, alignItems: 'center' }, error: { padding: 15, borderRadius: 16, backgroundColor: '#FFF6ED', gap: 11 }, errorText: { color: '#AF6836', fontSize: 13, lineHeight: 22 },
});
