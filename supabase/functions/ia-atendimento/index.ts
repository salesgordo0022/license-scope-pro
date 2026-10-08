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
import { normalizarNumero, zapEnviarTexto, zapGarantirContato } from "../_shared/zapcontabil.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const NOME_IA = "Assistente ImperTech";
const MAX_RESPOSTAS = 8;
const ESPERA_MS = 15_000; // junta mensagens seguidas do cliente numa resposta só
const MODELO_PADRAO = "openai/gpt-oss-120b"; // o llama-3.3 saiu da lista do Groq
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
async function chamarGroq(mensagens: { role: string; content: string }[], modeloEscolhido?: string | null): Promise<string> {
  const chave = await segredo("GROQ_API_KEY");
  if (!chave) throw new Error("Chave do Groq não configurada (GROQ_API_KEY)");
  const modelo = modeloEscolhido || (await segredo("GROQ_MODEL")) || MODELO_PADRAO;
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

function montarPrompt(c: Chamado, nomeCliente: string | null, historico: Mensagem[], primeira: boolean, conhecimento = "") {
  const canal = c.origem === "slack" ? "Slack" : "WhatsApp";
  const sistema = `Você é o ${NOME_IA}, assistente virtual do suporte da ImperTech (sistemas para empresas e escritórios de contabilidade).
Você está atendendo um chamado pelo ${canal} com ${c.contato_nome || "o cliente"}${nomeCliente ? `, da empresa ${nomeCliente}` : ""}.

ORIENTAÇÃO DA EQUIPE (sua fonte principal; siga à risca):
"""
${c.ia_instrucoes || "(sem orientação específica: use só a base de conhecimento abaixo)"}
"""
${conhecimento ? `\nBASE DE CONHECIMENTO DA IMPERTECH (use quando ajudar; não invente além do que está aqui):\n"""\n${conhecimento}\n"""\n` : ""}
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
async function enviarAoCliente(db: SupabaseClient, c: Chamado, texto: string, _aviso = false): Promise<string> {
  if (c.origem === "zapcontabil") {
    const { data: cfg } = await db.from("chamados_config").select("zap_conexao_id").eq("empresa_id", c.empresa_id).maybeSingle();
    return zapEnviarTexto(String(c.contato_id ?? "").replace(/\D/g, ""), `*🧑‍💻 ${NOME_IA}:*\n${texto}`, cfg?.zap_conexao_id ?? null);
  }
  // Slack: sai pela conta do dono do chamado, identificada como assistente.
  const { data: conexao } = await db.from("slack_conexoes").select("access_token").eq("perfil_id", c.dono_id ?? "").maybeSingle();
  if (!conexao) throw new Error("O dono deste chamado não tem o Slack conectado");
  const [tipo, canal, thread] = c.conversa_id.split(":");
  const r = await slackPost(conexao.access_token, "chat.postMessage", {
    channel: canal,
    text: `🧑‍💻 *${NOME_IA}:* ${texto}`,
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

  const cfg = await carregarConfig(db, chamado.empresa_id);
  const ultimasDoCliente = historico.filter((m) => m.direcao === "entrada").slice(-3).map((m) => m.texto).join(" ");
  const conhecimento = await buscarConhecimento(db, chamado.empresa_id, `${chamado.ia_instrucoes ?? ""} ${ultimasDoCliente}`, cfg.usar_forum);
  const decisao = lerDecisao(await chamarGroq(montarPrompt(chamado, cli?.nome_empresa ?? null, historico, primeira, conhecimento), cfg.modelo));
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

// ------------------------------------------------------ painel / config
interface ConfigIA {
  empresa_id: string;
  alerta_fila_ativo: boolean;
  alerta_fila_limite: number;
  alerta_intervalo_min: number;
  alerta_fila_geral: boolean;
  alerta_conexao_id: number | null;
  aviso_demora_ativo: boolean;
  aviso_demora_min: number;
  aviso_demora_slack: boolean;
  aviso_demora_whatsapp: boolean;
  aviso_demora_texto: string;
  plantao_ia_ajuda: boolean;
  horario_dias: number[];
  horario_inicio: string;
  horario_fim: string;
  usar_forum: boolean;
  modelo: string | null;
}

const CONFIG_PADRAO: Omit<ConfigIA, "empresa_id"> = {
  alerta_fila_ativo: true,
  alerta_fila_limite: 5,
  alerta_intervalo_min: 60,
  alerta_fila_geral: true,
  alerta_conexao_id: null,
  aviso_demora_ativo: true,
  aviso_demora_min: 10,
  aviso_demora_slack: true,
  aviso_demora_whatsapp: false,
  aviso_demora_texto: "Oi {nome}! Recebemos sua mensagem. {atendente} está finalizando outro atendimento e já te responde. Obrigado pela paciência! 🙏",
  plantao_ia_ajuda: false,
  horario_dias: [1, 2, 3, 4, 5],
  horario_inicio: "08:00",
  horario_fim: "18:00",
  usar_forum: true,
  modelo: null,
};

async function carregarConfig(db: SupabaseClient, empresaId: string): Promise<ConfigIA> {
  const { data } = await db.from("ia_config").select("*").eq("empresa_id", empresaId).maybeSingle();
  return { ...CONFIG_PADRAO, empresa_id: empresaId, ...(data || {}) } as ConfigIA;
}

/** Agora está dentro do horário do plantão? (Brasília) */
type Horario = { horario_dias: number[]; horario_inicio: string; horario_fim: string };

function noHorario(cfg: Horario, agora = new Date()): boolean {
  const l = new Date(agora.getTime() - 3 * 3600_000);
  const dia = l.getUTCDay();
  const minutos = l.getUTCHours() * 60 + l.getUTCMinutes();
  const m = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  return (cfg.horario_dias || []).includes(dia) && minutos >= m(cfg.horario_inicio) && minutos < m(cfg.horario_fim);
}

const PALAVRAS_VAZIAS = new Set("a o e de da do das dos em no na nos nas um uma para por com que se não nao como meu minha seu sua isso esse essa ele ela eu voce você tem ter ja já mais muito bom boa dia tarde noite oi ola olá obrigado".split(" "));
const palavras = (t: string) =>
  [...new Set((t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]{3,}/g) ?? [])].filter((w) => !PALAVRAS_VAZIAS.has(w));
const semHtml = (h: string) => (h || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/**
 * Artigos da base (e posts resolvidos do Fórum) mais parecidos com o assunto:
 * conta palavras em comum, com peso maior no título e nas tags. Até ~6 mil
 * caracteres, para caber no pedido à IA.
 */
async function buscarConhecimento(db: SupabaseClient, empresaId: string, assunto: string, usarForum: boolean): Promise<string> {
  const alvo = palavras(assunto);
  if (!alvo.length) return "";
  const [{ data: base }, forum] = await Promise.all([
    db.from("ia_conhecimento").select("titulo, conteudo, tags").eq("empresa_id", empresaId).eq("ativo", true).limit(500),
    usarForum
      ? db.from("forum_posts").select("titulo, conteudo_html, tags").eq("empresa_id", empresaId).eq("status", "resolvido").limit(300)
      : Promise.resolve({ data: [] as { titulo: string; conteudo_html: string; tags: string[] }[] }),
  ]);
  const itens = [
    ...((base || []) as { titulo: string; conteudo: string; tags: string[] }[]).map((b) => ({ titulo: b.titulo, texto: b.conteudo, tags: b.tags || [], fonte: "Base" })),
    ...((forum.data || []) as { titulo: string; conteudo_html: string; tags: string[] }[]).map((f) => ({ titulo: f.titulo, texto: semHtml(f.conteudo_html), tags: f.tags || [], fonte: "Fórum" })),
  ];
  const pontuados = itens
    .map((it) => {
      const cab = new Set(palavras(`${it.titulo} ${it.tags.join(" ")}`));
      const corpo = new Set(palavras(it.texto));
      const pontos = alvo.reduce((s, w) => s + (cab.has(w) ? 3 : 0) + (corpo.has(w) ? 1 : 0), 0);
      return { ...it, pontos };
    })
    .filter((it) => it.pontos >= 2)
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, 4);
  let total = 0;
  const partes: string[] = [];
  for (const it of pontuados) {
    const trecho = `## ${it.titulo} (${it.fonte})\n${it.texto.slice(0, 2500)}`;
    if (total + trecho.length > 6000) break;
    partes.push(trecho);
    total += trecho.length;
  }
  return partes.join("\n\n");
}

