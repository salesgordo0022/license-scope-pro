/**
 * "Conectar meu Slack": cada usuário do sistema autoriza o app ImperTech
 * Chamados com a própria conta do Slack. A partir daí as DMs, menções e
 * canais escolhidos DELE viram chamados com ele como dono, e as respostas
 * dadas pela tela saem com o nome dele no Slack.
 *
 *  POST { acao: "iniciar", volta }  (usuário logado) → { url } do Slack
 *  POST { acao: "desconectar" }     (usuário logado) → revoga o token e apaga a conexão
 *  GET  ?code&state                 (retorno do Slack) → grava a conexão e volta para a tela
 *
 * O "state" é aleatório, vale 15 minutos, é de uso único e fica ligado ao
 * usuário que clicou — sem ele o retorno do Slack é recusado. A URL de volta
 * só pode ser de uma origem da allowlist (ALLOWED_ORIGINS), sem open redirect.
 *
 * Secrets: SLACK_CLIENT_ID, SLACK_CLIENT_SECRET.
 */
import { autenticar, json, origensPermitidas, respostaPreflight } from "../_shared/auth.ts";
import { clienteServico } from "../_shared/chamados.ts";
import { ESCOPOS_USUARIO, slackPost } from "../_shared/slack.ts";

const REDIRECT_URI = `${(Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "")}/functions/v1/slack-oauth`;

function voltaPermitida(volta: string): string | null {
  try {
    const u = new URL(volta);
    return origensPermitidas().includes(u.origin) ? u.toString() : null;
  } catch {
    return null;
  }
}

function redirecionar(volta: string, resultado: string) {
  const u = new URL(volta);
  u.searchParams.set("slack", resultado);
  return new Response(null, { status: 302, headers: { Location: u.toString() } });
}

async function retornoDoSlack(url: URL): Promise<Response> {
  const estado = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const db = clienteServico();

  // Uso único: apaga e devolve na mesma operação.
  const { data: registro } = await db.from("slack_oauth_estados").delete().eq("estado", estado).select("*").maybeSingle();
  if (!registro || new Date(registro.expira_em) < new Date()) {
    return new Response("Link de conexão expirado. Volte ao sistema e clique em Conectar meu Slack de novo.", { status: 400 });
  }
  if (url.searchParams.get("error") || !code) return redirecionar(registro.volta_url, "cancelado");

  const form = new URLSearchParams({
    client_id: Deno.env.get("SLACK_CLIENT_ID") ?? "",
    client_secret: Deno.env.get("SLACK_CLIENT_SECRET") ?? "",
    code,
    redirect_uri: REDIRECT_URI,
  });
  const r = await (await fetch("https://slack.com/api/oauth.v2.access", { method: "POST", body: form })).json();
  const usuario = r?.authed_user;
  if (!r?.ok || !usuario?.access_token || !usuario?.id) {
    console.error("slack-oauth: troca do code falhou", r?.error);
    return redirecionar(registro.volta_url, "erro");
  }

  let nome: string | null = null;
  try {
    const info = await (await fetch(`https://slack.com/api/users.info?user=${usuario.id}`, { headers: { Authorization: `Bearer ${usuario.access_token}` } })).json();
    nome = info?.user?.profile?.display_name || info?.user?.real_name || info?.user?.name || null;
  } catch {
    /* nome é só cosmético */
  }

  // A mesma conta do Slack não pode ficar ligada a dois usuários do sistema.
  await db.from("slack_conexoes").delete().eq("slack_team_id", r.team?.id).eq("slack_user_id", usuario.id).neq("perfil_id", registro.perfil_id);

  const { error } = await db.from("slack_conexoes").upsert(
    {
      empresa_id: registro.empresa_id,
      perfil_id: registro.perfil_id,
      slack_team_id: r.team?.id,
      slack_team_nome: r.team?.name ?? null,
      slack_user_id: usuario.id,
      slack_nome: nome,
      access_token: usuario.access_token,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "perfil_id" },
  );
  if (error) {
    console.error("slack-oauth: gravar conexão", error);
    return redirecionar(registro.volta_url, "erro");
  }
  return redirecionar(registro.volta_url, "ok");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return respostaPreflight(req);
  const url = new URL(req.url);
  if (req.method === "GET") return retornoDoSlack(url);

  const { auth, erro } = await autenticar(req);
  if (erro) return erro;
  if (!auth.perfilId || !auth.empresaId) return json(req, { error: "Usuário sem perfil/empresa" }, 403);

  const { acao, volta } = (await req.json().catch(() => ({}))) as { acao?: string; volta?: string };
  const db = clienteServico();

  if (acao === "iniciar") {
    const clientId = Deno.env.get("SLACK_CLIENT_ID");
    if (!clientId || !Deno.env.get("SLACK_CLIENT_SECRET")) return json(req, { error: "App do Slack não configurado (SLACK_CLIENT_ID/SECRET)" }, 500);
    const voltaOk = voltaPermitida(volta ?? "");
    if (!voltaOk) return json(req, { error: "Endereço de volta não permitido (ALLOWED_ORIGINS)" }, 400);

    const estado = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    await db.from("slack_oauth_estados").delete().lt("expira_em", new Date().toISOString());
    const { error } = await db.from("slack_oauth_estados").insert({ estado, perfil_id: auth.perfilId, empresa_id: auth.empresaId, volta_url: voltaOk });
    if (error) return json(req, { error: error.message }, 500);

    const destino = new URL("https://slack.com/oauth/v2/authorize");
    destino.searchParams.set("client_id", clientId);
    destino.searchParams.set("user_scope", ESCOPOS_USUARIO);
    destino.searchParams.set("redirect_uri", REDIRECT_URI);
    destino.searchParams.set("state", estado);
    return json(req, { url: destino.toString() });
  }

  if (acao === "desconectar") {
    const { data: conexao } = await db.from("slack_conexoes").select("id, access_token").eq("perfil_id", auth.perfilId).maybeSingle();
    if (conexao) {
      await slackPost(conexao.access_token, "auth.revoke", {}).catch(() => undefined);
      await db.from("slack_conexoes").delete().eq("id", conexao.id);
    }
    return json(req, { ok: true });
  }

  return json(req, { error: "Ação inválida" }, 400);
});
