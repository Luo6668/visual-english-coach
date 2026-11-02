/* global require */
declare const require: (assetPath: string) => number;

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ChevronRight } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { MotionPressable } from '@/components/motion-pressable';
import { APP_COLORS, APP_GLASS_WEB, APP_RADIUS, APP_SHADOW } from '@/lib/design-system';

const sceneImage = require('../../assets/home-cafe-hero.webp');

export function AuthSceneShell({ children, onBack, panelLabel }: {
  children: ReactNode;
  onBack?: () => void;
  panelLabel: string;
}) {
  const { width, height } = useWindowDimensions();
  const compact = width < 390 || height < 760;
  const landscape = width > 700 && width > height;
  const [activeWord, setActiveWord] = useState<'coffee' | 'menu'>('coffee');

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.page}>
      <LinearGradient colors={['#F9FCFF', '#EAF4FF', '#F8F6FF']} style={StyleSheet.absoluteFillObject} />
      <View pointerEvents="none" style={styles.backgroundLineOne} />
      <View pointerEvents="none" style={styles.backgroundLineTwo} />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={[styles.shell, compact && styles.shellCompact, landscape && styles.shellLandscape]}>
          <View style={[styles.brandHeader, landscape && styles.brandHeaderLandscape]}>
            {onBack ? (
              <MotionPressable onPress={onBack} accessibilityRole="button" accessibilityLabel="返回" style={styles.backButton} pressedScale={0.9}>
                <ArrowLeft size={22} color={APP_COLORS.ink} />
              </MotionPressable>
            ) : null}
            <Text style={[styles.brandTitle, compact && styles.brandTitleCompact]} numberOfLines={1} adjustsFontSizeToFit>
              Visual <Text style={styles.brandBlue}>English</Text> Coach
            </Text>
            <Text style={styles.brandSubtitle}>看见场景，说出英语</Text>
          </View>

          <View style={[styles.content, landscape && styles.contentLandscape]}>
            <View style={[styles.sceneFrame, compact && styles.sceneFrameCompact, landscape && styles.sceneFrameLandscape]}>
              <Image source={sceneImage} contentFit="cover" transition={180} style={StyleSheet.absoluteFillObject} />
              <LinearGradient colors={['rgba(5,18,36,0.02)', 'rgba(6,19,38,0.18)']} style={StyleSheet.absoluteFillObject} />
              <View pointerEvents="none" style={styles.sceneEdge} />
              <View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE SCENE</Text></View>
              <Hotspot label="coffee" active={activeWord === 'coffee'} onPress={() => setActiveWord('coffee')} style={styles.coffeeHotspot} />
              <Hotspot label="menu" active={activeWord === 'menu'} onPress={() => setActiveWord('menu')} style={styles.menuHotspot} />
              <View style={styles.wordPreview}>
                <Text style={styles.wordTitle}>{activeWord}</Text>
                <Text style={styles.wordMeaning}>{activeWord === 'coffee' ? '咖啡' : '菜单'}</Text>
                <Text style={styles.wordHint}>{activeWord === 'coffee' ? 'Could I have a coffee?' : 'May I see the menu?'}</Text>
              </View>
            </View>

            <View accessibilityLabel={panelLabel} style={[styles.panelBorder, landscape && styles.panelBorderLandscape]}>
              <View style={styles.panel}>
                <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.66)', 'rgba(205,231,255,0.12)', 'rgba(219,211,255,0.16)']} style={StyleSheet.absoluteFillObject} />
                <View pointerEvents="none" style={styles.panelHighlight} />
                {children}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Hotspot({ label, active, onPress, style }: { label: string; active: boolean; onPress: () => void; style: object }) {
  return (
    <MotionPressable onPress={onPress} pressedScale={0.93} hoverLift={3} style={[styles.hotspot, active && styles.hotspotActive, style]}>
      <View style={[styles.hotspotRing, active && styles.hotspotRingActive]}><View style={styles.hotspotCore} /></View>
      <Text style={styles.hotspotLabel}>{label}</Text>
      <ChevronRight size={14} color={active ? APP_COLORS.blue : '#8798B0'} />
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, overflow: 'hidden', backgroundColor: APP_COLORS.page },
  backgroundLineOne: { position: 'absolute', width: 480, height: 160, left: -210, top: 190, borderRadius: 80, borderWidth: 1, borderColor: 'rgba(64,132,224,0.08)', transform: [{ rotate: '-18deg' }] },
  backgroundLineTwo: { position: 'absolute', width: 430, height: 150, right: -250, top: 520, borderRadius: 75, borderWidth: 1, borderColor: 'rgba(98,111,229,0.07)', transform: [{ rotate: '18deg' }] },
  scrollContent: { width: '100%', flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  shell: { width: '100%', maxWidth: 430, minHeight: 820, paddingHorizontal: 18, paddingTop: 24, paddingBottom: 22 },
  shellCompact: { paddingHorizontal: 14, paddingTop: 16, minHeight: 720 },
  shellLandscape: { maxWidth: 900, minHeight: 500, paddingHorizontal: 24 },
  brandHeader: { minHeight: 96, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 38 },
  brandHeaderLandscape: { minHeight: 76 },
  backButton: { position: 'absolute', left: 0, top: 8, width: 48, height: 48, zIndex: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.82)', borderWidth: 1, borderColor: APP_COLORS.glassBorder, ...APP_SHADOW.card, ...APP_GLASS_WEB },
  brandTitle: { color: APP_COLORS.ink, fontSize: 27, lineHeight: 34, fontWeight: '900' },
  brandTitleCompact: { fontSize: 22, lineHeight: 29 },
  brandBlue: { color: APP_COLORS.blue },
  brandSubtitle: { marginTop: 4, color: '#647794', fontSize: 13, lineHeight: 18, fontWeight: '700', letterSpacing: 4.5 },
  content: { width: '100%' },
  contentLandscape: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  sceneFrame: { height: 276, overflow: 'hidden', borderRadius: 30, borderWidth: 1.4, borderColor: APP_COLORS.glassBorder, backgroundColor: '#D9EAF7', ...APP_SHADOW.card },
  sceneFrameCompact: { height: 235 },
  sceneFrameLandscape: { flex: 1.08, height: 360 },
  sceneEdge: { ...StyleSheet.absoluteFillObject, borderRadius: 29, borderWidth: 1, borderColor: 'rgba(255,255,255,0.72)' },
  liveBadge: { position: 'absolute', right: 14, top: 14, minWidth: 104, height: 36, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 18, backgroundColor: 'rgba(10,18,32,0.66)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.38)', ...APP_GLASS_WEB },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FF365B' },
  liveText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  hotspot: { position: 'absolute', minWidth: 112, height: 42, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.74)', borderWidth: 1, borderColor: APP_COLORS.glassBorder, ...APP_SHADOW.card, ...APP_GLASS_WEB },
  hotspotActive: { backgroundColor: 'rgba(255,255,255,0.92)', borderColor: 'rgba(68,148,255,0.62)' },
  coffeeHotspot: { right: 54, top: 120 },
  menuHotspot: { right: 18, top: 183 },
  hotspotRing: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#7AA9E9', backgroundColor: '#FFFFFF' },
  hotspotRingActive: { borderColor: APP_COLORS.blue },
  hotspotCore: { width: 5, height: 5, borderRadius: 3, backgroundColor: APP_COLORS.blue },
  hotspotLabel: { color: '#293A52', fontSize: 13, fontWeight: '800' },
  wordPreview: { position: 'absolute', left: 14, bottom: 13, width: 198, minHeight: 52, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 16, backgroundColor: 'rgba(7,20,40,0.66)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', ...APP_GLASS_WEB },
  wordTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  wordMeaning: { position: 'absolute', right: 12, top: 8, color: '#A9D2FF', fontSize: 10, fontWeight: '800' },
  wordHint: { marginTop: 3, color: 'rgba(255,255,255,0.78)', fontSize: 10, fontWeight: '600' },
  panelBorder: { marginTop: -20, padding: 1.5, borderRadius: APP_RADIUS.panel + 2, zIndex: 5, backgroundColor: 'rgba(255,255,255,0.82)', ...APP_SHADOW.card },
  panelBorderLandscape: { flex: 0.92, marginTop: 0 },
  panel: { overflow: 'hidden', minHeight: 330, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 18, borderRadius: APP_RADIUS.panel, backgroundColor: APP_COLORS.surface, borderWidth: 1, borderColor: APP_COLORS.glassBorder, ...APP_GLASS_WEB },
  panelHighlight: { position: 'absolute', width: 250, height: 100, left: -60, top: -45, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.52)', transform: [{ rotate: '-8deg' }] },
});
