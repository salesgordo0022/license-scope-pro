-- Enum para tipos de usuário
CREATE TYPE public.user_role AS ENUM ('super_admin', 'admin', 'revendedor');

-- Enum para status
CREATE TYPE public.status_type AS ENUM ('ativo', 'inativo', 'pendente', 'vencido');

-- Tabela de planos
CREATE TABLE public.planos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  limite_clientes INTEGER NOT NULL DEFAULT 100,
  limite_usuarios INTEGER NOT NULL DEFAULT 10,
  preco DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela de empresas
CREATE TABLE public.empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  plano_id UUID REFERENCES public.planos(id),
  status status_type DEFAULT 'ativo',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela de perfis de usuário (vinculado ao auth.users)
CREATE TABLE public.usuario_perfil (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome TEXT,
  email TEXT,
  tipo user_role DEFAULT 'revendedor',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela de módulos
CREATE TABLE public.modulos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela de clientes
CREATE TABLE public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE NOT NULL,
  nome_empresa TEXT NOT NULL,
  segmento TEXT,
  email TEXT,
  telefone TEXT,
  status status_type DEFAULT 'ativo',
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela de vínculo cliente-módulo
CREATE TABLE public.cliente_modulos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE NOT NULL,
  modulo_id UUID REFERENCES public.modulos(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(cliente_id, modulo_id)
);

-- Tabela de licenças
CREATE TABLE public.licencas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE NOT NULL,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE NOT NULL,
  tipo TEXT NOT NULL,
  quantidade INTEGER DEFAULT 1,
  validade DATE,
  status status_type DEFAULT 'ativo',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela de revendas
CREATE TABLE public.revendas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE NOT NULL,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE NOT NULL,
  revendedor_id UUID REFERENCES public.usuario_perfil(id) ON DELETE SET NULL,
  sistema TEXT,
  data_venda DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_perfil ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_modulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licencas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revendas ENABLE ROW LEVEL SECURITY;

-- Função para obter empresa_id do usuário atual
CREATE OR REPLACE FUNCTION public.get_user_empresa_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT empresa_id FROM public.usuario_perfil WHERE user_id = auth.uid()
$$;

-- Função para verificar se usuário é super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuario_perfil 
    WHERE user_id = auth.uid() AND tipo = 'super_admin'
  )
$$;

-- Função para verificar se usuário é admin ou super_admin
CREATE OR REPLACE FUNCTION public.is_admin_or_super()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuario_perfil 
    WHERE user_id = auth.uid() AND tipo IN ('super_admin', 'admin')
  )
$$;

-- Função para obter tipo do usuário
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tipo FROM public.usuario_perfil WHERE user_id = auth.uid()
$$;

-- RLS Policies para planos (somente super_admin pode gerenciar, todos podem ver)
CREATE POLICY "Planos são visíveis para usuários autenticados"
ON public.planos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admin pode gerenciar planos"
ON public.planos FOR ALL TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- RLS Policies para empresas
CREATE POLICY "Super admin vê todas empresas"
ON public.empresas FOR SELECT TO authenticated
USING (public.is_super_admin());

CREATE POLICY "Usuários veem sua empresa"
ON public.empresas FOR SELECT TO authenticated
USING (id = public.get_user_empresa_id());

CREATE POLICY "Super admin gerencia empresas"
ON public.empresas FOR ALL TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- RLS Policies para usuario_perfil
CREATE POLICY "Super admin vê todos perfis"
ON public.usuario_perfil FOR SELECT TO authenticated
USING (public.is_super_admin());

CREATE POLICY "Admin vê perfis da sua empresa"
ON public.usuario_perfil FOR SELECT TO authenticated
USING (empresa_id = public.get_user_empresa_id());

CREATE POLICY "Usuário vê próprio perfil"
ON public.usuario_perfil FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Super admin gerencia todos perfis"
ON public.usuario_perfil FOR ALL TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Admin gerencia perfis da empresa"
ON public.usuario_perfil FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_super() AND empresa_id = public.get_user_empresa_id());

CREATE POLICY "Admin atualiza perfis da empresa"
ON public.usuario_perfil FOR UPDATE TO authenticated
USING (public.is_admin_or_super() AND empresa_id = public.get_user_empresa_id());

CREATE POLICY "Usuário atualiza próprio perfil"
ON public.usuario_perfil FOR UPDATE TO authenticated
USING (user_id = auth.uid());

