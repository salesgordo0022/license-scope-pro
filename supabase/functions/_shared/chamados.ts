/**
 * Gravação das mensagens na caixa de Chamados.
 *
 * Usado pelas functions slack-eventos e zapcontabil-webhook. Ambas rodam sem
 * usuário logado (quem chama é o Slack/ZapContábil), por isso usam a service
 * role — a autenticidade da chamada é verificada antes, em cada function
 * (assinatura do Slack, token na URL do webhook do ZapContábil).
 *
 * Toda a regra (achar o chamado ativo, reabrir ou abrir um novo, ignorar
 * repetidas, contar não lidas) fica na função SQL chamado_registrar, que roda
 * numa transação só — sem corrida entre entregas simultâneas.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export function clienteServico(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false },
  });
}

export interface MensagemChamado {
  empresaId: string;
  origem: "slack" | "zapcontabil";
  conversaId: string;
  /** Usuário dono do chamado (Slack). Nulo = fila comum da empresa (WhatsApp). */
  donoId: string | null;
  /** entrada = do contato; saida = resposta feita fora do sistema. */
  direcao: "entrada" | "saida";
  texto: string;
  externoId: string | null;
  autorNome?: string | null;
  canalNome?: string | null;
  contatoNome?: string | null;
  contatoId?: string | null;
  anexos?: unknown[];
  bruto?: unknown;
  /** Momento da mensagem na origem (ISO); padrão: agora. */
  quando?: string;
  /** true = só grava se a conversa já é chamado (não abre um novo). */
  soExistente?: boolean;
}

export async function registrarMensagem(db: SupabaseClient, m: MensagemChamado) {
  const { data, error } = await db.rpc("chamado_registrar", {
    p_empresa_id: m.empresaId,
    p_origem: m.origem,
    p_conversa_id: m.conversaId,
    p_dono_id: m.donoId,
    p_direcao: m.direcao,
    p_texto: m.texto,
    p_externo_id: m.externoId,
    p_autor_nome: m.autorNome ?? null,
    p_canal_nome: m.canalNome ?? null,
    p_contato_nome: m.contatoNome ?? null,
    p_contato_id: m.contatoId ?? null,
    p_anexos: m.anexos ?? [],
    p_bruto: m.bruto ?? null,
    p_quando: m.quando ?? null,
    p_so_existente: m.soExistente ?? false,
  });
  if (error) throw error;
  return data as { chamado_id?: string; novo?: boolean; duplicada?: boolean; ignorada?: boolean };
}

/** Comparação em tempo constante (tokens de webhook). */
export function iguaisSeguro(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}
