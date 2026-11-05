import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Bookmark, Check } from 'lucide-react-native';
import { useSession } from '@/ctx';
import { MotionPressable } from '@/components/motion-pressable';
import { createSentence, fetchSentences } from '@/lib/api';
import { normalizeExpression } from '@/lib/learning-loop/model';
import { expressionChoices } from '@/lib/learning-loop/presentation';
import { saveReviewExpression, useReviewQueue } from '@/lib/learning-loop/store';

export function MessageExpressionSave({ text, scene, onInteract }: { text: string; scene: string; onInteract?: () => void }) {
  const { session } = useSession();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const [translation, setTranslation] = useState('');
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const reviewQueue = useReviewQueue(session?.user.id);
  const isReviewed = reviewed || Boolean(selected && reviewQueue.items.some(item => normalizeExpression(item.target) === normalizeExpression(selected)));
  const [error, setError] = useState('');
  const lock = useRef(false);
  const alive = useRef(true);
  const currentOwner = useRef(session?.user.id); currentOwner.current = session?.user.id;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const choices = open ? expressionChoices(text) : [];
  const save = async (sentence: string) => {
    const owner = session?.user.id;
    if (lock.current || !owner) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const rows = await fetchSentences();
      if (!alive.current || owner !== currentOwner.current) return;
      const existing = rows.find(row => normalizeExpression(row.sentence || '') === normalizeExpression(sentence));
      if (!existing) await createSentence({ sentence });
      if (!alive.current || owner !== currentOwner.current) return;
      setTranslation(existing?.translation || ''); setSelected(sentence); setReviewed(false); setOpen(false);
    } catch { if (alive.current) setError('收藏没有保存成功，请再选一次重试'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const addReview = async () => {
    if (lock.current || !session?.user.id) return;
    lock.current = true; setBusy(true); setError('');
    try { await saveReviewExpression(session.user.id, { target: selected, original: selected, explanation: translation, cue: translation, scene, source: 'saved' }); if (alive.current) setReviewed(true); }
    catch { if (alive.current) setError('表达已收藏，加入复习失败，请重试'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  return <View style={{ marginTop: 5, gap: 6 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <MotionPressable accessibilityRole="button" accessibilityLabel={open ? '收起表达选择' : '收藏这条回复中的表达'} accessibilityState={{ expanded: open }} disabled={busy} onPress={() => { onInteract?.(); setOpen(value => !value); }} style={{ minHeight: 32, paddingHorizontal: 5, flexDirection: 'row', gap: 5, alignItems: 'center' }}>
        {busy ? <ActivityIndicator size="small" color="#7187A4" /> : selected ? <Check size={14} color="#168A68" /> : <Bookmark size={14} color="#7187A4" />}<Text style={{ fontSize: 11, color: selected ? '#168A68' : '#7187A4' }}>{selected ? '已保存到表达本' : '收藏表达'}</Text>
      </MotionPressable>
      {selected ? <MotionPressable accessibilityRole="button" accessibilityLabel={isReviewed ? '这句已加入复习' : '也加入复习'} disabled={busy || isReviewed} onPress={() => void addReview()} style={{ minHeight: 32, justifyContent: 'center' }}><Text style={{ fontSize: 11, color: '#1677DE' }}>{isReviewed ? '已加入复习' : '也加入复习'}</Text></MotionPressable> : null}
    </View>
    {open ? <View style={{ padding: 10, gap: 2, borderRadius: 14, backgroundColor: '#FFFFFFCE', borderWidth: 1, borderColor: '#E1EAF5' }}><Text style={{ color: '#8291A4', fontSize: 11, marginBottom: 3 }}>选一句保存到表达本</Text>{choices.length ? choices.map(sentence => <MotionPressable key={sentence} accessibilityRole="button" accessibilityLabel={`收藏表达 ${sentence}`} disabled={busy} onPress={() => void save(sentence)} style={{ paddingVertical: 10, minHeight: 40 }}><Text style={{ color: '#284A70', lineHeight: 21, fontSize: 13 }}>{sentence}</Text></MotionPressable>) : <Text style={{ color: '#7A8CA3', lineHeight: 20, fontSize: 12 }}>这条回复没有可直接收藏的完整英语句子。</Text>}</View> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: '#AE6236', fontSize: 11, lineHeight: 18 }}>{error}</Text> : null}
  </View>;
}
