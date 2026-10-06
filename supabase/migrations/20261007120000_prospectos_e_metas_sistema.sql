-- Prospectos separados de Clientes + metas mensais por sistema.
--
-- 1) PROSPECTOS: empresa em negociação NÃO é cliente. A pesquisa de empresas
--    e o "novo lead" do funil criam um prospecto; a aba Clientes só mostra
--    quem fechou. Quando o card do funil vai para "fechado", a função
--    prospecto_converter cria o cliente a partir do prospecto (tudo numa
--    transação) e liga a venda ao cliente novo.
--
-- 2) METAS POR SISTEMA: meta mensal de vendas de cada sistema, quebrada por
--    plano (quantidade × mensalidade/implantação do plano). A tela calcula a
--    previsão de receita e compara com o que foi fechado no mês.
--
-- 3) LIMPEZA: empresas que entraram em Clientes pela prospecção
--    ("Prospectado via CNPJá") e nunca fecharam viram prospecto. Só são
--    movidas as que não têm NADA ligado (licença, pagamento, contrato,
--    implantação, chamado, módulo, mensagem, meta ou venda fechada). O
--    cadastro inteiro fica guardado em prospectos.dados_cliente.

-- ---------------------------------------------------------------- prospectos
CREATE TABLE IF NOT EXISTS public.prospectos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE DEFAULT public.get_user_empresa_id(),
  nome_empresa text NOT NULL CHECK (length(btrim(nome_empresa)) > 0),
  cnpj text,
  email text,
  telefone text,
  endereco text,
  cidade text,
  estado text,
  cep text,
  segmento text,
  regime_tributario text,
  nome_contato text,
  observacoes text,
  origem text NOT NULL DEFAULT 'manual',          -- manual | prospeccao | migrado
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL, -- preenchido quando vira cliente
  convertido_em timestamptz,
  dados_cliente jsonb,                             -- cadastro original (prospecções antigas migradas)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Um CNPJ não se repete como prospecto em aberto na mesma empresa.
CREATE UNIQUE INDEX IF NOT EXISTS prospectos_cnpj_unico
  ON public.prospectos (empresa_id, regexp_replace(cnpj, '\D', '', 'g'))
  WHERE cnpj IS NOT NULL AND cnpj <> '' AND cliente_id IS NULL;

ALTER TABLE public.prospectos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Empresa vê prospectos" ON public.prospectos;
CREATE POLICY "Empresa vê prospectos" ON public.prospectos
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR empresa_id = public.get_user_empresa_id());

