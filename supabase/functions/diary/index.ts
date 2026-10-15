import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { authenticateRequest } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DEEPSEEK_BASE = 'https://api.deepseek.com/v1'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const { error: authError } = await authenticateRequest(req)
  if (authError) return authError

  try {
    const apiKey = Deno.env.get('DEEPSEEK_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'DEEPSEEK_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { records, diaryType = 'daily' } = await req.json()

    if (!records || records.length === 0) {
      return new Response(JSON.stringify({ error: '没有可用的学习记录' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const recordSummaries = records.map((r: any, i: number) =>
      `${i + 1}. 场景：${r.scene_name}\n   场景描述：${r.i_see}\n   实用表达：${r.i_think}\n   地道开口：${r.i_say}`
    ).join('\n\n')

    const systemPrompt = diaryType === 'daily'
      ? `你是英语写作助手。根据用户今天的学习记录，用英文写一篇流畅自然的第一视角日记。
要求：
- 以 "Dear Diary," 开头，第一人称叙述今天的场景、感受和学到的表达
- 自然融入场景描述、实用表达和地道开口中的内容
- 语气轻松真实，约150-200词
- 积极乐观结尾
- 只返回日记正文`
      : `你是英语写作助手。根据用户本周学习记录，用英文写一篇 Weekly Story。
要求：
- 第一人称叙述本周走过的场景和学习历程
- 自然融入学习记录中的英文表达
- 语气轻松有趣，约200-250词
- 结尾展望下周、鼓励自己
- 只返回周记正文`

    const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `我的学习记录：\n\n${recordSummaries}\n\n请生成${diaryType === 'daily' ? '今日英语日记' : 'Weekly Story'}。` },
        ],
        temperature: 0.8,
        max_tokens: 500,
      }),
    })

    if (!res.ok) throw new Error(`DeepSeek API error ${res.status}: ${await res.text()}`)

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content?.trim() || ''

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
