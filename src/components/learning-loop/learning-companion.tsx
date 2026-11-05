import { useEffect, useRef, useState } from 'react';
import { requestLearningAssist, type AssistAction, type AssistInput } from '@/lib/learning-loop/assistant';
import { mergeTaskEvidence, type ExpressionFeedback, type TaskEvidence, type TaskGoal } from '@/lib/learning-loop/model';
export type LearningTurn = { id: string; text: string; partner: string; method: 'typed' | 'voice' };
export type FeedbackRecord = { turn: LearningTurn; feedback: ExpressionFeedback; assisted: boolean };
/** Request state lives beside the conversation, independently of where tools are displayed. */
export function useLearningCompanion({ scene, tasks = [], draft, partner, turn, sessionKey, submissionKey, active = true, autoFeedback = true, disabled = false }: {
  scene: string; tasks?: TaskGoal[]; draft: string; partner: string; turn?: LearningTurn;
  sessionKey: string | number; submissionKey?: string; active?: boolean; autoFeedback?: boolean; disabled?: boolean;
}) {
  const [feedbackByTurn, setFeedbackByTurn] = useState<Record<string, FeedbackRecord>>({});
  const [evidence, setEvidence] = useState<TaskEvidence[]>([]);
  const [hint, setHint] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const operation = useRef(0);
  const scope = useRef(0);
  const alive = useRef(true);
  const enabled = useRef(active); enabled.current = active;
  const inFlight = useRef(false);
  const assisted = useRef(false);
  const handledTurn = useRef<string | null>(null);
  const assistedByTurn = useRef<Record<string, boolean>>({});
  const lastRequest = useRef<{ input: AssistInput; source?: LearningTurn; usedHint: boolean } | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; operation.current++; }; }, []);
  useEffect(() => {
    scope.current++; operation.current++; inFlight.current = false; assisted.current = false; handledTurn.current = null; assistedByTurn.current = {};
    lastRequest.current = null; setFeedbackByTurn({}); setEvidence([]); setHint(''); setError(''); setBusy(false); setHelpOpen(false);
  }, [sessionKey]);
  useEffect(() => {
    setHelpOpen(false); setHint(''); setError('');
    if (lastRequest.current?.input.action !== 'feedback') { operation.current++; inFlight.current = false; setBusy(false); lastRequest.current = null; }
  }, [submissionKey]);
  useEffect(() => {
    if (!active) { operation.current++; inFlight.current = false; setBusy(false); setHelpOpen(false); }
  }, [active]);
  const run = async (input: AssistInput, source?: LearningTurn, usedHint = false) => {
    const request = ++operation.current; const startedScope = scope.current;
    inFlight.current = true; lastRequest.current = { input, source, usedHint }; setBusy(true); setError('');
    if (input.action !== 'feedback') setHint('');
    try {
      const result = await requestLearningAssist(input);
      if (!alive.current || !enabled.current || scope.current !== startedScope) return;
      if (input.action === 'feedback') setEvidence(old => mergeTaskEvidence(old, result.completedTasks));
      if (request !== operation.current) return;
      if (input.action === 'feedback' && source && result.feedback) {
        setFeedbackByTurn(old => ({ ...old, [source.id]: { turn: source, feedback: result.feedback!, assisted: usedHint } }));
      } else if (input.action !== 'feedback') { assisted.current = true; setHint(result.hint); }
    } catch (e) { if (request === operation.current && alive.current) setError(e instanceof Error ? e.message : '帮助暂不可用，请重试'); }
    finally { if (request === operation.current && alive.current) { inFlight.current = false; setBusy(false); } }
  };
  useEffect(() => {
    if (!turn || !active || disabled) return;
    const key = `${sessionKey}:${turn.id}`;
    if (handledTurn.current === key) return;
    handledTurn.current = key;
    const usedHint = assisted.current; assisted.current = false; assistedByTurn.current[turn.id] = usedHint;
    if (autoFeedback) void run({ action: 'feedback', text: turn.text, partner: turn.partner, scene, tasks }, turn, usedHint);
  }, [turn?.id, sessionKey, active, disabled, autoFeedback]);
  const requestFeedback = (source: LearningTurn) => {
    if (inFlight.current || disabled || !active) return;
    void run({ action: 'feedback', text: source.text, partner: source.partner, scene, tasks }, source, assistedByTurn.current[source.id] || false);
  };
  return {
    feedbackByTurn, evidence, busy, requestFeedback,
    helpProps: {
      hint, busy, disabled, partner, error, open: helpOpen,
      onToggle: () => setHelpOpen(value => !value), onClose: () => setHelpOpen(false),
      onAction: (action: AssistAction) => { if (!inFlight.current && !disabled && active) void run({ action, text: draft, partner, scene, tasks }); },
      canRetry: Boolean(lastRequest.current),
      onRetry: () => { if (!inFlight.current && lastRequest.current) { const last = lastRequest.current; void run(last.input, last.source, last.usedHint); } },
    },
  };
}
