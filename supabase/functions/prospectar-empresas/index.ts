import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ESTADOS: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia",
  CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
  MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
  PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul",
  RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo",
  SE: "Sergipe", TO: "Tocantins",
};

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
    const { uf, municipio, dataInicio, dataFim } = body;

    if (!uf || !municipio || !dataInicio || !dataFim) {
      return new Response(
        JSON.stringify({ error: "Parâmetros obrigatórios: uf, municipio, dataInicio, dataFim" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar na CNPJá
    const queryParams = new URLSearchParams();
    queryParams.set("city", municipio);
    queryParams.set("state", uf);
    queryParams.set("registrationDate.min", dataInicio);
    queryParams.set("registrationDate.max", dataFim);
    queryParams.set("page", "1");
    queryParams.set("pageSize", "50");

    const url = `https://api.cnpja.com/office?${queryParams.toString()}`;

    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
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

    // Formatar resultado
    const empresas = (data.items || []).map((item: any) => ({
      cnpj: item.cnpj?.root ? `${item.cnpj.root}/${item.cnpj.suffix}-${item.cnpj.branch}` : item.cnpj?.formatted || "",
      razaoSocial: item.company?.name || "",
      nomeFantasia: item.company?.alias || "",
      atividadePrincipal: item.mainActivity?.text || "",
      naturezaJuridica: item.company?.nature?.text || "",
      situacaoCadastral: item.status?.text || "",
      dataAbertura: item.registration?.date || "",
      endereco: {
        logradouro: item.address?.street || "",
        numero: item.address?.number || "",
        complemento: item.address?.details || "",
        bairro: item.address?.neighborhood || "",
        cidade: item.address?.city || "",
        uf: item.address?.state || "",
        cep: item.address?.zip || "",
      },
      telefone: item.phones?.[0]?.area ? `(${item.phones[0].area}) ${item.phones[0].number}` : "",
      email: item.emails?.[0]?.address || "",
      capitalSocial: item.company?.capital ? `R$ ${(item.company.capital / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "",
      porte: item.company?.size?.text || "",
    }));

    return new Response(
      JSON.stringify({ empresas, total: data.totalCount || empresas.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Erro interno" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
