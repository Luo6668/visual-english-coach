import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { deleteDiary, fetchDiaries, fetchLearningRecords, invokeEdgeFunction, saveDiary, updateDiary } from '@/lib/api';
import { diaryWritingRequest, validateDiaryWriting } from '../../../supabase/functions/_shared/diary-writing.mjs';
import { candidateCurrent, dateKey, decodeDraft, draftFromEntry, draftSignature, emptyDraft, inWeek, recordDate, restoreDraft, weekStart } from './model.mjs';
export type DiaryMode = 'natural' | 'simple' | 'polished';
export type Expression = { english: string; chinese: string; note: string };
export type Candidate = { source: string; content: string; expressions: Expression[] };
export type DiaryDraft = { source: string; mode: DiaryMode; candidates: Partial<Record<DiaryMode, Candidate>>; savedId: string; savedSignature: string; sourceKind?: string };
export type DiaryEntry = { id: string; diary_type: 'daily' | 'weekly'; content: string; study_date?: string; week_start?: string; created_at: string; source_text?: string; writing_mode?: DiaryMode; source_kind?: string; learning_expressions?: Expression[] };
export type DiaryRecord = { id: string; scene_name: string; i_see?: string; i_think?: string; i_say?: string; created_at: string };
const keyFor = (owner: string, scope: string) => `vec.diary.draft.v2.${encodeURIComponent(owner)}.${scope}`;
async function readDraft(key: string) { return Platform.OS === 'web' ? localStorage.getItem(key) : (await import('expo-sqlite/kv-store')).default.getItemAsync(key); }
const writes = new Map<string, Promise<void>>();
async function writeDraft(key: string, draft: DiaryDraft) {
  const raw = JSON.stringify({ version: 1, draft });
  const task = (writes.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
    if (Platform.OS === 'web') localStorage.setItem(key, raw);
    else await (await import('expo-sqlite/kv-store')).default.setItemAsync(key, raw);
  });
  writes.set(key, task);
  try { await task; } finally { if (writes.get(key) === task) writes.delete(key); }
}
export function useDiaryEditor(owner: string, date: string, type: 'daily' | 'weekly') {
  const scope = `${type}.${type === 'daily' ? date : weekStart(date)}`;
  const identity = `${owner}:${scope}`;
  const live = useRef(identity); live.current = identity;
  const [data, setData] = useState<{ owner: string; entries: DiaryEntry[]; records: DiaryRecord[] } | null>(null);
  const [draft, setDraft] = useState<DiaryDraft>(emptyDraft);
  const [readyKey, setReadyKey] = useState('');
  const [loadError, setLoadError] = useState(''); const [error, setError] = useState(''); const [storageError, setStorageError] = useState(''); const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true); const [generating, setGenerating] = useState(false); const [saving, setSaving] = useState(false);
  const [draftStatus, setDraftStatus] = useState('');
  const request = useRef(0); const saveLock = useRef(false); const mounted = useRef(true); const dirtyVersion = useRef(0);
  const latest = useRef(draft); latest.current = draft;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current++; }; }, []);
  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    const targetOwner = owner;
    try {
      const [entries, records] = await Promise.all([fetchDiaries(), fetchLearningRecords()]);
      if (mounted.current && live.current.startsWith(`${targetOwner}:`)) setData({ owner: targetOwner, entries, records });
    } catch { if (mounted.current && live.current.startsWith(`${targetOwner}:`)) setLoadError('暂时无法读取已保存日记，请检查服务后重试；本机草稿不会被清除。'); }
    finally { if (mounted.current && live.current.startsWith(`${targetOwner}:`)) setLoading(false); }
  }, [owner]);
  useEffect(() => { if (owner) void load(); }, [owner, load]);
  const entries = data?.owner === owner ? data.entries : [];
  const records = data?.owner === owner ? data.records : [];
  const existing = entries.find(item => item.diary_type === type && (type === 'daily' ? item.study_date === date : item.week_start === weekStart(date)));
  const entryId = existing?.id || '';
  useEffect(() => {
    let active = true; request.current++; setGenerating(false); setReadyKey(''); setError(''); setStorageError(''); setNotice(''); setDraftStatus('');
    if (!owner || loading || loadError || data?.owner !== owner) return;
    const key = keyFor(owner, scope);
    void (async () => {
      try {
        await writes.get(key)?.catch(() => {});
        const stored = decodeDraft(await readDraft(key));
        if (!active || !mounted.current || live.current !== identity) return;
        setDraft(restoreDraft(stored, existing)); setReadyKey(identity);
        if (stored) setDraftStatus('已恢复本机草稿');
      } catch (e) { if (active && live.current === identity) { setStorageError(e instanceof Error ? e.message : '草稿读取失败'); setDraft(existing ? draftFromEntry(existing) : emptyDraft()); setReadyKey(identity); setDraftStatus('草稿读取失败，本次未启用自动覆盖'); } }
    })();
    return () => { active = false; request.current++; };
    // Content is intentionally not a dependency: a successful save must not reset the editor.
  }, [identity, scope, owner, loading, loadError, data?.owner, entryId]);
  const ready = readyKey === identity;
  useEffect(() => {
    if (!ready || storageError) return;
    const key = keyFor(owner, scope); const version = dirtyVersion.current;
    setDraftStatus('正在保留草稿…');
    void writeDraft(key, draft).then(() => { if (mounted.current && live.current === identity && dirtyVersion.current === version) setDraftStatus('草稿已保留在此设备'); }).catch(() => { if (mounted.current && live.current === identity) { setStorageError('草稿暂未保存到此设备，请保留当前内容并重试'); setDraftStatus('草稿保存失败'); } });
  }, [draft, ready, identity, owner, scope, storageError]);
  const change = (fn: (value: DiaryDraft) => DiaryDraft) => {
    request.current++; dirtyVersion.current++; setGenerating(false); setError(''); setNotice(''); setDraft(fn);
  };
  const generate = async (summarize = false) => {
    if (!ready || saving || generating) return;
    const current = latest.current; const token = ++request.current; const target = identity;
    setGenerating(true); setError(''); setNotice('');
    const week = weekStart(date);
    const inputBody = summarize ? { action: 'weekly', mode: current.mode, diaries: entries.filter(item => item.diary_type === 'daily' && inWeek(item.study_date || '', week)), records: records.filter(item => inWeek(recordDate(item.created_at), week)) } : { action: 'translate', mode: current.mode, source: current.source };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const input = diaryWritingRequest(inputBody);
      const response = await Promise.race([invokeEdgeFunction('diary', inputBody), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('等待英语生成超时，原文和旧预览仍保留，请重试')), 60000); })]);
      const result = validateDiaryWriting(response, input);
      if (!mounted.current || live.current !== target || token !== request.current) return;
      const source = summarize ? result.source_text : current.source;
      dirtyVersion.current++;
      setDraft(value => ({ ...value, source, sourceKind: summarize ? 'weekly' : value.sourceKind || 'written', candidates: { ...value.candidates, [current.mode]: { source, content: result.content, expressions: result.expressions } } }));
      setNotice('英语预览已生成，确认后才会保存到日记。');
    } catch (e) { if (mounted.current && live.current === target && token === request.current) setError(e instanceof Error && !/failed to fetch|network/i.test(e.message) ? e.message : '暂时无法连接日记服务，原文已保留，请重试'); }
    finally { if (timer) clearTimeout(timer); if (mounted.current && live.current === target && token === request.current) setGenerating(false); }
  };
  const save = async () => {
    const value = latest.current;
    if (!ready || saveLock.current || !candidateCurrent(value) || loading || loadError) return;
    saveLock.current = true; setSaving(true); setError(''); const target = identity;
    const candidate = value.candidates[value.mode]!;
    try {
      const payload = { content: candidate.content.trim(), source_text: value.source, writing_mode: value.mode, source_kind: value.sourceKind || (existing?.source_kind ?? 'written'), learning_expressions: candidate.expressions.filter(item => candidate.content.includes(item.english)) };
      const fresh = await fetchDiaries();
      if (!mounted.current || live.current !== target) return;
      const sameDay = fresh.find(item => item.diary_type === type && (type === 'daily' ? item.study_date === date : item.week_start === weekStart(date)));
      const id = value.savedId || sameDay?.id || existing?.id;
      let savedId = id;
      if (id) await updateDiary(id, payload);
      else { const result = await saveDiary({ ...payload, diary_type: type, ...(type === 'daily' ? { study_date: date } : { week_start: weekStart(date) }) }); savedId = result?.id; }
      if (!mounted.current || live.current !== target) return;
      const saved = { ...value, savedId: savedId || '', savedSignature: draftSignature(value) };
      setDraft(saved); setNotice('日记已保存；日期与中文原文一并保留。');
      // Keep focus/selection stable; refreshing the collection must not discard this draft.
      try { const updated = await fetchDiaries(); if (mounted.current && live.current === target) setData(previous => previous?.owner === owner ? { ...previous, entries: updated } : previous); } catch { /* The save succeeded; a list refresh failure must not claim otherwise. */ }
    } catch { if (mounted.current && live.current === target) setError('日记未能保存，请重试；当前草稿和英语预览仍保留。'); }
    finally { saveLock.current = false; if (mounted.current) setSaving(false); }
  };
  const remove = async () => {
    const id = latest.current.savedId || existing?.id; if (!id || saveLock.current || !ready) return;
    const target = identity; saveLock.current = true; setSaving(true); setError('');
    try {
      await deleteDiary(id);
      await writeDraft(keyFor(owner, scope), emptyDraft());
      if (!mounted.current || live.current !== target) return;
      setDraft(emptyDraft()); setData(previous => previous ? { ...previous, entries: previous.entries.filter(item => item.id !== id) } : previous); setNotice('日记已删除。');
    } catch { if (mounted.current && live.current === target) setError('删除或本机草稿清理未完成，请刷新后核对；未清除其他日期。'); }
    finally { saveLock.current = false; if (mounted.current) setSaving(false); }
  };
  return { draft, ready, entries, records, existing, remove, loading, generating, saving, error, loadError, notice, storageError, draftStatus, current: candidateCurrent(draft), saved: draftSignature(draft) === draft.savedSignature, load, change, generate, save, retryDraft: () => setStorageError('') };
}