// --------------------------------------------------------------- plantão
interface ChamadoAberto {
  id: string;
  empresa_id: string;
  origem: "slack" | "zapcontabil";
  conversa_id: string;
  contato_nome: string | null;
  contato_id: string | null;
  canal_nome: string | null;
  assunto: string | null;
  status: string;
  dono_id: string | null;
  responsavel_id: string | null;
  ia_ativa: boolean;
  aviso_demora_em: string | null;
  nao_lidas: number;
  created_at: string;
}

// ------------------------------------------------- contexto da conversa
interface MsgCurta {
  chamado_id: string;
  direcao: "entrada" | "saida";
  texto: string;
  anexos: unknown[] | null;
  created_at: string;
}

/** Palavras de quem só confirma/agradece ("ok", "entendi", "obrigado", "blz"...). */
const CONFIRMA = new Set(
  ("ok okk okay oks blz beleza certo certinho show top perfeito otimo excelente maravilha entendi entendido compreendi combinado " +
    "fechado valeu vlw obrigado obrigada obrigadao obg brigado brigada grato grata agradeco ta tah bom boa tudo bem de nada disponha " +
    "sim isso uhum aham joia massa ah entao muito mto demais tmj abraco abracos abs ate mais logo depois recebido recebi visto vi").split(" "),
);
const AUTOMATICA = /mensagem autom[aá]tica|resposta autom[aá]tica|retornaremos|responderemos (assim que|em breve)|fora do (hor[aá]rio|expediente)|no momento n[aã]o (estamos|estou|podemos)|agradecemos (o|seu) contato|este n[uú]mero n[aã]o recebe/i;

