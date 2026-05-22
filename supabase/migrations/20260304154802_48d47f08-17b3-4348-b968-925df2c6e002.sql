
CREATE TABLE public.configuracao_contrato (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES public.empresas(id),
  -- Dados do Contratado (empresa que presta serviço)
  contratado_nome TEXT DEFAULT '',
  contratado_cnpj TEXT DEFAULT '',
  contratado_endereco TEXT DEFAULT '',
  contratado_cidade TEXT DEFAULT '',
  contratado_estado TEXT DEFAULT '',
  contratado_email TEXT DEFAULT '',
  contratado_telefone TEXT DEFAULT '',
  -- Template customizável
  horario_atendimento TEXT DEFAULT '08:00hs às 18:00hs, de segunda a sexta-feira, nos sábados das 08:00hs às 12:00hs',
  clausulas_adicionais TEXT DEFAULT '',
  indice_reajuste TEXT DEFAULT 'IGP-M/FGV',
  prazo_aviso_rescisao INTEGER DEFAULT 30,
  foro_comarca TEXT DEFAULT '',
  -- Visual
  logo_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(empresa_id)
);

ALTER TABLE public.configuracao_contrato ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem config contrato" ON public.configuracao_contrato
  FOR SELECT TO authenticated
  USING (is_super_admin() OR is_admin_or_super() OR empresa_id = get_user_empresa_id());

CREATE POLICY "Admin gerencia config contrato" ON public.configuracao_contrato
  FOR ALL TO authenticated
  USING (is_super_admin() OR is_admin_or_super())
  WITH CHECK (is_super_admin() OR is_admin_or_super());
