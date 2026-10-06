/**
 * Cliente mínimo da API do ZapContábil (Swagger: <base>/swagger.json).
 * Secrets: ZAPCONTABIL_API_TOKEN; opcional ZAPCONTABIL_BASE_URL.
 */

export const ZAP_BASE = (Deno.env.get("ZAPCONTABIL_BASE_URL") ?? "https://api-imperial.zapcontabil.chat").replace(/\/$/, "");

function token(): string {
  const t = Deno.env.get("ZAPCONTABIL_API_TOKEN");
  if (!t) throw new Error("ZAPCONTABIL_API_TOKEN não configurado");
  return t;
}

// deno-lint-ignore no-explicit-any
export async function zapGet(caminho: string, params: Record<string, string> = {}): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const resp = await fetch(`${ZAP_BASE}${caminho}${qs ? `?${qs}` : ""}`, {
    headers: { accept: "application/json", Authorization: `Bearer ${token()}` },
  });
  const corpo = await resp.text();
  if (!resp.ok) throw new Error(`ZapContábil ${caminho} (${resp.status}): ${corpo.slice(0, 200)}`);
  return corpo ? JSON.parse(corpo) : null;
}

/** As listas vêm como array ou como { <chave>: [...] } (ex.: { messages, count }). */
// deno-lint-ignore no-explicit-any
export function lista(r: any, chave: string): any[] {
  if (Array.isArray(r)) return r;
  for (const k of [chave, "data", "rows", "items"]) if (Array.isArray(r?.[k])) return r[k];
  return [];
}

/** Envia texto para um número; devolve o id da mensagem criada no ZapContábil. */
export async function zapEnviarTexto(numero: string, texto: string, conexaoId: number | null): Promise<string> {
  const payload: Record<string, unknown> = { body: texto };
  if (conexaoId !== null) payload.connectionFrom = conexaoId;
  const resp = await fetch(`${ZAP_BASE}/api/send/${numero}`, {
    method: "POST",
    headers: { accept: "application/json", Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
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

/**
 * Assinatura igual à do ZapContábil quando o atendente responde pela
 * plataforma: "*Nome:*" na primeira linha.
 */
export const assinar = (nome: string, texto: string) => `*${nome.trim()}:*\n${texto}`;

/** Separa "*Nome:*\ntexto" em { autor, texto }. Sem assinatura, autor = null. */
export function separarAssinatura(corpo: string): { autor: string | null; texto: string } {
  const m = /^\*([^*\n]{1,80}):\*[ \t]*\n?/.exec(corpo ?? "");
  return m ? { autor: m[1].trim(), texto: corpo.slice(m[0].length) } : { autor: null, texto: corpo ?? "" };
}
