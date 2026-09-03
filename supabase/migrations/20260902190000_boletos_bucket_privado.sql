-- Garante que o bucket "boletos" seja privado (os envios usam URL assinada de
-- 30 dias) e limita tamanho/tipos de arquivo aceitos. Defensivo: hoje o bucket
-- já responde como privado, mas a migration original o criou com public = true.
UPDATE storage.buckets
SET public = false,
    file_size_limit = COALESCE(file_size_limit, 10485760), -- 10 MB
    allowed_mime_types = COALESCE(allowed_mime_types, ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
WHERE id = 'boletos';
