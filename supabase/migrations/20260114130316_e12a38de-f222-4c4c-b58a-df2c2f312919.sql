-- Atualizar políticas de licenças para permitir admins sem empresa
DROP POLICY IF EXISTS "Admin gerencia licenças da empresa" ON public.licencas;
DROP POLICY IF EXISTS "Usuários veem licenças da empresa" ON public.licencas;

-- Admins podem ver todas as licenças (com ou sem empresa)
CREATE POLICY "Usuários veem licenças" 
ON public.licencas 
FOR SELECT 
USING (
  is_super_admin() 
  OR is_admin_or_super()
  OR (empresa_id = get_user_empresa_id())
);

-- Admins podem gerenciar licenças
CREATE POLICY "Admin gerencia licenças" 
ON public.licencas 
FOR ALL 
USING (
  is_super_admin() 
  OR is_admin_or_super()
  OR (empresa_id = get_user_empresa_id())
)
WITH CHECK (
  is_super_admin() 
  OR is_admin_or_super()
);

-- Atualizar políticas de pagamentos também
DROP POLICY IF EXISTS "Admin gerencia pagamentos da empresa" ON public.pagamentos;
DROP POLICY IF EXISTS "Usuários veem pagamentos da empresa" ON public.pagamentos;

CREATE POLICY "Usuários veem pagamentos" 
ON public.pagamentos 
FOR SELECT 
USING (
  is_super_admin() 
  OR is_admin_or_super()
  OR (empresa_id = get_user_empresa_id())
);

CREATE POLICY "Admin gerencia pagamentos" 
ON public.pagamentos 
FOR ALL 
USING (
  is_super_admin() 
  OR is_admin_or_super()
  OR (empresa_id = get_user_empresa_id())
)
WITH CHECK (
  is_super_admin() 
  OR is_admin_or_super()
);

-- Atualizar políticas de revendas
DROP POLICY IF EXISTS "Admin gerencia revendas da empresa" ON public.revendas;
DROP POLICY IF EXISTS "Usuários veem revendas da empresa" ON public.revendas;
DROP POLICY IF EXISTS "Revendedor vê próprias revendas" ON public.revendas;

CREATE POLICY "Usuários veem revendas" 
ON public.revendas 
FOR SELECT 
USING (
  is_super_admin() 
  OR is_admin_or_super()
  OR (empresa_id = get_user_empresa_id())
  OR (revendedor_id IN (SELECT id FROM usuario_perfil WHERE user_id = auth.uid()))
);

CREATE POLICY "Admin gerencia revendas" 
ON public.revendas 
FOR ALL 
USING (
  is_super_admin() 
  OR is_admin_or_super()
  OR (empresa_id = get_user_empresa_id())
)
WITH CHECK (
  is_super_admin() 
  OR is_admin_or_super()
);