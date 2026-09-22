import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { autenticar, json, respostaPreflight } from "../_shared/auth.ts";

/** Formato normalizado devolvido ao frontend, independente de qual API respondeu. */
interface DadosCnpj {
  razao_social: string;
  nome_fantasia: string;
  email: string;
  telefone: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
}

/** Aborta um fetch que demore demais, para a function não ficar presa numa API lenta. */
async function fetchComTimeout(url: string, init: RequestInit = {}, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Consulta a BrasilAPI (gratuita, sem token) e normaliza a resposta. */
async function consultarBrasilApi(digits: string): Promise<DadosCnpj | null> {
  const res = await fetchComTimeout(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
  if (!res.ok) return null;
  const raw = await res.json();
  return {
    razao_social: raw.razao_social || "",
    nome_fantasia: raw.nome_fantasia || "",
    email: raw.email || "",
    telefone: raw.ddd_telefone_1 || "",
    logradouro: raw.logradouro || "",
    numero: raw.numero || "",
    complemento: raw.complemento || "",
    bairro: raw.bairro || "",
    municipio: raw.municipio || "",
    uf: raw.uf || "",
    cep: raw.cep || "",
  };
}

/** Reserva usada quando a BrasilAPI falha ou está fora do ar. */
async function consultarReceitaWs(digits: string): Promise<DadosCnpj | null> {
  const res = await fetchComTimeout(`https://receitaws.com.br/v1/cnpj/${digits}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  const raw = await res.json();
  if (raw.status === "ERROR") return null;
  return {
    razao_social: raw.nome || "",
    nome_fantasia: raw.fantasia || "",
    email: raw.email || "",
    telefone: raw.telefone || "",
    logradouro: raw.logradouro || "",
    numero: raw.numero || "",
    complemento: raw.complemento || "",
    bairro: raw.bairro || "",
    municipio: raw.municipio || "",
    uf: raw.uf || "",
    cep: raw.cep || "",
  };
}

/**
 * Busca os dados cadastrais de um CNPJ para preencher o formulário de cliente.
 *
 * Exige usuário autenticado. Antes a function era pública: qualquer pessoa na
 * internet podia usá-la como proxy gratuito de consulta de CNPJ em massa,
 * queimando o rate limit dos provedores e derrubando a consulta para os
 * usuários reais do sistema.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return respostaPreflight(req);

  try {
    const { erro } = await autenticar(req);
    if (erro) return erro;

    const { cnpj } = await req.json();
    const digits = String(cnpj ?? "").replace(/\D/g, "");

    if (digits.length !== 14) {
      return json(req, { error: "CNPJ inválido" }, 400);
    }

    // Tenta os provedores em ordem; qualquer falha de rede cai para o próximo.
    let dados: DadosCnpj | null = null;
    for (const consultar of [consultarBrasilApi, consultarReceitaWs]) {
      try {
        dados = await consultar(digits);
        if (dados) break;
      } catch {
        // provedor indisponível — segue para a alternativa
      }
    }

    if (!dados) {
      return json(req, { error: "CNPJ não encontrado. Verifique se o número está correto." }, 404);
    }

    return json(req, dados);
  } catch (err) {
    console.error("[buscar-cnpj] erro:", err);
    return json(req, { error: "Erro interno ao buscar CNPJ" }, 500);
  }
});
