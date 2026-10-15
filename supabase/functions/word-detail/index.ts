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

    const { word, scene } = await req.json()

    const systemPrompt = `你是专业英语词典助手。查询英文单词并按JSON格式返回：
{
  "word": "查询的单词",
  "phonetic": "国际音标，如 /ˈkɒfi/",
  "meaning": "中文释义，简洁明了",
  "partOfSpeech": "词性，如 noun / verb / adjective",
  "collocations": ["常见搭配1", "搭配2", "搭配3", "搭配4"],
  "examples": ["贴近生活的例句1", "例句2", "例句3"],
  "memoryTip": "一句中文记忆口诀或联想"
}
${scene ? `用户当前学习场景：${scene}，请让例句贴近此场景。` : ''}
注意：音标准确，词性用英文，例句简单自然。`

    const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `查询单词：${word}` },
        ],
        temperature: 0.3,
        max_tokens: 400,
        response_format: { type: 'json_object' },
      }),
    })

    if (!res.ok) throw new Error(`DeepSeek API error ${res.status}: ${await res.text()}`)

    const data = await res.json()
    const result = JSON.parse(data.choices?.[0]?.message?.content || '{}')

    return new Response(JSON.stringify({
      word: result.word || word,
      phonetic: result.phonetic || '/./',
      meaning: result.meaning || '暂无释义',
      partOfSpeech: result.partOfSpeech || 'unknown',
      collocations: Array.isArray(result.collocations) ? result.collocations : [],
      examples: Array.isArray(result.examples) ? result.examples : [],
      memoryTip: result.memoryTip || '',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
