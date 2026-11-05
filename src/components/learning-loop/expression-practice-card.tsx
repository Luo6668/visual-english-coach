import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { BookmarkPlus, Check, Repeat2, Volume2 } from 'lucide-react-native';
import { useSession } from '@/ctx';
import { matchesPractice, normalizeExpression, type ExpressionFeedback } from '@/lib/learning-loop/model';
import { saveReviewExpression, useReviewQueue } from '@/lib/learning-loop/store';
import { PracticeInput } from './practice-input';
import { LearningAction as Action } from './learning-action';
/** M3: no dependency on conversation help/network state. */
export function ExpressionPracticeCard({ feedback, scene, sourceMethod, turnAssisted, disabled, active, onSpeak, onPracticeBusyChange, onPracticeActiveChange, inline = false }: {
  feedback: ExpressionFeedback; scene: string; inline?: boolean; sourceMethod?: 'typed' | 'voice'; turnAssisted: boolean;
  disabled: boolean; active: boolean; onSpeak: (text: string) => void;
  onPracticeBusyChange?: (busy: boolean) => void; onPracticeActiveChange?: (active: boolean) => void;
}) {
  const { session } = useSession();
  const owner = session?.user.id || '';
  const [practice, setPractice] = useState(false);
  const [practiceBusy, setPracticeBusy] = useState(false);
  const [attempt, setAttempt] = useState('');
  const [method, setMethod] = useState<'typed' | 'voice'>('typed');
  const [check, setCheck] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const saveLock = useRef(false);
  const target = feedback.suggestion || feedback.original;
  const reviewQueue = useReviewQueue(owner);
  const isSaved = saved || reviewQueue.items.some(item => normalizeExpression(item.target) === normalizeExpression(target));
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (!active) setPractice(false); }, [active]);
  useEffect(() => { onPracticeActiveChange?.(practice); return () => onPracticeActiveChange?.(false); }, [practice, onPracticeActiveChange]);
  const save = async () => {
    if (saveLock.current || !target || !owner) return;
    saveLock.current = true; setSaving(true); setError('');
    try {
      await saveReviewExpression(owner, { target, original: feedback.original, explanation: feedback.explanation, scene, source: 'feedback', cue: feedback.translation || '' });
      if (alive.current) setSaved(true);
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : '保存失败，表达仍保留在这里'); }
    finally { saveLock.current = false; if (alive.current) setSaving(false); }
  };
  return <View style={{ padding: inline ? 12 : 16, gap: 11, borderRadius: inline ? 14 : 20, borderWidth: 1, borderColor: feedback.kind === 'correction' ? '#F2D5BF' : '#CCE4DD', backgroundColor: feedback.kind === 'correction' ? '#FFF8F0' : '#F0FAF6' }}>
      {!inline ? <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><Check size={17} color="#149C75" /><Text style={{ fontWeight: '800', fontSize: 14, color: '#173D37' }}>{feedback.kind === 'correction' ? '这一处可以修改' : feedback.kind === 'natural' ? '能沟通，也可以说得更自然' : '这次表达无需修改'}</Text></View>
      <Text style={{ color: '#7B8896', fontSize: 12 }}>你的原句 · {sourceMethod === 'voice' ? '语音识别' : '文字输入'}{turnAssisted ? ' · 使用过提示' : ''}</Text>
      <Text style={{ color: '#516879', fontSize: 14, lineHeight: 21 }}>{feedback.original}</Text>
      </> : null}
      {feedback.suggestion ? <Text style={{ fontWeight: '700', fontSize: 17, lineHeight: 25, color: '#143F60' }}>{feedback.suggestion}</Text> : null}
      <Text style={{ fontSize: 12, lineHeight: 20, color: '#567263' }}>{feedback.explanation}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}><Action label="听这句" disabled={practiceBusy} icon={Volume2} onPress={() => onSpeak(target)} /><Action label={practice ? '收起重说' : '练这句'} disabled={disabled} icon={Repeat2} onPress={() => { setPractice(value => !value); setCheck(''); }} /><Action label={isSaved ? '已加入复习' : saving ? '正在保存…' : '加入复习'} icon={BookmarkPlus} disabled={isSaved || saving || !owner} onPress={() => void save()} /></View>
      {practice ? <View style={{ gap: 9, paddingTop: 8 }}>
        <Text style={{ fontSize: 12, color: '#5E7489' }}>录音或输入重说，不会发进主对话。已经展示练习句，本次属于有提示练习。</Text>
        <PracticeInput value={attempt} onBusyChange={busy => { setPracticeBusy(busy); onPracticeBusyChange?.(busy); }} onChange={(text, source) => { setAttempt(text); setMethod(source); setCheck(''); }} />
        <Action label="检查这次表达" disabled={practiceBusy} onPress={() => setCheck(!attempt.trim() ? '请先录音或输入一句英语' : matchesPractice(target, attempt) ? `${method === 'voice' ? '识别文字' : '输入文字'}与练习句一致。可以稍后在复习夹里不看答案再试。` : '和练习句还不一致；其他说法也可能正确，可以听一遍后再试。')} />
        {check ? <Text accessibilityLiveRegion="polite" style={{ color: '#386883', fontSize: 12, lineHeight: 19 }}>{check}</Text> : null}
        <Text style={{ fontSize: 10, color: '#8392A1' }}>这里只核对文字，不评估发音、重音或流利度。</Text>
      </View> : null}
      {error ? <Text accessibilityRole="alert" style={{ color: '#A14C18', fontSize: 12, lineHeight: 19 }}>{error} · 可再次点击加入复习</Text> : null}
      <Text style={{ fontSize: 10, color: '#819A8E' }}>AI 辅助建议，可能有误。复习保存在当前账号的此设备中。</Text>
    </View>;
}
