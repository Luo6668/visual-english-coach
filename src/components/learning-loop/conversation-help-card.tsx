import { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Lightbulb, Volume2, X } from 'lucide-react-native';
import type { AssistAction } from '@/lib/learning-loop/assistant';
import { MotionPressable } from '@/components/motion-pressable';
import { LearningAction as Action } from './learning-action';
/** A composer tool: collapsed by default; never adds a message or opens another modal. */
export function ConversationHelpCard({ hint, busy, disabled, partner, error, canRetry, open, onToggle, onClose, onAction, onRetry, onSpeak, hidden = false }: {
  hint: string; busy: boolean; disabled: boolean; partner: string; error: string; canRetry: boolean; open: boolean;
  onToggle: () => void; onClose: () => void; onAction: (action: AssistAction) => void; onRetry: () => void; onSpeak: (text: string) => void; hidden?: boolean;
}) {
  const trigger = useRef<View>(null);
  useEffect(() => {
    if (process.env.EXPO_OS !== 'web' || !open || hidden) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onClose(); (trigger.current as unknown as HTMLElement)?.focus?.(); } };
    document.addEventListener('keyup', escape, true);
    return () => document.removeEventListener('keyup', escape, true);
  }, [open, onClose, hidden]);
  if (hidden) return null;
  return <View style={{ paddingHorizontal: 18, paddingTop: 3, paddingBottom: 4, backgroundColor: '#FFFFFF' }}>
    <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={open ? '收起对话提示' : '打开对话提示'} accessibilityState={{ expanded: open }} disabled={disabled && !open} onPress={onToggle} style={{ alignSelf: 'flex-start', minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 }}><Lightbulb size={16} color="#6683A4" /><Text style={{ color: '#6683A4', fontSize: 12 }}>{open ? '收起提示' : '提示'}</Text>{error && !open ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#CF8A53' }} /> : null}</Pressable>
    {open ? <View style={{ borderRadius: 17, borderWidth: 1, borderColor: '#DDE9F7', backgroundColor: '#F4F8FEEB', marginBottom: 5 }}>
      <View style={{ paddingHorizontal: 12, paddingTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ fontSize: 11, color: '#7D8FA5' }}>需要哪种帮助？</Text><MotionPressable accessibilityRole="button" accessibilityLabel="关闭提示工具" onPress={onClose} style={{ padding: 7 }}><X size={15} color="#7D8FA5" /></MotionPressable></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingBottom: 10 }}><Action label="给我关键词" disabled={busy || disabled} onPress={() => onAction('keywords')} /><Action label="看参考回答" disabled={busy || disabled} onPress={() => onAction('example')} /><Action label="对方说简单些" disabled={busy || disabled || !partner} onPress={() => onAction('simplify')} /></View>
      <ScrollView style={{ maxHeight: 150 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 13, paddingBottom: hint || error || busy ? 12 : 0, gap: 8 }}>
        {busy ? <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><ActivityIndicator size="small" color="#1677EF" /><Text accessibilityLiveRegion="polite" style={{ fontSize: 12, color: '#71869E' }}>正在准备提示…</Text></View> : null}
        {hint ? <><Text style={{ color: '#294B6F', fontSize: 14, lineHeight: 22 }}>{hint}</Text><View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><MotionPressable accessibilityRole="button" accessibilityLabel="朗读提示" onPress={() => onSpeak(hint)} style={{ paddingVertical: 7 }}><Volume2 size={15} color="#397CCB" /></MotionPressable><Text style={{ color: '#8797AB', fontSize: 10 }}>仅供参考，不会自动发送</Text></View></> : null}
        {error ? <View style={{ gap: 7 }}><Text accessibilityRole="alert" style={{ color: '#A7663A', fontSize: 12 }}>{error}</Text>{canRetry ? <Action label="重试学习反馈" onPress={onRetry} disabled={busy} /> : null}</View> : null}
      </ScrollView>
    </View> : null}
  </View>;
}
