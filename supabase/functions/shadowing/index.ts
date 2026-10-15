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
    const { sentence } = await req.json()

    if (!sentence) {
      return new Response(JSON.stringify({ error: 'sentence is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiKey = Deno.env.get('DEEPSEEK_API_KEY')
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY not configured')

    // 调用 DeepSeek 对跟读句子进行专业口语评估（含逐词评分）
    const words = sentence.trim().replace(/[.,!?;:]/g, '').split(/\s+/)
    const prompt = `你是一位专业的英语口语教练，请对以下英语句子进行跟读（Shadowing）评估分析。

句子：「${sentence}」
单词列表：${JSON.stringify(words)}

请以JSON格式返回（用中文回复评语）：
{
  "score": <总分 0-100，整数>,
  "pronunciation": "<发音准确度简评，1-2句>",
  "rhythm": "<语调节奏简评，1-2句>",
  "wordScores": [
    { "word": "<原单词，保持原始大小写>", "score": <0-100整数>, "tip": "<该词发音要点，10字内，score<80时必填，否则可为空字符串>" }
  ],
  "weakWords": ["<发音需注意的单词1>", "<发音需注意的单词2>"],
  "strongPoints": "<本句的亮点，1句>",
  "suggestion": "<最重要的改进建议，1句>",
  "feedback": "<综合评语，2-3句，鼓励性语气>"
}

wordScores 必须按照单词列表顺序，每个单词都要有评分。
评分参考：90-100优秀，80-89良好，70-79一般，60-69需加强，60以下重点练习。
注意：只返回JSON，不要包含任何其他文字。`

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        max_tokens: 500,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`DeepSeek API error: ${response.status} ${errText}`)
    }

    const data = await response.json()
    const raw = data.choices?.[0]?.message?.content?.trim() ?? ''

    // 解析 JSON，容错处理
    let parsed: any = {}
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
    } catch {
      // fallback
    }

    const score = typeof parsed.score === 'number' ? Math.max(0, Math.min(100, parsed.score)) : 75
    const feedback = parsed.feedback || parsed.suggestion || '整体表现不错，继续保持练习！'
    const weakWords = Array.isArray(parsed.weakWords) ? parsed.weakWords : []
    const wordScores = Array.isArray(parsed.wordScores)
      ? parsed.wordScores.map((w: any) => ({
          word:  typeof w.word  === 'string' ? w.word  : '',
          score: typeof w.score === 'number' ? Math.max(0, Math.min(100, Math.round(w.score))) : 75,
          tip:   typeof w.tip   === 'string' ? w.tip   : '',
        }))
      : []
    const suggestion = parsed.suggestion || ''
    const pronunciation = parsed.pronunciation || ''
    const rhythm = parsed.rhythm || ''
    const strongPoints = parsed.strongPoints || ''

    return new Response(
      JSON.stringify({ score, feedback, weakWords, wordScores, suggestion, pronunciation, rhythm, strongPoints }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('shadowing function error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
