-- Fórum interno: registro de problemas do sistema e de como foram resolvidos.
-- Cada post tem texto rico (HTML do editor), um quadro estilo Canvas do
-- Obsidian (nós + ligações em JSON), anexos e comentários.
--
-- Fotos e documentos ficam no bucket privado "forum", na pasta da empresa
-- (<empresa_id>/...). A tela gera URLs assinadas na hora de mostrar.

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
  anexos jsonb NOT NULL DEFAULT '[]',          -- [{ nome, path, tipo, tamanho }]
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

ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_comentarios ENABLE ROW LEVEL SECURITY;

-- Posts: toda a empresa lê, cria e edita (é uma base colaborativa);
-- excluir só o autor ou um admin.
DROP POLICY IF EXISTS "Empresa lê posts do fórum" ON public.forum_posts;
CREATE POLICY "Empresa lê posts do fórum" ON public.forum_posts
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR empresa_id = public.get_user_empresa_id());

DROP POLICY IF EXISTS "Empresa cria posts do fórum" ON public.forum_posts;
CREATE POLICY "Empresa cria posts do fórum" ON public.forum_posts
  FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.get_user_empresa_id());

DROP POLICY IF EXISTS "Empresa edita posts do fórum" ON public.forum_posts;
CREATE POLICY "Empresa edita posts do fórum" ON public.forum_posts
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR empresa_id = public.get_user_empresa_id())
  WITH CHECK (public.is_super_admin() OR empresa_id = public.get_user_empresa_id());

DROP POLICY IF EXISTS "Autor ou admin exclui post do fórum" ON public.forum_posts;
CREATE POLICY "Autor ou admin exclui post do fórum" ON public.forum_posts
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin()
    OR (empresa_id = public.get_user_empresa_id()
        AND (public.is_admin_or_super()
             OR autor_id IN (SELECT id FROM public.usuario_perfil WHERE user_id = auth.uid())))
  );

DROP POLICY IF EXISTS "Empresa lê comentários do fórum" ON public.forum_comentarios;
CREATE POLICY "Empresa lê comentários do fórum" ON public.forum_comentarios
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR empresa_id = public.get_user_empresa_id());

DROP POLICY IF EXISTS "Empresa comenta no fórum" ON public.forum_comentarios;
CREATE POLICY "Empresa comenta no fórum" ON public.forum_comentarios
  FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.get_user_empresa_id());

DROP POLICY IF EXISTS "Autor ou admin exclui comentário" ON public.forum_comentarios;
CREATE POLICY "Autor ou admin exclui comentário" ON public.forum_comentarios
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin()
    OR (empresa_id = public.get_user_empresa_id()
        AND (public.is_admin_or_super()
             OR autor_id IN (SELECT id FROM public.usuario_perfil WHERE user_id = auth.uid())))
  );

-- Bucket privado para fotos e documentos do fórum (até 20 MB por arquivo).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'forum', 'forum', false, 20971520,
  ARRAY[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'application/pdf', 'text/plain', 'text/csv',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip'
  ]
)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Cada empresa só mexe na própria pasta (<empresa_id>/...).
DROP POLICY IF EXISTS "Empresa lê arquivos do fórum" ON storage.objects;
CREATE POLICY "Empresa lê arquivos do fórum" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'forum' AND (public.is_super_admin() OR (storage.foldername(name))[1] = public.get_user_empresa_id()::text));

DROP POLICY IF EXISTS "Empresa envia arquivos do fórum" ON storage.objects;
CREATE POLICY "Empresa envia arquivos do fórum" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'forum' AND (storage.foldername(name))[1] = public.get_user_empresa_id()::text);

DROP POLICY IF EXISTS "Empresa apaga arquivos do fórum" ON storage.objects;
CREATE POLICY "Empresa apaga arquivos do fórum" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'forum' AND (public.is_super_admin() OR (storage.foldername(name))[1] = public.get_user_empresa_id()::text));

-- Permissões explícitas (o RLS acima continua decidindo o que cada um vê).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_posts TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.forum_comentarios TO authenticated;
GRANT ALL ON public.forum_posts, public.forum_comentarios TO service_role;
