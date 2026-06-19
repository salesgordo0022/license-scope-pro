ALTER TABLE public.revendas
  ADD COLUMN IF NOT EXISTS observacoes text,
  ADD COLUMN IF NOT EXISTS origem text,
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}'::text[];