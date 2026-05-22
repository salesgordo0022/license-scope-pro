
-- Table for contract templates
CREATE TABLE public.modelos_contrato (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text DEFAULT '',
  clausulas jsonb NOT NULL DEFAULT '[]'::jsonb,
  ativo boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.modelos_contrato ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Usuários veem modelos" ON public.modelos_contrato
  FOR SELECT TO authenticated
  USING (is_super_admin() OR is_admin_or_super() OR empresa_id = get_user_empresa_id());

CREATE POLICY "Admin gerencia modelos" ON public.modelos_contrato
  FOR ALL TO authenticated
  USING (is_super_admin() OR is_admin_or_super())
  WITH CHECK (is_super_admin() OR is_admin_or_super());
