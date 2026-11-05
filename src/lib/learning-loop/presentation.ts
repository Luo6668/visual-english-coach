import type { ExpressionFeedback } from './model';
/** User-selected choices, with source wording preserved and Chinese explanations omitted. */
export function expressionChoices(text: string): string[] {
  const clean = text.replace(/\*\*/g, '').replace(/^#{1,3}\s*/gm, '');
  const pieces = clean.split(/[\u3400-\u9fff\n]+/).flatMap(part => part.match(/[A-Za-z](?:\.(?=\d)|[^.!?\n])*(?:[.!?](?=\s|["”’]|$)|$)/g) || []);
  const seen = new Set<string>();
  return pieces.map(value => value.trim().replace(/^(?:you can say|try saying|i['’]d say|example)\s*:\s*/i, '').replace(/^["“]|["”]$/g, '').trim())
    .filter(value => value.split(/\s+/).length >= 2 && !/^(?:of course|sure|absolutely|certainly|okay|ok|great|nice)[.!?]*$/i.test(value) && value.length <= 240)
    .filter(value => { const key = value.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 4);
}
export function feedbackLabel(feedback: ExpressionFeedback): string | null {
  if (feedback.kind === 'none') return null;
  return feedback.kind === 'natural' ? '有个更自然的说法' : '这一处可以修改';
}
