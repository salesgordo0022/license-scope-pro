
-- 1) Privilege escalation: revogar permissões de coluna sensíveis ao role authenticated
REVOKE UPDATE (tipo, empresa_id, user_id, email) ON public.usuario_perfil FROM authenticated;
GRANT UPDATE (nome) ON public.usuario_perfil TO authenticated;

-- Policy simplificada: usuário só atualiza próprio registro; colunas restringidas via GRANT
DROP POLICY IF EXISTS "Usuário atualiza próprio perfil" ON public.usuario_perfil;
CREATE POLICY "Usuário atualiza próprio nome"
ON public.usuario_perfil
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 2) Revendas: admin restrito à própria empresa
DROP POLICY IF EXISTS "Usuários veem revendas" ON public.revendas;
CREATE POLICY "Usuários veem revendas"
ON public.revendas
FOR SELECT
TO authenticated
USING (
  is_super_admin()
  OR (is_admin_or_super() AND empresa_id = get_user_empresa_id())
  OR (empresa_id = get_user_empresa_id())
  OR (revendedor_id IN (
    SELECT id FROM public.usuario_perfil WHERE user_id = auth.uid()
  ))
);
