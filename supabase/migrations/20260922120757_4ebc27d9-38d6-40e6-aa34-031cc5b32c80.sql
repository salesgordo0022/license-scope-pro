ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS modelo_id uuid REFERENCES public.modelos_contrato(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plano_id uuid REFERENCES public.tabela_precos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plano_nome text,
  ADD COLUMN IF NOT EXISTS plano_recursos text[];