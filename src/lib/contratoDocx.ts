import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

/**
 * Preenche os contratos padrão da ImperTech (Word) com os dados do contrato e
 * do cadastro do cliente.
 *
 * São dois modelos em public/modelos, cópias dos que ficam no Drive
 * (SETOR DE TI/IMPERTCH/CONTRATOS):
 * - contrato-pontotel.docx: Ponto Tell, com o quadro "PLANO CONTRATADO";
 * - contrato-sistemas.docx: demais sistemas.
 *
 * Os campos do modelo são linhas "____". O preenchimento identifica cada uma
 * pelo parágrafo onde está e troca só o texto do trecho, então a formatação,
 * o logo e o rodapé ficam exatamente como no modelo. Campo sem dado continua
 * em branco ("____") para ser completado à mão.
 */
export type ModeloContrato = 'pontotel' | 'sistemas';

export const ARQUIVO_MODELO: Record<ModeloContrato, string> = {
  pontotel: '/modelos/contrato-pontotel.docx',
  sistemas: '/modelos/contrato-sistemas.docx',
};

/** Pontotel usa o modelo próprio; o resto, o de sistemas. */
export const modeloDoSistema = (sistema: string | null | undefined): ModeloContrato =>
  /PONTO\s*TEL/i.test(sistema || '') ? 'pontotel' : 'sistemas';

export interface DadosContrato {
  numero: string | null;
  contratanteNome: string;
  contratanteDocumento: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  cep?: string | null;
  representanteNome: string | null;
  representanteCpf: string | null;
  sistema: string | null;
  /** Linha do quadro "PLANO CONTRATADO" (só no modelo Pontotel). */
  plano: string | null;
  valorImplantacao: number | null;
  valorMensalidade: number | null;
  diaVencimento: number | null;
  valorKm: number | null;
  dataInicio: string | null;
  dataFim: string | null;
  dataEmissao?: Date;
}

const escaparXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const desescapar = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

const moeda = (v: number | null | undefined) =>
  v ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : null;

