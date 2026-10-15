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
    const { text, voice_id, model, speed, emotion } = await req.json()
    if (!text) {
      return new Response(JSON.stringify({ error: 'text is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiKey = Deno.env.get('INTEGRATIONS_API_KEY')
    if (!apiKey) throw new Error('INTEGRATIONS_API_KEY not configured')

    const voiceSetting: Record<string, unknown> = {
      voice_id: voice_id ?? 'Wise_Woman',
      speed: speed ?? 0.9,
      vol: 1,
    }
    if (emotion) voiceSetting.emotion = emotion

    const requestBody = {
      model: model ?? 'speech-02-turbo',
      text,
      stream: false,
      output_format: 'url',
      voice_setting: voiceSetting,
      audio_setting: { format: 'mp3', sample_rate: 32000, bitrate: 128000 },
      language_boost: 'English',
    }

    const upstream = await fetch(
      'https://app-cf15398uqfpd-api-DLEO7Bj0lORa-gateway.appmiaoda.com/v1/t2a_v2',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gateway-Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      }
    )

    if (!upstream.ok) {
      const errText = await upstream.text()
      throw new Error(`Upstream error ${upstream.status}: ${errText}`)
    }

    const result = await upstream.json()

    if (result.base_resp?.status_code !== 0) {
      throw new Error(`TTS error ${result.base_resp?.status_code}: ${result.base_resp?.status_msg}`)
    }

    const audioUrl = result.data?.audio
    if (!audioUrl) throw new Error('No audio URL in response')

    // 中转下载音频字节，避免 OSS 直链被浏览器/WebView 拦截 (403/CORS)
    const audioRes = await fetch(audioUrl)
    if (!audioRes.ok) throw new Error(`Audio fetch failed: ${audioRes.status}`)
    const audioBytes = await audioRes.arrayBuffer()
    const base64 = btoa(String.fromCharCode(...new Uint8Array(audioBytes)))
    const audioData = `data:audio/mp3;base64,${base64}`

    return new Response(
      JSON.stringify({
        audioData,
        audioLength: result.extra_info?.audio_length ?? 0,
        usageCharacters: result.extra_info?.usage_characters ?? 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('tts-minimax error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } ,
    })
  }
})
