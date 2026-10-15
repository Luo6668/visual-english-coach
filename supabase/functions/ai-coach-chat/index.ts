import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { authenticateRequest } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT = `你是 Visual English Coach——一位专业的英语思维训练教练，风格亲切、鼓励、专业。

你的职责：
1. 帮助用户用英语思维表达日常场景，而非翻译中文
2. 纠正语法与表达错误，但保持鼓励态度
3. 主动给出地道的英语短语和句型
4. 回答关于英语表达、发音、语法的问题
5. 模拟真实场景对话练习（咖啡馆、机场、办公室等）

回复规则：
- 适当中英混排：解释用中文，示例用英语
- 英语示例要加粗或用引号标注
- 回复简洁有力，不超过150字
- 每次回复末尾可以给出1个练习问题或延伸话题
- 对用户的英语输入，先给予正面肯定，再温和指出改进点`

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const { error: authError } = await authenticateRequest(req)
  if (authError) return authError

  try {
    const { messages, scene } = await req.json() as {
      messages: ChatMessage[]
      scene?: string
    }

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'messages required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiKey = Deno.env.get('DEEPSEEK_API_KEY')
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY not configured')

    // Build system message (optionally inject scene context)
    const systemContent = scene
      ? `${SYSTEM_PROMPT}\n\n当前用户正在练习场景：「${scene}」，请围绕此场景展开对话。`
      : SYSTEM_PROMPT

    const payload = {
      model: 'deepseek-chat',
      stream: true,
      messages: [
        { role: 'system', content: systemContent },
        ...messages,
      ],
      temperature: 0.7,
      max_tokens: 512,
    }

    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!upstream.ok) {
      const errText = await upstream.text()
      throw new Error(`DeepSeek error ${upstream.status}: ${errText}`)
    }

    // Pipe SSE stream back to client directly
    const { readable, writable } = new TransformStream()
    upstream.body!.pipeTo(writable)

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    })

  } catch (error) {
    console.error('ai-coach-chat error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// Deno serve shim
function serve(handler: (req: Request) => Promise<Response>) {
  // @ts-ignore Deno global
  Deno.serve(handler)
}
