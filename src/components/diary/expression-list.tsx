import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MotionPressable } from '@/components/motion-pressable';
import { createSentence, fetchSentences } from '@/lib/api';
import { normalizeExpression } from '@/lib/learning-loop/model';
import type { Expression } from '@/lib/diary/use-diary-editor';
export function DiaryExpressions({ items, onSpeak }: { items: Expression[]; onSpeak: (text: string, id: string) => void }) {
  const router = useRouter(); const [open, setOpen] = useState(false); const [saved, setSaved] = useState<string[]>([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(''); const lock = useRef(false);
  const collect = async (item: Expression) => {
    if (lock.current) return; lock.current = true; setBusy(item.english); setError('');
    try { const rows = await fetchSentences(); if (!rows.some(row => normalizeExpression(row.sentence) === normalizeExpression(item.english))) await createSentence({ sentence: item.english, translation: item.chinese }); setSaved(value => [...value, item.english]); }
    catch { setError('表达暂未收藏，请重试'); } finally { lock.current = false; setBusy(''); }
  };
  if (!items.length) return null;
  return <View style={{ gap: 12, paddingTop: 6 }}><MotionPressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={open ? '收起日记实用表达' : '展开日记实用表达'} onPress={() => setOpen(value => !value)} style={{ paddingVertical: 13 }}><Text style={{ fontSize: 14, fontWeight: '700', color: '#4070A6' }}>从这篇日记学表达 · {items.length} 条  {open ? '−' : '+'}</Text></MotionPressable>{open ? items.map((item, i) => <View key={item.english} style={{ padding: 16, backgroundColor: '#EFF6FF', borderRadius: 16, gap: 8 }}><Text selectable style={{ fontSize: 16, fontWeight: '700', color: '#275C92', lineHeight: 25 }}>{item.english}</Text><Text style={{ fontSize: 14, color: '#54728E', lineHeight: 23 }}>{item.chinese}</Text><Text style={{ fontSize: 12, color: '#7A8EA4', lineHeight: 21 }}>{item.note}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 15 }}>{[[`朗读表达 ${i + 1}`, '听发音', () => onSpeak(item.english, `expression-${i}`)], [`收藏日记表达 ${i + 1}`, saved.includes(item.english) ? '已收藏' : busy === item.english ? '收藏中…' : '收藏表达', () => void collect(item)], [`查看日记表达详解 ${i + 1}`, '看用法与拓展', () => router.push({ pathname: '/(app)/sentence-detail', params: { sentence: item.english } } as any)]].map(([label, title, action]) => <MotionPressable key={String(label)} accessibilityRole="button" accessibilityLabel={String(label)} disabled={String(label).startsWith('收藏') && (Boolean(busy) || saved.includes(item.english))} onPress={action as () => void} style={{ minHeight: 42, justifyContent: 'center' }}><Text style={{ color: '#237CD8', fontSize: 12, fontWeight: '700' }}>{String(title)}</Text></MotionPressable>)}</View></View>) : null}{error ? <Text accessibilityRole="alert" style={{ color: '#B85D3C', fontSize: 13 }}>{error}</Text> : null}</View>;
}
