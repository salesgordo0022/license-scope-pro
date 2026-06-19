import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function formatCnpj(taxId: string): string {
  if (!taxId || taxId.length !== 14) return taxId || "";
  return `${taxId.slice(0, 2)}.${taxId.slice(2, 5)}.${taxId.slice(5, 8)}/${taxId.slice(8, 12)}-${taxId.slice(12, 14)}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get("CNPJA_API_TOKEN");
    if (!token) {
      return new Response(
        JSON.stringify({
          error: "Token CNPJá não configurado. Cadastre-se em https://cnpja.com/me e adicione o token como secret CNPJA_API_TOKEN.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { uf, municipioId, dataInicio, dataFim, limit, regimeTributario } = body;

    if (!uf || !municipioId || !dataInicio || !dataFim) {
      return new Response(
        JSON.stringify({ error: "Parâmetros obrigatórios: uf, municipioId, dataInicio, dataFim" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filtros da API CNPJá (GET /office) — usa notação .in/.gte/.lte
    const qp = new URLSearchParams();
    qp.set("address.state.in", uf);
    qp.set("address.municipality.in", String(municipioId));
    qp.set("founded.gte", dataInicio);
    qp.set("founded.lte", dataFim);
    qp.set("status.id.in", "2"); // Apenas Ativa
    qp.set("limit", String(limit || 50));

    // Filtro por regime tributário é aplicado pós-resposta (API CNPJá não aceita filtrar por simples/simei)

    const url = `https://api.cnpja.com/office?${qp.toString()}`;

    const res = await fetch(url, {
      headers: {
        "Authorization": token,
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(
        JSON.stringify({ error: `Erro CNPJá (${res.status}): ${err}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();

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

    return new Response(
      JSON.stringify({ empresas, total: data.count ?? empresas.length, next: data.next || null }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Erro interno" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
