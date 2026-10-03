-- CEP do cliente: usado na qualificação do contratante nos contratos Word
-- (modelos Ponto Tell e Sistemas) e preenchido pela busca de CNPJ.
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS cep text;
