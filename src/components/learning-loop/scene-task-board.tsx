import { useState } from 'react';
import { Text, View } from 'react-native';
import { Check, ChevronDown, Target } from 'lucide-react-native';
import { MotionPressable } from '@/components/motion-pressable';
import type { TaskEvidence, TaskGoal } from '@/lib/learning-loop/model';
export function SceneTaskBoard({ tasks, evidence = [], preparation = false }: { tasks: TaskGoal[]; evidence?: TaskEvidence[]; preparation?: boolean }) {
  const [expanded, setExpanded] = useState(preparation);
  const [open, setOpen] = useState<string | null>(null);
  return <View style={{ padding: preparation ? 15 : 10, gap: expanded ? 10 : 0, borderRadius: preparation ? 20 : 14, backgroundColor: '#F0F7FF', borderWidth: 1, borderColor: '#D8E9FF' }}>
    <MotionPressable accessibilityRole="button" accessibilityLabel={preparation ? "本次准备目标" : expanded ? "收起本次目标" : "展开本次目标"} accessibilityState={{ expanded }} disabled={preparation} onPress={() => setExpanded(value => !value)} style={{ minHeight: 26, flexDirection: 'row', gap: 8, alignItems: 'center' }}><Target size={17} color="#1677EF" /><Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: '#123055' }}>{preparation ? '这次练会三件事' : '本次沟通目标'}</Text><Text style={{ fontSize: 12, color: '#1677EF' }}>{evidence.length}/{tasks.length}</Text>{!preparation ? <ChevronDown size={13} color="#8A9BB0" style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }} /> : null}</MotionPressable>
    {expanded ? <>
    {tasks.map((task, index) => {
      const done = evidence.find(item => item.id === task.id);
      return <View key={task.id}><MotionPressable accessibilityRole="button" accessibilityLabel={`${task.label}${done ? '，查看原句' : '，待练习'}`} onPress={() => setOpen(open === task.id ? null : task.id)} style={{ flexDirection: 'row', gap: 9, alignItems: 'center', minHeight: 32 }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: done ? '#18A878' : '#DFEBFA', alignItems: 'center', justifyContent: 'center' }}>{done ? <Check size={14} color="white" /> : <Text style={{ fontSize: 11, color: '#547296' }}>{index + 1}</Text>}</View><Text style={{ flex: 1, fontSize: 13, color: '#24405E' }}>{task.label}</Text><ChevronDown size={13} color="#7891AB" />
      </MotionPressable>{open === task.id ? <Text style={{ paddingLeft: 31, color: '#58728D', fontSize: 12, lineHeight: 19 }}>{done ? `你的原句：“${done.evidence}”` : '在对话里用自己的话表达，AI 会尝试根据原句确认。'}</Text> : null}</View>;
    })}
    <Text style={{ fontSize: 10, lineHeight: 15, color: '#71849B' }}>{preparation ? '所有场景开放。可以先看关键词，再自己开口。' : 'AI 辅助确认，可能有误；目标与对话轮次分别记录，不代表发音或能力评分。'}</Text>
    </> : null}
  </View>;
}
