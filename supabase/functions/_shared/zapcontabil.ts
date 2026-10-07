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

// deno-lint-ignore no-explicit-any
export async function zapPost(caminho: string, corpoJson: Record<string, unknown>): Promise<any> {
  const resp = await fetch(`${ZAP_BASE}${caminho}`, {
    method: "POST",
    headers: { accept: "application/json", Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpoJson),
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

/** DDI+DDD+número. Números de 10/11 dígitos ganham o 55 (não usar startsWith("55"): DDDs do RS). */
export function normalizarNumero(telefone: string): string {
  const t = (telefone ?? "").replace(/\D/g, "");
  if (t.length === 12 || t.length === 13) return t;
  if (t.length === 10 || t.length === 11) return `55${t}`;
  return t.startsWith("55") ? t : `55${t}`;
}

/**
 * Envia um arquivo (PDF/imagem) como documento. Tenta multipart com o
 * binário e depois JSON { url }; cada um com e sem connectionFrom (algumas
 * contas recusam a conexão no endpoint de mídia). true = entregue como anexo.
 */
export async function zapEnviarDocumento(
  numero: string,
  arquivo: { bytes: Uint8Array; tipo: string; nome: string } | null,
  url: string | null,
  conexaoId: number | null,
): Promise<boolean> {
  const endpoint = `${ZAP_BASE}/api/send/document/${numero}`;
  const conexoes: (number | null)[] = conexaoId === null ? [null] : [conexaoId, null];
  const auth = { accept: "application/json", Authorization: `Bearer ${token()}` };
  if (arquivo) {
    for (const conn of conexoes) {
      const form = new FormData();
      form.append("media", new Blob([arquivo.bytes.slice().buffer as ArrayBuffer], { type: arquivo.tipo }), arquivo.nome);
      if (conn !== null) form.append("connectionFrom", String(conn));
      try {
        const r = await fetch(endpoint, { method: "POST", headers: auth, body: form });
        await r.text();
        if (r.ok) return true;
      } catch { /* tenta o próximo */ }
    }
  }
  if (url) {
    for (const conn of conexoes) {
      try {
        const r = await fetch(endpoint, {
          method: "POST",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify(conn === null ? { url } : { url, connectionFrom: conn }),
        });
        await r.text();
        if (r.ok) return true;
      } catch { /* tenta o próximo */ }
    }
  }
  return false;
}

/** Mesmo número com ou sem o 9º dígito: compara DDD + últimos 8 dígitos. */
function mesmoNumero(a: string, b: string): boolean {
  const x = normalizarNumero(a);
  const y = normalizarNumero(b);
  return x.slice(2, 4) === y.slice(2, 4) && x.slice(-8) === y.slice(-8);
}

export type SituacaoContato = "existe" | "nao_existe" | "criado" | "sem_whatsapp" | "desconhecido";

/** O número já está cadastrado como contato no ZapContábil? */
export async function zapContatoExiste(numero: string): Promise<{ existe: boolean | null; nome?: string }> {
  const n = normalizarNumero(numero);
  try {
    for (const busca of [n, n.slice(-8)]) {
      // "searchParam" e "search": versões diferentes da plataforma usam um ou outro.
      const r = await zapGet("/api/contacts", { searchParam: busca, search: busca, pageSize: "50" });
      const achado = lista(r, "contacts").find((c: Record<string, unknown>) => mesmoNumero(String(c.number ?? ""), n));
      if (achado) return { existe: true, nome: String(achado.name ?? "") };
    }
    return { existe: false };
  } catch {
    return { existe: null }; // não deu para consultar: segue o envio normalmente
  }
}

/**
 * Garante o contato no ZapContábil antes de enviar: se não existir, cadastra
 * com o nome do cliente. O próprio ZapContábil valida se o número tem
 * WhatsApp (e ajusta o 9º dígito).
 */
export async function zapGarantirContato(
  numero: string,
  nome: string,
  conexaoId: number | null = null,
): Promise<{ situacao: SituacaoContato; detalhe?: string }> {
  const n = normalizarNumero(numero);
  const consulta = await zapContatoExiste(n);
  if (consulta.existe === true) return { situacao: "existe" };
  if (consulta.existe === null) return { situacao: "desconhecido" };
  try {
    const resp = await fetch(`${ZAP_BASE}/api/contacts/`, {
      method: "POST",
      headers: { accept: "application/json", Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: (nome || n).slice(0, 100), number: n, ...(conexaoId !== null ? { connectionId: conexaoId } : {}) }),
    });
    const corpo = await resp.text();
    if (resp.ok) return { situacao: "criado" };
    if (/exist|duplic|já cadastrad/i.test(corpo)) return { situacao: "existe" };
    if (/whats|invalid|inválid|not.*(found|registered)|n[aã]o.*(existe|encontrad)/i.test(corpo)) return { situacao: "sem_whatsapp", detalhe: corpo.slice(0, 200) };
    return { situacao: "desconhecido", detalhe: `HTTP ${resp.status}: ${corpo.slice(0, 200)}` };
  } catch (e) {
    return { situacao: "desconhecido", detalhe: String(e).slice(0, 200) };
  }
}
