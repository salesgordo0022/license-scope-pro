import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

/**
 * Etapas de implantação.
 *
 * As 4 etapas padrão vêm do documento "Orçamento e Plano de Implantação
 * Impertech" (public/modelos) e ficam fixas aqui. Etapas personalizadas são
 * cadastradas na tabela `etapas_implantacao` e reaproveitadas.
 *
 * Na implantação, cada item vira uma linha de `implantacao_checklist` com a
 * descrição "<Etapa> · <item>" e ordem = posição da etapa × 100 + item. O
 * prefixo agrupa os itens por etapa sem coluna nova no banco; linhas sem
 * prefixo são passos avulsos.
 */
export interface EtapaModelo {
  /** id em `etapas_implantacao`; ausente nas padrão e nas criadas só para uma implantação. */
  id?: string;
  nome: string;
  /** Título no documento (sem o "1ª ETAPA —"); se vazio, usa o nome. */
  titulo?: string;
  itens: string[];
  resultado?: string | null;
  padrao?: boolean;
}

export const ETAPAS_PADRAO: EtapaModelo[] = [
  {
    nome: 'Ambiente',
    titulo: 'Ambiente',
    itens: [
      'Instalação dos computadores.',
      'Configuração das estações de trabalho.',
      'Configuração do servidor.',
      'Instalação e configuração do sistema.',
    ],
    resultado: 'Ambiente preparado e sistema funcionando nas estações e no servidor.',
    padrao: true,
  },
  {
    nome: 'Cadastros',
    titulo: 'Cadastros',
    itens: ['Cadastro de produtos.', 'Cadastro de clientes.', 'Cadastro de fornecedores.', 'Importação de dados (quando aplicável).'],
    resultado: 'Base de dados pronta para operação.',
    padrao: true,
  },
  {
    nome: 'Treinamento',
    titulo: 'Treinamento',
    itens: ['Vendas.', 'Compras.', 'Pedidos, orçamentos e notas fiscais.', 'Boas práticas de utilização do sistema.'],
    resultado: 'Usuários capacitados para operar o sistema.',
    padrao: true,
  },
  {
    nome: 'Acompanhamento',
    titulo: 'Acompanhamento assistido',
    itens: ['Suporte nas primeiras operações.', 'Ajustes finais.', 'Esclarecimento de dúvidas.', 'Validação do funcionamento.'],
    resultado: 'Implantação concluída com sucesso.',
    padrao: true,
  },
];

export const SEPARADOR = ' · ';

/** Linhas de `implantacao_checklist` para as etapas escolhidas, na ordem dada. */
export function checklistDeEtapas(implantacaoId: string, etapas: Pick<EtapaModelo, 'nome' | 'itens'>[], ordemInicial = 0) {
  return etapas.flatMap((etapa, e) =>
    etapa.itens.map((item, i) => ({
      implantacao_id: implantacaoId,
      descricao: `${etapa.nome.trim()}${SEPARADOR}${item.trim()}`,
      ordem: ordemInicial + e * 100 + i,
      concluido: false,
    }))
  );
}

/** Separa "Ambiente · Instalação..." em etapa + texto; avulsos ficam sem etapa. */
export function lerItem(descricao: string): { etapa: string | null; texto: string } {
  const i = descricao.indexOf(SEPARADOR);
  if (i > 0) return { etapa: descricao.slice(0, i), texto: descricao.slice(i + SEPARADOR.length) };
  return { etapa: null, texto: descricao };
}

/** Agrupa o checklist por etapa, na ordem em que as etapas aparecem. */
export function agruparPorEtapa<T extends { descricao: string; ordem?: number | null }>(itens: T[]) {
  const ordenados = [...itens].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const grupos: { etapa: string; itens: T[] }[] = [];
  const avulsos: T[] = [];
  for (const item of ordenados) {
    const { etapa } = lerItem(item.descricao);
    if (!etapa) {
      avulsos.push(item);
      continue;
    }
    let g = grupos.find((x) => x.etapa === etapa);
    if (!g) grupos.push((g = { etapa, itens: [] }));
    g.itens.push(item);
  }
  return { grupos, avulsos };
}

