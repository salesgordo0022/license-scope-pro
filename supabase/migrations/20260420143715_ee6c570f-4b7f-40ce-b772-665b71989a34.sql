
-- 1) Anti-escalação de privilégios: trigger bloqueia mudança de tipo/empresa_id por não-super_admin
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.tipo IS DISTINCT FROM OLD.tipo THEN
    RAISE EXCEPTION 'Não autorizado: alteração de tipo do usuário requer super_admin';
  END IF;
  IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id THEN
    RAISE EXCEPTION 'Não autorizado: alteração de empresa requer super_admin';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Não autorizado: user_id imutável';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_role_escalation_trigger ON public.usuario_perfil;
CREATE TRIGGER prevent_role_escalation_trigger
  BEFORE UPDATE ON public.usuario_perfil
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();

-- 2) Cross-tenant: restringir admin pelo empresa_id em todas as policies afetadas

-- contratos
DROP POLICY IF EXISTS "Usuários veem contratos" ON public.contratos;
CREATE POLICY "Usuários veem contratos" ON public.contratos
  FOR SELECT TO authenticated
  USING (is_super_admin() OR (is_admin_or_super() AND empresa_id = get_user_empresa_id()) OR (empresa_id = get_user_empresa_id()));

DROP POLICY IF EXISTS "Admin gerencia contratos" ON public.contratos;
CREATE POLICY "Admin gerencia contratos" ON public.contratos
  FOR ALL TO authenticated
  USING (is_super_admin() OR (is_admin_or_super() AND empresa_id = get_user_empresa_id()))
  WITH CHECK (is_super_admin() OR (is_admin_or_super() AND empresa_id = get_user_empresa_id()));

-- configuracao_contrato
DROP POLICY IF EXISTS "Usuários veem config contrato" ON public.configuracao_contrato;
CREATE POLICY "Usuários veem config contrato" ON public.configuracao_contrato
  FOR SELECT TO authenticated
  USING (is_super_admin() OR (is_admin_or_super() AND empresa_id = get_user_empresa_id()) OR (empresa_id = get_user_empresa_id()));

DROP POLICY IF EXISTS "Admin gerencia config contrato" ON public.configuracao_contrato;
CREATE POLICY "Admin gerencia config contrato" ON public.configuracao_contrato
  FOR ALL TO authenticated
  USING (is_super_admin() OR (is_admin_or_super() AND (empresa_id = get_user_empresa_id() OR empresa_id IS NULL)))
  WITH CHECK (is_super_admin() OR (is_admin_or_super() AND (empresa_id = get_user_empresa_id() OR empresa_id IS NULL)));

-- implantacoes
DROP POLICY IF EXISTS "Usuários veem implantações" ON public.implantacoes;
CREATE POLICY "Usuários veem implantações" ON public.implantacoes
  FOR SELECT TO authenticated
  USING (is_super_admin() OR (is_admin_or_super() AND empresa_id = get_user_empresa_id()) OR (empresa_id = get_user_empresa_id()));

DROP POLICY IF EXISTS "Admin gerencia implantações" ON public.implantacoes;
CREATE POLICY "Admin gerencia implantações" ON public.implantacoes
  FOR ALL TO authenticated
  USING (is_super_admin() OR (is_admin_or_super() AND empresa_id = get_user_empresa_id()))
  WITH CHECK (is_super_admin() OR (is_admin_or_super() AND empresa_id = get_user_empresa_id()));

-- implantacao_checklist
DROP POLICY IF EXISTS "Usuários veem checklist" ON public.implantacao_checklist;
CREATE POLICY "Usuários veem checklist" ON public.implantacao_checklist
  FOR SELECT TO authenticated
  USING (is_super_admin() OR (implantacao_id IN (SELECT id FROM public.implantacoes WHERE empresa_id = get_user_empresa_id())));

DROP POLICY IF EXISTS "Admin gerencia checklist" ON public.implantacao_checklist;
CREATE POLICY "Admin gerencia checklist" ON public.implantacao_checklist
  FOR ALL TO authenticated
  USING (is_super_admin() OR (is_admin_or_super() AND implantacao_id IN (SELECT id FROM public.implantacoes WHERE empresa_id = get_user_empresa_id())))
  WITH CHECK (is_super_admin() OR (is_admin_or_super() AND implantacao_id IN (SELECT id FROM public.implantacoes WHERE empresa_id = get_user_empresa_id())));

-- implantacao_comentarios
DROP POLICY IF EXISTS "Usuários veem comentários" ON public.implantacao_comentarios;
CREATE POLICY "Usuários veem comentários" ON public.implantacao_comentarios
  FOR SELECT TO authenticated
  USING (is_super_admin() OR (implantacao_id IN (SELECT id FROM public.implantacoes WHERE empresa_id = get_user_empresa_id())));

