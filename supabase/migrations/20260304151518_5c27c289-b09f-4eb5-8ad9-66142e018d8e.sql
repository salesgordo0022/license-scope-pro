
CREATE TABLE public.metas_vendas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descricao TEXT,
  tipo TEXT NOT NULL DEFAULT 'vendas_fechadas',
  valor_meta NUMERIC NOT NULL DEFAULT 0,
  valor_atual NUMERIC NOT NULL DEFAULT 0,
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  data_fim DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'em_andamento',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.metas_vendas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem metas" ON public.metas_vendas
  FOR SELECT TO authenticated
  USING (is_super_admin() OR is_admin_or_super() OR (empresa_id = get_user_empresa_id()));

CREATE POLICY "Admin gerencia metas" ON public.metas_vendas
  FOR ALL TO authenticated
  USING (is_super_admin() OR is_admin_or_super())
  WITH CHECK (is_super_admin() OR is_admin_or_super());
