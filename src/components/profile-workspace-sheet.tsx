import { useAudioPlayer } from 'expo-audio';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Bookmark, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { MotionPressable } from '@/components/motion-pressable';
import {
  createSentence,
  invokeEdgeFunction,
  removeSavedSentence,
  updateDiary,
  updateLearningRecord,
} from '@/lib/api';
import { ALL_SCENES } from '@/lib/sceneMapData';
import {
  type ProfilePreferences,
  loadProfilePreferences,
  saveProfilePreferences,
  useProfilePreferences,
} from '@/lib/profile-preferences';
import { speakWithTTS, stopLocalSpeech } from '@/lib/speech';

export type ProfileWorkspaceMode =
  | 'identity'
  | 'scenes'
  | 'expressions'
  | 'calendar'
  | 'level'
  | 'collections'
  | 'diary'
  | 'preferences'
  | 'badges';
export type ProfileWorkspaceData = {
  records: any[];
  words: any[];
  sentences: any[];
  diaries: any[];
  logs: any[];
};
type Badge = { name: string; english: string; level: number; description: string; color: string };
type Props = {
  mode: ProfileWorkspaceMode | null;
  owner: string;
  accountName: string;
  avatarUri: string | null;
  avatarBusy?: boolean;
  avatarNotice?: string;
  defaultAvatar: any;
  level: number;
  totalXp: number;
  levels: readonly { level: number; name: string; minXp: number }[];
  badges: readonly Badge[];
  data: ProfileWorkspaceData;
  initialDate: string;
  loading: boolean;
  dataError: string;
  onClose: () => void;
  onReload: () => void;
  onAvatarPick: () => void;
};

export function profileDateKey(value: unknown) {
  if (typeof value !== 'string' || !value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  return Number.isNaN(date.getTime())
    ? ''
    : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function activityLabel(source: unknown) {
  const value = String(source || '');
  if (value === 'daily_checkin') return '每日签到';
  if (value.startsWith('dialogue_')) return '英语对话';
  if (value.startsWith('shadowing_')) return '跟读练习';
  if (value.startsWith('scene_analysis_')) return '场景分析';
  if (value.startsWith('learning_scene_')) return '场景学习';
  if (value.startsWith('translation_')) return '翻译练习';
  return '学习奖励';
}

function Action({
  label,
  onPress,
  disabled = false,
  subtle = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  subtle?: boolean;
}) {
  return (
    <MotionPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={[s.action, subtle && s.actionSubtle]}
    >
      <Text style={[s.actionText, subtle && { color: '#1767C8' }]}>{label}</Text>
    </MotionPressable>
  );
}
function Card({ children, tint }: { children: ReactNode; tint?: string }) {
  return <View style={[s.card, tint ? { backgroundColor: tint } : null]}>{children}</View>;
}
function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <Card>
      <Text style={s.cardTitle}>{title}</Text>
      <Text style={s.detail}>{detail}</Text>
    </Card>
  );
}

const HEADINGS: Record<ProfileWorkspaceMode, [string, string]> = {
  identity: ['编辑个人名片', '让昵称和称号代表现在的你'],
  scenes: ['我的场景记录', '查看练过的内容，直接回到具体记录'],
  expressions: ['我的表达资产', '分清词汇和句子，随时朗读与练习'],
  calendar: ['学习日历', '选择日期，看看那天做了什么'],
  level: ['等级与经验', '经验来自练习，不代表语言能力测评分数'],
  collections: ['我的收藏精选', '打开、朗读或整理你亲手保存的场景表达'],
  diary: ['我的英语日记', '在这里读、听和修改最近一篇故事'],
  preferences: ['学习偏好', '选择适合自己的语速、目标和常用场景'],
  badges: ['我的成就收藏', '查看获得条件，选择名片上的称号'],
};

