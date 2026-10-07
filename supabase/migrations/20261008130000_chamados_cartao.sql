-- Cartão do chamado: uma anotação curta para o técnico entender o que
-- precisa ser feito ("cliente quer liberar usuário novo no Onvio, já mandou
-- print"). Fica só no sistema: não vai para o cliente nem para o Slack/WhatsApp.
-- Quem escreveu e quando são gravados sozinhos. Pode rodar mais de uma vez.

ALTER TABLE public.chamados
  ADD COLUMN IF NOT EXISTS anotacao text CHECK (anotacao IS NULL OR char_length(anotacao) <= 1000),
  ADD COLUMN IF NOT EXISTS anotacao_por uuid REFERENCES public.usuario_perfil(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS anotacao_em timestamptz;

CREATE OR REPLACE FUNCTION public.chamados_anotacao_autor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.anotacao IS DISTINCT FROM OLD.anotacao THEN
    NEW.anotacao := nullif(btrim(NEW.anotacao), '');
    IF NEW.anotacao IS NULL THEN
      NEW.anotacao_por := NULL;
      NEW.anotacao_em := NULL;
    ELSE
      NEW.anotacao_por := coalesce(public.get_user_perfil_id(), NEW.anotacao_por);
      NEW.anotacao_em := now();
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS chamados_anotacao_autor ON public.chamados;
CREATE TRIGGER chamados_anotacao_autor BEFORE UPDATE OF anotacao ON public.chamados
  FOR EACH ROW EXECUTE FUNCTION public.chamados_anotacao_autor();
