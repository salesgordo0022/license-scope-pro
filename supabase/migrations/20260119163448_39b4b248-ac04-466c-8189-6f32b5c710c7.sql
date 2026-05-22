-- Criar tabela de implantações
CREATE TABLE public.implantacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  empresa_id UUID REFERENCES public.empresas(id),
  titulo TEXT NOT NULL,
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'nao_iniciado',
  prioridade TEXT NOT NULL DEFAULT 'media',
  responsavel_id UUID REFERENCES public.usuario_perfil(id),
  data_meta DATE,
  data_prazo DATE,
  progresso INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de checklist (passos da implantação)
CREATE TABLE public.implantacao_checklist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  implantacao_id UUID NOT NULL REFERENCES public.implantacoes(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  concluido BOOLEAN DEFAULT false,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de comentários
CREATE TABLE public.implantacao_comentarios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  implantacao_id UUID NOT NULL REFERENCES public.implantacoes(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES public.usuario_perfil(id),
  texto TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de histórico
CREATE TABLE public.implantacao_historico (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  implantacao_id UUID NOT NULL REFERENCES public.implantacoes(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES public.usuario_perfil(id),
  acao TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.implantacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.implantacao_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.implantacao_comentarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.implantacao_historico ENABLE ROW LEVEL SECURITY;

-- Políticas para implantacoes
CREATE POLICY "Usuários veem implantações" 
ON public.implantacoes 
FOR SELECT 
USING (is_super_admin() OR is_admin_or_super() OR empresa_id = get_user_empresa_id());

CREATE POLICY "Admin gerencia implantações" 
ON public.implantacoes 
FOR ALL 
USING (is_super_admin() OR is_admin_or_super())
WITH CHECK (is_super_admin() OR is_admin_or_super());

-- Políticas para checklist
CREATE POLICY "Usuários veem checklist" 
ON public.implantacao_checklist 
FOR SELECT 
USING (true);

CREATE POLICY "Admin gerencia checklist" 
ON public.implantacao_checklist 
FOR ALL 
USING (is_super_admin() OR is_admin_or_super())
WITH CHECK (is_super_admin() OR is_admin_or_super());

-- Políticas para comentários
CREATE POLICY "Usuários veem comentários" 
ON public.implantacao_comentarios 
FOR SELECT 
USING (true);

CREATE POLICY "Usuários autenticados criam comentários" 
ON public.implantacao_comentarios 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admin gerencia comentários" 
ON public.implantacao_comentarios 
FOR ALL 
USING (is_super_admin() OR is_admin_or_super())
WITH CHECK (is_super_admin() OR is_admin_or_super());

-- Políticas para histórico
CREATE POLICY "Usuários veem histórico" 
ON public.implantacao_historico 
FOR SELECT 
USING (true);

CREATE POLICY "Sistema insere histórico" 
ON public.implantacao_historico 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_implantacao_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_implantacoes_updated_at
BEFORE UPDATE ON public.implantacoes
FOR EACH ROW
EXECUTE FUNCTION public.update_implantacao_updated_at();