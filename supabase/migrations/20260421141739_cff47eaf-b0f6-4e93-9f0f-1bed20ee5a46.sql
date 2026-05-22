
-- 1) Privilege escalation: remove self-update policy on usuario_perfil
-- The trigger prevent_role_escalation already blocks tipo/empresa_id changes,
-- but the WITH CHECK using get_user_role() is bypassable. Drop the policy entirely;
-- users updating their own profile (nome/email) must go through admin or a future RPC.
DROP POLICY IF EXISTS "Usuário atualiza próprio perfil" ON public.usuario_perfil;

-- Recreate a safer self-update policy: user can update own row but trigger enforces immutability
CREATE POLICY "Usuário atualiza próprio perfil"
ON public.usuario_perfil
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
-- (prevent_role_escalation trigger blocks tipo/empresa_id/user_id changes for non-super_admin)

-- Ensure trigger is attached
DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.usuario_perfil;
CREATE TRIGGER trg_prevent_role_escalation
BEFORE UPDATE ON public.usuario_perfil
FOR EACH ROW
EXECUTE FUNCTION public.prevent_role_escalation();

-- 2) Licenses: restrict UPDATE/DELETE to admins only
DROP POLICY IF EXISTS "Admin gerencia licenças" ON public.licencas;
DROP POLICY IF EXISTS "Usuários veem licenças" ON public.licencas;

CREATE POLICY "Usuários veem licenças da empresa"
ON public.licencas
FOR SELECT
TO authenticated
USING (
  is_super_admin()
  OR (empresa_id = get_user_empresa_id())
  OR (empresa_id IS NULL AND is_admin_or_super())
);

CREATE POLICY "Admin gerencia licenças"
ON public.licencas
FOR ALL
TO authenticated
USING (
  is_super_admin()
  OR (is_admin_or_super() AND ((empresa_id = get_user_empresa_id()) OR (empresa_id IS NULL)))
)
WITH CHECK (
  is_super_admin()
  OR (is_admin_or_super() AND ((empresa_id = get_user_empresa_id()) OR (empresa_id IS NULL)))
);

-- 3) Revendas: restrict UPDATE/DELETE to admins only
DROP POLICY IF EXISTS "Admin gerencia revendas" ON public.revendas;
DROP POLICY IF EXISTS "Usuários veem revendas" ON public.revendas;

CREATE POLICY "Usuários veem revendas"
ON public.revendas
FOR SELECT
TO authenticated
USING (
  is_super_admin()
  OR is_admin_or_super()
  OR (empresa_id = get_user_empresa_id())
  OR (revendedor_id IN (
    SELECT id FROM public.usuario_perfil WHERE user_id = auth.uid()
  ))
);

CREATE POLICY "Admin gerencia revendas"
ON public.revendas
FOR ALL
TO authenticated
USING (
  is_super_admin()
  OR (is_admin_or_super() AND ((empresa_id = get_user_empresa_id()) OR (empresa_id IS NULL)))
)
WITH CHECK (
  is_super_admin()
  OR (is_admin_or_super() AND ((empresa_id = get_user_empresa_id()) OR (empresa_id IS NULL)))
);

-- 4) Add DELETE policy for usuario_perfil (admin scope)
CREATE POLICY "Admin remove perfis da empresa"
ON public.usuario_perfil
FOR DELETE
TO authenticated
USING (
  is_super_admin()
  OR (is_admin_or_super() AND empresa_id = get_user_empresa_id())
);
