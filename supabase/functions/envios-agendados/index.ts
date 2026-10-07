/**
 * Envios agendados de WhatsApp (ZapContábil).
 *
 *  POST { acao: "executar" }  ?token=<ENVIOS_CRON_TOKEN>  (pg_cron, a cada 2 min)
 *    1. Regras vencidas (mensagens_agendadas) → uma linha por cliente em
 *       fila_envios, e a regra passa para a próxima data.
 *    2. Envia a fila que já chegou a hora (até LOTE por rodada, com pausa).
 *  POST { acao: "conexoes" }        (logado) → conexões do ZapContábil
 *  POST { acao: "upload_anexo", nome, base64, tipo }      (logado) → { path }
 *  POST { acao: "agendar_boleto", cliente_id, telefone, mensagem,
 *         nome, base64, tipo, enviar_em, conexao_id? }   (logado) → { id }
 *
 * Tudo o que sai é registrado em mensagens_enviadas (histórico da aba Mensagens).
 */
import { autenticar, json, respostaPreflight } from "../_shared/auth.ts";
import { clienteServico, iguaisSeguro } from "../_shared/chamados.ts";
import { segredo } from "../_shared/segredos.ts";
import { lista, normalizarNumero, zapEnviarDocumento, zapEnviarTexto, zapGarantirContato, zapGet } from "../_shared/zapcontabil.ts";
import { preencherVariaveis, proximaExecucao, type RegraAgenda } from "../_shared/agenda.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const LOTE = 25; // ~25 × (envio + pausa) cabe no limite de tempo da function
const PAUSA_MS = 1500;
const BUCKET = "boletos";
const MAX_BYTES = 8 * 1024 * 1024;
const TIPOS_ARQUIVO = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nomeSeguro = (n: string) => (n || "arquivo.pdf").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_").slice(-120);

