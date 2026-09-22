// Interpretação do texto de boletos e identificação do cliente (lógica pura,
// sem dependência do navegador — testável em Bun/Node).
//
// Extrai do texto do PDF os dados que permitem identificar o cliente
// (CNPJ/CPF/telefone/nome do pagador) e montar a mensagem (valor, vencimento,
// linha digitável). Boletos escaneados (sem camada de texto) retornam texto
// vazio e caem para a identificação pelo nome do arquivo.

export interface DadosBoleto {
  texto: string;
  cnpjs: string[];
  cpfs: string[];
  telefones: string[];
  valor: number | null;
  vencimento: string | null; // dd/mm/aaaa
  linhaDigitavel: string | null; // 47 dígitos, sem formatação
  trechoPagador: string | null;
}

export interface ClienteIdentificavel {
  id: string;
  nome_empresa: string;
  telefone: string | null;
  cnpj: string | null;
  cpf_dono?: string | null;
  nome_dono?: string | null;
}

export type CriterioMatch =
  | "pdf-cnpj"
  | "pdf-cpf"
  | "pdf-nome"
  | "pdf-telefone"
  | "arquivo-telefone"
  | "arquivo-cnpj"
  | "arquivo-nome";

export interface ResultadoMatch<C extends ClienteIdentificavel = ClienteIdentificavel> {
  cliente: C;
  criterio: CriterioMatch;
  confianca: "alta" | "media" | "baixa";
}

export const CRITERIO_LABEL: Record<CriterioMatch, string> = {
  "pdf-cnpj": "CNPJ no boleto",
  "pdf-cpf": "CPF no boleto",
  "pdf-nome": "Nome no boleto",
  "pdf-telefone": "Telefone no boleto",
  "arquivo-telefone": "Telefone no nome do arquivo",
  "arquivo-cnpj": "CNPJ no nome do arquivo",
  "arquivo-nome": "Nome no nome do arquivo",
};

export const onlyDigits = (s: string | null | undefined) => (s || "").replace(/\D/g, "");

/** Reduz um texto a letras e dígitos minúsculos sem acento, para comparação. */
export function normalizeToken(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

// Remove sufixos societários que atrapalham o casamento por nome
// ("ACME COMERCIO LTDA" x "ACME Comércio").
function normalizeNome(s: string) {
  return normalizeToken(
    s.replace(/\b(ltda|me|epp|eireli|s\/?a|sa|cia|comercio|comercial|servicos|industria)\b\.?/gi, " ")
  );
}

/** Remove duplicatas preservando a ordem de aparição. */
function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

/** Lê um valor no formato brasileiro ("1.234,56") e devolve o número. */
function parseValorBr(s: string): number | null {
  const m = s.match(/(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})/);
  if (!m) return null;
  const v = Number(m[1].replace(/\./g, "") + "." + m[2]);
  return Number.isFinite(v) ? v : null;
}

