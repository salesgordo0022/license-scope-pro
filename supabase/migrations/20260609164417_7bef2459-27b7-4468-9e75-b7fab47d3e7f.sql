
DROP POLICY IF EXISTS "Public read contract-logos" ON storage.objects;

CREATE POLICY "Auth read contract-logos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'contract-logos');
