-- Non-destructive extension. Existing English content and RLS stay unchanged.
ALTER TABLE public.diaries ADD COLUMN IF NOT EXISTS source_text text;
ALTER TABLE public.diaries ADD COLUMN IF NOT EXISTS writing_mode text;
ALTER TABLE public.diaries ADD COLUMN IF NOT EXISTS source_kind text;
ALTER TABLE public.diaries ADD COLUMN IF NOT EXISTS learning_expressions jsonb;