/** Formata a data em dd/mm/aaaa usando UTC (evita deslocar o dia por fuso). */
function formatData(d: Date) {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

// Fator de vencimento (FEBRABAN): 1000 = 03/07/2000 ... 9999 = 21/02/2025;
// reinicia em 1000 = 22/02/2025. Escolhe a data mais próxima de hoje.
function dataDoFator(fator: number): Date | null {
  if (fator < 1000) return null;
  const base1 = Date.UTC(2000, 6, 3);
  const base2 = Date.UTC(2025, 1, 22);
  const d1 = base1 + (fator - 1000) * 86400000;
  const d2 = base2 + (fator - 1000) * 86400000;
  const hoje = Date.now();
  const escolhido = Math.abs(d1 - hoje) <= Math.abs(d2 - hoje) ? d1 : d2;
  return new Date(escolhido);
}

/** Localiza a linha digitável de 47 dígitos, com ou sem separadores impressos. */
function extrairLinhaDigitavel(texto: string): string | null {
  // Formato impresso: 00000.00000 00000.000000 00000.000000 0 00000000000000
  const m = texto.match(
    /\d{5}\.?\s?\d{5}\s+\d{5}\.?\s?\d{6}\s+\d{5}\.?\s?\d{6}\s+\d\s+\d{14}/
  );
  if (m) {
    const d = onlyDigits(m[0]);
    if (d.length === 47) return d;
  }
  // Sem separadores (alguns geradores imprimem tudo junto)
  const runs = texto.match(/\d{47}/g);
  if (runs && runs.length > 0) return runs[0];
  return null;
}

/** Devolve os N caracteres seguintes à primeira ocorrência de um rótulo. */
function trechoApos(texto: string, rotulo: RegExp, tamanho: number): string | null {
  const m = rotulo.exec(texto);
  if (!m) return null;
  return texto.slice(m.index + m[0].length, m.index + m[0].length + tamanho);
}

/**
 * Extrai do texto do boleto tudo que serve para identificar o cliente e
 * montar a mensagem: CNPJ/CPF, telefone, nome do pagador, valor, vencimento e
 * linha digitável.
 */
export function analisarBoleto(texto: string): DadosBoleto {
  const t = texto || "";
  const cnpjs = unique(
    (t.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) || [])
      .map(onlyDigits)
      .filter((d) => d.length === 14)
  );
  const cpfs = unique(
    (t.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/g) || [])
      .map(onlyDigits)
      .filter((d) => d.length === 11)
  );
  const telefones = unique(
    (t.match(/\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/g) || [])
      .map(onlyDigits)
      .filter((d) => d.length === 10 || d.length === 11)
      // descarta CPFs desformatados e outros números que casem por acaso
      .filter((d) => !cpfs.includes(d))
  );

  const linhaDigitavel = extrairLinhaDigitavel(t);

  let vencimento: string | null = null;
  let valor: number | null = null;

  const trechoVenc = trechoApos(t, /vencimento/i, 140);
  const dataVenc = trechoVenc?.match(/\d{2}\/\d{2}\/\d{4}/);
  if (dataVenc) vencimento = dataVenc[0];

  const trechoValor =
    trechoApos(t, /valor\s+do\s+documento/i, 140) ??
    trechoApos(t, /valor\s+cobrado/i, 140) ??
    trechoApos(t, /\bvalor\b/i, 140);
  if (trechoValor) {
    // "Valor do Documento" costuma ter "(=)" ou "R$" antes do número
    const m = trechoValor.match(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})/);
    if (m) valor = parseValorBr(m[1]);
  }

  // A linha digitável é a fonte mais confiável: posições 34-37 = fator de
  // vencimento, 38-47 = valor em centavos.
  if (linhaDigitavel) {
    const fator = Number(linhaDigitavel.slice(33, 37));
    const centavos = Number(linhaDigitavel.slice(37, 47));
    if (!vencimento) {
      const d = dataDoFator(fator);
      if (d) vencimento = formatData(d);
    }
    if ((valor === null || valor === 0) && centavos > 0) valor = centavos / 100;
  }

  const trechoPagador =
    trechoApos(t, /pagador\s*:?/i, 400) ?? trechoApos(t, /sacado\s*:?/i, 400);

  return { texto: t, cnpjs, cpfs, telefones, valor, vencimento, linhaDigitavel, trechoPagador };
}

/** Tenta casar o pagador do boleto com um cliente pelo nome normalizado. */
function matchPorNome<C extends ClienteIdentificavel>(
  alvo: string,
  clientes: C[],
  minLen: number
): C | null {
  const norm = normalizeToken(alvo);
  const normSemSufixo = normalizeNome(alvo);
  let best: C | null = null;
  let bestLen = 0;
  for (const c of clientes) {
    const candidatos = [c.nome_empresa, c.nome_dono || ""]
      .filter(Boolean)
      .flatMap((n) => [normalizeToken(n), normalizeNome(n)])
      .filter((n) => n.length >= minLen);
    for (const n of candidatos) {
      if ((norm.includes(n) || normSemSufixo.includes(n)) && n.length > bestLen) {
        best = c;
        bestLen = n.length;
      }
    }
  }
  return best;
}

/**
 * Identifica o cliente do boleto. Ordem de prioridade (da mais para a menos
 * confiável): CNPJ no PDF → CPF do dono no PDF → telefone/CNPJ no nome do
 * arquivo → nome no trecho "Pagador" do PDF → nome no arquivo → telefone no PDF.
 */
/**
 * Descobre a qual cliente o boleto pertence.
 *
 * Tenta os critérios do mais confiável para o menos: CNPJ, depois CPF, depois
 * telefone e por último o nome. O critério usado volta no resultado para a
 * tela poder sinalizar quando o casamento foi apenas por nome.
 */
