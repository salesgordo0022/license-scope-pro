
-- Fix 1: Privilege escalation - prevent users from changing their own role
DROP POLICY IF EXISTS "Usuário atualiza próprio perfil" ON public.usuario_perfil;

CREATE POLICY "Usuário atualiza próprio perfil"
ON public.usuario_perfil
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid() 
  AND tipo IS NOT DISTINCT FROM (SELECT get_user_role())
  AND empresa_id IS NOT DISTINCT FROM (SELECT get_user_empresa_id())
);

-- Fix 2: Restrict comments insert to user's own company implantations
DROP POLICY IF EXISTS "Usuários autenticados criam comentários" ON public.implantacao_comentarios;

CREATE POLICY "Usuários autenticados criam comentários"
ON public.implantacao_comentarios
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    is_super_admin()
    OR implantacao_id IN (
      SELECT id FROM public.implantacoes WHERE empresa_id = get_user_empresa_id()
    )
  )
);

-- Fix 3: Restrict history insert to user's own company implantations
DROP POLICY IF EXISTS "Sistema insere histórico" ON public.implantacao_historico;

CREATE POLICY "Sistema insere histórico"
ON public.implantacao_historico
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    is_super_admin()
    OR implantacao_id IN (
      SELECT id FROM public.implantacoes WHERE empresa_id = get_user_empresa_id()
    )
  )
);

-- Fix 4: Scope contract templates to user's own company
DROP POLICY IF EXISTS "Usuários veem modelos" ON public.modelos_contrato;
DROP POLICY IF EXISTS "Admin gerencia modelos" ON public.modelos_contrato;

CREATE POLICY "Usuários veem modelos"
ON public.modelos_contrato
FOR SELECT
TO authenticated
USING (
  is_super_admin() 
  OR (is_admin_or_super() AND (empresa_id = get_user_empresa_id() OR empresa_id IS NULL))
  OR empresa_id = get_user_empresa_id()
);

CREATE POLICY "Admin gerencia modelos"
ON public.modelos_contrato
FOR ALL
TO authenticated
USING (
  is_super_admin() 
  OR (is_admin_or_super() AND (empresa_id = get_user_empresa_id() OR empresa_id IS NULL))
)
WITH CHECK (
  is_super_admin() 
  OR (is_admin_or_super() AND (empresa_id = get_user_empresa_id() OR empresa_id IS NULL))
);
