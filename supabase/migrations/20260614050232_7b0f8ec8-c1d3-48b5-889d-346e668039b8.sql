ALTER TABLE public.metas_vendas
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cliente_nome text,
  ADD COLUMN IF NOT EXISTS cliente_cnpj text,
  ADD COLUMN IF NOT EXISTS cliente_contato text;