/** A mensagem só confirma/agradece, é um arquivo/imagem sem texto, ou é resposta automática? Devolve o motivo. */
function semPedido(m: { texto: string; anexos?: unknown[] | null }): string | null {
  const texto = (m.texto || "").trim();
  const temArquivo = Array.isArray(m.anexos) && m.anexos.length > 0;
  if (!texto || /^\((m[ií]dia|anexo)\)$/i.test(texto)) return temArquivo ? "o cliente só mandou um arquivo/imagem (ex.: comprovante)" : "mensagem sem texto";
  if (AUTOMATICA.test(texto)) return "mensagem automática do cliente";
  const palavrasMsg = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\p{Extended_Pictographic}|\p{Emoji_Component}/gu, " ")
    .match(/[a-z]+/g) ?? [];
  if (!palavrasMsg.length) return "o cliente só mandou um emoji";
  if (palavrasMsg.length <= 8 && palavrasMsg.every((w) => CONFIRMA.has(w))) return "o cliente só confirmou/agradeceu";
  return null;
}

/** Últimas mensagens de cada chamado (uma consulta para todos), da mais nova para a mais antiga. */
async function ultimasMensagens(db: SupabaseClient, ids: string[]): Promise<Map<string, MsgCurta[]>> {
  const mapa = new Map<string, MsgCurta[]>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await db
      .from("chamado_mensagens")
      .select("chamado_id, direcao, texto, anexos, created_at")
      .in("chamado_id", ids.slice(i, i + 100))
      .gte("created_at", new Date(Date.now() - 14 * 86400_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(3000);
    for (const m of (data || []) as MsgCurta[]) {
      const lista = mapa.get(m.chamado_id) ?? [];
      if (lista.length < 10) lista.push(m);
      mapa.set(m.chamado_id, lista);
    }
  }
  return mapa;
}

/** Pelas regras simples: o chamado está esperando a equipe? (última é do cliente e não é só "ok"/arquivo/automática) */
function esperandoEquipe(msgs: MsgCurta[] | undefined): { espera: boolean; motivo: string } {
  if (!msgs?.length) return { espera: false, motivo: "sem mensagens" };
  if (msgs[0].direcao === "saida") return { espera: false, motivo: "a última mensagem é da equipe (aguardando o cliente)" };
  const doCliente: MsgCurta[] = [];
  for (const m of msgs) {
    if (m.direcao !== "entrada") break;
    doCliente.push(m);
  }
  const motivos = doCliente.map((m) => semPedido(m));
  if (motivos.every(Boolean)) return { espera: false, motivo: motivos[0] as string };
  return { espera: true, motivo: "" };
}

/**
 * Precisa mesmo responder? Primeiro as regras simples; na dúvida, a IA lê a
 * conversa e decide (cliente que só confirmou, encerrou, mandou comprovante ou
 * já foi atendido não recebe "aguarde um pouco").
 */
async function precisaDeResposta(cfg: ConfigIA, msgs: MsgCurta[] | undefined): Promise<{ precisa: boolean; motivo: string }> {
  const regra = esperandoEquipe(msgs);
  if (!regra.espera) return { precisa: false, motivo: regra.motivo };
  const conversa = [...(msgs || [])]
    .reverse()
    .map((m) => `${m.direcao === "entrada" ? "Cliente" : "Equipe"}: ${(m.texto || "(arquivo)").slice(0, 400)}`)
    .join("\n");
  try {
    const bruto = await chamarGroq(
      [
        {
          role: "system",
          content:
            "Você analisa uma conversa de suporte técnico. Decida se a(s) última(s) mensagem(ns) do cliente pedem uma resposta da equipe AGORA. " +
            "Responda false quando o cliente só confirma, agradece, diz que entendeu, se despede, manda comprovante/arquivo sem pergunta, manda mensagem automática, " +
            "ou quando o assunto já foi resolvido. Responda true quando há pergunta, pedido, problema, reclamação ou o cliente está aguardando algo da equipe. " +
            'Responda só com JSON: {"precisa_resposta": true ou false, "motivo": "frase curta"}',
        },
        { role: "user", content: conversa },
      ],
      cfg.modelo,
    );
    const obj = JSON.parse(bruto.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    if (typeof obj?.precisa_resposta === "boolean") return { precisa: obj.precisa_resposta, motivo: String(obj.motivo ?? "").slice(0, 200) };
  } catch (e) {
    console.error("ia-plantao: contexto", e);
  }
  // Sem a IA: só avisa se houver pergunta clara.
  const ultima = msgs?.[0]?.texto || "";
  return { precisa: ultima.includes("?"), motivo: "decisão sem IA (pela pergunta na mensagem)" };
}

const minutosDesde = (iso: string) => Math.round((Date.now() - new Date(iso).getTime()) / 60000);
const tempo = (min: number) => (min < 60 ? `${min} min` : min < 1440 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}` : `${Math.floor(min / 1440)} dia(s)`);

/** Resumo de 1 linha por chamado, feito pela IA (se falhar, usa o assunto). */
async function resumir(db: SupabaseClient, cfg: ConfigIA, chamados: ChamadoAberto[]): Promise<Record<string, string>> {
  const resumos: Record<string, string> = {};
  for (const c of chamados) resumos[c.id] = (c.assunto || "").slice(0, 90);
  try {
    const blocos: string[] = [];
    for (const c of chamados.slice(0, 25)) {
      const { data } = await db.from("chamado_mensagens").select("direcao, texto").eq("chamado_id", c.id).order("created_at", { ascending: false }).limit(4);
      const conversa = ((data || []) as { direcao: string; texto: string }[]).reverse().map((m) => `${m.direcao === "entrada" ? "Cliente" : "Equipe"}: ${m.texto.slice(0, 300)}`).join("\n");
      blocos.push(`ID ${c.id} | ${c.contato_nome || c.contato_id}\n${conversa}`);
    }
    const bruto = await chamarGroq(
      [
        { role: "system", content: 'Para cada chamado de suporte, diga em UMA frase curta (até 15 palavras), em português, o que o cliente quer ou precisa. Responda só com JSON: {"resumos": {"<ID>": "frase"}}' },
        { role: "user", content: blocos.join("\n\n---\n\n") },
      ],
      cfg.modelo,
    );
    const obj = JSON.parse(bruto.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    for (const [id, frase] of Object.entries(obj?.resumos ?? {})) if (resumos[id] !== undefined && frase) resumos[id] = String(frase).slice(0, 140);
  } catch (e) {
    console.error("ia-plantao: resumo", e);
  }
  return resumos;
}

/** Fila do colaborador: responsável por ele, ou sem responsável e dele (Slack), ou fila geral (WhatsApp sem dono). */
function filaDe(perfilId: string, abertos: ChamadoAberto[], filaGeral: boolean) {
  return abertos.filter(
    (c) => c.responsavel_id === perfilId || (!c.responsavel_id && c.dono_id === perfilId) || (filaGeral && !c.responsavel_id && !c.dono_id),
  );
}

/** Preferências do colaborador ("Minha IA"); vazio = regra geral da empresa. */
interface Pessoa {
  perfil_id: string;
  whatsapp: string | null;
  receber_alertas: boolean;
  alerta_limite: number | null;
  alerta_intervalo_min: number | null;
  horario_dias: number[] | null;
  horario_inicio: string | null;
  horario_fim: string | null;
  aviso_demora_ativo: boolean | null;
  aviso_demora_min: number | null;
  aviso_demora_texto: string | null;
}

const horarioDe = (cfg: ConfigIA, p?: Pessoa | null): Horario => ({
  horario_dias: p?.horario_dias?.length ? p.horario_dias : cfg.horario_dias,
  horario_inicio: (p?.horario_inicio || cfg.horario_inicio).slice(0, 5),
  horario_fim: (p?.horario_fim || cfg.horario_fim).slice(0, 5),
});

async function carregarEquipe(db: SupabaseClient, empresaId: string) {
  const [{ data: equipe }, { data: nomes }] = await Promise.all([
    db.from("ia_equipe").select("*").eq("empresa_id", empresaId),
    db.from("usuario_perfil").select("id, nome, email").eq("empresa_id", empresaId),
  ]);
  const pessoas = new Map(((equipe || []) as Pessoa[]).map((p) => [p.perfil_id, p]));
  const nomeDe = (id: string | null) => {
    const n = ((nomes || []) as { id: string; nome: string | null; email: string | null }[]).find((x) => x.id === id);
    return (n?.nome || n?.email || "").split(/[ @]/)[0] || null;
  };
  return { pessoas, nomeDe };
}

/** Mensagem do alerta de fila: um item por chamado com o que o cliente quer. */
async function montarAlertaFila(db: SupabaseClient, cfg: ConfigIA, fila: ChamadoAberto[], primeiroNome: string | null) {
  const ordenados = [...fila].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const resumos = await resumir(db, cfg, ordenados);
  const linhas = ordenados.slice(0, 20).map((c, i) => {
    const min = minutosDesde(c.created_at);
    return `${i + 1}. *${c.contato_nome || c.contato_id}* (${c.origem === "slack" ? "Slack" : "WhatsApp"}, há ${tempo(min)})${min >= 60 ? " 🔴" : ""}\n   ${resumos[c.id] || "sem resumo"}`;
  });
  return (
    `📋 *${primeiroNome || "Olá"}, você está com ${fila.length} chamado(s) em aberto:*\n\n${linhas.join("\n")}` +
    (fila.length > 20 ? `\n… e mais ${fila.length - 20}.` : "") +
    `\n\n🔴 = esperando há mais de 1 hora\nAbrir: https://license-scope-pro.lovable.app/chamados`
  );
}

