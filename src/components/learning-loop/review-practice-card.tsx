import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Check, Lightbulb } from 'lucide-react-native';
import { MotionPressable } from '@/components/motion-pressable';
import { requestLearningAssist } from '@/lib/learning-loop/assistant';
import type { ExpressionFeedback, ReviewAttempt, ReviewItem } from '@/lib/learning-loop/model';
import { reviewDelay, reviewKeywords, reviewOutcome, reviewOutcomeLabel, reviewPrompt } from '@/lib/learning-loop/review-practice';
import { PracticeInput } from './practice-input';

export function ReviewButton({ label, onPress, disabled = false, primary = false, selected = false }: {
  label: string; onPress: () => void; disabled?: boolean; primary?: boolean; selected?: boolean;
}) {
  return <MotionPressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, ...(selected ? { selected: true } : {}) }} disabled={disabled} onPress={onPress}
    style={{ opacity: disabled ? 0.45 : 1, minHeight: 44, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: primary ? '#1677F0' : selected ? '#DCEBFF' : '#F1F6FC', borderWidth: 1, borderColor: primary ? '#1677F0' : selected ? '#79B4FA' : '#DFE9F5' }}>
    <Text style={{ fontWeight: '700', color: primary ? '#FFFFFF' : '#315E8A', fontSize: 13 }}>{label}</Text>
  </MotionPressable>;
}
const noteStyle = { fontSize: 12, color: '#71839A', lineHeight: 20 };
const dateLabel = (at: string) => new Date(at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** One round: explicit task → attempt → optional reference/advice → durable record. */
export function ReviewPracticeCard({ item, busy, onSave, onCue, onSpeak, onNext, onInteractionBusy }: {
  item: ReviewItem; busy: boolean; onSave: (attempt: ReviewAttempt) => Promise<ReviewItem>;
  onCue: (cue: string) => Promise<void>; onSpeak: (text: string) => void; onNext: () => void;
  onInteractionBusy: (busy: boolean) => void;
}) {
  const [prompt] = useState(() => reviewPrompt(item));
  const [referenceViewed, setReferenceViewed] = useState(prompt.mode === 'familiarize');
  const [referenceOpen, setReferenceOpen] = useState(prompt.mode === 'familiarize');
  const [keywordsViewed, setKeywordsViewed] = useState(false);
  const [attempt, setAttempt] = useState('');
  const [method, setMethod] = useState<'typed' | 'voice'>('typed');
  const [submitted, setSubmitted] = useState(false);
  const [submittedAssistance, setSubmittedAssistance] = useState<Pick<ReviewAttempt, 'mode' | 'keywordsViewed' | 'referenceViewed'> | null>(null);
  const [referenceAfterAttempt, setReferenceAfterAttempt] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [effort, setEffort] = useState<ReviewAttempt['effort']>();
  const [feedback, setFeedback] = useState<ExpressionFeedback | null>(null);
  const [checking, setChecking] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');
  const [error, setError] = useState('');
  const [cueOpen, setCueOpen] = useState(false);
  const [cue, setCue] = useState('');
  const [cueSaved, setCueSaved] = useState(false);
  const [done, setDone] = useState<{ item: ReviewItem; round: ReviewAttempt } | null>(null);
  const saving = useRef(false);
  const operation = useRef(0);
  const alive = useRef(true);
  const roundId = useRef(`attempt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const pendingRecord = useRef<ReviewAttempt | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; operation.current++; }; }, []);
  useEffect(() => { onInteractionBusy(recordingBusy || checking); return () => onInteractionBusy(false); }, [recordingBusy, checking, onInteractionBusy]);
  const assistance = submittedAssistance || { mode: prompt.mode, keywordsViewed, referenceViewed };
  const plannedDelay = reviewDelay(item, { outcome: reviewOutcome(assistance), effort });
  const blocked = busy || recordingBusy || checking;
  const hasEnglish = /[a-z]/i.test(attempt.trim());
  const keywords = reviewKeywords(item.target);
  const showReference = () => { setReferenceViewed(true); setReferenceOpen(value => !value); };
  const resetRecord = () => { pendingRecord.current = null; };
  const feedbackRequest = async () => {
    if (checking || !submitted) return;
    const id = ++operation.current;
    setChecking(true); setFeedbackError('');
    try {
      const result = await requestLearningAssist({ action: 'feedback', text: attempt.trim(), scene: `${item.scene}；本次表达意图：${prompt.task || item.cue || '熟悉收藏表达'}。收藏参考仅为一种说法，不要求逐字相同。只检查用户表达，不推断发音或掌握程度。`, partner: '', tasks: [] });
      if (alive.current && id === operation.current) {
        if (!result.feedback || result.feedback.original !== attempt.trim()) throw new Error('表达建议暂未返回有效内容，请重试');
        setFeedback(result.feedback);
        if (result.feedback.suggestion) { setReferenceViewed(true); setReferenceAfterAttempt(true); }
      }
    } catch (e) { if (alive.current && id === operation.current) setFeedbackError(e instanceof Error ? e.message : '表达建议暂不可用，可以直接记录这次练习'); }
    finally { if (alive.current && id === operation.current) setChecking(false); }
  };
  const finish = async (skip = false) => {
    if (saving.current || blocked || (!skip && (!submitted || !hasEnglish))) return;
    saving.current = true; setError('');
    // Retry an unsuccessful write with the same event ID, never count one click twice.
    const record: ReviewAttempt = pendingRecord.current || {
      id: roundId.current, at: new Date().toISOString(), text: attempt.trim(), method: skip && !attempt.trim() ? 'none' : method,
      ...assistance, referenceAfterAttempt, task: prompt.task || item.cue || '',
      outcome: skip ? 'skipped' : reviewOutcome(assistance), ...(skip || !effort ? {} : { effort }),
    };
    pendingRecord.current = record;
    try {
      const updated = await onSave(record);
      if (alive.current) setDone({ item: updated, round: record });
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : '记录未保存，输入仍保留，请重试'); }
    finally { saving.current = false; }
  };
  const saveCue = async () => {
    if (blocked || saving.current) return;
    saving.current = true; setError('');
    try { await onCue(cue); if (alive.current) { setCueOpen(false); setCueSaved(true); } }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : '情境未保存，请重试'); }
    finally { saving.current = false; }
  };

  if (done) return <View style={{ padding: 22, gap: 15, borderRadius: 26, backgroundColor: '#F1FBF7', borderWidth: 1, borderColor: '#CDEBDC' }}>
    <Check size={25} color="#159375" /><Text accessibilityLiveRegion="polite" style={{ fontSize: 22, fontWeight: '800', color: '#184D40' }}>{done.round.outcome === 'skipped' ? '这条先放一放' : '这次尝试已记录'}</Text>
    <Text style={{ color: '#477365', fontWeight: '600' }}>{reviewOutcomeLabel[done.round.outcome]} · {done.round.method === 'voice' ? '语音识别文字' : done.round.method === 'none' ? '未提交表达' : '文字输入'}</Text>
    {done.round.text ? <Text style={{ fontSize: 18, lineHeight: 27, color: '#234B43' }}>{done.round.text}</Text> : null}
    <Text style={noteStyle}>{done.round.outcome === 'skipped' ? '没有增加练习次数，也没有改变原复习时间。' : `下次复习：${dateLabel(done.item.dueAt)}。这是复习安排，不是能力评级。`}</Text>
    <ReviewButton label="继续下一条" primary onPress={onNext} />
  </View>;

  return <View style={{ gap: 16, borderRadius: 26, padding: 21, borderWidth: 1, borderColor: '#D5E8FF', backgroundColor: '#FFFFFFED', shadowColor: '#6589B7', shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1.5, color: '#1677EF' }}>SAY IT YOUR WAY</Text><Text style={noteStyle}>{prompt.mode === 'task' ? '情境表达' : '跟读熟悉'}</Text></View>
    <View style={{ gap: 6 }}><Text style={{ fontSize: 23, fontWeight: '800', color: '#123358' }}>{item.scene || '我的生活表达'}</Text><Text style={noteStyle}>{item.source === 'feedback' ? '来自你的对话表达' : '来自你的表达本收藏'} · 不必复述成完全相同的一句</Text></View>
    {prompt.task ? <View style={{ padding: 16, gap: 7, borderRadius: 18, backgroundColor: '#F0F3FF', borderWidth: 1, borderColor: '#E1E6FA' }}><Text style={{ fontSize: 11, color: '#776C9A' }}>{prompt.label}</Text><Text style={{ fontSize: 18, fontWeight: '600', lineHeight: 28, color: '#3C3D65' }}>{prompt.task}</Text><Text style={noteStyle}>用你自己的英语表达这个意思，可以有不同说法。</Text></View> : <Text style={noteStyle}>这条收藏还没有足够的情境信息，先看原句、听一遍，再跟读或输入练习。不会要求你猜要说什么。</Text>}

    {prompt.mode === 'task' && !submitted ? <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{keywords.length ? <ReviewButton label={keywordsViewed ? '已查看关键词' : '给我关键词'} disabled={blocked || keywordsViewed} onPress={() => { resetRecord(); setKeywordsViewed(true); }} /> : null}<ReviewButton label={referenceOpen ? '收起参考说法' : referenceViewed ? '再看参考说法' : '查看参考说法'} disabled={blocked} onPress={() => { resetRecord(); showReference(); }} /></View>
      {keywordsViewed ? <View style={{ flexDirection: 'row', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}><Lightbulb size={15} color="#A3813D" /><Text style={{ color: '#8E713C', fontSize: 14 }}>{keywords.join(' · ')}</Text><Text style={noteStyle}>来自收藏参考句</Text></View> : null}
    </View> : null}
    {referenceOpen ? <View style={{ gap: 10, padding: 16, borderRadius: 18, backgroundColor: '#EAF5FF' }}>
      <Text style={{ fontSize: 11, color: '#6185A7' }}>一种参考说法 · 其他合理表达也可以</Text><Text style={{ fontSize: 20, lineHeight: 29, fontWeight: '700', color: '#163A65' }}>{item.target}</Text>
      {item.explanation ? <Text style={{ color: '#587693', fontSize: 13, lineHeight: 21 }}>{item.explanation}</Text> : null}
      <ReviewButton label="听参考说法" disabled={recordingBusy || busy} onPress={() => { setReferenceViewed(true); onSpeak(item.target); }} />
    </View> : null}

    {!submitted ? <View style={{ gap: 10 }}><Text style={{ fontSize: 14, fontWeight: '700', color: '#23486D' }}>{prompt.mode === 'task' ? '现在，试着表达' : '听过以后，自己练一遍'}</Text><PracticeInput value={attempt} disabled={busy} onBusyChange={setRecordingBusy} onChange={(text, source) => { resetRecord(); setAttempt(text.slice(0, 1200)); setMethod(source); setError(''); }} /><ReviewButton label="完成这次尝试" primary disabled={blocked || !hasEnglish} onPress={() => { resetRecord(); setSubmittedAssistance({ mode: prompt.mode, keywordsViewed, referenceViewed }); setSubmitted(true); setError(''); }} /></View> : <View style={{ gap: 12, paddingTop: 3 }}>
      <Text style={{ fontSize: 12, color: '#70879D' }}>你这次的表达 · {method === 'voice' ? '语音识别文字，可返回修改' : '文字输入'}</Text><Text style={{ fontSize: 19, lineHeight: 28, color: '#214D76' }}>{attempt}</Text>
      <View style={{ gap: 8, flexDirection: 'row', flexWrap: 'wrap' }}><ReviewButton label="修改这次表达" disabled={blocked} onPress={() => { operation.current++; resetRecord(); setSubmitted(false); setSubmittedAssistance(null); setReferenceAfterAttempt(false); setFeedback(null); setFeedbackError(''); }} /><ReviewButton label={checking ? '正在查看表达…' : feedbackError ? '重试表达建议' : '看看表达建议'} disabled={blocked || Boolean(feedback)} onPress={() => void feedbackRequest()} /><ReviewButton label={referenceOpen ? '收起参考说法' : '看看参考说法'} disabled={blocked} onPress={() => { resetRecord(); if (!referenceOpen) setReferenceAfterAttempt(true); showReference(); }} /></View>
      {feedback ? <View style={{ gap: 7, padding: 14, backgroundColor: '#F1F8F5', borderRadius: 15 }}><Text style={{ color: '#35765B', fontWeight: '700' }}>{feedback.kind === 'none' ? '这句暂未发现明显的表达问题' : feedback.kind === 'natural' ? '也可以这样说得更自然' : '这一处可以调整'}</Text>{feedback.suggestion ? <Text style={{ color: '#315B68', lineHeight: 24, fontSize: 16 }}>{feedback.suggestion}</Text> : null}{feedback.explanation ? <Text style={noteStyle}>{feedback.explanation}</Text> : null}<Text style={noteStyle}>AI 表达建议可能有误，不代表任务达标或发音评分。</Text></View> : null}
      {feedbackError ? <Text accessibilityRole="alert" style={{ color: '#AA683C', fontSize: 12, lineHeight: 20 }}>{feedbackError} · 可重试，也可以直接保存练习。</Text> : null}
      <View style={{ gap: 8 }}><Text style={{ color: '#5D738A', fontSize: 12 }}>说起来感觉怎么样？（可选，只用于调整复习时间）</Text><View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap' }}>{([{ value: 'easy', label: '比较顺畅' }, { value: 'effortful', label: '有点费力' }, { value: 'again', label: '稍后再练' }] as const).map(option => <ReviewButton key={option.value} label={option.label} disabled={blocked} selected={effort === option.value} onPress={() => { resetRecord(); setEffort(effort === option.value ? undefined : option.value); }} />)}</View></View>
      <Text style={noteStyle}>{reviewOutcomeLabel[reviewOutcome(assistance)]}{referenceAfterAttempt ? ' · 提交后查看了参考' : ''} · 下次安排：{plannedDelay < 86_400_000 ? '约 30 分钟后' : `${plannedDelay / 86_400_000} 天后`}。仅记录练习方式，不自动判定掌握。</Text>
      <ReviewButton label={busy ? '正在保存…' : '记录这次练习'} disabled={blocked} primary onPress={() => void finish()} />
    </View>}
    {error ? <Text accessibilityRole="alert" style={{ fontSize: 12, lineHeight: 20, color: '#AD542F' }}>{error}</Text> : null}
    {!submitted ? <ReviewButton label="这条先跳过" disabled={blocked} onPress={() => void finish(true)} /> : null}
    {prompt.mode === 'familiarize' ? <View style={{ paddingTop: 10, gap: 9, borderTopWidth: 1, borderColor: '#EDF1F7' }}>
      {cueSaved || item.cue ? <Text style={noteStyle}>情境已补充，下次可按情境练习；本次已看参考，仍记为熟悉练习。</Text> : <ReviewButton label={cueOpen ? '收起情境编辑' : '补充下次练习的情境'} disabled={blocked} onPress={() => setCueOpen(value => !value)} />}
      {cueOpen ? <><TextInput accessibilityLabel="复习情境" placeholder="例如：在咖啡馆点一杯拿铁外带" value={cue} onChangeText={setCue} maxLength={600} multiline editable={!busy} style={{ padding: 12, borderRadius: 12, minHeight: 70, color: '#24476C', borderWidth: 1, borderColor: '#D4E3F4', backgroundColor: '#FFFFFF' }} /><ReviewButton label="保存练习情境" disabled={blocked || !cue.trim()} onPress={() => void saveCue()} /></> : null}
    </View> : null}
  </View>;
}
