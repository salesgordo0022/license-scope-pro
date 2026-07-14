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

    const numero = telefone.startsWith("55") ? telefone : `55${telefone}`;

    // Se houver mídia, envia como documento via POST /api/send/document/{to} (JSON com URL pública)
    let resp: Response;
    let usedMedia = false;
    const mediaDebug: Array<{ endpoint: string; status: number; body: string }> = [];
    if (media_url) {
      // Detecta o tipo (document | image | video | audio) pela extensão/URL
      const lowerUrl = media_url.toLowerCase();
      let mediaType = "document";
      if (/\.(png|jpe?g|gif|webp|bmp)(\?|$)/.test(lowerUrl)) mediaType = "image";
      else if (/\.(mp4|mov|webm|mkv)(\?|$)/.test(lowerUrl)) mediaType = "video";
      else if (/\.(mp3|ogg|wav|m4a|aac)(\?|$)/.test(lowerUrl)) mediaType = "audio";

      const endpoint = `https://api-imperial.zapcontabil.chat/api/send/${mediaType}/${numero}`;
      const payload: Record<string, unknown> = {
        url: media_url,
        caption: mensagem,
        connectionFrom: 0,
      };
      if (media_filename) payload.filename = media_filename;

      resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "accept": "application/json",
          "Authorization": `Bearer ${ZAPCONTABIL_API_TOKEN}`,
        },
        body: JSON.stringify(payload),
      });

      const debugText = await resp.clone().text().catch(() => "");
      mediaDebug.push({ endpoint, status: resp.status, body: debugText.slice(0, 300) });
      console.log(`[send-whatsapp] ${endpoint} -> ${resp.status} :: ${debugText.slice(0, 300)}`);

      if (resp.ok) {
        usedMedia = true;
      } else {
        // Fallback: envia texto com o link caso o endpoint de mídia falhe
        console.error("[send-whatsapp] envio de mídia falhou, fallback texto", JSON.stringify(mediaDebug));
        const mensagemComLink = `${mensagem}\n\n${media_url}`;
        resp = await fetch(`https://api-imperial.zapcontabil.chat/api/send/${numero}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "accept": "application/json",
            "Authorization": `Bearer ${ZAPCONTABIL_API_TOKEN}`,
          },
          body: JSON.stringify({ body: mensagemComLink, connectionFrom: 0 }),
        });
      }
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
    const erroMsg = sucesso ? null : `Falha ZapContábil [${resp.status}]: ${respText.slice(0, 500)}`;

    // Registra histórico
    try {
      await supabase.from("mensagens_enviadas").insert({
        empresa_id: perfil?.empresa_id ?? null,
        cliente_id,
        usuario_id: perfil?.id ?? null,
        tipo,
        telefone: numero,
        mensagem,
        status: sucesso ? "enviado" : "erro",
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
      JSON.stringify({ success: true, data: respJson, usedMedia, mediaDebug }),
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
