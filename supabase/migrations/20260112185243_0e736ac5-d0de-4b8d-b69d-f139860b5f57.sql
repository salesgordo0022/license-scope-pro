-- Criar tabela de segmentos
CREATE TABLE public.segmentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.segmentos ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Segmentos visíveis para autenticados" 
ON public.segmentos 
FOR SELECT 
USING (true);

CREATE POLICY "Admin gerencia segmentos" 
ON public.segmentos 
FOR ALL 
USING (is_admin_or_super())
WITH CHECK (is_admin_or_super());

-- Tornar empresa_id opcional na tabela clientes
ALTER TABLE public.clientes ALTER COLUMN empresa_id DROP NOT NULL;