-- RLS Policies para módulos (todos autenticados podem ver)
CREATE POLICY "Módulos visíveis para autenticados"
ON public.modulos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admin gerencia módulos"
ON public.modulos FOR ALL TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- RLS Policies para clientes (isolamento por empresa)
CREATE POLICY "Usuários veem clientes da sua empresa"
ON public.clientes FOR SELECT TO authenticated
USING (empresa_id = public.get_user_empresa_id() OR public.is_super_admin());

CREATE POLICY "Admin/Super podem criar clientes"
ON public.clientes FOR INSERT TO authenticated
WITH CHECK (
  (empresa_id = public.get_user_empresa_id() AND public.is_admin_or_super())
  OR public.is_super_admin()
);

CREATE POLICY "Admin/Super podem atualizar clientes"
ON public.clientes FOR UPDATE TO authenticated
USING (
  (empresa_id = public.get_user_empresa_id() AND public.is_admin_or_super())
  OR public.is_super_admin()
);

CREATE POLICY "Admin/Super podem deletar clientes"
ON public.clientes FOR DELETE TO authenticated
USING (
  (empresa_id = public.get_user_empresa_id() AND public.is_admin_or_super())
  OR public.is_super_admin()
);

-- RLS Policies para cliente_modulos
CREATE POLICY "Usuários veem módulos de clientes da empresa"
ON public.cliente_modulos FOR SELECT TO authenticated
USING (
  cliente_id IN (SELECT id FROM public.clientes WHERE empresa_id = public.get_user_empresa_id())
  OR public.is_super_admin()
);

CREATE POLICY "Admin gerencia módulos de clientes"
ON public.cliente_modulos FOR ALL TO authenticated
USING (
  (cliente_id IN (SELECT id FROM public.clientes WHERE empresa_id = public.get_user_empresa_id()) AND public.is_admin_or_super())
  OR public.is_super_admin()
)
WITH CHECK (
  (cliente_id IN (SELECT id FROM public.clientes WHERE empresa_id = public.get_user_empresa_id()) AND public.is_admin_or_super())
  OR public.is_super_admin()
);

-- RLS Policies para licenças
CREATE POLICY "Usuários veem licenças da empresa"
ON public.licencas FOR SELECT TO authenticated
USING (empresa_id = public.get_user_empresa_id() OR public.is_super_admin());

CREATE POLICY "Admin gerencia licenças da empresa"
ON public.licencas FOR ALL TO authenticated
USING (
  (empresa_id = public.get_user_empresa_id() AND public.is_admin_or_super())
  OR public.is_super_admin()
)
WITH CHECK (
  (empresa_id = public.get_user_empresa_id() AND public.is_admin_or_super())
  OR public.is_super_admin()
);

-- RLS Policies para revendas
CREATE POLICY "Usuários veem revendas da empresa"
ON public.revendas FOR SELECT TO authenticated
USING (empresa_id = public.get_user_empresa_id() OR public.is_super_admin());

CREATE POLICY "Revendedor vê próprias revendas"
ON public.revendas FOR SELECT TO authenticated
USING (
  revendedor_id IN (SELECT id FROM public.usuario_perfil WHERE user_id = auth.uid())
);

CREATE POLICY "Admin gerencia revendas da empresa"
ON public.revendas FOR ALL TO authenticated
USING (
  (empresa_id = public.get_user_empresa_id() AND public.is_admin_or_super())
  OR public.is_super_admin()
)
WITH CHECK (
  (empresa_id = public.get_user_empresa_id() AND public.is_admin_or_super())
  OR public.is_super_admin()
);

-- Inserir planos padrão
INSERT INTO public.planos (nome, limite_clientes, limite_usuarios, preco) VALUES
  ('Starter', 50, 5, 99.00),
  ('Professional', 200, 20, 299.00),
  ('Enterprise', 1000, 100, 799.00);

-- Inserir módulos padrão
INSERT INTO public.modulos (nome, descricao) VALUES
  ('ERP', 'Sistema de gestão empresarial'),
  ('CRM', 'Gestão de relacionamento com clientes'),
  ('Financeiro', 'Controle financeiro e contábil'),
  ('Estoque', 'Gestão de estoque e inventário'),
  ('Vendas', 'Módulo de vendas e PDV'),
  ('RH', 'Gestão de recursos humanos');