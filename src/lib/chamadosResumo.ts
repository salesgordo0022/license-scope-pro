/**
 * Números mensais dos Chamados (lógica pura, sem Supabase — fácil de testar).
 *
 * Regras:
 *  - "Recebidos no mês" = chamados criados no mês. Cada ocorrência é um chamado
 *    (conversa resolvida que volta a falar depois do prazo de reabertura vira
 *    chamado novo), então esta é a contagem que vale para gestão/cobrança.
 *    Não diminui quando o chamado é resolvido — é a entrada do mês.
 *  - "Resolvidos no mês" = resolvido_em dentro do mês (podem ter chegado antes).
 *  - "Em aberto" = criados até o fim do mês e ainda não resolvidos naquele
 *    momento. No mês corrente é o que está em aberto agora: resolver um
 *    chamado tira ele daqui.
 *  - Tempos usam a MEDIANA (um chamado esquecido não distorce a média).
 *  - Atendente = responsável; sem responsável, o dono (Slack). WhatsApp sem
 *    responsável fica em "Sem atendente".
 */

export interface ChamadoResumo {
  id: string;
  origem: string;
  status: string;
  created_at: string;
  primeira_resposta_em: string | null;
  resolvido_em: string | null;
  dono_id: string | null;
  responsavel_id: string | null;
  cliente_id: string | null;
}

export interface LinhaContagem {
  chave: string | null;
  recebidos: number;
  resolvidos: number;
  emAberto: number;
}

export interface ResumoMes {
  mes: string;
  recebidos: number;
  resolvidos: number;
  emAberto: number;
  semResposta: number;
  medianaPrimeiraRespostaMin: number | null;
  medianaResolucaoHoras: number | null;
  porAtendente: LinhaContagem[];
  porCliente: LinhaContagem[];
  porOrigem: LinhaContagem[];
  /** recebidos por dia do mês (índice 0 = dia 1) */
  porDia: number[];
}

/** "2026-10" → [início do mês, início do mês seguinte) no fuso local. */
export function intervaloMes(mes: string): { inicio: Date; fim: Date } {
  const [ano, m] = mes.split('-').map(Number);
  return { inicio: new Date(ano, m - 1, 1), fim: new Date(ano, m, 1) };
}

export function mesDe(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

/** Mês anterior/seguinte: deslocarMes("2026-01", -1) = "2025-12". */
export function deslocarMes(mes: string, n: number): string {
  const { inicio } = intervaloMes(mes);
  return mesDe(new Date(inicio.getFullYear(), inicio.getMonth() + n, 1));
}

function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

const dentro = (iso: string | null, inicio: Date, fim: Date) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= inicio.getTime() && t < fim.getTime();
};

/** Chegou até o fim do mês e não estava resolvido naquele momento. */
const emAbertoNoFim = (c: ChamadoResumo, fim: Date) =>
  new Date(c.created_at).getTime() < fim.getTime() && (!c.resolvido_em || new Date(c.resolvido_em).getTime() >= fim.getTime());

function agrupar(chamados: ChamadoResumo[], chave: (c: ChamadoResumo) => string | null, inicio: Date, fim: Date): LinhaContagem[] {
  const mapa = new Map<string | null, LinhaContagem>();
  for (const c of chamados) {
    const chegou = dentro(c.created_at, inicio, fim);
    const resolveu = dentro(c.resolvido_em, inicio, fim);
    const aberto = emAbertoNoFim(c, fim);
    if (!chegou && !resolveu && !aberto) continue;
    const k = chave(c);
    const linha = mapa.get(k) ?? { chave: k, recebidos: 0, resolvidos: 0, emAberto: 0 };
    if (chegou) linha.recebidos++;
    if (resolveu) linha.resolvidos++;
    if (aberto) linha.emAberto++;
    mapa.set(k, linha);
  }
  return [...mapa.values()].sort((a, b) => b.emAberto - a.emAberto || b.recebidos - a.recebidos || b.resolvidos - a.resolvidos);
}

export const atendenteDe = (c: ChamadoResumo) => c.responsavel_id ?? c.dono_id ?? null;

