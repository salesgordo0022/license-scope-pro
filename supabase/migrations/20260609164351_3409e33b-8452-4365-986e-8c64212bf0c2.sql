
DROP POLICY IF EXISTS "Public read contract-logos" ON storage.objects;
DROP POLICY IF EXISTS "Public read boletos" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload contract-logos" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload boletos" ON storage.objects;
DROP POLICY IF EXISTS "Auth update contract-logos" ON storage.objects;
DROP POLICY IF EXISTS "Auth update boletos" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete contract-logos" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete boletos" ON storage.objects;

CREATE POLICY "Public read contract-logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'contract-logos');

CREATE POLICY "Empresa upload contract-logos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'contract-logos'
    AND (storage.foldername(name))[1] = public.get_user_empresa_id()::text
  );

CREATE POLICY "Empresa update contract-logos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'contract-logos'
    AND (storage.foldername(name))[1] = public.get_user_empresa_id()::text
  );

CREATE POLICY "Empresa delete contract-logos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'contract-logos'
    AND (storage.foldername(name))[1] = public.get_user_empresa_id()::text
  );

CREATE POLICY "Empresa read boletos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'boletos'
    AND (storage.foldername(name))[1] = public.get_user_empresa_id()::text
  );

CREATE POLICY "Empresa upload boletos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'boletos'
    AND (storage.foldername(name))[1] = public.get_user_empresa_id()::text
  );

CREATE POLICY "Empresa update boletos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'boletos'
    AND (storage.foldername(name))[1] = public.get_user_empresa_id()::text
  );

CREATE POLICY "Empresa delete boletos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'boletos'
    AND (storage.foldername(name))[1] = public.get_user_empresa_id()::text
  );

REVOKE EXECUTE ON FUNCTION public.is_admin_or_super() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_empresa_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM PUBLIC, anon, authenticated;
