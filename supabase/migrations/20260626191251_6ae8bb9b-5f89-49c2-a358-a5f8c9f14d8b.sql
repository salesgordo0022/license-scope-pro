ALTER TABLE public.revendas
  ADD COLUMN IF NOT EXISTS anotacoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS valores_detalhados jsonb NOT NULL DEFAULT '{}'::jsonb;