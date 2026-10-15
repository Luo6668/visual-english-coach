
-- ── user_stats 扩展：添加 XP 字段（如果已存在则补充列）────────────────
ALTER TABLE user_stats
  ADD COLUMN IF NOT EXISTS total_xp        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_level   integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS streak_days     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_checkin_date date;

-- ── xp_logs 表 ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS xp_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  xp_amount  integer NOT NULL,
  source     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS xp_logs_user_id_idx ON xp_logs (user_id, created_at DESC);

-- RLS
ALTER TABLE xp_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can read own xp_logs" ON xp_logs;
CREATE POLICY "users can read own xp_logs" ON xp_logs
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users can insert own xp_logs" ON xp_logs;
CREATE POLICY "users can insert own xp_logs" ON xp_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
