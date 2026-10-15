-- XP is awarded only by the add-xp Edge Function using the service role.
ALTER TABLE public.xp_logs
  ADD COLUMN IF NOT EXISTS reward_date date NOT NULL DEFAULT (timezone('utc', now()))::date;

CREATE UNIQUE INDEX IF NOT EXISTS xp_logs_daily_reward_unique
  ON public.xp_logs (user_id, source, reward_date);

DROP POLICY IF EXISTS "users can insert own xp_logs" ON public.xp_logs;
REVOKE INSERT, UPDATE, DELETE ON public.xp_logs FROM authenticated;

-- Keep ordinary learning counters editable while protecting server-owned XP fields.
REVOKE UPDATE ON public.user_stats FROM authenticated;
GRANT UPDATE (
  level,
  total_words,
  total_scenes,
  total_shadowing,
  total_dialogues,
  last_study_date,
  updated_at
) ON public.user_stats TO authenticated;
