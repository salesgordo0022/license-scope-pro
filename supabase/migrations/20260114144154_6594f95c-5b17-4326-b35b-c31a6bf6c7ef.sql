-- Criar tabela de sistemas
CREATE TABLE public.sistemas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sistemas ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Sistemas visíveis para autenticados" 
ON public.sistemas 
FOR SELECT 
USING (true);

CREATE POLICY "Admin gerencia sistemas" 
ON public.sistemas 
FOR ALL 
USING (is_admin_or_super())
WITH CHECK (is_admin_or_super());