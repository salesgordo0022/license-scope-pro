/**
 * Recebe o webhook de mensagens do ZapContábil (WhatsApp) e transforma em Chamados.
 *
 * URL a cadastrar no ZapContábil:
 *   https://<projeto>.supabase.co/functions/v1/zapcontabil-webhook?empresa=<empresa_id>&token=<zap_webhook_token>
 * (a tela de configuração dos Chamados mostra a URL pronta).
 *
 * O formato exato do webhook do ZapContábil não é documentado publicamente;
 * esta function aceita os formatos comuns das plataformas tipo Whaticket
 * ({ msg, ticket }, { data: { message, ticket } }, mensagem "solta"...) e
 * guarda o payload original em `bruto` para ajustar a leitura se precisar.
 *
 * Segurança: sem JWT (quem chama é o ZapContábil); exige o token da empresa
 * na URL, comparado com chamados_config.zap_webhook_token.
 */
import { clienteServico, iguaisSeguro, registrarMensagem } from "../_shared/chamados.ts";

type Obj = Record<string, any>;

/** Primeiro valor não vazio entre vários caminhos ("a.b.c"). */
function pegar(o: Obj, caminhos: string[]): any {
  for (const c of caminhos) {
    const v = c.split(".").reduce((acc: any, k) => (acc == null ? undefined : acc[k]), o);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

function extrair(p: Obj) {
  // Alguns provedores mandam { event, data }, outros { msg, ticket } ou a mensagem direto.
  const raiz: Obj = p.data && typeof p.data === "object" ? p.data : p;
  const msg: Obj = raiz.msg ?? raiz.message ?? raiz.mensagem ?? raiz;
  const ticket: Obj = raiz.ticket ?? msg.ticket ?? {};
  const contato: Obj = ticket.contact ?? raiz.contact ?? msg.contact ?? {};

  const texto = pegar(msg, ["body", "text", "texto", "content", "caption", "message.conversation", "message.extendedTextMessage.text"]) ?? "";
  const fromMe = Boolean(pegar(msg, ["fromMe", "from_me", "key.fromMe"]) ?? false);
  const numero = soDigitos(
    pegar(contato, ["number", "numero", "phone", "telefone"]) ??
      pegar(msg, ["number", "from", "remoteJid", "key.remoteJid", "contact.number"]) ??
      pegar(raiz, ["number", "from"]),
  );
  const nome = pegar(contato, ["name", "nome", "pushname", "pushName"]) ?? pegar(msg, ["pushName", "notifyName", "senderName"]) ?? null;
  const id = pegar(msg, ["id", "messageId", "key.id", "wid"]) ?? null;
  const midia = pegar(msg, ["mediaUrl", "media_url", "url"]) ?? null;
  const tipoMidia = pegar(msg, ["mediaType", "type"]) ?? null;
  const quando = pegar(msg, ["createdAt", "created_at", "timestamp"]);

  // Valores que identificam o canal (conexão/fila), usados no filtro.
  const canal = [
    pegar(ticket, ["whatsappId", "whatsapp.id", "connectionId"]),
    pegar(ticket, ["whatsapp.name", "connection.name"]),
    pegar(ticket, ["queueId", "queue.id"]),
    pegar(ticket, ["queue.name", "queueName"]),
    pegar(raiz, ["whatsappId", "connectionId", "queueId", "queue", "channel", "connection"]),
  ]
    .filter((v) => v !== undefined && v !== null)
    .map((v) => String(v));
  const canalNome = pegar(ticket, ["queue.name", "whatsapp.name"]) ?? "WhatsApp";

  let quandoIso: string | undefined;
  if (quando !== undefined) {
    const n = Number(quando);
    const d = Number.isFinite(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(String(quando));
    if (!isNaN(d.getTime())) quandoIso = d.toISOString();
  }

  return { texto: String(texto), fromMe, numero, nome, id: id ? String(id) : null, midia, tipoMidia, canal, canalNome, quandoIso };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const url = new URL(req.url);
  const empresaId = url.searchParams.get("empresa") ?? "";
  const token = url.searchParams.get("token") ?? "";

  const db = clienteServico();
  const { data: cfg } = await db.from("chamados_config").select("empresa_id, zap_webhook_token, zap_filtro").eq("empresa_id", empresaId).maybeSingle();
  if (!cfg || !iguaisSeguro(token, cfg.zap_webhook_token)) return new Response("não autorizado", { status: 401 });

  let payload: Obj;
  try {
    payload = await req.json();
  } catch {
    return new Response("json inválido", { status: 400 });
  }

  try {
    const m = extrair(payload);
    if (!m.numero || (!m.texto && !m.midia)) return new Response("ignorado");

    // Filtro do canal escolhido (conexão ou fila); vazio = aceita todos.
    const filtro = (cfg.zap_filtro ?? "").trim().toLowerCase();
    if (filtro && !m.canal.some((c) => c.toLowerCase() === filtro)) return new Response("outro canal");

    const anexos = m.midia ? [{ nome: m.tipoMidia ?? "anexo", url: m.midia }] : [];
    // fromMe = resposta feita direto no ZapContábil: entra como saída se a
    // conversa já é chamado. WhatsApp é fila comum da empresa (sem dono).
    await registrarMensagem(db, {
      empresaId: cfg.empresa_id,
      origem: "zapcontabil",
      conversaId: `wa:${m.numero}`,
      donoId: null,
      direcao: m.fromMe ? "saida" : "entrada",
      texto: m.texto || "(mídia)",
      externoId: m.id,
      autorNome: m.fromMe ? "ZapContábil" : null,
      canalNome: String(m.canalNome),
      contatoNome: m.fromMe ? null : m.nome ? String(m.nome) : m.numero,
      contatoId: m.numero,
      anexos,
      bruto: payload,
      quando: m.quandoIso,
    });
    return new Response("ok");
  } catch (e) {
    console.error("zapcontabil-webhook:", e);
    // 200 para o provedor não ficar reenviando um payload que não sabemos ler.
    return new Response("erro registrado");
  }
});