/** Busca a definição (padrão ou personalizada) de uma etapa pelo nome. */
export function definicaoEtapa(nome: string, personalizadas: EtapaModelo[] = []) {
  const n = nome.trim().toLowerCase();
  return [...ETAPAS_PADRAO, ...personalizadas].find((e) => e.nome.trim().toLowerCase() === n);
}

/** Texto gravado no histórico quando uma etapa fecha (ou reabre). A data do
 *  "Checklist de Conclusão" do documento sai do registro mais recente. */
export const acaoEtapaConcluida = (etapa: string) => `Etapa concluída: ${etapa}`;
export const acaoEtapaReaberta = (etapa: string) => `Etapa reaberta: ${etapa}`;

export interface EtapaDocumento {
  nome: string;
  titulo: string;
  itens: string[];
  resultado: string | null;
  concluida: boolean;
  /** AAAA-MM-DD; null quando concluída sem data registrada. */
  data: string | null;
}

export interface DadosDocumento {
  nomeCliente: string;
  cnpj: string | null;
  valorImplantacao: number | null;
  valorMensalidade: number | null;
  sistemas: string[];
  consultor: string | null;
  responsavelCliente: string | null;
  etapas: EtapaDocumento[];
  dataEmissao?: Date;
}

const escaparXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const moeda = (v: number | null) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const dataBr = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

function formatarDocumento(doc: string | null) {
  const d = (doc || '').replace(/\D/g, '');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return doc?.trim() || 'Não informado';
}

/** Troca o texto de um run (`<w:t ...>antigo</w:t>`) pelo novo, na ordem em que aparecem. */
function trocarRuns(xml: string, antigo: string, novos: string[]) {
  let i = 0;
  const alvo = `>${escaparXml(antigo)}</w:t>`;
  return xml.split(alvo).reduce((acc, parte, idx) => {
    if (idx === 0) return parte;
    const novo = novos[Math.min(i++, novos.length - 1)];
    return `${acc}>${escaparXml(novo)}</w:t>${parte}`;
  }, '');
}

/** Troca o texto do n-ésimo `<w:t>` de um bloco (parágrafo/linha) do modelo. */
function textoDoRun(bloco: string, n: number, texto: string) {
  let i = -1;
  return bloco.replace(/(<w:t(?: [^>]*)?>)([^<]*)(<\/w:t>)/g, (m, abre, _antigo, fecha) => (++i === n ? `${abre}${escaparXml(texto)}${fecha}` : m));
}