DROP POLICY IF EXISTS "Admin gerencia comentários" ON public.implantacao_comentarios;
CREATE POLICY "Admin gerencia comentários" ON public.implantacao_comentarios
  FOR ALL TO authenticated
  USING (is_super_admin() OR (is_admin_or_super() AND implantacao_id IN (SELECT id FROM public.implantacoes WHERE empresa_id = get_user_empresa_id())))
  WITH CHECK (is_super_admin() OR (is_admin_or_super() AND implantacao_id IN (SELECT id FROM public.implantacoes WHERE empresa_id = get_user_empresa_id())));

-- implantacao_historico
DROP POLICY IF EXISTS "Usuários veem histórico" ON public.implantacao_historico;
CREATE POLICY "Usuários veem histórico" ON public.implantacao_historico
  FOR SELECT TO authenticated
  USING (is_super_admin() OR (implantacao_id IN (SELECT id FROM public.implantacoes WHERE empresa_id = get_user_empresa_id())));

-- pagamentos
DROP POLICY IF EXISTS "Usuários veem pagamentos" ON public.pagamentos;
CREATE POLICY "Usuários veem pagamentos" ON public.pagamentos
  FOR SELECT TO authenticated
  USING (is_super_admin() OR (is_admin_or_super() AND empresa_id = get_user_empresa_id()) OR (empresa_id = get_user_empresa_id()));

DROP POLICY IF EXISTS "Admin gerencia pagamentos" ON public.pagamentos;
CREATE POLICY "Admin gerencia pagamentos" ON public.pagamentos
  FOR ALL TO authenticated
  USING (is_super_admin() OR (is_admin_or_super() AND empresa_id = get_user_empresa_id()))
  WITH CHECK (is_super_admin() OR (is_admin_or_super() AND empresa_id = get_user_empresa_id()));

-- metas_vendas
DROP POLICY IF EXISTS "Usuários veem metas" ON public.metas_vendas;
CREATE POLICY "Usuários veem metas" ON public.metas_vendas
  FOR SELECT TO authenticated
  USING (is_super_admin() OR (is_admin_or_super() AND empresa_id = get_user_empresa_id()) OR (empresa_id = get_user_empresa_id()));

DROP POLICY IF EXISTS "Admin gerencia metas" ON public.metas_vendas;
CREATE POLICY "Admin gerencia metas" ON public.metas_vendas
  FOR ALL TO authenticated
  USING (is_super_admin() OR (is_admin_or_super() AND empresa_id = get_user_empresa_id()))
  WITH CHECK (is_super_admin() OR (is_admin_or_super() AND empresa_id = get_user_empresa_id()));

-- usuario_perfil: admin só vê perfis da própria empresa
DROP POLICY IF EXISTS "Admin ou super vê todos perfis" ON public.usuario_perfil;
CREATE POLICY "Admin vê perfis da empresa" ON public.usuario_perfil
  FOR SELECT TO authenticated
  USING (is_super_admin() OR (is_admin_or_super() AND empresa_id = get_user_empresa_id()));

-- 3) Mensagens enviadas
CREATE TABLE IF NOT EXISTS public.mensagens_enviadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid,
  cliente_id uuid,
  usuario_id uuid,
  tipo text NOT NULL DEFAULT 'avulsa', -- avulsa | contrato | boleto | aniversario
  telefone text NOT NULL,
  mensagem text NOT NULL,
  status text NOT NULL DEFAULT 'enviado', -- enviado | erro
  erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mensagens_enviadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem mensagens da empresa" ON public.mensagens_enviadas
  FOR SELECT TO authenticated
  USING (is_super_admin() OR empresa_id = get_user_empresa_id());

CREATE POLICY "Admin insere mensagens" ON public.mensagens_enviadas
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR (is_admin_or_super() AND (empresa_id = get_user_empresa_id() OR empresa_id IS NULL)));

CREATE POLICY "Admin gerencia mensagens" ON public.mensagens_enviadas
  FOR ALL TO authenticated
  USING (is_super_admin() OR (is_admin_or_super() AND empresa_id = get_user_empresa_id()))
  WITH CHECK (is_super_admin() OR (is_admin_or_super() AND empresa_id = get_user_empresa_id()));

CREATE INDEX IF NOT EXISTS idx_mensagens_enviadas_empresa ON public.mensagens_enviadas(empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mensagens_enviadas_cliente ON public.mensagens_enviadas(cliente_id, created_at DESC);
