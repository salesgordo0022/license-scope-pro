-- ===========================================================================
-- Integridade do contrato assinado — auditoria de 2026-09-22
--
-- Problema encontrado:
--
-- `contratos.modelo_id` é uma REFERÊNCIA ao modelo. As cláusulas ficam em
-- `modelos_contrato.clausulas` e podem ser editadas a qualquer momento — e o
-- FK é `ON DELETE SET NULL`, então o modelo pode até ser apagado.
--
-- Consequência: ao reabrir um contrato JÁ ASSINADO, a tela monta o documento
-- com as cláusulas ATUAIS do modelo, não com as que estavam valendo no dia da
-- assinatura. Editar um modelo reescreve, na prática, o texto de todos os
-- contratos assinados que apontam para ele.
--
-- Para um documento assinado isso é inaceitável: o que foi assinado precisa
-- ficar congelado. A correção é guardar uma cópia das cláusulas dentro do
-- próprio contrato no momento da assinatura.
-- ===========================================================================

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS clausulas_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_gerado_em timestamptz;

COMMENT ON COLUMN public.contratos.clausulas_snapshot IS
  'Cópia congelada das cláusulas usadas na geração do documento. Preenchida na assinatura e NUNCA alterada depois — é o que garante que o contrato assinado não mude quando o modelo de origem for editado.';

COMMENT ON COLUMN public.contratos.snapshot_gerado_em IS
  'Quando o snapshot de cláusulas foi tirado.';


-- ---------------------------------------------------------------------------
-- Trava de imutabilidade
--
-- Depois de assinado, nem a aplicação nem um admin distraído devem conseguir
-- reescrever o texto do contrato. O trigger deixa passar apenas os campos
-- operacionais (observações, link externo, status administrativo) e bloqueia o
-- resto.
--
-- Roda como trigger e não como policy porque policy de UPDATE decide sobre a
-- LINHA inteira; aqui é preciso comparar coluna a coluna o valor antigo com o
-- novo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contrato_assinado_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só protege contratos que já estavam assinados antes desta alteração.
  IF COALESCE(OLD.assinado, false) = false THEN
    RETURN NEW;
  END IF;

  -- O snapshot e a data da assinatura são definitivos.
  IF NEW.clausulas_snapshot IS DISTINCT FROM OLD.clausulas_snapshot THEN
    RAISE EXCEPTION 'Contrato assinado: as cláusulas registradas não podem ser alteradas';
  END IF;
  IF NEW.data_assinatura IS DISTINCT FROM OLD.data_assinatura THEN
    RAISE EXCEPTION 'Contrato assinado: a data de assinatura não pode ser alterada';
  END IF;

  -- Conteúdo contratual: valores, vigência, partes e plano.
  IF NEW.valor_mensalidade   IS DISTINCT FROM OLD.valor_mensalidade
     OR NEW.vigencia_meses   IS DISTINCT FROM OLD.vigencia_meses
     OR NEW.contratante_nome IS DISTINCT FROM OLD.contratante_nome
     OR NEW.contratante_cnpj IS DISTINCT FROM OLD.contratante_cnpj
     OR NEW.plano_id         IS DISTINCT FROM OLD.plano_id
     OR NEW.plano_nome       IS DISTINCT FROM OLD.plano_nome
     OR NEW.modelo_id        IS DISTINCT FROM OLD.modelo_id
  THEN
    RAISE EXCEPTION 'Contrato assinado: para mudar os termos, gere um aditivo ou um novo contrato';
  END IF;

  -- Desfazer a assinatura também não: seria apagar a prova de que houve uma.
  IF COALESCE(NEW.assinado, false) = false THEN
    RAISE EXCEPTION 'Contrato assinado não pode voltar para não assinado';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.contrato_assinado_imutavel() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_contrato_assinado_imutavel ON public.contratos;
CREATE TRIGGER trg_contrato_assinado_imutavel
  BEFORE UPDATE ON public.contratos
  FOR EACH ROW
  EXECUTE FUNCTION public.contrato_assinado_imutavel();


-- ---------------------------------------------------------------------------
-- Tabela de preços: quem pode mexer
--
-- A tabela é global (não tem `empresa_id`) e a policy de leitura já limita a
-- planos ativos. A escrita é só de super_admin, o que está correto para um
-- catálogo compartilhado — um admin de uma revenda não deve conseguir alterar
-- o preço que as outras enxergam.
--
-- Reafirmado aqui de forma explícita para o caso de alguma migration posterior
-- ter afrouxado a regra.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Super admin gerencia tabela de preços" ON public.tabela_precos;
CREATE POLICY "Super admin gerencia tabela de preços"
  ON public.tabela_precos FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
