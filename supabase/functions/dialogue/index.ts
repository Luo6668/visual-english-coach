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

    const { scene, messages = [] } = await req.json()

    const chatHistory = messages.map((m: any) => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.content,
    }))

    const systemPrompt = `你是沉浸式英语场景对话练习助手。
当前场景：${scene}

任务：
1. 扮演该场景中最合适的角色（服务员、店员、工作人员等），用自然地道的英语对话
2. 首条消息（对话为空时）：直接用英语打招呼并引导用户
3. 对用户回复进行判断，严格按JSON返回：
{
  "content": "AI角色的英语回复",
  "isNatural": true/false,
  "suggestion": "更好的表达（isNatural为true则为空字符串）",
  "feedback": "一句中文简评（鼓励为主）"
}

注意：保持角色扮演，回复简洁，推进对话节奏。`

    const openaiMessages = [
      { role: 'system', content: systemPrompt },
      ...chatHistory,
    ]

    if (messages.length === 0) {
      openaiMessages.push({ role: 'user', content: '（请开始对话，用英语打招呼并引导我）' })
    }

    const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: openaiMessages,
        temperature: 0.8,
        max_tokens: 300,
        response_format: { type: 'json_object' },
      }),
    })

    if (!res.ok) throw new Error(`DeepSeek API error ${res.status}: ${await res.text()}`)

    const data = await res.json()
    const result = JSON.parse(data.choices?.[0]?.message?.content || '{}')

    return new Response(JSON.stringify({
      role: 'ai',
      content: result.content || 'Hello! How can I help you?',
      isNatural: result.isNatural ?? true,
      suggestion: result.suggestion || '',
      feedback: result.feedback || '继续加油！',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
