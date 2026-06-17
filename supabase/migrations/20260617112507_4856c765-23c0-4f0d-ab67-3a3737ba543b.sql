
CREATE TABLE public.pipelines_vendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  cor text DEFAULT '#3B82F6',
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipelines_vendas TO authenticated;
GRANT ALL ON public.pipelines_vendas TO service_role;

ALTER TABLE public.pipelines_vendas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin acesso total pipelines"
  ON public.pipelines_vendas FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Usuarios da empresa veem pipelines"
  ON public.pipelines_vendas FOR SELECT TO authenticated
  USING (empresa_id IS NULL OR empresa_id = public.get_user_empresa_id());

CREATE POLICY "Usuarios da empresa criam pipelines"
  ON public.pipelines_vendas FOR INSERT TO authenticated
  WITH CHECK (empresa_id IS NULL OR empresa_id = public.get_user_empresa_id());

CREATE POLICY "Usuarios da empresa editam pipelines"
  ON public.pipelines_vendas FOR UPDATE TO authenticated
  USING (empresa_id IS NULL OR empresa_id = public.get_user_empresa_id())
  WITH CHECK (empresa_id IS NULL OR empresa_id = public.get_user_empresa_id());

CREATE POLICY "Usuarios da empresa excluem pipelines"
  ON public.pipelines_vendas FOR DELETE TO authenticated
  USING (empresa_id IS NULL OR empresa_id = public.get_user_empresa_id());

CREATE TRIGGER trg_pipelines_vendas_updated_at
  BEFORE UPDATE ON public.pipelines_vendas
  FOR EACH ROW EXECUTE FUNCTION public.update_implantacao_updated_at();

-- Add pipeline_id to revendas
ALTER TABLE public.revendas
  ADD COLUMN pipeline_id uuid REFERENCES public.pipelines_vendas(id) ON DELETE SET NULL;

CREATE INDEX idx_revendas_pipeline_id ON public.revendas(pipeline_id);

-- Backfill: create "Padrão" pipeline per empresa and assign existing revendas
DO $$
DECLARE
  emp record;
  new_pipeline_id uuid;
  global_pipeline_id uuid;
BEGIN
  -- For each empresa with revendas
  FOR emp IN SELECT DISTINCT empresa_id FROM public.revendas WHERE empresa_id IS NOT NULL LOOP
    INSERT INTO public.pipelines_vendas (empresa_id, nome, descricao, ordem)
    VALUES (emp.empresa_id, 'Padrão', 'Pipeline padrão de vendas', 0)
    RETURNING id INTO new_pipeline_id;

    UPDATE public.revendas
       SET pipeline_id = new_pipeline_id
     WHERE empresa_id = emp.empresa_id AND pipeline_id IS NULL;
  END LOOP;

  -- Revendas sem empresa_id
  IF EXISTS (SELECT 1 FROM public.revendas WHERE empresa_id IS NULL AND pipeline_id IS NULL) THEN
    INSERT INTO public.pipelines_vendas (empresa_id, nome, descricao, ordem)
    VALUES (NULL, 'Padrão', 'Pipeline padrão de vendas', 0)
    RETURNING id INTO global_pipeline_id;

    UPDATE public.revendas
       SET pipeline_id = global_pipeline_id
     WHERE empresa_id IS NULL AND pipeline_id IS NULL;
  END IF;
END $$;
