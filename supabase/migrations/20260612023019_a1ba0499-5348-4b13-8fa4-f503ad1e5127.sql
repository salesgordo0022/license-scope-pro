CREATE TABLE IF NOT EXISTS public.contratos_assinados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
    nome_assinante TEXT NOT NULL,
    cpf_cnpj TEXT NOT NULL,
    data_assinatura TIMESTAMP WITH TIME ZONE DEFAULT now(),
    hash_documento TEXT NOT NULL,
    url_pdf TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contratos_assinados TO authenticated;
GRANT ALL ON public.contratos_assinados TO service_role;

ALTER TABLE public.contratos_assinados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage signatures for their contracts" ON public.contratos_assinados
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.contratos 
            WHERE public.contratos.id = public.contratos_assinados.contrato_id
        )
    );