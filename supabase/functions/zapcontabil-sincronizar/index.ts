/**
 * Traz para os Chamados as mensagens do WhatsApp (ZapContábil) de UM canal —
 * a conexão ou o setor cujo nome está em chamados_config.zap_filtro (ex.:
 * "Impertech"). Todas entram na fila comum da empresa (sem dono).
 *
 * A API do ZapContábil não documenta webhook de mensagens recebidas, então
 * esta function consulta a API:
 *   1. GET /api/connections e /api/queues → ids do canal escolhido;
 *   2. GET /api/messages?dateFrom=… (paginado) → mensagens novas;
 *   3. GET /api/tickets/{id} e /api/contacts/{id} → canal e contato de cada
 *      atendimento (guardado em zap_atendimentos para não repetir).
 * Mensagem já gravada é ignorada (externo_id), então rodar de novo não duplica.
 *
 * Quem chama:
 *  - pg_cron a cada minuto: ?empresa=<id>&token=<zap_webhook_token>;
 *  - botão "Sincronizar" da tela: usuário logado (empresa dele).
 */
import { autenticar, json, respostaPreflight } from "../_shared/auth.ts";
import { clienteServico, iguaisSeguro, registrarMensagem } from "../_shared/chamados.ts";
import { lista, separarAssinatura, zapGet } from "../_shared/zapcontabil.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type Obj = Record<string, any>;

interface Config {
  empresa_id: string;
  zap_filtro: string | null;
  zap_sync_ate: string | null;
}

interface Atendimento {
  passa: boolean;
  numero: string | null;
  nome: string | null;
  canal_nome: string | null;
}

const POR_PAGINA = 200;
const MAX_PAGINAS = 50;
// Margem para mensagens que chegam fora de ordem (o externo_id evita duplicar).
const MARGEM_MS = 10 * 60 * 1000;

const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const dia = (d: Date) => d.toISOString().slice(0, 10);
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

