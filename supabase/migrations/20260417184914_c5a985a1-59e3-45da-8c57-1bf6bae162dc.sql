ALTER TABLE public.licencas 
ADD COLUMN IF NOT EXISTS data_pagamento_sistema date DEFAULT NULL,
ADD COLUMN IF NOT EXISTS modelo_cobranca text DEFAULT 'saas' NOT NULL;