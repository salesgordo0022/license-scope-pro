-- Tornar empresa_id nullable nas tabelas principais para admins sem empresa

ALTER TABLE public.licencas 
ALTER COLUMN empresa_id DROP NOT NULL;

ALTER TABLE public.pagamentos 
ALTER COLUMN empresa_id DROP NOT NULL;

ALTER TABLE public.revendas 
ALTER COLUMN empresa_id DROP NOT NULL;