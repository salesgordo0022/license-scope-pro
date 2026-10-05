-- Chamados: caixa de entrada única com mensagens do Slack (DMs, menções e
-- canais escolhidos) e de um canal do ZapContábil (WhatsApp).
--
-- As mensagens que chegam (direcao = 'entrada') são gravadas pelas Edge
-- Functions slack-eventos e zapcontabil-webhook com a service role. As
-- respostas (direcao = 'saida') saem pela function chamados-responder, que
-- age como o usuário logado e por isso passa pelo RLS abaixo.

-- Configuração por empresa. Os tokens do Slack/ZapContábil NÃO ficam aqui:
-- são secrets das Edge Functions.
CREATE TABLE IF NOT EXISTS public.chamados_config (
  empresa_id uuid PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE DEFAULT public.get_user_empresa_id(),
  slack_team_id text,                       -- workspace (T0123...) que pertence a esta empresa
  slack_user_id text,                       -- seu usuário no Slack (U0123...): DMs e menções a ele viram chamado
  slack_canais text[] NOT NULL DEFAULT '{}', -- canais (C0123...) cujas mensagens viram chamado
  zap_webhook_token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''), -- vai na URL do webhook
  zap_filtro text,                          -- id/nome da conexão ou fila do ZapContábil a considerar (vazio = todas)
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chamados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  origem text NOT NULL CHECK (origem IN ('slack', 'zapcontabil')),
  -- Identifica a conversa na origem: DM do Slack, thread de canal ou número do WhatsApp.
  conversa_id text NOT NULL,
  canal_nome text,
  contato_nome text,
  contato_id text,
  assunto text,
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'em_atendimento', 'aguardando', 'resolvido')),
  prioridade text NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa', 'media', 'alta', 'urgente')),
  responsavel_id uuid REFERENCES public.usuario_perfil(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  ultima_mensagem_em timestamptz NOT NULL DEFAULT now(),
  nao_lidas integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, origem, conversa_id)
);

CREATE INDEX IF NOT EXISTS chamados_empresa_ultima_idx ON public.chamados (empresa_id, ultima_mensagem_em DESC);

CREATE TABLE IF NOT EXISTS public.chamado_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chamado_id uuid NOT NULL REFERENCES public.chamados(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  direcao text NOT NULL CHECK (direcao IN ('entrada', 'saida')),
  autor_nome text,
  texto text NOT NULL DEFAULT '',
  externo_id text,                          -- ts do Slack / id da mensagem no ZapContábil (evita duplicar)
  anexos jsonb NOT NULL DEFAULT '[]',
  bruto jsonb,                              -- payload original (ajuda a ajustar o formato do webhook)
  enviado_por uuid REFERENCES public.usuario_perfil(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chamado_id, externo_id)
);

CREATE INDEX IF NOT EXISTS chamado_mensagens_chamado_idx ON public.chamado_mensagens (chamado_id, created_at);

ALTER TABLE public.chamados_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chamados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chamado_mensagens ENABLE ROW LEVEL SECURITY;

-- Configuração: todos da empresa leem; só admin altera.
DROP POLICY IF EXISTS "Empresa lê config de chamados" ON public.chamados_config;
CREATE POLICY "Empresa lê config de chamados" ON public.chamados_config
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR empresa_id = public.get_user_empresa_id());

DROP POLICY IF EXISTS "Admin altera config de chamados" ON public.chamados_config;
CREATE POLICY "Admin altera config de chamados" ON public.chamados_config
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (public.is_admin_or_super() AND empresa_id = public.get_user_empresa_id()))
  WITH CHECK (public.is_super_admin() OR (public.is_admin_or_super() AND empresa_id = public.get_user_empresa_id()));

-- Chamados: a empresa vê e atualiza (status, responsável, cliente). Criação é
-- feita pelas functions com service role.
DROP POLICY IF EXISTS "Empresa vê chamados" ON public.chamados;
CREATE POLICY "Empresa vê chamados" ON public.chamados
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR empresa_id = public.get_user_empresa_id());

DROP POLICY IF EXISTS "Empresa atualiza chamados" ON public.chamados;
CREATE POLICY "Empresa atualiza chamados" ON public.chamados
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR empresa_id = public.get_user_empresa_id())
  WITH CHECK (public.is_super_admin() OR empresa_id = public.get_user_empresa_id());

DROP POLICY IF EXISTS "Admin exclui chamados" ON public.chamados;
CREATE POLICY "Admin exclui chamados" ON public.chamados
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR (public.is_admin_or_super() AND empresa_id = public.get_user_empresa_id()));

-- Mensagens: a empresa lê; o usuário só grava respostas (saida) em nome próprio.
DROP POLICY IF EXISTS "Empresa vê mensagens de chamados" ON public.chamado_mensagens;
CREATE POLICY "Empresa vê mensagens de chamados" ON public.chamado_mensagens
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR empresa_id = public.get_user_empresa_id());

DROP POLICY IF EXISTS "Usuário grava resposta de chamado" ON public.chamado_mensagens;
CREATE POLICY "Usuário grava resposta de chamado" ON public.chamado_mensagens
  FOR INSERT TO authenticated
  WITH CHECK (direcao = 'saida' AND empresa_id = public.get_user_empresa_id());

-- Tempo real: a tela recebe mensagens novas sem recarregar.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chamados;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chamado_mensagens;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
