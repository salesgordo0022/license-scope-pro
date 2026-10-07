/**
 * IA no atendimento dos Chamados (Groq).
 *
 *  POST { acao: "assumir", chamado_id, instrucoes }  (logado) → IA assume e manda a 1ª mensagem
 *  POST { acao: "parar", chamado_id }                (logado) → IA sai da conversa
 *  POST { acao: "processar", chamado_id, mensagem_id } ?token=<IA_TOKEN>
 *       (trigger do banco a cada mensagem do cliente) → IA responde
 *
 * A IA segue a orientação escrita pela equipe, explica ao cliente e pergunta
 * se ele entendeu. Entendeu → encerra o chamado. Não entendeu → explica de
 * outro jeito. Pediu uma pessoa, ficou irritado, fugiu do assunto ou passou do
 * limite de respostas → devolve para a equipe. Uma pessoa respondeu → o
 * trigger do banco desliga a IA.
 *
 * Chaves (integracao_segredos ou secrets): GROQ_API_KEY, opcional GROQ_MODEL.
 */
import { autenticar, json, respostaPreflight } from "../_shared/auth.ts";
import { clienteServico, emSegundoPlano, iguaisSeguro } from "../_shared/chamados.ts";
import { segredo } from "../_shared/segredos.ts";
import { slackPost } from "../_shared/slack.ts";
import { zapEnviarTexto } from "../_shared/zapcontabil.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const NOME_IA = "Assistente ImperTech";
const MAX_RESPOSTAS = 8;
const ESPERA_MS = 15_000; // junta mensagens seguidas do cliente numa resposta só
const MODELO_PADRAO = "llama-3.3-70b-versatile";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Chamado {
  id: string;
  empresa_id: string;
  origem: "slack" | "zapcontabil";
  conversa_id: string;
  contato_nome: string | null;
  contato_id: string | null;
  canal_nome: string | null;
  cliente_id: string | null;
  dono_id: string | null;
  status: string;
  ia_ativa: boolean;
  ia_instrucoes: string | null;
  ia_respostas: number;
}

interface Mensagem {
  id: string;
  direcao: "entrada" | "saida";
  autor_nome: string | null;
  texto: string;
  por_ia: boolean;
  created_at: string;
}

interface Decisao {
  resposta: string;
  acao: "continuar" | "finalizar" | "passar_humano";
  motivo: string;
}

