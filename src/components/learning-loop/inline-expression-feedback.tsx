import { useState } from 'react';
import { ChevronDown } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { MotionPressable } from '@/components/motion-pressable';
import { feedbackLabel } from '@/lib/learning-loop/presentation';
import type { FeedbackRecord } from './learning-companion';
import { ExpressionPracticeCard } from './expression-practice-card';
export function InlineExpressionFeedback({ record, scene, disabled, active = true, onRequest, onSpeak, onPracticeBusyChange, onPracticeActiveChange, onInteract, expanded: open, onToggle }: {
  expanded: boolean; onToggle: () => void;
  record?: FeedbackRecord; scene: string; disabled: boolean; active?: boolean; onRequest: () => void; onSpeak: (text: string) => void;
  onPracticeBusyChange: (busy: boolean) => void; onPracticeActiveChange: (active: boolean) => void; onInteract: () => void;
}) {
  const [requested, setRequested] = useState(false);
  if (!record) return <MotionPressable accessibilityRole="button" accessibilityLabel="查看这句的表达建议" disabled={disabled} onPress={() => { setRequested(true); onRequest(); }} style={{ minHeight: 30, alignSelf: 'flex-end', justifyContent: 'center', paddingHorizontal: 3 }}><Text style={{ fontSize: 10, color: '#8B9CB1' }}>查看建议</Text></MotionPressable>;
  const label = feedbackLabel(record.feedback);
  if (!label) return requested ? <Text accessibilityLiveRegion="polite" style={{ color: '#7A998D', fontSize: 10, textAlign: 'right', marginTop: 5 }}>这句无需修改</Text> : null;
  return <View style={{ marginTop: 5, gap: 6 }}>
    <MotionPressable accessibilityRole="button" accessibilityLabel={open ? '收起这句建议' : '展开这句建议'} accessibilityState={{ expanded: open }} onPress={() => { onInteract(); onToggle(); }} style={{ paddingVertical: 6, gap: 4 }}><View style={{ flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'flex-end' }}><Text style={{ fontSize: 11, color: record.feedback.kind === 'correction' ? '#A66B3A' : '#598577' }}>{label}</Text><ChevronDown size={12} color="#8A9BB0" style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} /></View>{!open && record.feedback.kind === 'correction' ? <Text style={{ color: '#4F6D89', fontSize: 12, lineHeight: 19 }}>{record.feedback.suggestion}</Text> : null}</MotionPressable>
    {open ? <ExpressionPracticeCard inline feedback={record.feedback} scene={scene} sourceMethod={record.turn.method} turnAssisted={record.assisted} disabled={disabled} active={active} onSpeak={onSpeak} onPracticeBusyChange={onPracticeBusyChange} onPracticeActiveChange={onPracticeActiveChange} /> : null}
  </View>;
}
