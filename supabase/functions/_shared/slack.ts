/**
 * Utilitários do Slack para as functions de Chamados.
 *
 * Um único app do Slack (ImperTech Chamados) é instalado por CADA usuário do
 * sistema via OAuth (function slack-oauth). O token de cada um fica em
 * slack_conexoes.access_token — nunca em secret global.
 *
 * Secrets (ou tabela integracao_segredos): SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, SLACK_SIGNING_SECRET e,
 * recomendado, SLACK_APP_TOKEN (xapp-, escopo authorizations:read) para saber
 * TODOS os usuários conectados que enxergam uma mensagem.
 */
import { iguaisSeguro } from "./chamados.ts";
import { segredo } from "./segredos.ts";

/** Escopos de usuário pedidos no "Conectar meu Slack". */
export const ESCOPOS_USUARIO = [
  "im:history",
  "mpim:history",
  "channels:history",
  "groups:history",
  "im:read",
  "mpim:read",
  "channels:read",
  "groups:read",
  "users:read",
  "chat:write",
].join(",");

const encoder = new TextEncoder();

/** Verifica a assinatura HMAC do Slack e se o timestamp é recente (5 min). */
export async function assinaturaSlackValida(req: Request, corpo: string): Promise<boolean> {
  const segredoAssinatura = await segredo("SLACK_SIGNING_SECRET");
  const ts = req.headers.get("X-Slack-Request-Timestamp") ?? "";
  const assinatura = req.headers.get("X-Slack-Signature") ?? "";
  if (!segredoAssinatura || !ts || !assinatura) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const chave = await crypto.subtle.importKey("raw", encoder.encode(segredoAssinatura), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", chave, encoder.encode(`v0:${ts}:${corpo}`)));
  const esperado = "v0=" + Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  return iguaisSeguro(esperado, assinatura);
}

// deno-lint-ignore no-explicit-any
export async function slackGet(token: string, metodo: string, params: Record<string, string>): Promise<any> {
  const resp = await fetch(`https://slack.com/api/${metodo}?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return resp.json();
}

// deno-lint-ignore no-explicit-any
export async function slackPost(token: string, metodo: string, corpo: Record<string, unknown>): Promise<any> {
  const resp = await fetch(`https://slack.com/api/${metodo}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(corpo),
  });
  return resp.json();
}

/**
 * Usuários (team_id + user_id) que enxergam o evento. Com SLACK_APP_TOKEN
 * consulta a lista completa; sem ele, o Slack só manda UM na carga do evento
 * — aí uma mensagem num canal com vários usuários conectados chega para um só.
 */
export async function autorizacoesDoEvento(payload: Record<string, any>): Promise<{ team_id: string; user_id: string }[]> {
  const appToken = await segredo("SLACK_APP_TOKEN");
  const lista: { team_id: string; user_id: string }[] = [];
  if (appToken && payload.event_context) {
    let cursor = "";
    for (let pagina = 0; pagina < 20; pagina++) {
      const r = await slackPost(appToken, "apps.event.authorizations.list", {
        event_context: payload.event_context,
        ...(cursor ? { cursor } : {}),
      });
      if (!r?.ok) {
        console.error("apps.event.authorizations.list:", r?.error);
        break;
      }
      for (const a of r.authorizations || []) if (a.user_id && !a.is_bot) lista.push({ team_id: a.team_id, user_id: a.user_id });
      cursor = r.response_metadata?.next_cursor || "";
      if (!cursor) break;
    }
    if (lista.length) return lista;
  }
  for (const a of payload.authorizations || []) if (a.user_id && !a.is_bot) lista.push({ team_id: a.team_id ?? payload.team_id, user_id: a.user_id });
  return lista;
}
