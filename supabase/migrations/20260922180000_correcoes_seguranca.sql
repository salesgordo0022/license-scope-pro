-- ===========================================================================
-- Correções de segurança — auditoria de 2026-09-22
--
-- 1. Isola o bucket `contratos-assinados` por empresa (era legível por
--    QUALQUER usuário autenticado, de qualquer tenant).
-- 2. Isola os modelos de contrato por empresa (a policy antiga tinha um
--    `OR is_admin_or_super()` solto que anulava o filtro de empresa).
-- 3. Cria `contratos.documento_path`, para guardar o caminho do PDF no Storage
--    em vez de uma URL assinada de 1 ano gravada no banco.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Storage: contratos assinados
--
-- Policy antiga:
--   FOR SELECT TO authenticated USING (bucket_id = 'contratos-assinados')
-- Sem nenhum filtro de empresa. Combinada com o auto-cadastro aberto na tela
-- de login, bastava criar uma conta qualquer para baixar os contratos
-- assinados de todos os clientes de todas as empresas.
--
-- A function `assinar-contrato` passou a gravar em `<empresa_id>/contrato_...`,
-- então dá para amarrar a leitura à primeira pasta do caminho.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated read signed contracts" ON storage.objects;

CREATE POLICY "Empresa read signed contracts"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'contratos-assinados'
    AND (
      public.is_super_admin()
      OR (storage.foldername(name))[1] = public.get_user_empresa_id()::text
    )
  );

-- Garante que o bucket seja privado e só aceite PDF.
UPDATE storage.buckets
SET public = false,
    file_size_limit = COALESCE(file_size_limit, 10485760), -- 10 MB
    allowed_mime_types = COALESCE(allowed_mime_types, ARRAY['application/pdf'])
WHERE id = 'contratos-assinados';


-- ---------------------------------------------------------------------------
-- 2. Modelos de contrato
--
-- A policy de SELECT era:
--   USING (is_super_admin() OR is_admin_or_super() OR empresa_id = get_user_empresa_id())
-- O termo do meio libera qualquer admin — inclusive de outra empresa — a ler
-- TODOS os modelos. Como as cláusulas costumam conter condições comerciais,
-- isso é vazamento entre tenants. O mesmo vale para a policy de escrita, que
-- deixava um admin editar/apagar o modelo de outra empresa.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Usuários veem modelos" ON public.modelos_contrato;
CREATE POLICY "Usuários veem modelos da empresa" ON public.modelos_contrato
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR empresa_id = public.get_user_empresa_id()
    OR empresa_id IS NULL  -- modelos globais/legados continuam visíveis
  );

DROP POLICY IF EXISTS "Admin gerencia modelos" ON public.modelos_contrato;
CREATE POLICY "Admin gerencia modelos da empresa" ON public.modelos_contrato
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR (public.is_admin_or_super() AND empresa_id = public.get_user_empresa_id())
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.is_admin_or_super() AND empresa_id = public.get_user_empresa_id())
  );


-- ---------------------------------------------------------------------------
-- 3. Caminho do PDF assinado
--
-- `contratos.link_documento` é um campo livre onde o usuário cola links
-- externos (Google Drive etc.). A function de assinatura sobrescrevia esse
-- campo com uma URL assinada de 365 dias — ou seja, um link de acesso direto
-- ao PDF ficava salvo em texto no banco, válido por um ano e fora de qualquer
-- verificação de permissão.
--
-- Agora o caminho no bucket vai nesta coluna e o link é gerado sob demanda,
-- com validade curta, por quem tiver permissão de leitura.
-- ---------------------------------------------------------------------------
ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS documento_path text;

COMMENT ON COLUMN public.contratos.documento_path IS
  'Caminho do PDF assinado dentro do bucket contratos-assinados (formato: <empresa_id>/contrato_<id>_final.pdf). A URL de acesso é gerada sob demanda, nunca armazenada.';
