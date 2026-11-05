import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { authenticateRequest } from '../_shared/auth.ts';
import { sentenceRequest, sentenceMessages, validateSentenceDetail } from '../_shared/sentence-detail.mjs';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' };
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const { error } = await authenticateRequest(req, 20000);
  if (error) return error;
  try {
    const input = sentenceRequest(await req.json());
    const key = Deno.env.get('DEEPSEEK_API_KEY');
    if (!key) throw new Error('句子解析服务尚未配置');
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: 'deepseek-chat', messages: sentenceMessages(input), response_format: { type: 'json_object' }, temperature: 0.2, max_tokens: 3000 }),
      signal: AbortSignal.timeout(55000),
    });
    if (!response.ok) throw new Error('句子解析服务暂不可用，请稍后重试');
    const data = await response.json();
    const result = validateSentenceDetail(JSON.parse(data.choices?.[0]?.message?.content || '{}'), input);
    return new Response(JSON.stringify(result), { headers: cors });
  } catch (error) { return new Response(JSON.stringify({ error: error instanceof Error ? error.message : '句子解析失败，请重试' }), { status: 400, headers: cors }); }
});
