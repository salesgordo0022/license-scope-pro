
DROP POLICY IF EXISTS "Permitir leitura para todos autenticados" ON public.clientes;
DROP POLICY IF EXISTS "Permitir gestão para admins e supers" ON public.clientes;

CREATE POLICY "Clientes leitura por empresa"
ON public.clientes FOR SELECT TO authenticated
USING (is_super_admin() OR empresa_id = get_user_empresa_id());

CREATE POLICY "Clientes gestao admins da empresa"
ON public.clientes FOR ALL TO authenticated
USING (is_super_admin() OR (is_admin_or_super() AND empresa_id = get_user_empresa_id()))
WITH CHECK (is_super_admin() OR (is_admin_or_super() AND empresa_id = get_user_empresa_id()));

DROP POLICY IF EXISTS "Revendas visíveis para todos autenticados" ON public.revendas;
DROP POLICY IF EXISTS "Revendas gerenciaveis por admins e supers" ON public.revendas;

CREATE POLICY "Revendas leitura por empresa"
ON public.revendas FOR SELECT TO authenticated
USING (is_super_admin() OR empresa_id = get_user_empresa_id());

CREATE POLICY "Revendas gestao admins da empresa"
ON public.revendas FOR ALL TO authenticated
USING (is_super_admin() OR (is_admin_or_super() AND empresa_id = get_user_empresa_id()))
WITH CHECK (is_super_admin() OR (is_admin_or_super() AND empresa_id = get_user_empresa_id()));

DROP POLICY IF EXISTS "Perfis visíveis por todos autenticados" ON public.usuario_perfil;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_role_escalation() FROM PUBLIC, anon, authenticated;
