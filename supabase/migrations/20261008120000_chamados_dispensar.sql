-- Dispensar chamado: conversa que não é atendimento de verdade ("ok,
-- obrigado", spam, conversa interna, engano). O chamado dispensado sai da fila
-- e NÃO conta em nada: relatório, pendentes, não lidas, avisos e plantão da IA.
--
-- Regras:
--  * status 'dispensado' + dispensado_em / dispensado_por / dispensa_motivo;
--  * desfazer = voltar o status para qualquer outro (os campos são limpos);
--  * se o contato mandar mensagem dentro do prazo de reabertura (reabrir_horas)
--    ela fica guardada no dispensado, sem notificar; depois do prazo abre um
--    chamado novo normalmente.
-- Pode rodar mais de uma vez.

ALTER TABLE public.chamados
  ADD COLUMN IF NOT EXISTS dispensado_em timestamptz,
  ADD COLUMN IF NOT EXISTS dispensado_por uuid REFERENCES public.usuario_perfil(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dispensa_motivo text;

ALTER TABLE public.chamados DROP CONSTRAINT IF EXISTS chamados_status_check;
ALTER TABLE public.chamados ADD CONSTRAINT chamados_status_check
  CHECK (status IN ('aberto', 'em_atendimento', 'aguardando', 'resolvido', 'dispensado'));

-- No máximo um chamado ATIVO por conversa: dispensado também é encerrado.
DROP INDEX IF EXISTS public.chamados_ativo_por_conversa_idx;
CREATE UNIQUE INDEX chamados_ativo_por_conversa_idx
  ON public.chamados (empresa_id, origem, conversa_id, coalesce(dono_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status NOT IN ('resolvido', 'dispensado');

-- Marcos de status: resolvido_em e dispensado_em.
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

  IF NEW.status = 'dispensado' THEN
    IF OLD.status IS DISTINCT FROM 'dispensado' THEN
      NEW.dispensado_em := now();
      NEW.dispensado_por := coalesce(NEW.dispensado_por, public.get_user_perfil_id());
      NEW.nao_lidas := 0;
      NEW.ia_ativa := false;
    END IF;
  ELSE
    NEW.dispensado_em := NULL;
    NEW.dispensado_por := NULL;
    NEW.dispensa_motivo := NULL;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- Registro das mensagens (Slack / ZapContábil) ciente do dispensado.
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
   ORDER BY (status NOT IN ('resolvido', 'dispensado')) DESC, created_at DESC
   LIMIT 1;

  IF v_id IS NOT NULL AND v_status IN ('resolvido', 'dispensado') THEN
    SELECT reabrir_horas INTO v_horas FROM chamados_config WHERE empresa_id = p_empresa_id;
    IF NOT EXISTS (
      SELECT 1 FROM chamados
       WHERE id = v_id
         AND coalesce(resolvido_em, dispensado_em) > now() - make_interval(hours => coalesce(v_horas, 24))
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
           nao_lidas = CASE WHEN status = 'dispensado' THEN 0 ELSE nao_lidas + 1 END,
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
