-- Adicionar coluna de status/estágio na tabela de revendas para o Kanban
ALTER TABLE public.revendas 
ADD COLUMN IF NOT EXISTS status_venda TEXT NOT NULL DEFAULT 'lead',
ADD COLUMN IF NOT EXISTS valor_estimado NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS temperatura TEXT DEFAULT 'morno',
ADD COLUMN IF NOT EXISTS proxima_acao TEXT,
ADD COLUMN IF NOT EXISTS data_proxima_acao DATE;

-- Criar índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_revendas_status ON public.revendas(status_venda);