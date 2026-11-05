import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { authenticateRequest } from '../_shared/auth.ts'
import { diaryWritingRequest, diaryWritingMessages, validateDiaryWriting } from '../_shared/diary-writing.mjs'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const { error } = await authenticateRequest(req); if (error) return error
  try {
    const input = diaryWritingRequest(await req.json())
    const key = Deno.env.get('DEEPSEEK_API_KEY'); if (!key) throw new Error('日记写作服务尚未配置')
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'deepseek-chat', messages: diaryWritingMessages(input), response_format: { type: 'json_object' }, temperature: 0.2, max_tokens: 3500 }), signal: AbortSignal.timeout(55000) })
    if (!response.ok) throw new Error('日记写作服务暂时不可用，请稍后重试')
    const data = await response.json()
    const result = validateDiaryWriting(JSON.parse(data.choices?.[0]?.message?.content || '{}'), input)
    return Response.json(result, { headers: cors })
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : '日记生成失败，请重试' }, { status: 400, headers: cors }) }
})
