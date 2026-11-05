import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { authenticateRequest } from '../_shared/auth.ts';
import { learningRequest, learningMessages, validateLearningResult } from '../_shared/learning-assist.mjs';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' };
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const { error } = await authenticateRequest(req, 20000);
  if (error) return error;
  try {
    const input = learningRequest(await req.json());
    const key = Deno.env.get('DEEPSEEK_API_KEY');
    if (!key) throw new Error('学习帮助服务尚未配置');
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: 'deepseek-chat', messages: learningMessages(input), response_format: { type: 'json_object' }, temperature: 0.2, max_tokens: 750 }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) throw new Error('学习帮助服务暂时不可用，请稍后重试');
    const data = await response.json();
    const result = validateLearningResult(JSON.parse(data.choices?.[0]?.message?.content ?? ''), input);
    return new Response(JSON.stringify(result), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : '学习帮助失败，请重试' }), { status: 400, headers: cors });
  }
});
