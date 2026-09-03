-- Usuários sem empresa vinculada (empresa_id NULL no perfil) não conseguiam ver
-- o próprio histórico de mensagens: a policy comparava empresa_id = NULL.
-- Passa a permitir também ver/inserir as mensagens registradas pelo próprio usuário.
DROP POLICY IF EXISTS "Usuários veem mensagens da empresa" ON public.mensagens_enviadas;
CREATE POLICY "Usuários veem mensagens da empresa" ON public.mensagens_enviadas
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR empresa_id = get_user_empresa_id()
    OR usuario_id IN (SELECT id FROM public.usuario_perfil WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admin insere mensagens" ON public.mensagens_enviadas;
CREATE POLICY "Admin insere mensagens" ON public.mensagens_enviadas
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR (is_admin_or_super() AND (empresa_id = get_user_empresa_id() OR empresa_id IS NULL))
    OR usuario_id IN (SELECT id FROM public.usuario_perfil WHERE user_id = auth.uid())
  );
