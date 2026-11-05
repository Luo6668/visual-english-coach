import { invokeEdgeFunction } from '@/lib/api';
import type { AssistResult, TaskGoal } from './model';
export type AssistAction = 'keywords' | 'example' | 'simplify' | 'feedback';
export type AssistInput = { action: AssistAction; text: string; partner: string; scene: string; tasks: TaskGoal[] };
export async function requestLearningAssist(input: AssistInput): Promise<AssistResult> {
  // The UI ignores superseded results; timeout also bounds a disconnected service.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      invokeEdgeFunction('learning-assist', input),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('学习反馈等待超时，请重试；当前对话已保留')), 30000); }),
    ]);
    if (!value || !Array.isArray(value.completedTasks) || typeof value.hint !== 'string') throw new Error('学习反馈格式异常，请重试');
    return value;
  } finally { if (timer) clearTimeout(timer); }
}
