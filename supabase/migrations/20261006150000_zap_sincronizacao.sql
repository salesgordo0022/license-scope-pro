-- WhatsApp (ZapContábil) por sincronização.
--
-- A API do ZapContábil não documenta webhook de mensagens recebidas. A
-- function zapcontabil-sincronizar busca as mensagens novas pela API
-- (GET /api/messages + GET /api/tickets/{id}) e grava só as do canal escolhido
-- (zap_filtro = nome da conexão ou do setor, ex.: "Impertech"). Roda a cada
-- minuto pelo pg_cron e também pelo botão "Sincronizar" da tela.

ALTER TABLE public.chamados_config
  ADD COLUMN IF NOT EXISTS zap_conexao_id integer,   -- conexão usada para responder (descoberta pelo nome)
  ADD COLUMN IF NOT EXISTS zap_sync_ate timestamptz, -- até onde já sincronizou
  ADD COLUMN IF NOT EXISTS zap_sync_erro text;       -- último erro da sincronização (mostrado na tela)

-- Cache dos atendimentos do ZapContábil: evita consultar o mesmo atendimento
-- e contato a cada mensagem. "passa" = é do canal escolhido.
CREATE TABLE IF NOT EXISTS public.zap_atendimentos (
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  ticket_id text NOT NULL,
  passa boolean NOT NULL,
  numero text,
  nome text,
  canal_nome text,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, ticket_id)
);
ALTER TABLE public.zap_atendimentos ENABLE ROW LEVEL SECURITY;  -- sem policy: só service role
REVOKE ALL ON public.zap_atendimentos FROM anon, authenticated;
GRANT ALL ON public.zap_atendimentos TO service_role;

-- Agenda a sincronização a cada minuto. Se pg_cron/pg_net não estiverem
-- disponíveis, a migration segue e a tela continua com o botão Sincronizar.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'chamados-zap-sincronizar';
  PERFORM cron.schedule(
    'chamados-zap-sincronizar',
    '* * * * *',
    $job$
      SELECT net.http_post(
        url := 'https://nxpblhykcakrdcnnzyyg.supabase.co/functions/v1/zapcontabil-sincronizar?empresa=' || empresa_id || '&token=' || zap_webhook_token,
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{}'::jsonb
      )
      FROM public.chamados_config
      WHERE coalesce(btrim(zap_filtro), '') <> ''
    $job$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Agendamento da sincronização do ZapContábil não criado: %', SQLERRM;
END $$;
