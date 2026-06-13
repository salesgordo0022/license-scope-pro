
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS nome_dono text DEFAULT '',
  ADD COLUMN IF NOT EXISTS cpf_dono text DEFAULT '';

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS contratante_nome_dono text,
  ADD COLUMN IF NOT EXISTS contratante_cpf_dono text;