function base64ParaBytes(b64: string): Uint8Array {
  const limpo = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(limpo.replace(/\s/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Conexão padrão para quem não escolheu (mesma regra do send-whatsapp). */
function conexaoPadrao(): number | null {
  const env = (Deno.env.get("ZAPCONTABIL_CONNECTION_ID") ?? "").trim();
  return env && env.toLowerCase() !== "none" && Number.isFinite(Number(env)) ? Number(env) : null;
}

// ------------------------------------------------------------------ regras
interface Agendamento extends RegraAgenda {
  id: string;
  empresa_id: string;
  tipo: string;
  mensagem: string;
  destino: "todos_ativos" | "selecionados";
  clientes_ids: string[];
  conexao_id: number | null;
  anexo_path: string | null;
  anexo_nome: string | null;
  proxima_execucao: string;
  criado_por: string | null;
}

async function gerarFila(db: SupabaseClient) {
  const agora = new Date();
  const { data: vencidas } = await db.from("mensagens_agendadas").select("*").eq("ativo", true).lte("proxima_execucao", agora.toISOString()).limit(50);
  let geradas = 0;
  for (const a of (vencidas || []) as Agendamento[]) {
    const proxima = proximaExecucao(a, agora);
    // "Trava": só quem conseguir mudar a proxima_execucao de A para B gera a fila.
    const { data: pegou } = await db
      .from("mensagens_agendadas")
      .update({ proxima_execucao: proxima?.toISOString() ?? null, ultima_execucao: agora.toISOString(), ativo: proxima !== null, updated_at: agora.toISOString() })
      .eq("id", a.id)
      .eq("proxima_execucao", a.proxima_execucao)
      .select("id");
    if (!pegou?.length) continue;

    let q = db.from("clientes").select("id, nome_empresa, nome_dono, telefone, valor_mensalidade, status").eq("empresa_id", a.empresa_id);
    q = a.destino === "selecionados" ? q.in("id", a.clientes_ids.length ? a.clientes_ids : ["00000000-0000-0000-0000-000000000000"]) : q.eq("status", "ativo");
    const { data: clientes } = await q;

    const linhas = (clientes || [])
      .filter((c) => (c.telefone || "").replace(/\D/g, "").length >= 10)
      .map((c) => ({
        empresa_id: a.empresa_id,
        agendamento_id: a.id,
        periodo: a.proxima_execucao,
        cliente_id: c.id,
        cliente_nome: c.nome_empresa,
        telefone: normalizarNumero(c.telefone),
        mensagem: preencherVariaveis(a.mensagem, { nome: c.nome_empresa, contato: c.nome_dono, mensalidade: c.valor_mensalidade }, agora),
        tipo: a.tipo,
        anexo_path: a.anexo_path,
        anexo_nome: a.anexo_nome,
        conexao_id: a.conexao_id,
        enviar_em: agora.toISOString(),
        criado_por: a.criado_por,
      }));
    if (linhas.length) {
      const { error } = await db.from("fila_envios").upsert(linhas, { onConflict: "agendamento_id,periodo,cliente_id", ignoreDuplicates: true });
      if (error) console.error("envios-agendados: fila", a.id, error);
      else geradas += linhas.length;
    }
  }
  return geradas;
}

// -------------------------------------------------------------------- fila
interface ItemFila {
  id: string;
  empresa_id: string;
  cliente_id: string | null;
  telefone: string;
  mensagem: string;
  tipo: string;
  anexo_path: string | null;
  anexo_nome: string | null;
  conexao_id: number | null;
  criado_por: string | null;
}

async function enviarItem(db: SupabaseClient, item: ItemFila): Promise<{ status: string; erro: string | null }> {
  const conexao = item.conexao_id ?? conexaoPadrao();
  const texto = await zapEnviarTexto(item.telefone, item.mensagem, conexao).then(() => null).catch((e) => (e instanceof Error ? e.message : String(e)));
  if (texto) return { status: "erro", erro: texto.slice(0, 500) };
  if (!item.anexo_path) return { status: "enviado", erro: null };

  const { data: blob } = await db.storage.from(BUCKET).download(item.anexo_path);
  const { data: assinada } = await db.storage.from(BUCKET).createSignedUrl(item.anexo_path, 60 * 60 * 24 * 30);
  const arquivo = blob ? { bytes: new Uint8Array(await blob.arrayBuffer()), tipo: blob.type || "application/pdf", nome: item.anexo_nome || "documento.pdf" } : null;
  if (await zapEnviarDocumento(item.telefone, arquivo, assinada?.signedUrl ?? null, conexao)) return { status: "enviado", erro: null };
  if (assinada?.signedUrl) {
    await zapEnviarTexto(item.telefone, `📄 ${item.anexo_nome || "Documento"}\nBaixar: ${assinada.signedUrl}`, conexao).catch(() => undefined);
    return { status: "enviado_link", erro: "O anexo não foi aceito; foi enviado o link para baixar." };
  }
  return { status: "enviado_sem_anexo", erro: "Arquivo não encontrado no armazenamento." };
}

async function enviarFila(db: SupabaseClient) {
  // Envio que travou no meio (function interrompida) não é repetido às cegas.
  await db.from("fila_envios").update({ status: "erro", erro: "Envio interrompido; confira com o cliente antes de reenviar." }).eq("status", "enviando").lt("enviar_em", new Date(Date.now() - 20 * 60_000).toISOString());

  const { data: itens } = await db.from("fila_envios").select("*").eq("status", "pendente").lte("enviar_em", new Date().toISOString()).order("enviar_em").limit(LOTE);
  let enviados = 0;
  for (const item of (itens || []) as ItemFila[]) {
    const { data: pegou } = await db.from("fila_envios").update({ status: "enviando" }).eq("id", item.id).eq("status", "pendente").select("id");
    if (!pegou?.length) continue;

    const r = await enviarItem(db, item);
    await db.from("fila_envios").update({ status: r.status, erro: r.erro, enviado_em: new Date().toISOString() }).eq("id", item.id);
    await db.from("mensagens_enviadas").insert({
      empresa_id: item.empresa_id,
      cliente_id: item.cliente_id,
      usuario_id: item.criado_por,
      tipo: item.tipo,
      telefone: item.telefone,
      mensagem: item.anexo_nome ? `${item.mensagem}\n\n📎 ${item.anexo_nome}` : item.mensagem,
      status: r.status,
      erro: r.erro,
    });
    if (r.status !== "erro") enviados++;
    await dormir(PAUSA_MS);
  }
  return enviados;
}

// --------------------------------------------------------------- arquivos
async function guardarArquivo(db: SupabaseClient, empresaId: string, pasta: string, nome: string, base64: string, tipo: string) {
  if (!TIPOS_ARQUIVO.has(tipo)) throw new Error("Arquivo precisa ser PDF ou imagem");
  const bytes = base64ParaBytes(base64);
  if (bytes.length > MAX_BYTES) throw new Error("Arquivo maior que 8 MB");
  const path = `${empresaId}/${pasta}/${Date.now()}-${nomeSeguro(nome)}`;
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: tipo, upsert: false });
  if (error) throw new Error(`Não foi possível guardar o arquivo: ${error.message}`);
  return path;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return respostaPreflight(req);
  const db = clienteServico();
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const acao = String(corpo.acao ?? "");

  if (acao === "executar") {
    const token = new URL(req.url).searchParams.get("token") ?? "";
    if (!iguaisSeguro(token, (await segredo("ENVIOS_CRON_TOKEN")) ?? "")) return new Response("não autorizado", { status: 401 });
    try {
      const geradas = await gerarFila(db);
      const enviados = await enviarFila(db);
      return json(req, { ok: true, geradas, enviados });
    } catch (e) {
      console.error("envios-agendados:", e);
      return json(req, { error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }

  const { auth, erro } = await autenticar(req);
  if (erro) return erro;
  if (!auth.empresaId) return json(req, { error: "Usuário sem empresa" }, 403);

  try {
    if (acao === "conexoes") {
      const conexoes = lista(await zapGet("/api/connections"), "connections").map((c: Record<string, unknown>) => ({
        id: Number(c.id),
        nome: String(c.name ?? `Conexão ${c.id}`),
        status: String(c.status ?? ""),
        padrao: Boolean(c.isDefault),
      }));
      return json(req, { conexoes });
    }

    if (acao === "upload_anexo") {
      const path = await guardarArquivo(db, auth.empresaId, "agendamentos", String(corpo.nome ?? ""), String(corpo.base64 ?? ""), String(corpo.tipo ?? "application/pdf"));
      return json(req, { path });
    }

    if (acao === "agendar_boleto") {
      const clienteId = String(corpo.cliente_id ?? "");
      // O cliente precisa ser da empresa de quem agenda (RLS com o client do usuário).
      const { data: cliente } = await auth.client.from("clientes").select("id, nome_empresa").eq("id", clienteId).maybeSingle();
      if (!cliente) return json(req, { error: "Cliente não encontrado" }, 404);
      const telefone = normalizarNumero(String(corpo.telefone ?? ""));
      if (telefone.length < 12) return json(req, { error: "Telefone inválido" }, 400);
      const enviarEm = new Date(String(corpo.enviar_em ?? ""));
      if (isNaN(enviarEm.getTime())) return json(req, { error: "Data de envio inválida" }, 400);
      const nome = String(corpo.nome ?? "boleto.pdf");
      const path = await guardarArquivo(db, auth.empresaId, `boletos-agendados/${clienteId}`, nome, String(corpo.base64 ?? ""), String(corpo.tipo ?? "application/pdf"));
      const { data, error } = await db
        .from("fila_envios")
        .insert({
          empresa_id: auth.empresaId,
          cliente_id: clienteId,
          cliente_nome: cliente.nome_empresa,
          telefone,
          mensagem: String(corpo.mensagem ?? ""),
          tipo: "boleto",
          anexo_path: path,
          anexo_nome: nome,
          conexao_id: corpo.conexao_id != null && corpo.conexao_id !== "" ? Number(corpo.conexao_id) : null,
          enviar_em: enviarEm.toISOString(),
          criado_por: auth.perfilId,
        })
        .select("id")
        .single();
      if (error) throw error;
      return json(req, { id: data.id });
    }

    return json(req, { error: "Ação inválida" }, 400);
  } catch (e) {
    console.error("envios-agendados:", e);
    return json(req, { error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
