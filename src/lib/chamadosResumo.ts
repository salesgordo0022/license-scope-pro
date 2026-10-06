/**
 * Números mensais dos Chamados (lógica pura, sem Supabase — fácil de testar).
 *
 * Regras:
 *  - "Abertos no mês" = chamados criados no mês. Cada ocorrência é um chamado
 *    (conversa resolvida que volta a falar depois do prazo de reabertura vira
 *    chamado novo), então esta é a contagem que vale para gestão/cobrança.
 *  - "Resolvidos no mês" = resolvido_em dentro do mês (podem ter sido abertos antes).
 *  - "Pendentes no fim do mês" = criados até o fim do mês e não resolvidos até lá.
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
  abertos: number;
  resolvidos: number;
}

export interface ResumoMes {
  mes: string;
  abertos: number;
  resolvidos: number;
  pendentesFimMes: number;
  semResposta: number;
  medianaPrimeiraRespostaMin: number | null;
  medianaResolucaoHoras: number | null;
  porAtendente: LinhaContagem[];
  porCliente: LinhaContagem[];
  porOrigem: LinhaContagem[];
  /** abertos por dia do mês (índice 0 = dia 1) */
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

function agrupar(chamados: ChamadoResumo[], chave: (c: ChamadoResumo) => string | null, inicio: Date, fim: Date): LinhaContagem[] {
  const mapa = new Map<string | null, LinhaContagem>();
  for (const c of chamados) {
    const abriu = dentro(c.created_at, inicio, fim);
    const resolveu = dentro(c.resolvido_em, inicio, fim);
    if (!abriu && !resolveu) continue;
    const k = chave(c);
    const linha = mapa.get(k) ?? { chave: k, abertos: 0, resolvidos: 0 };
    if (abriu) linha.abertos++;
    if (resolveu) linha.resolvidos++;
    mapa.set(k, linha);
  }
  return [...mapa.values()].sort((a, b) => b.abertos - a.abertos || b.resolvidos - a.resolvidos);
}

export const atendenteDe = (c: ChamadoResumo) => c.responsavel_id ?? c.dono_id ?? null;

export function resumirMes(chamados: ChamadoResumo[], mes: string): ResumoMes {
  const { inicio, fim } = intervaloMes(mes);
  const doMes = chamados.filter((c) => dentro(c.created_at, inicio, fim));
  const resolvidosNoMes = chamados.filter((c) => dentro(c.resolvido_em, inicio, fim));

  const pendentesFimMes = chamados.filter((c) => {
    if (new Date(c.created_at).getTime() >= fim.getTime()) return false;
    return !c.resolvido_em || new Date(c.resolvido_em).getTime() >= fim.getTime();
  }).length;

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
    abertos: doMes.length,
    resolvidos: resolvidosNoMes.length,
    pendentesFimMes,
    semResposta: doMes.filter((c) => !c.primeira_resposta_em).length,
    medianaPrimeiraRespostaMin: mediana(primeiras),
    medianaResolucaoHoras: mediana(resolucoes),
    porAtendente: agrupar(chamados, atendenteDe, inicio, fim),
    porCliente: agrupar(chamados, (c) => c.cliente_id, inicio, fim),
    porOrigem: agrupar(chamados, (c) => c.origem, inicio, fim),
    porDia,
  };
}

/** Abertos e resolvidos dos últimos `n` meses, terminando em `ultimoMes`. */
export function serieMensal(chamados: ChamadoResumo[], ultimoMes: string, n = 6) {
  return Array.from({ length: n }, (_, i) => {
    const mes = deslocarMes(ultimoMes, i - n + 1);
    const { inicio, fim } = intervaloMes(mes);
    return {
      mes,
      abertos: chamados.filter((c) => dentro(c.created_at, inicio, fim)).length,
      resolvidos: chamados.filter((c) => dentro(c.resolvido_em, inicio, fim)).length,
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
