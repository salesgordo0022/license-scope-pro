ALTER TABLE public.sistemas ADD COLUMN IF NOT EXISTS cor TEXT DEFAULT '#3b82f6';
COMMENT ON COLUMN public.sistemas.cor IS 'Cor hexadecimal associada ao sistema para identificação visual';