const textoDoBloco = (b: string) => (b.match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('');

/**
 * Remonta, no modelo, o trecho do plano (cronograma + etapas) e as linhas do
 * "Checklist de Conclusão" com as etapas desta implantação. Usa os próprios
 * parágrafos e linhas do modelo como molde, então a formatação é a original.
 */
function montarEtapas(xml: string, etapas: EtapaDocumento[]) {
  const blocos: string[] = xml.match(/<w:p[ >][\s\S]*?<\/w:p>|<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? [];
  const achar = (pred: (t: string) => boolean) => blocos.findIndex((b) => pred(textoDoBloco(b)));

  const iCronograma = achar((t) => t.startsWith('1. Ambiente'));
  const iTitulo = achar((t) => t.startsWith('1ª ETAPA'));
  const iItem = iTitulo + 1;
  const iResultado = achar((t) => t.startsWith('Resultado esperado:'));
  const iUltimoResultado = blocos.reduce((ult, b, i) => (textoDoBloco(b).startsWith('Resultado esperado:') ? i : ult), -1);
  const iTabela = achar((t) => t.startsWith('EtapaDataConcluído'));
  if ([iCronograma, iTitulo, iResultado, iUltimoResultado, iTabela].some((i) => i < 0)) {
    throw new Error('O modelo do documento mudou: não achei as etapas do plano.');
  }

  const moldeCronograma = blocos[iCronograma];
  const moldeTitulo = blocos[iTitulo];
  const moldeItem = blocos[iItem];
  const moldeResultado = blocos[iResultado];

  const cronograma = textoDoRun(moldeCronograma, 0, etapas.map((e, i) => `${i + 1}. ${e.nome}`).join('  →  '));
  const plano = etapas
    .map((e, i) => {
      const titulo = textoDoRun(moldeTitulo, 0, `${i + 1}ª ETAPA — ${(e.titulo || e.nome).toUpperCase()}`);
      const itens = e.itens.map((it) => textoDoRun(moldeItem, 0, it)).join('');
      const resultado = e.resultado ? textoDoRun(moldeResultado, 1, e.resultado) : '';
      return titulo + itens + resultado;
    })
    .join('');

  // Tabela: cabeçalho + uma linha por etapa (moldada na primeira linha de dados).
  const tabela = blocos[iTabela];
  const linhas = tabela.match(/<w:tr>[\s\S]*?<\/w:tr>/g) || [];
  const moldeLinha = linhas[1];
  const novasLinhas = etapas
    .map((e) => {
      let l = textoDoRun(moldeLinha, 0, e.nome);
      l = textoDoRun(l, 1, e.concluida && e.data ? dataBr(e.data) : '____/____/______');
      return textoDoRun(l, 2, e.concluida ? '☒' : '☐');
    })
    .join('');
  const inicioLinhas = tabela.indexOf(linhas[1]);
  const fimLinhas = tabela.lastIndexOf(linhas[linhas.length - 1]) + linhas[linhas.length - 1].length;
  const novaTabela = tabela.slice(0, inicioLinhas) + novasLinhas + tabela.slice(fimLinhas);

  // Substitui do fim para o começo, para os índices continuarem válidos.
  const inicioPlano = xml.indexOf(moldeCronograma);
  const fimPlano = xml.indexOf(blocos[iUltimoResultado], inicioPlano) + blocos[iUltimoResultado].length;
  let saida = xml.slice(0, inicioPlano) + cronograma + plano + xml.slice(fimPlano);
  saida = saida.replace(tabela, novaTabela);
  return saida;
}

/**
 * Gera o .docx do Orçamento + Plano de Implantação a partir do modelo
 * original, trocando os campos e montando só as etapas desta implantação.
 */
export async function gerarDocumentoImplantacao(dados: DadosDocumento): Promise<Blob> {
  const resp = await fetch('/modelos/orcamento-plano-implantacao.docx');
  if (!resp.ok) throw new Error('Modelo do documento não encontrado');
  const arquivos = unzipSync(new Uint8Array(await resp.arrayBuffer()));
  let xml = strFromU8(arquivos['word/document.xml']);

  const emissao = (dados.dataEmissao || new Date()).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const sistemas = dados.sistemas.map((s) => s.trim()).filter(Boolean);

  xml = trocarRuns(xml, '[DATA]', [emissao]);
  xml = trocarRuns(xml, '[NOME DO CLIENTE]', [dados.nomeCliente]);
  xml = trocarRuns(xml, '[CNPJ DO CLIENTE]', [formatarDocumento(dados.cnpj)]);
  xml = trocarRuns(xml, 'R$ 600,00', [moeda(dados.valorImplantacao)]);
  xml = trocarRuns(xml, 'R$ 160,00', [moeda(dados.valorMensalidade)]);
  if (sistemas.length) xml = trocarRuns(xml, 'Sistema Impertech (ERP / PDV)', [sistemas.join(', ')]);
  if (dados.etapas.length) xml = montarEtapas(xml, dados.etapas);
  if (dados.consultor) {
    xml = trocarRuns(xml, 'Consultor Impertech: ____________________________________', [`Consultor Impertech: ${dados.consultor}`]);
  }
  if (dados.responsavelCliente) {
    xml = trocarRuns(xml, 'Responsável pelo cliente: ____________________________________', [`Responsável pelo cliente: ${dados.responsavelCliente}`]);
  }
  // Tira o marca-texto amarelo que sinalizava os campos a preencher.
  xml = xml.replace(/<w:highlight w:val="yellow"\/>/g, '').replace(/<w:highlightCs w:val="yellow"\/>/g, '');

  arquivos['word/document.xml'] = strToU8(xml);
  return new Blob([zipSync(arquivos, { level: 6 })], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

/** Dispara o download do arquivo no navegador. */
export function baixarArquivo(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
