
-- Criar tabela de contratos
CREATE TABLE public.contratos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  empresa_id UUID REFERENCES public.empresas(id),
  numero_contrato TEXT,
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  data_fim DATE,
  vigencia_meses INTEGER DEFAULT 12,
  valor_software NUMERIC DEFAULT 0,
  valor_mensalidade NUMERIC DEFAULT 0,
  quantidade_licencas INTEGER DEFAULT 3,
  valor_km_deslocamento NUMERIC DEFAULT 0,
  sistema TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  contratante_nome TEXT,
  contratante_endereco TEXT,
  contratante_cidade TEXT,
  contratante_estado TEXT,
  contratante_cnpj TEXT,
  assinado BOOLEAN DEFAULT false,
  data_assinatura TIMESTAMP WITH TIME ZONE,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;

-- Políticas
CREATE POLICY "Usuários veem contratos"
ON public.contratos
FOR SELECT
USING (is_super_admin() OR is_admin_or_super() OR empresa_id = get_user_empresa_id());

CREATE POLICY "Admin gerencia contratos"
ON public.contratos
FOR ALL
USING (is_super_admin() OR is_admin_or_super())
WITH CHECK (is_super_admin() OR is_admin_or_super());

-- Trigger para updated_at
CREATE TRIGGER update_contratos_updated_at
BEFORE UPDATE ON public.contratos
FOR EACH ROW
EXECUTE FUNCTION public.update_implantacao_updated_at();
