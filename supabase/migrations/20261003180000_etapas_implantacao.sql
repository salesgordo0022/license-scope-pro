-- Etapas de implantação personalizadas (modelos reutilizáveis).
--
-- As 4 etapas padrão do "Plano de Implantação Impertech" (Ambiente, Cadastros,
-- Treinamento, Acompanhamento) ficam fixas no código. Esta tabela guarda as
-- etapas que a empresa cria para casos fora do padrão, para reaproveitar nas
-- próximas implantações. Ao criar uma implantação, os itens escolhidos são
-- copiados para implantacao_checklist — mudar o modelo depois não altera
-- implantações já criadas.

CREATE TABLE IF NOT EXISTS public.etapas_implantacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE DEFAULT public.get_user_empresa_id(),
  nome text NOT NULL CHECK (length(btrim(nome)) > 0 AND position(' · ' IN nome) = 0),
  itens text[] NOT NULL DEFAULT '{}',
  resultado text,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS etapas_implantacao_empresa_idx ON public.etapas_implantacao (empresa_id, ordem);

ALTER TABLE public.etapas_implantacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários veem etapas da empresa" ON public.etapas_implantacao;
CREATE POLICY "Usuários veem etapas da empresa" ON public.etapas_implantacao
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR empresa_id = public.get_user_empresa_id()
  );

DROP POLICY IF EXISTS "Admin gerencia etapas da empresa" ON public.etapas_implantacao;
CREATE POLICY "Admin gerencia etapas da empresa" ON public.etapas_implantacao
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR (public.is_admin_or_super() AND empresa_id = public.get_user_empresa_id())
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.is_admin_or_super() AND empresa_id = public.get_user_empresa_id())
  );
