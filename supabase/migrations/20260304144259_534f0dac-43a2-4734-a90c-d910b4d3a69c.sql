
ALTER TABLE public.licencas 
  ADD COLUMN IF NOT EXISTS data_inicio date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS dia_vencimento integer DEFAULT 10,
  ADD COLUMN IF NOT EXISTS valor_custo numeric DEFAULT 0;
