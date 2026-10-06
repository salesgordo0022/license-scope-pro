-- Chamados por usuário + medição mensal.
--
-- 1. Cada usuário conecta o PRÓPRIO Slack (OAuth, function slack-oauth). O
--    token fica em slack_conexoes e nunca é lido pelo navegador. Os chamados
--    do Slack passam a ter dono (dono_id): cada um vê as suas DMs, menções e
--    canais escolhidos. Admin vê tudo (para gerir a equipe e os números).
--    WhatsApp (ZapContábil) continua numa fila comum (dono_id nulo).
-- 2. Conversa resolvida que volta a falar depois de "reabrir_horas" vira um
--    chamado NOVO — antes reabria o mesmo para sempre e a contagem por mês
--    não fazia sentido.
-- 3. Gravação atômica das mensagens recebidas (função chamado_registrar), sem
--    a corrida de leitura+escrita no contador de não lidas.
-- 4. Marcos para medir atendimento: primeira_resposta_em e resolvido_em.
-- 5. O usuário só altera os campos de atendimento do chamado.

-- Perfil do usuário logado (id em usuario_perfil).
CREATE OR REPLACE FUNCTION public.get_user_perfil_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.usuario_perfil WHERE user_id = auth.uid() LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_user_perfil_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_perfil_id() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Conexões do Slack (uma por usuário)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.slack_conexoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  perfil_id uuid NOT NULL UNIQUE REFERENCES public.usuario_perfil(id) ON DELETE CASCADE,
  slack_team_id text NOT NULL,
  slack_team_nome text,
  slack_user_id text NOT NULL,
  slack_nome text,
  access_token text NOT NULL,               -- xoxp- do usuário; só as functions leem
  canais text[] NOT NULL DEFAULT '{}',      -- canais (C…) cujas mensagens viram chamado para este usuário
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slack_team_id, slack_user_id)
);

ALTER TABLE public.slack_conexoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuário vê a própria conexão Slack" ON public.slack_conexoes;
CREATE POLICY "Usuário vê a própria conexão Slack" ON public.slack_conexoes
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR perfil_id = public.get_user_perfil_id()
    OR (public.is_admin_or_super() AND empresa_id = public.get_user_empresa_id())
  );

DROP POLICY IF EXISTS "Usuário escolhe os próprios canais" ON public.slack_conexoes;
CREATE POLICY "Usuário escolhe os próprios canais" ON public.slack_conexoes
  FOR UPDATE TO authenticated
  USING (perfil_id = public.get_user_perfil_id())
  WITH CHECK (perfil_id = public.get_user_perfil_id());

DROP POLICY IF EXISTS "Usuário ou admin desconecta" ON public.slack_conexoes;
CREATE POLICY "Usuário ou admin desconecta" ON public.slack_conexoes
  FOR DELETE TO authenticated
  USING (
    perfil_id = public.get_user_perfil_id()
    OR (public.is_admin_or_super() AND empresa_id = public.get_user_empresa_id())
  );

-- O token NÃO entra no SELECT do navegador (permissão por coluna).
REVOKE ALL ON public.slack_conexoes FROM anon, authenticated;
GRANT SELECT (id, empresa_id, perfil_id, slack_team_id, slack_team_nome, slack_user_id, slack_nome, canais, created_at, updated_at)
  ON public.slack_conexoes TO authenticated;
GRANT UPDATE (canais, updated_at) ON public.slack_conexoes TO authenticated;
GRANT DELETE ON public.slack_conexoes TO authenticated;
GRANT ALL ON public.slack_conexoes TO service_role;

