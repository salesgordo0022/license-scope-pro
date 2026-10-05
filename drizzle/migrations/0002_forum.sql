CREATE TABLE IF NOT EXISTS public.forum_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE DEFAULT public.get_user_empresa_id(),
  autor_id uuid REFERENCES public.usuario_perfil(id) ON DELETE SET NULL,
  titulo text NOT NULL CHECK (length(btrim(titulo)) > 0),
  categoria text NOT NULL DEFAULT 'problema' CHECK (categoria IN ('problema', 'solucao', 'procedimento', 'documentacao', 'ideia')),
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'em_analise', 'resolvido')),
  tags text[] NOT NULL DEFAULT '{}',
  conteudo_html text NOT NULL DEFAULT '',
  canvas jsonb NOT NULL DEFAULT '{"nodes": [], "edges": []}',
  anexos jsonb NOT NULL DEFAULT '[]',
  fixado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS forum_posts_empresa_idx ON public.forum_posts (empresa_id, fixado DESC, updated_at DESC);
CREATE TABLE IF NOT EXISTS public.forum_comentarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE DEFAULT public.get_user_empresa_id(),
  autor_id uuid REFERENCES public.usuario_perfil(id) ON DELETE SET NULL,
  texto text NOT NULL CHECK (length(btrim(texto)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS forum_comentarios_post_idx ON public.forum_comentarios (post_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_posts TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.forum_comentarios TO authenticated;
GRANT ALL ON public.forum_posts, public.forum_comentarios TO service_role;
ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_comentarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Empresa lê posts do fórum" ON public.forum_posts FOR SELECT TO authenticated
  USING (public.is_super_admin() OR empresa_id = public.get_user_empresa_id());
CREATE POLICY "Empresa cria posts do fórum" ON public.forum_posts FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.get_user_empresa_id());
CREATE POLICY "Empresa edita posts do fórum" ON public.forum_posts FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR empresa_id = public.get_user_empresa_id())
  WITH CHECK (public.is_super_admin() OR empresa_id = public.get_user_empresa_id());
CREATE POLICY "Autor ou admin exclui post do fórum" ON public.forum_posts FOR DELETE TO authenticated
  USING (public.is_super_admin() OR (empresa_id = public.get_user_empresa_id() AND (public.is_admin_or_super() OR autor_id IN (SELECT id FROM public.usuario_perfil WHERE user_id = auth.uid()))));
CREATE POLICY "Empresa lê comentários do fórum" ON public.forum_comentarios FOR SELECT TO authenticated
  USING (public.is_super_admin() OR empresa_id = public.get_user_empresa_id());
CREATE POLICY "Empresa comenta no fórum" ON public.forum_comentarios FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.get_user_empresa_id());
CREATE POLICY "Autor ou admin exclui comentário" ON public.forum_comentarios FOR DELETE TO authenticated
  USING (public.is_super_admin() OR (empresa_id = public.get_user_empresa_id() AND (public.is_admin_or_super() OR autor_id IN (SELECT id FROM public.usuario_perfil WHERE user_id = auth.uid()))));
CREATE POLICY "Empresa lê arquivos do fórum" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'forum' AND (public.is_super_admin() OR (storage.foldername(name))[1] = public.get_user_empresa_id()::text));
CREATE POLICY "Empresa envia arquivos do fórum" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'forum' AND (storage.foldername(name))[1] = public.get_user_empresa_id()::text);
CREATE POLICY "Empresa apaga arquivos do fórum" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'forum' AND (public.is_super_admin() OR (storage.foldername(name))[1] = public.get_user_empresa_id()::text));