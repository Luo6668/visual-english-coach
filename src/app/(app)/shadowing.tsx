import {requestRecordingPermissionsAsync,
  setAudioModeAsync, 
  useAudioPlayer, useAudioRecorder,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle, ChevronLeft, Mic, MicOff, RotateCcw, Volume2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, {cancelAnimation, Easing,useAnimatedStyle, 
  useSharedValue, withRepeat, withSequence,
  withTiming, 
} from 'react-native-reanimated';
import { addXp, invokeEdgeFunction, recordActivity, updateLearningRecord } from '@/lib/api';
import { arrayBufferToBase64, audioBlobTo16kWav, startWebAudioRecording } from '@/lib/audioCapture';
import { speakWithTTS } from '@/lib/speech';

const BLUE      = '#4A90E2';
const BLUE_DARK = '#2E5C8A';
const BLUE_LIGHT = '#EEF5FF';
const GREEN     = '#34C759';
const WHITE     = '#FFFFFF';
const BG        = '#F5F8FF';

// ── 录音波形条 ────────────────────────────────────────────
const BAR_COUNT = 9;
const BAR_MAX   = 28;
const BAR_MIN   = 4;

function WaveBar({ index, active }: { index: number; active: boolean }) {
  const h = useSharedValue(BAR_MIN);
  useEffect(() => {
    if (active) {
      const delay = index * 80;
      const maxH  = BAR_MIN + Math.random() * (BAR_MAX - BAR_MIN);
      h.value = withRepeat(
        withSequence(
          withTiming(BAR_MIN, { duration: delay }),
          withTiming(maxH,    { duration: 250 + index * 30, easing: Easing.inOut(Easing.sin) }),
          withTiming(BAR_MIN, { duration: 250 + index * 30, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      );
    } else {
      cancelAnimation(h);
      h.value = withTiming(BAR_MIN, { duration: 300 });
    }
  }, [active]);
  const style = useAnimatedStyle(() => ({ height: h.value }));
  return (
    <Animated.View style={[{
      width: 5, borderRadius: 3,
      backgroundColor: active ? '#EF4444' : '#CBD5E1',
    }, style]} />
  );
}

function AudioWave({ active }: { active: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: BAR_MAX + 8 }}>
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <WaveBar key={i} index={i} active={active} />
      ))}
    </View>
  );
}