async function enviarAlerta(db: SupabaseClient, cfg: ConfigIA, perfilId: string, fone: string, texto: string, quantidade: number, tipo = "fila") {
  let status = "enviado";
  let erro: string | null = null;
  // Número como o WhatsApp espera (55 + DDD + número) e cadastrado como contato no ZapContábil.
  fone = normalizarNumero(fone);
  try {
    const contato = await zapGarantirContato(fone, "Equipe ImperTech", cfg.alerta_conexao_id);
    if (contato.situacao === "sem_whatsapp") throw new Error(`O número ${fone} não tem WhatsApp. Confira o número cadastrado (com DDD).`);
    await zapEnviarTexto(fone, texto, cfg.alerta_conexao_id);
  } catch (e) {
    status = "erro";
    erro = (e instanceof Error ? e.message : String(e)).slice(0, 400);
  }
  await db.from("ia_alertas").insert({ empresa_id: cfg.empresa_id, tipo, perfil_id: perfilId, quantidade, destino: fone, mensagem: texto, status, erro });
  return { status, erro };
}

async function alertaDeFila(db: SupabaseClient, cfg: ConfigIA, abertos: ChamadoAberto[], equipe: Awaited<ReturnType<typeof carregarEquipe>>) {
  // O lembrete conta TODOS os chamados em aberto (a checagem de contexto é só do aviso de demora).
  for (const pessoa of equipe.pessoas.values()) {
    if (!pessoa.receber_alertas) continue;
    const fone = (pessoa.whatsapp || "").replace(/\D/g, "");
    if (fone.length < 10) continue;
    if (!noHorario(horarioDe(cfg, pessoa))) continue;
    const limite = pessoa.alerta_limite ?? cfg.alerta_fila_limite;
    const intervalo = pessoa.alerta_intervalo_min ?? cfg.alerta_intervalo_min;
    const fila = filaDe(pessoa.perfil_id, abertos, cfg.alerta_fila_geral);
    if (fila.length < limite) continue;

    // No máximo 1 alerta por intervalo, a não ser que a fila tenha crescido bastante.
    const { data: ultimo } = await db
      .from("ia_alertas")
      .select("quantidade, created_at")
      .eq("perfil_id", pessoa.perfil_id)
      .eq("tipo", "fila")
      .eq("status", "enviado")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ultimo && minutosDesde(ultimo.created_at) < intervalo && fila.length < (ultimo.quantidade ?? 0) + Math.max(3, Math.ceil(limite / 2))) continue;

    const texto = await montarAlertaFila(db, cfg, fila, equipe.nomeDe(pessoa.perfil_id));
    await enviarAlerta(db, cfg, pessoa.perfil_id, fone, texto, fila.length);
  }
}