// ------------------------------------------------------------------ Groq
async function chamarGroq(mensagens: { role: string; content: string }[]): Promise<string> {
  const chave = await segredo("GROQ_API_KEY");
  if (!chave) throw new Error("Chave do Groq não configurada (GROQ_API_KEY)");
  const modelo = (await segredo("GROQ_MODEL")) || MODELO_PADRAO;
  const pedir = async (comJson: boolean) => {
    const resp = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelo,
        messages: mensagens,
        temperature: 0.3,
        max_completion_tokens: 900,
        ...(comJson ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    const corpo = await resp.text();
    return { ok: resp.ok, status: resp.status, corpo };
  };
  let r = await pedir(true);
  // Modelo sem modo JSON: tenta de novo sem ele (a resposta ainda vem em JSON pelo prompt).
  if (!r.ok && r.status === 400 && /response_format|json/i.test(r.corpo)) r = await pedir(false);
  if (!r.ok) throw new Error(`Groq recusou (${r.status}): ${r.corpo.slice(0, 300)}`);
  return JSON.parse(r.corpo)?.choices?.[0]?.message?.content ?? "";
}

function lerDecisao(bruto: string): Decisao {
  const tentar = (t: string) => {
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  };
  const obj = tentar(bruto) ?? tentar(bruto.match(/\{[\s\S]*\}/)?.[0] ?? "");
  const resposta = String(obj?.resposta ?? (obj ? "" : bruto)).trim();
  const acao = ["continuar", "finalizar", "passar_humano"].includes(obj?.acao) ? obj.acao : "continuar";
  return { resposta, acao, motivo: String(obj?.motivo ?? "").slice(0, 300) };
}

function montarPrompt(c: Chamado, nomeCliente: string | null, historico: Mensagem[], primeira: boolean) {
  const canal = c.origem === "slack" ? "Slack" : "WhatsApp";
  const sistema = `Você é o ${NOME_IA}, assistente virtual do suporte da ImperTech (sistemas para empresas e escritórios de contabilidade).
Você está atendendo um chamado pelo ${canal} com ${c.contato_nome || "o cliente"}${nomeCliente ? `, da empresa ${nomeCliente}` : ""}.

ORIENTAÇÃO DA EQUIPE (sua fonte principal; siga à risca):
"""
${c.ia_instrucoes || "(sem orientação)"}
"""

Como atender:
- Português do Brasil, cordial e simples, como uma pessoa do suporte. Mensagens curtas de ${canal} (até umas 8 linhas). Quando houver passos, numere 1, 2, 3.
- ${primeira ? "Esta é a sua primeira mensagem: apresente-se como assistente virtual da ImperTech, diga que vai ajudar com o assunto e já explique." : "Continue a conversa a partir da última mensagem do cliente."}
- Depois de explicar, pergunte se ficou claro ou se deu certo.
- Se o cliente não entendeu ou não conseguiu, explique de outro jeito: mais simples, um passo por vez, perguntando onde ele travou. Não repita a mesma explicação.
- Não invente telas, menus, procedimentos, prazos, preços ou descontos que não estejam na orientação. Se faltar informação, passe para a equipe.
- Passe para a equipe (acao "passar_humano") se o cliente pedir para falar com uma pessoa, mostrar irritação, o assunto fugir da orientação, envolver cobrança/cancelamento/preço/prazo, ou se após algumas tentativas ele continuar sem conseguir. Nesse caso avise com gentileza que um atendente vai continuar.
- Finalize (acao "finalizar") quando o cliente confirmar que entendeu ou resolveu, ou agradecer encerrando. A resposta é uma despedida curta, colocando-se à disposição.
- Esta é a sua resposta número ${c.ia_respostas + 1} de no máximo ${MAX_RESPOSTAS}.

Responda SOMENTE com um objeto JSON, sem texto fora dele:
{"resposta": "mensagem para o cliente", "acao": "continuar" | "finalizar" | "passar_humano", "motivo": "frase curta explicando a decisão para a equipe"}`;

  const msgs: { role: string; content: string }[] = [{ role: "system", content: sistema }];
  for (const m of historico) {
    if (m.direcao === "entrada") msgs.push({ role: "user", content: m.texto || "(anexo)" });
    else if (m.por_ia) msgs.push({ role: "assistant", content: m.texto });
    else msgs.push({ role: "assistant", content: `(mensagem de ${m.autor_nome || "um atendente"} da equipe) ${m.texto}` });
  }
  if (primeira || msgs[msgs.length - 1].role !== "user") {
    msgs.push({ role: "user", content: "(Nota interna: você acabou de assumir este atendimento. Leia a conversa acima e mande agora a sua primeira mensagem ao cliente.)" });
  }
  return msgs;
}

// --------------------------------------------------------------- envio
async function enviarAoCliente(db: SupabaseClient, c: Chamado, texto: string): Promise<string> {
  if (c.origem === "zapcontabil") {
    const { data: cfg } = await db.from("chamados_config").select("zap_conexao_id").eq("empresa_id", c.empresa_id).maybeSingle();
    return zapEnviarTexto(String(c.contato_id ?? "").replace(/\D/g, ""), `*${NOME_IA} (IA):*\n${texto}`, cfg?.zap_conexao_id ?? null);
  }
  // Slack: sai pela conta do dono do chamado, identificada como assistente.
  const { data: conexao } = await db.from("slack_conexoes").select("access_token").eq("perfil_id", c.dono_id ?? "").maybeSingle();
  if (!conexao) throw new Error("O dono deste chamado não tem o Slack conectado");
  const [tipo, canal, thread] = c.conversa_id.split(":");
  const r = await slackPost(conexao.access_token, "chat.postMessage", {
    channel: canal,
    text: `🤖 *${NOME_IA}:* ${texto}`,
    ...(tipo === "th" && thread ? { thread_ts: thread } : {}),
  });
  if (!r.ok) throw new Error(`Slack recusou: ${r.error}`);
  return String(r.ts);
}

/** Gera e envia a próxima resposta da IA; aplica a decisão (continuar/finalizar/devolver). */
async function responder(db: SupabaseClient, chamadoId: string, primeira: boolean) {
  const { data: c } = await db.from("chamados").select("*").eq("id", chamadoId).maybeSingle();
  if (!c || !c.ia_ativa) return { ignorado: true };
  const chamado = c as Chamado;

  const [{ data: hist }, { data: cli }] = await Promise.all([
    db.from("chamado_mensagens").select("id, direcao, autor_nome, texto, por_ia, created_at").eq("chamado_id", chamadoId).order("created_at", { ascending: false }).limit(40),
    chamado.cliente_id ? db.from("clientes").select("nome_empresa").eq("id", chamado.cliente_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const historico = ((hist || []) as Mensagem[]).reverse();

  const decisao = lerDecisao(await chamarGroq(montarPrompt(chamado, cli?.nome_empresa ?? null, historico, primeira)));
  if (!decisao.resposta) throw new Error("A IA não devolveu resposta");

  const limite = chamado.ia_respostas + 1 >= MAX_RESPOSTAS && decisao.acao === "continuar";
  const texto = limite ? `${decisao.resposta}\n\nVou passar seu atendimento para a nossa equipe, que continua daqui. 😉` : decisao.resposta;

  const externoId = await enviarAoCliente(db, chamado, texto);
  const agora = new Date().toISOString();
  await db.from("chamado_mensagens").insert({
    chamado_id: chamado.id,
    empresa_id: chamado.empresa_id,
    direcao: "saida",
    autor_nome: `${NOME_IA} (IA)`,
    texto,
    externo_id: externoId,
    por_ia: true,
    created_at: agora,
  });

  const fim = decisao.acao === "finalizar";
  const devolve = decisao.acao === "passar_humano" || limite;
  await db
    .from("chamados")
    .update({
      ia_respostas: chamado.ia_respostas + 1,
      ultima_mensagem_em: agora,
      ...(fim
        ? { ia_ativa: false, ia_status: "finalizado", ia_motivo: decisao.motivo || "Cliente entendeu", status: "resolvido", nao_lidas: 0 }
        : devolve
          ? { ia_ativa: false, ia_status: "devolvido", ia_motivo: decisao.motivo || (limite ? "Limite de respostas da IA" : "IA pediu ajuda"), status: "aberto", nao_lidas: 1 }
          : { status: "em_atendimento", nao_lidas: 0 }),
    })
    .eq("id", chamado.id);
  return { acao: limite ? "passar_humano" : decisao.acao, resposta: texto };
}

// ----------------------------------------------------------------- rotas
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return respostaPreflight(req);
  const db = clienteServico();
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const acao = String(corpo.acao ?? "");
  const chamadoId = String(corpo.chamado_id ?? "");

  if (acao === "processar") {
    const token = new URL(req.url).searchParams.get("token") ?? "";
    if (!iguaisSeguro(token, (await segredo("IA_TOKEN")) ?? "")) return new Response("não autorizado", { status: 401 });
    const mensagemId = String(corpo.mensagem_id ?? "");
    emSegundoPlano(
      (async () => {
        await dormir(ESPERA_MS);
        // Só responde a partir da ÚLTIMA mensagem do cliente (mensagens seguidas viram uma resposta).
        const { data: ultima } = await db
          .from("chamado_mensagens")
          .select("id, direcao")
          .eq("chamado_id", chamadoId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!ultima || ultima.id !== mensagemId || ultima.direcao !== "entrada") return;
        try {
          await responder(db, chamadoId, false);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await db.from("chamados").update({ ia_ativa: false, ia_status: "devolvido", ia_motivo: `Erro da IA: ${msg.slice(0, 250)}`, nao_lidas: 1 }).eq("id", chamadoId);
          throw e;
        }
      })(),
      "ia-atendimento",
    );
    return json(req, { ok: true });
  }

  const { auth, erro } = await autenticar(req);
  if (erro) return erro;
  // O usuário precisa enxergar o chamado (RLS).
  const { data: visivel } = await auth.client.from("chamados").select("id").eq("id", chamadoId).maybeSingle();
  if (!visivel) return json(req, { error: "Chamado não encontrado" }, 404);

  try {
    if (acao === "assumir") {
      const instrucoes = String(corpo.instrucoes ?? "").trim();
      if (instrucoes.length < 10) return json(req, { error: "Escreva a orientação para a IA (o que explicar ao cliente)" }, 400);
      await db
        .from("chamados")
        .update({ ia_ativa: true, ia_instrucoes: instrucoes.slice(0, 4000), ia_status: "atendendo", ia_respostas: 0, ia_motivo: null, ia_assumida_por: auth.perfilId, status: "em_atendimento" })
        .eq("id", chamadoId);
      try {
        const r = await responder(db, chamadoId, true);
        return json(req, { ok: true, ...r });
      } catch (e) {
        await db.from("chamados").update({ ia_ativa: false, ia_status: "devolvido", ia_motivo: "Falha ao iniciar" }).eq("id", chamadoId);
        throw e;
      }
    }

    if (acao === "parar") {
      const { data: perfil } = await auth.client.from("usuario_perfil").select("nome, email").eq("id", auth.perfilId ?? "").maybeSingle();
      await db
        .from("chamados")
        .update({ ia_ativa: false, ia_status: "devolvido", ia_motivo: `Parada por ${perfil?.nome || perfil?.email || "atendente"}` })
        .eq("id", chamadoId);
      return json(req, { ok: true });
    }

    return json(req, { error: "Ação inválida" }, 400);
  } catch (e) {
    console.error("ia-atendimento:", e);
    return json(req, { error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
