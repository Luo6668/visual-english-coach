import { sentenceRequest, validateSentenceDetail } from '../../supabase/functions/_shared/sentence-detail.mjs';
import { invokeEdgeFunction } from './api';
import { cachedQuery, invalidateQueries, queryKey } from './query-cache';
type BilingualExample = { english: string; chinese: string };
export type SentenceDetail = {
  sentence: string; translation: string; explanation: string;
  structure: { text: string; role: string; explanation: string }[];
  grammar: { title: string; explanation: string }[];
  words: { text: string; lemma: string; phonetic: string; partOfSpeech: string; meaning: string; usage: string; forms: string[]; collocations: BilingualExample[]; examples: BilingualExample[] }[];
  alternatives: (BilingualExample & { difference: string })[];
};
const KEY = 'sentence-detail';
export function sentenceErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '句子解析失败，请重试';
  return /failed to fetch|networkerror|network request failed|load failed/i.test(message) ? '暂时无法连接句子解析服务，请检查网络后重试；原句仍保留。' : message;
}
export async function fetchSentenceDetail(sentence: string, scene = '', force = false): Promise<SentenceDetail> {
  const input = sentenceRequest({ sentence, scene });
  const key = queryKey(KEY, JSON.stringify(input));
  if (force) invalidateQueries([key]);
  return cachedQuery(key, async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const value = await Promise.race([
        invokeEdgeFunction('sentence-detail', input),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('句子解析等待超时，原句仍保留，请重试')), 60000); }),
      ]);
      return validateSentenceDetail(value, input);
    } catch (error) { throw new Error(sentenceErrorMessage(error)); }
    finally { if (timer) clearTimeout(timer); }
  }, 24 * 60 * 60_000);
}
