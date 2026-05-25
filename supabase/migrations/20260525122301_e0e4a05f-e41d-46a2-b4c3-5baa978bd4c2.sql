-- Create groups table
CREATE TABLE public.grupos_clientes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id UUID NOT NULL,
    nome TEXT NOT NULL,
    cor TEXT DEFAULT '#94a3b8',
    descricao TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT fk_empresa FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE
);

-- Add grupo_id to clientes
ALTER TABLE public.clientes ADD COLUMN grupo_id UUID REFERENCES public.grupos_clientes(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.grupos_clientes ENABLE ROW LEVEL SECURITY;

-- Create policies for grupos_clientes
CREATE POLICY "Users can view groups of their company"
ON public.grupos_clientes
FOR SELECT
USING (empresa_id = (SELECT empresa_id FROM public.usuario_perfil WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert groups for their company"
ON public.grupos_clientes
FOR INSERT
WITH CHECK (empresa_id = (SELECT empresa_id FROM public.usuario_perfil WHERE user_id = auth.uid()));

CREATE POLICY "Users can update groups of their company"
ON public.grupos_clientes
FOR UPDATE
USING (empresa_id = (SELECT empresa_id FROM public.usuario_perfil WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete groups of their company"
ON public.grupos_clientes
FOR DELETE
USING (empresa_id = (SELECT empresa_id FROM public.usuario_perfil WHERE user_id = auth.uid()));