/**
 * Gravação das mensagens recebidas na caixa de Chamados.
 *
 * Usado pelas functions slack-eventos e zapcontabil-webhook. Ambas rodam sem
 * usuário logado (quem chama é o Slack/ZapContábil), por isso usam a service
 * role — a autenticidade da chamada é verificada antes, em cada function
 * (assinatura do Slack, token na URL do webhook do ZapContábil).
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export function clienteServico(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false },
  });
}

export interface MensagemRecebida {
  empresaId: string;
  origem: "slack" | "zapcontabil";
  conversaId: string;
  canalNome: string | null;
  contatoNome: string | null;
  contatoId: string | null;
  texto: string;
  externoId: string | null;
  anexos?: unknown[];
  bruto?: unknown;
  /** Momento da mensagem na origem (ISO); padrão: agora. */
  quando?: string;
}

/**
 * Abre (ou reaproveita) o chamado da conversa e grava a mensagem. Chamado
 * resolvido que recebe mensagem nova volta para "aberto". Mensagem repetida
 * (mesmo externo_id) é ignorada — Slack e webhooks reenviam em caso de erro.
 */
export async function registrarEntrada(db: SupabaseClient, m: MensagemRecebida) {
  const quando = m.quando ?? new Date().toISOString();
  const assunto = m.texto.replace(/\s+/g, " ").trim().slice(0, 120) || "(sem texto)";

  const { data: existente, error: erroBusca } = await db
    .from("chamados")
    .select("id, status, nao_lidas")
    .eq("empresa_id", m.empresaId)
    .eq("origem", m.origem)
    .eq("conversa_id", m.conversaId)
    .maybeSingle();
  if (erroBusca) throw erroBusca;

  let chamadoId = existente?.id as string | undefined;
  if (!chamadoId) {
    const { data: novo, error } = await db
      .from("chamados")
      .insert({
        empresa_id: m.empresaId,
        origem: m.origem,
        conversa_id: m.conversaId,
        canal_nome: m.canalNome,
        contato_nome: m.contatoNome,
        contato_id: m.contatoId,
        assunto,
        ultima_mensagem_em: quando,
        nao_lidas: 0,
      })
      .select("id")
      .single();
    if (error) {
      // Corrida: outra entrega criou o chamado ao mesmo tempo.
      const { data: outro } = await db
        .from("chamados")
        .select("id")
        .eq("empresa_id", m.empresaId)
        .eq("origem", m.origem)
        .eq("conversa_id", m.conversaId)
        .maybeSingle();
      if (!outro) throw error;
      chamadoId = outro.id;
    } else {
      chamadoId = novo.id;
    }
  }

  const { error: erroMsg } = await db.from("chamado_mensagens").insert({
    chamado_id: chamadoId,
    empresa_id: m.empresaId,
    direcao: "entrada",
    autor_nome: m.contatoNome,
    texto: m.texto,
    externo_id: m.externoId,
    anexos: m.anexos ?? [],
    bruto: m.bruto ?? null,
    created_at: quando,
  });
  // 23505 = mensagem já gravada (reentrega). Não conta de novo.
  if (erroMsg) {
    if ((erroMsg as { code?: string }).code === "23505") return { chamadoId, duplicada: true };
    throw erroMsg;
  }

  await db
    .from("chamados")
    .update({
      ultima_mensagem_em: quando,
      nao_lidas: (existente?.nao_lidas ?? 0) + 1,
      ...(existente?.status === "resolvido" ? { status: "aberto" } : {}),
      ...(m.contatoNome ? { contato_nome: m.contatoNome } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", chamadoId);

  return { chamadoId, duplicada: false };
}