DROP POLICY IF EXISTS "Empresa gerencia prospectos" ON public.prospectos;
CREATE POLICY "Empresa gerencia prospectos" ON public.prospectos
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR empresa_id = public.get_user_empresa_id())
  WITH CHECK (public.is_super_admin() OR empresa_id = public.get_user_empresa_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospectos TO authenticated;
GRANT ALL ON public.prospectos TO service_role;

-- Venda do funil pode estar ligada a um cliente OU a um prospecto.
ALTER TABLE public.revendas ALTER COLUMN cliente_id DROP NOT NULL;
ALTER TABLE public.revendas ADD COLUMN IF NOT EXISTS prospecto_id uuid REFERENCES public.prospectos(id) ON DELETE SET NULL;
DO $$
BEGIN
  ALTER TABLE public.revendas ADD CONSTRAINT revendas_cliente_ou_prospecto CHECK (cliente_id IS NOT NULL OR prospecto_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS revendas_prospecto_idx ON public.revendas (prospecto_id);

-- Converte o prospecto da venda em cliente (ou só devolve o cliente, se já é).
-- SECURITY INVOKER: roda com as permissões e o RLS de quem chamou.
CREATE OR REPLACE FUNCTION public.prospecto_converter(p_revenda_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_venda public.revendas%ROWTYPE;
  v_p public.prospectos%ROWTYPE;
  v_cliente uuid;
BEGIN
  SELECT * INTO v_venda FROM public.revendas WHERE id = p_revenda_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda não encontrada';
  END IF;
  IF v_venda.cliente_id IS NOT NULL THEN
    RETURN v_venda.cliente_id;
  END IF;

  SELECT * INTO v_p FROM public.prospectos WHERE id = v_venda.prospecto_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prospecto da venda não encontrado';
  END IF;

  IF v_p.cliente_id IS NOT NULL THEN
    v_cliente := v_p.cliente_id;  -- já convertido por outra venda
  ELSE
    INSERT INTO public.clientes (
      empresa_id, nome_empresa, cnpj, email, telefone, endereco, cidade, estado, cep,
      segmento, regime_tributario, nome_dono, observacoes, status, data_entrada
    ) VALUES (
      v_p.empresa_id, v_p.nome_empresa, v_p.cnpj, v_p.email, v_p.telefone, v_p.endereco, v_p.cidade, v_p.estado, v_p.cep,
      v_p.segmento, v_p.regime_tributario, v_p.nome_contato,
      concat_ws(E'\n', nullif(v_p.observacoes, ''), 'Cliente desde a venda fechada no funil (' || to_char(now(), 'DD/MM/YYYY') || ').'),
      'ativo', current_date
    )
    RETURNING id INTO v_cliente;

    UPDATE public.prospectos SET cliente_id = v_cliente, convertido_em = now(), updated_at = now() WHERE id = v_p.id;
  END IF;

  -- Todas as vendas desse prospecto passam a apontar para o cliente.
  UPDATE public.revendas SET cliente_id = v_cliente WHERE prospecto_id = v_p.id AND cliente_id IS NULL;
  RETURN v_cliente;
END;
$$;

GRANT EXECUTE ON FUNCTION public.prospecto_converter(uuid) TO authenticated;

-- -------------------------------------------------------- metas por sistema
CREATE TABLE IF NOT EXISTS public.metas_sistema (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE DEFAULT public.get_user_empresa_id(),
  mes date NOT NULL CHECK (extract(day FROM mes) = 1), -- 1º dia do mês
  sistema text NOT NULL CHECK (length(btrim(sistema)) > 0),
  quantidade integer NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  -- [{ plano_id, nome, quantidade, mensalidade, implantacao }] (preços congelados na meta)
  planos jsonb NOT NULL DEFAULT '[]',
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, mes, sistema)
);

ALTER TABLE public.metas_sistema ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Empresa vê metas por sistema" ON public.metas_sistema;
CREATE POLICY "Empresa vê metas por sistema" ON public.metas_sistema
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR empresa_id = public.get_user_empresa_id());

DROP POLICY IF EXISTS "Admin gerencia metas por sistema" ON public.metas_sistema;
CREATE POLICY "Admin gerencia metas por sistema" ON public.metas_sistema
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (public.is_admin_or_super() AND empresa_id = public.get_user_empresa_id()))
  WITH CHECK (public.is_super_admin() OR (public.is_admin_or_super() AND empresa_id = public.get_user_empresa_id()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.metas_sistema TO authenticated;
GRANT ALL ON public.metas_sistema TO service_role;

-- ------------------------------- prospecções antigas que nunca fecharam
DO $$
DECLARE
  c record;
  v_p uuid;
  v_movidos integer := 0;
BEGIN
  FOR c IN
    SELECT cl.*
    FROM public.clientes cl
    WHERE cl.observacoes ILIKE 'Prospectado via CNPJá%'
      AND NOT EXISTS (SELECT 1 FROM public.licencas x WHERE x.cliente_id = cl.id)
      AND NOT EXISTS (SELECT 1 FROM public.pagamentos x WHERE x.cliente_id = cl.id)
      AND NOT EXISTS (SELECT 1 FROM public.contratos x WHERE x.cliente_id = cl.id)
      AND NOT EXISTS (SELECT 1 FROM public.implantacoes x WHERE x.cliente_id = cl.id)
      AND NOT EXISTS (SELECT 1 FROM public.cliente_modulos x WHERE x.cliente_id = cl.id)
      AND NOT EXISTS (SELECT 1 FROM public.chamados x WHERE x.cliente_id = cl.id)
      AND NOT EXISTS (SELECT 1 FROM public.metas_vendas x WHERE x.cliente_id = cl.id)
      AND NOT EXISTS (SELECT 1 FROM public.mensagens_enviadas x WHERE x.cliente_id = cl.id)
      AND NOT EXISTS (SELECT 1 FROM public.revendas x WHERE x.cliente_id = cl.id AND x.status_venda = 'fechado')
  LOOP
    INSERT INTO public.prospectos (
      empresa_id, nome_empresa, cnpj, email, telefone, endereco, cidade, estado, segmento,
      regime_tributario, nome_contato, observacoes, origem, dados_cliente, created_at
    ) VALUES (
      c.empresa_id, c.nome_empresa, c.cnpj, c.email, c.telefone, c.endereco, c.cidade, c.estado, c.segmento,
      c.regime_tributario, c.nome_dono, c.observacoes, 'migrado', to_jsonb(c), coalesce(c.created_at, now())
    )
    RETURNING id INTO v_p;

    UPDATE public.revendas SET prospecto_id = v_p, cliente_id = NULL WHERE cliente_id = c.id;
    DELETE FROM public.clientes WHERE id = c.id;
    v_movidos := v_movidos + 1;
  END LOOP;
  RAISE NOTICE 'Prospecções antigas movidas de Clientes para Prospectos: %', v_movidos;
END $$;