export default function ShadowingScreen() {
  const router = useRouter();
  const { sentence, recordId } = useLocalSearchParams();
  const targetSentence = (sentence as string) || 'I am sitting in a quiet coffee shop.';

  const [phase, setPhase] = useState<'ready' | 'requesting' | 'recording' | 'evaluating' | 'result'>('ready');
  const [permError, setPermError] = useState('');
  const [result, setResult] = useState<{
    score: number;
    feedback: string;
    weakWords?: string[];
    wordScores?: { word: string; score: number; tip: string }[];
    suggestion?: string;
    pronunciation?: string;
    rhythm?: string;
    strongPoints?: string;
  } | null>(null);

  const player = useAudioPlayer();
  const recorder = useAudioRecorder({
    extension: '.m4a', sampleRate: 16000, numberOfChannels: 1, bitRate: 64000,
    android: { outputFormat: 'aac_adts', audioEncoder: 'aac', sampleRate: 16000 },
    ios: { extension: '.m4a', outputFormat: 'aac', audioQuality: 96, sampleRate: 16000 },
    web: { mimeType: 'audio/webm', bitsPerSecond: 128000 },
  });
  const webRecorderRef = useRef<MediaRecorder | null>(null);

  const evaluateTranscript = async (transcript: string) => {
    if (!transcript.trim()) {
      setPermError('未识别到跟读内容，请靠近麦克风后重试');
      setPhase('ready');
      return;
    }
    setPhase('evaluating');
    try {
      const evaluation = await invokeEdgeFunction('shadowing', { sentence: targetSentence, transcript });
      setResult(evaluation);
      if (recordId) await updateLearningRecord(recordId as string, { shadowing_score: evaluation.score, shadowing_feedback: evaluation.feedback });
      await Promise.allSettled([
        recordActivity('shadowing'),
        addXp(`shadowing_${Date.now()}`),
      ]);
      setPhase('result');
    } catch (error) {
      console.error('Shadowing eval error:', error);
      setPermError(error instanceof Error ? error.message : '评分失败，请重试');
      setPhase('ready');
    }
  };

  const recognizeAndEvaluate = async (speech: string, len: number, format: 'wav' | 'm4a') => {
    setPhase('evaluating');
    try {
      const response = await invokeEdgeFunction('short-speech-recognition', {
        speech, len, format, rate: 16000, language: 'en', cuid: 'shadowing',
      });
      const transcript = String(response?.result?.[0] || '').trim();
      await evaluateTranscript(transcript);
    } catch (error) {
      console.warn('Shadowing recognition failed:', error);
      setPermError(error instanceof Error ? error.message : '语音识别失败，请重试');
      setPhase('ready');
    }
  };

  // ── AI TTS 示范朗读 ──
  const handlePlay = async () => {
    await speakWithTTS(targetSentence, player, invokeEdgeFunction);
  };

  // ── 读取 Native 录音文件为 base64 ──
  const readRecordingBase64 = async (uri: string): Promise<string> => {
    try {
      return await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
    } catch { return ''; }
  };

  // ── 开始录音 ──
  const handleStartRecording = async () => {
    setPermError('');
    setPhase('requesting');
    if (process.env.EXPO_OS === 'web') {
      try {
        webRecorderRef.current = await startWebAudioRecording(async (blob) => {
          webRecorderRef.current = null;
          if (blob.size < 200) throw new Error('录音时间太短，请重新录制');
          const wav = await audioBlobTo16kWav(blob);
          await recognizeAndEvaluate(arrayBufferToBase64(wav), wav.byteLength, 'wav');
        }, (error) => {
          webRecorderRef.current = null;
          setPermError(error instanceof Error ? error.message : '录音失败，请重试');
          setPhase('ready');
        });
        setPhase('recording');
        return;
      } catch (error) {
        setPermError(error instanceof Error ? error.message : '无法使用麦克风，请检查浏览器权限');
        setPhase('ready');
        return;
      }
    }
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setPermError('需要麦克风权限才能录音，请在设置中开启');
      setPhase('ready');
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase('recording');
    } catch (e) {
      console.error('Record start failed', e);
      setPermError('录音启动失败，请重试');
      setPhase('ready');
    }
  };

  // ── 停止录音并评估 ──
  const handleStopRecording = async () => {
    if (process.env.EXPO_OS === 'web' && webRecorderRef.current) {
      const activeRecorder = webRecorderRef.current;
      if (activeRecorder.state !== 'inactive') activeRecorder.stop();
      setPhase('evaluating');
      return;
    }
    setPhase('evaluating');
    try {
      await recorder.stop();
      const uri = recorder.uri ?? '';
      const audioBase64 = uri ? await readRecordingBase64(uri) : '';
      if (!audioBase64) throw new Error('没有生成有效录音，请重试');
      await recognizeAndEvaluate(audioBase64, Math.round(audioBase64.length * 0.75), 'm4a');
    } catch (error) {
      console.error('Shadowing recording error:', error);
      setPermError(error instanceof Error ? error.message : '录音处理失败，请重试');
      setPhase('ready');
    }
  };

  const handleRecord = () => {
    if (phase === 'recording') {
      handleStopRecording();
    } else if (phase === 'ready' || phase === 'result') {
      handleStartRecording();
    }
  };

  const handleRetry = () => { setResult(null); setPermError(''); setPhase('ready'); };

  // ── 词汇颜色函数 ──────────────────────────────────────────
  const wordScoreColor = (s: number) =>
    s >= 80 ? GREEN : s >= 60 ? '#F59E0B' : '#EF4444';
  const wordScoreBg = (s: number) =>
    s >= 80 ? '#F0FFF4' : s >= 60 ? '#FFFBEB' : '#FFF1F2';
  const wordScoreLabel = (s: number) =>
    s >= 80 ? '✓' : s >= 60 ? '~' : '✗';

  const scoreColor = result ? (result.score >= 80 ? GREEN : result.score >= 60 ? '#F59E0B' : '#EF4444') : BLUE;
  const words = targetSentence.split(' ');

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>

      {/* ── 顶部 Hero ── */}
      <View style={{ backgroundColor: BLUE_LIGHT, paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#D6E8FF' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable onPress={() => router.back()} className="active:opacity-70"
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: BLUE + '18', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={20} color={BLUE} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#1E293B', fontSize: 18, fontWeight: '800' }}>🎙️ Shadowing</Text>
            <Text style={{ color: '#64748B', fontSize: 12 }}>跟读 · 发音纠错 · AI评分</Text>
          </View>
          {result && (
            <View style={{ backgroundColor: scoreColor, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ color: result.score >= 80 ? '#1E293B' : WHITE, fontWeight: '800', fontSize: 14 }}>{result.score}分</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic">
        <View style={{ padding: 16, gap: 16 }}>

          {/* ── 目标句子 ── */}
          <View style={{ backgroundColor: WHITE, borderRadius: 22, padding: 22, gap: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 4, height: 20, borderRadius: 2, backgroundColor: BLUE }} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#64748B' }}>目标句子</Text>
            </View>

            {/* 词汇逐词显示 */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
              {words.map((w, i) => (
                <View key={i} style={{ backgroundColor: BLUE + '12', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: BLUE_DARK, letterSpacing: 0.3 }}>{w}</Text>
                </View>
              ))}
            </View>

            {/* 朗读按钮 */}
            <Pressable onPress={handlePlay} className="active:opacity-75"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: BLUE + '12', borderRadius: 14, padding: 14 }}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' }}>
                <Volume2 size={18} color={WHITE} />
              </View>
              <View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: BLUE_DARK }}>先听 AI 示范</Text>
                <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>美式发音 · 正常语速</Text>
              </View>
            </Pressable>
          </View>

          {/* ── 录音区 ── */}
          <View style={{ backgroundColor: WHITE, borderRadius: 22, padding: 24, alignItems: 'center', gap: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16 }}>
            {phase === 'evaluating' ? (
              <>
                <ActivityIndicator size="large" color={BLUE} />
                <View style={{ alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#1E293B' }}>AI 正在评估发音...</Text>
                  <Text style={{ fontSize: 12, color: '#94A3B8' }}>分析语音节奏与准确度</Text>
                </View>
              </>
            ) : (
              <>
                {/* 状态提示 */}
                <Text style={{ fontSize: 13, color: '#64748B', fontWeight: '600' }}>
                  {phase === 'ready'     ? '👆 点击麦克风开始录音' :
                   phase === 'requesting' ? '正在等待麦克风授权...' :
                   phase === 'recording' ? '🎙️ 录音中，再按停止...' :
                   '✅ 录音完成！查看评分'}
                </Text>

                {/* 权限错误提示 */}
                {!!permError && (
                  <Text style={{ fontSize: 12, color: '#EF4444', textAlign: 'center' }}>{permError}</Text>
                )}

                {/* 录音波形动画 */}
                <AudioWave active={phase === 'recording'} />

                {/* 录音按钮 */}
                <Pressable onPress={handleRecord} className="active:opacity-85"
                  disabled={phase === 'requesting'}
                  accessibilityRole="button"
                  accessibilityLabel={phase === 'recording'
                    ? '停止跟读录音'
                    : phase === 'requesting'
                      ? '正在请求麦克风权限'
                      : '开始跟读录音'}
                  style={{
                    width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: phase === 'recording' ? '#EF4444' : BLUE,
                    shadowColor: phase === 'recording' ? '#EF4444' : BLUE,
                    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 20,
                  }}>
                  {phase === 'requesting'
                    ? <ActivityIndicator size="small" color={WHITE} />
                    : phase === 'recording'
                    ? <MicOff size={30} color={WHITE} />
                    : <Mic size={30} color={WHITE} />}
                </Pressable>
              </>
            )}
          </View>

          {/* ── 评分结果 ── */}
          {result && phase === 'result' && (
            <View style={{ gap: 12 }}>

              {/* 总分大卡 */}
              <View style={{ backgroundColor: WHITE, borderRadius: 22, padding: 24, alignItems: 'center', gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16 }}>
                <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: scoreColor + '18', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: scoreColor }}>
                  {result.score >= 80
                    ? <CheckCircle size={36} color={scoreColor} />
                    : <Text style={{ fontSize: 32, fontWeight: '900', color: scoreColor }}>{result.score}</Text>}
                </View>
                <Text style={{ fontSize: 26, fontWeight: '900', color: '#1E293B' }}>{result.score} 分</Text>
                <Text style={{ fontSize: 13, color: '#64748B' }}>
                  {result.score >= 90 ? '🎉 发音超棒！' : result.score >= 75 ? '👍 不错，继续加油！' : '💪 多练几次会更好'}
                </Text>

                {/* 图例 */}
                <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
                  {[{ color: GREEN, bg: '#F0FFF4', label: '优秀 ≥80' }, { color: '#F59E0B', bg: '#FFFBEB', label: '一般 60-79' }, { color: '#EF4444', bg: '#FFF1F2', label: '需练习 <60' }].map(item => (
                    <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.color }} />
                      <Text style={{ fontSize: 10, color: '#64748B' }}>{item.label}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* 逐词发音评分 */}
              {result.wordScores && result.wordScores.length > 0 && (
                <View style={{ backgroundColor: WHITE, borderRadius: 22, padding: 20, gap: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 4, height: 20, borderRadius: 2, backgroundColor: BLUE }} />
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#1E293B' }}>逐词发音评分</Text>
                    <Text style={{ fontSize: 11, color: '#94A3B8', marginLeft: 4 }}>Word-by-Word Score</Text>
                  </View>

                  {/* 词汇芯片网格 */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {result.wordScores.map((ws, i) => (
                      <View key={i} style={{
                        backgroundColor: wordScoreBg(ws.score),
                        borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8,
                        borderWidth: 1.5, borderColor: wordScoreColor(ws.score) + '50',
                        alignItems: 'center', gap: 3, minWidth: 52,
                      }}>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: wordScoreColor(ws.score), letterSpacing: 0.3 }}>
                          {ws.word}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: wordScoreColor(ws.score) }}>
                            {wordScoreLabel(ws.score)} {ws.score}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>

                  {/* 需改进的词详细提示 */}
                  {result.wordScores.filter(ws => ws.score < 80 && ws.tip).length > 0 && (
                    <View style={{ gap: 8, marginTop: 4 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B' }}>📌 重点练习</Text>
                      {result.wordScores.filter(ws => ws.score < 80 && ws.tip).map((ws, i) => (
                        <View key={i} style={{
                          flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                          backgroundColor: wordScoreBg(ws.score), borderRadius: 12, padding: 12,
                          borderLeftWidth: 3, borderLeftColor: wordScoreColor(ws.score),
                        }}>
                          <View style={{
                            backgroundColor: wordScoreColor(ws.score) + '20',
                            borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
                            borderWidth: 1, borderColor: wordScoreColor(ws.score) + '40',
                          }}>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: wordScoreColor(ws.score) }}>{ws.word}</Text>
                          </View>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={{ fontSize: 12, color: '#374151', lineHeight: 18 }}>{ws.tip}</Text>
                            <Text style={{ fontSize: 11, color: '#94A3B8' }}>得分 {ws.score}/100</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* 维度评分行 */}
              {(result.pronunciation || result.rhythm || result.strongPoints) && (
                <View style={{ backgroundColor: WHITE, borderRadius: 22, padding: 20, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 4, height: 20, borderRadius: 2, backgroundColor: BLUE }} />
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#1E293B' }}>详细分析</Text>
                  </View>
                  {result.pronunciation && (
                    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                      <Text style={{ fontSize: 20 }}>🔤</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#94A3B8', marginBottom: 2 }}>发音准确度</Text>
                        <Text style={{ fontSize: 13, color: '#374151', lineHeight: 18 }}>{result.pronunciation}</Text>
                      </View>
                    </View>
                  )}
                  {result.rhythm && (
                    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                      <Text style={{ fontSize: 20 }}>🎵</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#94A3B8', marginBottom: 2 }}>节奏语调</Text>
                        <Text style={{ fontSize: 13, color: '#374151', lineHeight: 18 }}>{result.rhythm}</Text>
                      </View>
                    </View>
                  )}
                  {result.strongPoints && (
                    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                      <Text style={{ fontSize: 20 }}>⭐</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#94A3B8', marginBottom: 2 }}>亮点</Text>
                        <Text style={{ fontSize: 13, color: '#374151', lineHeight: 18 }}>{result.strongPoints}</Text>
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* AI 综合点评 */}
              <View style={{ backgroundColor: BLUE_DARK, borderRadius: 20, padding: 18, gap: 8 }}>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '700' }}>🤖 AI 综合点评</Text>
                <Text style={{ color: WHITE, fontSize: 14, lineHeight: 22 }}>{result.feedback}</Text>
                {result.suggestion && (
                  <View style={{ marginTop: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 10 }}>
                    <Text style={{ color: '#93C5FD', fontSize: 12, fontWeight: '700', marginBottom: 3 }}>💡 改进建议</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 18 }}>{result.suggestion}</Text>
                  </View>
                )}
              </View>

              {/* 操作按钮 */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable onPress={handleRetry} className="active:opacity-80"
                  style={{ flex: 1, backgroundColor: WHITE, borderRadius: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: '#E2E8F0' }}>
                  <RotateCcw size={16} color={BLUE} />
                  <Text style={{ color: BLUE, fontWeight: '800', fontSize: 14 }}>再试一次</Text>
                </Pressable>
                <Pressable onPress={() => router.back()} className="active:opacity-80"
                  style={{ flex: 1, backgroundColor: BLUE, borderRadius: 16, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: WHITE, fontWeight: '800', fontSize: 14 }}>完成 →</Text>
                </Pressable>
              </View>

            </View>
          )}

        </View>
      </ScrollView>
    </View>
  );
}
