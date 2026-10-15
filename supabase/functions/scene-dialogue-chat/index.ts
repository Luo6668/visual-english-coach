import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { authenticateRequest } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 每个场景的 AI 角色设定
const SCENE_ROLES: Record<string, { roleZh: string; roleEn: string; userRoleZh: string; opener: string }> = {
  'coffee-shop':    { roleZh: '咖啡馆收银员', roleEn: 'barista', userRoleZh: '顾客', opener: "Hi there! Welcome to our café. What can I get for you today?" },
  'airport':        { roleZh: '机场地勤人员', roleEn: 'check-in staff', userRoleZh: '旅客', opener: "Good morning! May I see your passport and booking confirmation, please?" },
  'hotel':          { roleZh: '酒店前台', roleEn: 'hotel receptionist', userRoleZh: '入住客人', opener: "Welcome to Grand Hotel! Do you have a reservation with us?" },
  'supermarket':    { roleZh: '超市收银员', roleEn: 'cashier', userRoleZh: '顾客', opener: "Hi! Did you find everything you were looking for today?" },
  'restaurant':     { roleZh: '餐厅服务员', roleEn: 'waiter', userRoleZh: '顾客', opener: "Good evening! Table for how many? And do you have a reservation?" },
  'hospital':       { roleZh: '诊所护士', roleEn: 'clinic nurse', userRoleZh: '患者', opener: "Hello, how can I help you today? What seems to be the problem?" },
  'library':        { roleZh: '图书馆管理员', roleEn: 'librarian', userRoleZh: '读者', opener: "Hello! Are you looking for something specific today, or just browsing?" },
  'subway':         { roleZh: '地铁站工作人员', roleEn: 'subway staff', userRoleZh: '乘客', opener: "Hi there! Do you need help finding your way on the subway?" },
  'meeting':        { roleZh: '项目经理同事', roleEn: 'project manager', userRoleZh: '团队成员', opener: "Good morning, everyone! Let's get started. Can you give us a quick update on your progress?" },
  'email':          { roleZh: '英语写作助手', roleEn: 'writing coach', userRoleZh: '邮件撰写者', opener: "Let's practice writing a professional email. What's the purpose of the email you'd like to write?" },
  'interview':      { roleZh: 'HR 面试官', roleEn: 'HR interviewer', userRoleZh: '面试者', opener: "Thank you for coming in today. Could you start by telling me a little about yourself?" },
  'negotiation':    { roleZh: '商务谈判对方代表', roleEn: 'business counterpart', userRoleZh: '谈判代表', opener: "Good afternoon. I've reviewed your proposal. Shall we discuss the key terms?" },
  'office':         { roleZh: '外籍同事', roleEn: 'foreign colleague', userRoleZh: '同事', opener: "Hey! Are you joining us for the team lunch today?" },
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
    const { messages, sceneId, sceneNameZh, sceneNameEn, dialogueGoal, currentRound, requiredRounds, isFinalRound } = await req.json() as {
      messages: ChatMessage[]
      sceneId: string
      sceneNameZh: string
      sceneNameEn: string
      dialogueGoal?: string
      currentRound?: number
      requiredRounds?: number
      isFinalRound?: boolean
    }

    const apiKey = Deno.env.get('DEEPSEEK_API_KEY')
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY not configured')

    const role = SCENE_ROLES[sceneId] ?? {
      roleZh: '场景助手', roleEn: 'assistant', userRoleZh: '用户',
      opener: "Hello! Let's practice English together.",
    }

    const maxRounds = Math.max(1, Number(requiredRounds) || 5)
    const safeCurrentRound = Math.max(1, Math.min(Number(currentRound) || 1, maxRounds))
    const shouldFinish = isFinalRound === true || safeCurrentRound >= maxRounds
    const roundInstruction = shouldFinish
      ? `当前是第 ${safeCurrentRound}/${maxRounds} 轮，也是本轮最后一次回复。必须自然完成当前场景，用1到2句英语礼貌收尾；不要再提问，不要邀请用户继续回答。`
      : `当前是第 ${safeCurrentRound}/${maxRounds} 轮，请自然推进对话。`

    const systemPrompt = `你是一个专业的英语口语练习助手，现在正在扮演「${sceneNameZh}（${sceneNameEn}）」场景中的${role.roleZh}（${role.roleEn}）角色。

用户扮演${role.userRoleZh}角色，与你进行真实场景英语对话练习。

扮演规则：
1. 主要用英语进行自然对话，保持角色设定
2. 当用户的英语表达不够地道时，在回复末尾用中文括号温和提示更好的说法，例如：（更地道：I'd like a latte, please.）
3. 如果用户用中文回复，用中文鼓励他尝试用英语，并给出参考句型
4. 对话要自然流畅，模拟真实场景
5. 每轮回复不超过3句话，保持对话节奏
6. 偶尔加入场景细节让对话更真实（如菜单、价格、排队、天气等）
7. ${roundInstruction}

当前场景：${sceneNameZh}（${sceneNameEn}）
练习目标：${dialogueGoal || '完成当前场景中的主要沟通任务'}`

    const payload = {
      model: 'deepseek-chat',
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      temperature: 0.8,
      max_tokens: 400,
    }

    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    })

    if (!upstream.ok) throw new Error(`DeepSeek error ${upstream.status}`)

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
    console.error('scene-dialogue-chat error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

function serve(handler: (req: Request) => Promise<Response>) {
  // @ts-ignore
  Deno.serve(handler)
}
