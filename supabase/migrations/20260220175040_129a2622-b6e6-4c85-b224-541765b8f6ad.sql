-- Allow admins to see all profiles (not just super_admin)
DROP POLICY IF EXISTS "Super admin vê todos perfis" ON public.usuario_perfil;
DROP POLICY IF EXISTS "Admin vê perfis da sua empresa" ON public.usuario_perfil;
DROP POLICY IF EXISTS "Usuário vê próprio perfil" ON public.usuario_perfil;

-- Recreate as PERMISSIVE so they combine with OR logic
CREATE POLICY "Admin ou super vê todos perfis"
ON public.usuario_perfil
FOR SELECT
USING (is_admin_or_super());

CREATE POLICY "Usuário vê próprio perfil"
ON public.usuario_perfil
FOR SELECT
USING (user_id = auth.uid());