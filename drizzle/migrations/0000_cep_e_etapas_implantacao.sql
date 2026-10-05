ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS cep text;

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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.etapas_implantacao TO authenticated;
GRANT ALL ON public.etapas_implantacao TO service_role;

ALTER TABLE public.etapas_implantacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários veem etapas da empresa" ON public.etapas_implantacao;
CREATE POLICY "Usuários veem etapas da empresa" ON public.etapas_implantacao
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR empresa_id = public.get_user_empresa_id());

DROP POLICY IF EXISTS "Admin gerencia etapas da empresa" ON public.etapas_implantacao;
CREATE POLICY "Admin gerencia etapas da empresa" ON public.etapas_implantacao
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (public.is_admin_or_super() AND empresa_id = public.get_user_empresa_id()))
  WITH CHECK (public.is_super_admin() OR (public.is_admin_or_super() AND empresa_id = public.get_user_empresa_id()));

DROP TRIGGER IF EXISTS trg_etapas_implantacao_updated_at ON public.etapas_implantacao;
CREATE TRIGGER trg_etapas_implantacao_updated_at BEFORE UPDATE ON public.etapas_implantacao
  FOR EACH ROW EXECUTE FUNCTION public.update_implantacao_updated_at();