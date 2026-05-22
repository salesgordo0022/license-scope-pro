
-- 1. Remove overly permissive payments policy
DROP POLICY IF EXISTS "Liberar tudo pagamentos" ON public.pagamentos;

-- 2. Prevent privilege escalation on usuario_perfil self-update
DROP POLICY IF EXISTS "Usuário atualiza próprio nome" ON public.usuario_perfil;
CREATE POLICY "Usuário atualiza próprio nome"
ON public.usuario_perfil
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND tipo = (SELECT tipo FROM public.usuario_perfil WHERE user_id = auth.uid())
  AND empresa_id IS NOT DISTINCT FROM (SELECT empresa_id FROM public.usuario_perfil WHERE user_id = auth.uid())
);

-- Attach safety trigger as defense in depth
DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.usuario_perfil;
CREATE TRIGGER trg_prevent_role_escalation
BEFORE UPDATE ON public.usuario_perfil
FOR EACH ROW
EXECUTE FUNCTION public.prevent_role_escalation();

-- 3. Revoke EXECUTE on SECURITY DEFINER helper functions from anon/authenticated
-- They are still usable inside RLS policies (evaluated with policy owner privileges)
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_super() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.get_user_empresa_id() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM anon, authenticated, public;
