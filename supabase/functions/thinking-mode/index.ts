import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { authenticateRequest } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 通义千问 DashScope OpenAI 兼容接口
const QWEN_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
// DeepSeek 文本接口（纯文字/中文输入降级用）
const DEEPSEEK_BASE = 'https://api.deepseek.com/v1'

const difficultyPrompts: Record<string, string> = {
  simple:   'A1-A2：场景描述8-14词，实用表达6-12词，地道开口8-14词，使用基础词汇和简单句型。',
  natural:  'B1-B2：场景描述8-14词，实用表达6-12词，地道开口10-18词，表达自然、日常、可直接使用。',
  advanced: 'C1-C2：场景描述8-14词，实用表达6-12词，地道开口12-20词，可使用更准确的搭配，但必须保持真实口语感。',
}

const sentenceKeys = ['i_see', 'i_think', 'i_say'] as const

function extractJson(text: string): any {
  try { return JSON.parse(text) } catch { /* ignore */ }
  const match = text.match(/\{[\s\S]*?\}(?=\s*$)/) || text.match(/\{[\s\S]*\}/)
  if (match) { try { return JSON.parse(match[0]) } catch { /* ignore */ } }
  return {}
}

function cleanGeneratedSentence(value: unknown, fallback: string, removeSpeechWrapper = false): string {
  let sentence = String(value || fallback).trim()
  if (removeSpeechWrapper) {
    sentence = sentence.replace(/^I(?:['’]d| would)\s+say\s*[:,]?\s*/i, '').trim()
  }
  return sentence
    .replace(/^["'“‘]+/, '')
    .replace(/["'”’]+$/, '')
    .trim()
}

function normalizeResult(value: any, fallbackScene: string) {
  const result = value && typeof value === 'object' ? value : {}
  return {
    scene_name: String(result.scene_name || fallbackScene || '学习场景').trim(),
    i_see: cleanGeneratedSentence(result.i_see, 'This is a useful everyday scene.'),
    i_think: cleanGeneratedSentence(result.i_think, 'Could you help me, please?'),
    i_say: cleanGeneratedSentence(result.i_say, 'Excuse me, could you help me with this, please?', true),
    words: Array.isArray(result.words)
      ? [...new Set(result.words.map((word: unknown) => String(word).trim().toLowerCase()).filter(Boolean))].slice(0, 8)
      : [],
  }
}

function regenerationInstruction(body: any): string {
  if (!body.currentResult || typeof body.currentResult !== 'object') return ''
  const current = normalizeResult(body.currentResult, body.scene)
  const currentJson = JSON.stringify({
    scene_name: current.scene_name,
    i_see: current.i_see,
    i_think: current.i_think,
    i_say: current.i_say,
  })
  if (sentenceKeys.includes(body.regenerateKey)) {
    return `\n当前内容：${currentJson}\n只替换 ${body.regenerateKey}，新句不能与当前句相同；另外两句和 scene_name 必须原样返回。`
  }
  if (body.regenerateAll) {
    return `\n当前内容：${currentJson}\n换一组新的三句，三句都要与当前内容不同，但场景保持一致。`
  }
  return ''
}

function preserveUnchangedFields(next: any, body: any) {
  if (!sentenceKeys.includes(body.regenerateKey) || !body.currentResult) return next
  const current = normalizeResult(body.currentResult, body.scene)
  for (const key of sentenceKeys) {
    if (key !== body.regenerateKey) next[key] = current[key]
  }
  next.scene_name = current.scene_name
  return next
}

function countEnglishWords(value: unknown): number {
  return String(value || '').match(/[a-z]+(?:['’-][a-z]+)*/gi)?.length || 0
}

function lengthViolations(result: any) {
  const rules = [
    { key: 'i_see', min: 8, max: 14 },
    { key: 'i_think', min: 6, max: 12 },
  ]
  return rules.filter(({ key, min, max }) => {
    const count = countEnglishWords(result[key])
    return count < min || count > max
  })
}

async function enforceLengths(
  initialResult: any,
  body: any,
  systemPrompt: string,
  qwenKey?: string,
  deepseekKey?: string,
) {
  let candidate = preserveUnchangedFields(initialResult, body)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const violations = lengthViolations(candidate)
    if (violations.length === 0) return candidate
    const requirements = violations
      .map(({ key, min, max }) => `${key} 必须为 ${min}-${max} 个英文单词`)
      .join('；')
    const useQwen = !!qwenKey
    const response = await fetch(`${useQwen ? QWEN_BASE : DEEPSEEK_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${useQwen ? qwenKey : deepseekKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: useQwen ? 'qwen-plus' : 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `下面内容不符合句长规则：${requirements}。只重写违规字段，其他字段原样返回；每句仍只表达一个目的。\n当前JSON：${JSON.stringify(candidate)}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      }),
    })
    if (!response.ok) throw new Error(`Text API error ${response.status}: ${await response.text()}`)
    const data = await response.json()
    const corrected = normalizeResult(
      extractJson(data.choices?.[0]?.message?.content || '{}'),
      candidate.scene_name,
    )
    const violationKeys = new Set(violations.map(({ key }) => key))
    for (const key of sentenceKeys) {
      if (!violationKeys.has(key)) corrected[key] = candidate[key]
    }
    corrected.scene_name = candidate.scene_name
    candidate = preserveUnchangedFields(corrected, body)
  }
  throw new Error('AI 未能按句长规则生成内容，请再试一次')
}

const SYSTEM_PROMPT = (difficulty: string) => `你是英语场景学习教练。根据真实场景生成“看场景、学表达、开口说”三步英语内容。

严格返回如下JSON，不加其他文字：
{
  "scene_name": "准确、简短的中文场景名",
  "i_see": "一句客观的英文场景描述",
  "i_think": "一句该场景中最常用、最容易马上使用的英文表达",
  "i_say": "一句更自然、更完整、可以直接对别人说的英文口语",
  "words": ["5-8个来自句子的重点英文单词或短语，使用小写"]
}

生成规则：
1. 三个字段都只能有一句英文，不要中文、标题、Markdown或解释。
2. 不要为了匹配字段而强制使用 I see、I think、I'd say 开头。
3. i_say 直接给出用户真正要说的话，不要写成 I'd say, "..." 或类似包装。
4. i_think 与 i_say 必须用途不同：前者简单常用，后者更完整自然。
5. 每句只表达一个沟通目的，适合朗读和跟读。
6. scene_name 必须真实反映图片或文字描述，不能猜测不存在的细节。
7. 默认始终只生成这三句，不增加第四句或第五句。

难度要求：${difficultyPrompts[difficulty] || difficultyPrompts.natural}`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { error: authError } = await authenticateRequest(req)
  if (authError) return authError

  try {
    const qwenKey     = Deno.env.get('DASHSCOPE_API_KEY')
    const deepseekKey = Deno.env.get('DEEPSEEK_API_KEY')

    if (!qwenKey && !deepseekKey) return new Response(
      JSON.stringify({ error: '请先配置 DASHSCOPE_API_KEY（通义千问）或 DEEPSEEK_API_KEY' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

    const requestBody = await req.json()
    const { scene, imageBase64, difficulty = 'natural', inputType = 'manual' } = requestBody
    const hasImage = typeof imageBase64 === 'string' && imageBase64.length > 500
    const sysPrompt = SYSTEM_PROMPT(difficulty)
    const regeneratePrompt = regenerationInstruction(requestBody)

    // ── 路径A：有图片 → 通义千问 qwen-vl-plus（多模态视觉） ──
    if (hasImage && qwenKey) {
      const vlMessages = [
        { role: 'system', content: sysPrompt },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
            { type: 'text', text: `请仔细识别图片中的真实场景，严格按JSON格式返回三步场景英语内容。${regeneratePrompt}` },
          ],
        },
      ]

      const vlRes = await fetch(`${QWEN_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${qwenKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen-vl-plus',
          messages: vlMessages,
          temperature: 0.7,
          max_tokens: 800,
        }),
      })

      if (vlRes.ok) {
        const vlData = await vlRes.json()
        const result = extractJson(vlData.choices?.[0]?.message?.content || '{}')
        if (result.scene_name && result.i_see) {
          const normalized = await enforceLengths(
            normalizeResult(result, scene?.trim()),
            requestBody,
            sysPrompt,
            qwenKey,
            deepseekKey,
          )
          return new Response(JSON.stringify({
            ...normalized,
            vision_used: true,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }
      } else {
        const errText = await vlRes.text()
        console.warn(`Qwen-VL error ${vlRes.status}:`, errText)
      }
    }

    // ── 路径B：文字/中文/无图降级 ──
    // 优先用千问文字模型，无千问 key 则用 DeepSeek
    let userContent: string
    if (inputType === 'photo' && !hasImage) {
      userContent = '用户拍了一张照片但图片无法上传（Web预览环境）。请生成一个通用日常场景的三步场景英语内容，JSON格式返回。'
    } else if (inputType === 'chinese') {
      userContent = `用户的中文场景描述：「${scene}」\n请识别场景类型并生成三步场景英语内容，JSON格式返回。`
    } else {
      userContent = `场景描述：${scene?.trim() || '日常室内场景'}\n请生成三步场景英语内容，JSON格式返回。`
    }
    userContent += regeneratePrompt

    const textMessages = [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: userContent },
    ]

    // 千问文字模型 qwen-plus（优先），否则 DeepSeek
    const useQwen = !!qwenKey
    const textApiBase = useQwen ? QWEN_BASE : DEEPSEEK_BASE
    const textApiKey  = useQwen ? qwenKey! : deepseekKey!
    const textModel   = useQwen ? 'qwen-plus' : 'deepseek-chat'

    const chatRes = await fetch(`${textApiBase}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${textApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: textModel,
        messages: textMessages,
        temperature: 0.7,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      }),
    })

    if (!chatRes.ok) throw new Error(`Text API error ${chatRes.status}: ${await chatRes.text()}`)

    const chatData = await chatRes.json()
    const result = extractJson(chatData.choices?.[0]?.message?.content || '{}')
    const normalized = await enforceLengths(
      normalizeResult(result, scene?.trim()),
      requestBody,
      sysPrompt,
      qwenKey,
      deepseekKey,
    )

    return new Response(JSON.stringify({
      ...normalized,
      vision_used: false,
      web_fallback: inputType === 'photo' && !hasImage,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