export function resumirMes(chamados: ChamadoResumo[], mes: string): ResumoMes {
  const { inicio, fim } = intervaloMes(mes);
  const doMes = chamados.filter((c) => dentro(c.created_at, inicio, fim));
  const resolvidosNoMes = chamados.filter((c) => dentro(c.resolvido_em, inicio, fim));

  const emAberto = chamados.filter((c) => emAbertoNoFim(c, fim)).length;

  const primeiras = doMes
    .filter((c) => c.primeira_resposta_em)
    .map((c) => (new Date(c.primeira_resposta_em!).getTime() - new Date(c.created_at).getTime()) / 60000)
    .filter((v) => v >= 0);
  const resolucoes = resolvidosNoMes
    .map((c) => (new Date(c.resolvido_em!).getTime() - new Date(c.created_at).getTime()) / 3600000)
    .filter((v) => v >= 0);

  const dias = new Date(fim.getTime() - 1).getDate();
  const porDia = Array.from({ length: dias }, () => 0);
  for (const c of doMes) porDia[new Date(c.created_at).getDate() - 1]++;

  return {
    mes,
    recebidos: doMes.length,
    resolvidos: resolvidosNoMes.length,
    emAberto,
    semResposta: doMes.filter((c) => !c.primeira_resposta_em).length,
    medianaPrimeiraRespostaMin: mediana(primeiras),
    medianaResolucaoHoras: mediana(resolucoes),
    porAtendente: agrupar(chamados, atendenteDe, inicio, fim),
    porCliente: agrupar(chamados, (c) => c.cliente_id, inicio, fim),
    porOrigem: agrupar(chamados, (c) => c.origem, inicio, fim),
    porDia,
  };
}

export interface Solicitante {
  /** contato_id: usuário do Slack (U…) ou número do WhatsApp. */
  chave: string;
  nome: string;
  abertos: number;
  /** Chamados por canal (ex.: "#suporte", "Mensagem direta", "IMPERTECH"), do maior para o menor. */
  canais: { canal: string; abertos: number }[];
}

/**
 * Quem mais abriu chamado no mês, numa origem (slack ou zapcontabil).
 * Solicitante = contato que iniciou a conversa (no Slack, quem mandou a DM
 * ou começou a thread; no WhatsApp, o número do cliente).
 */
export function solicitantesDoMes(
  chamados: (ChamadoResumo & { contato_id: string | null; contato_nome: string | null; canal_nome: string | null })[],
  mes: string,
  origem: string,
): Solicitante[] {
  const { inicio, fim } = intervaloMes(mes);
  const mapa = new Map<string, { nome: string; abertos: number; canais: Map<string, number> }>();
  for (const c of chamados) {
    if (c.origem !== origem || !dentro(c.created_at, inicio, fim)) continue;
    const chave = c.contato_id || c.contato_nome || '?';
    const item = mapa.get(chave) ?? { nome: c.contato_nome || c.contato_id || 'Desconhecido', abertos: 0, canais: new Map() };
    item.abertos++;
    const canal = c.canal_nome || '—';
    item.canais.set(canal, (item.canais.get(canal) ?? 0) + 1);
    if (c.contato_nome) item.nome = c.contato_nome;
    mapa.set(chave, item);
  }
  return [...mapa.entries()]
    .map(([chave, v]) => ({
      chave,
      nome: v.nome,
      abertos: v.abertos,
      canais: [...v.canais.entries()].map(([canal, abertos]) => ({ canal, abertos })).sort((a, b) => b.abertos - a.abertos),
    }))
    .sort((a, b) => b.abertos - a.abertos || a.nome.localeCompare(b.nome));
}

/** Recebidos, resolvidos e em aberto (no fim de cada mês) dos últimos `n` meses. */
export function serieMensal(chamados: ChamadoResumo[], ultimoMes: string, n = 6) {
  return Array.from({ length: n }, (_, i) => {
    const mes = deslocarMes(ultimoMes, i - n + 1);
    const { inicio, fim } = intervaloMes(mes);
    return {
      mes,
      recebidos: chamados.filter((c) => dentro(c.created_at, inicio, fim)).length,
      resolvidos: chamados.filter((c) => dentro(c.resolvido_em, inicio, fim)).length,
      emAberto: chamados.filter((c) => emAbertoNoFim(c, fim)).length,
    };
  });
}

/** "95 min" → "1h35"; "2,5 h" → "2h30"; acima de 48h em dias. */
export function formatarDuracaoMin(min: number | null): string {
  if (min === null) return '—';
  if (min < 60) return `${Math.round(min)} min`;
  const horas = min / 60;
  if (horas >= 48) return `${(horas / 24).toFixed(1).replace('.', ',')} dias`;
  const h = Math.floor(horas);
  const m = Math.round(min - h * 60);
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/** CSV (separador ;) para abrir no Excel. */
export function paraCsv(linhas: (string | number | null)[][]): string {
  const celula = (v: string | number | null) => {
    const s = v === null ? '' : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + linhas.map((l) => l.map(celula).join(';')).join('\r\n');
}
