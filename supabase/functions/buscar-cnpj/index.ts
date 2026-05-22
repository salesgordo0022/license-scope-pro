import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { cnpj } = await req.json();
    const digits = cnpj?.replace(/\D/g, "");

    if (!digits || digits.length !== 14) {
      return new Response(JSON.stringify({ error: "CNPJ inválido" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try BrasilAPI first
    let data = null;
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
      if (res.ok) {
        const raw = await res.json();
        data = {
          razao_social: raw.razao_social || "",
          nome_fantasia: raw.nome_fantasia || "",
          email: raw.email || "",
          telefone: raw.ddd_telefone_1 || "",
          logradouro: raw.logradouro || "",
          numero: raw.numero || "",
          complemento: raw.complemento || "",
          bairro: raw.bairro || "",
          municipio: raw.municipio || "",
          uf: raw.uf || "",
          cep: raw.cep || "",
        };
      }
    } catch {
      // BrasilAPI failed, try fallback
    }

    // Fallback: ReceitaWS
    if (!data) {
      try {
        const res = await fetch(`https://receitaws.com.br/v1/cnpj/${digits}`, {
          headers: { Accept: "application/json" },
        });
        if (res.ok) {
          const raw = await res.json();
          if (raw.status !== "ERROR") {
            data = {
              razao_social: raw.nome || "",
              nome_fantasia: raw.fantasia || "",
              email: raw.email || "",
              telefone: raw.telefone || "",
              logradouro: raw.logradouro || "",
              numero: raw.numero || "",
              complemento: raw.complemento || "",
              bairro: raw.bairro || "",
              municipio: raw.municipio || "",
              uf: raw.uf || "",
              cep: raw.cep || "",
            };
          }
        }
      } catch {
        // ReceitaWS also failed
      }
    }

    if (!data) {
      return new Response(
        JSON.stringify({ error: "CNPJ não encontrado. Verifique se o número está correto." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Erro interno ao buscar CNPJ" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
