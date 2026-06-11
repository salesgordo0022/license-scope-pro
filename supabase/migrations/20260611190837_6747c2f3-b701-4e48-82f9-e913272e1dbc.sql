ALTER TABLE public.contratos ADD COLUMN IF NOT EXISTS is_digital_sign BOOLEAN DEFAULT FALSE;
GRANT ALL ON public.contratos TO service_role;
GRANT ALL ON public.contratos TO authenticated;