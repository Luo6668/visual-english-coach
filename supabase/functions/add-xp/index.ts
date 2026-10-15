import { createClient } from 'jsr:@supabase/supabase-js@2';

// 等级阈值（与前端保持一致）
const LEVELS = [
  { level: 1,  minXp: 0    },
  { level: 2,  minXp: 100  },
  { level: 3,  minXp: 300  },
  { level: 4,  minXp: 600  },
  { level: 5,  minXp: 1000 },
  { level: 6,  minXp: 1500 },
  { level: 7,  minXp: 2100 },
  { level: 8,  minXp: 2800 },
  { level: 9,  minXp: 3600 },
  { level: 10, minXp: 5000 },
];

function calcLevel(totalXp: number): number {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (totalXp >= LEVELS[i].minXp) return LEVELS[i].level;
  }
  return 1;
}

function getReward(source: string): number | null {
  if (source === 'daily_checkin') return 5;
  if (!/^[\p{L}\p{N} _-]{1,160}$/u.test(source)) return null;
  if (source.startsWith('scene_analysis_')) return 20;
  if (source.startsWith('dialogue_')) return 30;
  if (source.startsWith('shadowing_')) return 25;
  if (source.startsWith('translation_')) return 5;
  if (source.startsWith('learning_scene_')) return 10;
  return null;
}

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 从 JWT 获取 user_id
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const { source } = await req.json() as { source?: string };
    const xpAmount = typeof source === 'string' ? getReward(source) : null;
    if (!source || xpAmount === null) {
      return new Response(JSON.stringify({ error: '参数错误' }), { status: 400, headers: corsHeaders });
    }

    // 获取或初始化 user_stats
    const { data: existing } = await supabase
      .from('user_stats')
      .select('total_xp, current_level, streak_days, last_checkin_date')
      .eq('user_id', user.id)
      .maybeSingle();

    const today = new Date().toISOString().split('T')[0];
    const todayStart = `${today}T00:00:00.000Z`;

    const { data: existingReward } = await supabase
      .from('xp_logs')
      .select('id')
      .eq('user_id', user.id)
      .eq('source', source)
      .gte('created_at', todayStart)
      .limit(1)
      .maybeSingle();

    if (existingReward) {
      return new Response(JSON.stringify({ error: '今日已领取该奖励' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prevXp = existing?.total_xp ?? 0;
    const prevStreak = existing?.streak_days ?? 0;
    const lastCheckin = existing?.last_checkin_date;

    // 计算连续打卡
    let newStreak = prevStreak;
    let bonusXp = 0;
    if (source === 'daily_checkin') {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      if (lastCheckin === yesterday) {
        newStreak = prevStreak + 1;
        if (newStreak % 7 === 0) bonusXp = 50; // 连续7天奖励
      } else if (lastCheckin !== today) {
        newStreak = 1;
      }
    }

    const totalEarned = xpAmount + bonusXp;
    const newTotalXp = prevXp + totalEarned;
    const newLevel = calcLevel(newTotalXp);
    const levelUp = newLevel > (existing?.current_level ?? 1);

    // 更新 user_stats（upsert）
    const statsUpdate: any = {
      user_id: user.id,
      total_xp: newTotalXp,
      current_level: newLevel,
      streak_days: newStreak,
    };
    if (source === 'daily_checkin') statsUpdate.last_checkin_date = today;

    // 先写唯一奖励日志，阻止并发重复请求在增加总分前通过。
    const logsToInsert = [{ user_id: user.id, xp_amount: xpAmount, source, reward_date: today }];
    if (bonusXp > 0) {
      logsToInsert.push({ user_id: user.id, xp_amount: bonusXp, source: 'streak_bonus_7days', reward_date: today });
    }
    const { error: logError } = await supabase.from('xp_logs').insert(logsToInsert);
    if (logError?.code === '23505') {
      return new Response(JSON.stringify({ error: '今日已领取该奖励' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (logError) throw logError;

    const { error: statsError } = await supabase
      .from('user_stats')
      .upsert(statsUpdate, { onConflict: 'user_id' });
    if (statsError) throw statsError;

    return new Response(JSON.stringify({
      total_xp: newTotalXp,
      current_level: newLevel,
      xp_gained: totalEarned,
      level_up: levelUp,
      streak_days: newStreak,
      bonus_xp: bonusXp,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    console.error('add-xp error:', e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
});
