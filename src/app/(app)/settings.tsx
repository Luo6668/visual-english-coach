import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ChevronLeft, ChevronRight, Cloud, Database, Globe, Info, LogOut, Mic,
  RefreshCw, Shield, Trash2, Volume2,
} from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useSession } from '@/ctx';
import { clearLocalLearningData, fetchLocalServiceStatus } from '@/lib/api';

// ── 颜色常量 ────────────────────────────────────────────
const BLUE       = '#4A90E2';
const BLUE_DARK  = '#2E5C8A';
const BLUE_LIGHT = '#EEF5FF';
const YELLOW     = '#FFD60A';
const WHITE      = '#FFFFFF';
const BG         = '#F5F8FF';

// ── 版本信息 ────────────────────────────────────────────
const APP_VERSION = '1.0.0';

export default function SettingsScreen() {
  const router = useRouter();
  const { session, signOut } = useSession();

  // 用户邮箱
  const [userEmail, setUserEmail] = useState('');
  const [serviceStatus, setServiceStatus] = useState<{
    ok: boolean;
    deepseek: boolean;
    dashscope: boolean;
    localAsr: boolean;
    localTts: boolean;
  } | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [clearing, setClearing] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearMessage, setClearMessage] = useState('');

  const loadServiceStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError('');
    try {
      setServiceStatus(await fetchLocalServiceStatus());
    } catch (error) {
      setServiceStatus(null);
      setStatusError(error instanceof Error ? error.message : '无法连接本地服务');
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (session?.user.email) setUserEmail(session.user.email);
    void loadServiceStatus();
  }, [session, loadServiceStatus]));

  const clearData = async () => {
    setClearing(true);
    setClearMessage('');
    try {
      await clearLocalLearningData();
      setClearMessage('本地学习记录和成长数据已清空。');
    } catch (error) {
      setClearMessage(error instanceof Error ? error.message : '清除失败，请确认本地服务和 MySQL 正在运行。');
    } finally {
      setClearing(false);
      setClearDialogOpen(false);
    }
  };

  const handleClearData = () => {
    if (clearing) return;
    setClearDialogOpen(true);
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/');
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar style="dark" backgroundColor={BLUE_LIGHT} />

      {/* ── 顶部 Hero ── */}
      <View style={{
        backgroundColor: BLUE_LIGHT,
        paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20,
        borderBottomWidth: 1, borderBottomColor: '#D6E8FF',
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable onPress={() => router.back()} className="active:opacity-70"
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: BLUE + '18', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={20} color={BLUE} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#1E293B', fontSize: 20, fontWeight: '800' }}>设置</Text>
            <Text style={{ color: '#64748B', fontSize: 12, marginTop: 1 }}>账号 · 本地服务 · 数据 · 关于</Text>
          </View>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic">
        <View style={{ padding: 16, gap: 16, paddingBottom: 48 }}>

          {/* ── 账号信息 ── */}
          <SectionCard title="账号">
            <InfoRow icon={<Shield size={16} color={BLUE} />} label="登录邮箱" value={userEmail || '未登录'} />
          </SectionCard>

          {/* ── 本地服务状态 ── */}
          <SectionCard title="本地服务">
            <InfoRow
              icon={<Cloud size={16} color={BLUE} />}
              label="AI 网关"
              value={serviceStatus?.ok ? '已连接' : statusLoading ? '检测中' : '未连接'}
            />
            <View style={{ height: 1, backgroundColor: '#F1F5F9', marginVertical: 4 }} />
            <InfoRow
              icon={<Database size={16} color={BLUE} />}
              label="DeepSeek"
              value={serviceStatus?.deepseek ? '已配置' : '未配置'}
            />
            <View style={{ height: 1, backgroundColor: '#F1F5F9', marginVertical: 4 }} />
            <InfoRow
              icon={<Database size={16} color={BLUE} />}
              label="千问"
              value={serviceStatus?.dashscope ? '已配置' : '未配置'}
            />
            <View style={{ height: 1, backgroundColor: '#F1F5F9', marginVertical: 4 }} />
            <InfoRow
              icon={<Mic size={16} color={BLUE} />}
              label="本地英文识别"
              value={serviceStatus?.localAsr ? '可用' : '未就绪'}
            />
            <View style={{ height: 1, backgroundColor: '#F1F5F9', marginVertical: 4 }} />
            <InfoRow
              icon={<Volume2 size={16} color={BLUE} />}
              label="本地中英文朗读"
              value={serviceStatus?.localTts ? '可用' : '未就绪'}
            />
            {statusError ? <Text style={{ color: '#DC2626', fontSize: 12, lineHeight: 18 }}>{statusError}</Text> : null}
            <Pressable
              onPress={() => { void loadServiceStatus(); }}
              disabled={statusLoading}
              className="active:opacity-75"
              style={{
                marginTop: 6, borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 10,
                paddingVertical: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {statusLoading ? <ActivityIndicator size="small" color={BLUE} /> : <RefreshCw size={14} color={BLUE} />}
              <Text style={{ color: BLUE, fontSize: 12, fontWeight: '700' }}>重新检测</Text>
            </Pressable>
          </SectionCard>

          {/* ── 学习偏好 ── */}
          <SectionCard title="学习偏好">
            <NavRow
              icon={<Globe size={16} color={BLUE} />}
              label="目标场景设置"
              sub="选择你最常用的英语场景"
              onPress={() => router.push('/(app)/map' as any)}
            />
            <View style={{ height: 1, backgroundColor: '#F1F5F9', marginVertical: 4 }} />
            <NavRow
              icon={<Trash2 size={16} color="#EF4444" />}
              label="清除学习记录"
              sub={clearing ? '正在清除…' : '删除 MySQL 中的全部本地学习数据'}
              danger
              onPress={handleClearData}
            />
            {clearMessage ? (
              <Text style={{ fontSize: 12, lineHeight: 18, color: clearMessage.includes('已清空') ? '#15803D' : '#DC2626' }}>
                {clearMessage}
              </Text>
            ) : null}
          </SectionCard>

          {/* ── 关于 ── */}
          <SectionCard title="关于">
            <InfoRow icon={<Info size={16} color={BLUE} />} label="版本号" value={`v${APP_VERSION}`} />
            <View style={{ height: 1, backgroundColor: '#F1F5F9', marginVertical: 4 }} />
            <View style={{ paddingVertical: 8, gap: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E293B' }}>🎯 Visual English Coach</Text>
              <Text style={{ fontSize: 12, color: '#64748B', lineHeight: 18 }}>
                通过「看场景 → 学表达 → 开口说」三步走，把眼前场景变成真正用得上的英语。
              </Text>
            </View>
          </SectionCard>

          {/* ── 退出登录 ── */}
          <Pressable onPress={handleSignOut} className="active:opacity-80"
            style={{
              backgroundColor: WHITE, borderRadius: 20, padding: 18,
              flexDirection: 'row', alignItems: 'center', gap: 10,
              borderWidth: 1, borderColor: '#FEE2E2',
            }}>
            <LogOut size={18} color="#EF4444" />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#EF4444' }}>退出登录</Text>
          </Pressable>

        </View>
      </ScrollView>

      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清除本地学习数据</AlertDialogTitle>
            <AlertDialogDescription>
              将删除学习记录、单词、日记、场景进度和 XP。此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>
              <Text>取消</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={clearing}
              className="bg-red-600"
              onPress={() => { void clearData(); }}
            >
              <Text style={{ color: WHITE }}>{clearing ? '正在清除…' : '确认清除'}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </View>
  );
}

// ── 子组件 ──────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: '#94A3B8', marginLeft: 4, marginBottom: 4, letterSpacing: 0.5 }}>
        {title.toUpperCase()}
      </Text>
      <View style={{
        backgroundColor: WHITE, borderRadius: 20, padding: 18, gap: 8,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10,
      }}>
        {children}
      </View>
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
      {icon}
      <Text style={{ flex: 1, fontSize: 14, color: '#1E293B', fontWeight: '600' }}>{label}</Text>
      <Text style={{ fontSize: 13, color: '#64748B' }}>{value}</Text>
    </View>
  );
}

function NavRow({
  icon, label, sub, onPress, danger = false,
}: {
  icon: React.ReactNode; label: string; sub: string; onPress: () => void; danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} className="active:opacity-70"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: danger ? '#EF4444' : '#1E293B' }}>{label}</Text>
        <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{sub}</Text>
      </View>
      <ChevronRight size={15} color="#CBD5E1" />
    </Pressable>
  );
}