-- "state" do OAuth: liga o retorno do Slack ao usuário que clicou em Conectar.
CREATE TABLE IF NOT EXISTS public.slack_oauth_estados (
  estado text PRIMARY KEY,
  perfil_id uuid NOT NULL REFERENCES public.usuario_perfil(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  volta_url text NOT NULL,
  expira_em timestamptz NOT NULL DEFAULT now() + interval '15 minutes'
);
ALTER TABLE public.slack_oauth_estados ENABLE ROW LEVEL SECURITY;  -- sem policy: só service role
REVOKE ALL ON public.slack_oauth_estados FROM anon, authenticated;
GRANT ALL ON public.slack_oauth_estados TO service_role;

-- ---------------------------------------------------------------------------
-- Chamados: dono, marcos de atendimento e um chamado novo por ocorrência
-- ---------------------------------------------------------------------------
ALTER TABLE public.chamados
  ADD COLUMN IF NOT EXISTS dono_id uuid REFERENCES public.usuario_perfil(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS primeira_resposta_em timestamptz,
  ADD COLUMN IF NOT EXISTS resolvido_em timestamptz;

ALTER TABLE public.chamados_config
  ADD COLUMN IF NOT EXISTS reabrir_horas integer NOT NULL DEFAULT 24 CHECK (reabrir_horas BETWEEN 0 AND 720);

-- Antes: um chamado por conversa para sempre. Agora: no máximo UM ativo por
-- conversa e dono; os resolvidos ficam como histórico.
ALTER TABLE public.chamados DROP CONSTRAINT IF EXISTS chamados_empresa_id_origem_conversa_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS chamados_ativo_por_conversa_idx
  ON public.chamados (empresa_id, origem, conversa_id, coalesce(dono_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status <> 'resolvido';
CREATE INDEX IF NOT EXISTS chamados_conversa_idx ON public.chamados (empresa_id, origem, conversa_id);
CREATE INDEX IF NOT EXISTS chamados_empresa_criado_idx ON public.chamados (empresa_id, created_at);
CREATE INDEX IF NOT EXISTS chamados_dono_idx ON public.chamados (dono_id);

-- Chamados já resolvidos antes desta migration: usa a última atualização.
UPDATE public.chamados SET resolvido_em = updated_at WHERE status = 'resolvido' AND resolvido_em IS NULL;
UPDATE public.chamados c
   SET primeira_resposta_em = m.primeira
  FROM (SELECT chamado_id, min(created_at) AS primeira FROM public.chamado_mensagens WHERE direcao = 'saida' GROUP BY chamado_id) m
 WHERE m.chamado_id = c.id AND c.primeira_resposta_em IS NULL;

-- Marca/desmarca resolvido_em e updated_at em qualquer mudança de status.
CREATE OR REPLACE FUNCTION public.chamados_marcos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'resolvido' AND OLD.status IS DISTINCT FROM 'resolvido' THEN
    NEW.resolvido_em := now();
  ELSIF NEW.status <> 'resolvido' THEN
    NEW.resolvido_em := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS chamados_marcos ON public.chamados;
CREATE TRIGGER chamados_marcos BEFORE UPDATE ON public.chamados
  FOR EACH ROW EXECUTE FUNCTION public.chamados_marcos();

-- Primeira resposta (de qualquer lugar: tela, Slack ou ZapContábil).
CREATE OR REPLACE FUNCTION public.chamado_mensagens_primeira_resposta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.direcao = 'saida' THEN
    UPDATE public.chamados
       SET primeira_resposta_em = NEW.created_at
     WHERE id = NEW.chamado_id AND primeira_resposta_em IS NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.chamado_mensagens_primeira_resposta() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS chamado_mensagens_primeira_resposta ON public.chamado_mensagens;
CREATE TRIGGER chamado_mensagens_primeira_resposta AFTER INSERT ON public.chamado_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.chamado_mensagens_primeira_resposta();

-- ---------------------------------------------------------------------------
-- Gravação das mensagens vindas do Slack / ZapContábil (só service role)
-- ---------------------------------------------------------------------------
-- p_direcao = 'entrada': mensagem do contato. Usa o chamado ativo da conversa;
--   se não houver, reabre o resolvido há menos de reabrir_horas; senão abre um
--   novo. Com p_so_existente = true não abre chamado novo (resposta numa
--   thread que só interessa se já é chamado).
-- p_direcao = 'saida': resposta feita fora do sistema (pelo Slack ou pelo
--   ZapContábil). Só grava se a conversa já é chamado.
-- Mensagem repetida (mesmo externo_id no chamado) é ignorada.
CREATE OR REPLACE FUNCTION public.chamado_registrar(
  p_empresa_id uuid,
  p_origem text,
  p_conversa_id text,
  p_dono_id uuid,
  p_direcao text,
  p_texto text,
  p_externo_id text,
  p_autor_nome text DEFAULT NULL,
  p_canal_nome text DEFAULT NULL,
  p_contato_nome text DEFAULT NULL,
  p_contato_id text DEFAULT NULL,
  p_anexos jsonb DEFAULT '[]',
  p_bruto jsonb DEFAULT NULL,
  p_quando timestamptz DEFAULT NULL,
  p_so_existente boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_quando timestamptz := coalesce(p_quando, now());
  v_horas integer;
  v_id uuid;
  v_status text;
  v_novo boolean := false;
  v_msg uuid;
BEGIN
  -- Serializa entregas simultâneas da mesma conversa (Slack/webhook reenviam).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_empresa_id::text || p_origem || p_conversa_id || coalesce(p_dono_id::text, ''), 0));

  SELECT id, status INTO v_id, v_status
    FROM chamados
   WHERE empresa_id = p_empresa_id AND origem = p_origem AND conversa_id = p_conversa_id
     AND dono_id IS NOT DISTINCT FROM p_dono_id
   ORDER BY (status <> 'resolvido') DESC, created_at DESC
   LIMIT 1;

  IF v_id IS NOT NULL AND v_status = 'resolvido' THEN
    SELECT reabrir_horas INTO v_horas FROM chamados_config WHERE empresa_id = p_empresa_id;
    IF NOT EXISTS (
      SELECT 1 FROM chamados WHERE id = v_id AND resolvido_em > now() - make_interval(hours => coalesce(v_horas, 24))
    ) THEN
      v_id := NULL;  -- resolvido há muito tempo: é outra ocorrência
    END IF;
  END IF;

  IF v_id IS NULL THEN
    IF p_direcao = 'saida' OR p_so_existente THEN
      RETURN jsonb_build_object('ignorada', true);
    END IF;
    INSERT INTO chamados (empresa_id, origem, conversa_id, dono_id, canal_nome, contato_nome, contato_id, assunto, ultima_mensagem_em, nao_lidas)
    VALUES (p_empresa_id, p_origem, p_conversa_id, p_dono_id, p_canal_nome, p_contato_nome, p_contato_id,
            coalesce(nullif(left(btrim(regexp_replace(p_texto, '\s+', ' ', 'g')), 120), ''), '(sem texto)'),
            v_quando, 0)
    RETURNING id INTO v_id;
    v_novo := true;
  END IF;

  INSERT INTO chamado_mensagens (chamado_id, empresa_id, direcao, autor_nome, texto, externo_id, anexos, bruto, created_at)
  VALUES (v_id, p_empresa_id, p_direcao, coalesce(p_autor_nome, p_contato_nome), coalesce(p_texto, ''), p_externo_id,
          coalesce(p_anexos, '[]'), p_bruto, v_quando)
  ON CONFLICT (chamado_id, externo_id) DO NOTHING
  RETURNING id INTO v_msg;

  IF v_msg IS NULL THEN
    RETURN jsonb_build_object('chamado_id', v_id, 'duplicada', true);
  END IF;

  IF p_direcao = 'entrada' THEN
    UPDATE chamados
       SET ultima_mensagem_em = greatest(ultima_mensagem_em, v_quando),
           nao_lidas = nao_lidas + 1,
           status = CASE WHEN status = 'resolvido' THEN 'aberto' ELSE status END,
           contato_nome = coalesce(p_contato_nome, contato_nome)
     WHERE id = v_id;
  ELSE
    UPDATE chamados
       SET ultima_mensagem_em = greatest(ultima_mensagem_em, v_quando),
           nao_lidas = 0
     WHERE id = v_id;
  END IF;

  RETURN jsonb_build_object('chamado_id', v_id, 'novo', v_novo);
END $$;

REVOKE ALL ON FUNCTION public.chamado_registrar(uuid, text, text, uuid, text, text, text, text, text, text, text, jsonb, jsonb, timestamptz, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chamado_registrar(uuid, text, text, uuid, text, text, text, text, text, text, text, jsonb, jsonb, timestamptz, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- Quem vê o quê
-- ---------------------------------------------------------------------------
-- Chamado sem dono (WhatsApp) = fila da empresa. Com dono (Slack) = do dono,
-- de quem for o responsável e dos admins.
DROP POLICY IF EXISTS "Empresa vê chamados" ON public.chamados;
DROP POLICY IF EXISTS "Usuário vê seus chamados" ON public.chamados;
CREATE POLICY "Usuário vê seus chamados" ON public.chamados
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (empresa_id = public.get_user_empresa_id() AND (
         public.is_admin_or_super()
         OR dono_id IS NULL
         OR dono_id = public.get_user_perfil_id()
         OR responsavel_id = public.get_user_perfil_id()))
  );

DROP POLICY IF EXISTS "Empresa atualiza chamados" ON public.chamados;
DROP POLICY IF EXISTS "Usuário atualiza seus chamados" ON public.chamados;
CREATE POLICY "Usuário atualiza seus chamados" ON public.chamados
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (empresa_id = public.get_user_empresa_id() AND (
         public.is_admin_or_super()
         OR dono_id IS NULL
         OR dono_id = public.get_user_perfil_id()
         OR responsavel_id = public.get_user_perfil_id()))
  )
  WITH CHECK (public.is_super_admin() OR empresa_id = public.get_user_empresa_id());

-- Só os campos de atendimento podem ser alterados pela tela.
REVOKE UPDATE ON public.chamados FROM authenticated;
GRANT UPDATE (status, prioridade, responsavel_id, cliente_id, assunto, nao_lidas, updated_at) ON public.chamados TO authenticated;

-- Mensagens: segue a visibilidade do chamado.
DROP POLICY IF EXISTS "Empresa vê mensagens de chamados" ON public.chamado_mensagens;
DROP POLICY IF EXISTS "Usuário vê mensagens dos seus chamados" ON public.chamado_mensagens;
CREATE POLICY "Usuário vê mensagens dos seus chamados" ON public.chamado_mensagens
  FOR SELECT TO authenticated
  USING (chamado_id IN (SELECT id FROM public.chamados));

DROP POLICY IF EXISTS "Usuário grava resposta de chamado" ON public.chamado_mensagens;
CREATE POLICY "Usuário grava resposta de chamado" ON public.chamado_mensagens
  FOR INSERT TO authenticated
  WITH CHECK (
    direcao = 'saida'
    AND empresa_id = public.get_user_empresa_id()
    AND enviado_por = public.get_user_perfil_id()
    AND chamado_id IN (SELECT id FROM public.chamados)
  );
