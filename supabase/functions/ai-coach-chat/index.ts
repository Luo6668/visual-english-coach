import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { coachSystem } from '../_shared/coach-system.mjs'
import { authenticateRequest } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}



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
    const { messages, scene, coachMode } = await req.json() as {
      messages: ChatMessage[]
      scene?: string
      coachMode?: 'practice' | 'chat'
    }

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'messages required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiKey = Deno.env.get('DEEPSEEK_API_KEY')
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY not configured')

    // Build system message (optionally inject scene context)
    const systemContent = coachSystem(coachMode, scene)

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
