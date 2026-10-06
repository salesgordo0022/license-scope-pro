/**
 * Lê uma chave de integração: primeiro o secret da Edge Function; se não
 * houver, a tabela integracao_segredos (só service role). Assim dá para
 * configurar pelo SQL Editor quando o painel de Secrets não está disponível.
 */
import { clienteServico } from "./chamados.ts";

const cache = new Map<string, { valor: string | null; ate: number }>();

export async function segredo(nome: string): Promise<string | null> {
  const env = Deno.env.get(nome);
  if (env) return env;
  const c = cache.get(nome);
  if (c && c.ate > Date.now()) return c.valor;
  const { data } = await clienteServico().from("integracao_segredos").select("valor").eq("chave", nome).maybeSingle();
  const valor = data?.valor?.trim() || null;
  cache.set(nome, { valor, ate: Date.now() + 60_000 });
  return valor;
}
