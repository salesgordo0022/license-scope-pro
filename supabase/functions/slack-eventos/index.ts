/**
 * Recebe os eventos do Slack (Events API) e transforma em Chamados.
 *
 * Viram chamado:
 *  - mensagem direta (DM) para o usuário configurado;
 *  - menção @usuário em qualquer canal;
 *  - qualquer mensagem dos canais escolhidos na configuração;
 *  - respostas numa thread que já virou chamado.
 * Mensagens do próprio usuário numa conversa que já é chamado entram como
 * "saída", para a conversa ficar completa mesmo quando ele responde pelo Slack.
 *
 * Segurança: sem JWT (quem chama é o Slack), mas toda requisição precisa da
 * assinatura HMAC do Slack (secret SLACK_SIGNING_SECRET) e de timestamp
 * recente — sem isso a resposta é 401.
 *
 * Secrets: SLACK_SIGNING_SECRET, SLACK_USER_TOKEN (xoxp-, para ler nomes e
 * responder como você). Opcional: CHAMADOS_EMPRESA_ID.
 */
import { clienteServico, registrarEntrada } from "../_shared/chamados.ts";

const encoder = new TextEncoder();

async function assinaturaValida(req: Request, corpo: string): Promise<boolean> {
  const segredo = Deno.env.get("SLACK_SIGNING_SECRET");
  const ts = req.headers.get("X-Slack-Request-Timestamp") ?? "";
  const assinatura = req.headers.get("X-Slack-Signature") ?? "";
  if (!segredo || !ts || !assinatura) return false;
  // Rejeita requisições com mais de 5 minutos (proteção contra repetição).
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const chave = await crypto.subtle.importKey("raw", encoder.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", chave, encoder.encode(`v0:${ts}:${corpo}`)));
  const esperado = "v0=" + Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  if (esperado.length !== assinatura.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ assinatura.charCodeAt(i);
  return dif === 0;
}

// Cache simples de nomes (vale enquanto a instância da function estiver viva).
const nomes = new Map<string, string>();

async function slackApi(metodo: string, params: Record<string, string>) {
  const token = Deno.env.get("SLACK_USER_TOKEN") ?? Deno.env.get("SLACK_BOT_TOKEN") ?? "";
  const resp = await fetch(`https://slack.com/api/${metodo}?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return resp.json();
}

async function nomeUsuario(id: string): Promise<string> {
  if (nomes.has(id)) return nomes.get(id)!;
  try {
    const r = await slackApi("users.info", { user: id });
    const p = r?.user?.profile;
    const nome = p?.display_name || p?.real_name || r?.user?.real_name || r?.user?.name || id;
    nomes.set(id, nome);
    return nome;
  } catch {
    return id;
  }
}

async function nomeCanal(id: string, tipo: string): Promise<string> {
  if (tipo === "im") return "Mensagem direta";
  if (nomes.has(id)) return nomes.get(id)!;
  try {
    const r = await slackApi("conversations.info", { channel: id });
    const nome = r?.channel?.name ? `#${r.channel.name}` : tipo === "mpim" ? "Grupo direto" : id;
    nomes.set(id, nome);
    return nome;
  } catch {
    return id;
  }
}

/** Troca <@U123> por @Nome e <#C123|nome> por #nome. */
async function limparTexto(texto: string): Promise<string> {
  let t = texto || "";
  for (const m of [...t.matchAll(/<@([UW][A-Z0-9]+)>/g)]) t = t.replace(m[0], `@${await nomeUsuario(m[1])}`);
  t = t.replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1").replace(/<(https?:[^|>]+)\|([^>]+)>/g, "$2 ($1)").replace(/<(https?:[^>]+)>/g, "$1");
  return t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

const tsParaIso = (ts: string) => new Date(Number(ts) * 1000).toISOString();

// Subtipos que não são mensagem "de verdade" (edição, exclusão, entrada em canal...).
const SUBTIPOS_ACEITOS = new Set([undefined, "file_share", "thread_broadcast", "me_message"]);

async function processar(payload: Record<string, any>) {
  const ev = payload.event ?? {};
  if (ev.type !== "message" || !SUBTIPOS_ACEITOS.has(ev.subtype) || ev.bot_id || !ev.user) return;

  const db = clienteServico();

  // Empresa dona deste workspace do Slack.
  let { data: cfg } = await db
    .from("chamados_config")
    .select("empresa_id, slack_user_id, slack_canais, slack_team_id")
    .eq("slack_team_id", payload.team_id)
    .maybeSingle();
  if (!cfg) {
    const { data: todas } = await db.from("chamados_config").select("empresa_id, slack_user_id, slack_canais, slack_team_id");
    const fixa = Deno.env.get("CHAMADOS_EMPRESA_ID");
    cfg = (todas || []).find((c) => c.empresa_id === fixa) ?? ((todas || []).length === 1 ? todas![0] : null);
    // Primeiro evento do workspace: grava o team_id para as próximas vezes.
    if (cfg && !cfg.slack_team_id) await db.from("chamados_config").update({ slack_team_id: payload.team_id }).eq("empresa_id", cfg.empresa_id);
  }
  if (!cfg) return;

  const eu = cfg.slack_user_id as string | null;
  const tipo: string = ev.channel_type ?? "channel";
  const direta = tipo === "im" || tipo === "mpim";
  const raizThread: string = ev.thread_ts ?? ev.ts;
  const conversaId = direta ? `dm:${ev.channel}` : `th:${ev.channel}:${raizThread}`;
  const textoOriginal: string = ev.text ?? "";

  // Conversa já virou chamado? (respostas na thread continuam no mesmo chamado)
  const { data: existente } = await db
    .from("chamados")
    .select("id")
    .eq("empresa_id", cfg.empresa_id)
    .eq("origem", "slack")
    .eq("conversa_id", conversaId)
    .maybeSingle();

  const doProprioUsuario = !!eu && ev.user === eu;
  const mencionaUsuario = !!eu && textoOriginal.includes(`<@${eu}>`);
  const canalEscolhido = (cfg.slack_canais || []).includes(ev.channel);

  const texto = await limparTexto(textoOriginal);
  const anexos = (ev.files || []).map((f: any) => ({ nome: f.name || f.title, url: f.permalink, tipo: f.mimetype }));

  if (doProprioUsuario) {
    // Sua própria resposta pelo Slack: só registra se a conversa já é chamado.
    if (!existente) return;
    await db.from("chamado_mensagens").insert({
      chamado_id: existente.id,
      empresa_id: cfg.empresa_id,
      direcao: "saida",
      autor_nome: await nomeUsuario(ev.user),
      texto,
      externo_id: ev.ts,
      anexos,
      bruto: ev,
      created_at: tsParaIso(ev.ts),
    });
    await db.from("chamados").update({ ultima_mensagem_em: tsParaIso(ev.ts) }).eq("id", existente.id);
    return;
  }

  if (!(direta || mencionaUsuario || canalEscolhido || existente)) return;

  await registrarEntrada(db, {
    empresaId: cfg.empresa_id,
    origem: "slack",
    conversaId,
    canalNome: await nomeCanal(ev.channel, tipo),
    contatoNome: await nomeUsuario(ev.user),
    contatoId: ev.user,
    texto,
    externoId: ev.ts,
    anexos,
    bruto: ev,
    quando: tsParaIso(ev.ts),
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const corpo = await req.text();

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(corpo);
  } catch {
    return new Response("json inválido", { status: 400 });
  }

  if (!(await assinaturaValida(req, corpo))) return new Response("assinatura inválida", { status: 401 });

  // Verificação da URL ao configurar o app no Slack.
  if (payload.type === "url_verification") {
    return new Response(JSON.stringify({ challenge: payload.challenge }), { headers: { "Content-Type": "application/json" } });
  }

  if (payload.type === "event_callback") {
    // O Slack exige resposta em até 3s; o processamento segue em segundo plano.
    const tarefa = processar(payload).catch((e) => console.error("slack-eventos:", e));
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) rt.waitUntil(tarefa);
    else await tarefa;
  }
  return new Response("ok");
});