async function sincronizar(db: SupabaseClient, cfg: Config) {
  const filtro = norm(cfg.zap_filtro);

  // 1. Canal escolhido: conexão e/ou setor com esse nome (ou id).
  const conexoes = lista(await zapGet("/api/connections"), "connections");
  const conexoesDoCanal = conexoes.filter((c: Obj) => !filtro || norm(c.name) === filtro || String(c.id) === filtro);
  const setores = filtro ? lista(await zapGet("/api/queues", { pageSize: "500" }), "queues") : [];
  const setoresDoCanal = setores.filter((q: Obj) => norm(q.name) === filtro || String(q.id) === filtro);
  if (filtro && !conexoesDoCanal.length && !setoresDoCanal.length) {
    const nomes = [...conexoes.map((c: Obj) => c.name), ...setores.map((q: Obj) => q.name)].filter(Boolean).join(", ");
    throw new Error(`Nenhuma conexão ou setor chamado "${cfg.zap_filtro}". Disponíveis: ${nomes || "nenhum"}`);
  }
  const idsConexao = new Set(conexoesDoCanal.map((c: Obj) => String(c.id)));
  const idsSetor = new Set(setoresDoCanal.map((q: Obj) => String(q.id)));
  const nomeConexao = new Map(conexoes.map((c: Obj) => [String(c.id), String(c.name ?? "WhatsApp")]));
  const conexaoEnvio = conexoesDoCanal.length === 1 ? Number(conexoesDoCanal[0].id) : null;

  // 2. Mensagens desde a última sincronização (primeira vez: últimas 24h).
  const ultima = cfg.zap_sync_ate ? new Date(cfg.zap_sync_ate) : new Date(Date.now() - 24 * 3600 * 1000);
  const desde = new Date(ultima.getTime() - MARGEM_MS);
  // dateFrom é por dia: usa a data de Brasília (nunca depois da data em UTC) e filtra a hora aqui.
  const dateFrom = dia(new Date(desde.getTime() - 3 * 3600 * 1000));
  const mensagens: Obj[] = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const r = await zapGet("/api/messages", { dateFrom, page: String(pagina), pageSize: String(POR_PAGINA) });
    const itens = lista(r, "messages");
    mensagens.push(...itens);
    if (itens.length < POR_PAGINA) break;
  }
  const novas = mensagens
    .filter((m) => m.createdAt && new Date(m.createdAt) >= desde && !m.isDeleted)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

  // 3. Atendimento de cada mensagem (canal + contato), com cache.
  const cache = new Map<string, Atendimento>();
  const ticketIds = [...new Set(novas.map((m) => String(m.ticketId ?? "")).filter(Boolean))];
  if (ticketIds.length) {
    const { data } = await db.from("zap_atendimentos").select("ticket_id, passa, numero, nome, canal_nome").eq("empresa_id", cfg.empresa_id).in("ticket_id", ticketIds);
    for (const t of data || []) cache.set(t.ticket_id, t);
  }

  async function atendimento(ticketId: string, contactId: string): Promise<Atendimento> {
    const salvo = cache.get(ticketId);
    if (salvo) return salvo;
    const t: Obj = (await zapGet(`/api/tickets/${ticketId}`)) ?? {};
    const conexaoId = String(t.whatsappId ?? t.whatsapp?.id ?? "");
    const setorId = String(t.queueId ?? t.queue?.id ?? "");
    const passa = !filtro || idsConexao.has(conexaoId) || idsSetor.has(setorId);
    let contato: Obj = t.contact ?? {};
    if (passa && !contato.number) contato = (await zapGet(`/api/contacts/${t.contactId ?? contactId}`).catch(() => null)) ?? {};
    const a: Atendimento = {
      passa,
      numero: soDigitos(contato.number) || null,
      nome: contato.name ?? null,
      canal_nome: nomeConexao.get(conexaoId) ?? cfg.zap_filtro ?? "WhatsApp",
    };
    cache.set(ticketId, a);
    await db.from("zap_atendimentos").upsert({ empresa_id: cfg.empresa_id, ticket_id: ticketId, ...a, atualizado_em: new Date().toISOString() });
    return a;
  }

  let gravadas = 0;
  let ate = ultima;
  for (const m of novas) {
    const quando = new Date(m.createdAt);
    if (quando > ate) ate = quando;
    if (!m.ticketId) continue;
    const a = await atendimento(String(m.ticketId), String(m.contactId ?? ""));
    if (!a.passa || !a.numero) continue;

    const fromMe = m.fromMe === true || m.fromMe === "true";
    const { autor, texto } = fromMe ? separarAssinatura(String(m.body ?? "")) : { autor: null, texto: String(m.body ?? "") };
    const anexos = m.mediaUrl ? [{ nome: m.mediaType || "anexo", url: m.mediaUrl, tipo: m.mediaType }] : [];
    const r = await registrarMensagem(db, {
      empresaId: cfg.empresa_id,
      origem: "zapcontabil",
      conversaId: `wa:${a.numero}`,
      donoId: null,
      direcao: fromMe ? "saida" : "entrada",
      texto: texto || (m.mediaUrl ? "(mídia)" : ""),
      externoId: String(m.id),
      autorNome: fromMe ? autor || "ZapContábil" : null,
      canalNome: a.canal_nome,
      contatoNome: fromMe ? null : a.nome || a.numero,
      contatoId: a.numero,
      anexos,
      bruto: m,
      quando: quando.toISOString(),
    });
    if (!r.duplicada && !r.ignorada) gravadas++;
  }

  await db
    .from("chamados_config")
    .update({ zap_sync_ate: ate.toISOString(), zap_sync_erro: null, ...(conexaoEnvio !== null ? { zap_conexao_id: conexaoEnvio } : {}) })
    .eq("empresa_id", cfg.empresa_id);
  return { lidas: novas.length, gravadas };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return respostaPreflight(req);
  const url = new URL(req.url);
  const db = clienteServico();

  // Agendamento (token da empresa na URL) ou usuário logado.
  let empresaId = url.searchParams.get("empresa") ?? "";
  const token = url.searchParams.get("token") ?? "";
  if (token) {
    const { data } = await db.from("chamados_config").select("zap_webhook_token").eq("empresa_id", empresaId).maybeSingle();
    if (!data || !iguaisSeguro(token, data.zap_webhook_token)) return new Response("não autorizado", { status: 401 });
  } else {
    const { auth, erro } = await autenticar(req);
    if (erro) return erro;
    empresaId = auth.empresaId ?? "";
  }

  const { data: cfg } = await db.from("chamados_config").select("empresa_id, zap_filtro, zap_sync_ate").eq("empresa_id", empresaId).maybeSingle();
  if (!cfg) return json(req, { error: "Configure os Chamados (Integrações) primeiro" }, 400);

  try {
    const r = await sincronizar(db, cfg as Config);
    return json(req, { ok: true, ...r });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("zapcontabil-sincronizar:", msg);
    await db.from("chamados_config").update({ zap_sync_erro: msg.slice(0, 500) }).eq("empresa_id", empresaId);
    return json(req, { error: msg }, 502);
  }
});