export function ProfileWorkspaceSheet(props: Props) {
  const router = useRouter();
  const player = useAudioPlayer();
  const reduceMotion = useReducedMotion();
  const preferences = useProfilePreferences(props.owner);
  const [draft, setDraft] = useState<ProfilePreferences>(preferences);
  const [date, setDate] = useState(props.initialDate);
  const [monthOffset, setMonthOffset] = useState(0);
  const [tab, setTab] = useState<'words' | 'sentences'>('words');
  const [collectionIndex, setCollectionIndex] = useState(0);
  const [editingDiary, setEditingDiary] = useState(false);
  const [diaryDraft, setDiaryDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [speaking, setSpeaking] = useState('');
  const [removedFavorite, setRemovedFavorite] = useState<any>(null);
  const firstField = useRef<TextInput>(null);
  const returnFocus = useRef<{ focus?: () => void } | null>(null);
  const operation = useRef(0);
  const actionLock = useRef(false);
  const latestDiary = [...props.data.diaries].sort((a, b) =>
    String(b.study_date || b.created_at).localeCompare(String(a.study_date || a.created_at)),
  )[0];
  const favorites = [
    ...props.data.records
      .filter((record) => Boolean(record.is_favorited))
      .map((record) => ({ ...record, kind: 'record' })),
    ...props.data.sentences.map((sentence) => ({
      ...sentence,
      kind: 'sentence',
      scene_name: '收藏的英语表达',
      i_say: sentence.sentence,
    })),
  ];
  const currentFavorite = favorites.length ? favorites[collectionIndex % favorites.length] : null;

  useEffect(() => {
    if (!props.mode) return;
    const generation = ++operation.current;
    setError('');
    setNotice('');
    setRemovedFavorite(null);
    setEditingDiary(false);
    setMonthOffset(0);
    setCollectionIndex(0);
    setDate(props.initialDate);
    setDraft(preferences);
    void loadProfilePreferences(props.owner)
      .then((value) => {
        if (operation.current === generation) setDraft(value);
      })
      .catch(() => {
        if (operation.current === generation) setError('本机偏好读取失败，请关闭后重新打开');
      });
    return () => {
      operation.current += 1;
      stopLocalSpeech();
      setSpeaking('');
    };
  }, [props.mode, props.owner]);

  useEffect(() => {
    if (!props.mode || Platform.OS !== 'web') return;
    returnFocus.current = document.activeElement as { focus?: () => void } | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = setTimeout(() => firstField.current?.focus(), 250);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => returnFocus.current?.focus?.());
    };
  }, [props.mode]);

  const close = () => {
    if (!actionLock.current) props.onClose();
  };
  const navigate = (pathname: string, params?: Record<string, string>) => {
    if (actionLock.current) return;
    props.onClose();
    router.push(params ? ({ pathname, params } as any) : (pathname as any));
  };
  const perform = async (action: () => Promise<unknown>, success: string) => {
    if (actionLock.current) return;
    const generation = operation.current;
    actionLock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      if (generation === operation.current) {
        setNotice(success);
        props.onReload();
      }
    } catch (reason) {
      if (generation === operation.current)
        setError(reason instanceof Error ? reason.message : '没有保存成功，请重试');
    } finally {
      actionLock.current = false;
      if (generation === operation.current) setBusy(false);
    }
  };
  const speak = (key: string, text: string, rate?: number) => {
    if (speaking === key) {
      stopLocalSpeech();
      setSpeaking('');
      return;
    }
    stopLocalSpeech();
    setSpeaking(key);
    void speakWithTTS(text, player, invokeEdgeFunction, () => setSpeaking(''), { rate });
  };
  const renderRecord = (record: any) => (
    <MotionPressable
      key={record.id}
      accessibilityRole="button"
      accessibilityLabel={`查看学习记录 ${record.scene_name}`}
      onPress={() => navigate(`/(app)/record/${record.id}`)}
      style={s.recordRow}
    >
      {record.scene_image ? (
        <Image source={{ uri: record.scene_image }} style={s.recordImage} contentFit="cover" />
      ) : (
        <View style={[s.recordImage, s.placeholder]}>
          <Bookmark size={20} color="#1677ED" />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={s.cardTitle}>{record.scene_name}</Text>
        <Text numberOfLines={2} style={s.detail}>
          {record.i_say || record.i_see || '打开查看场景内容'}
        </Text>
        <Text style={s.caption}>{profileDateKey(record.created_at)}</Text>
      </View>
      <ChevronRight size={18} color="#7D92AA" />
    </MotionPressable>
  );

  const saveIdentity = () => {
    if (!draft.nickname.trim()) {
      setError('请输入昵称，最多 24 个字符');
      return;
    }
    if (
      draft.title &&
      !props.badges.some((badge) => badge.english === draft.title && badge.level <= props.level)
    ) {
      setError('请选择已经获得的称号');
      return;
    }
    void perform(
      () => saveProfilePreferences(props.owner, { nickname: draft.nickname, title: draft.title }),
      '个人名片已保存',
    );
  };
  const renderIdentity = () => (
    <>
      <Card tint="#F0F7FF">
        <View style={s.row}>
          <Image
            source={props.avatarUri ? { uri: props.avatarUri } : props.defaultAvatar}
            style={s.avatar}
            contentFit="cover"
          />
          <View style={{ flex: 1 }}>
            <Text style={s.largeTitle}>{draft.nickname || props.accountName}</Text>
            <Text style={s.detail}>
              {draft.title ? props.badges.find((b) => b.english === draft.title)?.name : '尚未佩戴称号'} · LV.
              {props.level}
            </Text>
          </View>
        </View>
        <Action label={props.avatarBusy ? '正在更新头像…' : '从相册更换头像'} subtle disabled={props.avatarBusy} onPress={props.onAvatarPick} />
        {props.avatarNotice ? <Text accessibilityLiveRegion="polite" style={s.detail}>{props.avatarNotice}</Text> : null}
      </Card>
      <Text style={s.label}>昵称</Text>
      <TextInput
        ref={firstField}
        accessibilityLabel="个人昵称"
        value={draft.nickname}
        onChangeText={(nickname) => setDraft((value) => ({ ...value, nickname }))}
        maxLength={24}
        placeholder="输入你的昵称"
        style={s.input}
        editable={!busy}
      />
      <Text style={s.label}>名片称号</Text>
      <View style={s.options}>
        <Action label="不佩戴称号" subtle onPress={() => setDraft((value) => ({ ...value, title: '' }))} />
        {props.badges.map((badge) => (
          <MotionPressable
            key={badge.english}
            accessibilityRole="button"
            accessibilityLabel={`选择称号 ${badge.name}`}
            accessibilityState={{ selected: draft.title === badge.english }}
            disabled={busy || props.level < badge.level}
            onPress={() => setDraft((value) => ({ ...value, title: badge.english }))}
            style={[s.option, draft.title === badge.english && s.selected]}
          >
            <Text style={s.optionText}>
              {badge.name}
              {props.level < badge.level ? ` · LV.${badge.level}` : draft.title === badge.english ? ' ✓' : ''}
            </Text>
          </MotionPressable>
        ))}
      </View>
      <Text style={s.caption}>昵称与称号按账号保存在当前设备。更换头像会单独立即保存。</Text>
      <Action label={busy ? '正在保存…' : '保存个人名片'} disabled={busy} onPress={saveIdentity} />
    </>
  );
  const renderCalendar = () => {
    const month = new Date();
    month.setDate(1);
    month.setMonth(month.getMonth() + monthOffset);
    const length = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const datedRecords = props.data.records.filter((r) => profileDateKey(r.created_at) === date);
    const logs = props.data.logs.filter((log) => profileDateKey(log.reward_date || log.created_at) === date);
    return (
      <>
        <Card>
          <View style={s.between}>
            <MotionPressable
              accessibilityRole="button"
              accessibilityLabel="查看上个月"
              onPress={() => setMonthOffset((value) => value - 1)}
              style={s.iconButton}
            >
              <ChevronLeft size={22} color="#1767C8" />
            </MotionPressable>
            <Text style={s.cardTitle}>
              {month.getFullYear()} 年 {month.getMonth() + 1} 月
            </Text>
            <MotionPressable
              accessibilityRole="button"
              accessibilityLabel="查看下个月"
              disabled={monthOffset >= 0}
              onPress={() => setMonthOffset((value) => value + 1)}
              style={s.iconButton}
            >
              <ChevronRight size={22} color="#1767C8" />
            </MotionPressable>
          </View>
          <View style={s.calendar}>
            {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
              <View key={day} style={s.dayCell}>
                <Text style={s.caption}>{day}</Text>
              </View>
            ))}
            {Array.from({ length: month.getDay() }, (_, i) => (
              <View key={`empty-${i}`} style={s.dayCell} />
            ))}
            {Array.from({ length }, (_, i) => {
              const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
              const count = props.data.records.filter((r) => profileDateKey(r.created_at) === key).length;
              const xp = props.data.logs
                .filter((l) => profileDateKey(l.reward_date || l.created_at) === key)
                .reduce((sum, l) => sum + Number(l.xp_amount || 0), 0);
              return (
                <MotionPressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={`选择日期 ${key}`}
                  accessibilityState={{ selected: key === date }}
                  onPress={() => setDate(key)}
                  style={[s.dayCell, key === date && s.selected]}
                >
                  <Text style={s.optionText}>{i + 1}</Text>
                  <View style={[s.dayDot, { backgroundColor: count || xp ? '#1689EF' : 'transparent' }]} />
                </MotionPressable>
              );
            })}
          </View>
        </Card>
        <Text style={s.label}>
          {date} · {datedRecords.length} 条场景记录 ·{' '}
          {logs.reduce((sum, l) => sum + Number(l.xp_amount || 0), 0)} XP
        </Text>
        {datedRecords.map(renderRecord)}
        {logs.map((log) => (
          <Card key={log.id}>
            <View style={s.between}>
              <Text style={s.cardTitle}>{activityLabel(log.source)}</Text>
              <Text style={s.blue}>+{log.xp_amount} XP</Text>
            </View>
          </Card>
        ))}
        {!datedRecords.length && !logs.length ? (
          <Empty title="这天没有可展示的记录" detail="完成场景学习或获得经验后，会在对应日期显示。" />
        ) : null}
        <Text style={s.caption}>
          展示已保存的学习记录与最近 500 条经验事件。
        </Text>
      </>
    );
  };
  const renderExpressions = () => (
    <>
      <View style={s.options}>
        <Action
          label={`词汇 ${props.data.words.length}`}
          subtle={tab !== 'words'}
          onPress={() => setTab('words')}
        />
        <Action
          label={`句子 ${props.data.sentences.length}`}
          subtle={tab !== 'sentences'}
          onPress={() => setTab('sentences')}
        />
      </View>
      {(tab === 'words' ? props.data.words : props.data.sentences).map((item) => (
        <Card key={item.id}>
          <Text style={s.cardTitle}>{tab === 'words' ? item.word : item.sentence}</Text>
          <Text style={s.detail}>{item.meaning || item.translation || '尚未保存中文释义'}</Text>
          <View style={s.options}>
            <Action
              label={speaking === item.id ? '停止朗读' : '朗读这条表达'}
              subtle
              onPress={() => speak(item.id, item.word || item.sentence)}
            />
            <Action
              label={tab === 'words' ? '查看词义' : '查看句子详解'}
              subtle
              onPress={() =>
                navigate(
                  tab === 'words' ? '/(app)/word-detail' : '/(app)/sentence-detail',
                  tab === 'words' ? { word: item.word } : { sentenceId: item.id },
                )
              }
            />
          </View>
        </Card>
      ))}
      {!(tab === 'words' ? props.data.words : props.data.sentences).length ? (
        <Empty
          title={tab === 'words' ? '还没有收藏词汇' : '还没有收藏句子'}
          detail="学习时收藏喜欢的内容，它们会出现在这里。"
        />
      ) : null}
      <Action label="管理全部表达" onPress={() => navigate('/(app)/(tabs)/learning', { tab })} />
    </>
  );
  const renderCollections = () => (
    <>
      {currentFavorite ? (
        <Card tint="#EFF7FF">
          <Text style={s.caption}>
            {(collectionIndex % favorites.length) + 1} / {favorites.length} ·{' '}
            {currentFavorite.kind === 'record' ? '场景收藏' : '句子收藏'}
          </Text>
          {currentFavorite.scene_image ? (
            <Image source={{ uri: currentFavorite.scene_image }} contentFit="cover" style={s.cover} />
          ) : null}
          <Text style={s.largeTitle}>{currentFavorite.scene_name}</Text>
          <Text style={s.detail}>{currentFavorite.i_say || currentFavorite.i_see}</Text>
          <View style={s.options}>
            <Action
              label="上一条收藏"
              subtle
              disabled={favorites.length < 2 || busy}
              onPress={() => {
                stopLocalSpeech();
                setSpeaking('');
                setCollectionIndex((index) => (index - 1 + favorites.length) % favorites.length);
              }}
            />
            <Action
              label="下一条收藏"
              subtle
              disabled={favorites.length < 2 || busy}
              onPress={() => {
                stopLocalSpeech();
                setSpeaking('');
                setCollectionIndex((index) => (index + 1) % favorites.length);
              }}
            />
          </View>
          <Action
            label={speaking === currentFavorite.id ? '停止朗读' : '朗读收藏表达'}
            subtle
            onPress={() =>
              speak(
                currentFavorite.id,
                currentFavorite.i_say || currentFavorite.i_see || currentFavorite.scene_name,
              )
            }
          />
          <Action
            label={currentFavorite.kind === 'record' ? '打开这条学习记录' : '查看收藏表达详解'}
            onPress={() =>
              currentFavorite.kind === 'record'
                ? navigate(`/(app)/record/${currentFavorite.id}`)
                : navigate('/(app)/sentence-detail', { sentence: currentFavorite.sentence })
            }
          />
          <Action
            label={busy ? '正在更新…' : '取消这条收藏'}
            subtle
            disabled={busy || props.loading}
            onPress={() =>
              void perform(async () => {
                stopLocalSpeech();
                setSpeaking('');
                if (currentFavorite.kind === 'record')
                  await updateLearningRecord(currentFavorite.id, { is_favorited: false });
                else await removeSavedSentence(currentFavorite.id);
                setRemovedFavorite(currentFavorite);
              }, '已从收藏移除，可以在本面板内撤销')
            }
          />
        </Card>
      ) : (
        <Empty
          title="还没有收藏内容"
          detail="场景学习时点亮书签，或者收藏 AI 教练给出的表达，它们会出现在这里。"
        />
      )}
      {removedFavorite ? (
        <Action
          label="撤销取消收藏"
          subtle
          disabled={busy || props.loading}
          onPress={() =>
            void perform(async () => {
              if (removedFavorite.kind === 'record')
                await updateLearningRecord(removedFavorite.id, { is_favorited: true });
              else
                await createSentence({
                  sentence: removedFavorite.sentence,
                  translation: removedFavorite.translation,
                  record_id: removedFavorite.record_id,
                });
              setRemovedFavorite(null);
            }, '已恢复收藏')
          }
        />
      ) : null}
      <Action label="管理场景收藏" onPress={() => navigate('/(app)/(tabs)/learning', { tab: 'favorites' })} />
      <Action
        label="管理收藏句子"
        subtle
        onPress={() => navigate('/(app)/(tabs)/learning', { tab: 'sentences' })}
      />
    </>
  );
  const renderDiary = () => (
    <>
      {latestDiary ? (
        <Card tint="#F7F3FF">
          <Text style={s.caption}>
            {latestDiary.diary_type === 'weekly' ? '每周故事' : '每日故事'} ·{' '}
            {profileDateKey(latestDiary.study_date || latestDiary.created_at)}
          </Text>
          {editingDiary ? (
            <>
              <TextInput
                ref={firstField}
                accessibilityLabel="编辑日记内容"
                multiline
                value={diaryDraft}
                onChangeText={setDiaryDraft}
                editable={!busy}
                style={[s.input, s.diaryInput]}
              />
              <Action
                label={busy ? '正在保存日记…' : '保存日记修改'}
                disabled={busy || !diaryDraft.trim()}
                onPress={() =>
                  void perform(async () => {
                    await updateDiary(latestDiary.id, { content: diaryDraft.trim() });
                    setEditingDiary(false);
                  }, '日记已保存')
                }
              />
              <Action label="取消日记修改" subtle disabled={busy} onPress={() => setEditingDiary(false)} />
            </>
          ) : (
            <>
              <Text selectable style={s.diaryText}>
                {latestDiary.content}
              </Text>
              <View style={s.options}>
                <Action
                  label={speaking === latestDiary.id ? '停止日记朗读' : '朗读这篇日记'}
                  subtle
                  onPress={() => speak(latestDiary.id, latestDiary.content)}
                />
                <Action
                  label="编辑这篇日记"
                  subtle
                  onPress={() => navigate('/(app)/diary', { date: String(latestDiary.study_date || latestDiary.week_start || latestDiary.created_at).slice(0, 10), type: latestDiary.diary_type })}
                />
              </View>
            </>
          )}
        </Card>
      ) : (
        <Empty title="还没有英语日记" detail="用中文记下今天的生活，预览英语后再保存，也可以带入真实学习记录。" />
      )}
      <Action
        label={latestDiary ? '查看全部日记' : '创建第一篇日记'}
        onPress={() => navigate('/(app)/diary')}
      />
    </>
  );
  const renderPreferences = () => (
    <>
      <Text style={s.label}>默认朗读速度</Text>
      <View style={s.options}>
        {[0.8, 1, 1.2].map((rate) => (
          <MotionPressable
            key={rate}
            accessibilityRole="button"
            accessibilityLabel={`选择默认语速 ${rate}`}
            accessibilityState={{ selected: draft.speechRate === rate }}
            onPress={() => setDraft((value) => ({ ...value, speechRate: rate }))}
            style={[s.option, draft.speechRate === rate && s.selected]}
          >
            <Text style={s.optionText}>
              {rate}× {rate === 0.8 ? '慢一点' : rate === 1 ? '自然' : '快一点'}
            </Text>
          </MotionPressable>
        ))}
      </View>
      <Action
        label={speaking === 'sample' ? '停止试听' : '试听当前语速'}
        subtle
        onPress={() => speak('sample', 'Could I have a latte, please?', draft.speechRate)}
      />
      <Text style={s.caption}>作为未指定语速时的默认值，单条内容上的慢速选项仍可单独使用。</Text>
      <Text style={s.label}>每天的场景练习目标</Text>
      <View style={s.options}>
        {[1, 3, 5].map((goal) => (
          <MotionPressable
            key={goal}
            accessibilityRole="button"
            accessibilityLabel={`每天练习 ${goal} 个场景`}
            onPress={() => setDraft((value) => ({ ...value, dailyScenes: goal }))}
            style={[s.option, draft.dailyScenes === goal && s.selected]}
          >
            <Text style={s.optionText}>{goal} 个场景</Text>
          </MotionPressable>
        ))}
      </View>
      <Text style={s.caption}>保存后用于首页“今日目标”的场景练习项。</Text>
      <Text style={s.label}>常用场景</Text>
      <View style={s.options}>
        {ALL_SCENES.slice(0, 8).map((scene) => (
          <MotionPressable
            key={scene.id}
            accessibilityRole="button"
            accessibilityLabel={`选择常用场景 ${scene.nameZh}`}
            onPress={() => setDraft((value) => ({ ...value, preferredScene: scene.id }))}
            style={[s.option, draft.preferredScene === scene.id && s.selected]}
          >
            <Text style={s.optionText}>{scene.nameZh}</Text>
          </MotionPressable>
        ))}
      </View>
      <Text style={s.caption}>以上偏好按账号保存在当前设备，切换设备后需重新设置。</Text>
      <Action
        label={busy ? '正在保存偏好…' : '保存学习偏好'}
        disabled={busy}
        onPress={() =>
          void perform(
            () =>
              saveProfilePreferences(props.owner, {
                speechRate: draft.speechRate,
                dailyScenes: draft.dailyScenes,
                preferredScene: draft.preferredScene,
              }),
            '偏好已保存，相关功能已更新',
          )
        }
      />
      <Action
        label="开始我的常用场景"
        subtle
        onPress={() => navigate('/(app)/scene-detail', { sceneId: preferences.preferredScene, returnTo: 'profile' })}
      />
    </>
  );
  const renderBadges = () => (
    <>
      {props.badges.map((badge) => (
        <Card key={badge.english} tint={badge.level <= props.level ? '#F1F7FF' : '#F6F7F9'}>
          <Text style={s.cardTitle}>{badge.name}</Text>
          <Text style={s.detail}>{badge.description}</Text>
          <Text style={s.caption}>
            获得条件：等级达到 LV.{badge.level} · {props.level >= badge.level ? '已获得' : '尚未获得'}
          </Text>
          <Text style={s.caption}>这是学习里程碑，不是英语水平认证。</Text>
          <Action
            label={preferences.title === badge.english ? '当前佩戴' : `佩戴${badge.name}`}
            disabled={busy || props.level < badge.level || preferences.title === badge.english}
            onPress={() =>
              void perform(
                () => saveProfilePreferences(props.owner, { title: badge.english }),
                `已佩戴「${badge.name}」`,
              )
            }
          />
        </Card>
      ))}
      <Text style={s.caption}>勋章的获得日期暂未记录。</Text>
    </>
  );
  const renderLevel = () => (
    <>
      <Card tint="#F1F7FF">
        <Text style={s.largeTitle}>
          LV.{props.level} · {props.totalXp} XP
        </Text>
        <Text style={s.detail}>等级记录你的学习投入，经验来源可在下面逐条查看。</Text>
      </Card>
      {props.levels.map((level) => (
        <View key={level.level} style={s.levelRow}>
          <View style={[s.levelDot, { backgroundColor: level.level <= props.level ? '#1488EF' : '#DDE6EF' }]}>
            <Text style={s.levelNumber}>{level.level}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>{level.name}</Text>
            <Text style={s.caption}>
              {level.minXp} XP ·{' '}
              {level.level < props.level
                ? '已达到'
                : level.level === props.level
                  ? '当前等级'
                  : `还需 ${Math.max(0, level.minXp - props.totalXp)} XP`}
            </Text>
          </View>
        </View>
      ))}
      <Text style={s.label}>最近经验来源</Text>
      {props.data.logs.slice(0, 30).map((log) => (
        <View style={s.between} key={log.id}>
          <View>
            <Text style={s.cardTitle}>{activityLabel(log.source)}</Text>
            <Text style={s.caption}>{profileDateKey(log.reward_date || log.created_at)}</Text>
          </View>
          <Text style={s.blue}>+{log.xp_amount} XP</Text>
        </View>
      ))}
      {!props.data.logs.length ? (
        <Empty title="还没有经验记录" detail="完成真实学习任务后，这里会展示经验来源。" />
      ) : null}
    </>
  );

  const heading = props.mode ? HEADINGS[props.mode] : ['', ''];
  return (
    <Modal
      visible={Boolean(props.mode)}
      transparent
      animationType={reduceMotion ? 'none' : 'fade'}
      onRequestClose={close}
    >
      <View style={s.modalRoot}>
        <MotionPressable
          accessibilityRole="button"
          accessibilityLabel="关闭个人工作台面板"
          onPress={close}
          disabled={busy}
          style={StyleSheet.absoluteFillObject}
        >
          <View style={s.backdrop} />
        </MotionPressable>
        <Animated.View
          accessibilityViewIsModal
          entering={reduceMotion ? undefined : FadeInDown.duration(240)}
          style={s.sheet}
        >
          <LinearGradient colors={['#F0F7FF', '#FFFFFF', '#F9F7FF']} style={StyleSheet.absoluteFillObject} />
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.eyebrow}>MY PERSONAL SPACE</Text>
              <Text style={s.title}>{heading[0]}</Text>
              <Text style={s.detail}>{heading[1]}</Text>
            </View>
            <MotionPressable
              accessibilityRole="button"
              accessibilityLabel="收起个人工作台"
              onPress={close}
              disabled={busy}
              style={s.iconButton}
            >
              <X size={23} color="#395A7C" />
            </MotionPressable>
          </View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={s.body}
            >
              {props.loading ? (
                <View style={s.row}>
                  <ActivityIndicator color="#1677ED" />
                  <Text style={s.detail}>正在同步个人资料…</Text>
                </View>
              ) : null}
              {props.dataError ? (
                <Card tint="#FFF4EF">
                  <Text style={s.error}>{props.dataError}</Text>
                  <Action
                    label="重新加载资料"
                    subtle
                    disabled={busy || props.loading}
                    onPress={props.onReload}
                  />
                </Card>
              ) : null}
              {error ? (
                <Text accessibilityRole="alert" style={s.error}>
                  {error}
                </Text>
              ) : null}
              {notice ? (
                <Text accessibilityLiveRegion="polite" style={s.notice}>
                  {notice}
                </Text>
              ) : null}
              {props.mode === 'identity' ? (
                renderIdentity()
              ) : props.mode === 'calendar' ? (
                renderCalendar()
              ) : props.mode === 'expressions' ? (
                renderExpressions()
              ) : props.mode === 'collections' ? (
                renderCollections()
              ) : props.mode === 'diary' ? (
                renderDiary()
              ) : props.mode === 'preferences' ? (
                renderPreferences()
              ) : props.mode === 'badges' ? (
                renderBadges()
              ) : props.mode === 'level' ? (
                renderLevel()
              ) : props.mode === 'scenes' ? (
                <>
                  {props.data.records.map(renderRecord)}
                  {!props.data.records.length ? (
                    <Empty
                      title="还没有场景学习记录"
                      detail="完成拍照或文字场景学习后，真实记录会出现在这里。"
                    />
                  ) : null}
                  <Action label="探索全部开放场景" onPress={() => navigate('/(app)/scene-map', { returnTo: 'profile' })} />
                </>
              ) : null}
            </ScrollView>
          </KeyboardAvoidingView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  modalRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12 },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(24,47,75,0.26)',
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(10px)' } as any) : {}),
  },
  sheet: {
    width: '100%',
    maxWidth: 640,
    height: '92%',
    maxHeight: 860,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    backgroundColor: '#F7FAFF',
    shadowColor: '#214E80',
    shadowOpacity: 0.22,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 14 },
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderColor: '#E2EBF5',
    gap: 12,
  },
  eyebrow: { fontSize: 10, letterSpacing: 2, color: '#2585DC', fontWeight: '800', marginBottom: 6 },
  title: { fontSize: 23, fontWeight: '900', color: '#11233D' },
  body: { padding: 18, gap: 12, paddingBottom: 30 },
  card: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E0EAF5',
    backgroundColor: 'rgba(255,255,255,0.92)',
    gap: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 6,
  },
  avatar: { width: 66, height: 66, borderRadius: 20 },
  largeTitle: { fontSize: 22, fontWeight: '900', color: '#142C48' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#203A57' },
  detail: { fontSize: 13, lineHeight: 21, color: '#5C718A', marginTop: 3 },
  caption: { fontSize: 11, lineHeight: 18, color: '#74889F' },
  action: {
    minHeight: 44,
    paddingHorizontal: 15,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#1679EF',
  },
  actionSubtle: { backgroundColor: '#EAF3FF' },
  actionText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: '#F0F4F9',
    borderWidth: 1,
    borderColor: '#E1E8F1',
  },
  selected: { backgroundColor: '#DCEEFF', borderColor: '#2388EE' },
  optionText: { fontSize: 13, color: '#224C7B', fontWeight: '700' },
  label: { fontSize: 14, fontWeight: '800', color: '#264466', marginTop: 7 },
  input: {
    minHeight: 48,
    padding: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#C8DCF1',
    borderRadius: 15,
    fontSize: 15,
    color: '#203A57',
  },
  diaryInput: { minHeight: 230, textAlignVertical: 'top', lineHeight: 24 },
  diaryText: { fontSize: 15, lineHeight: 26, color: '#344561' },
  iconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF2FB',
    borderRadius: 21,
  },
  calendar: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: '14.2857%',
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  dayDot: { width: 4, height: 4, borderRadius: 2, marginTop: 4 },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1EAF4',
  },
  recordImage: { width: 62, height: 68, borderRadius: 13 },
  placeholder: { backgroundColor: '#E9F3FF', alignItems: 'center', justifyContent: 'center' },
  cover: { width: '100%', height: 190, borderRadius: 15 },
  blue: { fontSize: 15, fontWeight: '900', color: '#1676DB' },
  error: { color: '#B03D36', fontSize: 13, lineHeight: 21 },
  notice: {
    color: '#12815B',
    fontSize: 13,
    lineHeight: 21,
    padding: 12,
    backgroundColor: '#EAF9F1',
    borderRadius: 13,
  },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  levelDot: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  levelNumber: { color: '#FFFFFF', fontWeight: '900', fontSize: 16 },
});
