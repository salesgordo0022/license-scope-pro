import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendBody {
  telefone: string;
  mensagem: string;
  cliente_id?: string;
  tipo?: string; // avulsa | contrato | boleto | aniversario
  media_url?: string;          // URL pública do anexo (PDF do boleto, etc.)
  media_filename?: string;     // nome do arquivo opcional
}

const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");

// Traduz códigos de erro conhecidos da API do WhatsApp/ZapContábil para uma
// mensagem que ajuda a diagnosticar o problema sem precisar ler o JSON cru.
function friendlyZapError(rawBody: string): string | null {
  if (rawBody.includes("ERR_WAPP_INVALID_CONTACT")) {
    return "Número de WhatsApp inválido — confira o DDD/telefone do cliente (o número pode estar incompleto, sem WhatsApp ou com o código do país duplicado).";
  }
  if (rawBody.includes("ERR_WAPP_NOT_INITIALIZED") || rawBody.includes("NOT_CONNECTED")) {
    return "A conexão do WhatsApp (ZapContábil) está desconectada — reconecte o QR Code no painel do ZapContábil.";
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const ZAPCONTABIL_API_TOKEN = Deno.env.get("ZAPCONTABIL_API_TOKEN");
    if (!ZAPCONTABIL_API_TOKEN) {
      return new Response(
        JSON.stringify({ success: false, error: "ZAPCONTABIL_API_TOKEN não configurado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Não autenticado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(
        JSON.stringify({ success: false, error: "Sessão inválida" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = (await req.json()) as SendBody;
    const telefone = onlyDigits(body.telefone || "");
    const mensagem = (body.mensagem || "").trim();
    const tipo = (body.tipo || "avulsa").trim();
    const cliente_id = body.cliente_id || null;
    const media_url = (body.media_url || "").trim();
    const media_filename = (body.media_filename || "").trim();

    if (!telefone || telefone.length < 10) {
      return new Response(
        JSON.stringify({ success: false, error: "Telefone inválido" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!mensagem || mensagem.length > 4000) {
      return new Response(
        JSON.stringify({ success: false, error: "Mensagem inválida (vazia ou > 4000 caracteres)" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Carrega perfil para obter empresa_id e usuario_id
    const { data: perfil } = await supabase
      .from("usuario_perfil")
      .select("id, empresa_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    // Números nacionais no Brasil têm 10 (fixo) ou 11 (celular, com o 9º dígito)
    // dígitos de DDD+número. Prefixados com o código do país (55) viram 12/13
    // dígitos. Usar telefone.startsWith("55") pra decidir se o código do país já
    // está presente é um bug: DDDs que começam com 5 (51, 53, 54, 55 — todos no
    // Rio Grande do Sul) colidem com esse prefixo, então um número de DDD 55
    // (ex: 55991234567) era enviado sem o código do país e a API rejeitava com
    // ERR_WAPP_INVALID_CONTACT.
    const numero =
      telefone.length === 12 || telefone.length === 13
        ? telefone
        : telefone.length === 10 || telefone.length === 11
          ? `55${telefone}`
          : telefone.startsWith("55")
            ? telefone
            : `55${telefone}`;

    // Documentos são enviados como link clicável. Isso evita a incompatibilidade
    // do endpoint de mídia do provedor e permite que o cliente abra/baixe o PDF.
    let resp: Response;
    let usedMedia = false;
    let documentByLink = false;
    let mensagemEnviada = mensagem;
    if (media_url) {
      const nomeDocumento = media_filename || (tipo === "boleto" ? "boleto.pdf" : "documento.pdf");
      if (!mensagem.includes(media_url)) {
        mensagemEnviada = `${mensagem}\n\n📄 ${nomeDocumento}\nBaixar documento: ${media_url}`;
      }
      documentByLink = true;
      resp = await fetch(`https://api-imperial.zapcontabil.chat/api/send/${numero}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "accept": "application/json",
          "Authorization": `Bearer ${ZAPCONTABIL_API_TOKEN}`,
        },
        body: JSON.stringify({ body: mensagemEnviada, connectionFrom: 0 }),
      });
    } else {

      const zapUrl = `https://api-imperial.zapcontabil.chat/api/send/${numero}`;
      resp = await fetch(zapUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "accept": "application/json",
          "Authorization": `Bearer ${ZAPCONTABIL_API_TOKEN}`,
        },
        body: JSON.stringify({ body: mensagem, connectionFrom: 0 }),
      });
    }

    const respText = await resp.text();
    let respJson: unknown = null;
    try { respJson = JSON.parse(respText); } catch { respJson = respText; }

    const sucesso = resp.ok;
    const docFalhou = !!media_url && !documentByLink;
    const status = !sucesso ? "erro" : "enviado";
    const erroMsg = !sucesso
      ? `Falha ZapContábil [${resp.status}]: ${friendlyZapError(respText) ?? respText.slice(0, 500)}`
      : null;

    // Registra histórico
    try {
      await supabase.from("mensagens_enviadas").insert({
        empresa_id: perfil?.empresa_id ?? null,
        cliente_id,
        usuario_id: perfil?.id ?? null,
        tipo,
        telefone: numero,
        mensagem: mensagemEnviada,
        status,
        erro: erroMsg,
      });
    } catch (logErr) {
      console.error("Falha ao registrar histórico:", logErr);
    }

    if (!sucesso) {
      console.error("ZapContábil error:", resp.status, respText);
      return new Response(
        JSON.stringify({ success: false, error: erroMsg, detalhe: respJson }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: respJson,
        usedMedia,
        documentByLink,
        docFalhou,
        warning: null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("send-whatsapp exception:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
