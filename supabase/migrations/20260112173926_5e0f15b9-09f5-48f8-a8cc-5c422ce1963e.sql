-- Adicionar campos de valores no cliente
ALTER TABLE public.clientes 
ADD COLUMN valor_mensalidade DECIMAL(10,2) DEFAULT 0,
ADD COLUMN valor_implantacao DECIMAL(10,2) DEFAULT 0,
ADD COLUMN desconto_percentual DECIMAL(5,2) DEFAULT 0;

-- Tabela de pagamentos
CREATE TABLE public.pagamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE NOT NULL,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('mensalidade', 'implantacao', 'avulso')),
  valor DECIMAL(10,2) NOT NULL,
  desconto DECIMAL(10,2) DEFAULT 0,
  valor_final DECIMAL(10,2) NOT NULL,
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'atrasado', 'cancelado')),
  metodo_pagamento TEXT,
  observacoes TEXT,
  referencia_mes INTEGER,
  referencia_ano INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela de preços (tabela de referência)
CREATE TABLE public.tabela_precos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  valor_mensalidade DECIMAL(10,2) NOT NULL DEFAULT 0,
  valor_implantacao DECIMAL(10,2) NOT NULL DEFAULT 0,
  recursos TEXT[],
  ativo BOOLEAN DEFAULT true,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tabela_precos ENABLE ROW LEVEL SECURITY;

-- RLS para pagamentos (isolamento por empresa)
CREATE POLICY "Usuários veem pagamentos da empresa"
ON public.pagamentos FOR SELECT TO authenticated
USING (empresa_id = public.get_user_empresa_id() OR public.is_super_admin());

CREATE POLICY "Admin gerencia pagamentos da empresa"
ON public.pagamentos FOR ALL TO authenticated
USING ((empresa_id = public.get_user_empresa_id() AND public.is_admin_or_super()) OR public.is_super_admin())
WITH CHECK ((empresa_id = public.get_user_empresa_id() AND public.is_admin_or_super()) OR public.is_super_admin());

-- RLS para tabela de preços (todos podem ver, super admin gerencia)
CREATE POLICY "Tabela de preços visível para autenticados"
ON public.tabela_precos FOR SELECT TO authenticated USING (ativo = true OR public.is_super_admin());

CREATE POLICY "Super admin gerencia tabela de preços"
ON public.tabela_precos FOR ALL TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- Inserir preços padrão
INSERT INTO public.tabela_precos (nome, descricao, valor_mensalidade, valor_implantacao, recursos, ordem) VALUES
('Básico', 'Ideal para pequenas empresas', 199.00, 500.00, ARRAY['Até 50 clientes', 'Suporte por email', '1 usuário'], 1),
('Profissional', 'Para empresas em crescimento', 399.00, 1000.00, ARRAY['Até 200 clientes', 'Suporte prioritário', '5 usuários', 'Relatórios avançados'], 2),
('Enterprise', 'Solução completa', 799.00, 2500.00, ARRAY['Clientes ilimitados', 'Suporte 24/7', 'Usuários ilimitados', 'API acesso', 'Customizações'], 3);