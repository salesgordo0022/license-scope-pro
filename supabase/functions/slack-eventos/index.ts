/**
 * Recebe os eventos do Slack (Events API) e transforma em Chamados — um
 * chamado por usuário conectado (slack_conexoes), com ele como dono.
 *
 * Para cada usuário conectado que enxerga a mensagem, vira chamado dele:
 *  - mensagem direta (DM ou grupo direto) para ele;
 *  - menção @ele em qualquer canal;
 *  - qualquer mensagem dos canais que ELE escolheu;
 *  - respostas numa conversa que já é chamado dele.
 * Mensagem escrita pelo próprio usuário numa conversa que já é chamado dele
 * entra como "saída" (ele respondeu direto pelo Slack).
 *
 * Segurança: sem JWT (quem chama é o Slack), mas toda requisição precisa da
 * assinatura HMAC do Slack (SLACK_SIGNING_SECRET) com timestamp recente.
 */
import { clienteServico, registrarMensagem } from "../_shared/chamados.ts";
import { assinaturaSlackValida, autorizacoesDoEvento, slackGet } from "../_shared/slack.ts";

interface Conexao {
  empresa_id: string;
  perfil_id: string;
  slack_team_id: string;
  slack_user_id: string;
  access_token: string;
  canais: string[];
}

// Cache de nomes (vale enquanto a instância da function estiver viva).
const nomes = new Map<string, string>();

async function nomeUsuario(token: string, id: string): Promise<string> {
  if (nomes.has(id)) return nomes.get(id)!;
  try {
    const r = await slackGet(token, "users.info", { user: id });
    const p = r?.user?.profile;
    const nome = p?.display_name || p?.real_name || r?.user?.real_name || r?.user?.name || id;
    nomes.set(id, nome);
    return nome;
  } catch {
    return id;
  }
}

async function nomeCanal(token: string, id: string, tipo: string): Promise<string> {
  if (tipo === "im") return "Mensagem direta";
  if (nomes.has(id)) return nomes.get(id)!;
  try {
    const r = await slackGet(token, "conversations.info", { channel: id });
    const nome = r?.channel?.name ? `#${r.channel.name}` : tipo === "mpim" ? "Grupo direto" : id;
    nomes.set(id, nome);
    return nome;
  } catch {
    return id;
  }
}

/** Troca <@U123> por @Nome, <#C123|nome> por #nome e desfaz os escapes. */
async function limparTexto(token: string, texto: string): Promise<string> {
  let t = texto || "";
  for (const id of new Set([...t.matchAll(/<@([UW][A-Z0-9]+)>/g)].map((m) => m[1]))) {
    t = t.replaceAll(`<@${id}>`, `@${await nomeUsuario(token, id)}`);
  }
  t = t.replace(/<#[A-Z0-9]+\|([^>]*)>/g, "#$1").replace(/<(https?:[^|>]+)\|([^>]+)>/g, "$2 ($1)").replace(/<(https?:[^>]+)>/g, "$1");
  return t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

const tsParaIso = (ts: string) => new Date(Number(ts) * 1000).toISOString();

// Subtipos que não são mensagem "de verdade" (edição, exclusão, entrada em canal...).
const SUBTIPOS_ACEITOS = new Set([undefined, "file_share", "thread_broadcast", "me_message"]);

// deno-lint-ignore no-explicit-any
async function processar(payload: Record<string, any>) {
  const ev = payload.event ?? {};
  const db = clienteServico();

  // Usuário removeu o app ou revogou o acesso: apaga as conexões dele.
  if (ev.type === "tokens_revoked") {
    const usuarios: string[] = ev.tokens?.oauth ?? [];
    if (usuarios.length) await db.from("slack_conexoes").delete().eq("slack_team_id", payload.team_id).in("slack_user_id", usuarios);
    return;
  }
  if (ev.type === "app_uninstalled") {
    await db.from("slack_conexoes").delete().eq("slack_team_id", payload.team_id);
    return;
  }

  if (ev.type !== "message" || !SUBTIPOS_ACEITOS.has(ev.subtype) || ev.bot_id || !ev.user) return;

  // Usuários conectados que enxergam esta mensagem.
  const autorizados = await autorizacoesDoEvento(payload);
  if (!autorizados.length) return;
  const { data } = await db
    .from("slack_conexoes")
    .select("empresa_id, perfil_id, slack_team_id, slack_user_id, access_token, canais")
    .eq("slack_team_id", payload.team_id)
    .in("slack_user_id", [...new Set(autorizados.map((a) => a.user_id))]);
  const conexoes = (data || []) as Conexao[];
  if (!conexoes.length) return;

  const token = conexoes[0].access_token; // qualquer um serve para ler nomes
  const tipo: string = ev.channel_type ?? "channel";
  const direta = tipo === "im" || tipo === "mpim";
  const conversaId = direta ? `dm:${ev.channel}` : `th:${ev.channel}:${ev.thread_ts ?? ev.ts}`;
  const textoOriginal: string = ev.text ?? "";
  const texto = await limparTexto(token, textoOriginal);
  const autor = await nomeUsuario(token, ev.user);
  const canalNome = await nomeCanal(token, ev.channel, tipo);
  const anexos = (ev.files || []).map((f: Record<string, string>) => ({ nome: f.name || f.title, url: f.permalink, tipo: f.mimetype }));
  const base = {
    origem: "slack" as const,
    conversaId,
    texto,
    externoId: String(ev.ts),
    anexos,
    bruto: ev,
    quando: tsParaIso(ev.ts),
  };

  for (const c of conexoes) {
    try {
      if (ev.user === c.slack_user_id) {
        // Ele mesmo respondeu pelo Slack: só registra se a conversa já é chamado dele.
        await registrarMensagem(db, { ...base, empresaId: c.empresa_id, donoId: c.perfil_id, direcao: "saida", autorNome: autor });
        continue;
      }
      const relevante = direta || textoOriginal.includes(`<@${c.slack_user_id}>`) || (c.canais || []).includes(ev.channel);
      await registrarMensagem(db, {
        ...base,
        empresaId: c.empresa_id,
        donoId: c.perfil_id,
        direcao: "entrada",
        canalNome,
        contatoNome: autor,
        contatoId: ev.user,
        // Resposta em thread de canal não escolhido: só entra se já é chamado.
        soExistente: !relevante,
      });
    } catch (e) {
      console.error("slack-eventos: conexão", c.perfil_id, e);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const corpo = await req.text();

  // deno-lint-ignore no-explicit-any
  let payload: Record<string, any>;
  try {
    payload = JSON.parse(corpo);
  } catch {
    return new Response("json inválido", { status: 400 });
  }

  if (!(await assinaturaSlackValida(req, corpo))) return new Response("assinatura inválida", { status: 401 });

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
