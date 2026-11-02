import { AlertCircle, CheckCircle2, CloudOff, LoaderCircle, RotateCcw } from 'lucide-react-native';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { MotionPressable } from '@/components/motion-pressable';
import { APP_COLORS, APP_RADIUS } from '@/lib/design-system';

type Tone = 'loading' | 'error' | 'offline' | 'success';

export function AsyncStatusBanner({ tone, title, message, onRetry, compact = false }: {
  tone: Tone;
  title: string;
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  const color = tone === 'error' ? APP_COLORS.danger : tone === 'offline' ? '#6B7280' : tone === 'success' ? APP_COLORS.success : APP_COLORS.blue;
  const Icon = tone === 'error' ? AlertCircle : tone === 'offline' ? CloudOff : tone === 'success' ? CheckCircle2 : LoaderCircle;
  return (
    <View accessibilityLiveRegion="polite" style={[styles.banner, compact && styles.bannerCompact, { borderColor: `${color}2E`, backgroundColor: `${color}0D` }]}>
      {tone === 'loading' ? <ActivityIndicator size="small" color={color} /> : <Icon size={compact ? 16 : 19} color={color} />}
      <View style={styles.copy}>
        <Text style={[styles.title, compact && styles.titleCompact, { color }]}>{title}</Text>
        {message ? <Text style={[styles.message, compact && styles.messageCompact]} numberOfLines={compact ? 2 : undefined}>{message}</Text> : null}
      </View>
      {onRetry ? (
        <MotionPressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="重试" style={styles.retry} pressedScale={0.92}>
          <RotateCcw size={15} color={color} /><Text style={[styles.retryText, { color }]}>重试</Text>
        </MotionPressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { width: '100%', minHeight: 58, paddingHorizontal: 13, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: APP_RADIUS.control, borderWidth: 1 },
  bannerCompact: { minHeight: 42, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 13 },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: 13, lineHeight: 17, fontWeight: '900' },
  titleCompact: { fontSize: 11, lineHeight: 14 },
  message: { marginTop: 2, color: APP_COLORS.muted, fontSize: 11, lineHeight: 16, fontWeight: '600' },
  messageCompact: { fontSize: 9.5, lineHeight: 13 },
  retry: { minHeight: 34, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.72)' },
  retryText: { fontSize: 11, fontWeight: '900' },
});
