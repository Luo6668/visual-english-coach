
CREATE TYPE public.user_role AS ENUM ('user', 'admin');

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  phone text,
  role public.user_role DEFAULT 'user'::public.user_role,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.learning_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  input_type text NOT NULL CHECK (input_type IN ('photo', 'manual', 'chinese')),
  scene_image text,
  input_text text,
  scene_name text NOT NULL,
  i_see text NOT NULL,
  i_think text NOT NULL,
  i_say text NOT NULL,
  difficulty text NOT NULL DEFAULT 'natural' CHECK (difficulty IN ('simple', 'natural', 'advanced')),
  words jsonb DEFAULT '[]',
  is_favorited boolean DEFAULT false,
  shadowing_score integer,
  shadowing_feedback text,
  user_note text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.words (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  word text NOT NULL,
  phonetic text,
  meaning text,
  part_of_speech text,
  collocations jsonb DEFAULT '[]',
  example_sentences jsonb DEFAULT '[]',
  record_id uuid REFERENCES public.learning_records(id) ON DELETE SET NULL,
  learned_at timestamptz DEFAULT now(),
  UNIQUE(user_id, word)
);

CREATE TABLE IF NOT EXISTS public.sentences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  sentence text NOT NULL,
  translation text,
  record_id uuid REFERENCES public.learning_records(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  scene_name text NOT NULL,
  scene_image text,
  practice_count integer DEFAULT 1,
  last_practiced_at timestamptz DEFAULT now(),
  UNIQUE(user_id, scene_name)
);

CREATE TABLE IF NOT EXISTS public.user_stats (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  level integer DEFAULT 1,
  total_words integer DEFAULT 0,
  total_scenes integer DEFAULT 0,
  total_shadowing integer DEFAULT 0,
  total_dialogues integer DEFAULT 0,
  streak_days integer DEFAULT 0,
  last_study_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.daily_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  study_date date NOT NULL DEFAULT current_date,
  scene_count integer DEFAULT 0,
  word_count integer DEFAULT 0,
  shadowing_count integer DEFAULT 0,
  dialogue_count integer DEFAULT 0,
  study_minutes integer DEFAULT 0,
  UNIQUE(user_id, study_date)
);

CREATE TABLE IF NOT EXISTS public.dialogues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  record_id uuid REFERENCES public.learning_records(id) ON DELETE SET NULL,
  scene_name text NOT NULL,
  messages jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.diaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  diary_type text NOT NULL CHECK (diary_type IN ('daily', 'weekly')),
  content text NOT NULL,
  study_date date,
  week_start date,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.high_freq_words (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  word text NOT NULL,
  count integer DEFAULT 1,
  study_date date NOT NULL DEFAULT current_date,
  UNIQUE(user_id, word, study_date)
);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'user'::public.user_role);
  INSERT INTO public.user_stats (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

CREATE OR REPLACE FUNCTION get_user_role(uid uuid)
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = uid;
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.words ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dialogues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.high_freq_words ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id)
  WITH CHECK (role IS NOT DISTINCT FROM get_user_role(auth.uid()));
CREATE POLICY "Admins have full access to profiles" ON profiles
  FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::user_role);

CREATE POLICY "Users can CRUD own learning_records" ON learning_records
  FOR ALL TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can CRUD own words" ON words
  FOR ALL TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can CRUD own sentences" ON sentences
  FOR ALL TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can CRUD own scenes" ON scenes
  FOR ALL TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own stats" ON user_stats
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can update own stats" ON user_stats
  FOR UPDATE TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can CRUD own daily_stats" ON daily_stats
  FOR ALL TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can CRUD own dialogues" ON dialogues
  FOR ALL TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can CRUD own diaries" ON diaries
  FOR ALL TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can CRUD own high_freq_words" ON high_freq_words
  FOR ALL TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