async function avisoDeDemora(db: SupabaseClient, cfg: ConfigIA, abertos: ChamadoAberto[], equipe: Awaited<ReturnType<typeof carregarEquipe>>, ultimas: Map<string, MsgCurta[]>) {
  for (const c of abertos) {
    if (c.ia_ativa) continue;
    if (c.origem === "slack" ? !cfg.aviso_demora_slack : !cfg.aviso_demora_whatsapp) continue;
    // Quem atende este chamado manda nas regras dele ("Minha IA").
    const donoId = c.responsavel_id ?? c.dono_id;
    const pessoa = donoId ? equipe.pessoas.get(donoId) : undefined;
    if ((pessoa?.aviso_demora_ativo ?? cfg.aviso_demora_ativo) === false) continue;
    if (!noHorario(horarioDe(cfg, pessoa))) continue;
    const limiteMin = pessoa?.aviso_demora_min ?? cfg.aviso_demora_min;

    // Quem atende já abriu o chamado e viu a mensagem: não precisa avisar.
    if ((c.nao_lidas ?? 0) === 0) continue;
    const msgs = ultimas.get(c.id);
    const ultima = msgs?.[0];
    if (!ultima || ultima.direcao !== "entrada") continue; // já responderam
    if (minutosDesde(ultima.created_at) < limiteMin) continue;
    if (minutosDesde(ultima.created_at) > 24 * 60) continue; // conversa antiga: não acorda
    if (c.aviso_demora_em && c.aviso_demora_em >= ultima.created_at) continue; // já avisou nesta espera

    // Marca antes de enviar: duas rodadas seguidas não avisam duas vezes.
    const { data: pegou } = await db.from("chamados").update({ aviso_demora_em: new Date().toISOString() }).eq("id", c.id).or(`aviso_demora_em.is.null,aviso_demora_em.lt."${ultima.created_at}"`).select("id");
    if (!pegou?.length) continue;

    // O cliente está mesmo esperando? ("ok", "entendi", comprovante, mensagem automática → não)
    const contexto = await precisaDeResposta(cfg, msgs);
    if (!contexto.precisa) {
      await db.from("ia_alertas").insert({ empresa_id: cfg.empresa_id, tipo: "demora", perfil_id: donoId, chamado_id: c.id, destino: c.contato_nome || c.contato_id, mensagem: `Não precisou avisar: ${contexto.motivo}`, status: "ignorado" });
      continue;
    }

    const atendente = equipe.nomeDe(c.responsavel_id) || equipe.nomeDe(c.dono_id) || "Nossa equipe";
    const contato = (c.contato_nome || "").split(" ")[0] || "tudo bem";
    const modelo = pessoa?.aviso_demora_texto?.trim() || cfg.aviso_demora_texto;
    try {
      if (cfg.plantao_ia_ajuda) {
        // A IA avisa da espera e já tenta ajudar com a base de conhecimento.
        await db
          .from("chamados")
          .update({
            ia_ativa: true,
            ia_status: "atendendo",
            ia_respostas: 0,
            ia_motivo: null,
            ia_instrucoes: `PLANTÃO: ${atendente} está ocupado. Comece avisando com educação que ${atendente} vai responder em breve. Depois pergunte se pode ir ajudando e tente resolver usando SOMENTE a base de conhecimento. Se não encontrar a resposta, diga que ${atendente} vai continuar o atendimento e passe para a equipe.`,
          })
          .eq("id", c.id);
        await responder(db, c.id, true);
      } else {
        const texto = modelo.replace(/\{nome\}/g, contato).replace(/\{atendente\}/g, atendente);
        const externoId = await enviarAoCliente(db, c as unknown as Chamado, texto, true);
        await db.from("chamado_mensagens").insert({
          chamado_id: c.id,
          empresa_id: c.empresa_id,
          direcao: "saida",
          autor_nome: `${NOME_IA} (IA)`,
          texto,
          externo_id: externoId,
          por_ia: true,
          aviso: true,
        });
      }
      await db.from("ia_alertas").insert({ empresa_id: cfg.empresa_id, tipo: "demora", perfil_id: donoId, chamado_id: c.id, destino: c.contato_nome || c.contato_id, mensagem: cfg.plantao_ia_ajuda ? "Aviso de demora + IA ajudando" : "Aviso de demora", status: "enviado" });
    } catch (e) {
      await db.from("ia_alertas").insert({ empresa_id: cfg.empresa_id, tipo: "demora", perfil_id: donoId, chamado_id: c.id, destino: c.contato_nome || c.contato_id, status: "erro", erro: (e instanceof Error ? e.message : String(e)).slice(0, 400) });
    }
  }
}

