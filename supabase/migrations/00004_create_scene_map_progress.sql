
-- 场景地图进度表
CREATE TABLE IF NOT EXISTS scene_map_progress (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scene_id        TEXT NOT NULL,           -- 唯一标识，如 "coffee-shop"
  scene_name_zh   TEXT NOT NULL,           -- 中文名，如 "咖啡馆"
  scene_name_en   TEXT NOT NULL,           -- 英文名，如 "Coffee Shop"
  category        TEXT NOT NULL DEFAULT 'daily',  -- 'daily' | 'workplace'
  status          TEXT NOT NULL DEFAULT 'locked', -- 'locked' | 'in_progress' | 'completed'
  dialogue_rounds INT  NOT NULL DEFAULT 0,        -- 已完成对话轮次
  last_practiced  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, scene_id)
);

-- RLS
ALTER TABLE scene_map_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scene_map_progress_select" ON scene_map_progress
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "scene_map_progress_insert" ON scene_map_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "scene_map_progress_update" ON scene_map_progress
  FOR UPDATE USING (auth.uid() = user_id);

-- 更新时间触发器
CREATE OR REPLACE FUNCTION update_scene_map_progress_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER trg_scene_map_progress_updated_at
  BEFORE UPDATE ON scene_map_progress
  FOR EACH ROW EXECUTE FUNCTION update_scene_map_progress_updated_at();
