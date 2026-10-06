/**
 * Responde um chamado pela origem dele.
 *  - Slack: posta na DM ou na thread do chamado com o Slack conectado de
 *    quem está respondendo (a resposta aparece com o nome dele). DM só pode
 *    ser respondida pelo dono do chamado — é a conversa particular dele.
 *  - ZapContábil: envia WhatsApp para o número do contato (mesma API e
 *    token do send-whatsapp).
 * A mensagem enviada é gravada como "saida" e o chamado passa para
 * "em atendimento".
 *
 * Exige usuário logado; o chamado é lido com o client do usuário, então o
 * RLS garante que só se responde chamado da própria empresa.
 */
import { autenticar, json, respostaPreflight } from "../_shared/auth.ts";
import { clienteServico } from "../_shared/chamados.ts";
import { slackPost } from "../_shared/slack.ts";

const ZAP_BASE = Deno.env.get("ZAPCONTABIL_BASE_URL") ?? "https://api-imperial.zapcontabil.chat";

async function enviarSlack(perfilId: string | null, chamado: { conversa_id: string; dono_id: string | null }, texto: string) {
  // dm:<canal>  ou  th:<canal>:<ts da thread>
  const [tipo, canal, thread] = chamado.conversa_id.split(":");
  if (tipo === "dm" && chamado.dono_id && chamado.dono_id !== perfilId) {
    throw new Error("Esta é uma mensagem direta de outro usuário: só o dono do chamado pode responder");
  }
  // Token lido com a service role: a coluna não é exposta ao navegador.
  const { data: conexao } = await clienteServico().from("slack_conexoes").select("access_token").eq("perfil_id", perfilId ?? "").maybeSingle();
  if (!conexao) throw new Error("Conecte o seu Slack (botão Meu Slack) para responder chamados do Slack");
  const corpo: Record<string, string> = { channel: canal, text: texto };
  if (tipo === "th" && thread) corpo.thread_ts = thread;
  const r = await slackPost(conexao.access_token, "chat.postMessage", corpo);
  if (!r.ok) throw new Error(r.error === "not_in_channel" || r.error === "channel_not_found" ? "Você não participa deste canal no Slack" : `Slack recusou: ${r.error}`);
  return String(r.ts);
}

async function enviarZap(numero: string, texto: string) {
  const token = Deno.env.get("ZAPCONTABIL_API_TOKEN");
  if (!token) throw new Error("ZAPCONTABIL_API_TOKEN não configurado");
  const connEnv = (Deno.env.get("ZAPCONTABIL_CONNECTION_ID") ?? "0").trim();
  const payload: Record<string, unknown> = { body: texto };
  if (connEnv !== "" && connEnv.toLowerCase() !== "none") payload.connectionFrom = Number(connEnv);
  const resp = await fetch(`${ZAP_BASE}/api/send/${numero}`, {
    method: "POST",
    headers: { accept: "application/json", Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const corpo = await resp.text();
  if (!resp.ok) throw new Error(`ZapContábil recusou (${resp.status}): ${corpo.slice(0, 200)}`);
  try {
    const j = JSON.parse(corpo);
    return String(j?.id ?? j?.message?.id ?? j?.data?.id ?? `zap-${Date.now()}`);
  } catch {
    return `zap-${Date.now()}`;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return respostaPreflight(req);
  const { auth, erro } = await autenticar(req);
  if (erro) return erro;

  try {
    const { chamado_id, texto } = (await req.json()) as { chamado_id?: string; texto?: string };
    const mensagem = (texto ?? "").trim();
    if (!chamado_id || !mensagem) return json(req, { error: "Informe o chamado e o texto" }, 400);
    if (mensagem.length > 4000) return json(req, { error: "Mensagem muito longa (máx. 4000 caracteres)" }, 400);

    const { data: chamado, error } = await auth.client
      .from("chamados")
      .select("id, empresa_id, origem, conversa_id, contato_id, status, dono_id")
      .eq("id", chamado_id)
      .maybeSingle();
    if (error || !chamado) return json(req, { error: "Chamado não encontrado" }, 404);

    const externoId =
      chamado.origem === "slack" ? await enviarSlack(auth.perfilId, chamado, mensagem) : await enviarZap(String(chamado.contato_id ?? "").replace(/\D/g, ""), mensagem);

    const { data: perfil } = await auth.client.from("usuario_perfil").select("nome, email").eq("id", auth.perfilId ?? "").maybeSingle();
    const agora = new Date().toISOString();
    // ON CONFLICT: o Slack também avisa a nossa própria mensagem pelo evento; se ele chegar antes, ignora.
    await auth.client.from("chamado_mensagens").upsert(
      {
        chamado_id: chamado.id,
        empresa_id: chamado.empresa_id,
        direcao: "saida",
        autor_nome: perfil?.nome || perfil?.email || "Você",
        texto: mensagem,
        externo_id: externoId,
        enviado_por: auth.perfilId,
        created_at: agora,
      },
      { onConflict: "chamado_id,externo_id", ignoreDuplicates: true },
    );
    // Service role: ultima_mensagem_em não é editável pela tela (o RLS já
    // conferiu acima que este usuário enxerga o chamado).
    await clienteServico()
      .from("chamados")
      .update({
        ultima_mensagem_em: agora,
        nao_lidas: 0,
        ...(chamado.status === "aberto" ? { status: "em_atendimento" } : {}),
      })
      .eq("id", chamado.id);

    return json(req, { ok: true });
  } catch (e) {
    console.error("chamados-responder:", e);
    return json(req, { error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