const COLUNAS_ABERTOS = "id, empresa_id, origem, conversa_id, contato_nome, contato_id, canal_nome, assunto, status, dono_id, responsavel_id, ia_ativa, aviso_demora_em, nao_lidas, created_at";

async function chamadosAbertos(db: SupabaseClient, empresaId: string) {
  const { data } = await db.from("chamados").select(COLUNAS_ABERTOS).eq("empresa_id", empresaId).not("status", "in", "(resolvido,dispensado)").limit(500);
  return (data || []) as ChamadoAberto[];
}

async function plantao(db: SupabaseClient) {
  const { data: empresas } = await db.from("ia_config").select("empresa_id");
  for (const { empresa_id } of (empresas || []) as { empresa_id: string }[]) {
    const cfg = await carregarConfig(db, empresa_id);
    const [abertos, equipe] = await Promise.all([chamadosAbertos(db, empresa_id), carregarEquipe(db, empresa_id)]);
    const ultimas = await ultimasMensagens(db, abertos.map((c) => c.id));
    if (cfg.aviso_demora_ativo || [...equipe.pessoas.values()].some((p) => p.aviso_demora_ativo)) await avisoDeDemora(db, cfg, abertos, equipe, ultimas);
    if (cfg.alerta_fila_ativo) await alertaDeFila(db, cfg, abertos, equipe);
  }
}

