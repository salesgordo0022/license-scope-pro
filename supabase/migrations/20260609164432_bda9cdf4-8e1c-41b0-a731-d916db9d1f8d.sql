
DROP POLICY IF EXISTS "Auth read contract-logos" ON storage.objects;

CREATE POLICY "Empresa read contract-logos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'contract-logos'
    AND (storage.foldername(name))[1] = public.get_user_empresa_id()::text
  );
