-- IA no atendimento (passo 1: modo manual).
--
-- Um atendente clica em "IA assume" num chamado e escreve a orientação. A IA
-- (Groq, function ia-atendimento) manda a primeira explicação e, a cada nova
-- mensagem do cliente, continua explicando. Quando o cliente entende, ela
-- encerra o chamado; quando não consegue (ou o cliente pede uma pessoa), ela
-- devolve para a equipe. Se alguém da equipe responder, a IA sai na hora.
--
-- Chave do Groq: INSERT em integracao_segredos ('GROQ_API_KEY'); modelo
-- opcional em 'GROQ_MODEL' (padrão openai/gpt-oss-120b).

ALTER TABLE public.chamados
  ADD COLUMN IF NOT EXISTS ia_ativa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ia_instrucoes text,
  ADD COLUMN IF NOT EXISTS ia_status text CHECK (ia_status IN ('atendendo', 'finalizado', 'devolvido')),
  ADD COLUMN IF NOT EXISTS ia_respostas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ia_motivo text,
  ADD COLUMN IF NOT EXISTS ia_assumida_por uuid REFERENCES public.usuario_perfil(id) ON DELETE SET NULL;

ALTER TABLE public.chamado_mensagens
  ADD COLUMN IF NOT EXISTS por_ia boolean NOT NULL DEFAULT false;

-- Token que o banco usa para chamar a function quando chega mensagem nova.
INSERT INTO public.integracao_segredos (chave, valor)
VALUES ('IA_TOKEN', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
ON CONFLICT (chave) DO NOTHING;

-- Mensagem nova num chamado com IA:
--  * do cliente (entrada) → chama a IA para responder;
--  * de uma pessoa da equipe (saída que não é da IA) → a IA sai da conversa.
CREATE OR REPLACE FUNCTION public.chamado_mensagens_ia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ativa boolean;
  v_token text;
BEGIN
  SELECT ia_ativa INTO v_ativa FROM chamados WHERE id = NEW.chamado_id;
  IF NOT coalesce(v_ativa, false) THEN
    RETURN NEW;
  END IF;

  IF NEW.direcao = 'saida' THEN
    -- A própria IA (ou o eco dela vindo do Slack/ZapContábil) não conta.
    IF NEW.por_ia
       OR coalesce(NEW.autor_nome, '') ILIKE '%Assistente ImperTech%'
       OR coalesce(NEW.texto, '') ILIKE '%Assistente ImperTech%' THEN
      RETURN NEW;
    END IF;
    UPDATE chamados
       SET ia_ativa = false, ia_status = 'devolvido', ia_motivo = 'Uma pessoa da equipe respondeu'
     WHERE id = NEW.chamado_id;
    RETURN NEW;
  END IF;

  SELECT valor INTO v_token FROM integracao_segredos WHERE chave = 'IA_TOKEN';
  PERFORM net.http_post(
    url := 'https://nxpblhykcakrdcnnzyyg.supabase.co/functions/v1/ia-atendimento?token=' || v_token,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('acao', 'processar', 'chamado_id', NEW.chamado_id, 'mensagem_id', NEW.id),
    timeout_milliseconds := 10000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Nunca impedir a gravação da mensagem por causa da IA.
  RAISE WARNING 'IA do chamado não acionada: %', SQLERRM;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.chamado_mensagens_ia() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS chamado_mensagens_ia ON public.chamado_mensagens;
CREATE TRIGGER chamado_mensagens_ia AFTER INSERT ON public.chamado_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.chamado_mensagens_ia();

NOTIFY pgrst, 'reload schema';
