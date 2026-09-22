import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { autenticar, ehAdmin, json, respostaPreflight } from "../_shared/auth.ts";

/** Teto de registros por consulta — cada registro é um crédito pago na CNPJá. */
const LIMITE_MAXIMO = 100;

/** Aceita apenas `AAAA-MM-DD`, para não repassar lixo à query da API externa. */
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Formata 14 dígitos como `00.000.000/0000-00`. */
function formatCnpj(taxId: string): string {
  if (!taxId || taxId.length !== 14) return taxId || "";
  return `${taxId.slice(0, 2)}.${taxId.slice(2, 5)}.${taxId.slice(5, 8)}/${taxId.slice(8, 12)}-${taxId.slice(12, 14)}`;
}

/**
 * Lista empresas abertas num município/período para a tela de prospecção.
 *
 * Exige admin autenticado. Cada chamada consome créditos pagos da API CNPJá;
 * antes a function era pública e o `limit` vinha do corpo sem teto, então um
 * único request podia esvaziar a cota contratada.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return respostaPreflight(req);

  try {
    const { auth, erro } = await autenticar(req);
    if (erro) return erro;
    if (!ehAdmin(auth)) {
      return json(req, { error: "Sem permissão para prospectar empresas" }, 403);
    }

    const token = Deno.env.get("CNPJA_API_TOKEN");
    if (!token) {
      return json(req, {
        error: "Token CNPJá não configurado. Cadastre-se em https://cnpja.com/me e adicione o token como secret CNPJA_API_TOKEN.",
      }, 503);
    }

    const body = await req.json();
    const { uf, municipioId, dataInicio, dataFim, limit, regimeTributario } = body;

    if (!uf || !municipioId || !dataInicio || !dataFim) {
      return json(req, { error: "Parâmetros obrigatórios: uf, municipioId, dataInicio, dataFim" }, 400);
    }
    if (!DATA_ISO.test(String(dataInicio)) || !DATA_ISO.test(String(dataFim))) {
      return json(req, { error: "Datas devem estar no formato AAAA-MM-DD" }, 400);
    }
    if (!/^[A-Z]{2}$/.test(String(uf).toUpperCase())) {
      return json(req, { error: "UF inválida" }, 400);
    }
    if (!/^\d+$/.test(String(municipioId))) {
      return json(req, { error: "Município inválido" }, 400);
    }

    // `limit` é preso entre 1 e LIMITE_MAXIMO; valor ausente ou absurdo cai
    // no padrão de 50 em vez de ir cru para a API paga.
    const limiteSolicitado = Number(limit);
    const limiteSeguro = Number.isFinite(limiteSolicitado)
      ? Math.min(Math.max(Math.trunc(limiteSolicitado), 1), LIMITE_MAXIMO)
      : 50;

    // Filtros da API CNPJá (GET /office) — usa notação .in/.gte/.lte
    const qp = new URLSearchParams();
    qp.set("address.state.in", String(uf).toUpperCase());
    qp.set("address.municipality.in", String(municipioId));
    qp.set("founded.gte", dataInicio);
    qp.set("founded.lte", dataFim);
    qp.set("status.id.in", "2"); // Apenas Ativa
    qp.set("limit", String(limiteSeguro));

    // Filtro por regime tributário é aplicado pós-resposta (API CNPJá não aceita filtrar por simples/simei)

    const url = `https://api.cnpja.com/office?${qp.toString()}`;

    const res = await fetch(url, {
      headers: {
        "Authorization": token,
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      // O corpo cru da CNPJá fica só no log do servidor: ele pode conter eco
      // de credenciais e detalhes da conta que não devem chegar ao navegador.
      console.error("[prospectar-empresas] CNPJá respondeu", res.status, await res.text());
      return json(req, { error: `Não foi possível consultar a base de empresas (${res.status}).` }, 502);
    }

    const data = await res.json();

    // Normaliza o retorno da CNPJá para o formato que a tela de prospecção usa.
    const empresas = (data.records || []).map((item: any) => {
      const simples = item.company?.simples?.optant === true;
      const simei = item.company?.simei?.optant === true;
      let regimeTributario = "Regime Normal";
      if (simei) regimeTributario = "MEI (Simei)";
      else if (simples) regimeTributario = "Simples Nacional";

      return {
        cnpj: formatCnpj(item.taxId || ""),
        razaoSocial: item.company?.name || "",
        nomeFantasia: item.alias || "",
        atividadePrincipal: item.mainActivity?.text || "",
        naturezaJuridica: item.company?.nature?.text || "",
        situacaoCadastral: item.status?.text || "",
        dataAbertura: item.founded || "",
        endereco: {
          logradouro: item.address?.street || "",
          numero: item.address?.number || "",
          complemento: item.address?.details || "",
          bairro: item.address?.district || "",
          cidade: item.address?.city || "",
          uf: item.address?.state || "",
          cep: item.address?.zip || "",
        },
        telefone: item.phones?.[0]?.area ? `(${item.phones[0].area}) ${item.phones[0].number}` : "",
        email: item.emails?.[0]?.address || "",
        capitalSocial: item.company?.equity
          ? `R$ ${Number(item.company.equity).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
          : "",
        porte: item.company?.size?.text || "",
        regimeTributario,
        optanteSimples: simples,
        optanteSimei: simei,
      };
    });

    // Filtro por regime é aplicado aqui porque a API CNPJá não aceita
    // simples/simei como parâmetro de busca.
    let filtradas = empresas;
    if (regimeTributario === "simples") {
      filtradas = empresas.filter((e: any) => e.optanteSimples && !e.optanteSimei);
    } else if (regimeTributario === "mei") {
      filtradas = empresas.filter((e: any) => e.optanteSimei);
    } else if (regimeTributario === "normal") {
      filtradas = empresas.filter((e: any) => !e.optanteSimples && !e.optanteSimei);
    }

    return json(req, {
      empresas: filtradas,
      total: filtradas.length,
      totalBruto: data.count ?? empresas.length,
      next: data.next || null,
    });
  } catch (err: any) {
    console.error("[prospectar-empresas] erro:", err);
    return json(req, { error: "Erro interno ao prospectar empresas" }, 500);
  }
});