export function identificarCliente<C extends ClienteIdentificavel>(
  filename: string,
  dados: DadosBoleto | null,
  clientes: C[]
): ResultadoMatch<C> | null {
  const baseName = filename.replace(/\.[^.]+$/, "");

  if (dados) {
    // Prioriza documentos que aparecem no bloco do pagador
    const ordenar = (lista: string[]) => {
      if (!dados.trechoPagador) return lista;
      const pag = onlyDigits(dados.trechoPagador);
      return [...lista].sort((a, b) => Number(pag.includes(b)) - Number(pag.includes(a)));
    };
    for (const cnpj of ordenar(dados.cnpjs)) {
      const c = clientes.find((x) => onlyDigits(x.cnpj) === cnpj);
      if (c) return { cliente: c, criterio: "pdf-cnpj", confianca: "alta" };
    }
    for (const cpf of ordenar(dados.cpfs)) {
      const c = clientes.find((x) => onlyDigits(x.cpf_dono) === cpf || onlyDigits(x.cnpj) === cpf);
      if (c) return { cliente: c, criterio: "pdf-cpf", confianca: "alta" };
    }
  }

  const digitRuns = baseName.match(/\d{8,}/g) || [];
  for (const run of digitRuns) {
    const c = clientes.find((x) => {
      const cnpj = onlyDigits(x.cnpj);
      return cnpj.length === 14 && run.includes(cnpj);
    });
    if (c) return { cliente: c, criterio: "arquivo-cnpj", confianca: "alta" };
  }
  for (const run of digitRuns) {
    const c = clientes.find((x) => {
      const tel = onlyDigits(x.telefone);
      return tel.length >= 8 && run.endsWith(tel.slice(-8));
    });
    if (c) return { cliente: c, criterio: "arquivo-telefone", confianca: "alta" };
  }

  if (dados) {
    if (dados.trechoPagador) {
      const c = matchPorNome(dados.trechoPagador, clientes, 5);
      if (c) return { cliente: c, criterio: "pdf-nome", confianca: "media" };
    }
    if (dados.texto) {
      const c = matchPorNome(dados.texto, clientes, 8);
      if (c) return { cliente: c, criterio: "pdf-nome", confianca: "baixa" };
    }
  }

  {
    const c = matchPorNome(baseName, clientes, 4);
    if (c) return { cliente: c, criterio: "arquivo-nome", confianca: "media" };
  }

  if (dados) {
    for (const tel of dados.telefones) {
      const c = clientes.find((x) => {
        const t = onlyDigits(x.telefone);
        return t.length >= 8 && tel.endsWith(t.slice(-8));
      });
      if (c) return { cliente: c, criterio: "pdf-telefone", confianca: "baixa" };
    }
  }

  return null;
}

/** Formata um número como moeda brasileira (R$ 1.234,56). */
export function formatarValor(v: number | null | undefined) {
  if (v === null || v === undefined) return "";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Reinsere os separadores visuais da linha digitável para exibição. */
export function formatarLinhaDigitavel(l: string | null | undefined) {
  if (!l || l.length !== 47) return l || "";
  return `${l.slice(0, 5)}.${l.slice(5, 10)} ${l.slice(10, 15)}.${l.slice(15, 21)} ${l.slice(21, 26)}.${l.slice(26, 32)} ${l.slice(32, 33)} ${l.slice(33)}`;
}

/** Substitui os placeholders do template pelos dados do boleto/cliente. */
/** Monta o texto do WhatsApp com os dados do boleto (valor, vencimento, código). */
export function montarMensagem(
  template: string,
  ctx: { nome: string; arquivo: string; dados: DadosBoleto | null }
) {
  const valor = formatarValor(ctx.dados?.valor);
  const venc = ctx.dados?.vencimento || "";
  const linha = formatarLinhaDigitavel(ctx.dados?.linhaDigitavel);
  let msg = template
    .replace(/\{nome\}/g, ctx.nome)
    .replace(/\{arquivo\}/g, ctx.arquivo)
    .replace(/\{valor\}/g, valor)
    .replace(/\{vencimento\}/g, venc)
    .replace(/\{linha_digitavel\}/g, linha);
  // Remove linhas que ficaram só com o rótulo (ex.: "Valor: " quando não há valor)
  msg = msg
    .split("\n")
    .filter((l) => !/^[^:]{1,40}:\s*$/.test(l.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return msg;
}
