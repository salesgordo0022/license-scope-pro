
ALTER TABLE public.grupos_clientes ALTER COLUMN empresa_id DROP NOT NULL;

DROP POLICY IF EXISTS "Users can view groups of their company" ON public.grupos_clientes;
DROP POLICY IF EXISTS "Users can insert groups for their company" ON public.grupos_clientes;
DROP POLICY IF EXISTS "Users can update groups of their company" ON public.grupos_clientes;
DROP POLICY IF EXISTS "Users can delete groups of their company" ON public.grupos_clientes;

CREATE POLICY "Admin gerencia grupos" ON public.grupos_clientes
  FOR ALL TO authenticated
  USING (is_super_admin() OR (is_admin_or_super() AND ((empresa_id = get_user_empresa_id()) OR (empresa_id IS NULL))))
  WITH CHECK (is_super_admin() OR (is_admin_or_super() AND ((empresa_id = get_user_empresa_id()) OR (empresa_id IS NULL))));

CREATE POLICY "Usuários veem grupos" ON public.grupos_clientes
  FOR SELECT TO authenticated
  USING (is_super_admin() OR (empresa_id = get_user_empresa_id()) OR ((empresa_id IS NULL) AND is_admin_or_super()));
