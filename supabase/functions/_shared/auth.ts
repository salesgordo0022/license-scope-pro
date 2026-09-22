/**
 * Utilitários compartilhados pelas Edge Functions.
 *
 * Antes desta refatoração cada function repetia o mesmo bloco de CORS com
 * `Access-Control-Allow-Origin: "*"` e — pior — várias delas não verificavam
 * nenhum token, ficando abertas para qualquer pessoa na internet. Este módulo
 * centraliza as duas coisas: liberação de origem por allowlist e verificação
 * obrigatória do JWT do usuário logado.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/** Cabeçalhos de request que o navegador precisa poder enviar nas chamadas. */
const ALLOWED_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, " +
  "x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

/**
 * Lê a allowlist de origens do secret `ALLOWED_ORIGINS` (valores separados por
 * vírgula). Sem o secret configurado, só `localhost` é liberado — assim um
 * deploy esquecido falha fechado em vez de aceitar qualquer site.
 */
function origensPermitidas(): string[] {
  const bruto = Deno.env.get("ALLOWED_ORIGINS") ?? "";
  const lista = bruto
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return lista.length > 0 ? lista : ["http://localhost:8080", "http://localhost:5173"];
}

/**
 * Monta os cabeçalhos de CORS para a requisição recebida.
 *
 * Só devolve `Access-Control-Allow-Origin` quando a origem da chamada está na
 * allowlist. Origem desconhecida recebe a primeira origem configurada, o que
 * faz o navegador bloquear a leitura da resposta — o oposto do antigo `*`, que
 * permitia a qualquer página chamar estas funções com o cookie/token do
 * usuário logado.
 */
export function corsHeaders(req: Request): Record<string, string> {
  const permitidas = origensPermitidas();
  const origem = (req.headers.get("Origin") ?? "").replace(/\/$/, "");
  return {
    "Access-Control-Allow-Origin": permitidas.includes(origem) ? origem : permitidas[0],
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

/** Resposta padrão do preflight `OPTIONS` do CORS. */
export function respostaPreflight(req: Request): Response {
  return new Response("ok", { headers: corsHeaders(req) });
}

/**
 * Serializa um payload em JSON já com os cabeçalhos de CORS aplicados.
 *
 * O `status` é explícito porque as funções antigas devolviam erro com HTTP 200,
 * o que impedia o frontend (e qualquer monitoramento) de distinguir sucesso de
 * falha.
 */
export function json(req: Request, payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

/** Dados do usuário autenticado e do seu perfil na tabela `usuario_perfil`. */
export interface Autenticado {
  /** Client do Supabase agindo COMO o usuário (respeita RLS). */
  client: SupabaseClient;
  userId: string;
  perfilId: string | null;
  empresaId: string | null;
  tipo: string | null;
}

/**
 * Valida o header `Authorization` da requisição e carrega o perfil do usuário.
 *
 * Devolve `{ erro: Response }` pronto para ser retornado quando não há token
 * válido. Toda function que gasta recurso pago ou toca em dados do banco deve
 * chamar isto antes de qualquer outra coisa.
 */
export async function autenticar(
  req: Request,
): Promise<{ auth: Autenticado; erro: null } | { auth: null; erro: Response }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { auth: null, erro: json(req, { error: "Não autenticado" }, 401) };
  }

  const client = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    return { auth: null, erro: json(req, { error: "Sessão inválida" }, 401) };
  }

  // `maybeSingle` porque um usuário recém-criado pode ainda não ter perfil.
  const { data: perfil } = await client
    .from("usuario_perfil")
    .select("id, empresa_id, tipo")
    .eq("user_id", data.user.id)
    .maybeSingle();

  return {
    auth: {
      client,
      userId: data.user.id,
      perfilId: perfil?.id ?? null,
      empresaId: perfil?.empresa_id ?? null,
      tipo: perfil?.tipo ?? null,
    },
    erro: null,
  };
}

/** `true` quando o perfil é admin da própria empresa ou super admin global. */
export function ehAdmin(auth: Autenticado): boolean {
  return auth.tipo === "admin" || auth.tipo === "super_admin";
}

/**
 * Client com a service role (ignora RLS).
 *
 * Só deve ser usado DEPOIS de `autenticar()` e de checar manualmente que o
 * usuário tem direito ao recurso — a service role não aplica nenhuma policy.
 */
export function clientAdmin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}