// ----------------------------------------------------------------- rotas
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return respostaPreflight(req);
  const db = clienteServico();
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const acao = String(corpo.acao ?? "");
  const chamadoId = String(corpo.chamado_id ?? "");

  if (acao === "plantao") {
    const token = new URL(req.url).searchParams.get("token") ?? "";
    if (!iguaisSeguro(token, (await segredo("IA_TOKEN")) ?? "")) return new Response("não autorizado", { status: 401 });
    emSegundoPlano(plantao(db), "ia-plantao");
    return json(req, { ok: true });
  }

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
  if (acao !== "teste_alerta") {
    const { data: visivel } = await auth.client.from("chamados").select("id").eq("id", chamadoId).maybeSingle();
    if (!visivel) return json(req, { error: "Chamado não encontrado" }, 404);
  }

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

    if (acao === "teste_alerta") {
      // Manda agora, para o WhatsApp de quem pediu, o resumo dos chamados abertos dele.
      if (!auth.empresaId || !auth.perfilId) return json(req, { error: "Usuário sem empresa" }, 403);
      const cfg = await carregarConfig(db, auth.empresaId);
      const equipe = await carregarEquipe(db, auth.empresaId);
      const pessoa = equipe.pessoas.get(auth.perfilId);
      const fone = (pessoa?.whatsapp || "").replace(/\D/g, "");
      if (fone.length < 10) return json(req, { error: "Cadastre e salve o seu WhatsApp primeiro" }, 400);
      const fila = filaDe(auth.perfilId, await chamadosAbertos(db, auth.empresaId), cfg.alerta_fila_geral);
      const texto = fila.length
        ? await montarAlertaFila(db, cfg, fila, equipe.nomeDe(auth.perfilId))
        : `✅ ${equipe.nomeDe(auth.perfilId) || "Olá"}, você não tem chamados em aberto agora. Os alertas da IA estão funcionando.`;
      const r = await enviarAlerta(db, cfg, auth.perfilId, fone, texto, fila.length, "teste");
      if (r.status !== "enviado") return json(req, { error: r.erro || "Falha ao enviar" }, 502);
      return json(req, { ok: true, quantidade: fila.length });
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
