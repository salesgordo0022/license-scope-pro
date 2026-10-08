-- Anotações internas dos chamados (só a equipe vê; nunca vão para o cliente).
--  * cada nota tem autor e data; pode ser fixada no topo;
--  * lembrete opcional (lembrar_em): na hora, aviso no sino/área de trabalho e
--    no WhatsApp de quem pediu (plantão da IA, a cada 2 min);
--  * cliente_id guarda o cliente do chamado: as notas aparecem nos próximos
--    chamados do mesmo cliente;
--  * a IA lê as notas como contexto quando assume o chamado.

CREATE TABLE IF NOT EXISTS public.chamado_notas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chamado_id uuid NOT NULL REFERENCES public.chamados(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE DEFAULT public.get_user_empresa_id(),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  autor_id uuid REFERENCES public.usuario_perfil(id) ON DELETE SET NULL DEFAULT public.get_user_perfil_id(),
  texto text NOT NULL CHECK (length(btrim(texto)) > 0),
  fixada boolean NOT NULL DEFAULT false,
  lembrar_em timestamptz,
  lembrete_para uuid REFERENCES public.usuario_perfil(id) ON DELETE SET NULL,
  lembrete_enviado_em timestamptz,
  lembrete_concluido boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chamado_notas_chamado_idx ON public.chamado_notas (chamado_id, created_at);
CREATE INDEX IF NOT EXISTS chamado_notas_cliente_idx ON public.chamado_notas (cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chamado_notas_lembrete_idx ON public.chamado_notas (lembrar_em) WHERE lembrar_em IS NOT NULL AND NOT lembrete_concluido;

ALTER TABLE public.chamado_notas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Empresa vê notas dos chamados" ON public.chamado_notas;
CREATE POLICY "Empresa vê notas dos chamados" ON public.chamado_notas FOR SELECT TO authenticated
  USING (public.is_super_admin() OR empresa_id = public.get_user_empresa_id());

DROP POLICY IF EXISTS "Usuário escreve nota em chamado que vê" ON public.chamado_notas;
CREATE POLICY "Usuário escreve nota em chamado que vê" ON public.chamado_notas FOR INSERT TO authenticated
  WITH CHECK (
    empresa_id = public.get_user_empresa_id()
    AND autor_id = public.get_user_perfil_id()
    AND chamado_id IN (SELECT id FROM public.chamados)
  );

-- Fixar/concluir lembrete: qualquer um da empresa. Texto: o autor ou admin (conferido na tela).
DROP POLICY IF EXISTS "Empresa atualiza notas" ON public.chamado_notas;
CREATE POLICY "Empresa atualiza notas" ON public.chamado_notas FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR empresa_id = public.get_user_empresa_id())
  WITH CHECK (public.is_super_admin() OR empresa_id = public.get_user_empresa_id());

DROP POLICY IF EXISTS "Autor ou admin apaga nota" ON public.chamado_notas;
CREATE POLICY "Autor ou admin apaga nota" ON public.chamado_notas FOR DELETE TO authenticated
  USING (
    public.is_super_admin()
    OR (empresa_id = public.get_user_empresa_id() AND (autor_id = public.get_user_perfil_id() OR public.is_admin_or_super()))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chamado_notas TO authenticated;
GRANT ALL ON public.chamado_notas TO service_role;

-- Tempo real: o cartão atualiza sozinho quando alguém anota.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chamado_notas;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
