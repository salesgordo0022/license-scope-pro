-- Chaves de integrações (Slack etc.) guardadas no banco, para projetos em que
-- não dá para cadastrar secrets das Edge Functions (ex.: Lovable Cloud sem o
-- menu de Secrets). As functions leem primeiro o secret; se não existir, leem
-- daqui. Só a service role acessa: nenhum usuário do sistema vê os valores.
CREATE TABLE IF NOT EXISTS public.integracao_segredos (
  chave text PRIMARY KEY,
  valor text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.integracao_segredos ENABLE ROW LEVEL SECURITY;  -- sem policy: só service role
REVOKE ALL ON public.integracao_segredos FROM anon, authenticated;
GRANT ALL ON public.integracao_segredos TO service_role;