const dataBr = (iso: string | null) => {
  if (!iso) return null;
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

/** CNPJ/CPF com máscara; texto livre fica como está. */
export function formatarDocumento(doc: string | null | undefined) {
  const d = (doc || '').replace(/\D/g, '');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return doc?.trim() || null;
}

/**
 * O cadastro guarda o endereço numa linha ("Rua X, 123, Sala 2, Centro", do
 * jeito que a busca de CNPJ monta). Separa logradouro, número e bairro quando
 * dá para reconhecer; senão, vai tudo como logradouro.
 */
export function separarEndereco(endereco: string | null | undefined) {
  const partes = (endereco || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (partes.length === 0) return { logradouro: null, numero: null, bairro: null };
  const ehNumero = (s: string) => /^(n[º°o.]?\s*)?(\d+[a-z]?|s\/?n)$/i.test(s);
  if (partes.length >= 2 && ehNumero(partes[1])) {
    const numero = partes[1].replace(/^n[º°o.]?\s*/i, '');
    const resto = partes.slice(2);
    const bairro = resto.length ? resto[resto.length - 1] : null;
    const complemento = resto.slice(0, -1);
    return { logradouro: [partes[0], ...complemento].join(', '), numero, bairro };
  }
  return { logradouro: partes.join(', '), numero: null, bairro: null };
}

/** Troca, num parágrafo, o texto dos trechos (`<w:t>`) pelo que `fn` devolver. */
function editarParagrafo(p: string, fn: (textos: string[]) => string[]) {
  const textos: string[] = [];
  p.replace(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g, (_m, t) => {
    textos.push(desescapar(t));
    return '';
  });
  const novos = fn(textos);
  let i = -1;
  return p.replace(/(<w:t)(?: [^>]*)?(>)([^<]*)(<\/w:t>)/g, (_m, abre, fecha1, _t, fecha2) => {
    i++;
    return `${abre} xml:space="preserve"${fecha1}${escaparXml(novos[i] ?? '')}${fecha2}`;
  });
}

/** Troca a 1ª sequência de "_" (ou "R$ ___") de um texto pelo valor, se houver valor. */
const trocarLacuna = (texto: string, valor: string | null) => (valor ? texto.replace(/_{2,}(\/_{2,})*/, valor) : texto);

export function preencherXmlContrato(xml: string, d: DadosContrato) {
  const emissao = d.dataEmissao || new Date();
  const emissaoCurta = emissao.toLocaleDateString('pt-BR');
  const [diaE, mesE, anoE] = [
    String(emissao.getDate()).padStart(2, '0'),
    emissao.toLocaleDateString('pt-BR', { month: 'long' }),
    String(emissao.getFullYear()),
  ];
  const documento = formatarDocumento(d.contratanteDocumento);
  const cpfRep = formatarDocumento(d.representanteCpf);
  const { logradouro, numero, bairro } = separarEndereco(d.endereco);
  const dia = d.diaVencimento ? String(d.diaVencimento).padStart(2, '0') : null;
  const multa = d.valorMensalidade ? moeda(d.valorMensalidade * 3) : null;
  const ou = (v: string | null | undefined, lacuna: string) => (v && v.trim() ? v.trim() : lacuna);

  let linhasSublinhado = 0; // nome e CNPJ do cabeçalho, depois nome na assinatura
  let emissaoFeita = false;

  return xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (p) => {
    const texto = desescapar((p.match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join(''));

    if (texto.startsWith('DOC: ')) return editarParagrafo(p, (t) => t.map((x) => trocarLacuna(x, d.numero)));

    // Linhas só de "_": cabeçalho (nome, CNPJ) e nome do contratante na assinatura.
    if (/^_{5,}$/.test(texto)) {
      const n = linhasSublinhado++;
      const valor = n === 0 ? d.contratanteNome : n === 1 ? documento : d.contratanteNome;
      return editarParagrafo(p, (t) => t.map((x) => trocarLacuna(x, valor)));
    }
    if (/^_{2,}\/_{2,}\/_{2,}$/.test(texto) && !emissaoFeita) {
      emissaoFeita = true;
      return editarParagrafo(p, (t) => t.map((x) => trocarLacuna(x, emissaoCurta)));
    }

    // Qualificação do contratante: um trecho só, remontado inteiro.
    if (texto.includes('e de outro lado, ____')) {
      return editarParagrafo(p, (t) =>
        t.map((x) =>
          x.includes('e de outro lado, ____')
            ? `, e de outro lado, ${ou(d.contratanteNome, '____________________________________')}, pessoa física/jurídica inscrita no CPF/CNPJ sob o nº ${ou(documento, '______________________')}, com endereço/sede na ${ou(logradouro, '____________________________________')}, nº ${ou(numero, '______')}, bairro ${ou(bairro, '________________')}, cidade de ${ou(d.cidade, '________________')}/${ou(d.estado, '____')}, CEP ${ou(d.cep, '____________')}, neste ato representada por ${ou(d.representanteNome, '______________________')}, inscrito(a) no CPF sob o nº ${ou(cpfRep, '____________________')}, doravante denominado(a) simplesmente `
            : x
        )
      );
    }

    // Quadro "PLANO CONTRATADO" (Pontotel): "<plano> — Mensalidade de R$ <valor>".
    if (/^_{5,} — Mensalidade de R\$/.test(texto)) {
      return editarParagrafo(p, (t) =>
        t.map((x) => (/^R\$ _+$/.test(x) ? ou(moeda(d.valorMensalidade), x) : trocarLacuna(x, d.plano || d.sistema)))
      );
    }

    if (texto.startsWith('1.1. ') && texto.includes('suporte técnico do Sistema _')) {
      return editarParagrafo(p, (t) => t.map((x) => (/^_+$/.test(x) ? ou(d.sistema, x) : x)));
    }

    if (texto.startsWith('2.1. ') && texto.includes('vigência')) {
      let k = 0;
      return editarParagrafo(p, (t) => t.map((x) => (/^_{2,}\/_{2,}\/_{2,}$/.test(x) ? ou(dataBr(k++ === 0 ? d.dataInicio : d.dataFim), x) : x)));
    }

    if (texto.startsWith('3.1. ') && texto.includes('por KM rodado')) {
      return editarParagrafo(p, (t) => t.map((x) => (/^R\$ _+$/.test(x) ? ou(moeda(d.valorKm), x) : x)));
    }

    if (texto.startsWith('4.1. ') && texto.includes('valor da implantação')) {
      let k = 0;
      return editarParagrafo(p, (t) =>
        t.map((x) => {
          if (/^R\$ _+$/.test(x)) return ou(moeda(k++ === 0 ? d.valorImplantacao : d.valorMensalidade), x);
          if (/^_+$/.test(x)) return ou(dia, x);
          return x;
        })
      );
    }

    if (texto.includes('renovado automaticamente a cada mês, no dia ____')) {
      return editarParagrafo(p, (t) => t.map((x) => (x.includes('no dia ____') ? x.replace(/_{2,}/, dia || '______') : x)));
    }

    if (texto.includes('multa rescisória equivalente a 3 (três) vezes')) {
      return editarParagrafo(p, (t) => t.map((x) => (/^R\$ _+$/.test(x) ? ou(multa, x) : x)));
    }

    if (texto.startsWith('Grajaú/MA, ____')) {
      return editarParagrafo(p, () => [`Grajaú/MA, ${diaE} de ${mesE} de ${anoE}.`]);
    }

    if (texto.startsWith('CPF/CNPJ: ____')) {
      return editarParagrafo(p, (t) => t.map((x) => trocarLacuna(x, documento)));
    }

    return p;
  });
}

/** Gera o .docx do contrato a partir do modelo escolhido. */
export async function gerarContratoDocx(modelo: ModeloContrato, dados: DadosContrato): Promise<Blob> {
  const resp = await fetch(ARQUIVO_MODELO[modelo]);
  if (!resp.ok) throw new Error('Modelo de contrato não encontrado');
  const arquivos = unzipSync(new Uint8Array(await resp.arrayBuffer()));
  arquivos['word/document.xml'] = strToU8(preencherXmlContrato(strFromU8(arquivos['word/document.xml']), dados));
  return new Blob([zipSync(arquivos, { level: 6 })], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
