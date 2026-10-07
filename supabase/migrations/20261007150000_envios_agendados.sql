-- Envios agendados de WhatsApp (ZapContábil).
--
-- 1) mensagens_agendadas: regras que se repetem (todo dia 10, último dia do
--    mês, toda semana, todo dia ou uma vez numa data), com texto, anexo fixo
--    opcional, destinatários (todos os clientes ativos ou escolhidos) e a
--    conexão (canal) do ZapContábil que envia.
-- 2) fila_envios: cada mensagem a enviar para um cliente, com data/hora.
--    As regras geram linhas aqui na hora certa; os boletos agendados pela
--    Pasta de Boletos entram direto aqui (com o PDF guardado no bucket).
-- 3) A function envios-agendados roda a cada 2 minutos (pg_cron): transforma
--    as regras vencidas em fila e envia o que já chegou a hora.

CREATE TABLE IF NOT EXISTS public.mensagens_agendadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE DEFAULT public.get_user_empresa_id(),
  titulo text NOT NULL CHECK (length(btrim(titulo)) > 0),
  tipo text NOT NULL DEFAULT 'avulsa',                       -- avulsa | boleto | lembrete (vai para o histórico)
  mensagem text NOT NULL CHECK (length(btrim(mensagem)) > 0), -- aceita {nome} {contato} {mes} {mes_anterior} {ano} {data} {mensalidade}
  recorrencia text NOT NULL CHECK (recorrencia IN ('uma_vez', 'diaria', 'semanal', 'mensal', 'ultimo_dia_mes')),
  dia_mes integer CHECK (dia_mes BETWEEN 1 AND 31),          -- mensal (31 = último dia quando o mês é menor)
  dia_semana integer CHECK (dia_semana BETWEEN 0 AND 6),     -- semanal (0 = domingo)
  data_unica date,                                           -- uma_vez
  hora time NOT NULL DEFAULT '09:00',                        -- horário de Brasília
  destino text NOT NULL DEFAULT 'todos_ativos' CHECK (destino IN ('todos_ativos', 'selecionados')),
  clientes_ids uuid[] NOT NULL DEFAULT '{}',
  conexao_id integer,                                        -- conexão do ZapContábil; nulo = padrão
  conexao_nome text,
  anexo_path text,                                           -- arquivo fixo no bucket boletos (opcional)
  anexo_nome text,
  ativo boolean NOT NULL DEFAULT true,
  proxima_execucao timestamptz,
  ultima_execucao timestamptz,
  criado_por uuid REFERENCES public.usuario_perfil(id) ON DELETE SET NULL DEFAULT public.get_user_perfil_id(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mensagens_agendadas_proxima_idx ON public.mensagens_agendadas (proxima_execucao) WHERE ativo;

CREATE TABLE IF NOT EXISTS public.fila_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
  agendamento_id uuid REFERENCES public.mensagens_agendadas(id) ON DELETE SET NULL,
  periodo text,                                  -- execução da regra que gerou (evita duplicar)
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
  cliente_nome text,
  telefone text NOT NULL,
  mensagem text NOT NULL,
  tipo text NOT NULL DEFAULT 'avulsa',
  anexo_path text,
  anexo_nome text,
  conexao_id integer,
  enviar_em timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviando', 'enviado', 'enviado_link', 'enviado_sem_anexo', 'erro', 'cancelado')),
  erro text,
  enviado_em timestamptz,
  criado_por uuid REFERENCES public.usuario_perfil(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agendamento_id, periodo, cliente_id)
);
CREATE INDEX IF NOT EXISTS fila_envios_pendentes_idx ON public.fila_envios (enviar_em) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS fila_envios_empresa_idx ON public.fila_envios (empresa_id, enviar_em DESC);

ALTER TABLE public.mensagens_agendadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fila_envios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Empresa gerencia agendamentos" ON public.mensagens_agendadas;
CREATE POLICY "Empresa gerencia agendamentos" ON public.mensagens_agendadas
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR empresa_id = public.get_user_empresa_id())
  WITH CHECK (public.is_super_admin() OR empresa_id = public.get_user_empresa_id());

DROP POLICY IF EXISTS "Empresa vê a fila de envios" ON public.fila_envios;
CREATE POLICY "Empresa vê a fila de envios" ON public.fila_envios
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR empresa_id = public.get_user_empresa_id());

-- Pela tela só se cancela (status); criar e enviar é com a function.
DROP POLICY IF EXISTS "Empresa cancela envio" ON public.fila_envios;
CREATE POLICY "Empresa cancela envio" ON public.fila_envios
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR empresa_id = public.get_user_empresa_id())
  WITH CHECK (status = 'cancelado' AND (public.is_super_admin() OR empresa_id = public.get_user_empresa_id()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mensagens_agendadas TO authenticated;
GRANT SELECT ON public.fila_envios TO authenticated;
GRANT UPDATE (status) ON public.fila_envios TO authenticated;
GRANT ALL ON public.mensagens_agendadas, public.fila_envios TO service_role;

-- Token que o agendamento usa para chamar a function (fica só no banco).
INSERT INTO public.integracao_segredos (chave, valor)
VALUES ('ENVIOS_CRON_TOKEN', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
ON CONFLICT (chave) DO NOTHING;

-- Roda a cada 2 minutos.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'envios-agendados';
  PERFORM cron.schedule(
    'envios-agendados',
    '*/2 * * * *',
    $job$
      SELECT net.http_post(
        url := 'https://nxpblhykcakrdcnnzyyg.supabase.co/functions/v1/envios-agendados?token=' || valor,
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{"acao": "executar"}'::jsonb,
        timeout_milliseconds := 150000
      )
      FROM public.integracao_segredos
      WHERE chave = 'ENVIOS_CRON_TOKEN'
    $job$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Agendamento dos envios não criado: %', SQLERRM;
END $$;

NOTIFY pgrst, 'reload schema';
