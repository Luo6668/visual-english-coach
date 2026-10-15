
-- ── scene_progress 表：记录用户各场景的解锁与掌握进度 ──────────────
CREATE TABLE public.scene_progress (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  scene_key       text NOT NULL,
  is_unlocked     boolean NOT NULL DEFAULT false,
  visit_count     int NOT NULL DEFAULT 0,
  expressions_count int NOT NULL DEFAULT 0,
  mastery         numeric(4,2) NOT NULL DEFAULT 0,
  last_visited_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, scene_key)
);

ALTER TABLE public.scene_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scene_progress_select_own" ON public.scene_progress
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "scene_progress_insert_own" ON public.scene_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "scene_progress_update_own" ON public.scene_progress
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "scene_progress_delete_own" ON public.scene_progress
  FOR DELETE USING (auth.uid() = user_id);
