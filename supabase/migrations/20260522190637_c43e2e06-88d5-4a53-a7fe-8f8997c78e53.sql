
-- Buckets públicos
INSERT INTO storage.buckets (id, name, public) VALUES
  ('contract-logos', 'contract-logos', true),
  ('boletos', 'boletos', true)
ON CONFLICT (id) DO NOTHING;

-- Leitura pública
CREATE POLICY "Public read contract-logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'contract-logos');

CREATE POLICY "Public read boletos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'boletos');

-- Upload autenticado
CREATE POLICY "Auth upload contract-logos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contract-logos');

CREATE POLICY "Auth upload boletos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'boletos');

-- Update autenticado
CREATE POLICY "Auth update contract-logos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'contract-logos');

CREATE POLICY "Auth update boletos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'boletos');

-- Delete autenticado
CREATE POLICY "Auth delete contract-logos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'contract-logos');

CREATE POLICY "Auth delete boletos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'boletos');
