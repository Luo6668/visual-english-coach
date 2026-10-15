import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { authenticateRequest } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const { error: authError } = await authenticateRequest(req)
  if (authError) return authError

  try {
    const { text, targetLang = 'zh' } = await req.json()

    if (!text) {
      return new Response(JSON.stringify({ error: 'text is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiKey = Deno.env.get('DEEPSEEK_API_KEY')
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY not configured')

    const langMap: Record<string, string> = {
      zh: '中文（简体）',
      en: '英文',
      ja: '日文',
      ko: '韩文',
    }
    const targetLangName = langMap[targetLang] || '中文（简体）'

    const prompt = `请将以下英文句子翻译成${targetLangName}，只返回译文本身，不要添加任何解释或标注：\n\n${text}`

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 300,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`DeepSeek API error: ${response.status} ${errText}`)
    }

    const data = await response.json()
    const translation = data.choices?.[0]?.message?.content?.trim() ?? ''

    return new Response(
      JSON.stringify({ translation }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('translate function error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
