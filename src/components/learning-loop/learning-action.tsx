import { Text } from 'react-native';
import { Lightbulb } from 'lucide-react-native';
import { MotionPressable } from '@/components/motion-pressable';
export function LearningAction({ label, onPress, disabled = false, icon: Icon }: { label: string; onPress: () => void; disabled?: boolean; icon?: typeof Lightbulb }) {
  return <MotionPressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled} style={{ opacity: disabled ? 0.45 : 1, minHeight: 38, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 13, backgroundColor: '#FFFFFFB8', borderWidth: 1, borderColor: '#D6E5F8', flexDirection: 'row', gap: 5, alignItems: 'center' }}>{Icon ? <Icon size={14} color="#126EDC" /> : null}<Text style={{ fontSize: 12, fontWeight: '700', color: '#1261BB' }}>{label}</Text></MotionPressable>;
}
