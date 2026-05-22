-- Fix RLS policies: change {public} to {authenticated} and restrict overly permissive SELECT policies

-- implantacao_checklist: fix SELECT from public/true to authenticated/scoped
DROP POLICY IF EXISTS "Usuários veem checklist" ON public.implantacao_checklist;
CREATE POLICY "Usuários veem checklist" ON public.implantacao_checklist FOR SELECT TO authenticated
USING (is_super_admin() OR is_admin_or_super() OR (implantacao_id IN (SELECT id FROM public.implantacoes WHERE empresa_id = get_user_empresa_id())));

DROP POLICY IF EXISTS "Admin gerencia checklist" ON public.implantacao_checklist;
CREATE POLICY "Admin gerencia checklist" ON public.implantacao_checklist FOR ALL TO authenticated
USING (is_super_admin() OR is_admin_or_super())
WITH CHECK (is_super_admin() OR is_admin_or_super());

-- implantacao_comentarios: fix to authenticated
DROP POLICY IF EXISTS "Usuários veem comentários" ON public.implantacao_comentarios;
CREATE POLICY "Usuários veem comentários" ON public.implantacao_comentarios FOR SELECT TO authenticated
USING (is_super_admin() OR is_admin_or_super() OR (implantacao_id IN (SELECT id FROM public.implantacoes WHERE empresa_id = get_user_empresa_id())));

DROP POLICY IF EXISTS "Usuários autenticados criam comentários" ON public.implantacao_comentarios;
CREATE POLICY "Usuários autenticados criam comentários" ON public.implantacao_comentarios FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admin gerencia comentários" ON public.implantacao_comentarios;
CREATE POLICY "Admin gerencia comentários" ON public.implantacao_comentarios FOR ALL TO authenticated
USING (is_super_admin() OR is_admin_or_super())
WITH CHECK (is_super_admin() OR is_admin_or_super());

-- implantacao_historico: fix to authenticated
DROP POLICY IF EXISTS "Usuários veem histórico" ON public.implantacao_historico;
CREATE POLICY "Usuários veem histórico" ON public.implantacao_historico FOR SELECT TO authenticated
USING (is_super_admin() OR is_admin_or_super() OR (implantacao_id IN (SELECT id FROM public.implantacoes WHERE empresa_id = get_user_empresa_id())));

DROP POLICY IF EXISTS "Sistema insere histórico" ON public.implantacao_historico;
CREATE POLICY "Sistema insere histórico" ON public.implantacao_historico FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- clientes: change from public to authenticated
DROP POLICY IF EXISTS "Admin/Super podem criar clientes" ON public.clientes;
CREATE POLICY "Admin/Super podem criar clientes" ON public.clientes FOR INSERT TO authenticated
WITH CHECK (is_super_admin() OR ((empresa_id = get_user_empresa_id()) AND is_admin_or_super()) OR ((empresa_id IS NULL) AND is_admin_or_super()));

DROP POLICY IF EXISTS "Usuários veem clientes da sua empresa" ON public.clientes;
CREATE POLICY "Usuários veem clientes da sua empresa" ON public.clientes FOR SELECT TO authenticated
USING (is_super_admin() OR (empresa_id = get_user_empresa_id()) OR ((empresa_id IS NULL) AND is_admin_or_super()));

DROP POLICY IF EXISTS "Admin/Super podem atualizar clientes" ON public.clientes;
CREATE POLICY "Admin/Super podem atualizar clientes" ON public.clientes FOR UPDATE TO authenticated
USING (is_super_admin() OR ((empresa_id = get_user_empresa_id()) AND is_admin_or_super()) OR ((empresa_id IS NULL) AND is_admin_or_super()));

DROP POLICY IF EXISTS "Admin/Super podem deletar clientes" ON public.clientes;
CREATE POLICY "Admin/Super podem deletar clientes" ON public.clientes FOR DELETE TO authenticated
USING (is_super_admin() OR ((empresa_id = get_user_empresa_id()) AND is_admin_or_super()) OR ((empresa_id IS NULL) AND is_admin_or_super()));

-- pagamentos: change from public to authenticated
DROP POLICY IF EXISTS "Usuários veem pagamentos" ON public.pagamentos;
CREATE POLICY "Usuários veem pagamentos" ON public.pagamentos FOR SELECT TO authenticated
USING (is_super_admin() OR is_admin_or_super() OR (empresa_id = get_user_empresa_id()));

DROP POLICY IF EXISTS "Admin gerencia pagamentos" ON public.pagamentos;
CREATE POLICY "Admin gerencia pagamentos" ON public.pagamentos FOR ALL TO authenticated
USING (is_super_admin() OR is_admin_or_super() OR (empresa_id = get_user_empresa_id()))
WITH CHECK (is_super_admin() OR is_admin_or_super());

