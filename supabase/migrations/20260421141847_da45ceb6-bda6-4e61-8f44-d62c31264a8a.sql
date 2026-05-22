
DROP POLICY IF EXISTS "Usuário atualiza próprio perfil" ON public.usuario_perfil;

CREATE POLICY "Usuário atualiza próprio perfil"
ON public.usuario_perfil
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND tipo = (SELECT tipo FROM public.usuario_perfil WHERE user_id = auth.uid())
  AND empresa_id IS NOT DISTINCT FROM (SELECT empresa_id FROM public.usuario_perfil WHERE user_id = auth.uid())
);
