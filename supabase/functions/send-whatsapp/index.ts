import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ZAP_BASE = "https://api-imperial.zapcontabil.chat";
// Versão da função: o frontend usa para detectar deploy desatualizado.
const FUNCTION_VERSION = 3;

interface SendBody {
  telefone: string;
  mensagem: string;
  cliente_id?: string;
  tipo?: string; // avulsa | contrato | boleto | aniversario
  media_url?: string;          // URL (assinada) do anexo — PDF do boleto etc.
  media_filename?: string;     // nome do arquivo mostrado ao cliente
  media_path?: string;         // caminho no bucket "boletos" (preferido: baixamos com service role)
  media_bucket?: string;       // bucket do Storage (padrão: boletos)
  media_base64?: string;       // conteúdo do arquivo em base64 (o servidor grava no Storage com service role)
  media_content_type?: string; // MIME do arquivo em base64 (padrão: application/pdf)
}

interface Attempt {
  endpoint: string;
  modo: string;
  status: number;
  body: string;
}

const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");

const json = (payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Traduz códigos de erro conhecidos da API do WhatsApp/ZapContábil para uma
// mensagem que ajuda a diagnosticar o problema sem precisar ler o JSON cru.
function friendlyZapError(rawBody: string): string | null {
  if (rawBody.includes("ERR_WAPP_INVALID_CONTACT")) {
    return "Número de WhatsApp inválido — confira o DDD/telefone do cliente (o número pode estar incompleto, sem WhatsApp ou com o código do país duplicado).";
  }
  if (rawBody.includes("ERR_WAPP_NOT_INITIALIZED") || rawBody.includes("NOT_CONNECTED")) {
    return "A conexão do WhatsApp (ZapContábil) está desconectada — reconecte o QR Code no painel do ZapContábil.";
  }
  if (rawBody.includes("ERR_OFFICIAL_API_WINDOW_CLOSED")) {
    return "Janela de 24h da API oficial fechada — o cliente precisa mandar uma mensagem primeiro ou é necessário usar um template aprovado.";
  }
  if (rawBody.includes("ERR_NO_PERMISSION") || rawBody.includes("Unauthorized") || rawBody.includes("jwt")) {
    return "Chave da API do ZapContábil inválida ou sem permissão — gere uma nova chave em Configurações > Integração > Chaves de API.";
  }
  return null;
}

// Normaliza o telefone para o formato DDI+DDD+número.
// Números nacionais no Brasil têm 10 (fixo) ou 11 (celular, com o 9º dígito)
// dígitos de DDD+número. Prefixados com o código do país (55) viram 12/13.
// Não usar startsWith("55"): DDDs 51/53/54/55 (RS) colidem com o prefixo.
function normalizarNumero(telefone: string): string {
  if (telefone.length === 12 || telefone.length === 13) return telefone;
  if (telefone.length === 10 || telefone.length === 11) return `55${telefone}`;
  return telefone.startsWith("55") ? telefone : `55${telefone}`;
}

function base64ToBytes(b64: string): Uint8Array {
  const limpo = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(limpo.replace(/\s/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function zapHeaders(token: string, contentType?: string): Record<string, string> {
  const h: Record<string, string> = {
    accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
  if (contentType) h["Content-Type"] = contentType;
  return h;
}

async function enviarTexto(token: string, numero: string, body: string, connectionFrom: number | null) {
  const payload: Record<string, unknown> = { body };
  if (connectionFrom !== null) payload.connectionFrom = connectionFrom;
  const resp = await fetch(`${ZAP_BASE}/api/send/${numero}`, {
    method: "POST",
    headers: zapHeaders(token, "application/json"),
    body: JSON.stringify(payload),
  });
  const text = await resp.text();
  return { ok: resp.ok, status: resp.status, text };
}

/**
 * Envia o documento pelo endpoint de mídia. Ordem das tentativas:
 *  1. multipart/form-data com o binário (mais confiável — o provedor não
 *     precisa conseguir baixar a URL assinada do Supabase)
 *  2. JSON { url } apontando para a URL assinada
 * Cada tentativa é feita com e sem connectionFrom, pois algumas contas
 * rejeitam o valor 0 no endpoint de mídia.
 */
async function enviarDocumento(
  token: string,
  numero: string,
  file: { bytes: Uint8Array; contentType: string; filename: string } | null,
  mediaUrl: string,
  connectionFrom: number | null,
  attempts: Attempt[],
): Promise<boolean> {
  const endpoint = `${ZAP_BASE}/api/send/document/${numero}`;
  const conexoes: Array<number | null> = connectionFrom === null ? [null] : [connectionFrom, null];

  if (file) {
    for (const conn of conexoes) {
      const form = new FormData();
      form.append("media", new Blob([file.bytes], { type: file.contentType }), file.filename);
      if (conn !== null) form.append("connectionFrom", String(conn));
      try {
        const resp = await fetch(endpoint, { method: "POST", headers: zapHeaders(token), body: form });
        const text = await resp.text();
        attempts.push({ endpoint, modo: `multipart conn=${conn}`, status: resp.status, body: text.slice(0, 300) });
        if (resp.ok) return true;
      } catch (e) {
        attempts.push({ endpoint, modo: `multipart conn=${conn}`, status: 0, body: String(e).slice(0, 300) });
      }
    }
  }

  if (mediaUrl) {
    for (const conn of conexoes) {
      const payload: Record<string, unknown> = { url: mediaUrl };
      if (conn !== null) payload.connectionFrom = conn;
      try {
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: zapHeaders(token, "application/json"),
          body: JSON.stringify(payload),
        });
        const text = await resp.text();
        attempts.push({ endpoint, modo: `json-url conn=${conn}`, status: resp.status, body: text.slice(0, 300) });
        if (resp.ok) return true;
      } catch (e) {
        attempts.push({ endpoint, modo: `json-url conn=${conn}`, status: 0, body: String(e).slice(0, 300) });
      }
    }
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const ZAPCONTABIL_API_TOKEN = Deno.env.get("ZAPCONTABIL_API_TOKEN");
    if (!ZAPCONTABIL_API_TOKEN) {
      return json({ success: false, error: "ZAPCONTABIL_API_TOKEN não configurado" });
    }
    // Conexão do WhatsApp a usar. Padrão 0 (comportamento histórico); pode ser
    // sobrescrito com o ID real obtido em /api/connections, ou "none" para
    // deixar o ZapContábil escolher a conexão padrão.
    const connEnv = (Deno.env.get("ZAPCONTABIL_CONNECTION_ID") ?? "0").trim();
    const connectionFrom: number | null = connEnv === "" || connEnv.toLowerCase() === "none" ? null : Number(connEnv);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ success: false, error: "Não autenticado" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) return json({ success: false, error: "Sessão inválida" });

    const body = (await req.json()) as SendBody;
    const telefone = onlyDigits(body.telefone || "");
    const mensagem = (body.mensagem || "").trim();
    const tipo = (body.tipo || "avulsa").trim();
    const cliente_id = body.cliente_id || null;
    let media_path = (body.media_path || "").trim();
    let media_url = (body.media_url || "").trim();
    const media_base64 = (body.media_base64 || "").trim();
    const media_filename =
      (body.media_filename || "").trim().slice(0, 150) || (tipo === "boleto" ? "boleto.pdf" : "documento.pdf");

    // --- Limites de segurança dos anexos ---------------------------------
    // A função usa a service role para gravar/ler no Storage, então NÃO pode
    // confiar em bucket/caminho/URL vindos do cliente: só o bucket "boletos",
    // só tipos de arquivo esperados, só caminhos da própria empresa/usuário e
    // só URLs do Storage deste projeto.
    const media_bucket = "boletos";
    if (body.media_bucket && body.media_bucket.trim() !== media_bucket) {
      return json({ success: false, error: "Bucket de anexo não permitido" });
    }
    const TIPOS_PERMITIDOS = new Set(["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"]);
    const media_content_type = (body.media_content_type || "application/pdf").trim().toLowerCase().split(";")[0];
    if (media_base64 && !TIPOS_PERMITIDOS.has(media_content_type)) {
      return json({ success: false, error: `Tipo de arquivo não permitido (${media_content_type}). Envie PDF ou imagem.` });
    }
    const MAX_BASE64_CHARS = 11 * 1024 * 1024; // ~8 MB de arquivo
    if (media_base64.length > MAX_BASE64_CHARS) {
      return json({ success: false, error: "Anexo maior que 8 MB" });
    }
    if (media_url) {
      let host = "";
      try { host = new URL(media_url).host; } catch { host = ""; }
      const hostProjeto = (() => { try { return new URL(supabaseUrl).host; } catch { return ""; } })();
      if (!host || host !== hostProjeto) {
        return json({ success: false, error: "media_url deve apontar para o Storage deste projeto" });
      }
    }

    if (!telefone || telefone.length < 10) return json({ success: false, error: "Telefone inválido" });
    if (!mensagem || mensagem.length > 4000) {
      return json({ success: false, error: "Mensagem inválida (vazia ou > 4000 caracteres)" });
    }

    // Carrega perfil para obter empresa_id e usuario_id
    const { data: perfil } = await supabase
      .from("usuario_perfil")
      .select("id, empresa_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    const numero = normalizarNumero(telefone);
    const attempts: Attempt[] = [];

    // Caminho no Storage só pode estar na pasta da empresa do usuário ou na
    // pasta do próprio usuário (evita baixar/enviar arquivos de outra empresa).
    if (media_path) {
      if (media_path.includes("..")) return json({ success: false, error: "Caminho de anexo inválido" });
      const pastaRaiz = media_path.split("/")[0];
      const permitidas = [perfil?.empresa_id, userData.user.id].filter(Boolean) as string[];
      if (!permitidas.includes(pastaRaiz)) {
        return json({ success: false, error: "Você não tem acesso a esse arquivo" });
      }
    }
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const admin = createClient(supabaseUrl, serviceKey || (Deno.env.get("SUPABASE_ANON_KEY") ?? ""), {
      global: serviceKey ? {} : { headers: { Authorization: authHeader } },
    });

    // Arquivo enviado em base64: gravamos no Storage com a service role, para
    // não depender do vínculo do usuário com uma empresa nem das policies do bucket.
    let arquivoBase64: { bytes: Uint8Array; contentType: string; filename: string } | null = null;
    if (media_base64) {
      try {
        arquivoBase64 = { bytes: base64ToBytes(media_base64), contentType: media_content_type, filename: media_filename };
        const pasta = perfil?.empresa_id ?? userData.user.id;
        const nomeSeguro = media_filename.replace(/[^\w.\-]+/g, "_");
        const path = `${pasta}/${cliente_id ?? "avulso"}/${Date.now()}-${nomeSeguro}`;
        const { error: upErr } = await admin.storage
          .from(media_bucket)
          .upload(path, arquivoBase64.bytes, { upsert: true, contentType: media_content_type });
        if (upErr) {
          attempts.push({ endpoint: `storage/${media_bucket}`, modo: "upload", status: 0, body: String(upErr.message ?? upErr).slice(0, 300) });
        } else {
          media_path = path;
          const { data: signed } = await admin.storage.from(media_bucket).createSignedUrl(path, 60 * 60 * 24 * 30);
          if (signed?.signedUrl) media_url = signed.signedUrl;
        }
      } catch (e) {
        attempts.push({ endpoint: "base64", modo: "decode", status: 0, body: String(e).slice(0, 300) });
        arquivoBase64 = null;
      }
    }
    const temAnexo = !!(media_url || media_path || arquivoBase64);
    const anexoSolicitado = !!(media_base64 || body.media_url || body.media_path);

    // 1) Texto da mensagem
    const texto = await enviarTexto(ZAPCONTABIL_API_TOKEN, numero, mensagem, connectionFrom);
    attempts.push({ endpoint: `${ZAP_BASE}/api/send/${numero}`, modo: "texto", status: texto.status, body: texto.text.slice(0, 300) });
    let respJson: unknown = null;
    try { respJson = JSON.parse(texto.text); } catch { respJson = texto.text; }

    if (!texto.ok) {
      const erroMsg = `Falha ZapContábil [${texto.status}]: ${friendlyZapError(texto.text) ?? texto.text.slice(0, 500)}`;
      try {
        await admin.from("mensagens_enviadas").insert({
          empresa_id: perfil?.empresa_id ?? null,
          cliente_id,
          usuario_id: perfil?.id ?? null,
          tipo,
          telefone: numero,
          mensagem: temAnexo ? `${mensagem}\n\n📎 ${media_filename}` : mensagem,
          status: "erro",
          erro: erroMsg,
        });
      } catch (logErr) {
        console.error("Falha ao registrar histórico:", logErr);
      }
      console.error("ZapContábil error:", texto.status, texto.text);
      return json({ success: false, version: FUNCTION_VERSION, error: erroMsg, detalhe: respJson, attempts });
    }

    // 2) Documento (se houver)
    let usedMedia = false;
    let documentByLink = false;
    let warning: string | null = null;
    let mensagemRegistrada = mensagem;

    if (temAnexo) {
      // Baixa o arquivo: preferimos o caminho no Storage (service role, não
      // depende da URL assinada); senão baixamos a própria URL assinada.
      let file: { bytes: Uint8Array; contentType: string; filename: string } | null = arquivoBase64;
      try {
        if (!file && media_path) {
          const { data: blob, error: dlErr } = await admin.storage.from(media_bucket).download(media_path);
          if (dlErr) throw dlErr;
          if (blob) {
            file = {
              bytes: new Uint8Array(await blob.arrayBuffer()),
              contentType: blob.type || "application/pdf",
              filename: media_filename,
            };
          }
        }
        if (!file && media_url) {
          const r = await fetch(media_url);
          if (r.ok) {
            file = {
              bytes: new Uint8Array(await r.arrayBuffer()),
              contentType: r.headers.get("content-type") || "application/pdf",
              filename: media_filename,
            };
          } else {
            attempts.push({ endpoint: media_url.slice(0, 120), modo: "download", status: r.status, body: "" });
          }
        }
      } catch (e) {
        attempts.push({ endpoint: media_path || media_url.slice(0, 120), modo: "download", status: 0, body: String(e).slice(0, 300) });
      }

      usedMedia = await enviarDocumento(ZAPCONTABIL_API_TOKEN, numero, file, media_url, connectionFrom, attempts);

      if (!usedMedia) {
        // Fallback: manda o link para download como mensagem separada.
        const ultimo = attempts[attempts.length - 1];
        const motivo = ultimo ? `[${ultimo.status}] ${friendlyZapError(ultimo.body) ?? ultimo.body}` : "sem detalhes";
        if (media_url) {
          const link = await enviarTexto(
            ZAPCONTABIL_API_TOKEN,
            numero,
            `📄 ${media_filename}\nBaixar documento: ${media_url}`,
            connectionFrom,
          );
          attempts.push({ endpoint: `${ZAP_BASE}/api/send/${numero}`, modo: "texto-link", status: link.status, body: link.text.slice(0, 300) });
          documentByLink = link.ok;
        }
        warning = documentByLink
          ? `O anexo não foi aceito pelo WhatsApp (${motivo}); o cliente recebeu um LINK para baixar o documento.`
          : `O documento NÃO foi entregue (${motivo}); apenas o texto chegou ao cliente.`;
        console.error("[send-whatsapp] anexo falhou", JSON.stringify(attempts));
      }
      // Marcador usado pela tela "Pasta de Boletos" para saber quais arquivos já foram enviados.
      mensagemRegistrada = `${mensagem}\n\n📎 ${media_filename}`;
    }

    if (anexoSolicitado && !temAnexo && !warning) {
      const ultimo = attempts.find((a) => a.modo === "decode" || a.modo === "upload");
      warning = `O documento NÃO foi entregue: falha ao processar o arquivo no servidor (${ultimo ? ultimo.body : "arquivo vazio"}).`;
    }
    const status = !anexoSolicitado || usedMedia ? "enviado" : documentByLink ? "enviado_link" : "enviado_sem_anexo";

    try {
      await admin.from("mensagens_enviadas").insert({
        empresa_id: perfil?.empresa_id ?? null,
        cliente_id,
        usuario_id: perfil?.id ?? null,
        tipo,
        telefone: numero,
        mensagem: mensagemRegistrada,
        status,
        erro: warning,
      });
    } catch (logErr) {
      console.error("Falha ao registrar histórico:", logErr);
    }

    return json({
      success: true,
      version: FUNCTION_VERSION,
      data: respJson,
      usedMedia,
      documentByLink,
      docFalhou: temAnexo && !usedMedia && !documentByLink,
      warning,
      attempts,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("send-whatsapp exception:", msg);
    return json({ success: false, error: msg });
  }
});