-- contratos: change from public to authenticated
DROP POLICY IF EXISTS "Usuários veem contratos" ON public.contratos;
CREATE POLICY "Usuários veem contratos" ON public.contratos FOR SELECT TO authenticated
USING (is_super_admin() OR is_admin_or_super() OR (empresa_id = get_user_empresa_id()));

DROP POLICY IF EXISTS "Admin gerencia contratos" ON public.contratos;
CREATE POLICY "Admin gerencia contratos" ON public.contratos FOR ALL TO authenticated
USING (is_super_admin() OR is_admin_or_super())
WITH CHECK (is_super_admin() OR is_admin_or_super());

-- licencas: change from public to authenticated
DROP POLICY IF EXISTS "Usuários veem licenças" ON public.licencas;
CREATE POLICY "Usuários veem licenças" ON public.licencas FOR SELECT TO authenticated
USING (is_super_admin() OR is_admin_or_super() OR (empresa_id = get_user_empresa_id()));

DROP POLICY IF EXISTS "Admin gerencia licenças" ON public.licencas;
CREATE POLICY "Admin gerencia licenças" ON public.licencas FOR ALL TO authenticated
USING (is_super_admin() OR is_admin_or_super() OR (empresa_id = get_user_empresa_id()))
WITH CHECK (is_super_admin() OR is_admin_or_super());

-- revendas: change from public to authenticated
DROP POLICY IF EXISTS "Usuários veem revendas" ON public.revendas;
CREATE POLICY "Usuários veem revendas" ON public.revendas FOR SELECT TO authenticated
USING (is_super_admin() OR is_admin_or_super() OR (empresa_id = get_user_empresa_id()) OR (revendedor_id IN (SELECT id FROM public.usuario_perfil WHERE user_id = auth.uid())));

DROP POLICY IF EXISTS "Admin gerencia revendas" ON public.revendas;
CREATE POLICY "Admin gerencia revendas" ON public.revendas FOR ALL TO authenticated
USING (is_super_admin() OR is_admin_or_super() OR (empresa_id = get_user_empresa_id()))
WITH CHECK (is_super_admin() OR is_admin_or_super());

-- implantacoes: change from public to authenticated
DROP POLICY IF EXISTS "Usuários veem implantações" ON public.implantacoes;
CREATE POLICY "Usuários veem implantações" ON public.implantacoes FOR SELECT TO authenticated
USING (is_super_admin() OR is_admin_or_super() OR (empresa_id = get_user_empresa_id()));

DROP POLICY IF EXISTS "Admin gerencia implantações" ON public.implantacoes;
CREATE POLICY "Admin gerencia implantações" ON public.implantacoes FOR ALL TO authenticated
USING (is_super_admin() OR is_admin_or_super())
WITH CHECK (is_super_admin() OR is_admin_or_super());

-- usuario_perfil: change SELECT from public to authenticated
DROP POLICY IF EXISTS "Admin ou super vê todos perfis" ON public.usuario_perfil;
CREATE POLICY "Admin ou super vê todos perfis" ON public.usuario_perfil FOR SELECT TO authenticated
USING (is_admin_or_super());

DROP POLICY IF EXISTS "Usuário vê próprio perfil" ON public.usuario_perfil;
CREATE POLICY "Usuário vê próprio perfil" ON public.usuario_perfil FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- sistemas: change from public to authenticated
DROP POLICY IF EXISTS "Sistemas visíveis para autenticados" ON public.sistemas;
CREATE POLICY "Sistemas visíveis para autenticados" ON public.sistemas FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Admin gerencia sistemas" ON public.sistemas;
CREATE POLICY "Admin gerencia sistemas" ON public.sistemas FOR ALL TO authenticated
USING (is_admin_or_super())
WITH CHECK (is_admin_or_super());

-- segmentos: change from public to authenticated
DROP POLICY IF EXISTS "Segmentos visíveis para autenticados" ON public.segmentos;
CREATE POLICY "Segmentos visíveis para autenticados" ON public.segmentos FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Admin gerencia segmentos" ON public.segmentos;
CREATE POLICY "Admin gerencia segmentos" ON public.segmentos FOR ALL TO authenticated
USING (is_admin_or_super())
WITH CHECK (is_admin_or_super());

-- Fix get_user_empresa_id to use LIMIT 1
CREATE OR REPLACE FUNCTION public.get_user_empresa_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT empresa_id FROM public.usuario_perfil WHERE user_id = auth.uid() LIMIT 1
$$;