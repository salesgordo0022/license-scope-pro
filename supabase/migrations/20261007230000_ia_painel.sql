-- Painel da IA: parâmetros, equipe (WhatsApp para alertas), base de
-- conhecimento e registro dos alertas.
--
-- O "plantão" (function ia-atendimento, acao=plantao, a cada 2 min) faz:
--  * ALERTA DE FILA: colaborador com N ou mais chamados em aberto recebe no
--    WhatsApp pessoal a lista com um resumo de cada um (no máximo 1 por
--    intervalo, ou antes se a fila crescer);
--  * AVISO DE DEMORA: chamado em que o cliente/colega está esperando há mais
--    de X minutos recebe uma mensagem educada pedindo para aguardar (uma vez
--    por espera). Opcional: a IA já tenta ajudar com a base de conhecimento.

CREATE TABLE IF NOT EXISTS public.ia_config (
  empresa_id uuid PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE DEFAULT public.get_user_empresa_id(),
  -- alerta de fila
  alerta_fila_ativo boolean NOT NULL DEFAULT true,
  alerta_fila_limite integer NOT NULL DEFAULT 5 CHECK (alerta_fila_limite BETWEEN 1 AND 200),
  alerta_intervalo_min integer NOT NULL DEFAULT 60 CHECK (alerta_intervalo_min BETWEEN 10 AND 1440),
  alerta_fila_geral boolean NOT NULL DEFAULT true,   -- chamados sem responsável contam para quem recebe alertas
  alerta_conexao_id integer,                         -- canal do ZapContábil que manda os alertas internos
  alerta_conexao_nome text,
  -- aviso de demora
  aviso_demora_ativo boolean NOT NULL DEFAULT true,
  aviso_demora_min integer NOT NULL DEFAULT 10 CHECK (aviso_demora_min BETWEEN 1 AND 1440),
  aviso_demora_slack boolean NOT NULL DEFAULT true,
  aviso_demora_whatsapp boolean NOT NULL DEFAULT false,
  aviso_demora_texto text NOT NULL DEFAULT 'Oi {nome}! Recebemos sua mensagem. {atendente} está finalizando outro atendimento e já te responde. Obrigado pela paciência! 🙏',
  plantao_ia_ajuda boolean NOT NULL DEFAULT false,   -- depois do aviso, a IA já tenta ajudar com a base
  -- horário em que o plantão funciona (Brasília)
  horario_dias integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  horario_inicio time NOT NULL DEFAULT '08:00',
  horario_fim time NOT NULL DEFAULT '18:00',
  -- IA
  usar_forum boolean NOT NULL DEFAULT true,          -- posts resolvidos do Fórum também viram conhecimento
  modelo text,                                       -- vazio = GROQ_MODEL / padrão
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ia_equipe (
  perfil_id uuid PRIMARY KEY REFERENCES public.usuario_perfil(id) ON DELETE CASCADE,
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE DEFAULT public.get_user_empresa_id(),
  whatsapp text,
  receber_alertas boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ia_conhecimento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE DEFAULT public.get_user_empresa_id(),
  titulo text NOT NULL CHECK (length(btrim(titulo)) > 0),
  conteudo text NOT NULL CHECK (length(btrim(conteudo)) > 0),
  tags text[] NOT NULL DEFAULT '{}',
  ativo boolean NOT NULL DEFAULT true,
  criado_por uuid REFERENCES public.usuario_perfil(id) ON DELETE SET NULL DEFAULT public.get_user_perfil_id(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ia_conhecimento_empresa_idx ON public.ia_conhecimento (empresa_id) WHERE ativo;

CREATE TABLE IF NOT EXISTS public.ia_alertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo text NOT NULL,                 -- fila | demora
  perfil_id uuid REFERENCES public.usuario_perfil(id) ON DELETE SET NULL,
  chamado_id uuid REFERENCES public.chamados(id) ON DELETE SET NULL,
  quantidade integer,
  destino text,
  mensagem text,
  status text NOT NULL DEFAULT 'enviado',
  erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ia_alertas_empresa_idx ON public.ia_alertas (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ia_alertas_perfil_idx ON public.ia_alertas (perfil_id, tipo, created_at DESC);

ALTER TABLE public.chamados ADD COLUMN IF NOT EXISTS aviso_demora_em timestamptz;
ALTER TABLE public.chamado_mensagens ADD COLUMN IF NOT EXISTS aviso boolean NOT NULL DEFAULT false;

-- O aviso de "aguarde um pouco" não conta como primeira resposta (o SLA é da equipe).
CREATE OR REPLACE FUNCTION public.chamado_mensagens_primeira_resposta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.direcao = 'saida' AND NOT NEW.aviso THEN
    UPDATE public.chamados
       SET primeira_resposta_em = NEW.created_at
     WHERE id = NEW.chamado_id AND primeira_resposta_em IS NULL;
  END IF;
  RETURN NEW;
END $$;

ALTER TABLE public.ia_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ia_equipe ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ia_conhecimento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ia_alertas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Empresa vê config da IA" ON public.ia_config;
CREATE POLICY "Empresa vê config da IA" ON public.ia_config FOR SELECT TO authenticated
  USING (public.is_super_admin() OR empresa_id = public.get_user_empresa_id());
DROP POLICY IF EXISTS "Admin altera config da IA" ON public.ia_config;
CREATE POLICY "Admin altera config da IA" ON public.ia_config FOR ALL TO authenticated
  USING (public.is_super_admin() OR (public.is_admin_or_super() AND empresa_id = public.get_user_empresa_id()))
  WITH CHECK (public.is_super_admin() OR (public.is_admin_or_super() AND empresa_id = public.get_user_empresa_id()));

DROP POLICY IF EXISTS "Empresa vê equipe da IA" ON public.ia_equipe;
CREATE POLICY "Empresa vê equipe da IA" ON public.ia_equipe FOR SELECT TO authenticated
  USING (public.is_super_admin() OR empresa_id = public.get_user_empresa_id());
DROP POLICY IF EXISTS "Admin ou o próprio altera equipe da IA" ON public.ia_equipe;
CREATE POLICY "Admin ou o próprio altera equipe da IA" ON public.ia_equipe FOR ALL TO authenticated
  USING (public.is_super_admin() OR (empresa_id = public.get_user_empresa_id() AND (public.is_admin_or_super() OR perfil_id = public.get_user_perfil_id())))
  WITH CHECK (public.is_super_admin() OR (empresa_id = public.get_user_empresa_id() AND (public.is_admin_or_super() OR perfil_id = public.get_user_perfil_id())));

DROP POLICY IF EXISTS "Empresa vê a base da IA" ON public.ia_conhecimento;
CREATE POLICY "Empresa vê a base da IA" ON public.ia_conhecimento FOR SELECT TO authenticated
  USING (public.is_super_admin() OR empresa_id = public.get_user_empresa_id());
DROP POLICY IF EXISTS "Empresa escreve na base da IA" ON public.ia_conhecimento;
CREATE POLICY "Empresa escreve na base da IA" ON public.ia_conhecimento FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.get_user_empresa_id());
DROP POLICY IF EXISTS "Empresa edita a base da IA" ON public.ia_conhecimento;
CREATE POLICY "Empresa edita a base da IA" ON public.ia_conhecimento FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR empresa_id = public.get_user_empresa_id())
  WITH CHECK (public.is_super_admin() OR empresa_id = public.get_user_empresa_id());
DROP POLICY IF EXISTS "Admin apaga da base da IA" ON public.ia_conhecimento;
CREATE POLICY "Admin apaga da base da IA" ON public.ia_conhecimento FOR DELETE TO authenticated
  USING (public.is_super_admin() OR (public.is_admin_or_super() AND empresa_id = public.get_user_empresa_id()));

DROP POLICY IF EXISTS "Empresa vê alertas da IA" ON public.ia_alertas;
CREATE POLICY "Empresa vê alertas da IA" ON public.ia_alertas FOR SELECT TO authenticated
  USING (public.is_super_admin() OR empresa_id = public.get_user_empresa_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ia_config, public.ia_equipe, public.ia_conhecimento TO authenticated;
GRANT SELECT ON public.ia_alertas TO authenticated;
GRANT ALL ON public.ia_config, public.ia_equipe, public.ia_conhecimento, public.ia_alertas TO service_role;

-- Plantão a cada 2 minutos.
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ia-plantao';
  PERFORM cron.schedule(
    'ia-plantao',
    '*/2 * * * *',
    $job$
      SELECT net.http_post(
        url := 'https://nxpblhykcakrdcnnzyyg.supabase.co/functions/v1/ia-atendimento?token=' || valor,
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{"acao": "plantao"}'::jsonb,
        timeout_milliseconds := 10000
      )
      FROM public.integracao_segredos
      WHERE chave = 'IA_TOKEN'
    $job$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Plantão da IA não agendado: %', SQLERRM;
END $$;

NOTIFY pgrst, 'reload schema';
